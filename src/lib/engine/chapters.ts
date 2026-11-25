import { hourLabel, isNum, parseAt, text } from '@/lib/format';
import type { Aggregates, Chapter, ChapterStats, Receipt, ReceiptKind } from '@/lib/types';

/**
 * The six eras, and the figures each one is allowed to print.
 *
 * The boundaries are a curatorial call — they are drawn where the sources
 * measurably change, not on round years. The `thesis` and `body` are written;
 * every number inside them is one the brief measured, and every number the UI
 * shows next to them comes out of `chapterStats`, computed from the receipts
 * that actually fall in the span. Nothing here is authored arithmetic.
 *
 * 2013 and 2014 (185 and 23 plays) are deliberately outside every chapter: a
 * chapter that spans two years to hold 208 plays would be a fiction. `chapterOf`
 * returns undefined for them and the UI shows them as pre-history.
 */
export const CHAPTERS: readonly Chapter[] = [
  {
    id: 'ch-first-signal',
    title: 'FIRST SIGNAL',
    fromYear: 2015,
    toYear: 2016,
    thesis: 'A year with no favourites, then one band arrives and sorts the rest.',
    body:
      '2015 has no centre. The Rolling Stones and David Bisbal tie at 51 plays, Justin Bieber '
      + 'takes 37, Frank Sinatra 31 — which is what a taste looks like before it decides anything. '
      + 'In 2016 The Beatles appear for the first time at 385 plays and hold first place every year '
      + 'until 2020. The household ledger opens in the same stretch and it is entirely small: milk, '
      + 'autos, pocket money, tea.',
  },
  {
    id: 'ch-beatles-years',
    title: 'THE BEATLES YEARS',
    fromYear: 2017,
    toYear: 2018,
    thesis: 'The only two years where both what was heard and what was paid for are on the record.',
    body:
      '26,320 plays in 2017 — more than 2013, 2014, 2015 and 2016 put together — with The Beatles '
      + 'at 1,636. The household ledger peaks in the same year at 1,035 rows, so this is the one '
      + 'stretch of the decade where the music and the money are both legible at once. 31 August '
      + '2018 is the whole chapter in a single day: "Lovely Rita" seven times over at 05:19, '
      + '₹70,255 in under Salary at 09:27 noted only "From workplace", and ₹118 back out as a '
      + 'farewell contribution that afternoon. The income is a household\'s and not the archive '
      + 'owner\'s — the anchors put this two years short of the class X boards.',
  },
  {
    id: 'ch-quiet-year',
    title: 'THE QUIET YEAR',
    fromYear: 2019,
    toYear: 2019,
    thesis: 'The year the archive can still hear and can no longer see.',
    body:
      '14,927 plays, The Beatles still first, nothing unusual in the listening at all. The '
      + 'household ledger simply stops, and nothing replaces it until April 2022. This is the '
      + 'honest chapter: it knows what was played and knows nothing whatsoever about what was '
      + 'spent, and that hole is printed rather than filled in.',
  },
  {
    id: 'ch-indoor-voices',
    title: 'INDOOR VOICES',
    fromYear: 2020,
    toYear: 2021,
    thesis: 'First place changes hands, and a film score starts running for hours at a time.',
    body:
      'The Beatles lose the top of the list for the first time since 2016 — The Killers take 2020 '
      + 'outright, with The Strokes at 559, and Howard Shore goes from 10 plays in 2019 to 298 '
      + 'in 2020, which is not a song habit but three hours of Lord of the Rings left on. Listening '
      + 'climbs to 24,280 plays, the second-densest year in the archive, in the year with nowhere '
      + 'to be. 2020 is also the first anchor — the class X boards — and this is the densest the '
      + 'archive ever gets while knowing nothing at all about what anything cost.',
  },
  {
    id: 'ch-another-language',
    title: 'ANOTHER LANGUAGE',
    fromYear: 2022,
    toYear: 2023,
    thesis: 'Nine years of English-language rock, then three Spanish names land in one year.',
    body:
      'Joaquín Sabina goes from 16 plays in 2021 to 521 in 2022; Jorge Drexler from 99 to 247; '
      + 'Juanes from 12 to 230. In April of the same year the card ledger opens and money becomes '
      + 'visible again after three blank years — now sorted into travel, entertainment, online '
      + 'shopping and medical. Plays fall to 16,202 and then 11,023: less listening, and less of it '
      + 'in the language it started in. Two anchors sit inside this span — the class XII boards in '
      + '2022, the B.Tech starting in 2023 — and the files know nothing about either. The money '
      + 'simply changes instrument in the same stretch, which is adjacency and not cause.',
  },
  {
    id: 'ch-steady-state',
    title: 'STEADY STATE',
    fromYear: 2024,
    toYear: 2024,
    thesis: 'An old favourite returns to first place, and then both ledgers run out.',
    body:
      '9,870 plays, the fewest since 2016, with John Mayer back at the top on 380 and ABBA arriving '
      + 'from nowhere at 276. The card ledger ends in April and the listening ends in December; '
      + 'there is no later row to read. What the archive holds of 2024 is a thinner version of the '
      + 'same night.',
  },
];

/** Receipts the ETL dated to the day only are stamped 12:00 and tagged, so they
 *  must never reach an hour histogram — they would invent a noon peak. */
const TIME_UNKNOWN = 'time-unknown';

const HOURS = 24;

function normKey(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function yearOf(at: string): number | null {
  const p = parseAt(at);
  return p ? p.y : null;
}

export function chapterOf(at: string): Chapter | undefined {
  const y = yearOf(at);
  if (y === null) return undefined;
  return CHAPTERS.find(c => y >= c.fromYear && y <= c.toYear);
}

/**
 * Play counts live only in the aggregates — a receipt is a whole session and
 * carries no per-artist totals — so a chapter's artists come from
 * `artistsByYear` narrowed to the chapter's own years. That keeps `plays`
 * meaning plays, rather than silently switching the unit to "sessions".
 */
function artistsInSpan(chapter: Chapter, agg: Aggregates): Array<{ name: string; plays: number }> {
  const totals = new Map<string, number>();
  for (let y = chapter.fromYear; y <= chapter.toYear; y++) {
    const rows = agg.artistsByYear[String(y)];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const name = text(row.name);
      if (!name || !isNum(row.plays)) continue;
      totals.set(name, (totals.get(name) ?? 0) + row.plays);
    }
  }
  return [...totals.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([name, plays]) => ({ name, plays }));
}

/**
 * A night archive's hours wrap around midnight, so the ordinary median is
 * meaningless here: a set of plays at 23:00, 00:00 and 01:00 has a linear median
 * of 00:00 only by luck, and one at 22:00/02:00 medians to noon — the emptiest
 * hour in the whole archive. This picks the hour with the smallest total
 * clock-distance to every logged hour instead, which is the median on a circle.
 */
function circularMedianHour(counts: number[]): number | null {
  let total = 0;
  for (const n of counts) total += n;
  if (total <= 0) return null;

  let best = 0;
  let bestCost = Infinity;
  for (let centre = 0; centre < HOURS; centre++) {
    let cost = 0;
    for (let h = 0; h < HOURS; h++) {
      const d = Math.abs(h - centre);
      cost += Math.min(d, HOURS - d) * counts[h];
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = centre;
    }
  }
  return best;
}

/**
 * Household rows emit more than one receipt each — a subscription row becomes a
 * purchase *and* a screen receipt, a gift becomes a purchase *and* a message —
 * so summing every amount in the span double-counts the same rupees. Keyed on
 * source + timestamp + amount, each underlying row lands once.
 *
 * Income is left out entirely: `event` receipts carry salaries and dividends
 * alongside festival and gift outgoings with no direction flag on them, and a
 * ₹70,255 salary added into a spend figure would misreport the chapter. Better
 * to print a spend that is only spend than a total that is neither.
 */
function spendInSpan(inChapter: Receipt[]): number {
  const counted = new Set<string>();
  let spend = 0;
  for (const r of inChapter) {
    if (r.provenance !== 'observed' || r.kind === 'event') continue;
    if (!isNum(r.amount) || r.amount <= 0) continue;
    const key = `${r.source}|${r.at}|${r.amount}`;
    if (counted.has(key)) continue;
    counted.add(key);
    spend += r.amount;
  }
  return spend;
}

export function chapterStats(chapter: Chapter, receipts: Receipt[], agg: Aggregates): ChapterStats {
  const inChapter = receipts.filter(r => {
    const y = yearOf(r.at);
    return y !== null && y >= chapter.fromYear && y <= chapter.toYear;
  });

  const byKind: Partial<Record<ReceiptKind, number>> = {};
  const hourCounts = new Array<number>(HOURS).fill(0);
  const entityCounts = new Map<string, number>();
  let timed = 0;

  for (const r of inChapter) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;

    const p = parseAt(r.at);
    if (p && !r.tags.includes(TIME_UNKNOWN)) {
      hourCounts[p.h] += 1;
      timed += 1;
    }

    for (const raw of r.entities) {
      const e = text(raw);
      if (!e) continue;
      entityCounts.set(e, (entityCounts.get(e) ?? 0) + 1);
    }
  }

  const topArtists = artistsInSpan(chapter, agg);

  // The artists are already their own list above; repeating them as entities
  // would make the two columns say the same thing twice.
  const artistKeys = new Set(topArtists.map(a => normKey(a.name)));
  const topEntities = [...entityCounts.entries()]
    .filter(([name]) => !artistKeys.has(normKey(name)))
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const medianHour = circularMedianHour(hourCounts);

  return {
    chapterId: chapter.id,
    receipts: inChapter.length,
    byKind,
    topArtists,
    topEntities,
    // Shares of the *timed* receipts, so an empty or wholly undated span is 24
    // zeros rather than 24 NaNs.
    hourProfile: timed > 0 ? hourCounts.map(n => n / timed) : hourCounts.slice(),
    spend: spendInSpan(inChapter),
    medianHourLabel: medianHour === null ? '—' : hourLabel(medianHour),
  };
}

export function allChapterStats(receipts: Receipt[], agg: Aggregates): ChapterStats[] {
  return CHAPTERS.map(c => chapterStats(c, receipts, agg));
}
