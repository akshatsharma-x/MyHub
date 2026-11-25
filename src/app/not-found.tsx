import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Not found' };

/**
 * Any URL the archive has no page for. It renders inside the shell, so the rail
 * and topbar stay put and every real page is still one click away.
 *
 * Without this file Next printed its stock "404 | This page could not be found"
 * in the system sans with a hairline divider — the one screen in the app set in
 * a different language. A server component on purpose: Next sends the root
 * not-found with every route, so anything interactive here would ship on every
 * page.
 */
export default function NotFound(): React.JSX.Element {
  return (
    <EmptyState
      slug="Not on file"
      title="NOTHING WAS FILED UNDER THIS ADDRESS"
      detail="The archive has eight pages and they are all in the rail. Every receipt it holds is on the roll."
      action={
        <>
          <Link href="/" className="k-btn k-btn-amber">
            Back to the archive
          </Link>
          <Link href="/roll" className="k-btn k-btn-outline">
            Search the roll
          </Link>
        </>
      }
    />
  );
}
