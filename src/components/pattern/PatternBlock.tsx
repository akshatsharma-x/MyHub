'use client';

import { useOverlay } from '@/lib/OverlayContext';
import { receiptById } from '@/lib/engine';
import { clip, dateLabel, text } from '@/lib/format';
import type { Pattern, Receipt } from '@/lib/types';
import { KindIcon } from '@/components/receipt/KindIcon';

/**
 * A mined pattern, printed as figure + explanation + proof.
 *
 * All three, always. A figure alone is a statistic and belongs on the KPI
 * dashboard this design language forbids; a figure with a sentence is a claim; a
 * figure with a sentence and openable receipts is a finding the reader can audit.
 * The evidence row is the part that makes this page an argument rather than a
 * summary, so `evidence` is not optional in the layout — a pattern with nothing
 * to show prints the reason it has nothing instead of hiding the absence.
 */
export function PatternBlock({
  pattern,
  compact = false,
}: {
  pattern: Pattern;
  /** The front page shows three of these beside each other and has less room for
   *  proof, so it prints fewer evidence slips — never none. */
  compact?: boolean;
}): React.JSX.Element {
  const { openReceipt } = useOverlay();

  const evidence = pattern.evidence
    .map((id) => receiptById(id))
    .filter((r): r is Receipt => Boolean(r))
    .slice(0, compact ? 3 : 8);

  const figure = text(pattern.figure) ?? '—';
  const figureLabel = text(pattern.figureLabel);
  const detail = text(pattern.detail);

  return (
    <article className="k-paper k-panel-flat flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-baseline gap-3" style={{ borderLeft: '3px solid var(--amber)', paddingLeft: 12 }}>
        <span className="k-figure nx-numeric break-words text-[28px] leading-none sm:text-[34px]">
          {figure}
        </span>
      </div>
      {figureLabel && <p className="k-label mt-2 break-words">{figureLabel}</p>}

      <h3 className="k-display-sm mt-4 break-words">{pattern.title}</h3>
      {detail && <p className="nx-support mt-3 break-words">{detail}</p>}

      <div className="mt-auto pt-5">
        <hr className="k-rule-thin" />
        <p className="k-label mt-3">
          {evidence.length > 0 ? 'The receipts this rests on' : 'Nothing to open'}
        </p>

        {evidence.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {evidence.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openReceipt(r.id)}
                className="k-receipt flex min-w-0 max-w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left"
                aria-label={`Open receipt: ${r.title}`}
              >
                <KindIcon kind={r.kind} size={11} />
                <span className="min-w-0">
                  <span
                    className="block truncate"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      fontSize: 12,
                      maxWidth: '18ch',
                    }}
                  >
                    {clip(r.title, 28)}
                  </span>
                  <span className="block text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {dateLabel(r.at, 'date unrecorded')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="nx-support mt-2">
            This pattern was measured across the whole export rather than from
            individual receipts, so there is no single slip to open.
          </p>
        )}
      </div>
    </article>
  );
}
