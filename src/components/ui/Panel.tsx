import clsx from 'clsx';
import { text } from '@/lib/format';
import { Slug } from './Slug';

/**
 * A sheet of cream stock on the dark room — the default container for anything
 * that is not a receipt.
 *
 * It carries .k-paper itself, which re-declares the colour tokens for the whole
 * subtree, so children never branch on the surface or the theme. Nesting a Panel
 * inside a Panel is therefore a colour no-op and reads as a rule-bounded section
 * rather than a second sheet; use `flat` there to drop the offset block.
 */
export function Panel({
  slug,
  title,
  action,
  children,
  flat = false,
  className,
}: {
  slug?: string;
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  flat?: boolean;
  className?: string;
}): React.JSX.Element {
  const slugText = text(slug);
  const titleText = text(title);
  const hasHeader = Boolean(slugText || titleText || action);

  return (
    <section className={clsx('k-paper', flat ? 'k-panel-flat' : 'k-panel', className)}>
      {hasHeader && (
        <>
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
            <div className="min-w-0">
              {slugText && <Slug>{slugText}</Slug>}
              {titleText && (
                <h2 className={clsx('k-display-sm break-words', slugText && 'mt-2')}>
                  {titleText}
                </h2>
              )}
            </div>
            {action && <div className="flex-none flex items-center gap-2">{action}</div>}
          </div>
          <hr className="k-rule-hard" />
        </>
      )}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}
