'use client';

import { createContext, useCallback, useContext, useState, useSyncExternalStore } from 'react';

interface SidebarContextType {
  collapsed: boolean;
  mobileOpen: boolean;
  isMobile: boolean;
  toggle: () => void;
  openMobile: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  mobileOpen: false,
  isMobile: false,
  toggle: () => {},
  openMobile: () => {},
  closeMobile: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

/** The drawer breakpoint: below Tailwind's `lg`. It has to agree with the
 *  `max-width: 1023px` block under SHELL GEOMETRY in globals.css. */
const MOBILE_QUERY = '(max-width: 1023px)';

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Behaviour only: which close control the rail shows, and whether following a
  // link dismisses it. Nothing about the layout may depend on this, because it is
  // false on the server and during hydration and only becomes true afterwards.
  // That gap is why the geometry lives in CSS.
  //
  // This used to be a useState(false) corrected by an effect, under a comment
  // saying the effect ran "before paint". Effects run after paint. The shell's
  // offsets were computed from it, so a phone's first paint was the desktop rail
  // laid over 64% of the screen.
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent) => {
      // Growing past the breakpoint with the drawer open would strand it open
      // behind a rail that no longer slides, so it closes on the way out.
      if (!e.matches) setMobileOpen(false);
      onChange();
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const isMobile = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        mobileOpen,
        isMobile,
        toggle: () => setCollapsed(c => !c),
        openMobile: () => setMobileOpen(true),
        closeMobile: () => setMobileOpen(false),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}
