'use client';

import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
import { isNum, num, text } from '@/lib/format';

/**
 * A square filter token — never a pill. Selection is an inversion, not a tint:
 * the chip fills with ink and prints in stock, which survives both themes and
 * the loss of every accent colour.
 */
export function Chip({
  label,
  count,
  active = false,
  onClick,
  accent = false,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  accent?: boolean;
}): React.JSX.Element {
  const prefersReducedMotion = useReducedMotion();
  const labelText = text(label) ?? '—';

  const body = (
    <>
      <span className="k-label" style={{ color: 'inherit' }}>
        {labelText}
      </span>
      {isNum(count) && (
        <span
          className="k-figure text-[11px] nx-numeric pl-2"
          style={{
            color: 'inherit',
            borderLeft: '1px solid currentColor',
            // The rule between word and figure is the divider; at full ink it
            // would read as a second border on the chip.
            opacity: 0.85,
          }}
        >
          {num(count, '0')}
        </span>
      )}
    </>
  );

  const shape = 'inline-flex items-center gap-2 px-2.5 py-1.5 max-w-full min-w-0';

  if (!onClick) {
    return (
      <span
        className={clsx(shape, 'border-2')}
        style={{
          borderColor: 'var(--k-edge)',
          color: 'var(--text-secondary)',
          ...(accent ? { borderLeft: '4px solid var(--amber)' } : null),
        }}
      >
        {body}
      </span>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(shape, 'border-2 cursor-pointer text-left')}
      style={{
        background: active
          ? accent
            ? 'var(--amber)'
            : 'var(--text-primary)'
          : 'var(--frame-hover-off)',
        color: active ? (accent ? 'var(--ink)' : 'var(--bg-base)') : 'var(--text-secondary)',
        borderColor: 'var(--k-edge)',
        ...(accent && !active ? { borderLeft: '4px solid var(--amber)' } : null),
      }}
      whileHover={
        active
          ? undefined
          : { background: 'var(--frame-hover)', color: 'var(--text-primary)', borderColor: 'var(--k-edge-strong)' }
      }
      whileTap={prefersReducedMotion ? undefined : { x: 1, y: 1 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.12 }}
    >
      {body}
    </motion.button>
  );
}
