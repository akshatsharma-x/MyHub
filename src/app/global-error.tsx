'use client';

import { useSyncExternalStore } from 'react';
import './globals.css';
import { bodyFont, displayFont, monoFont } from './fonts';
import { DEFAULT_THEME, resolveTheme } from '@/lib/theme';

const noSubscription = () => () => {};

/**
 * The root layout itself threw — the shell, a provider, the overlay. Nothing
 * from the layout survives, so this is a whole document: its own <html>, its own
 * stylesheet import, and its own theme, because the pre-paint script and the
 * ThemeProvider were part of what failed.
 *
 * As in error.tsx, the error's message is never printed. Without this file
 * Next's stock "Application error" screen would be the fallback here.
 */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}): React.JSX.Element {
  // resolveTheme reads app_theme and then the OS, the same rule the pre-paint
  // script follows; the server snapshot keeps hydration consistent.
  const theme = useSyncExternalStore(noSubscription, resolveTheme, () => DEFAULT_THEME);

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${bodyFont.variable} ${monoFont.variable} ${displayFont.variable}`}
    >
      <body>
        <title>Misprint — MyHUB</title>
        <main
          className="min-h-screen flex items-center justify-center px-5 py-10"
          style={{ background: 'var(--bg-base)' }}
        >
          <div className="k-paper k-panel-flat w-full max-w-xl px-6 py-12 sm:py-16 flex flex-col items-center text-center">
            <span className="k-slug">Misprint</span>
            <hr className="k-perf w-16 my-4" />
            <h1 className="k-display-sm max-w-[32ch]">THE ARCHIVE FAILED TO OPEN</h1>
            <p className="nx-support mt-3 max-w-[46ch]">
              Something in the frame around every page broke while it was being drawn. The archive
              itself is a fixed file and is not affected: trying again redraws it, and reloading starts
              from the cover.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => retry()} className="k-btn k-btn-amber">
                Try again
              </button>
              {/* A full reload, not a <Link>: a client navigation would re-render
                  the same root layout that just failed. A raw href gets no base
                  path from the router, so it is added here — on GitHub Pages "/"
                  is the account's root, not this site's. */}
              <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/`} className="k-btn k-btn-outline">
                Reload the archive
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
