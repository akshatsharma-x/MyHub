import { isNum, plural } from '@/lib/format';
import type { Provenance } from '@/lib/types';

/**
 * How much the archive actually knows about this moment, printed on the moment.
 *
 * The two readings are deliberately unequal. `observed` is a quiet ink stamp: the
 * row exists, there is nothing to declare. `reconstructed` is a struck amber
 * block with the basis count beside it, because a moment the engine inferred is
 * the one thing in this product a reader must never mistake for a record. The
 * wording avoids "provenance" and "derived" — it says what happened in words a
 * person uses.
 */
export function ReceiptStamp({
  provenance,
  basisCount,
}: {
  provenance: Provenance;
  basisCount?: number;
}): React.JSX.Element {
  const reconstructed = provenance === 'reconstructed';

  const gloss = reconstructed
    ? isNum(basisCount) && basisCount > 0
      ? `Inferred from ${plural(basisCount, 'receipt')}`
      : 'Inferred from receipts nearby'
    : 'Read from a source row';

  return (
    <span className="inline-flex items-baseline gap-2.5 flex-wrap min-w-0">
      <span
        className="k-stamp"
        style={
          reconstructed
            ? // Ink on amber whatever is underneath: the block brings its own
              // contrast, so this is the one colour pair that does not re-ink.
              { background: 'var(--amber)', color: 'var(--ink)' }
            : { color: 'var(--text-tertiary)' }
        }
      >
        {reconstructed ? 'Reconstructed' : 'Observed'}
      </span>
      <span className="text-[11px] min-w-0 break-words" style={{ color: 'var(--text-tertiary)' }}>
        {gloss}
      </span>
    </span>
  );
}
