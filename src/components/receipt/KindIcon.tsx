import clsx from 'clsx';
import { kindDef } from '@/lib/kinds';
import type { ReceiptKind } from '@/lib/types';

/**
 * The kind mark: a square rule in the kind's colour with the glyph at full ink.
 *
 * The colour is spent on the rule rather than on a fill or on the glyph itself
 * because this mark has to survive four surfaces — dark room, cream sheet, cream
 * receipt in the dark theme, cream room in the light theme — and the categorical
 * ramp is re-cut per surface for *ink* use. A filled block would be light-on-
 * light in at least one of them; a 2px rule carries no contrast burden and still
 * codes the kind. Remove the colour and the square still reads.
 */
export function KindIcon({
  kind,
  size = 14,
  className,
}: {
  kind: ReceiptKind;
  size?: number;
  className?: string;
}): React.JSX.Element {
  const def = kindDef(kind);
  const Icon = def.icon;
  const box = size + 12;

  return (
    <span
      role="img"
      aria-label={def.label}
      className={clsx('inline-flex items-center justify-center flex-none', className)}
      style={{
        width: box,
        height: box,
        border: `2px solid ${def.color}`,
        color: 'var(--text-primary)',
      }}
    >
      <Icon size={size} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}
