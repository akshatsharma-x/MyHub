import type { Aggregates, Receipt, ReceiptKind } from '@/lib/types';

/**
 * Every number the story tells, computed from the archive.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────
 * The story page pairs an authored sentence with the evidence for it. The
 * sentences are presentation and live in the page; the evidence lives here, and
 * the split is deliberate. A narrative whose figures are typed into its own prose
 * is a narrative that goes quietly wrong the first time the ETL's caps change —
 * and there is no worse failure for a page whose entire argument is "you can
 * check this".
 *
 * So nothing on `/story` is a literal. Every figure is derived here, and the prose
 * is written to stay true under the derivation rather than to assert a value. Where
 * a claim could not be computed it was cut: an earlier draft of the arc had a
 * ₹70,255 salary landing "eleven days after a ₹118 farewell contribution". Both
 * rows are dated 31/08/2018 — the salary at 09:27 and the gift at 15:12 — so the
 * interval was wrong in size and backwards in direction, and the beat was rewritten
 * around what that one day actually holds, which turned out to be better.
 *
 * Worth keeping the shape of that mistake in view, because it survived two passes.
 * It was not an arithmetic slip: it was a *plausible* interval, and plausibility is
 * exactly what a reader cannot audit and what a check has to. The same sentence also
 * lived in `chapters.ts` and in three documents long after it was cut from here, so
 * cutting a false figure from one surface is not the same as removing it.
 */

export interface ArtistYear {
  name: string;
  plays: number;
}

export interface StoryFacts {
  /** ── Beat 1: the raw exhaust ── */
  totalPlays: number;
  listeningHours: number;
  /** Rows across the two money files. */
  moneyRows: number;
  receipts: number;
  skipRate: number;

  /** ── Beat 2: the shape of a day ── */
  peakHour: number;
  peakPlays: number;
  troughHour: number;
  troughPlays: number;
  /** Share of all plays in 22:00–03:59, and in 11:00–14:59. */
  nightShare: number;
  middayShare: number;
  /** How many times more the peak hour holds than the trough. */
  peakOverTrough: number;

  /** ── Beat 3: the size of the sums ── */
  everyday: Receipt[];
  medianEveryday: number;
  underHundred: number;
  ledgerRows: number;

  /** ── Beat 4: the month the sums change size ── */
  salary: Receipt | undefined;
  salaryMonthSmall: Receipt[];
  salaryMonthMedian: number;
  /** The salary as a multiple of that month's median recorded sum. */
  salaryMultiple: number;

  /** ── Beats 5–7: taste, reorganised three times ── */
  arrival: { year: number; artist: ArtistYear; priorYear: number; priorTop: ArtistYear | undefined };
  overtake: { year: number; winner: ArtistYear; displaced: ArtistYear };
  turn: { year: number; newcomers: ArtistYear[]; firstSeen: Record<string, number> };

  /** ── Beat 9: what the archive does not know ── */
  gapYears: number[];
  gapPlays: number;
  reconstructed: Array<{ kind: ReceiptKind; count: number }>;
  reconstructedTotal: number;
  observedTotal: number;

  /** ── Beat 10: what it adds up to ── */
  from: string;
  to: string;
  years: number;
}

const NIGHT = [22, 23, 0, 1, 2, 3];
const MIDDAY = [11, 12, 13, 14];
/** Spanish-language names are the marker of the 2022 turn, so they are named
 *  explicitly rather than inferred — a language detector over artist names is a
 *  thing this project has no business shipping. Each one is checked against the
 *  aggregates before it is used, and any that is absent is silently dropped. */
const TURN_ARTISTS = ['Joaquín Sabina', 'Jorge Drexler', 'Juanes', 'Fito Páez', 'Silvio Rodríguez'];
/** Below this, a year's leading artist is noise rather than a preference. */
const THIN_YEAR_PLAYS = 25;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** The first year this artist appears among a year's defining artists. The
 *  aggregate holds a top-N per year, not every artist, so this is honestly "the
 *  first year they mattered", not "the first play" — and the page says so. */
function firstYearSeen(name: string, byYear: Record<string, ArtistYear[]>): number {
  const years = Object.keys(byYear)
    .map(Number)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);
  for (const y of years) {
    if ((byYear[String(y)] ?? []).some((a) => a.name === name)) return y;
  }
  return 0;
}

export function buildStoryFacts(
  receipts: Receipt[],
  aggregates: Aggregates,
  moneyRows: number,
  ledgerRows: number,
): StoryFacts {
  const hours = aggregates.playsByHour ?? [];
  const totalHourPlays = hours.reduce((a, b) => a + b, 0) || 1;
  const maxPlays = Math.max(...hours);
  const minPlays = Math.min(...hours);

  // ── The everyday sums ──────────────────────────────────────────────────────
  // The hand-kept household ledger only. The card file's amounts are synthetic
  // and run to six figures for a bus fare, so mixing it in here would turn the
  // one beat about *scale* into a beat about a defect. See docs/SOURCES.md.
  const ledger = receipts.filter(
    (r) => r.source === 'household' && typeof r.amount === 'number' && r.amount > 0,
  );
  const ledgerAmounts = ledger.map((r) => r.amount as number);

  // The smallest sums the ledger bothered to record, one per distinct thing.
  //
  // Without the de-duplication this returns "reward Gpay, ₹5" three times, which
  // is true and says nothing; and without the kind restriction it returns
  // cashbacks and rewards, which are money arriving rather than a thing bought.
  // The beat is about what a ₹5 line in a hand-kept ledger implies about the
  // person keeping it, so it needs five different ₹5 lines.
  const seenTitle = new Set<string>();
  const everyday = ledger
    .filter((r) => (r.kind === 'purchase' || r.kind === 'note') && (r.amount as number) >= 3)
    .sort((a, b) => (a.amount as number) - (b.amount as number) || (a.at < b.at ? -1 : 1))
    .filter((r) => {
      const key = r.title.trim().toLowerCase();
      // "Other" and its siblings are the ledger's own shrug, not a purchase.
      if (!key || /^(other|others|uncategori[sz]ed|misc\.?|n\/?a)$/.test(key)) return false;
      if (seenTitle.has(key)) return false;
      seenTitle.add(key);
      return true;
    })
    .slice(0, 6)
    .sort((a, b) => (a.amount as number) - (b.amount as number));

  // ── The month the sums change size ─────────────────────────────────────────
  // The largest single salary credit in the ledger, and the month around it.
  const salary = ledger
    .filter((r) => /workplace|salary/i.test(r.title))
    .sort((a, b) => (b.amount as number) - (a.amount as number))[0];

  const salaryMonth = salary ? salary.at.slice(0, 7) : '';
  const monthRows = salary
    ? receipts.filter(
        (r) =>
          r.at.slice(0, 7) === salaryMonth &&
          typeof r.amount === 'number' &&
          r.amount > 0 &&
          r.id !== salary.id,
      )
    : [];
  const salaryMonthMedian = median(monthRows.map((r) => r.amount as number));
  const salaryMonthSmall = monthRows
    .filter((r) => (r.amount as number) < 100)
    .sort((a, b) => (a.at < b.at ? -1 : 1))
    .slice(0, 4);

  // ── The three reorganisations of taste ─────────────────────────────────────
  const byYear = aggregates.artistsByYear ?? {};
  const yearsWithArtists = Object.keys(byYear)
    .map(Number)
    .filter((y) => Number.isFinite(y) && (byYear[String(y)] ?? []).length > 0)
    .sort((a, b) => a - b);

  /** The first year a *new* name takes the top of the year and more than doubles
   *  the previous year's leader.
   *
   *  The `top.name !== priorTop.name` test is the whole point. Without it this
   *  returns 2017, where The Beatles went from 385 plays to 1,636 — the largest
   *  jump in the archive, and not an arrival at all, because they were already
   *  there. An arrival is a name that was not the answer becoming the answer. */
  let arrival = {
    year: 0,
    artist: { name: '', plays: 0 } as ArtistYear,
    priorYear: 0,
    priorTop: undefined as ArtistYear | undefined,
  };
  for (let i = 1; i < yearsWithArtists.length; i++) {
    const year = yearsWithArtists[i];
    const prior = yearsWithArtists[i - 1];
    const top = (byYear[String(year)] ?? [])[0];
    const priorTop = (byYear[String(prior)] ?? [])[0];
    if (!top || !priorTop || top.name === priorTop.name) continue;
    // A year whose leading artist has fewer plays than this had no discernible
    // taste to reorganise. Without the floor, the winner is 2015 displacing 2014,
    // whose "leader" is Blur with two plays — the streaming export's opening
    // months, before the account was really in use. Doubling a two is not an
    // arrival.
    if (priorTop.plays < THIN_YEAR_PLAYS) continue;
    if (top.plays < priorTop.plays * 2) continue;
    arrival = { year, artist: top, priorYear: prior, priorTop };
    break;
  }

  /** The year the long-run favourite was pushed off the top of its own year. */
  const decadeLeader = (aggregates.topArtists ?? [])[0]?.name ?? '';
  let overtake = {
    year: 0,
    winner: { name: '', plays: 0 } as ArtistYear,
    displaced: { name: '', plays: 0 } as ArtistYear,
  };
  for (const year of yearsWithArtists) {
    const list = byYear[String(year)] ?? [];
    const top = list[0];
    const leaderHere = list.find((a) => a.name === decadeLeader);
    if (!top || !leaderHere || top.name === decadeLeader) continue;
    // The first such year is the one that means something; later ones are the
    // consequence.
    if (overtake.year === 0) overtake = { year, winner: top, displaced: leaderHere };
  }

  /** The year the language changes — the year holding the most of the named
   *  Spanish-language artists, counted from the aggregates rather than asserted. */
  let turn = { year: 0, newcomers: [] as ArtistYear[], firstSeen: {} as Record<string, number> };
  for (const year of yearsWithArtists) {
    const list = byYear[String(year)] ?? [];
    const found = TURN_ARTISTS.map((name) => list.find((a) => a.name === name)).filter(
      (a): a is ArtistYear => Boolean(a),
    );
    if (found.length > turn.newcomers.length) {
      turn = {
        year,
        newcomers: found.sort((a, b) => b.plays - a.plays),
        firstSeen: Object.fromEntries(found.map((a) => [a.name, firstYearSeen(a.name, byYear)])),
      };
    }
  }

  // ── The years with music and no money ──────────────────────────────────────
  const spendByYear = new Map<number, number>();
  for (const [ym, value] of Object.entries(aggregates.spendByMonth ?? {})) {
    const y = Number(ym.slice(0, 4));
    spendByYear.set(y, (spendByYear.get(y) ?? 0) + value);
  }
  const playsByYear = new Map<number, number>();
  for (const [ym, value] of Object.entries(aggregates.playsByMonth ?? {})) {
    const y = Number(ym.slice(0, 4));
    playsByYear.set(y, (playsByYear.get(y) ?? 0) + value);
  }
  const gapYears = [...playsByYear.keys()]
    .filter((y) => (playsByYear.get(y) ?? 0) > 0 && (spendByYear.get(y) ?? 0) === 0)
    // Only years inside the shipped archive; the source file's thin opening years
    // are a fact about the file, not a silence in a life.
    .filter((y) => receipts.some((r) => Number(r.at.slice(0, 4)) === y))
    .sort((a, b) => a - b);
  const gapPlays = gapYears.reduce((sum, y) => sum + (playsByYear.get(y) ?? 0), 0);

  const reconstructedByKind = new Map<ReceiptKind, number>();
  let reconstructedTotal = 0;
  for (const r of receipts) {
    if (r.provenance !== 'reconstructed') continue;
    reconstructedTotal += 1;
    reconstructedByKind.set(r.kind, (reconstructedByKind.get(r.kind) ?? 0) + 1);
  }

  const dates = receipts.map((r) => r.at).sort();

  return {
    totalPlays: aggregates.totalPlays ?? 0,
    listeningHours: aggregates.totalListeningHours ?? 0,
    moneyRows,
    receipts: receipts.length,
    skipRate: aggregates.skipRate ?? 0,

    peakHour: hours.indexOf(maxPlays),
    peakPlays: maxPlays,
    troughHour: hours.indexOf(minPlays),
    troughPlays: minPlays,
    nightShare: NIGHT.reduce((sum, h) => sum + (hours[h] ?? 0), 0) / totalHourPlays,
    middayShare: MIDDAY.reduce((sum, h) => sum + (hours[h] ?? 0), 0) / totalHourPlays,
    peakOverTrough: minPlays > 0 ? maxPlays / minPlays : 0,

    everyday,
    medianEveryday: median(ledgerAmounts),
    underHundred: ledgerAmounts.filter((a) => a < 100).length,
    ledgerRows,

    salary,
    salaryMonthSmall,
    salaryMonthMedian,
    salaryMultiple:
      salary && salaryMonthMedian > 0 ? (salary.amount as number) / salaryMonthMedian : 0,

    arrival,
    overtake,
    turn,

    gapYears,
    gapPlays,
    reconstructed: [...reconstructedByKind.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count),
    reconstructedTotal,
    observedTotal: receipts.length - reconstructedTotal,

    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    years: new Set(receipts.map((r) => r.at.slice(0, 4))).size,
  };
}
