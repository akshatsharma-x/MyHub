/**
 * Link derivation — the part of MyHUB that answers "Don't Just Build a Timeline".
 *
 * A timeline can only ever say *when*. A link says *why two things belong
 * together*, which is the only way a song, a bus fare and a ₹240 dinner become
 * one evening instead of three rows. Everything here is a pure function over a
 * `Receipt[]`: no archive import, no fetch, no storage. The whole graph is
 * rebuilt in memory on load, which is also why the cost model below matters.
 *
 * ── Why this is bucketed and capped ──────────────────────────────────────────
 * ~2,000 receipts is 2M unordered pairs. Comparing them all on every page load
 * is both slow and useless: almost every pair is unrelated. So candidates are
 * only ever drawn from buckets that already share something — a calendar day, an
 * entity token, a place — and each bucket is walked with a bounded look-ahead.
 * Work is then O(receipts × look-ahead), not O(receipts²).
 *
 * ── Why cross-kind links are weighted up ─────────────────────────────────────
 * 900 listening sessions will happily link to each other forever and the result
 * is the boring timeline the brief warns against. A music→purchase edge is worth
 * more than a music→music edge *as information*, so the weight says so, and the
 * per-receipt cap keeps a quota of its slots for other kinds.
 *
 * Invariant used by every consumer: in a Link, `a` is the EARLIER receipt and
 * `b` the later one. That makes direction recoverable (a search precedes the
 * spend it caused) without a second field.
 */

import type { Link, LinkKind, Receipt, ReceiptKind } from '@/lib/types';
import { clip, dateLabel, gapLabel, parseAt, text } from '@/lib/format';

/** Hours inside which two receipts read as one sitting. */
const ADJACENT_HOURS = 6;
/** A search or a ledger note only counts as intent this long before the act. */
const INTENT_DAYS = 14;
/** Below this, a repeat is just a habit; above it, coming back is a story. */
const RECURRENCE_DAYS = 60;
/** Roughly a dozen edges per receipt keeps the constellation legible. */
const MAX_DEGREE = 12;
/** …and at most this many of them may go to the same kind, so a popular artist
 *  cannot spend a receipt's whole budget on more of itself. */
const SAME_KIND_DEGREE = 5;
/** Bounded look-ahead inside a bucket. The buckets are time-sorted, so these
 *  are the temporally nearest candidates, which are also the plausible ones. */
const LOOK_ENTITY = 8;
const LOOK_PLACE = 6;
const LOOK_DAY = 18;
const LOOK_INTENT = 24;

/** An entity this common is a category label, not a connection. The ETL already
 *  drops these, so this is only a floor under bad input. */
const HUB_SHARE = 0.3;

/** Reason and lead-clause priority when a pair has several explanations. */
const KIND_RANK: Record<LinkKind, number> = {
  'derived-from': 6,
  'intent-to-act': 5,
  recurrence: 4,
  'shared-entity': 3,
  'same-place': 2,
  adjacent: 1,
  'same-day': 0,
};

const KIND_BIT: Record<LinkKind, number> = {
  'same-day': 1,
  adjacent: 2,
  'shared-entity': 4,
  'same-place': 8,
  'intent-to-act': 16,
  recurrence: 32,
  'derived-from': 64,
};

/** Kinds that can be the *act* half of an intent→act pair. */
const ACT_KINDS: ReadonlySet<ReceiptKind> = new Set<ReceiptKind>([
  'purchase', 'place', 'event', 'movie',
]);

/** Prose nouns, deliberately not the UI labels in kinds.ts: a reason is a
 *  sentence, and "Play" or "Frame" only work as a column heading. Exported
 *  because threads.ts writes the same kind of prose. */
const KIND_NOUN: Record<ReceiptKind, { one: string; many: string }> = {
  music: { one: 'a listening session', many: 'listening sessions' },
  movie: { one: 'a screen night', many: 'screen nights' },
  place: { one: 'a journey', many: 'journeys' },
  purchase: { one: 'a purchase', many: 'purchases' },
  photo: { one: 'a frame', many: 'frames' },
  message: { one: 'a message', many: 'messages' },
  search: { one: 'a search', many: 'searches' },
  event: { one: 'a milestone', many: 'milestones' },
  note: { one: 'a ledger note', many: 'ledger notes' },
};

export function kindNoun(kind: ReceiptKind, many = false): string {
  const n = KIND_NOUN[kind] ?? KIND_NOUN.note;
  return many ? n.many : n.one;
}

const SMALL_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'de', 'del', 'el', 'for', 'in', 'la', 'las', 'los', 'of',
  'on', 'or', 'the', 'to', 'y',
]);

/**
 * Entity tokens arrive lowercased from the ETL because that is what makes them
 * joinable. They still have to appear inside an English sentence, so they get
 * cased back on the way out — never in the index, only in the prose.
 */
export function titleCase(token: unknown): string | undefined {
  const s = text(token);
  if (!s) return undefined;
  return s
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

interface Placed {
  r: Receipt;
  /** Wall-clock minutes. Derived via Date.UTC on the parsed components so the
   *  viewer's own zone can never shift a 02:00 play into the previous day. */
  t: number;
  day: string;
  hour: number;
}

interface Pair {
  a: string;
  b: string;
  ak: ReceiptKind;
  bk: ReceiptKind;
  kind: LinkKind;
  weight: number;
  reason: string;
  /** Every explanation this pair earned, as KIND_BIT flags. Corroboration from
   *  a second, independent reason is real evidence, so it pays. */
  mask: number;
  entity?: string;
  place?: string;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function decay(gapHours: number, windowHours: number): number {
  return clamp01(1 - gapHours / windowHours);
}

function popcount(mask: number): number {
  let m = mask, c = 0;
  while (m) { m &= m - 1; c++; }
  return c;
}

function dayPart(hour: number): string {
  if (hour >= 22 || hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** "minutes apart" beats "0min apart" and costs one branch. */
function gapPhrase(gapHours: number): string {
  if (gapHours < 0.5) return 'minutes apart';
  return `${gapLabel(gapHours)} apart`;
}

function place(r: Receipt): { key: string; label: string } | undefined {
  const p = text(r.place);
  if (p) return { key: `p:${p.toLowerCase()}`, label: p };
  const c = text(r.city);
  if (c) return { key: `c:${c.toLowerCase()}`, label: c };
  return undefined;
}

/**
 * A same-kind edge has to clear a higher bar than a cross-kind one to carry the
 * same weight. Music is penalised hardest because it is 45% of the archive and
 * would otherwise dominate every neighbour list in the app.
 */
function kindPairFactor(a: ReceiptKind, b: ReceiptKind): number {
  if (a !== b) return 1;
  return a === 'music' ? 0.55 : 0.75;
}

function prepare(receipts: Receipt[]): Placed[] {
  const placed: Placed[] = [];
  for (const r of receipts) {
    const p = parseAt(r.at);
    // No usable timestamp means no position in the graph. The ETL guarantees
    // `at`, so this is a floor, not an expected path.
    if (!p || !text(r.id) || !text(r.title)) continue;
    placed.push({
      r,
      t: Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) / 60000,
      day: `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`,
      hour: p.h,
    });
  }
  placed.sort((x, y) => (x.t - y.t) || (x.r.id < y.r.id ? -1 : x.r.id > y.r.id ? 1 : 0));
  return placed;
}

function bucket(items: Placed[], keysOf: (p: Placed) => string[]): Map<string, Placed[]> {
  // Insertion order follows the time-sorted input, so every bucket comes out
  // chronological and none of them needs a second sort.
  const m = new Map<string, Placed[]>();
  for (const p of items) {
    for (const k of keysOf(p)) {
      const b = m.get(k);
      if (b) b.push(p); else m.set(k, [p]);
    }
  }
  for (const [k, b] of m) if (b.length < 2) m.delete(k);
  return m;
}

function put(
  pairs: Map<string, Pair>,
  x: Placed,
  y: Placed,
  kind: LinkKind,
  weight: number,
  reason: string,
  facts?: { entity?: string; place?: string },
): void {
  const earlierFirst = x.t < y.t || (x.t === y.t && x.r.id < y.r.id);
  const e = earlierFirst ? x : y;
  const l = earlierFirst ? y : x;
  if (e.r.id === l.r.id) return;

  const key = `${e.r.id}\u0000${l.r.id}`;
  const prev = pairs.get(key);
  if (!prev) {
    pairs.set(key, {
      a: e.r.id, b: l.r.id, ak: e.r.kind, bk: l.r.kind,
      kind, weight, reason, mask: KIND_BIT[kind],
      entity: facts?.entity, place: facts?.place,
    });
    return;
  }
  prev.mask |= KIND_BIT[kind];
  if (facts?.entity && !prev.entity) prev.entity = facts.entity;
  if (facts?.place && !prev.place) prev.place = facts.place;
  if (weight > prev.weight || (weight === prev.weight && KIND_RANK[kind] > KIND_RANK[prev.kind])) {
    prev.kind = kind;
    prev.weight = weight;
    prev.reason = reason;
  }
}

/** Derives every link kind in LinkKind, deduplicated to one edge per pair. */
export function buildLinks(receipts: Receipt[]): Link[] {
  const placed = prepare(receipts);
  const n = placed.length;
  if (n < 2) return [];

  const byId = new Map<string, Placed>();
  for (const p of placed) byId.set(p.r.id, p);

  const pairs = new Map<string, Pair>();
  const hubLimit = Math.max(8, Math.floor(n * HUB_SHARE));

  // ── derived-from: structural, and the archive's honesty made navigable ─────
  // A reconstructed receipt must be one click from the observed rows it rests
  // on, or the provenance stamp is a claim the UI cannot back up.
  for (const p of placed) {
    const basis = p.r.basis;
    if (!basis || basis.length === 0) continue;
    for (const id of basis) {
      const src = byId.get(id);
      if (!src || src.r.id === p.r.id) continue;
      const reason = `${sentenceCase(kindNoun(p.r.kind))} reconstructed from “${clip(src.r.title, 40, kindNoun(src.r.kind))}”.`;
      put(pairs, p, src, 'derived-from', 0.94, reason);
    }
  }

  // ── same-day ──────────────────────────────────────────────────────────────
  const days = bucket(placed, p => [p.day]);
  for (const b of days.values()) {
    for (let i = 0; i < b.length - 1; i++) {
      const stop = Math.min(b.length, i + 1 + LOOK_DAY);
      for (let j = i + 1; j < stop; j++) {
        const cross = b[i].r.kind !== b[j].r.kind;
        // On a busy day the near neighbours are all worth a look; further out,
        // only a change of kind is worth the edge.
        if (j - i > 6 && !cross) continue;
        const gap = (b[j].t - b[i].t) / 60;
        // 00:30 and 23:30 are both "night" and are not the SAME night, so the
        // shared-slot claim only holds while the two are close together.
        const sameSlot = dayPart(b[i].hour) === dayPart(b[j].hour) && gap <= 8;
        const night = dayPart(b[i].hour) === 'night' && sameSlot;
        const reason = sameSlot
          ? `The same ${dayPart(b[i].hour)}, ${dateLabel(b[i].r.at)} — ${gapPhrase(gap)}.`
          : `The same day, ${dateLabel(b[i].r.at)} — ${gapPhrase(gap)}.`;
        put(pairs, b[i], b[j], 'same-day', 0.26 + (night ? 0.08 : 0) + 0.06 * decay(gap, 24), reason);
      }
    }
  }

  // ── adjacent: one sitting, even when it crosses midnight ──────────────────
  // This is the only pass over the whole timeline, and the 24-step ceiling is
  // what keeps it linear: in a stretch dense enough to hit it, the receipts past
  // the 24th nearest are already covered by the day and entity buckets.
  const reach = ADJACENT_HOURS * 60;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n && j <= i + 24; j++) {
      const dt = placed[j].t - placed[i].t;
      if (dt > reach) break;
      const gap = dt / 60;
      const sameSlot = dayPart(placed[i].hour) === dayPart(placed[j].hour);
      const reason = placed[i].day !== placed[j].day
        ? `Only ${gapLabel(gap)} apart, either side of midnight.`
        : sameSlot
          ? `Only ${gapPhrase(gap)}, the same ${dayPart(placed[i].hour)}.`
          : `Only ${gapPhrase(gap)}, the same day.`;
      put(pairs, placed[i], placed[j], 'adjacent', 0.32 + 0.34 * decay(gap, ADJACENT_HOURS), reason);
    }
  }

  // ── shared-entity, recurrence, intent-to-act ──────────────────────────────
  // All three read the same buckets, because all three are questions about one
  // entity's own timeline: who else was there, when did it come back, and what
  // did wanting it cost.
  const entities = bucket(placed, p => dedupe(p.r.entities));
  for (const [key, b] of entities) {
    if (b.length > hubLimit) continue;
    const label = titleCase(key.replace(/^e:/, ''));
    if (!label) continue;
    const idf = 1 - Math.min(1, Math.log(b.length + 1) / Math.log(n + 1));

    for (let i = 0; i < b.length; i++) {
      let cross = 0;
      const stop = Math.min(b.length, i + 1 + LOOK_ENTITY);
      for (let j = i + 1; j < stop; j++) {
        const isCross = b[i].r.kind !== b[j].r.kind;
        // Two neighbours in this entity's own history, plus the next two
        // changes of kind: that is what keeps an artist from only ever
        // pointing at more of itself.
        if (j - i > 2) {
          if (!isCross || cross >= 2) continue;
        }
        if (isCross) cross++;
        const gap = (b[j].t - b[i].t) / 60;
        const reason = gap < 36
          ? `Both carry ${label}, ${gapPhrase(gap)}.`
          : `${label} again, ${gapLabel(gap)} later.`;
        const w = 0.34 + 0.30 * idf + 0.24 * decay(gap, 30 * 24);
        put(pairs, b[i], b[j], 'shared-entity', w, reason, { entity: label });
      }

      // Recurrence: the gap itself is the finding. Consecutive appearances only
      // — an artist returning after a year is one story, not one per pair.
      if (i + 1 < b.length) {
        const gap = (b[i + 1].t - b[i].t) / 60;
        if (gap >= RECURRENCE_DAYS * 24) {
          const reason = `${label} returns after ${gapLabel(gap)} away.`;
          put(pairs, b[i], b[i + 1], 'recurrence', 0.52 + 0.08 * idf, reason, { entity: label });
        } else if (i > 0) {
          // A steady cadence is a different claim from a long absence, and a
          // more interesting one: it says this is a rhythm, not a return.
          const prev = (b[i].t - b[i - 1].t) / 60;
          const lo = Math.min(prev, gap), hi = Math.max(prev, gap);
          if (lo >= 10 * 24 && hi <= 120 * 24 && hi - lo <= 0.3 * hi) {
            const reason = `${label} keeps coming back, roughly every ${gapLabel((prev + gap) / 2)}.`;
            put(pairs, b[i], b[i + 1], 'recurrence', 0.52 + 0.14 + 0.08 * idf, reason, { entity: label });
          }
        }
      }

      // Intent → act: a search or a note, then a receipt for the same thing.
      const from = b[i].r.kind;
      if (from !== 'search' && from !== 'note') continue;
      let acts = 0;
      const limit = Math.min(b.length, i + 1 + LOOK_INTENT);
      for (let j = i + 1; j < limit && acts < 3; j++) {
        if (!ACT_KINDS.has(b[j].r.kind)) continue;
        const gapDays = (b[j].t - b[i].t) / 1440;
        if (gapDays > INTENT_DAYS) break;
        acts++;
        const lead = from === 'search' ? 'Looked up' : 'Wrote about';
        const reason = `${lead} ${label} — then ${kindNoun(b[j].r.kind)}, ${gapLabel(gapDays * 24)} later.`;
        put(pairs, b[i], b[j], 'intent-to-act', 0.72 + 0.16 * clamp01(1 - gapDays / INTENT_DAYS), reason, { entity: label });
      }
    }
  }

  // ── same-place ────────────────────────────────────────────────────────────
  const places = bucket(placed, p => {
    const pl = place(p.r);
    return pl ? [pl.key] : [];
  });
  for (const [, b] of places) {
    const label = place(b[0].r)?.label;
    if (!label) continue;
    const idf = 1 - Math.min(1, Math.log(b.length + 1) / Math.log(n + 1));
    for (let i = 0; i < b.length; i++) {
      let cross = 0;
      const stop = Math.min(b.length, i + 1 + LOOK_PLACE);
      for (let j = i + 1; j < stop; j++) {
        const isCross = b[i].r.kind !== b[j].r.kind;
        if (j - i > 2 && (!isCross || cross >= 2)) continue;
        if (isCross) cross++;
        const gap = (b[j].t - b[i].t) / 60;
        const reason = `Both at ${label}, ${gapPhrase(gap)}.`;
        put(pairs, b[i], b[j], 'same-place', 0.40 + 0.22 * decay(gap, 14 * 24) + 0.10 * idf, reason, { place: label });
      }
    }
  }

  return finalise(pairs, placed);
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function dedupe(tokens: string[] | undefined): string[] {
  if (!tokens || tokens.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const v = text(t)?.toLowerCase();
    if (!v || v.length < 3 || seen.has(v)) continue;
    seen.add(v);
    out.push(`e:${v}`);
  }
  return out;
}

/**
 * Scores every candidate, then spends each receipt's edge budget on its best
 * ones. Greedy over a weight-sorted list rather than per-receipt top-N, so an
 * edge survives only if BOTH of its endpoints still consider it worth a slot.
 */
function finalise(pairs: Map<string, Pair>, placed: Placed[]): Link[] {
  const scored: Array<{ link: Link; ak: ReceiptKind; bk: ReceiptKind }> = [];
  for (const p of pairs.values()) {
    const corroboration = Math.min(0.12, 0.05 * (popcount(p.mask) - 1));
    const weight = clamp01(p.weight * kindPairFactor(p.ak, p.bk) + corroboration);

    // One appended clause at most, and only when the lead sentence does not
    // already name the thing — the timing is always in the lead, so the suffix
    // exists purely to add the fact the lead could not fit.
    let reason = p.reason;
    const said = p.reason.toLowerCase();
    if (p.entity && !said.includes(p.entity.toLowerCase())) {
      reason = `${reason} Both carry ${p.entity}.`;
    } else if (p.place && !said.includes(p.place.toLowerCase())) {
      reason = `${reason} Same place: ${p.place}.`;
    }

    scored.push({
      ak: p.ak,
      bk: p.bk,
      link: {
        a: p.a,
        b: p.b,
        kind: p.kind,
        weight: Math.round(weight * 1000) / 1000,
        reason,
      },
    });
  }

  scored.sort((x, y) =>
    (y.link.weight - x.link.weight)
    || (KIND_RANK[y.link.kind] - KIND_RANK[x.link.kind])
    || (x.link.a < y.link.a ? -1 : x.link.a > y.link.a ? 1 : 0)
    || (x.link.b < y.link.b ? -1 : x.link.b > y.link.b ? 1 : 0));

  const deg = new Map<string, number>();
  const sameKindDeg = new Map<string, number>();
  const bump = (m: Map<string, number>, id: string) => m.set(id, (m.get(id) ?? 0) + 1);
  const at = (m: Map<string, number>, id: string) => m.get(id) ?? 0;

  const kept: Link[] = [];
  const rejected: typeof scored = [];
  for (const s of scored) {
    const { a, b } = s.link;
    const structural = s.link.kind === 'derived-from';
    const full = at(deg, a) >= MAX_DEGREE || at(deg, b) >= MAX_DEGREE;
    const sameKind = s.ak === s.bk;
    const quota = sameKind
      && (at(sameKindDeg, a) >= SAME_KIND_DEGREE || at(sameKindDeg, b) >= SAME_KIND_DEGREE);
    // A provenance edge is not optional — dropping it would leave a
    // reconstructed receipt unable to show its own evidence.
    if (!structural && (full || quota)) {
      rejected.push(s);
      continue;
    }
    kept.push(s.link);
    bump(deg, a); bump(deg, b);
    if (sameKind) { bump(sameKindDeg, a); bump(sameKindDeg, b); }
  }

  // An isolated receipt is a dead end in the constellation and a page with
  // nothing to explore from, so each one buys back its single best rejected
  // edge even if that pushes the other endpoint one over budget.
  const orphans = new Set<string>();
  for (const p of placed) if (at(deg, p.r.id) === 0) orphans.add(p.r.id);
  if (orphans.size > 0) {
    for (const s of rejected) {
      const { a, b } = s.link;
      if (!orphans.has(a) && !orphans.has(b)) continue;
      kept.push(s.link);
      bump(deg, a); bump(deg, b);
      orphans.delete(a); orphans.delete(b);
      if (orphans.size === 0) break;
    }
  }

  kept.sort((x, y) =>
    (y.weight - x.weight)
    || (KIND_RANK[y.kind] - KIND_RANK[x.kind])
    || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0)
    || (x.b < y.b ? -1 : x.b > y.b ? 1 : 0));
  return kept;
}

/** id → its links, strongest first. Both endpoints are indexed. */
export function buildLinkIndex(links: Link[]): Map<string, Link[]> {
  const index = new Map<string, Link[]>();
  const push = (id: string, link: Link) => {
    const list = index.get(id);
    if (list) list.push(link); else index.set(id, [link]);
  };
  for (const l of links) {
    if (!text(l.a) || !text(l.b)) continue;
    push(l.a, l);
    push(l.b, l);
  }
  for (const list of index.values()) list.sort((x, y) => y.weight - x.weight);
  return index;
}

/** The other end of each of a receipt's links, strongest first. */
export function neighborsOf(
  id: string,
  index: Map<string, Link[]>,
): Array<{ id: string; link: Link }> {
  const links = index.get(id);
  if (!links) return [];
  const out: Array<{ id: string; link: Link }> = [];
  const seen = new Set<string>();
  for (const link of links) {
    const other = link.a === id ? link.b : link.a;
    if (other === id || seen.has(other)) continue;
    seen.add(other);
    out.push({ id: other, link });
  }
  return out;
}

/** How many links each receipt holds — drives node size in the constellation. */
export function degreeOf(links: Link[]): Map<string, number> {
  const deg = new Map<string, number>();
  for (const l of links) {
    deg.set(l.a, (deg.get(l.a) ?? 0) + 1);
    deg.set(l.b, (deg.get(l.b) ?? 0) + 1);
  }
  return deg;
}

/** Exported for threads.ts, which scores on the same 0–1 scale. */
export { clamp01 };
