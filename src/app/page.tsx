'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AGGREGATES, META, RECEIPTS, SOURCES } from '@/lib/archive';
import { CHAPTER_STATS, CHAPTERS, PATTERNS, THREADS } from '@/lib/engine';
import { compact, num, plural } from '@/lib/format';
import { DecadeSpine } from '@/components/charts/DecadeSpine';
import { PatternBlock } from '@/components/pattern/PatternBlock';
import { ThreadChain } from '@/components/thread/ThreadChain';
import { Slug } from '@/components/ui/Slug';

/**
 * The opening spread. Not a dashboard — a masthead, one signature graphic, one
 * worked example of the product's whole idea, and the routes out.
 *
 * The order is deliberate and it is the brief's own arc: raw data (the masthead's
 * counts), insight (the spine), connection (a full thread, on the front page,
 * requiring no clicks), story (the chapter index and the call to the story). A
 * visitor who reads only this page should still be able to say what the archive
 * is and what it found.
 *
 * There is no search box here. The topbar has one and `/roll` owns searching.
 */

/** The strongest thread that actually crosses several kinds. The single
 *  strongest thread overall is sometimes four music sessions in a night, which is
 *  true but is a poor advertisement for the idea the page is making. */
const FEATURE_THREAD =
  THREADS.find((t) => t.kinds.length >= 4 && t.receiptIds.length >= 5) ??
  THREADS.find((t) => t.kinds.length >= 3) ??
  THREADS[0];

const FEATURE_PATTERNS = PATTERNS.slice(0, 3);

const CHAPTER_INDEX = CHAPTERS.map((chapter) => ({
  chapter,
  stats: CHAPTER_STATS.find((s) => s.chapterId === chapter.id),
}));

export default function ArchivePage(): React.JSX.Element {
  const years = META.years;
  const spanFrom = META.from.slice(0, 4);
  const spanTo = META.to.slice(0, 4);

  return (
    <div className="space-y-8">
      {/* ── The masthead ──────────────────────────────────────────────────── */}
      <section className="k-paper k-panel">
        <div className="px-5 pt-6 pb-5 sm:px-8 sm:pt-8">
          <Slug>The archive of</Slug>
          <h2 className="k-display mt-3 break-words">{META.owner.name}</h2>
          {/* Standing and span on one rule under the name — the colophon of a
              masthead, not two more figures. The span is the archive's; the
              standing is the owner's, and /sources is where the difference
              between those two things is argued. */}
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="k-figure nx-numeric text-[15px]" style={{ color: 'var(--text-secondary)' }}>
              {spanFrom} — {spanTo}
            </span>
            <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
              {META.owner.work} · {META.owner.at}
            </span>
          </p>

          <p
            className="mt-5 max-w-[62ch] break-words text-[15px] leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            Three independent public datasets — a decade of streaming history, four
            years of a hand-kept household ledger, and two years of card
            transactions — read as one person&rsquo;s ten years. The join is the
            premise, not a mistake being hidden: every receipt here says which file
            it came from, and every receipt the engine had to infer says so on its
            face and shows you what it was inferred from.
          </p>
          <p className="nx-support mt-3 max-w-[62ch]">
            {plural(AGGREGATES.totalPlays, 'play')} and{' '}
            {plural(Object.keys(AGGREGATES.spendByMonth).length, 'month')} of money went in.{' '}
            {plural(RECEIPTS.length, 'receipt')} came out. What follows is what they turned out to
            say.
          </p>
        </div>

        {/* The three figures sit on the sheet's footer rule rather than in four
            bordered boxes — the design language forbids a metric grid, and a
            masthead's numbers belong in its colophon anyway. */}
        <hr className="k-rule-hard" />
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 px-5 py-4 sm:px-8">
          <span className="inline-flex items-baseline gap-2">
            <span className="k-figure nx-numeric text-[15px]">{num(RECEIPTS.length)}</span>
            <span className="k-label">receipts</span>
          </span>
          <span className="inline-flex items-baseline gap-2">
            <span className="k-figure nx-numeric text-[15px]">{num(years)}</span>
            <span className="k-label">years</span>
          </span>
          <span className="inline-flex items-baseline gap-2">
            <span className="k-figure nx-numeric text-[15px]">{num(SOURCES.length)}</span>
            <span className="k-label">sources</span>
          </span>
          <span className="inline-flex items-baseline gap-2">
            <span className="k-figure nx-numeric text-[15px]">
              {compact(AGGREGATES.totalListeningHours)}
            </span>
            <span className="k-label">hours listened</span>
          </span>
          <Link href="/sources" className="k-label ml-auto inline-flex items-center gap-1.5 underline">
            What this does not know
            <ArrowRight size={12} />
          </Link>
        </div>
      </section>

      {/* ── The decade spine ─────────────────────────────────────────────── */}
      <section className="k-paper k-panel">
        <div className="px-5 pt-5 pb-4 sm:px-6">
          <Slug>The shape of it</Slug>
          <h2 className="k-display-sm mt-2">TEN YEARS, ONE BAND</h2>
          <p className="nx-support mt-3 max-w-[62ch]">
            Every receipt in the archive, by year and by kind. The thin strip below
            each column is what was recording that year — which is why the middle of
            the decade thins out and the reason is a missing ledger, not a missing
            life.
          </p>
        </div>
        <hr className="k-rule-hard" />
        <div className="p-5 sm:p-6">
          <DecadeSpine />
        </div>
      </section>

      {/* ── One thread, in full ──────────────────────────────────────────── */}
      {FEATURE_THREAD && (
        <section className="k-paper k-panel">
          <div className="px-5 pt-5 pb-4 sm:px-6">
            <Slug>One moment, five records</Slug>
            <h2 className="k-display-sm mt-2 break-words">{FEATURE_THREAD.title}</h2>
            <p className="nx-support mt-3 max-w-[70ch] break-words">{FEATURE_THREAD.caption}</p>
          </div>
          <hr className="k-rule-hard" />
          <div className="p-5 sm:p-6">
            <ThreadChain thread={FEATURE_THREAD} limit={5} />
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/threads" className="k-btn k-btn-outline">
                All {num(THREADS.length)} threads
                <ArrowRight size={13} />
              </Link>
              <p className="nx-support min-w-0 flex-1">
                The words on each connector are the derived reason those two receipts
                are in the same moment. Nothing here was grouped by hand.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── Three patterns ──────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <Slug>What it noticed</Slug>
          <h2 className="k-display-sm mt-2">THINGS NOBODY WROTE DOWN</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {FEATURE_PATTERNS.map((p) => (
            <PatternBlock key={p.id} pattern={p} compact />
          ))}
        </div>
        <div className="mt-4">
          <Link href="/rhythms" className="k-btn k-btn-outline">
            All {num(PATTERNS.length)} patterns
            <ArrowRight size={13} />
          </Link>
        </div>
      </section>

      {/* ── The chapter index ───────────────────────────────────────────── */}
      <section className="k-paper k-panel">
        <div className="px-5 pt-5 pb-4 sm:px-6">
          <Slug>Era by era</Slug>
          <h2 className="k-display-sm mt-2">SIX CHAPTERS</h2>
        </div>
        <hr className="k-rule-hard" />
        <div className="divide-y-2" style={{ borderColor: 'var(--k-edge)' }}>
          {CHAPTER_INDEX.map(({ chapter, stats }) => (
            <Link
              key={chapter.id}
              href={`/chapters#${chapter.id}`}
              className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-baseline sm:gap-5 sm:px-6"
              style={{ borderColor: 'var(--k-edge)' }}
            >
              <span
                className="k-figure nx-numeric flex-none text-[13px]"
                style={{ color: 'var(--text-tertiary)', minWidth: '9ch' }}
              >
                {chapter.fromYear}–{String(chapter.toYear).slice(2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="k-display-sm block break-words">{chapter.title}</span>
                <span
                  className="mt-1.5 block break-words text-[13px] leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {chapter.thesis}
                </span>
              </span>
              <span className="k-label flex-none" style={{ color: 'var(--text-tertiary)' }}>
                {stats ? plural(stats.receipts, 'receipt') : 'no receipts'}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── The call to the story ───────────────────────────────────────── */}
      <section className="k-paper k-panel px-5 py-6 sm:px-8 sm:py-8">
        <Slug>And in the end</Slug>
        <h2 className="k-display-sm mt-2 max-w-[38ch] break-words">
          WHAT DOES ALL OF THIS ACTUALLY MEAN?
        </h2>
        <p className="nx-support mt-3 max-w-[58ch]">
          Ten beats, at your pace, each one pairing a sentence with the number
          behind it. It is the argument this whole archive was built to make.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/story" className="k-btn k-btn-amber">
            Read the story
            <ArrowRight size={13} />
          </Link>
          <Link href="/roll" className="k-btn k-btn-outline">
            Or go straight to the receipts
          </Link>
        </div>
      </section>
    </div>
  );
}
