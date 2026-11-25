import clsx from 'clsx';
import { text } from '@/lib/format';

/**
 * The printed slug that heads a block ("// THE ROLL"). The "// " is drawn by
 * .k-slug::before, so callers pass the words only — typing the slashes in
 * markup would double them.
 */
export function Slug({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element | null {
  // A slug built from a missing field would print "// undefined"; an absent slug
  // is an absent line instead.
  if (typeof children === 'string' && !text(children)) return null;
  return <span className={clsx('k-slug', className)}>{children}</span>;
}
