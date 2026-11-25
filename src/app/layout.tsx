import type { Metadata } from "next";
import { Geist, Geist_Mono, Azeret_Mono } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/layout/Shell";
import { SOURCES } from "@/lib/archive";
import { num } from "@/lib/format";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";
import { ThemeProvider } from "@/lib/ThemeContext";
import { ExplorationProvider } from "@/lib/ExplorationContext";
import { OverlayProvider } from "@/lib/OverlayContext";
import { ReceiptOverlay } from "@/components/receipt/ReceiptOverlay";

const bodyFont = Geist({ variable: "--font-body", subsets: ["latin"] });
const monoFont = Geist_Mono({ variable: "--font-body-mono", subsets: ["latin"] });
// Display face for slugs, headlines, labels and figures. A heavy geometric mono
// is what makes a headline read as printed matter rather than a marketing hero;
// body copy stays sans, which is more readable at paragraph length.
const displayFont = Azeret_Mono({ variable: "--font-display-mono", subsets: ["latin"] });

// The description states two figures, and they were typed in by hand: it claimed
// 11,878 transactions while /story, computing from the same ETL output, printed
// 12,728. Read from the source ledgers instead. The music export is the one that
// feeds `music`; every other file is a ledger of money, which is exactly the
// split the story engine makes when it sums its own `moneyRows`.
const playRows = SOURCES.filter((s) => s.feeds.includes("music")).reduce((n, s) => n + s.rows, 0);
const moneyRows = SOURCES.filter((s) => !s.feeds.includes("music")).reduce((n, s) => n + s.rows, 0);

export const metadata: Metadata = {
  // The archive itself keeps the full title; every other route names itself in
  // its own metadata (see src/lib/routes.ts) and the template adds the product.
  title: {
    default: "MyHUB — Your Life, In Receipts",
    template: "%s — MyHUB",
  },
  description:
    `Ten years of one person's digital exhaust — ${num(playRows)} plays, ` +
    `${num(moneyRows)} transactions — read as receipts, threads and chapters.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The theme is client state — localStorage, or the OS preference — so the
    // server emits the default and the script in <head> corrects the attribute
    // during parsing, before the first paint. suppressHydrationWarning covers
    // exactly that: React finds an attribute on <html> that its own render did
    // not produce and must keep the DOM's. Without it React treats the
    // difference as an error and re-renders from the nearest boundary, which
    // both flashes and throws away the correction.
    //
    // data-scroll-behavior opts back into the router's scroll override. The CSS
    // sets `scroll-behavior: smooth` on <html> for in-page anchors; as of
    // Next 16 the router no longer neutralises that during a route change, so
    // without this attribute every navigation *animates* its scroll to the top
    // instead of landing there. The smooth scroll we want is within a page,
    // never between two.
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${bodyFont.variable} ${monoFont.variable} ${displayFont.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <ExplorationProvider>
            {/* The overlay provider wraps the Shell so a receipt can be opened
                from the chrome as well as from a page, and the overlay itself is
                a sibling of the Shell rather than a child: it has to sit above
                the rail and the topbar, and nesting it inside the main column
                would trap it under both. */}
            <OverlayProvider>
              <Shell>{children}</Shell>
              <ReceiptOverlay />
            </OverlayProvider>
          </ExplorationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
