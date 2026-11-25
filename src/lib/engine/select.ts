/**
 * Search, filter and sort over receipts. Pure — every function takes the array
 * it works on; nothing here reads the archive module, a store, or the DOM.
 *
 * ── Why there is an index at all ─────────────────────────────────────────────
 * The roll re-queries on every keystroke over ~2,000 receipts. Re-lowercasing
 * and re-joining their text on each pass is tens of milliseconds of garbage per
 * character typed — which is the usual reason a search box needs a debounce.
 * So the searchable text is folded once per receipts array and cached against
 * that array's identity: the first query pays for the fold, every later one is a
 * scan over prepared strings. The archive is a static module export, so its
 * array reference is a safe cache key — nothing here mutates, and a caller who
 * mutated an array in place would be the one going stale.
 */

import { isNum, pct, plural, text } from '@/lib/format';
import { KIND_ORDER, kindDef } from '@/lib/kinds';
import type { Provenance, Receipt, ReceiptKind, SourceId } from '@/lib/types';

export type SortKey = 'newest' | 'oldest' | 'amount' | 'relevance';

export interface Query {
  q: string;
  /** Empty means all. Values inside one dimension are OR-ed, dimensions AND-ed. */
  kinds: ReceiptKind[];
  years: number[];
  tags: string[];
  sources: SourceId[];
  provenance: Provenance | 'all';
  sort: SortKey;
}

const EMPTY: Query = {
  q: '',
  kinds: [],
  years: [],
  tags: [],
  sources: [],
  provenance: 'all',
  sort: 'newest',
};

// Callers spread this as their initial state, so the arrays are frozen too: a
// stray push into one of them would silently filter every query in the session.
for (const dim of [EMPTY.kinds, EMPTY.years, EMPTY.tags, EMPTY.sources]) Object.freeze(dim);

export const EMPTY_QUERY: Query = Object.freeze(EMPTY);

/**
 * True when nothing in the query narrows the archive. `sort` is deliberately
 * ignored — it reorders the same set rather than constraining it, so a view
 * that means "exactly the default" asks `isEmptyQuery(q) && q.sort === 'newest'`.
 */
export function isEmptyQuery(q: Query): boolean {
  return (
    termsOf(q.q).length === 0 &&
    q.kinds.length === 0 &&
    q.years.length === 0 &&
    q.tags.length === 0 &&
    q.sources.length === 0 &&
    q.provenance === 'all'
  );
}

/* ── text folding ─────────────────────────────────────────────────────────── */

const MARKS = /[\u0300-\u036f]/g;
const NON_ASCII = /[^\u0000-\u007f]/;

/**
 * Lowercase and strip diacritics, so `joaquin` finds Joaquín Sabina and `nuovo
 * cinema` finds the Morricone album. The NFD pass is skipped for pure ASCII —
 * it is the expensive part and most of the archive does not need it.
 */
function fold(v: unknown): string {
  const s = text(v);
  if (!s) return '';
  const lower = s.toLowerCase();
  return NON_ASCII.test(lower) ? lower.normalize('NFD').replace(MARKS, '') : lower;
}

function foldList(list: ReadonlyArray<string | undefined> | undefined): string[] {
  if (!list) return [];
  const out: string[] = [];
  for (const v of list) {
    const s = fold(v);
    if (s) out.push(s);
  }
  return out;
}

/** Terms are whitespace-split, so no term can ever contain the `\n` used as a
 *  field separator in the index. The scoring invariant below depends on that. */
function termsOf(q: string): string[] {
  const s = fold(q);
  return s ? s.split(/\s+/).filter(Boolean) : [];
}

/* ── the index ────────────────────────────────────────────────────────────── */

type StableSort = Exclude<SortKey, 'relevance'>;

interface Entry {
  r: Receipt;
  id: string;
  at: string;
  year: number | null;
  kind: ReceiptKind;
  source: SourceId;
  provenance: Provenance;
  amount: number | null;
  tagKeys: string[];
  /** The six searchable fields joined by `\n`. A term missing from here is
   *  missing from all of them, so one `includes` rejects a non-match. */
  all: string;
  title: string;
  ents: string;
  tags: string;
  detail: string;
  where: string;
  body: string;
}

interface Index {
  entries: Entry[];
  /** Sorted lists of entry positions, built on first use. Filtering walks one of
   *  these, so an ordered result costs zero comparator calls. */
  orders: Partial<Record<StableSort, number[]>>;
  /** Every value present in the whole array — a facet list must keep showing an
   *  option the current filters exclude, otherwise it cannot be switched back. */
  domain: { kinds: ReceiptKind[]; years: number[]; tags: string[]; sources: SourceId[] };
}

/** Chronological by when each source opened: plays 2013, ledger 2015, cards 2022. */
const SOURCE_ORDER: readonly SourceId[] = ['spotify', 'household', 'cards'] as const;

const SOURCE_LABELS: Record<SourceId, string> = {
  spotify: 'Streaming history',
  household: 'Household ledger',
  cards: 'Card ledger',
};

/**
 * The year from the first four characters, never `new Date(at)`: the archive's
 * timestamps are zone-less local wall clock, and Date reads them as UTC in some
 * engines — which moves a 00:30 play on 1 January into the previous year.
 */
function yearOf(at: unknown): number | null {
  const s = text(at);
  if (!s) return null;
  const y = Number(s.slice(0, 4));
  return Number.isInteger(y) && y >= 1900 && y <= 2999 ? y : null;
}

const INDEX = new WeakMap<Receipt[], Index>();

function indexFor(receipts: Receipt[]): Index {
  const cached = INDEX.get(receipts);
  if (cached) return cached;
  const built = build(receipts);
  INDEX.set(receipts, built);
  return built;
}

function build(receipts: Receipt[]): Index {
  const entries: Entry[] = [];
  const kindSeen = new Set<ReceiptKind>();
  const yearSeen = new Set<number>();
  const tagSeen = new Set<string>();
  const sourceSeen = new Set<SourceId>();

  for (const r of receipts) {
    const title = fold(r.title);
    const detail = fold(r.detail);
    const body = fold(r.body);
    const ents = foldList(r.entities).join('\n');
    const tagKeys = foldList(r.tags);
    const tags = tagKeys.join('\n');
    const where = foldList([r.place, r.city]).join('\n');
    const year = yearOf(r.at);

    entries.push({
      r,
      id: r.id,
      at: text(r.at) ?? '',
      year,
      kind: r.kind,
      source: r.source,
      provenance: r.provenance,
      amount: isNum(r.amount) ? r.amount : null,
      tagKeys,
      all: [title, ents, tags, detail, where, body].join('\n'),
      title,
      ents,
      tags,
      detail,
      where,
      body,
    });

    kindSeen.add(r.kind);
    sourceSeen.add(r.source);
    if (year !== null) yearSeen.add(year);
    for (const t of tagKeys) tagSeen.add(t);
  }

  return {
    entries,
    orders: {},
    domain: {
      kinds: KIND_ORDER.filter(k => kindSeen.has(k)),
      years: [...yearSeen].sort((a, b) => a - b),
      tags: [...tagSeen].sort(),
      sources: SOURCE_ORDER.filter(s => sourceSeen.has(s)),
    },
  };
}

/* ── ordering ─────────────────────────────────────────────────────────────── */

/** Ids are unique and ordered, so every comparator here is a total order and a
 *  rebuild of the same archive produces the same roll. */
function byId(a: Entry, b: Entry): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// `at` is `YYYY-MM-DDTHH:mm`, which sorts lexically — no parsing, no Date.
function newestFirst(a: Entry, b: Entry): number {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  return byId(a, b);
}

function oldestFirst(a: Entry, b: Entry): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  return byId(a, b);
}

// Most of the archive has no amount at all (a play is not a spend), so those
// receipts sink below the priced ones rather than pretending to be ₹0.
function biggestFirst(a: Entry, b: Entry): number {
  if (a.amount === null) return b.amount === null ? newestFirst(a, b) : 1;
  if (b.amount === null) return -1;
  return b.amount !== a.amount ? b.amount - a.amount : newestFirst(a, b);
}

const COMPARATORS: Record<StableSort, (a: Entry, b: Entry) => number> = {
  newest: newestFirst,
  oldest: oldestFirst,
  amount: biggestFirst,
};

function orderFor(ix: Index, key: StableSort): number[] {
  const cached = ix.orders[key];
  if (cached) return cached;
  const cmp = COMPARATORS[key];
  const order = ix.entries.map((_, i) => i);
  order.sort((a, b) => cmp(ix.entries[a], ix.entries[b]));
  ix.orders[key] = order;
  return order;
}

/* ── filtering ────────────────────────────────────────────────────────────── */

interface Filters {
  terms: string[];
  /** null means "this dimension is not constrained" — one null check in the hot
   *  loop instead of a Set lookup for the common unfiltered case. */
  kinds: Set<ReceiptKind> | null;
  years: Set<number> | null;
  tags: Set<string> | null;
  sources: Set<SourceId> | null;
  provenance: Provenance | null;
}

function compile(q: Query): Filters {
  // Folded so a tag arriving from a facet value, a URL or hand-written code all
  // land on the same key; a dimension that folds away to nothing is ignored
  // rather than matching nothing.
  const tags = new Set(foldList(q.tags));
  const years = new Set(q.years.filter(isNum));
  return {
    terms: termsOf(q.q),
    kinds: q.kinds.length > 0 ? new Set(q.kinds) : null,
    years: years.size > 0 ? years : null,
    tags: tags.size > 0 ? tags : null,
    sources: q.sources.length > 0 ? new Set(q.sources) : null,
    provenance: q.provenance === 'all' ? null : q.provenance,
  };
}

function hasAnyTag(e: Entry, want: Set<string>): boolean {
  for (const t of e.tagKeys) if (want.has(t)) return true;
  return false;
}

function matchesTerms(e: Entry, terms: string[]): boolean {
  for (const t of terms) if (!e.all.includes(t)) return false;
  return true;
}

/** Cheapest tests first; the text scan is the only one that touches a string. */
function matches(e: Entry, f: Filters): boolean {
  if (f.provenance && e.provenance !== f.provenance) return false;
  if (f.kinds && !f.kinds.has(e.kind)) return false;
  if (f.years && (e.year === null || !f.years.has(e.year))) return false;
  if (f.sources && !f.sources.has(e.source)) return false;
  if (f.tags && !hasAnyTag(e, f.tags)) return false;
  return matchesTerms(e, f.terms);
}

/* ── relevance ────────────────────────────────────────────────────────────── */

// A title match is the strongest claim a receipt can make, then a join key
// (artist, merchant, category), then the free text the source happened to carry.
const W_TITLE = 12;
const W_ENTITY = 8;
const W_TAG = 7;
const W_DETAIL = 5;
const W_WHERE = 4;
const W_BODY = 3;
/** A title hit on a word boundary beats one inside a longer word, so typing
 *  `ab` ranks "ABBA" above "Kharagpur ab…" noise. */
const W_WORD_START = 4;

function wordStart(s: string, i: number): boolean {
  if (i === 0) return true;
  const c = s.charCodeAt(i - 1);
  return !((c >= 97 && c <= 122) || (c >= 48 && c <= 57));
}

/**
 * 0 means "does not match". Every term must land somewhere (AND), and each one
 * scores only its best field, so a word repeated across a receipt's fields does
 * not out-shout a word in its title.
 */
function score(e: Entry, terms: string[]): number {
  let total = 0;
  for (const t of terms) {
    // `all` is the six fields joined, so a hit here guarantees a hit below.
    if (!e.all.includes(t)) return 0;
    const i = e.title.indexOf(t);
    if (i >= 0) total += W_TITLE + (wordStart(e.title, i) ? W_WORD_START : 0);
    else if (e.ents.includes(t)) total += W_ENTITY;
    else if (e.tags.includes(t)) total += W_TAG;
    else if (e.detail.includes(t)) total += W_DETAIL;
    else if (e.where.includes(t)) total += W_WHERE;
    else total += W_BODY;
  }
  return total;
}

/* ── the public query ─────────────────────────────────────────────────────── */

export function selectReceipts(receipts: Receipt[], query: Query): Receipt[] {
  if (receipts.length === 0) return [];
  const ix = indexFor(receipts);
  const f = compile(query);

  // Relevance with nothing typed has no signal to rank by, so it reads as newest
  // rather than as an arbitrary order.
  if (query.sort === 'relevance' && f.terms.length > 0) return ranked(ix, f);

  const key: StableSort = query.sort === 'relevance' ? 'newest' : query.sort;
  const out: Receipt[] = [];
  for (const i of orderFor(ix, key)) {
    const e = ix.entries[i];
    if (matches(e, f)) out.push(e.r);
  }
  return out;
}

function ranked(ix: Index, f: Filters): Receipt[] {
  const hits: Array<{ e: Entry; s: number }> = [];
  for (const e of ix.entries) {
    if (f.provenance && e.provenance !== f.provenance) continue;
    if (f.kinds && !f.kinds.has(e.kind)) continue;
    if (f.years && (e.year === null || !f.years.has(e.year))) continue;
    if (f.sources && !f.sources.has(e.source)) continue;
    if (f.tags && !hasAnyTag(e, f.tags)) continue;
    const s = score(e, f.terms);
    if (s > 0) hits.push({ e, s });
  }
  hits.sort((a, b) => (b.s !== a.s ? b.s - a.s : newestFirst(a.e, b.e)));
  return hits.map(h => h.e.r);
}

/* ── facets ───────────────────────────────────────────────────────────────── */

export interface Facet {
  value: string;
  label: string;
  count: number;
}

export interface Facets {
  kinds: Facet[];
  years: Facet[];
  tags: Facet[];
  sources: Facet[];
}

// One bit per facet dimension. `D_TEXT` carries the query text and provenance
// together because neither has a facet list, so neither is ever the dimension
// being excluded.
const D_KIND = 1;
const D_YEAR = 2;
const D_TAG = 4;
const D_SOURCE = 8;
const D_TEXT = 16;
const D_ALL = D_KIND | D_YEAR | D_TAG | D_SOURCE | D_TEXT;

function maskOf(e: Entry, f: Filters): number {
  let m = 0;
  if (!f.kinds || f.kinds.has(e.kind)) m |= D_KIND;
  if (!f.years || (e.year !== null && f.years.has(e.year))) m |= D_YEAR;
  if (!f.tags || hasAnyTag(e, f.tags)) m |= D_TAG;
  if (!f.sources || f.sources.has(e.source)) m |= D_SOURCE;
  if ((!f.provenance || f.provenance === e.provenance) && matchesTerms(e, f.terms)) m |= D_TEXT;
  return m;
}

function bump<K>(counts: Map<K, number>, key: K): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function zeroed<K>(keys: readonly K[]): Map<K, number> {
  return new Map(keys.map(k => [k, 0] as const));
}

/**
 * Counts every option under the OTHER active filters, never under its own. So
 * selecting `music` still shows what `purchase` would yield, and a facet list
 * can never collapse to a column of zeros the user cannot escape from.
 */
export function facetsFor(receipts: Receipt[], query: Query): Facets {
  const ix = indexFor(receipts);
  const f = compile(query);
  const kinds = zeroed(ix.domain.kinds);
  const years = zeroed(ix.domain.years);
  const tags = zeroed(ix.domain.tags);
  const sources = zeroed(ix.domain.sources);

  for (const e of ix.entries) {
    const m = maskOf(e, f);
    if ((m | D_KIND) === D_ALL) bump(kinds, e.kind);
    if ((m | D_YEAR) === D_ALL && e.year !== null) bump(years, e.year);
    if ((m | D_SOURCE) === D_ALL) bump(sources, e.source);
    if ((m | D_TAG) === D_ALL) for (const t of e.tagKeys) bump(tags, t);
  }

  return {
    kinds: ix.domain.kinds.map(k => ({
      value: k,
      label: kindDef(k).plural,
      count: kinds.get(k) ?? 0,
    })),
    years: ix.domain.years.map(y => ({
      value: String(y),
      label: String(y),
      count: years.get(y) ?? 0,
    })),
    // Tags are the one open vocabulary here, so they rank by weight. The domain
    // is alphabetical and sort is stable, which keeps equal counts alphabetical.
    tags: ix.domain.tags
      .map(t => ({ value: t, label: tagLabel(t), count: tags.get(t) ?? 0 }))
      .sort((a, b) => b.count - a.count),
    sources: ix.domain.sources.map(s => ({
      value: s,
      label: SOURCE_LABELS[s],
      count: sources.get(s) ?? 0,
    })),
  };
}

/** `long-session` → `Long session`. The CSS decides where that gets shouted. */
function tagLabel(key: string): string {
  const words = key.replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* ── the results sentence ─────────────────────────────────────────────────── */

/**
 * The line above the results, e.g. `412 receipts, 2017–2019, mostly purchases —
 * 20% of the archive`. Built from clauses that are dropped when they have
 * nothing to say, so no branch of this can print a blank, an `undefined` or a
 * NaN — an empty result set gets a real sentence too.
 */
export function summarise(results: Receipt[], all: Receipt[]): string {
  const total = all.length;

  if (results.length === 0) {
    return total > 0
      ? `No receipts match — the archive holds ${plural(total, 'receipt')}`
      : 'No receipts in the archive';
  }

  const parts = [plural(results.length, 'receipt')];
  const span = yearSpan(results);
  if (span) parts.push(span);
  const mix = mixClause(results);
  if (mix) parts.push(mix);
  const sentence = parts.join(', ');

  if (total <= 0) return sentence;
  if (results.length >= total) return `${sentence} — the whole archive`;
  // pct() rounds, and both ends of the range then lie: 12 of 2,000 prints "0%",
  // which reads as none, and 1,999 of 2,000 prints "100%", which reads as all.
  const share = results.length / total;
  const label = share < 0.005 ? 'under 1%' : share > 0.995 ? 'over 99%' : pct(share);
  return `${sentence} — ${label} of the archive`;
}

function yearSpan(results: Receipt[]): string | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of results) {
    const y = yearOf(r.at);
    if (y === null) continue;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  // isNum rejects the Infinity that survives when no receipt carried a year, so
  // the clause is omitted rather than printed empty.
  if (!isNum(lo) || !isNum(hi)) return undefined;
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

function mixClause(results: Receipt[]): string | undefined {
  // "1 receipt, 2017, all notes" says one thing twice; the single receipt on
  // screen already carries its kind.
  if (results.length < 2) return undefined;
  const counts = new Map<ReceiptKind, number>();
  for (const r of results) bump(counts, r.kind);

  // Walk KIND_ORDER rather than insertion order so a tie resolves the same way
  // on every call, and reuse the kind vocabulary instead of inventing a second.
  let top: ReceiptKind | null = null;
  let best = 0;
  for (const k of KIND_ORDER) {
    const c = counts.get(k) ?? 0;
    if (c > best) {
      top = k;
      best = c;
    }
  }
  if (!top) return undefined;

  const label = kindDef(top).plural.toLowerCase();
  if (counts.size === 1) return `all ${label}`;
  if (best / results.length >= 0.4) return `mostly ${label}`;
  return `a mix of ${plural(counts.size, 'kind')}`;
}
