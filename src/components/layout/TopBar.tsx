'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { ARCHIVE } from '@/lib/archive';
import { num } from '@/lib/format';
import { useSidebar } from './SidebarContext';
import { MobileMenuButton } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';

const SIDEBAR_EXPANDED = 220;
const SIDEBAR_COLLAPSED = 60;

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'The Archive', subtitle: 'Ten years, three datasets' },
  '/roll': { title: 'The Roll', subtitle: 'Every receipt, searchable' },
  '/threads': { title: 'Threads', subtitle: 'Receipts that belong together' },
  '/constellation': { title: 'Constellation', subtitle: 'The archive as a network' },
  '/chapters': { title: 'Chapters', subtitle: 'Who you were, era by era' },
  '/rhythms': { title: 'Rhythms', subtitle: 'The patterns underneath' },
  '/story': { title: 'Story', subtitle: 'What it all adds up to' },
  '/sources': { title: 'Sources', subtitle: 'What the data does and does not know' },
};

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, isMobile } = useSidebar();
  const prefersReducedMotion = useReducedMotion();
  const [hotkey, setHotkey] = useState('⌘K');

  // The label has to name the key this machine actually uses, and that is only
  // knowable on the client — so it starts as the Mac form (which is what the
  // server renders) and corrects itself after mount on everything else.
  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setHotkey('Ctrl K');
  }, []);

  // Cmd/Ctrl+K anywhere lands on the roll, which is where searching happens.
  // One shortcut, one destination — no command palette pretending to be one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.push('/roll?focus=1');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  const page = PAGE_TITLES[pathname] ?? { title: 'MyHUB', subtitle: 'Your life, in receipts' };
  const sidebarWidth = isMobile ? 0 : collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;
  const transitionDuration = prefersReducedMotion ? 0 : 0.25;

  return (
    <motion.header
      className="fixed top-0 right-0 h-14 z-30"
      animate={{ left: sidebarWidth }}
      transition={{ duration: transitionDuration, ease: [0.4, 0, 0.2, 1] }}
      style={{
        // A cut block of the same stock as the rail rather than a pane of glass
        // over the page: opaque, and closed by a hard 2px rule instead of a
        // blurred falloff. The bar and the rail read as one frame.
        background: 'var(--frame-rail)',
        borderBottom: '2px solid var(--k-edge)',
      }}
      role="banner"
    >
      {/* The bar bleeds to the edges, but its contents share the canvas measure
          and padding below it — so the page title sits over the page's own left
          margin and the actions over its right. */}
      <div className="mx-auto w-full max-w-7xl h-full flex items-center gap-3 px-5 lg:px-8">
        {isMobile && (
          <div className="flex-shrink-0">
            <MobileMenuButton />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h1
            className="text-[13px] uppercase leading-none truncate"
            style={{
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              letterSpacing: '0.12em',
            }}
          >
            {page.title}
          </h1>
          <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--text-tertiary)' }}>
            {page.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <motion.button
            type="button"
            onClick={() => router.push('/roll?focus=1')}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5"
            style={{
              background: 'var(--frame-well)',
              border: '2px solid var(--k-edge)',
              color: 'var(--text-secondary)',
            }}
            whileHover={{ borderColor: 'var(--k-edge-strong)', color: 'var(--text-primary)' }}
            aria-label="Search the archive"
          >
            <Search size={12} />
            <span className="k-label hidden md:inline" style={{ color: 'inherit' }}>
              Search
            </span>
            {/* The keycap is an outline on the button's own surface, with no fill
                of its own, and that is deliberate twice over.

                Depth: --frame-hover is a white wash in the dark theme and an ink
                wash in the light one. Laid over the button's well it therefore
                lifted the keycap on the room and sank it on paper — the same
                object reading raised in one theme and recessed in the other,
                which is the one thing the depth order is not allowed to do.

                Contrast: it also made this the only place in the chrome where
                three surfaces stack (rail → well → wash). That composites to
                #d0cdc3 on paper, darker than any stock the ink table measures,
                and --text-muted came to 4.2:1 on it. Dropping the fill puts the
                glyph back on the single well, where the ramp is known good. */}
            <span
              className="hidden md:inline ml-1 px-1.5 py-0.5 text-[11px]"
              style={{
                border: '1px solid var(--k-edge)',
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-display)',
              }}
            >
              {hotkey}
            </span>
          </motion.button>

          {/* The archive's size — context, not a control, so it carries no
              hover state and is not a button. */}
          <div
            className="hidden md:flex items-center gap-2 px-2.5 py-1.5"
            style={{ background: 'var(--frame-well)', border: '1px solid var(--k-edge)' }}
          >
            <span className="k-label flex-shrink-0">Receipts</span>
            <span className="k-figure text-[11px]" style={{ color: 'var(--accent-amber)' }}>
              {num(ARCHIVE.meta.receipts)}
            </span>
          </div>

          {/* A display preference, so it sits with the utilities. */}
          <ThemeToggle />
        </div>
      </div>
    </motion.header>
  );
}
