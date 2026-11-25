/**
 * The archive, as the browser sees it.
 *
 * `src/data/archive.json` is written by `node tools/etl.mjs` on a developer's
 * machine and committed. Importing it makes the whole decade a static module in
 * the bundle: there is no fetch, no API route, no database and no runtime
 * network call anywhere in this product. See docs/SOURCES.md.
 *
 * The cast is the one place in the app where a type is asserted rather than
 * checked, because JSON has no types. It is safe for exactly one reason: the ETL
 * builds its output against the same `Archive` contract and refuses to write a
 * file that fails its own sanity pass. If that stops being true, this line is
 * where the lie enters — so the ETL's checks are the thing to keep honest, not
 * this cast.
 */
import raw from '@/data/archive.json';
import type { Archive, Receipt } from '@/lib/types';

export const ARCHIVE = raw as unknown as Archive;

/** Every receipt, already sorted oldest-first by the ETL. */
export const RECEIPTS: Receipt[] = ARCHIVE.receipts;

export const AGGREGATES = ARCHIVE.aggregates;
export const SOURCES = ARCHIVE.sources;
export const META = ARCHIVE.meta;

/** The years the archive actually covers, ascending — derived, never typed out. */
export const YEARS: number[] = (() => {
  const seen = new Set<number>();
  for (const r of RECEIPTS) {
    const y = Number(r.at.slice(0, 4));
    if (Number.isFinite(y)) seen.add(y);
  }
  return [...seen].sort((a, b) => a - b);
})();
