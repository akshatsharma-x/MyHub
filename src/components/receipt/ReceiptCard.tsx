'use client';

import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
import { Link2 } from 'lucide-react';
import { clip, dateLabel, inr, isNum, plural, text, timeLabel } from '@/lib/format';
import { kindDef } from '@/lib/kinds';
import type { Receipt, ReceiptLine } from '@/lib/types';
import { KindIcon } from './KindIcon';
import { ReceiptStamp } from './ReceiptStamp';

/**
 * A receipt as the printed slip it is. This is the product's one domain object,
 * so the slip is the same artefact everywhere it appears: the roll, a thread, a
 * chapter, the story.
 *
 * Depth is drawn, so hover is a printed change rather than a movement — the edge
 * gains a hard 2px amber rule and the offset block grows two pixels. Both ends of
 * that animation are declared here as complete shadow values with the same number
 * of layers, because Motion interpolates the layers pairwise and a rest state of
 * one layer would snap instead of tween. The zero-alpha first layer uses
 * --frame-hover-off for the same reason the rail does: `transparent` is a keyword
 * with no channels to interpolate.
 */
const REST_DEPTH = '0 0 0 0 var(--frame-hover-off), 4px 4px 0 0 var(--ink)';
const HOVER_DEPTH = '0 0 0 2px var(--amber), 6px 6px 0 0 var(--ink)';

function labelled(line: ReceiptLine, label: string): boolean {
  return (text(line.label) ?? '').toLowerCase() === label;
}

/**
 * The line items this receipt can actually print, in print order.
 *
 * Exported because ReceiptSheet prints the same slip at full height and the two
 * must never disagree about what a receipt contains. Three rules live here:
 * a line missing either half is dropped rather than printed with a leader running
 * to nothing; the AMOUNT line is dropped when the receipt has an `amount`, which
 * is set as its own total row; and `place` / `city` are promoted to line items
 * only when the ETL did not already emit them (the card ledger prints CITY, the
 * household ledger never does).
 */
export function printedLines(receipt: Receipt): ReceiptLine[] {
  const lines = (receipt.lines ?? []).filter(l => text(l.label) && text(l.value));
  const kept = isNum(receipt.amount) ? lines.filter(l => !labelled(l, 'amount')) : lines;
  const extra: ReceiptLine[] = [];

  const place = text(receipt.place);
  if (place && !kept.some(l => labelled(l, 'place') || labelled(l, 'route'))) {
    extra.push({ label: 'Place', value: place });
  }

  // City only. The card ledger's state column is scrambled and is not shipped,
  // so there is no second half to this line.
  const where = text(receipt.city);
  if (where && !kept.some(l => labelled(l, 'city'))) {
    extra.push({ label: 'City', value: where });
  }

  return [...kept, ...extra];
}

function LineItems({ lines, dense }: { lines: ReceiptLine[]; dense: boolean }) {
  return (
    <div className="space-y-1">
      {lines.map((l, i) => (
        <div className="k-line" key={`${l.label}-${i}`}>
          <span className="k-label">{clip(l.label, 22)}</span>
          <span className="k-line-leader" aria-hidden="true" />
          {/* Capped and wrapped rather than shrunk: a 30-character merchant name
              must fold onto a second line, never set a minimum width that forces
              the slip to scroll sideways at 360px. */}
          <span
            className="text-right break-words max-w-[58%]"
            style={{ color: 'var(--text-primary)' }}
          >
            {clip(l.value, dense ? 26 : 40)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ReceiptCard({
  receipt,
  onOpen,
  linkCount,
  seen = false,
  dense = false,
  className,
}: {
  receipt: Receipt;
  onOpen?: (id: string) => void;
  linkCount?: number;
  seen?: boolean;
  dense?: boolean;
  className?: string;
}): React.JSX.Element {
  const prefersReducedMotion = useReducedMotion();
  const def = kindDef(receipt.kind);
  const tags = receipt.tags ?? [];

  const lines = printedLines(receipt);
  const shown = dense ? lines.slice(0, 3) : lines;
  const withheld = lines.length - shown.length;

  // The household ledger has no clock on many rows. The ETL writes T12:00 and
  // tags them, so the slip says so rather than printing an invented noon.
  const timeUnknown = tags.includes('time-unknown');
  const flagged = tags.includes('flagged');
  // An unparseable timestamp prints nothing rather than "— · —": a dash pair is a
  // blank line wearing punctuation, and the rule is to omit, not to pad.
  const when = [dateLabel(receipt.at, ''), timeUnknown ? '' : timeLabel(receipt.at, '')]
    .filter(Boolean)
    .join(' · ');
  const title = clip(receipt.title, dense ? 56 : 96);
  const detail = text(receipt.detail);
  const body = dense ? undefined : text(receipt.body);
  const amount = isNum(receipt.amount) ? inr(receipt.amount) : undefined;
  const id = text(receipt.id)?.toUpperCase();
  const descriptors = tags
    .filter(t => t !== 'time-unknown' && t !== 'flagged')
    .slice(0, dense ? 2 : 4);

  const content = (
    <>
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <KindIcon kind={receipt.kind} size={dense ? 12 : 14} />
          <span className="k-label truncate">{def.label}</span>
        </div>
        {id && <span className="k-label nx-numeric flex-none">{id}</span>}
      </div>

      <div className="k-perf my-3" aria-hidden="true" />

      {when && (
        <div className="k-figure nx-numeric text-[12px]" style={{ letterSpacing: '0.06em' }}>
          {when}
        </div>
      )}
      {timeUnknown && (
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          Time not recorded
        </div>
      )}

      {title && (
        // pre-wrap because the household ledger's own spacing is evidence:
        // "Half lit  milk" has two spaces in the source and keeps them here.
        <div
          className="mt-1.5 break-words whitespace-pre-wrap"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: dense ? 13 : 15,
            lineHeight: 1.3,
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </div>
      )}

      {detail && (
        <div className="text-[12px] mt-1 break-words" style={{ color: 'var(--text-secondary)' }}>
          {clip(detail, dense ? 44 : 72)}
        </div>
      )}

      {body && (
        // The ledger's own words, spacing included — "Half lit  milk" keeps its
        // double space, which is why this is pre-wrap and not a tidied string.
        <div
          className="k-well text-[12px] mt-2.5 px-3 py-2 whitespace-pre-wrap break-words"
          style={{ color: 'var(--text-secondary)' }}
        >
          {clip(body, 160)}
        </div>
      )}

      {shown.length > 0 && (
        <>
          <div className="k-perf my-3" aria-hidden="true" />
          <LineItems lines={shown} dense={dense} />
          {withheld > 0 && (
            <div className="k-label mt-1.5">{plural(withheld, 'more line')}</div>
          )}
        </>
      )}

      {amount && (
        <>
          <div className="k-rule-hard mt-3 mb-2" aria-hidden="true" />
          <div className="flex items-baseline justify-between gap-3">
            <span className="k-label">Amount</span>
            <span
              className="k-figure nx-numeric break-words text-right"
              style={{ fontSize: dense ? 16 : 20 }}
            >
              {amount}
            </span>
          </div>
        </>
      )}

      {descriptors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {descriptors.map(t => (
            <span
              key={t}
              className="k-label px-1.5 py-0.5"
              style={{ border: '1px solid var(--border-default)' }}
            >
              {clip(t, 18)}
            </span>
          ))}
        </div>
      )}

      <div className="k-perf my-3" aria-hidden="true" />

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <ReceiptStamp provenance={receipt.provenance} basisCount={receipt.basis?.length} />
        {(flagged || (isNum(linkCount) && linkCount > 0)) && (
          <div className="flex items-center gap-2 flex-none">
            {flagged && (
              // The card ledger's own fraud flag, kept rather than hidden. Solid
              // ink, counter-rotated against the provenance stamp so the two read
              // as two separate strikes.
              <span
                className="k-stamp"
                style={{
                  background: 'var(--ink)',
                  color: 'var(--paper-raised)',
                  transform: 'rotate(2deg)',
                }}
              >
                Flagged
              </span>
            )}
            {isNum(linkCount) && linkCount > 0 && (
              <span className="k-label inline-flex items-center gap-1">
                <Link2 size={11} aria-hidden="true" />
                {plural(linkCount, 'link')}
              </span>
            )}
          </div>
        )}
      </div>

      {seen && (
        <div className="k-label inline-flex items-center gap-1.5 mt-2.5">
          <span
            aria-hidden="true"
            className="inline-block"
            style={{ width: 6, height: 6, background: 'var(--text-primary)' }}
          />
          Opened
        </div>
      )}
    </>
  );

  const shell = clsx(
    'k-receipt min-w-0 w-full',
    dense ? 'p-3.5' : 'p-4 sm:p-5',
    'focus-visible:outline-[color:var(--ink)]',
    className,
  );

  if (!onOpen) {
    return (
      <article className={shell} style={{ boxShadow: REST_DEPTH }}>
        {content}
      </article>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(receipt.id)}
      className={clsx(shell, 'text-left cursor-pointer')}
      style={{ boxShadow: REST_DEPTH }}
      whileHover={{ boxShadow: HOVER_DEPTH }}
      // The press puts the sheet down onto its own offset block, which is how
      // every other control in this language behaves.
      whileTap={prefersReducedMotion ? undefined : { x: 2, y: 2 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.12 }}
    >
      {content}
    </motion.button>
  );
}
