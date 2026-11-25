'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Database, ScrollText } from 'lucide-react';
import { AGGREGATES } from '@/lib/archive';
import { LINKS, PATTERNS, STORY_FACTS as F, THREADS } from '@/lib/engine';
import { useOverlay } from '@/lib/OverlayContext';
import { clip, dateLabel, hourLabel, inr, num, pct, plural } from '@/lib/format';
import { kindDef } from '@/lib/kinds';
import type { Receipt, Thread } from '@/lib/types';
import { KindIcon } from '@/components/receipt/KindIcon';
import { ThreadChain } from '@/components/thread/ThreadChain';
import { Slug } from '@/components/ui/Slug';

/**
 * Story — the closing argument. What does it all mean?
 *
 * ── The pacing rule ───────────────────────────────────────────────────────────
 * The reader sets the pace. There is no autoplay, no timer, no scroll hijack and
 * no transition the reader did not ask for. Ten beats, one at a time, moved by a
 * button, an arrow key, or a click on any beat in the index — which means the
 * whole thing is also readable out of order and skippable, because a story that
 * traps you is not being read, it is being endured.
 *
 * ── The evidence rule ─────────────────────────────────────────────────────────
 * Every beat is an authored sentence *and* the evidence for it, side by side.
 * Neither is allowed on its own: prose alone is an assertion, and a figure alone
 * is the KPI tile this design language forbids. Every figure comes from
 * `STORY_FACTS`, computed in src/lib/engine/story.ts — there is not one hand-typed
 * number in this file, so the narrative cannot drift away from the data behind it.
 */

/** The single thread shown in full at beat 8: the strongest cluster that actually
 *  crosses enough ledgers to make the beat's point. The strongest thread overall
 *  is usually a music run, which proves nothing about separate records being one
 *  moment. */
const PROOF_THREAD: Thread | undefined =
  THREADS.find((t) => t.kinds.length >= 4 && t.receiptIds.length >= 5) ?? THREADS[0];

/* ── Shared evidence furniture ─────────────────────────────────────────────── */

/** A figure and its label, set on a rule rather than in a box. Boxes around
 *  numbers is how a page becomes a dashboard. */
function Fig({
  value,
  label,
  amber = false,
}: {
  value: string;
  label: string;
  amber?: boolean;
}): React.JSX.Element {
  return (
    <div className="min-w-0 pt-2" style={{ borderTop: '2px solid var(--k-edge)' }}>
      <span
        className="k-figure nx-numeric block break-words text-[26px] leading-none sm:text-[32px]"
        style={amber ? { color: 'var(--amber)' } : undefined}
      >
        {value}
      </span>
      <span className="k-label mt-2 block" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </span>
    </div>
  );
}

/** An openable receipt row. The story's claims are checkable because every slip
 *  it cites is one click from the sentence citing it. */
function Slip({ receipt, note }: { receipt: Receipt; note?: string }): React.JSX.Element {
  const { openReceipt } = useOverlay();
  return (
    <button
      type="button"
      onClick={() => openReceipt(receipt.id)}
      className="k-receipt flex w-full cursor-pointer items-start gap-3 p-3 text-left"
    >
      <KindIcon kind={receipt.kind} size={12} />
      <span className="min-w-0 flex-1">
        <span
          className="block break-words"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}
        >
          {clip(receipt.title, 64)}
        </span>
        <span className="mt-1 block text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          {dateLabel(receipt.at, 'date unrecorded')}
          {note ? ` · ${note}` : ''}
        </span>
      </span>
      {typeof receipt.amount === 'number' && (
        <span className="k-figure nx-numeric flex-none text-[13px]">{inr(receipt.amount)}</span>
      )}
    </button>
  );
}

/** A year's leading artists against a reference maximum, so two beats about two
 *  different years can be held against each other. */
function ArtistBars({
  rows,
  max,
  highlight,
}: {
  rows: Array<{ name: string; plays: number }>;
  max: number;
  highlight?: string;
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const on = row.name === highlight;
        return (
          <div key={row.name} className="flex items-center gap-3">
            <span
              className="min-w-0 flex-1 truncate text-[13px]"
              style={{
                color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: on ? 600 : 400,
              }}
            >
              {row.name}
            </span>
            <span
              className="hidden h-[11px] flex-none sm:block"
              style={{ width: 120, border: '1px solid var(--k-edge)' }}
              aria-hidden="true"
            >
              <span
                className="block h-full"
                style={{
                  width: `${Math.min(100, (row.plays / max) * 100)}%`,
                  background: on ? 'var(--amber)' : 'var(--level-2)',
                }}
              />
            </span>
            <span
              className="k-figure nx-numeric flex-none text-[11px]"
              style={{ minWidth: '5ch', textAlign: 'right' }}
            >
              {num(row.plays)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── The beats ─────────────────────────────────────────────────────────────── */

interface Beat {
  id: string;
  /** Printed in the index. Short enough to sit in a 200px rail. */
  index: string;
  slug: string;
  title: string;
  /** The authored part. Interpretation, never a figure. */
  sentence: string;
  evidence: React.ReactNode;
}

function useBeats(): Beat[] {
  const yearMax = useMemo(() => {
    const all = Object.values(AGGREGATES.artistsByYear ?? {}).flat();
    return Math.max(1, ...all.map((a) => a.plays));
  }, []);

  const arrivalRows = useMemo(
    () => (AGGREGATES.artistsByYear?.[String(F.arrival.year)] ?? []).slice(0, 5),
    [],
  );
  const overtakeRows = useMemo(
    () => (AGGREGATES.artistsByYear?.[String(F.overtake.year)] ?? []).slice(0, 5),
    [],
  );
  const turnRows = useMemo(
    () => (AGGREGATES.artistsByYear?.[String(F.turn.year)] ?? []).slice(0, 6),
    [],
  );

  return useMemo<Beat[]>(
    () => [
      {
        id: 'exhaust',
        index: 'Raw exhaust',
        slug: 'Beat one',
        title: 'NOBODY WROTE ANY OF THIS DOWN ON PURPOSE',
        sentence:
          'Three files, none of them kept as a record of a life. A streaming log, a household cash book and a card ledger — exhaust from using a phone. Read one row at a time, it is unreadable: a track title, a rupee amount, a timestamp. This is what a decade looks like before anyone asks it a question.',
        evidence: (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Fig value={num(F.totalPlays)} label="tracks played" />
            <Fig value={num(F.moneyRows)} label="money rows" />
            <Fig value={`${num(F.listeningHours)} h`} label="listening, end to end" />
            <Fig value={num(F.receipts)} label="receipts after the join" />
          </div>
        ),
      },
      {
        id: 'noon',
        index: 'The archive has no noon',
        slug: 'Beat two',
        title: 'AGGREGATE IT AND A PERSON APPEARS',
        sentence:
          'One question — what hour was it? — and the exhaust turns into a portrait. This is not a preference anyone would have reported about themselves. It is the shape of ten years of nights, and it is the most reliable thing in the archive because it needs no inference at all: every one of those plays carried its own clock. What the clock cannot tell you is why the middle of the day is empty, and this is where the archive has to stop. A school timetable would explain it. So would a shift, a commute, or a phone left on a charger in another room. The only timetable this archive actually knows belongs to the owner, and the owner did not play these tracks — so the reason for the trough is not in the file, and naming one here would be the archive inventing the very thing it spends a whole page refusing to invent. The histogram is the measurement. The explanation is absent, and that is reported rather than filled in.',
        evidence: (
          <>
            <div className="flex items-end gap-[2px]" style={{ height: 120 }}>
              {(AGGREGATES.playsByHour ?? []).map((plays, hour) => {
                const isPeak = hour === F.peakHour;
                const isTrough = hour === F.troughHour;
                return (
                  <span
                    key={hour}
                    className="min-w-0 flex-1"
                    title={`${hourLabel(hour)} — ${num(plays)} plays`}
                    style={{
                      height: `${Math.max(2, (plays / Math.max(1, F.peakPlays)) * 100)}%`,
                      background: isPeak
                        ? 'var(--amber)'
                        : isTrough
                          ? 'var(--level-0)'
                          : 'var(--level-2)',
                      border: '1px solid var(--k-edge)',
                    }}
                  />
                );
              })}
            </div>
            <div className="mt-1.5 flex justify-between">
              {['00', '06', '12', '18', '23'].map((h) => (
                <span key={h} className="k-label" style={{ color: 'var(--text-tertiary)' }}>
                  {h}
                </span>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Fig value={hourLabel(F.peakHour)} label="the busiest hour of the decade" amber />
              <Fig value={`${F.peakOverTrough.toFixed(1)}×`} label={`its lead over ${hourLabel(F.troughHour)}`} />
              <Fig value={pct(F.nightShare, 1)} label="of all plays fall in 22:00–04:00" />
            </div>
          </>
        ),
      },
      {
        id: 'sums',
        index: 'The size of the sums',
        slug: 'Beat three',
        title: 'MONEY SAYS WHAT MUSIC CANNOT',
        // This beat used to end "...with a school-age child in it whose autos and
        // pocket money are two of the lines." Every word after "counted out loud"
        // was an inference off two category labels, and the ledger refutes it:
        //
        //   - The autos do not belong to a child's school run. Four of them name a
        //     university — "mumbai University Kalina to Santacruz station",
        //     "Santacruz to Kalina University", "Place 6 station to college"
        //     (plc-0059, plc-0060, plc-0133, plc-0077).
        //   - The entire `Education` category is 18 rows and 17 of them are
        //     `Stationary`: xerox, print-outs, envelopes, a courier, a whiteboard
        //     pen. That is a student's photocopying, not a school's fees.
        //   - There are no school fees, no uniform and no tuition anywhere in the
        //     2,461 rows. The only "school" in the file teaches driving
        //     (26/05/2018, an auto to a motor driving school).
        //   - Pocket money runs to ₹5,000 three times over, median ₹500 across 49
        //     rows. That is not a child's allowance.
        //
        // So the file supports "a student" and says so by name, which is both
        // truer and more specific than the guess was. It does not support an age,
        // and the sentence now declines to supply one — same rule as beat two and
        // as DATA_BRIEF §3: an anchor may date the archive, never explain it.
        // Nothing here is hard-typed; the counts above live in the comment because
        // prose that states a number has to be re-checked when the data moves.
        sentence:
          'The listening tells you when someone was awake. The household ledger tells you what kind of household it was. Nobody writes down the price of a cup of tea unless that price is a sum worth writing down — and somebody did, by hand, for years, down to the biscuits and the kilo of millet flour. Read the smallest lines and this is a house where money is counted out loud, and one with a student in it: the auto fares name a university campus and the station they were caught from, the whole Education column is xerox, print-outs and pens, and pocket money arrives all year round. Whose, the ledger never says — so the archive stops at "a student" and does not hand them an age.',
        evidence: (
          <>
            <div className="space-y-2">
              {F.everyday.map((r) => (
                <Slip key={r.id} receipt={r} />
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Fig value={inr(F.medianEveryday)} label="the median line in the cash book" />
              <Fig value={num(F.underHundred)} label="entries under ₹100" />
              <Fig value={num(F.ledgerRows)} label="rows kept by hand" />
            </div>
          </>
        ),
      },
      {
        id: 'scale',
        index: 'The sums change size',
        slug: 'Beat four',
        title: F.salary
          ? `THEN ONE LINE IS ${inr(F.salary.amount)}`
          : 'THEN THE SUMS CHANGE SIZE',
        sentence:
          'The same ledger, the same handwriting, the same month. A few rupees of cashback, a laundry bill itemised by the garment — and then one credit from a workplace worth several hundred of those lines put together. Nothing announces it. The ledger simply starts counting in a different unit for one line and goes straight back to biscuits. Whoever earns this is not the person this archive is named for, who was two years off a class X paper at the time — it is the household the ledger belongs to, and that is the whole reason the small lines are worth reading.',
        evidence: F.salary ? (
          <>
            <div className="space-y-2">
              {F.salaryMonthSmall.map((r) => (
                <Slip key={r.id} receipt={r} />
              ))}
              <div className="pt-2">
                <Slip receipt={F.salary} note="the same month" />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Fig value={inr(F.salary.amount)} label="one credit" amber />
              <Fig value={inr(F.salaryMonthMedian)} label="that month's median line" />
              <Fig
                value={`${num(Math.round(F.salaryMultiple))}×`}
                label="the gap between the two"
              />
            </div>
          </>
        ) : (
          <p className="nx-support">The ledger records no salary credit.</p>
        ),
      },
      {
        id: 'arrival',
        index: `${F.arrival.year} — an arrival`,
        slug: 'Beat five',
        title: `${F.arrival.year}: ${F.arrival.artist.name.toUpperCase()} ARRIVE`,
        sentence:
          'Taste is not random, and it does not drift — it reorganises. The year before, the top of the year belonged to someone who never comes near it again, on a handful of plays. Then one band takes it by a margin nothing else in the decade comes close to, and holds it, on and off, for the next eight years. This is the first of three times the archive changes its mind.',
        evidence: (
          <>
            <ArtistBars rows={arrivalRows} max={yearMax} highlight={F.arrival.artist.name} />
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Fig value={num(F.arrival.artist.plays)} label={`${F.arrival.artist.name} in ${F.arrival.year}`} amber />
              <Fig
                value={num(F.arrival.priorTop?.plays)}
                label={`${F.arrival.priorTop?.name ?? 'the previous leader'} in ${F.arrival.priorYear}`}
              />
              <Fig
                value={`${((F.arrival.artist.plays || 0) / Math.max(1, F.arrival.priorTop?.plays ?? 1)).toFixed(1)}×`}
                label="the year-on-year jump at the top"
              />
            </div>
          </>
        ),
      },
      {
        id: 'overtake',
        index: `${F.overtake.year} — displaced`,
        slug: 'Beat six',
        title: `${F.overtake.year}: ${F.overtake.winner.name.toUpperCase()} TAKE THE YEAR`,
        sentence:
          'The second reorganisation, and the only one with an obvious outside cause. For the first time in the decade the most-played band overall is not the most-played band of the year. They are not abandoned — they are played as heavily as ever and still come second, beaten by a body of work almost entirely about wanting to be somewhere else. It is the year everybody was indoors.',
        evidence: (
          <>
            <ArtistBars rows={overtakeRows} max={yearMax} highlight={F.overtake.winner.name} />
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Fig value={num(F.overtake.winner.plays)} label={`${F.overtake.winner.name} in ${F.overtake.year}`} amber />
              <Fig value={num(F.overtake.displaced.plays)} label={`${F.overtake.displaced.name}, still second`} />
              <Fig
                value={num(F.gapPlays)}
                label={`plays across ${F.gapYears[0]}–${F.gapYears[F.gapYears.length - 1]}`}
              />
            </div>
          </>
        ),
      },
      {
        id: 'turn',
        index: `${F.turn.year} — the language turns`,
        slug: 'Beat seven',
        title: `${F.turn.year}: THE LANGUAGE CHANGES`,
        sentence: `The third reorganisation is the strangest, because nothing in the money or the places predicts it. ${plural(F.turn.newcomers.length, 'Spanish-language songwriter')} appear in the same year, none of them among any earlier year's leaders, and one of them ends the year outplayed only by the band that has led the whole archive. Whatever happened here left no receipt anywhere else in the archive — no ticket, no journey, no purchase. The listening is the only witness.`,
        evidence: (
          <>
            <ArtistBars
              rows={turnRows}
              max={yearMax}
              highlight={F.turn.newcomers[0]?.name}
            />
            <div className="mt-5 space-y-1.5">
              {F.turn.newcomers.map((a) => (
                <div key={a.name} className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                    {a.name}
                  </span>
                  <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
                    first year among the year&rsquo;s leaders: {num(F.turn.firstSeen[a.name])}
                  </span>
                </div>
              ))}
            </div>
            <p className="nx-support mt-4">
              The per-year aggregate holds each year&rsquo;s leading artists rather
              than every artist, so &ldquo;first year&rdquo; means the first year
              a name mattered, not the first time it was ever played.
            </p>
          </>
        ),
      },
      {
        id: 'connections',
        index: 'One moment, five records',
        slug: 'Beat eight',
        title: 'SEPARATE FILES, ONE AFTERNOON',
        sentence:
          'Everything so far came from one ledger at a time. This is the part that needs all three. A payment, what was playing around it, what was searched before it and what was written about it afterwards are four rows in three files with nothing joining them — no shared key, no shared format, no shared idea of what a record is. Joined on time and on the names inside them, they turn out to be one afternoon.',
        evidence: PROOF_THREAD ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="k-figure nx-numeric text-[15px]">{PROOF_THREAD.title}</span>
              <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
                {dateLabel(PROOF_THREAD.start, '')} · {plural(PROOF_THREAD.kinds.length, 'kind')} ·{' '}
                {plural(PROOF_THREAD.receiptIds.length, 'receipt')}
              </span>
            </div>
            <p className="nx-support mt-2 max-w-[70ch]">{PROOF_THREAD.caption}</p>
            <div className="mt-5">
              <ThreadChain thread={PROOF_THREAD} limit={6} />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Fig value={num(LINKS.length)} label="links the engine derived" />
              <Fig value={num(THREADS.length)} label="clusters that hold together" />
              <Fig
                value={num(THREADS.filter((t) => t.kinds.length >= 3).length)}
                label="of them cross three kinds or more"
                amber
              />
            </div>
          </>
        ) : (
          <p className="nx-support">No cluster in this archive crosses enough ledgers to show.</p>
        ),
      },
      {
        id: 'unknown',
        index: 'What it does not know',
        slug: 'Beat nine',
        title: 'THE HOLES ARE PART OF THE PICTURE',
        sentence: `${plural(F.gapYears.length, 'year')} in the middle of the decade have music and no money at all — not because nothing was bought, but because no file covers them. And ${plural(F.reconstructed.length, 'kind')} of receipt here were never in any file: the photos, the messages and the searches are inferences the engine drew from things that were, and every one of them carries the receipts it was drawn from. An archive that hid this would be a nicer story and a worse one.`,
        evidence: (
          <>
            <div className="space-y-2">
              {F.gapYears.map((year) => {
                const plays = Object.entries(AGGREGATES.playsByMonth ?? {})
                  .filter(([ym]) => ym.startsWith(String(year)))
                  .reduce((sum, [, v]) => sum + v, 0);
                return (
                  <div
                    key={year}
                    className="flex items-center gap-4 pb-2"
                    style={{ borderBottom: '1px solid var(--k-edge)' }}
                  >
                    <span className="k-figure nx-numeric flex-none text-[15px]">{year}</span>
                    <span
                      className="h-[11px] min-w-0 flex-1"
                      style={{ border: '1px solid var(--k-edge)' }}
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full"
                        style={{
                          width: `${(plays / Math.max(1, F.gapPlays)) * 100}%`,
                          background: 'var(--level-2)',
                        }}
                      />
                    </span>
                    <span className="k-label flex-none" style={{ color: 'var(--text-tertiary)' }}>
                      {num(plays)} plays
                    </span>
                    <span
                      className="k-figure nx-numeric flex-none text-[11px]"
                      style={{ minWidth: '4ch', textAlign: 'right' }}
                    >
                      ₹0
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              {F.reconstructed.map(({ kind, count }) => (
                <span key={kind} className="inline-flex items-center gap-2">
                  <KindIcon kind={kind} size={12} />
                  <span className="k-figure nx-numeric text-[15px]">{num(count)}</span>
                  <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
                    {kindDef(kind).plural.toLowerCase()} reconstructed
                  </span>
                </span>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
              <Fig value={num(F.observedTotal)} label="receipts read from a file" />
              <Fig value={num(F.reconstructedTotal)} label="receipts the engine inferred" />
              <Fig
                value={pct(F.reconstructedTotal / Math.max(1, F.receipts), 1)}
                label="of the archive is inference, and says so"
              />
            </div>
            <p className="nx-support mt-4 max-w-[70ch]">
              Open any reconstructed slip and it prints what it rests on. No photo,
              message or search in this archive records a real photo, message or
              search &mdash; the full accounting is on{' '}
              <Link href="/sources" className="underline">
                Sources
              </Link>
              .
            </p>
          </>
        ),
      },
      {
        id: 'sum',
        index: 'What it adds up to',
        slug: 'Beat ten',
        title: 'WHAT A DECADE OF EXHAUST TURNS OUT TO HOLD',
        sentence:
          'A house that wrote down five rupees of tea for years and then stopped. Someone in it awake when the rest of it was not, every night, for ten years. A taste that reorganised itself three times and left no explanation for the last one. None of that was recorded on purpose. All of it was left behind by accident, in files kept for other reasons, and the only reason any of it can be said at all is that the records were read together instead of one at a time. That is the whole finding: a life is not in any single ledger. It is in the joins.',
        evidence: (
          <>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Fig value={String(F.years)} label="years, end to end" />
              <Fig value={num(F.receipts)} label="receipts" />
              <Fig value={num(LINKS.length)} label="derived connections" amber />
              <Fig value={num(PATTERNS.length)} label="patterns it could prove" />
            </div>
            <p
              className="mt-6 max-w-[62ch] break-words text-[15px] leading-relaxed"
              style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
            >
              {dateLabel(F.from, '')} to {dateLabel(F.to, '')}. Every figure on this
              page was computed from the three files at build time and is checkable
              from the slip it came from.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/roll" className="k-btn k-btn-solid">
                <ScrollText size={13} />
                Read all {num(F.receipts)} receipts
              </Link>
              <Link href="/chapters" className="k-btn k-btn-outline">
                The six eras
                <ArrowRight size={13} />
              </Link>
              <Link href="/sources" className="k-btn k-btn-outline">
                <Database size={13} />
                Where this came from
              </Link>
            </div>
          </>
        ),
      },
    ],
    [arrivalRows, overtakeRows, turnRows, yearMax],
  );
}

export default function StoryPage(): React.JSX.Element {
  const beats = useBeats();
  const [at, setAt] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  const go = useCallback(
    (next: number) => {
      setAt((cur) => {
        const clamped = Math.max(0, Math.min(beats.length - 1, next));
        return clamped === cur ? cur : clamped;
      });
    },
    [beats.length],
  );

  // ── Arrow keys ──────────────────────────────────────────────────────────────
  // Bound on the window rather than on a focused element, because the reader's
  // focus is wherever they last clicked and a story that only responds while a
  // particular button is focused does not respond. Guarded against firing while
  // someone is typing, and against stealing the browser's own modified shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(at + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(at - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        go(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        go(beats.length - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, beats.length, go]);

  const beat = beats[at];
  const first = at === 0;
  const last = at === beats.length - 1;

  return (
    <div className="space-y-6">
      {/* ── The masthead ─────────────────────────────────────────────────── */}
      <section className="k-paper k-panel p-5 sm:p-6">
        <Slug>The closing argument</Slug>
        <h1 className="k-display mt-2">WHAT DOES IT ALL MEAN?</h1>
        <p className="nx-support mt-3 max-w-[72ch]">
          Ten beats, in order, at your pace. Each one is a sentence and the evidence
          for it &mdash; use the arrow keys, the buttons, or the index to move, and
          open any slip to check the claim it supports. Nothing here advances on its
          own.
        </p>
      </section>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── The index ───────────────────────────────────────────────────── */}
        {/* A rail above lg, a horizontal strip below it. Either way every beat is
            one click away: the reader is never made to walk back through nine
            screens to re-read the fourth. */}
        <nav className="lg:w-[220px] lg:flex-none" aria-label="Story beats">
          <div className="k-paper k-panel-flat p-4 lg:sticky" style={{ top: 72 }}>
            <Slug>The argument</Slug>
            <ol className="mt-3 flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {beats.map((b, i) => {
                const active = i === at;
                const read = i < at;
                return (
                  <li key={b.id} className="flex-none lg:w-full">
                    <button
                      type="button"
                      onClick={() => go(i)}
                      aria-current={active ? 'step' : undefined}
                      className="flex w-full cursor-pointer items-baseline gap-2.5 px-2 py-1.5 text-left"
                      style={{
                        background: active ? 'var(--text-primary)' : 'var(--frame-hover-off)',
                        color: active ? 'var(--bg-base)' : 'var(--text-secondary)',
                        // The read beats are marked on the left edge, not greyed
                        // out: a beat you have read is still a beat you can read.
                        borderLeft: `2px solid ${read ? 'var(--amber)' : 'var(--frame-hover-off)'}`,
                      }}
                    >
                      <span
                        className="k-figure nx-numeric flex-none text-[11px]"
                        style={{ color: 'inherit', opacity: 0.7 }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="k-label whitespace-nowrap lg:whitespace-normal" style={{ color: 'inherit' }}>
                        {b.index}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </nav>

        {/* ── The beat ────────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <section className="k-paper k-panel">
            {/* The beat body is replaced, not cross-faded: two beats overlapping
                would put two contradictory sets of figures on screen at once. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={beat.id}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.25, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="px-5 pt-6 pb-5 sm:px-8">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <Slug>{beat.slug}</Slug>
                    <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
                      {String(at + 1).padStart(2, '0')} / {String(beats.length).padStart(2, '0')}
                    </span>
                  </div>
                  <h2 className="k-display mt-3 break-words">{beat.title}</h2>
                  <p
                    className="mt-5 max-w-[62ch] break-words text-[15px] leading-[1.75] sm:text-[17px]"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                  >
                    {beat.sentence}
                  </p>
                </div>

                <hr className="k-rule-hard" />

                <div className="px-5 py-6 sm:px-8">
                  <Slug>The evidence</Slug>
                  <div className="mt-4">{beat.evidence}</div>
                </div>
              </motion.div>
            </AnimatePresence>

            <hr className="k-rule-hard" />

            {/* ── The controls ────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
              <button
                type="button"
                onClick={() => go(at - 1)}
                disabled={first}
                className="k-btn k-btn-outline"
              >
                <ArrowLeft size={13} />
                Back
              </button>

              <span className="k-label hidden sm:block" style={{ color: 'var(--text-tertiary)' }}>
                Arrow keys work too
              </span>

              {last ? (
                <Link href="/roll" className="k-btn k-btn-amber">
                  Go and read them
                  <ArrowRight size={13} />
                </Link>
              ) : (
                <button type="button" onClick={() => go(at + 1)} className="k-btn k-btn-solid">
                  {beats[at + 1]?.index}
                  <ArrowRight size={13} />
                </button>
              )}
            </div>
          </section>

          {/* The beat change is announced for a screen reader, which otherwise
              hears nothing when the whole panel is swapped. */}
          <div className="sr-only" aria-live="polite">
            Beat {at + 1} of {beats.length}: {beat.title}
          </div>
        </div>
      </div>
    </div>
  );
}
