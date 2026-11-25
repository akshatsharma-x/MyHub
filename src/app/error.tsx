'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * A page threw while rendering. The rail and topbar survive — this boundary sits
 * inside the root layout — so only the canvas is replaced.
 *
 * The error's message is deliberately never printed. In production a client
 * error reaches this component with its original text, and a raw exception in
 * the UI is the one thing this design rules out by name. Without this file Next
 * showed its stock "Application error: a client-side exception has occurred".
 * The reader gets what happened and two ways on; the browser console keeps the
 * detail, which Next logs there itself.
 */
export default function RouteError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}): React.JSX.Element {
  return (
    <EmptyState
      level={2}
      slug="Misprint"
      title="THIS PAGE FAILED TO PRINT"
      detail="Something in this view broke while it was being drawn. The archive itself is a fixed file and is not affected: trying again redraws the page, and every other page is still in the rail."
      action={
        <>
          <button type="button" onClick={() => retry()} className="k-btn k-btn-amber">
            Try again
          </button>
          <Link href="/" className="k-btn k-btn-outline">
            Back to the archive
          </Link>
        </>
      }
    />
  );
}
