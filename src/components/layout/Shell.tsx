'use client';

import { usePathname } from 'next/navigation';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

function ShellContent({ children }: { children: React.ReactNode }) {
  const { collapsed, mobileOpen } = useSidebar();
  const pathname = usePathname();

  return (
    // The shell's geometry is CSS keyed off these two attributes — see SHELL
    // GEOMETRY in globals.css. Both start from what the server renders (rail
    // expanded, drawer closed), so hydration never changes them and the first
    // paint is already the final layout.
    <div
      className="nx-shell min-h-screen"
      data-rail={collapsed ? 'collapsed' : 'expanded'}
      data-drawer={mobileOpen ? 'open' : 'closed'}
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Environmental lighting. Sits at z-index 0, so the main column below is
          lifted to 1 — otherwise the vignette would paint over the content it
          is meant to sit behind. The rail (z-40) and topbar (z-30) are already
          above it. */}
      <div className="nx-atmosphere" aria-hidden="true" />

      <Sidebar />
      <TopBar />
      <main className="nx-shell-main relative min-h-screen pt-14" style={{ zIndex: 1 }}>
        {/* The canvas is centred rather than left-aligned, so past the point
            where the measure stops growing the leftover width becomes symmetric
            margin instead of one dead gutter on the right. Keyed by route so
            each navigation mounts a fresh canvas and the page-enter replays. */}
        <div key={pathname} className="nx-page-enter mx-auto w-full max-w-7xl px-5 py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ShellContent>{children}</ShellContent>
    </SidebarProvider>
  );
}
