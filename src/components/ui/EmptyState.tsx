import { text } from '@/lib/format';
import { Slug } from './Slug';

/**
 * Nothing to print. Set as a blank slip rather than a shrug: the perforation
 * rules are there so the emptiness reads as part of the same printed language,
 * and the sentence says what would have appeared here.
 */
export function EmptyState({
  slug,
  title,
  detail,
  action,
}: {
  slug?: string;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}): React.JSX.Element {
  const slugText = text(slug);
  const titleText = text(title) ?? 'Nothing here';
  const detailText = text(detail);

  return (
    <div className="k-paper k-panel-flat px-6 py-12 sm:py-16 flex flex-col items-center text-center">
      {slugText && <Slug>{slugText}</Slug>}
      <hr className="k-perf w-16 my-4" />
      <h3 className="k-display-sm break-words max-w-[32ch]">{titleText}</h3>
      {detailText && <p className="nx-support mt-3 max-w-[46ch] break-words">{detailText}</p>}
      {action && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{action}</div>}
    </div>
  );
}
