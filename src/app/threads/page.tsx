'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { THREADS, receiptById } from '@/lib/engine';
import { useExploration } from '@/lib/ExplorationContext';
import { dateLabel, num, pct, plural } from '@/lib/format';
import { kindDef, KIND_ORDER } from '@/lib/kinds';
import type { ReceiptKind, Thread } from '@/lib/types';
import { KindIcon } from '@/components/receipt/KindIcon';
import { ThreadChain } from '@/components/thread/ThreadChain';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Slug } from '@/components/ui/Slug';

/**
 * Threads — the route that answers the brief's core example directly: *a song, a
 * location, a photo, a purchase and an event may all be one moment.*
 *
 * Every thread here was found by the link engine, not grouped by hand. The page's
 * whole job is to make that legible, which is why the default sort is strength and
 * why the cross-kind filter exists: a thread of four listening sessions in one
 * night is real but is not interesting, and a thread that crosses three ledgers
 * is the thing the archive was built to surface.
 *
 * A thread renders as a chain with the reason printed on each connector. See
 * ThreadChain for why that is a chain rather than a list.
 */

const PAGE_SIZE = 12;
const COLLAPSED_NODES = 4;

type ThreadSort = 'strength' | 'kinds' | 'span' | 'recent';

const SORTS: Array<{ key: ThreadSort; label: string }> = [
  { key: 'strength', label: 'Strongest' },
  { key: 'kinds', label: 'Most kinds' },
  { key: 'span', label: 'Longest' },
  { key: 'recent', label: 'Most recent' },
];

function spanDays(t: Thread): number {
  const a = Date.parse(`${t.start}:00Z`);
  const b = Date.parse(`${t.end}:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function spanLabel(t: Thread): string {
  const days = spanDays(t);
  if (days === 0) return 'inside one day';
  if (days === 1) return 'across two days';
  if (days < 14) return `across ${days} days`;
  if (days < 60) return `across ${Math.round(days / 7)} weeks`;
  return `across ${Math.round(days / 30)} months`;
}

function ThreadCard({ thread }: { thread: Thread }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const { threadsSeen, markThreadSeen } = useExploration();
  const seen = threadsSeen.has(thread.id);

  const size = thread.receiptIds.filter((id) => receiptById(id)).length;
  const hidden = Math.max(0, size - COLLAPSED_NODES);

  return (
    <article className="k-paper k-panel">
      <div className="px-5 pt-5 pb-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Slug>{dateLabel(thread.start, 'date unrecorded')}</Slug>
            <h3 className="k-display-sm mt-2 break-words">{thread.title}</h3>
          </div>
          {/* Strength is printed as a figure, not a bar: it ranks the list, so a
              reader comparing two threads needs the number, and a 12px bar cannot
              be compared across a scroll. */}
          <div className="flex-none text-right">
            <div className="k-figure nx-numeric text-[22px] leading-none">
              {pct(thread.strength)}
            </div>
            <div className="k-label mt-1">how tightly it holds</div>
          </div>
        </div>

        <p className="nx-support mt-3 max-w-[76ch] break-words">{thread.caption}</p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-1.5">
            {thread.kinds.map((k) => (
              <KindIcon key={k} kind={k} size={11} />
            ))}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {plural(size, 'receipt')} · {plural(thread.kinds.length, 'kind')} · {spanLabel(thread)}
          </span>
          {seen && (
            <span className="k-stamp" style={{ color: 'var(--text-tertiary)' }}>
              Read
            </span>
          )}
        </div>
      </div>

      <hr className="k-rule-hard" />

      <div className="p-5 sm:p-6">
        <ThreadChain thread={thread} limit={open ? undefined : COLLAPSED_NODES} />

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
              markThreadSeen(thread.id);
            }}
            className="k-btn k-btn-outline mt-5"
            aria-expanded={open}
          >
            {open ? (
              <>
                <ChevronUp size={13} />
                Show less
              </>
            ) : (
              <>
                <ChevronDown size={13} />
                Show the other {num(hidden)}
              </>
            )}
          </button>
        )}
      </div>
    </article>
  );
}

export default function ThreadsPage(): React.JSX.Element {
  const [sort, setSort] = useState<ThreadSort>('strength');
  const [crossOnly, setCrossOnly] = useState(false);
  const [mustHave, setMustHave] = useState<ReceiptKind | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);

  const kindCounts = useMemo(() => {
    const counts = new Map<ReceiptKind, number>();
    for (const t of THREADS) for (const k of t.kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
    return counts;
  }, []);

  const threads = useMemo(() => {
    let list = THREADS.slice();
    if (crossOnly) list = list.filter((t) => t.kinds.length >= 3);
    if (mustHave) list = list.filter((t) => t.kinds.includes(mustHave));

    // Every comparator falls back to id so the order is total and the list never
    // reshuffles between renders on a tie.
    const tie = (a: Thread, b: Thread) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    switch (sort) {
      case 'kinds':
        return list.sort((a, b) => b.kinds.length - a.kinds.length || b.strength - a.strength || tie(a, b));
      case 'span':
        return list.sort((a, b) => spanDays(b) - spanDays(a) || b.strength - a.strength || tie(a, b));
      case 'recent':
        return list.sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : tie(a, b)));
      default:
        return list.sort((a, b) => b.strength - a.strength || tie(a, b));
    }
  }, [sort, crossOnly, mustHave]);

  const visible = threads.slice(0, shown);
  const crossCount = useMemo(() => THREADS.filter((t) => t.kinds.length >= 3).length, []);

  const reset = (fn: () => void) => {
    setShown(PAGE_SIZE);
    fn();
  };

  return (
    <div className="space-y-6">
      <section className="k-paper k-panel p-5 sm:p-6">
        <Slug>How this works</Slug>
        <h2 className="k-display-sm mt-2">RECEIPTS THAT BELONG TOGETHER</h2>
        <p className="nx-support mt-3 max-w-[70ch]">
          The engine compares every receipt against every other on time, place and
          shared names, then keeps the clusters that hold together. {num(THREADS.length)} survived,
          and {num(crossCount)} of them cross three or more kinds — a purchase and a
          listening session and a ledger note turning out to be one afternoon. The
          words on each connector are the reason the engine gave, printed as it
          found it.
        </p>

        <hr className="k-rule-thin my-5" />

        <div className="space-y-4">
          <div>
            <Slug>Order</Slug>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {SORTS.map((s) => (
                <Chip
                  key={s.key}
                  label={s.label}
                  active={sort === s.key}
                  onClick={() => reset(() => setSort(s.key))}
                />
              ))}
            </div>
          </div>

          <div>
            <Slug>Narrow it</Slug>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Chip
                label="Crosses 3+ kinds"
                count={crossCount}
                active={crossOnly}
                accent
                onClick={() => reset(() => setCrossOnly((v) => !v))}
              />
              {KIND_ORDER.filter((k) => (kindCounts.get(k) ?? 0) > 0).map((k) => (
                <Chip
                  key={k}
                  label={`Has ${kindDef(k).plural.toLowerCase()}`}
                  count={kindCounts.get(k)}
                  active={mustHave === k}
                  onClick={() => reset(() => setMustHave((cur) => (cur === k ? null : k)))}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {visible.length === 0 ? (
        <EmptyState
          slug="Nothing matched"
          title="NO THREAD FITS BOTH OF THOSE"
          detail="Asking for three or more kinds and a specific kind at the same time can rule everything out. Drop one of the two."
          action={
            <button
              type="button"
              onClick={() =>
                reset(() => {
                  setCrossOnly(false);
                  setMustHave(null);
                })
              }
              className="k-btn k-btn-outline"
            >
              Clear the filters
            </button>
          }
        />
      ) : (
        <>
          <div className="space-y-6">
            {visible.map((t) => (
              <ThreadCard key={t.id} thread={t} />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {shown < threads.length ? (
              <>
                <button
                  type="button"
                  onClick={() => setShown((n) => n + PAGE_SIZE)}
                  className="k-btn k-btn-solid"
                >
                  Show {num(Math.min(PAGE_SIZE, threads.length - shown))} more
                </button>
                <span className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                  Showing {num(visible.length)} of {plural(threads.length, 'thread')}.
                </span>
              </>
            ) : (
              <span className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                That is all {plural(threads.length, 'thread')}.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
