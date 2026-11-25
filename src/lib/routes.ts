import type { Metadata } from 'next';

/**
 * Every route's name. The topbar prints it as the page heading and each route's
 * layout prints it as the document <title>, so the two cannot drift apart.
 *
 * The title used to live only in the topbar, and every route shipped the same
 * <title> — so tabs, history and bookmarks could not tell the eight pages
 * apart, and neither could the router's announcer, which reads document.title
 * to tell a screen-reader user where a navigation landed.
 */
export const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'The Archive', subtitle: 'Ten years, three datasets' },
  '/roll': { title: 'The Roll', subtitle: 'Every receipt, searchable' },
  '/threads': { title: 'Threads', subtitle: 'Receipts that belong together' },
  '/constellation': { title: 'Constellation', subtitle: 'The archive as a network' },
  '/chapters': { title: 'Chapters', subtitle: 'Who you were, era by era' },
  '/rhythms': { title: 'Rhythms', subtitle: 'The patterns underneath' },
  '/story': { title: 'Story', subtitle: 'What it all adds up to' },
  '/sources': { title: 'Sources', subtitle: 'What the data does and does not know' },
};

/** A route layout's metadata. The root layout's title template appends the
 *  product name, so this is "The Roll" and the tab reads "The Roll — MyHUB". */
export function routeMetadata(path: string): Metadata {
  const page = PAGE_TITLES[path];
  return page ? { title: page.title } : {};
}
