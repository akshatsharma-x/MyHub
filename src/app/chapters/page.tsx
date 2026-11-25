'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { RECEIPTS } from '@/lib/archive';
import { CHAPTER_STATS, CHAPTERS, linkCount } from '@/lib/engine';
import { useExploration } from '@/lib/ExplorationContext';
import { useOverlay } from '@/lib/OverlayContext';
import { compact, hourLabel, inr, num, pct, plural } from '@/lib/format';
import { kindDef, KIND_ORDER } from '@/lib/kinds';
import type { Chapter, ChapterStats, Receipt, ReceiptKind } from '@/lib/types';
import { KindIcon } from '@/components/receipt/KindIcon';
import { ReceiptCard } from '@/components/receipt/ReceiptCard';
import { Slug } from '@/components/ui/Slug';

/**
 * Chapters — who this person was, era by era.
 *
 * ── The one rule this page lives by ───────────────────────────────────────────
 * **Every scale is global.** The artist bars, the receipt-volume bar and the hour
 * histogram are all measured against the maximum across all six chapters, never
 * against each chapter's own maximum. That is the difference between a page you
 * can read comparatively and six unrelated infographics: scaled locally, 2019's
 * 80 receipts and 2017's 898 would draw identical bars, and the quiet year — the
 * most interesting thing in the whole archive — would vanish.
 *
 * The stat blocks are also in the same positions in every spread, for the same
 * reason. Comparison needs a fixed frame.
 *
 * THE QUIET YEAR and INDOOR VOICES have no spend at all. They print *"the ledger
 * stops here"* as a finding, because it is one. A `₹—` or an empty panel would be
 * the page quietly failing at its own subject.
 */

const SAMPLE_SIZE = 6;

interface Spread {
  chapter: Chapter;
  stats: ChapterStats;
  receipts: Receipt[];
}

/** The most-connected receipts in the chapter, spread across kinds so a spread is
 *  never six listening sessions. Deterministic: sorted by degree, then id. */
function representatives(chapter: Chapter): Receipt[] {
  const inSpan = RECEIPTS.filter((r) => {
    const y = Number(r.at.slice(0, 4));
    return y >= chapter.fromYear && y <= chapter.toYear;
  }).sort((a, b) => linkCount(b.id) - linkCount(a.id) || (a.id < b.id ? -1 : 1));

  const out: Receipt[] = [];
  const used = new Set<ReceiptKind>();
  for (const r of inSpan) {
    if (out.length >= SAMPLE_SIZE) break;
    if (used.has(r.kind)) continue;
    used.add(r.kind);
    out.push(r);
  }
  // Then fill any remaining slots with the next best of any kind.
  for (const r of inSpan) {
    if (out.length >= SAMPLE_SIZE) break;
    if (out.includes(r)) continue;
    out.push(r);
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** A ranked bar set. `max` is always the page-wide maximum — see the note above. */
function RankedBars({
  rows,
  max,
}: {
  rows: Array<{ name: string; value: number }>;
  max: number;
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.name} className="flex items-center gap-3">
          <span
            className="min-w-0 flex-1 truncate text-[13px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            {row.name}
          </span>
          <span
            className="hidden h-[10px] flex-none sm:block"
            style={{ width: 92, border: '1px solid var(--k-edge)' }}
            aria-hidden="true"
          >
            <span
              className="block h-full"
              style={{
                width: `${Math.min(100, (row.value / max) * 100)}%`,
                background: 'var(--level-2)',
              }}
            />
          </span>
          <span className="k-figure nx-numeric flex-none text-[11px]" style={{ minWidth: '5ch', textAlign: 'right' }}>
            {num(row.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The chapter's own 24-hour shape, as a hard-edged micro-histogram on the
 *  page-wide scale. */
function HourStrip({ profile, max }: { profile: number[]; max: number }): React.JSX.Element {
  const peak = profile.indexOf(Math.max(...profile));
  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height: 48 }}>
        {profile.map((share, hour) => (
          <span
            key={hour}
            className="min-w-0 flex-1"
            title={`${hourLabel(hour)} — ${pct(share, 1)} of this chapter`}
            style={{
              height: `${Math.max(2, (share / max) * 100)}%`,
              background: hour === peak ? 'var(--amber)' : 'var(--level-1)',
              border: '1px solid var(--k-edge)',
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
          00
        </span>
        <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
          12
        </span>
        <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
          23
        </span>
      </div>
    </div>
  );
}

export default function ChaptersPage(): React.JSX.Element {
  const { openReceipt } = useOverlay();
  const { seen } = useExploration();
  const [current, setCurrent] = useState<string>(CHAPTERS[0]?.id ?? '');

  const spreads = useMemo<Spread[]>(
    () =>
      CHAPTERS.map((chapter) => {
        const stats =
          CHAPTER_STATS.find((s) => s.chapterId === chapter.id) ??
          ({
            chapterId: chapter.id,
            receipts: 0,
            byKind: {},
            topArtists: [],
            topEntities: [],
            hourProfile: new Array(24).fill(0),
            spend: 0,
            medianHourLabel: '—',
          } satisfies ChapterStats);
        return { chapter, stats, receipts: representatives(chapter) };
      }),
    [],
  );

  // The page-wide maxima. Computed once, used by every spread.
  const scale = useMemo(() => {
    const receipts = Math.max(1, ...spreads.map((s) => s.stats.receipts));
    const spend = Math.max(1, ...spreads.map((s) => s.stats.spend));
    const plays = Math.max(1, ...spreads.flatMap((s) => s.stats.topArtists.map((a) => a.plays)));
    const hour = Math.max(0.01, ...spreads.flatMap((s) => s.stats.hourProfile));
    return { receipts, spend, plays, hour };
  }, [spreads]);

  return (
    <div className="space-y-8">
      {/* ── The navigator ────────────────────────────────────────────────── */}
      {/* Sticky under the 56px topbar, so it is still reachable six spreads down.
          A strip rather than a rail: six items fit across, and a second left
          column would fight the sidebar for the same edge. */}
      <nav
        className="k-room sticky z-20 -mx-5 px-5 py-3 sm:mx-0 sm:px-0"
        style={{ top: 56, background: 'var(--bg-base)' }}
        aria-label="Chapters"
      >
        <div className="flex gap-2 overflow-x-auto pb-1">
          {spreads.map(({ chapter }) => (
            <Link
              key={chapter.id}
              href={`#${chapter.id}`}
              onClick={() => setCurrent(chapter.id)}
              className="k-label flex-none px-2.5 py-2"
              style={{
                border: '2px solid var(--k-edge)',
                background:
                  current === chapter.id ? 'var(--text-primary)' : 'var(--frame-hover-off)',
                color: current === chapter.id ? 'var(--bg-base)' : 'var(--text-secondary)',
              }}
            >
              {chapter.fromYear}
              {chapter.toYear !== chapter.fromYear ? `–${String(chapter.toYear).slice(2)}` : ''}
            </Link>
          ))}
        </div>
      </nav>

      <section className="k-paper k-panel p-5 sm:p-6">
        <Slug>How to read these</Slug>
        <h2 className="k-display-sm mt-2">SIX ERAS, ON ONE SET OF SCALES</h2>
        <p className="nx-support mt-3 max-w-[70ch]">
          The boundaries are a curatorial call, drawn where the measured behaviour
          shifts. Every figure inside them is computed from the receipts. All six
          spreads use the same scales and put the same blocks in the same places, so
          the shapes can be held against each other — which is the only way the
          quiet years read as quiet rather than as small.
        </p>
      </section>

      {/* ── The six spreads ─────────────────────────────────────────────── */}
      {spreads.map(({ chapter, stats, receipts }) => {
        const kinds = KIND_ORDER.map((k) => ({ kind: k, count: stats.byKind[k] ?? 0 })).filter(
          (k) => k.count > 0,
        );

        return (
          <section
            key={chapter.id}
            id={chapter.id}
            className="k-paper k-panel"
            // The sticky navigator is 56px of topbar plus its own height, so an
            // anchor jump would otherwise land the heading underneath it.
            style={{ scrollMarginTop: 120 }}
          >
            <div className="px-5 pt-6 pb-5 sm:px-8">
              <span className="k-figure nx-numeric block text-[32px] leading-none sm:text-[40px]">
                {chapter.fromYear}
                {chapter.toYear !== chapter.fromYear ? `–${chapter.toYear}` : ''}
              </span>
              <h2 className="k-display mt-3 break-words">{chapter.title}</h2>
              <p
                className="mt-4 max-w-[52ch] break-words text-[15px] leading-relaxed sm:text-[17px]"
                style={{ color: 'var(--text-primary)' }}
              >
                {chapter.thesis}
              </p>
            </div>

            <hr className="k-rule-hard" />

            <div className="grid grid-cols-1 gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_280px]">
              {/* The prose. Body sans at a comfortable measure — the display mono
                  is for headings and figures and is unreadable at paragraph
                  length, which is exactly why it is not used here. */}
              <div className="min-w-0">
                <p
                  className="max-w-prose break-words text-[15px] leading-[1.75]"
                  style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
                >
                  {chapter.body}
                </p>

                <div className="mt-6">
                  <Slug>What this era holds</Slug>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {kinds.map(({ kind, count }) => (
                      <span key={kind} className="inline-flex items-center gap-1.5">
                        <KindIcon kind={kind} size={11} />
                        <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
                          {kindDef(kind).plural} {num(count)}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* The stat column. Same four blocks, same order, every chapter. */}
              <aside className="min-w-0 space-y-6">
                <div>
                  <Slug>Receipts</Slug>
                  <div className="k-figure nx-numeric mt-2 text-[28px] leading-none">
                    {num(stats.receipts)}
                  </div>
                  <span
                    className="mt-2 block h-[10px] w-full"
                    style={{ border: '1px solid var(--k-edge)' }}
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full"
                      style={{
                        width: `${(stats.receipts / scale.receipts) * 100}%`,
                        background: 'var(--level-5)',
                      }}
                    />
                  </span>
                  <p className="k-label mt-1.5">against the busiest era, {num(scale.receipts)}</p>
                </div>

                <div>
                  <Slug>On the ledger</Slug>
                  {stats.spend > 0 ? (
                    <>
                      <div className="k-figure nx-numeric mt-2 break-words text-[22px] leading-none">
                        {compact(stats.spend)}
                      </div>
                      <p className="k-label mt-1.5">{inr(stats.spend)} recorded</p>
                    </>
                  ) : (
                    // Stated as the finding it is. Not a dash, not a zero, not an
                    // empty box — this is the test of whether the page is honest.
                    <>
                      <p
                        className="mt-2 max-w-[30ch] break-words text-[15px] leading-snug"
                        style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                      >
                        The ledger stops here.
                      </p>
                      <p className="nx-support mt-2">
                        No money was recorded in these years by any of the three
                        files. The listening carried on — see the spine on{' '}
                        <Link href="/rhythms" className="underline">
                          Rhythms
                        </Link>
                        .
                      </p>
                    </>
                  )}
                </div>

                <div>
                  <Slug>Who was playing</Slug>
                  <div className="mt-2.5">
                    <RankedBars
                      rows={stats.topArtists.slice(0, 5).map((a) => ({ name: a.name, value: a.plays }))}
                      max={scale.plays}
                    />
                  </div>
                </div>

                <div>
                  <Slug>When</Slug>
                  <div className="mt-2.5">
                    <HourStrip profile={stats.hourProfile} max={scale.hour} />
                  </div>
                  <p className="k-label mt-2">
                    median activity at {stats.medianHourLabel}
                  </p>
                </div>
              </aside>
            </div>

            <hr className="k-rule-hard" />

            {/* Representative receipts, then the way through to all of them. */}
            <div className="p-5 sm:p-8">
              <Slug>From these years</Slug>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {receipts.map((r) => (
                  <ReceiptCard
                    key={r.id}
                    receipt={r}
                    onOpen={openReceipt}
                    linkCount={linkCount(r.id)}
                    seen={seen.has(r.id)}
                    dense
                  />
                ))}
              </div>
              <div className="mt-5">
                <Link href={`/roll?year=${chapter.fromYear}`} className="k-btn k-btn-outline">
                  All {plural(stats.receipts, 'receipt')} from {chapter.fromYear}
                  {chapter.toYear !== chapter.fromYear ? ' onward' : ''}
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
