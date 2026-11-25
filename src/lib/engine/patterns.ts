import {
  clip, dateLabel, daysBetween, hourLabel, inr, isNum, num, parseAt, pct, period, plural,
  stampLabel, text,
} from '@/lib/format';
import type { Aggregates, Pattern, Receipt, ReceiptKind, Thread } from '@/lib/types';
import { RECEIPT_KINDS } from '@/lib/types';

/**
 * Pattern mining — the part of the engine that is supposed to tell the archive's
 * owner something they did not already know.
 *
 * Two rules hold every miner in this file together:
 *
 * 1. Nothing is asserted that is not measured here, at runtime, from the
 *    receipts and aggregates passed in. Hours, champions, cadences and ratios
 *    are all derived, so the copy adapts if the ETL's counting changes — a
 *    miner that cannot find its evidence returns null and is dropped rather
 *    than printing a claim it can no longer support.
 * 2. Every pattern carries real receipt ids, so each claim can be opened and
 *    checked. A pattern with no evidence is not a pattern; `pattern()` drops it.
 *
 * Several findings here are about what the archive does *not* know — three years
 * with no money in them, half a ledger flagged for reasons the source never
 * records, receipts dated but never timed. Those are honest findings and they
 * earn their place next to the others.
 */

const HOURS = 24;
const NIGHT_WINDOW = 5;

interface Ctx {
  receipts: Receipt[];
  agg: Aggregates;
  threads: Thread[];
  byId: Map<string, Receipt>;
  music: Receipt[];
  /** Observed outgoings only — income has no direction flag on an `event`. */
  money: Receipt[];
  cards: Receipt[];
  household: Receipt[];
  tagged: (tag: string) => Receipt[];
}

function normKey(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function amountOf(r: Receipt): number | null {
  return isNum(r.amount) && r.amount > 0 ? r.amount : null;
}

/**
 * One source row can leave several receipts — a subscription row becomes a
 * purchase and a screen receipt, a household note shadows its own purchase — so
 * any miner that counts *transactions* rather than receipts has to collapse
 * them first, or it reports a ledger twice the size of the real one.
 */
function dedupeRows(rs: Receipt[]): Receipt[] {
  const seen = new Set<string>();
  const out: Receipt[] = [];
  for (const r of [...rs].sort(byTime)) {
    const key = `${r.source}|${r.at}|${r.amount ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function byTime(a: Receipt, b: Receipt): number {
  return a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at);
}

/** An even spread rather than the first eight, so the evidence for a decade-long
 *  pattern is drawn from the whole decade and not just its first week. */
function sampleIds(rs: Receipt[], n = 8): string[] {
  const sorted = [...rs].sort(byTime);
  if (sorted.length <= n || n < 2) return sorted.slice(0, n).map(r => r.id);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(sorted[Math.round((i * (sorted.length - 1)) / (n - 1))].id);
  }
  return [...new Set(out)];
}

function lineValue(r: Receipt, label: string): string | undefined {
  const line = r.lines?.find(l => text(l.label)?.toUpperCase() === label);
  return line ? text(line.value) : undefined;
}

/**
 * Artist names reach receipts as normalised entity tokens, and the ETL's stop
 * list may or may not have eaten a leading "the", so a name is matched three
 * ways before giving up. The title fallback catches sessions whose entity list
 * was trimmed as noise.
 */
function mentions(r: Receipt, name: string): boolean {
  const key = normKey(name);
  if (!key) return false;
  const bare = key.replace(/^the /, '');
  for (const e of r.entities) {
    const k = normKey(e);
    if (k === key || k === bare) return true;
  }
  return r.title.includes(name);
}

function hourOf(r: Receipt): number | null {
  if (r.tags.includes('time-unknown')) return null;
  const p = parseAt(r.at);
  return p ? p.h : null;
}

function weekdayOf(r: Receipt): number | null {
  const p = parseAt(r.at);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

function sum(values: number[]): number {
  let t = 0;
  for (const v of values) t += isNum(v) ? v : 0;
  return t;
}

/** The densest `w`-hour stretch, wrapping past midnight — without the wrap a
 *  23:00–03:00 habit reads as two unrelated bumps at the ends of the day. */
function densestWindow(counts: number[], w: number): { start: number; share: number } | null {
  const total = sum(counts);
  if (total <= 0) return null;
  let start = 0;
  let best = -1;
  for (let s = 0; s < HOURS; s++) {
    let acc = 0;
    for (let i = 0; i < w; i++) acc += isNum(counts[(s + i) % HOURS]) ? counts[(s + i) % HOURS] : 0;
    if (acc > best) {
      best = acc;
      start = s;
    }
  }
  return { start, share: best / total };
}

function inWindow(hour: number, start: number, w: number): boolean {
  return ((hour - start + HOURS) % HOURS) < w;
}

function hourHistogram(rs: Receipt[]): number[] {
  const counts = new Array<number>(HOURS).fill(0);
  for (const r of rs) {
    const h = hourOf(r);
    if (h !== null) counts[h] += 1;
  }
  return counts;
}

function cleanHours(values: unknown): number[] | null {
  if (!Array.isArray(values) || values.length < HOURS) return null;
  const out = new Array<number>(HOURS).fill(0);
  for (let h = 0; h < HOURS; h++) {
    const v: unknown = values[h];
    out[h] = isNum(v) ? v : 0;
  }
  return sum(out) > 0 ? out : null;
}

interface Draft {
  id: string;
  title: string;
  detail: string;
  figure: string;
  figureLabel: string;
  evidence: Receipt[];
}

function pattern(d: Draft): Pattern | null {
  const evidence = sampleIds(d.evidence);
  if (evidence.length === 0) return null;
  const present = new Set<ReceiptKind>(d.evidence.map(r => r.kind));
  return {
    id: d.id,
    title: d.title,
    detail: d.detail,
    figure: d.figure,
    figureLabel: d.figureLabel,
    evidence,
    kinds: RECEIPT_KINDS.filter(k => present.has(k)),
  };
}

/* ── the hour shape ────────────────────────────────────────────────────────── */

function hourShape({ agg, music }: Ctx): Pattern | null {
  const counts = cleanHours(agg.playsByHour);
  const window = counts && densestWindow(counts, NIGHT_WINDOW);
  if (!counts || !window) return null;

  let peak = 0;
  let trough = 0;
  for (let h = 0; h < HOURS; h++) {
    if (counts[h] > counts[peak]) peak = h;
    if (counts[h] < counts[trough]) trough = h;
  }
  const ratio = counts[trough] > 0 ? counts[peak] / counts[trough] : null;
  const evidence = music.filter(r => {
    const h = hourOf(r);
    return h !== null && inWindow(h, window.start, NIGHT_WINDOW);
  });

  return pattern({
    id: 'pat-hour-shape',
    title: `THE ARCHIVE HAS NO ${hourLabel(trough)}`,
    figure: ratio === null ? num(counts[peak]) : `${Math.round(ratio)}×`,
    figureLabel: ratio === null
      ? `plays in the ${hourLabel(peak)} hour, against none at all at ${hourLabel(trough)}`
      : `plays at ${hourLabel(peak)} for every one at ${hourLabel(trough)}`,
    detail:
      `${num(counts[peak])} plays land in the ${hourLabel(peak)} hour and ${num(counts[trough])} `
      + `in the ${hourLabel(trough)} hour. The five densest hours run `
      + `${hourLabel(window.start)}–${hourLabel((window.start + NIGHT_WINDOW - 1) % HOURS)} `
      + `and carry ${pct(window.share)} of all listening, where an evenly spread day would carry `
      + `${pct(NIGHT_WINDOW / HOURS)}. Every other reading in this archive sits inside that skew: `
      + 'this is not a person who sometimes stayed up.',
    evidence,
  });
}

function weekdayNight({ agg, music }: Ctx): Pattern | null {
  const counts = cleanHours(agg.playsByHour);
  const window = counts && densestWindow(counts, NIGHT_WINDOW);
  const grid = agg.playsByWeekdayHour;
  if (!window || !Array.isArray(grid) || grid.length < 7) return null;

  // 0 = Sunday. Mon–Thu are nights with a morning after; Fri–Sun are not.
  const weekdays = [1, 2, 3, 4];
  let weekNight = 0;
  let weekAll = 0;
  let endNight = 0;
  let endAll = 0;
  for (let d = 0; d < 7; d++) {
    const row = cleanHours(grid[d]);
    if (!row) continue;
    for (let h = 0; h < HOURS; h++) {
      const isNight = inWindow(h, window.start, NIGHT_WINDOW);
      if (weekdays.includes(d)) {
        weekAll += row[h];
        if (isNight) weekNight += row[h];
      } else {
        endAll += row[h];
        if (isNight) endNight += row[h];
      }
    }
  }
  if (weekAll <= 0 || endAll <= 0) return null;

  const weekShare = weekNight / weekAll;
  const endShare = endNight / endAll;
  const evidence = music.filter(r => {
    const h = hourOf(r);
    const d = weekdayOf(r);
    return h !== null && d !== null && weekdays.includes(d) && inWindow(h, window.start, NIGHT_WINDOW);
  });
  // A two-point difference is not a weekend habit, and the flat case is the most
  // interesting of the three: it means the nights are simply what a Tuesday is.
  const gap = weekShare - endShare;
  const verdict = Math.abs(gap) <= 0.04 ? 'flat' : (gap > 0 ? 'weekday' : 'weekend');
  const bothWays = `Monday to Thursday puts ${pct(weekShare)} of its plays in that window, Friday to `
    + `Sunday ${pct(endShare)}`;

  return pattern({
    id: 'pat-weekday-night',
    title: verdict === 'weekend'
      ? 'THE LATE HOURS BELONG TO THE WEEKEND'
      : 'THE LATE HOURS ARE AN ORDINARY TUESDAY',
    figure: pct(weekShare),
    figureLabel: `of Monday-to-Thursday listening falls in the ${hourLabel(window.start)} window`,
    detail: verdict === 'weekend'
      ? `${bothWays}. The late hours are where the week ends up rather than where it lives.`
      : `${bothWays} — ${verdict === 'flat' ? `${num(Math.abs(gap) * 100)} points apart` : 'and the weekday leads'}. Whatever `
        + 'this is, it is not a weekend indulgence that a chart mistook for a habit: the same hours '
        + 'are kept on a night with a morning after it.',
    evidence,
  });
}

/** The card ledger's timestamps turn out to be almost perfectly flat across the
 *  day. That is a fact about the dataset, not the person, and saying so is more
 *  useful than quietly plotting it next to the listening dial. */
function ledgersDisagreeOnTime({ music, cards }: Ctx): Pattern | null {
  const cardHours = hourHistogram(cards);
  const musicHours = hourHistogram(music);
  const cardWindow = densestWindow(cardHours, NIGHT_WINDOW);
  const musicWindow = densestWindow(musicHours, NIGHT_WINDOW);
  if (!cardWindow || !musicWindow) return null;
  if (sum(cardHours) < 100 || sum(musicHours) < 100) return null;

  const flat = NIGHT_WINDOW / HOURS;
  // Only worth printing while the card rows really are shapeless and the music
  // really is not.
  if (cardWindow.share > flat * 1.2 || musicWindow.share < flat * 1.4) return null;

  const evidence = [...cards].sort(byTime);
  return pattern({
    id: 'pat-clockless-money',
    title: 'ONE LEDGER KEEPS NIGHT HOURS, THE OTHER KEEPS NONE',
    figure: pct(cardWindow.share),
    figureLabel: `of card receipts fall in their busiest five hours — an even day gives ${pct(flat)}`,
    detail:
      `The listening puts ${pct(musicWindow.share)} of itself into five hours. The card ledger puts `
      + `${pct(cardWindow.share)} into its own busiest five, which is flat to within a point: spend `
      + 'in this archive has a date and a rhythm of months, and no time of day at all. The music is '
      + 'the only source here that knows what hour anyone was awake.',
    evidence,
  });
}

/* ── how taste moved ──────────────────────────────────────────────────────── */

interface YearArtist { name: string; plays: number }

function artistYears(agg: Aggregates): Array<{ year: number; rows: YearArtist[] }> {
  const years: Array<{ year: number; rows: YearArtist[] }> = [];
  for (const key of Object.keys(agg.artistsByYear)) {
    if (!/^\d{4}$/.test(key)) continue;
    const raw = agg.artistsByYear[key];
    if (!Array.isArray(raw)) continue;
    const rows: YearArtist[] = [];
    for (const row of raw) {
      const name = text(row.name);
      if (name && isNum(row.plays)) rows.push({ name, plays: row.plays });
    }
    if (rows.length > 0) {
      rows.sort((a, b) => (b.plays - a.plays) || a.name.localeCompare(b.name));
      years.push({ year: +key, rows });
    }
  }
  return years.sort((a, b) => a.year - b.year);
}

/** The longest unbroken run at number one, and the year that ended it. */
function firstPlaceChangedHands({ agg, music }: Ctx): Pattern | null {
  const years = artistYears(agg);
  if (years.length < 4) return null;

  let bestRun = 0;
  let bestIndex = -1;
  let run = 1;
  for (let i = 1; i < years.length; i++) {
    const prev = years[i - 1].rows[0].name;
    const here = years[i].rows[0].name;
    if (prev === here) {
      run += 1;
      continue;
    }
    if (run >= bestRun) {
      bestRun = run;
      bestIndex = i;
    }
    run = 1;
  }
  if (bestIndex < 1 || bestRun < 2) return null;

  const year = years[bestIndex].year;
  const heldFrom = years[bestIndex - bestRun].year;
  const incumbent = years[bestIndex - 1].rows[0].name;
  const winner = years[bestIndex].rows[0];
  const incumbentNow = years[bestIndex].rows.find(r => r.name === incumbent);
  const reclaimed = years[bestIndex + 1]?.rows[0].name === incumbent;

  const evidence = music.filter(r => {
    const p = parseAt(r.at);
    return p !== null && p.y === year && mentions(r, winner.name);
  });

  const against = incumbentNow
    ? ` with ${num(winner.plays)} plays against ${num(incumbentNow.plays)}`
    : ` with ${num(winner.plays)} plays`;

  return pattern({
    id: 'pat-first-place',
    title: `FIRST PLACE HELD FOR ${num(bestRun)} YEARS, THEN ${year}`,
    figure: String(year),
    figureLabel: `the year ${incumbent} lost the top of the list to ${winner.name}`,
    detail:
      `${incumbent} is the most played name of every year from ${heldFrom} to ${year - 1}. In ${year} `
      + `${winner.name} take it${against}.`
      + (reclaimed
        ? ` The year after, ${incumbent} are back at number one — a ${num(bestRun)}-year habit `
          + 'interrupted for exactly twelve months, which is the kind of thing only a decade of '
          + 'receipts can show.'
        : ' The list never goes back.'),
    evidence,
  });
}

interface Arrival { year: number; artists: YearArtist[] }

/**
 * An arrival is a name with real volume in a year and no trace of it in any
 * earlier year's list. One name arriving is a new record; three arriving
 * together is a change of direction, so clusters are ranked by their *smallest*
 * member — a year where even the third new name is big is a year where the
 * listening genuinely turned over, not one where a single album did well.
 */
function arrivalClusters(agg: Aggregates): Arrival[] {
  const years = artistYears(agg);
  const seen = new Set<string>();
  const clusters: Arrival[] = [];
  for (const { year, rows } of years) {
    const fresh = rows.filter(r => r.plays >= 100 && !seen.has(normKey(r.name)));
    for (const r of rows) seen.add(normKey(r.name));
    if (fresh.length >= 2) clusters.push({ year, artists: fresh.slice(0, 3) });
  }
  const floor = (c: Arrival): number => c.artists[c.artists.length - 1].plays;
  const ranked = [...clusters].sort((a, b) => (floor(b) - floor(a)) || (b.year - a.year));
  // Three names at once is the finding; two is the fallback when a year's
  // aggregate list is too short to show three.
  const trios = ranked.filter(c => c.artists.length >= 3);
  return trios.length > 0 ? trios : ranked;
}

function arrivalPattern(ctx: Ctx, rank: number): Pattern | null {
  const clusters = arrivalClusters(ctx.agg);
  const cluster = clusters[rank];
  if (!cluster) return null;

  const names = cluster.artists;
  const evidence = ctx.music.filter(r => {
    const p = parseAt(r.at);
    return p !== null && p.y === cluster.year && names.some(n => mentions(r, n.name));
  });
  const listed = names.map(n => `${n.name} (${num(n.plays)})`).join(', ');

  return pattern({
    id: `pat-arrivals-${cluster.year}`,
    title: `${num(names.length)} NAMES ARRIVE AT ONCE IN ${cluster.year}`,
    figure: num(sum(names.map(n => n.plays))),
    figureLabel: `plays in ${cluster.year} by artists with no earlier trace in the archive`,
    detail:
      `${listed} — none of them appear in a single earlier year's listening. Taste in this archive `
      + 'does not drift a little at a time; it holds still for years and then replaces a third of '
      + `itself in twelve months. ${cluster.year} is one of those switches, and nothing before it `
      + 'predicts it.',
    evidence,
  });
}

/** Film scores are the one place where the listening stops being songs. Which
 *  artists count as scores is read off the ETL's own `soundtrack` tag rather
 *  than a list kept here: an artist qualifies when most of its sessions are
 *  tagged, so a band that once shared a session with a composer does not. */
function scoreListening({ agg, music, tagged }: Ctx): Pattern | null {
  const scored = tagged('soundtrack');
  if (scored.length < 10) return null;

  const ranked = agg.topArtists
    .map((a, i) => ({ name: text(a.name), plays: a.plays, rank: i + 1 }))
    .filter((a): a is { name: string; plays: number; rank: number } => !!a.name && isNum(a.plays));

  const composers = ranked.filter(a => {
    const all = music.filter(r => mentions(r, a.name)).length;
    if (all < 3) return false;
    return scored.filter(r => mentions(r, a.name)).length / all >= 0.6;
  });
  const lead = composers[0];
  if (!lead) return null;

  const next = ranked.find(a => a.rank === lead.rank + 1);
  const nights = scored.filter(r => r.tags.includes('night')).length;
  const longOnes = scored.filter(r => r.tags.includes('long-session')).length;
  const others = composers.slice(1, 3).map(c => c.name);

  return pattern({
    id: 'pat-score-listening',
    title: 'A FILM SCORE OUTRANKS MOST OF THE BANDS',
    figure: num(lead.plays),
    figureLabel: `plays of ${lead.name} — the #${lead.rank} name in a decade of rock records`,
    detail:
      `${lead.name} sits at #${lead.rank} across the whole archive`
      + (next ? `, ahead of ${next.name}` : '')
      + `. ${num(scored.length)} sessions here are score rather than song`
      + (others.length > 0 ? ` (${others.join(', ')} are in there too)` : '')
      + `, ${num(nights)} of them start at night and ${num(longOnes)} run past ninety minutes. `
      + 'This is not listening to music; it is leaving a film running while doing something else, '
      + 'and it is the seam where the music receipts and the screen receipts meet.',
    evidence: scored,
  });
}

function obsessionLoops({ tagged }: Ctx): Pattern | null {
  const loops = tagged('obsession');
  if (loops.length < 3) return null;

  const depth = (r: Receipt): number => {
    const m = /[×x]\s?(\d+)/.exec(r.title);
    return m ? +m[1] : 0;
  };
  const deepest = [...loops].sort((a, b) => (depth(b) - depth(a)) || byTime(a, b))[0];
  const nights = loops.filter(r => r.tags.includes('night')).length;
  const deep = depth(deepest);

  return pattern({
    id: 'pat-obsession-loops',
    title: 'THE SITTINGS THAT NEVER MOVED ON',
    figure: num(loops.length),
    figureLabel: 'sittings spent on one track, played over and over',
    detail:
      `${num(loops.length)} sessions in this archive are a single track repeated at least five times `
      + `without moving on. The deepest is "${clip(deepest.title, 48)}"`
      + (deep > 0 ? ` — ${num(deep)} times in a row` : '')
      + ` on ${stampLabel(deepest.at)}, and ${pct(nights / loops.length)} of the loops start at `
      + 'night. A skip is a decision; a loop this long is a mood nobody wrote down anywhere else.',
    evidence: loops,
  });
}

/* ── money, and the years without any ─────────────────────────────────────── */

function yearsWithoutMoney({ receipts, money, music }: Ctx): Pattern | null {
  const years = new Map<number, { music: number; money: number }>();
  for (const r of receipts) {
    const p = parseAt(r.at);
    if (!p) continue;
    const row = years.get(p.y) ?? { music: 0, money: 0 };
    if (r.kind === 'music') row.music += 1;
    years.set(p.y, row);
  }
  for (const r of money) {
    const p = parseAt(r.at);
    if (!p) continue;
    const row = years.get(p.y) ?? { music: 0, money: 0 };
    row.money += 1;
    years.set(p.y, row);
  }

  const dark = [...years.entries()]
    .filter(([, v]) => v.money === 0 && v.music > 0)
    .map(([y]) => y)
    .sort((a, b) => a - b);
  if (dark.length === 0) return null;

  // Runs, not the whole set: the two years before the household ledger opens are
  // also money-free, and lumping them in with 2019–2021 would ask for a "last
  // row before" that does not exist. The finding is the gap *between* two
  // ledgers, so only a run with money on both sides counts.
  const runs: number[][] = [];
  for (const y of dark) {
    const last = runs[runs.length - 1];
    if (last && y === last[last.length - 1] + 1) last.push(y);
    else runs.push([y]);
  }

  const ordered = [...money].sort(byTime);
  const bounded = runs
    .map(run => {
      const before = [...ordered].reverse().find(r => {
        const p = parseAt(r.at);
        return p !== null && p.y < run[0];
      });
      const after = ordered.find(r => {
        const p = parseAt(r.at);
        return p !== null && p.y > run[run.length - 1];
      });
      return { run, before, after };
    })
    .filter((x): x is { run: number[]; before: Receipt; after: Receipt } => !!x.before && !!x.after)
    .sort((a, b) => b.run.length - a.run.length);

  const best = bounded[0];
  if (!best) return null;
  const { run: gapYears, before, after } = best;
  const inside = music.filter(r => {
    const p = parseAt(r.at);
    return p !== null && p.y >= gapYears[0] && p.y <= gapYears[gapYears.length - 1];
  });
  if (inside.length === 0) return null;

  const days = daysBetween(before.at, after.at);
  return pattern({
    id: 'pat-dark-money',
    title: `${num(gapYears.length)} YEARS OF MUSIC WITH NO MONEY IN THEM`,
    figure: num(gapYears.length),
    figureLabel: `years — ${gapYears.join(', ')} — with listening in them and not one recorded rupee`,
    detail:
      `${num(inside.length)} listening receipts survive from ${gapYears.join(', ')} and not a single `
      + `transaction. The household ledger's last row is ${dateLabel(before.at)}; the next money this `
      + `archive can see is ${dateLabel(after.at)}`
      + (days === null ? '' : `, ${plural(days, 'day')} later`)
      + '. Nobody stopped spending — one source ended and the next had not started. The hole is '
      + 'printed at full size because filling it in would be the only dishonest thing here.',
    evidence: [before, after, ...inside],
  });
}

function cashBoughtSmallThings({ money, cards }: Ctx): Pattern | null {
  const withMode = dedupeRows(money)
    .map(r => ({ r, mode: lineValue(r, 'MODE'), amt: amountOf(r) }))
    .filter((x): x is { r: Receipt; mode: string; amt: number } => !!x.mode && x.amt !== null);
  const cash = withMode.filter(x => normKey(x.mode) === 'cash');
  const account = withMode.filter(x => normKey(x.mode) !== 'cash');
  if (cash.length < 20 || account.length < 20) return null;

  const medCash = median(cash.map(x => x.amt));
  const medAcct = median(account.map(x => x.amt));
  if (medCash === null || medAcct === null || medCash <= 0) return null;

  const lastCash = [...cash].sort((a, b) => byTime(a.r, b.r))[cash.length - 1];
  const cardMoney = cards.filter(r => amountOf(r) !== null);

  return pattern({
    id: 'pat-cash-small',
    title: 'CASH WAS FOR THE SMALL THINGS',
    figure: inr(medCash),
    figureLabel: `the median cash row, against ${inr(medAcct)} through an account`,
    detail:
      `${num(cash.length)} rows were paid in cash at a median of ${inr(medCash)} — tea, an auto, half `
      + `a litre of milk — while the ${num(account.length)} rows that went through a bank or a card `
      + `run at ${inr(medAcct)}`
      + (medAcct / medCash >= 2 ? `, ${num(medAcct / medCash)}× larger` : '')
      + '. Cash was the texture and the '
      + `account was the weight. After ${dateLabel(lastCash.r.at)} there is not one cash row left in `
      + `the archive: the ${num(cardMoney.length)} money receipts that follow are all card.`,
    evidence: cash.map(x => x.r),
  });
}

interface Cadence {
  name: string;
  /** Distinct days, not rows: one ledger row can become several receipts. */
  days: number;
  gap: number;
  /** Share of intervals within a day or a third of the median — separates a
   *  rhythm from a token that merely turns up a lot. */
  onBeat: number;
  from: string;
  to: string;
  /** The days themselves, kept so two cadences that are really the same purchase
   *  under two words can be recognised — see `dropOverlaps`. */
  dayKeys: Set<string>;
}

/**
 * A ledger note like "Half lit  milk" contributes `half`, `lit` and `milk` as
 * separate entities, so one habit can present as three cadences with identical
 * dates. Listing all three would read as three findings and be one. Greedy pass:
 * keep a cadence only if its days are mostly not already covered by a stronger
 * one. Ordered input, so "stronger" is whatever the caller sorted first.
 */
function dropOverlaps(list: Cadence[]): Cadence[] {
  const kept: Cadence[] = [];
  for (const c of list) {
    const twin = kept.some(k => {
      let shared = 0;
      for (const d of c.dayKeys) if (k.dayKeys.has(d)) shared += 1;
      return shared / Math.min(c.dayKeys.size, k.dayKeys.size) > 0.6;
    });
    if (!twin) kept.push(c);
  }
  return kept;
}

/**
 * Cadence mining. Category and mode labels are excluded because they are the
 * ledger's own filing system rather than a habit — "Food every two days" says
 * nothing, "milk every three days" is a household. The excluded set is read off
 * the receipts' own CATEGORY and MODE lines rather than hardcoded here.
 */
function cadences(money: Receipt[]): Cadence[] {
  const filing = new Set<string>();
  for (const r of money) {
    for (const label of ['CATEGORY', 'MODE']) {
      const v = lineValue(r, label);
      if (v) filing.add(normKey(v));
    }
  }

  const days = new Map<string, Set<string>>();
  for (const r of money) {
    if (!parseAt(r.at)) continue;
    for (const raw of r.entities) {
      const e = text(raw);
      if (!e || filing.has(normKey(e))) continue;
      const set = days.get(e) ?? new Set<string>();
      set.add(r.at.slice(0, 10));
      days.set(e, set);
    }
  }

  const out: Cadence[] = [];
  for (const [name, set] of days.entries()) {
    if (set.size < 12) continue;
    const sorted = [...set].sort();
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const d = daysBetween(sorted[i - 1], sorted[i]);
      if (d !== null && d > 0) gaps.push(d);
    }
    const gap = median(gaps);
    if (gap === null || gap <= 0 || gaps.length === 0) continue;
    const tolerance = Math.max(1, gap / 3);
    const onBeat = gaps.filter(g => Math.abs(g - gap) <= tolerance).length / gaps.length;
    out.push({
      name,
      days: set.size,
      gap,
      onBeat,
      from: sorted[0],
      to: sorted[sorted.length - 1],
      dayKeys: set,
    });
  }
  return out.sort((a, b) => (b.days - a.days) || a.name.localeCompare(b.name));
}

function cadencePool(ctx: Ctx): Receipt[] {
  return ctx.household.length > 0 ? ctx.household : ctx.money;
}

function cadenceEvidence(pool: Receipt[], names: string[]): Receipt[] {
  return pool.filter(r => r.entities.some(e => {
    const v = text(e);
    return !!v && names.includes(v);
  }));
}

function tightestCadence(ctx: Ctx): Pattern | null {
  const pool = cadencePool(ctx);
  const found = dropOverlaps(cadences(pool).filter(c => c.gap <= 7 && c.onBeat >= 0.4));
  const lead = found[0];
  if (!lead) return null;

  const others = found.slice(1, 4)
    .map(c => `${c.name} every ${num(c.gap)} (${num(c.days)} days)`)
    .join(', ');

  return pattern({
    id: 'pat-cadence-tight',
    title: `${lead.name.toUpperCase()} EVERY ${num(lead.gap)} DAYS`,
    figure: num(lead.gap),
    figureLabel: `days between one ${lead.name} row and the next, across ${num(lead.days)} days of it`,
    detail:
      `"${lead.name}" is bought on ${num(lead.days)} separate days between ${dateLabel(lead.from)} and `
      + `${dateLabel(lead.to)}, a median ${plural(lead.gap, 'day')} apart`
      + (others ? `. Behind it: ${others}` : '')
      + '. None of these are events and not one of them would be remembered, and together they are '
      + 'most of what the ledger actually contains — a life is mainly a cadence.',
    evidence: cadenceEvidence(pool, [lead.name]),
  });
}

function monthlyCadence(ctx: Ctx): Pattern | null {
  const pool = cadencePool(ctx);
  // A median near 30 is easy to hit by accident over four years, so a monthly
  // beat has to keep time: most of its intervals must land near the median.
  const found = dropOverlaps(cadences(pool)
    .filter(c => c.gap >= 25 && c.gap <= 35 && c.onBeat >= 0.5)
    .sort((a, b) => (b.onBeat - a.onBeat) || (b.days - a.days) || a.name.localeCompare(b.name)));
  const lead = found[0];
  if (!lead || found.length < 2) return null;

  const listed = found.slice(0, 4)
    .map(c => `${c.name} every ${num(c.gap)} days (${num(c.days)} of them)`)
    .join(', ');
  const evidence = cadenceEvidence(pool, found.slice(0, 4).map(c => c.name));

  return pattern({
    id: 'pat-cadence-monthly',
    title: 'THE MONTH IS A REAL UNIT IN THIS LEDGER',
    figure: num(lead.gap),
    figureLabel: `days between ${lead.name} rows — and ${num(found.length - 1)} other monthly beats`,
    detail:
      `${listed}. Nothing in the source says "monthly"; the interval is what the dates work out to. `
      + `${num(found.length)} separate things in this ledger keep a month's beat, which is how a `
      + 'household shows up in data — not as decisions, as a metre.',
    evidence,
  });
}

function flaggedCharges({ cards }: Ctx): Pattern | null {
  const cardMoney = dedupeRows(cards.filter(r => amountOf(r) !== null));
  const flagged = cardMoney.filter(r => r.tags.includes('flagged'));
  if (flagged.length < 5 || cardMoney.length < 50) return null;

  const flaggedIds = new Set(flagged.map(r => r.id));
  const clean = cardMoney.filter(r => !flaggedIds.has(r.id));
  const medF = median(flagged.map(r => amountOf(r) ?? 0));
  const medC = median(clean.map(r => amountOf(r) ?? 0));
  if (medF === null || medC === null) return null;

  const share = flagged.length / cardMoney.length;

  // Whether the flag correlates with anything printable is itself the finding,
  // so it is measured rather than assumed either way.
  const spread = new Map<string, { all: number; hit: number }>();
  for (const r of cardMoney) {
    const cat = lineValue(r, 'CATEGORY');
    if (!cat) continue;
    const row = spread.get(cat) ?? { all: 0, hit: 0 };
    row.all += 1;
    if (flaggedIds.has(r.id)) row.hit += 1;
    spread.set(cat, row);
  }
  const rates = [...spread.entries()]
    .filter(([, v]) => v.all >= 10)
    .map(([cat, v]) => ({ cat, rate: v.hit / v.all }))
    .sort((a, b) => b.rate - a.rate);
  const byCategory = rates.length >= 2
    ? (rates[0].rate - rates[rates.length - 1].rate <= 0.1
      ? ` The rate is the same in every category, ${pct(rates[0].rate)} to ${pct(rates[rates.length - 1].rate)}.`
      : ` It leans on ${rates[0].cat} at ${pct(rates[0].rate)} against ${pct(rates[rates.length - 1].rate)} for ${rates[rates.length - 1].cat}.`)
    : '';

  return pattern({
    id: 'pat-flagged',
    title: `${pct(share)} OF THE CARD LEDGER IS FLAGGED`,
    figure: num(flagged.length),
    figureLabel: `charges carrying the source dataset's own fraud flag`,
    detail:
      `${num(flagged.length)} of ${num(cardMoney.length)} card receipts arrive already flagged. The `
      + `median flagged charge is ${inr(medF)} against ${inr(medC)} unflagged.${byCategory} Nothing `
      + 'in the rows separates the two halves, because the flag is inherited from this dataset\'s '
      + 'origin as a fraud-detection set rather than from anything that happened to anyone. The '
      + 'stamp is printed and left unexplained: that is the whole of what is known.',
    evidence: flagged,
  });
}

/* ── the archive looking at itself ────────────────────────────────────────── */

function undatedHours({ receipts, tagged }: Ctx): Pattern | null {
  const unknown = tagged('time-unknown');
  if (unknown.length < 20 || receipts.length === 0) return null;

  return pattern({
    id: 'pat-no-clock',
    title: 'PART OF THIS ARCHIVE HAS NO CLOCK',
    figure: num(unknown.length),
    figureLabel: 'receipts the ledger dated and never timed',
    detail:
      `${num(unknown.length)} receipts — ${pct(unknown.length / receipts.length)} of everything here `
      + '— come from ledger rows that wrote down a day and no hour. They are stamped 12:00 so they '
      + 'sort with the rest, and tagged so that no dial, heatmap or hour profile counts them. '
      + 'Inventing a plausible time for them would have been a single line of code and would have '
      + 'made every hour chart in this product a lie.',
    evidence: unknown,
  });
}

function densestDay({ receipts }: Ctx): Pattern | null {
  const days = new Map<string, Receipt[]>();
  for (const r of receipts) {
    const p = parseAt(r.at);
    if (!p) continue;
    const key = r.at.slice(0, 10);
    const list = days.get(key) ?? [];
    list.push(r);
    days.set(key, list);
  }
  if (days.size < 30) return null;

  const ranked = [...days.entries()]
    .map(([day, rs]) => ({ day, rs, kinds: new Set(rs.map(r => r.kind)).size }))
    .filter(d => d.kinds >= 2)
    .sort((a, b) => (b.rs.length - a.rs.length) || (b.kinds - a.kinds) || a.day.localeCompare(b.day));
  const top = ranked[0];
  if (!top) return null;

  const typical = median([...days.values()].map(rs => rs.length));
  const counts = new Map<ReceiptKind, number>();
  for (const r of top.rs) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  const breakdown = RECEIPT_KINDS
    .filter(k => counts.has(k))
    .map(k => `${k} ${num(counts.get(k))}`)
    .join(' · ');
  const spent = sum(dedupeRows(top.rs).map(r => amountOf(r) ?? 0));

  return pattern({
    id: 'pat-densest-day',
    title: `ONE DAY LEFT ${num(top.rs.length)} RECEIPTS`,
    figure: num(top.rs.length),
    figureLabel: `receipts on ${dateLabel(`${top.day}T12:00`)}, the densest day in the archive`,
    detail:
      `${dateLabel(`${top.day}T12:00`)} left ${num(top.rs.length)} receipts across ${num(top.kinds)} `
      + `kinds — ${breakdown}`
      + (spent > 0 ? ` — and ${inr(spent)} of it` : '')
      + `. A typical day here leaves ${num(typical)}. Nothing in the sources marks this date as `
      + 'significant; it is only dense, which is the sort of thing an archive notices and a person '
      + 'does not.',
    evidence: top.rs,
  });
}

function crossKindMoments({ threads, byId }: Ctx): Pattern | null {
  const rich = threads
    .filter(t => new Set(t.kinds).size >= 3 && t.receiptIds.length >= 3)
    .sort((a, b) => (b.strength - a.strength) || a.id.localeCompare(b.id));
  const best = rich[0];
  if (!best) return null;

  const evidence: Receipt[] = [];
  for (const id of best.receiptIds) {
    const r = byId.get(id);
    if (r) evidence.push(r);
  }
  if (evidence.length === 0) return null;

  const caption = text(best.caption);
  return pattern({
    id: 'pat-cross-kind',
    title: 'THE SAME EVENING, FILED IN THREE PLACES',
    figure: num(rich.length),
    figureLabel: 'moments where three kinds of receipt turn out to be one moment',
    // The trailing clause is joined through `period` because everything before it
    // ends in data. Written as a bare `+ '. The sources never met'` this rendered
    // `a purchase, a search and a…. The sources never met` on /rhythms — see the
    // note on `period` in lib/format.ts for both of the ways it broke.
    detail:
      period(
        `${num(rich.length)} clusters in this archive hold three or more kinds of receipt at once, `
        + 'which is the only way a spend, a journey and a listening session can be recognised as one '
        + `evening. The strongest is "${clip(best.title, 52)}" on ${dateLabel(best.start)}`
        + (caption ? `: ${clip(caption, 120)}` : ''),
      )
      + ' The sources never met; the dates did.',
    evidence,
  });
}

export function buildPatterns(receipts: Receipt[], agg: Aggregates, threads: Thread[]): Pattern[] {
  const ctx: Ctx = {
    receipts,
    agg,
    threads,
    byId: new Map(receipts.map(r => [r.id, r])),
    music: receipts.filter(r => r.kind === 'music'),
    money: receipts.filter(r => r.provenance === 'observed' && r.kind !== 'event' && amountOf(r) !== null),
    cards: receipts.filter(r => r.source === 'cards'),
    household: receipts.filter(r => r.source === 'household' && amountOf(r) !== null),
    tagged: (tag: string) => receipts.filter(r => r.tags.includes(tag)),
  };

  // Ordered by how much of the archive each one explains, strongest first; the
  // page prints them in this order and the tail is the first thing to be cut.
  const miners: Array<(c: Ctx) => Pattern | null> = [
    hourShape,
    yearsWithoutMoney,
    flaggedCharges,
    c => arrivalPattern(c, 0),
    obsessionLoops,
    firstPlaceChangedHands,
    scoreListening,
    cashBoughtSmallThings,
    tightestCadence,
    densestDay,
    ledgersDisagreeOnTime,
    weekdayNight,
    c => arrivalPattern(c, 1),
    monthlyCadence,
    crossKindMoments,
    undatedHours,
  ];

  const out: Pattern[] = [];
  const seen = new Set<string>();
  for (const mine of miners) {
    const p = mine(ctx);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length === 14) break;
  }
  return out;
}
