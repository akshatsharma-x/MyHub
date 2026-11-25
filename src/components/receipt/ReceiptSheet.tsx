'use client';

import { motion } from 'framer-motion';
import { clip, dateLabel, inr, isNum, plural, text, timeLabel } from '@/lib/format';
import { kindDef } from '@/lib/kinds';
import type { Receipt, SourceId } from '@/lib/types';
import { Slug } from '@/components/ui/Slug';
import { KindIcon } from './KindIcon';
import { ReceiptStamp } from './ReceiptStamp';
import { printedLines } from './ReceiptCard';

/**
 * The same slip, printed at full height: every line item, every tag, the join
 * keys, and — where the receipt is an inference — the evidence it rests on.
 *
 * One rule applies to everything nested in here: a .k-receipt re-inks its type
 * and its rules but NOT the --bg-* surfaces, because a receipt is cream on every
 * surface and in both themes while --bg-surface is still whatever the room is.
 * So an inset inside a receipt paints with --paper-well (or .k-well) and never
 * with a bg-* utility, which would drop a dark panel onto cream stock.
 */
const SOURCE_LABEL: Record<SourceId, string> = {
  spotify: 'the streaming history',
  household: 'the household ledger',
  cards: 'the card ledger',
};

function Rule({ dotted = false }: { dotted?: boolean }) {
  return <div className={dotted ? 'k-perf my-4' : 'k-rule-hard my-4'} aria-hidden="true" />;
}

function Token({ children }: { children: React.ReactNode }) {
  return (
    <span className="k-label px-1.5 py-0.5" style={{ border: '1px solid var(--border-default)' }}>
      {children}
    </span>
  );
}

function RelatedRow({
  receipt,
  reason,
  onOpen,
}: {
  receipt: Receipt;
  reason: string;
  onOpen?: (id: string) => void;
}) {
  const reasonText = text(reason);
  const body = (
    <>
      <KindIcon kind={receipt.kind} size={12} />
      <span className="min-w-0 flex-1">
        <span
          className="block break-words whitespace-pre-wrap"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, lineHeight: 1.35 }}
        >
          {clip(receipt.title, 72)}
        </span>
        {reasonText && (
          <span className="block k-label mt-1 break-words">{clip(reasonText, 72)}</span>
        )}
      </span>
      <span className="k-label nx-numeric flex-none">{dateLabel(receipt.at)}</span>
    </>
  );

  if (!onOpen) {
    return <div className="flex items-start gap-3 py-3">{body}</div>;
  }

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(receipt.id)}
      className="w-full text-left flex items-start gap-3 py-3 px-1.5 cursor-pointer focus-visible:outline-[color:var(--ink)]"
      style={{ background: 'var(--frame-hover-off)' }}
      whileHover={{ background: 'var(--paper-well)' }}
      transition={{ duration: 0.12 }}
    >
      {body}
    </motion.button>
  );
}

export function ReceiptSheet({
  receipt,
  related,
  onOpen,
}: {
  receipt: Receipt;
  related?: Array<{ receipt: Receipt; reason: string }>;
  onOpen?: (id: string) => void;
}): React.JSX.Element {
  const def = kindDef(receipt.kind);
  const tags = receipt.tags ?? [];
  const entities = receipt.entities ?? [];
  const basis = receipt.basis ?? [];
  const lines = printedLines(receipt);

  const timeUnknown = tags.includes('time-unknown');
  const flagged = tags.includes('flagged');
  // Omitted rather than dashed when the timestamp will not parse — see the same
  // rule in ReceiptCard.
  const when = [dateLabel(receipt.at, ''), timeUnknown ? '' : timeLabel(receipt.at, '')]
    .filter(Boolean)
    .join(' · ');
  const title = clip(receipt.title, 160);
  const detail = text(receipt.detail);
  const body = text(receipt.body);
  const amount = isNum(receipt.amount) ? inr(receipt.amount) : undefined;
  const id = text(receipt.id)?.toUpperCase();
  const reconstructed = receipt.provenance === 'reconstructed';
  const rows = (related ?? []).filter(r => text(r.receipt.title));

  return (
    <article className="k-receipt w-full min-w-0 p-5 sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <KindIcon kind={receipt.kind} size={18} />
          <div className="min-w-0">
            <div className="k-label">{def.label}</div>
            <div className="text-[11px] mt-0.5 break-words" style={{ color: 'var(--text-tertiary)' }}>
              {def.gloss}
            </div>
          </div>
        </div>
        {id && <span className="k-label nx-numeric flex-none">{id}</span>}
      </div>

      <Rule dotted />

      {when && (
        <div className="k-figure nx-numeric text-[14px]" style={{ letterSpacing: '0.06em' }}>
          {when}
        </div>
      )}
      {timeUnknown && (
        <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
          The source row carried a date but no clock, so this slip declines to print an hour.
        </div>
      )}

      {title && (
        // pre-wrap: the ledger's spacing is part of the record.
        <h2
          className="mt-2 break-words whitespace-pre-wrap"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'clamp(1.0625rem, 0.95rem + 0.9vw, 1.375rem)',
            lineHeight: 1.22,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h2>
      )}

      {detail && (
        <p className="text-[13px] mt-2 break-words" style={{ color: 'var(--text-secondary)' }}>
          {clip(detail, 160)}
        </p>
      )}

      {body && (
        // Verbatim, spacing included: "Half lit  milk" keeps its double space
        // because the ledger's own hand is the best texture in the archive.
        <div
          className="k-well text-[13px] leading-relaxed mt-4 px-3.5 py-3 whitespace-pre-wrap break-words"
          style={{ color: 'var(--text-secondary)' }}
        >
          {body}
        </div>
      )}

      {lines.length > 0 && (
        <>
          <Rule dotted />
          <div className="space-y-1.5">
            {lines.map((l, i) => (
              <div className="k-line" key={`${l.label}-${i}`}>
                <span className="k-label">{clip(l.label, 24)}</span>
                <span className="k-line-leader" aria-hidden="true" />
                <span className="text-right break-words max-w-[60%]" style={{ color: 'var(--text-primary)' }}>
                  {clip(l.value, 56)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {amount && (
        <>
          <Rule />
          <div className="flex items-baseline justify-between gap-3">
            <span className="k-label">Amount</span>
            <span className="k-figure nx-numeric text-[26px] break-words text-right">{amount}</span>
          </div>
        </>
      )}

      {flagged && (
        <div className="k-well mt-4 px-3.5 py-3 flex items-start gap-3">
          <span
            className="k-stamp flex-none"
            style={{ background: 'var(--ink)', color: 'var(--paper-raised)', transform: 'rotate(2deg)' }}
          >
            Flagged
          </span>
          <p className="text-[12px] min-w-0 break-words" style={{ color: 'var(--text-secondary)' }}>
            The card ledger marked this charge as suspected fraud. It is printed here exactly as the
            source recorded it — the flag is the source&apos;s claim, not the archive&apos;s.
          </p>
        </div>
      )}

      {tags.length > 0 && (
        <>
          <Rule dotted />
          <Slug>Tags</Slug>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {tags.map(t => (
              <Token key={t}>{clip(t, 24)}</Token>
            ))}
          </div>
        </>
      )}

      {entities.length > 0 && (
        <>
          <Rule dotted />
          <Slug>Join keys</Slug>
          <p className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
            {plural(entities.length, 'key')} — these are what this receipt is matched on when the
            archive looks for connections.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {entities.slice(0, 18).map(e => (
              <Token key={e}>{clip(e, 28)}</Token>
            ))}
          </div>
        </>
      )}

      {/* Provenance is the last thing on the slip and the loudest, because a
          reader who takes an inferred moment for a recorded one has been
          misled by this product rather than by the data. */}
      <Rule />
      <div className={reconstructed ? 'k-well px-3.5 py-3' : undefined}>
        <ReceiptStamp provenance={receipt.provenance} basisCount={basis.length} />
        <p className="text-[12px] mt-2.5 break-words" style={{ color: 'var(--text-secondary)' }}>
          {reconstructed
            ? 'No row in any dataset describes this moment. The archive inferred it from the observed receipts below — so read it as a reading, and check the evidence.'
            : `Every field on this slip traces to a single row in ${SOURCE_LABEL[receipt.source] ?? 'a source dataset'}. Nothing here was inferred.`}
        </p>

        {reconstructed && basis.length > 0 && (
          <div className="mt-3">
            <Slug>Built from</Slug>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {basis.map(b =>
                onOpen ? (
                  <motion.button
                    key={b}
                    type="button"
                    onClick={() => onOpen(b)}
                    className="k-label nx-numeric px-2 py-1 cursor-pointer focus-visible:outline-[color:var(--ink)]"
                    style={{ border: '1px solid var(--border-strong)', background: 'var(--frame-hover-off)' }}
                    whileHover={{ background: 'var(--amber)', color: 'var(--ink)' }}
                    transition={{ duration: 0.12 }}
                    aria-label={`Open receipt ${b.toUpperCase()}`}
                  >
                    {b.toUpperCase()}
                  </motion.button>
                ) : (
                  <Token key={b}>{b.toUpperCase()}</Token>
                ),
              )}
            </div>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <section className="mt-6">
          <Slug>Also in this moment</Slug>
          <p className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
            {plural(rows.length, 'receipt')} the archive connected to this one, and why.
          </p>
          <div className="k-rule-hard mt-3" aria-hidden="true" />
          <div>
            {rows.map((r, i) => (
              <div key={r.receipt.id}>
                {i > 0 && <div className="k-rule-thin" aria-hidden="true" />}
                <RelatedRow receipt={r.receipt} reason={r.reason} onOpen={onOpen} />
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
