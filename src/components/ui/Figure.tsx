import clsx from 'clsx';
import { text } from '@/lib/format';

/**
 * One number and what it counts. The value arrives already formatted — every
 * caller runs it through src/lib/format first — so this component's only jobs
 * are the setting and the pairing.
 */
const VALUE_SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-[15px]',
  md: 'text-[22px]',
  lg: 'text-[32px] sm:text-[40px]',
};

export function Figure({
  value,
  label,
  accent = false,
  size = 'md',
}: {
  value: string;
  label: string;
  accent?: boolean;
  size?: 'sm' | 'md' | 'lg';
}): React.JSX.Element {
  const v = text(value) ?? '—';
  const l = text(label);

  return (
    <div
      className={clsx('min-w-0', accent && 'pl-3')}
      // Emphasis is a printed amber rule down the left edge, never coloured
      // type: the figure itself stays at full ink so the number is the loudest
      // thing here with or without the accent.
      style={accent ? { borderLeft: '3px solid var(--amber)' } : undefined}
    >
      <div className={clsx('k-figure nx-numeric leading-none break-words', VALUE_SIZE[size])}>
        {v}
      </div>
      {l && <div className="k-label mt-1.5 break-words">{l}</div>}
    </div>
  );
}
