'use client';

import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { useOverlay } from '@/lib/OverlayContext';
import { LINK_INDEX, receiptById } from '@/lib/engine';
import { clip, dateLabel, inr, isNum, text, timeLabel } from '@/lib/format';
import { kindDef } from '@/lib/kinds';
import type { Receipt, Thread } from '@/lib/types';
import { KindIcon } from '@/components/receipt/KindIcon';

/**
 * A thread rendered as a chain — the one component that has to earn the brief's
 * central claim, that "a song, a location, a photo, a purchase and an event may
 * all be one moment".
 *
 * The important design decision is that **the reason sits on the connector**, not
 * in a caption underneath. A vertical stack of cards with a heading is a list, and
 * a list asks the reader to take the grouping on trust. Printing "shared: the
 * beatles" or "only minutes apart" *between* two receipts makes the relationship
 * the visible object and the receipts its endpoints. That is the difference
 * between showing connections and asserting them.
 *
 * The connector is a hard 2px rule with a square joint. No curve, no dash
 * animation, no arrow that pulses — the language draws structure, it does not
 * animate it.
 */

/** The stated reason two adjacent receipts in the chain belong together.
 *
 *  A thread's `links` are the whole cluster's edges, not a path, so the edge
 *  between two neighbours has to be looked up rather than read positionally.
 *  When two receipts sit next to each other in date order with no direct edge —
 *  which happens, because a cluster is connected without being a chain — the
 *  honest connector is the elapsed time, not a borrowed reason from elsewhere in
 *  the cluster. */
function connectorFor(a: Receipt, b: Receipt): string {
  const links = LINK_INDEX.get(a.id);
  const direct = links?.find((l) => l.a === b.id || l.b === b.id);
  if (direct) return direct.reason;

  const sameDay = a.at.slice(0, 10) === b.at.slice(0, 10);
  return sameDay ? 'the same day' : 'later in the thread';
}

function ChainNode({
  receipt,
  onOpen,
}: {
  receipt: Receipt;
  onOpen: (id: string) => void;
}): React.JSX.Element {
  const def = kindDef(receipt.kind);
  const timeUnknown = (receipt.tags ?? []).includes('time-unknown');
  const when = [dateLabel(receipt.at, ''), timeUnknown ? '' : timeLabel(receipt.at, '')]
    .filter(Boolean)
    .join(' · ');
  const detail = text(receipt.detail);

  return (
    <button
      type="button"
      onClick={() => onOpen(receipt.id)}
      className="k-receipt flex w-full min-w-0 flex-col items-start gap-2 p-3 text-left cursor-pointer lg:w-[196px]"
      aria-label={`Open ${def.label}: ${receipt.title}`}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <KindIcon kind={receipt.kind} size={12} />
        <span className="k-label truncate" style={{ color: 'var(--text-tertiary)' }}>
          {def.label}
        </span>
      </span>

      <span
        className="block w-full break-words"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 13,
          lineHeight: 1.35,
        }}
      >
        {clip(receipt.title, 56)}
      </span>

      {detail && (
        <span className="block w-full break-words text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {clip(detail, 40)}
        </span>
      )}

      <span className="mt-auto block w-full pt-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        {when || 'date unrecorded'}
      </span>

      {isNum(receipt.amount) && (
        <span className="k-figure nx-numeric text-[13px]">{inr(receipt.amount)}</span>
      )}
    </button>
  );
}

/** The printed reason, on a hard rule. Horizontal past `lg`, vertical below it,
 *  because a 360px screen cannot hold a row of chained cards and a rotated
 *  caption is not a solution. */
function Connector({ reason }: { reason: string }): React.JSX.Element {
  const label = text(reason) ?? 'connected';

  return (
    <div className="flex flex-none items-center gap-2 py-1 lg:w-[132px] lg:flex-col lg:py-0">
      {/* Mobile: a short vertical rule with the reason beside it. */}
      <span
        className="h-8 w-0 flex-none lg:hidden"
        style={{ borderLeft: '2px solid var(--k-edge-strong)' }}
        aria-hidden="true"
      />
      {/* Desktop: the rule runs across, with a square joint at each end. */}
      <span className="hidden w-full items-center lg:flex" aria-hidden="true">
        <span className="h-[7px] w-[7px] flex-none" style={{ background: 'var(--text-primary)' }} />
        <span className="h-0 flex-1" style={{ borderTop: '2px solid var(--k-edge-strong)' }} />
        <ArrowRight size={12} style={{ color: 'var(--text-primary)' }} />
      </span>
      <span
        className="min-w-0 break-words text-[11px] leading-snug lg:w-full lg:text-center"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </span>
    </div>
  );
}

export function ThreadChain({
  thread,
  limit,
}: {
  thread: Thread;
  /** Render only the first N receipts, with a printed note of what was held back.
   *  Never a silent truncation. */
  limit?: number;
}): React.JSX.Element {
  const { pushReceipt, openReceipt } = useOverlay();

  const receipts = useMemo(
    () =>
      thread.receiptIds
        .map((id) => receiptById(id))
        .filter((r): r is Receipt => Boolean(r))
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1)),
    [thread.receiptIds],
  );

  const shown = isNum(limit) ? receipts.slice(0, limit) : receipts;
  const held = receipts.length - shown.length;

  // The first node opens a fresh overlay; every node after it is reached by
  // reading along the chain, so it starts a trail the reader can walk back.
  const open = (id: string) => (id === shown[0]?.id ? openReceipt(id) : pushReceipt(id));

  if (shown.length === 0) {
    return (
      <p className="nx-support">
        This thread&rsquo;s receipts are not in the shipped archive.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-col items-stretch lg:flex-row lg:flex-wrap lg:items-stretch lg:gap-y-4">
        {shown.map((r, i) => (
          <div key={r.id} className="flex min-w-0 flex-col lg:flex-row lg:items-stretch">
            <ChainNode receipt={r} onOpen={open} />
            {i < shown.length - 1 && <Connector reason={connectorFor(r, shown[i + 1])} />}
          </div>
        ))}
      </div>

      {held > 0 && (
        <p className="nx-support mt-4">
          {held === 1
            ? 'One more receipt in this thread is not shown here.'
            : `${held} more receipts in this thread are not shown here.`}
        </p>
      )}
    </div>
  );
}
