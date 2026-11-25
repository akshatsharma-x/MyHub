/**
 * Threads — links stitched into moments.
 *
 * A link says two receipts belong together. A thread is the next claim up: that
 * five or six receipts, of different kinds, inside a bounded stretch of time,
 * are one episode of a life — the session that ran past 02:00, the auto home,
 * the ₹240 of food, the frame reconstructed from the trip they all sat inside.
 * Nothing here is authored: the cluster is found, and the caption is written
 * from what the cluster actually contains.
 *
 * ── What is deliberately thrown away ─────────────────────────────────────────
 * Six listening sessions in a row is a connected component and it is not a
 * moment; it is the timeline the brief tells us not to build. So a single-kind
 * cluster only survives if the data says it is remarkable on its own terms — an
 * obsession loop, or a charge the source itself flagged. Everything else needs
 * at least two kinds to earn a place in the list.
 *
 * ── Why the threshold is a ladder, not a constant ────────────────────────────
 * The right strong-link cut-off depends on how dense the archive being read is,
 * and the engine cannot know that in advance. So it clusters at a strict
 * threshold first and only loosens if the archive turned out too sparse to give
 * a visitor enough to look at. Deterministic: the ladder is fixed, and the first
 * rung that clears the target wins.
 */

import type { Link, Receipt, ReceiptKind, Thread } from '@/lib/types';
import { RECEIPT_KINDS } from '@/lib/types';
import {
  clip, dateLabel, gapLabel, inr, isNum, monthLabel, num, parseAt, text,
} from '@/lib/format';
import { clamp01, kindNoun, titleCase } from '@/lib/engine/links';

/** A thread is a moment, so it has to be small enough to read at a glance. */
const MIN_SIZE = 3;
const MAX_SIZE = 9;
/** Hours. Past four days it is a phase, not a moment. */
const MAX_SPAN = 96;
/** Links this weak are coincidence, not company. Tried in order. */
const THRESHOLDS = [0.5, 0.42, 0.34];
/** Enough threads that the list rewards scrolling, few enough that every one
 *  in it is worth opening. */
const TARGET = 40;
const CAP = 120;

interface Placed {
  r: Receipt;
  t: number;
  day: string;
  hour: number;
}

interface Cluster {
  nodes: Placed[];
  links: Link[];
}

function nodesOf(receipts: Receipt[]): Map<string, Placed> {
  const m = new Map<string, Placed>();
  for (const r of receipts) {
    const p = parseAt(r.at);
    if (!p || !text(r.id) || !text(r.title)) continue;
    m.set(r.id, {
      r,
      t: Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) / 60000,
      day: `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`,
      hour: p.h,
    });
  }
  return m;
}

/**
 * Connected components over the strong links only, and only where the two ends
 * are close enough in time to be the same episode. A provenance link gets a
 * longer leash because a trip's frame legitimately sits a week from its
 * charges.
 */
function components(nodes: Map<string, Placed>, links: Link[], threshold: number): Cluster[] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    for (;;) {
      const up = parent.get(root);
      if (up === undefined || up === root) break;
      root = up;
    }
    // Path compression — without it a long recurrence chain makes this quadratic.
    let cur = id;
    for (;;) {
      const up = parent.get(cur);
      if (up === undefined || up === root) break;
      parent.set(cur, root);
      cur = up;
    }
    return root;
  };

  const strong: Link[] = [];
  for (const l of links) {
    if (!isNum(l.weight) || l.weight < threshold) continue;
    const a = nodes.get(l.a), b = nodes.get(l.b);
    if (!a || !b) continue;
    const span = Math.abs(b.t - a.t) / 60;
    if (span > (l.kind === 'derived-from' ? 10 * 24 : MAX_SPAN)) continue;
    strong.push(l);
    if (!parent.has(l.a)) parent.set(l.a, l.a);
    if (!parent.has(l.b)) parent.set(l.b, l.b);
    const ra = find(l.a), rb = find(l.b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const grouped = new Map<string, Placed[]>();
  for (const id of parent.keys()) {
    const node = nodes.get(id);
    if (!node) continue;
    const root = find(id);
    const g = grouped.get(root);
    if (g) g.push(node); else grouped.set(root, [node]);
  }

  const linksByRoot = new Map<string, Link[]>();
  for (const l of strong) {
    const root = find(l.a);
    const g = linksByRoot.get(root);
    if (g) g.push(l); else linksByRoot.set(root, [l]);
  }

  const out: Cluster[] = [];
  for (const [root, group] of grouped) {
    group.sort((x, y) => (x.t - y.t) || (x.r.id < y.r.id ? -1 : 1));
    out.push({ nodes: group, links: linksByRoot.get(root) ?? [] });
  }
  return out;
}

/** Cuts an over-long component at its widest silence — the pause in the data is
 *  itself the boundary between two moments. */
function split(nodes: Placed[]): Placed[][] {
  const span = (nodes[nodes.length - 1].t - nodes[0].t) / 60;
  if (nodes.length <= MAX_SIZE && span <= MAX_SPAN) return [nodes];
  if (nodes.length < 2) return [nodes];

  // Ties go to the most central cut. Evenly spaced receipts — a night of
  // sessions, or a batch of ledger rows all stamped T12:00 — make every gap
  // identical, and taking the first maximum would shave one receipt off the
  // front at a time and leave nothing but fragments.
  const mid = nodes.length / 2;
  let cut = 1, widest = -1, bias = Number.POSITIVE_INFINITY;
  for (let i = 1; i < nodes.length; i++) {
    const gap = nodes[i].t - nodes[i - 1].t;
    const off = Math.abs(i - mid);
    if (gap > widest || (gap === widest && off < bias)) { widest = gap; cut = i; bias = off; }
  }
  return [...split(nodes.slice(0, cut)), ...split(nodes.slice(cut))];
}

function distinctKinds(nodes: Placed[]): ReceiptKind[] {
  const present = new Set<ReceiptKind>();
  for (const n of nodes) present.add(n.r.kind);
  return RECEIPT_KINDS.filter(k => present.has(k));
}

function hasTag(nodes: Placed[], tag: string): boolean {
  return nodes.some(n => n.r.tags?.includes(tag));
}

/** Entity counts across the whole archive, so a thread can tell a distinctive
 *  shared token from a category label that happens to be everywhere. */
function globalEntities(receipts: Receipt[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const r of receipts) {
    for (const e of r.entities ?? []) {
      const v = text(e)?.toLowerCase();
      if (!v) continue;
      freq.set(v, (freq.get(v) ?? 0) + 1);
    }
  }
  return freq;
}

/**
 * The token that names the cluster. Reach is traded off against rarity on
 * purpose: "The Beatles" on three of five receipts titles a thread far better
 * than "food" on four of them, because a category everybody shares names
 * nothing.
 */
function dominantEntity(nodes: Placed[], global: Map<string, number>, total: number): string | undefined {
  const local = new Map<string, number>();
  for (const n of nodes) {
    const seen = new Set<string>();
    for (const e of n.r.entities ?? []) {
      const v = text(e)?.toLowerCase();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      local.set(v, (local.get(v) ?? 0) + 1);
    }
  }
  let best: string | undefined, bestScore = 0;
  for (const [token, count] of local) {
    if (count < 2) continue;
    const rarity = 1 - Math.min(1, Math.log((global.get(token) ?? 1) + 1) / Math.log(total + 1));
    const score = count * (1 + 0.8 * rarity);
    if (score > bestScore || (score === bestScore && best !== undefined && token < best)) {
      best = token; bestScore = score;
    }
  }
  return best;
}

function sharedPlace(nodes: Placed[]): string | undefined {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    const label = text(n.r.place) ?? text(n.r.city);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let best: string | undefined, bestCount = 1;
  for (const [label, count] of counts) {
    if (count > bestCount || (count === bestCount && best && label < best)) {
      best = label; bestCount = count;
    }
  }
  return best;
}

/** Small counts are spelled out because a caption is prose; anything bigger
 *  goes through format.ts like every other number in the product. */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
function countWord(n: number): string {
  return isNum(n) && n >= 0 && n < COUNT_WORDS.length ? COUNT_WORDS[n] : num(n);
}

function joinList(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isNight(nodes: Placed[]): boolean {
  const late = nodes.filter(n => n.hour >= 22 || n.hour < 5).length;
  return late * 2 > nodes.length;
}

function kindPhrase(nodes: Placed[]): string {
  const counts = new Map<ReceiptKind, number>();
  for (const n of nodes) counts.set(n.r.kind, (counts.get(n.r.kind) ?? 0) + 1);
  const order = RECEIPT_KINDS.filter(k => counts.has(k));
  order.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  return joinList(order.map(k => {
    const c = counts.get(k) ?? 0;
    return c === 1 ? kindNoun(k) : `${countWord(c)} ${kindNoun(k, true)}`;
  }));
}

function spanClause(nodes: Placed[]): string {
  const first = nodes[0], last = nodes[nodes.length - 1];
  const hours = (last.t - first.t) / 60;
  if (first.day === last.day) {
    // "One night" is a claim about a stretch of hours, not about a date: two
    // receipts at 00:20 and 23:50 share a calendar day and not an evening.
    return isNight(nodes) && hours <= 8
      ? `inside one night, ${dateLabel(first.r.at)}`
      : `inside a single day, ${dateLabel(first.r.at)}`;
  }
  if (hours <= 30) return `across ${dateLabel(first.r.at)} into ${dateLabel(last.r.at)}`;
  const month = monthLabel(first.r.at.slice(0, 7), '');
  return month
    ? `over ${gapLabel(hours)} of ${month}`
    : `over ${gapLabel(hours)} from ${dateLabel(first.r.at)}`;
}

/** The closing sentence states the single most honest thing about the cluster —
 *  including, where it applies, that part of it is inference. */
function tail(nodes: Placed[], place: string | undefined, night: boolean): string {
  if (hasTag(nodes, 'obsession')) return ' At the centre, one track played over and over.';
  if (hasTag(nodes, 'flagged')) return ' One of these charges is flagged in the source ledger.';

  // Where a cluster mixes record and reading, that mix IS the most honest thing
  // about it, so it gets the closing sentence — and it names which layer is
  // inferred rather than waving at "some of this".
  const guessed = nodes.filter(n => n.r.provenance === 'reconstructed');
  if (guessed.length > 0 && guessed.length < nodes.length) {
    const kinds = new Set(guessed.map(n => n.r.kind));
    if (kinds.size === 1) {
      if (kinds.has('photo')) return ' The frame is inference: the ledger recorded the charges, not the picture.';
      if (kinds.has('search')) return ' The search is inference — what the archive holds is the first play.';
      if (kinds.has('message')) return ' The message is inference: a transfer implies a conversation.';
    }
    return ` ${sentenceCase(countWord(guessed.length))} of them ${guessed.length === 1 ? 'is a reading, not a record' : 'are readings, not records'}.`;
  }
  if (place) return ` All of it around ${place}.`;
  if (hasTag(nodes, 'time-unknown')) return ' The ledger kept the day but not the hour.';
  if (night) return ' None of it happens in daylight.';
  return '';
}

function caption(nodes: Placed[], place: string | undefined): string {
  const night = isNight(nodes);
  let total = 0;
  for (const n of nodes) if (isNum(n.r.amount)) total += n.r.amount;
  const money = total > 0 ? `, ${inr(total)} on the ledger` : '';
  const lead = `${sentenceCase(countWord(nodes.length))} receipts ${spanClause(nodes)}`;
  return `${lead} — ${kindPhrase(nodes)}${money}.${tail(nodes, place, night)}`;
}

function title(nodes: Placed[], entity: string | undefined, place: string | undefined, anchor: Placed): string {
  const when = dateLabel(nodes[0].r.at, '');
  const head = entity ?? place ?? clip(anchor.r.title, 44, kindNoun(anchor.r.kind));
  return when ? `${head}, ${when}` : head;
}

/**
 * Diversity first, because a mixed cluster is the whole point; then how strong
 * its links are, then how tightly it is wired. Compactness in time multiplies
 * rather than adds — a cluster spread over four days is a weaker claim about
 * being one moment however well connected it is.
 */
function strengthOf(nodes: Placed[], links: Link[], kinds: number): number {
  const n = nodes.length;
  const diversity = clamp01((kinds - 1) / 3);
  let sum = 0;
  for (const l of links) sum += isNum(l.weight) ? l.weight : 0;
  const avg = links.length > 0 ? sum / links.length : 0;
  const density = clamp01(links.length / (2 * (n - 1)));

  const sources = new Set(nodes.map(x => x.r.source));
  const provenance = new Set(nodes.map(x => x.r.provenance));
  const hours = (nodes[n - 1].t - nodes[0].t) / 60;
  const compact = hours <= 12 ? 1 : hours <= 36 ? 0.88 : hours <= 72 ? 0.76 : 0.64;

  const base = 0.40 * diversity
    + 0.26 * avg
    + 0.18 * density
    + (sources.size > 1 ? 0.08 : 0)
    + (provenance.size > 1 ? 0.08 : 0);
  return clamp01(base * compact);
}

function assemble(
  segment: Placed[],
  links: Link[],
  global: Map<string, number>,
  total: number,
  degree: Map<string, number>,
): Thread | undefined {
  const inside = new Set(segment.map(n => n.r.id));
  const own = links
    .filter(l => inside.has(l.a) && inside.has(l.b))
    .sort((x, y) => y.weight - x.weight);

  // Cutting a component at its widest silence can leave a receipt on the wrong
  // side of every link it had. Such a receipt is dropped rather than carried: a
  // thread claims its members belong together, so a member with nothing holding
  // it there would make the caption a lie.
  const held = new Set<string>();
  for (const l of own) { held.add(l.a); held.add(l.b); }
  const nodes = segment.filter(n => held.has(n.r.id));
  if (nodes.length < MIN_SIZE || own.length < nodes.length - 1) return undefined;

  const kinds = distinctKinds(nodes);
  const remarkable = hasTag(nodes, 'obsession') || hasTag(nodes, 'flagged');
  if (kinds.length < 2 && !remarkable) return undefined;

  const entity = titleCase(dominantEntity(nodes, global, total));
  const place = sharedPlace(nodes);
  let anchor = nodes[0];
  for (const n of nodes) {
    if ((degree.get(n.r.id) ?? 0) > (degree.get(anchor.r.id) ?? 0)) anchor = n;
  }

  const strength = strengthOf(nodes, own, kinds.length) * (kinds.length < 2 ? 0.8 : 1);
  return {
    id: `thr-${nodes[0].r.id}`,
    title: title(nodes, entity, place, anchor),
    start: nodes[0].r.at,
    end: nodes[nodes.length - 1].r.at,
    receiptIds: nodes.map(n => n.r.id),
    kinds,
    links: own,
    strength: Math.round(strength * 1000) / 1000,
    caption: caption(nodes, place),
  };
}

/** Clusters linked receipts into moments, strongest first. */
export function buildThreads(receipts: Receipt[], links: Link[]): Thread[] {
  const nodes = nodesOf(receipts);
  if (nodes.size === 0 || links.length === 0) return [];

  const global = globalEntities(receipts);
  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.a, (degree.get(l.a) ?? 0) + 1);
    degree.set(l.b, (degree.get(l.b) ?? 0) + 1);
  }

  let best: Thread[] = [];
  for (const threshold of THRESHOLDS) {
    const found: Thread[] = [];
    for (const cluster of components(nodes, links, threshold)) {
      if (cluster.nodes.length < MIN_SIZE) continue;
      for (const segment of split(cluster.nodes)) {
        if (segment.length < MIN_SIZE) continue;
        const thread = assemble(segment, cluster.links, global, nodes.size, degree);
        if (thread) found.push(thread);
      }
    }
    if (found.length > best.length) best = found;
    if (best.length >= TARGET) break;
  }

  best.sort((x, y) => (y.strength - x.strength) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return best.slice(0, CAP);
}

/** Every thread a given receipt appears in, strongest first. */
export function threadsContaining(id: string, threads: Thread[]): Thread[] {
  if (!text(id)) return [];
  return threads.filter(t => t.receiptIds.includes(id));
}
