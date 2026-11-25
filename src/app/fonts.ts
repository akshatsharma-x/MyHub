import { Geist, Geist_Mono, Azeret_Mono } from 'next/font/google';

// Loaded once, here, and imported by both documents this app can render: the
// root layout, and global-error, which replaces the root layout when it fails.
// global-error used to get none of these variables, and an undefined var() with
// no fallback invalidates the whole --font-display stack rather than falling
// through it — so its headline was set in Times.
export const bodyFont = Geist({ variable: '--font-body', subsets: ['latin'] });
export const monoFont = Geist_Mono({ variable: '--font-body-mono', subsets: ['latin'] });
// Display face for slugs, headlines, labels and figures. A heavy geometric mono
// is what makes a headline read as printed matter rather than a marketing hero;
// body copy stays sans, which is more readable at paragraph length.
export const displayFont = Azeret_Mono({ variable: '--font-display-mono', subsets: ['latin'] });
