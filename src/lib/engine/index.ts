/**
 * The engine, bound to the archive, computed exactly once.
 *
 * Every module under `src/lib/engine/` is a pure function over `Receipt[]` and
 * deliberately imports nothing from `@/lib/archive` — that is what makes them
 * testable and reusable. This file is the single seam where those functions meet
 * the real data, and it is a module, so the work happens once per page load and
 * every route shares the result.
 *
 * That matters more than it looks: `/roll` filters synchronously on every
 * keystroke against `LINK_INDEX` and `DEGREE`. If a component built these in a
 * render, the app would need a debounce and a spinner, and the design would
 * start apologising for itself.
 *
 * Nothing here is async, because there is nothing to wait for.
 */
import { AGGREGATES, RECEIPTS, SOURCES } from '@/lib/archive';
import type { Link, Pattern, Receipt, Thread } from '@/lib/types';
import { allChapterStats, CHAPTERS } from './chapters';
import { buildEntityGraph, type EntityGraph } from './entities';
import { buildLinkIndex, buildLinks, degreeOf, neighborsOf } from './links';
import { buildPatterns } from './patterns';
import { buildStoryFacts, type StoryFacts } from './story';
import { buildThreads } from './threads';

/** Row counts the story quotes, read off the source ledger rather than typed in. */
const rowsOf = (id: string): number => SOURCES.find((s) => s.id === id)?.rows ?? 0;

export const LINKS: Link[] = buildLinks(RECEIPTS);
export const LINK_INDEX: Map<string, Link[]> = buildLinkIndex(LINKS);
export const DEGREE: Map<string, number> = degreeOf(LINKS);
export const THREADS: Thread[] = buildThreads(RECEIPTS, LINKS);
export const PATTERNS: Pattern[] = buildPatterns(RECEIPTS, AGGREGATES, THREADS);
export const CHAPTER_STATS = allChapterStats(RECEIPTS, AGGREGATES);
export const ENTITY_GRAPH: EntityGraph = buildEntityGraph(RECEIPTS, 150);
export const STORY_FACTS: StoryFacts = buildStoryFacts(
  RECEIPTS,
  AGGREGATES,
  rowsOf('household') + rowsOf('cards'),
  rowsOf('household'),
);

const BY_ID = new Map<string, Receipt>(RECEIPTS.map((r) => [r.id, r]));
const THREAD_BY_ID = new Map<string, Thread>(THREADS.map((t) => [t.id, t]));

/** A Map lookup rather than a `.find` — the overlay walks the graph one click at
 *  a time and a linear scan over 2,400 receipts per hop is a real cost. */
export function receiptById(id: string | null | undefined): Receipt | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function threadById(id: string | null | undefined): Thread | undefined {
  return id ? THREAD_BY_ID.get(id) : undefined;
}

/** Receipts linked to this one, strongest first, each with the derived reason
 *  the link exists. The reason is the point: a related receipt with no stated
 *  connection is a coincidence, not a relationship. */
export function relatedTo(
  id: string,
  limit = 8,
): Array<{ receipt: Receipt; link: Link }> {
  const out: Array<{ receipt: Receipt; link: Link }> = [];
  for (const { id: otherId, link } of neighborsOf(id, LINK_INDEX)) {
    const receipt = BY_ID.get(otherId);
    // A link can only point at a receipt that shipped; if one does not, the
    // honest move is to drop it silently rather than render a dead row.
    if (!receipt) continue;
    out.push({ receipt, link });
    if (out.length >= limit) break;
  }
  return out;
}

/** Threads this receipt belongs to, strongest first. */
export function threadsFor(id: string): Thread[] {
  return THREADS.filter((t) => t.receiptIds.includes(id));
}

/** How many links a receipt holds — printed on every card, so it is worth a
 *  named accessor rather than `DEGREE.get(id) ?? 0` scattered everywhere. */
export function linkCount(id: string): number {
  return DEGREE.get(id) ?? 0;
}

/** The basis of a reconstructed receipt, resolved to receipts the reader can
 *  actually open. The ETL guarantees a non-empty basis for every reconstructed
 *  receipt, and guarantees each id shipped; this resolves it anyway. */
export function basisOf(receipt: Receipt | undefined): Receipt[] {
  if (!receipt?.basis?.length) return [];
  const out: Receipt[] = [];
  for (const id of receipt.basis) {
    const r = BY_ID.get(id);
    if (r) out.push(r);
  }
  return out;
}

export { CHAPTERS };
export { chapterOf } from './chapters';
export { coOccurrences } from './entities';
export type { EntityEdge, EntityGraph, EntityNode } from './entities';
export { kindNoun, titleCase } from './links';
export type { ArtistYear, StoryFacts } from './story';
export {
  EMPTY_QUERY,
  facetsFor,
  isEmptyQuery,
  selectReceipts,
  summarise,
} from './select';
export type { Facet, Facets, Query, SortKey } from './select';
export { threadsContaining } from './threads';
