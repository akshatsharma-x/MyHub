'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Archive, ScrollText, GitMerge, Network, BookOpen,
  Activity, BookMarked, Database, ChevronLeft, ChevronRight, X, Menu,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ARCHIVE } from '@/lib/archive';
import { useExploration } from '@/lib/ExplorationContext';
import { num } from '@/lib/format';
import { useSidebar } from './SidebarContext';
import { Tooltip } from '@/components/ui/Tooltip';

const NAV_ITEMS = [
  { href: '/', label: 'The Archive', icon: Archive },
  { href: '/roll', label: 'The Roll', icon: ScrollText },
  { href: '/threads', label: 'Threads', icon: GitMerge },
  { href: '/constellation', label: 'Constellation', icon: Network },
  { href: '/chapters', label: 'Chapters', icon: BookOpen },
  { href: '/rhythms', label: 'Rhythms', icon: Activity },
  { href: '/story', label: 'Story', icon: BookMarked },
];

interface NavItemData {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: boolean;
}

function NavItem({
  item,
  isActive,
  isCollapsed,
  onClick,
}: {
  item: NavItemData;
  isActive: boolean;
  isCollapsed: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  const prefersReducedMotion = useReducedMotion();

  const inner = (
    <Link href={item.href} onClick={onClick}>
      <motion.div
        className="relative flex items-center gap-2.5 px-3 py-2 cursor-pointer"
        style={{
          // The active item's surface is the shared layout element below, not
          // this background — otherwise the two would cross-fade against each
          // other while the marker is travelling between items.
          //
          // --frame-hover-off, not `transparent`: this is the resting end of
          // the hover animation below, and Motion cannot tween out of a
          // keyword. Both are invisible; only one can be animated from.
          background: 'var(--frame-hover-off)',
          color: isActive ? 'var(--ink)' : 'var(--text-secondary)',
          justifyContent: isCollapsed ? 'center' : undefined,
        }}
        whileHover={
          isActive
            ? { color: 'var(--ink)' }
            : { background: 'var(--frame-hover)', color: 'var(--text-primary)' }
        }
        transition={{ duration: 0.15 }}
        aria-label={item.label}
        aria-current={isActive ? 'page' : undefined}
      >
        {isActive && (
          <motion.span
            layoutId="sidebar-active-indicator"
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              // A printed amber block, not a lit wash: the marker is the one
              // solid area of accent in the rail, so it carries ink type rather
              // than a coloured edge.
              background: 'var(--amber)',
              border: '2px solid var(--k-edge)',
            }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 460, damping: 36 }
            }
          />
        )}
        {/* The marker is absolutely positioned and therefore paints after the
            in-flow icon and label; both are promoted so they stay in front of
            it rather than behind. */}
        <Icon size={15} className="relative flex-shrink-0" />
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.span
              className="relative text-[11px] uppercase whitespace-nowrap overflow-hidden"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                letterSpacing: '0.1em',
              }}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip content={item.label} side="right">
        {inner}
      </Tooltip>
    );
  }

  return inner;
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, mobileOpen, isMobile, toggle, closeMobile } = useSidebar();
  const { seenCount } = useExploration();
  const prefersReducedMotion = useReducedMotion();

  // A phone's drawer is always the full rail; whether it is on screen is CSS
  // (`data-drawer`). It used to collapse its contents while closed and expand
  // them as it opened, which made hydration on a phone re-render the whole rail
  // and reflowed every label while the drawer was still sliding in.
  const isExpanded = isMobile || !collapsed;

  const owner = ARCHIVE.meta.owner;
  const ownerInitial = (owner.name.trim().charAt(0) || 'A').toUpperCase();
  const total = ARCHIVE.meta.receipts;

  // How much of the archive has been opened this session. The rail is the only
  // place this is reported, and it is the reason to keep exploring rather than a
  // score — hence a share of the whole, not a level.
  const exploredPercent = total > 0 ? Math.min(100, (seenCount / total) * 100) : 0;

  return (
    <>
      {/* Mobile backdrop. The same literal as the receipt overlay's scrim, and
          for the same reason: the dark room's base colour at 78%, identical in
          both themes, because the rail is above everything and so has to dim the
          light room too. See the note in ReceiptOverlay. */}
      <AnimatePresence>
        {isMobile && mobileOpen && (
          <motion.div
            className="fixed inset-0 z-30"
            style={{ background: 'rgba(8, 8, 15, 0.78)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            onClick={closeMobile}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Width, and the drawer's slide on a phone, come from .nx-shell-rail —
          so both are right in the static HTML, before any of this runs. */}
      <aside
        className="nx-shell-rail fixed left-0 top-0 h-screen flex flex-col z-40 overflow-hidden"
        style={{
          // Deeper than the canvas, so the separation comes from the rail
          // receding rather than from a lighter panel sitting on top. The edge
          // is a hard 2px rule instead of a lit hairline — the rail is a cut
          // block, and nothing in this language fades.
          background: 'var(--frame-rail)',
          borderRight: '2px solid var(--k-edge)',
        }}
        aria-label="Primary navigation"
      >
        {/* Wordmark row */}
        <div
          className="flex items-center px-3 pt-5 pb-4 flex-shrink-0"
          style={{ justifyContent: isExpanded ? 'space-between' : 'center' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* The wordmark is a printed block: the initial set in the display
                face on a solid amber square, which is the same object the active
                nav marker is — the rail has one accent colour and two uses. */}
            <div className="k-mark" style={{ width: 32, height: 32, fontSize: 15 }} aria-hidden="true">
              M
            </div>
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div
                    className="text-sm whitespace-nowrap uppercase"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                      letterSpacing: '0.16em',
                    }}
                  >
                    MYHUB
                  </div>
                  {/* Title case, not the tracked uppercase label: uppercase at
                      label tracking, this string is wider than 220px allows. */}
                  <div
                    className="text-[11px] whitespace-nowrap mt-px"
                    style={{ color: 'var(--text-muted)', letterSpacing: '0.02em' }}
                  >
                    Your life, in receipts
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {isMobile ? (
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={closeMobile}
                  className="w-6 h-6 flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'var(--frame-well)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--k-edge)',
                  }}
                  aria-label="Close navigation"
                >
                  <X size={12} />
                </motion.button>
              )}
            </AnimatePresence>
          ) : (
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={toggle}
                  className="w-6 h-6 flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'var(--frame-well)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--k-edge)',
                  }}
                  aria-label="Collapse sidebar"
                >
                  <ChevronLeft size={12} />
                </motion.button>
              )}
            </AnimatePresence>
          )}

          {!isMobile && !isExpanded && (
            <Tooltip content="Expand sidebar" side="right">
              <button
                onClick={toggle}
                className="w-6 h-6 flex items-center justify-center"
                style={{
                  background: 'var(--frame-well)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--k-edge)',
                }}
                aria-label="Expand sidebar"
              >
                <ChevronRight size={12} />
              </button>
            </Tooltip>
          )}
        </div>

        {/* Archive owner. The rail prints the short standing and hangs the full
            one off the tooltip, because this line has ~18 characters before it
            truncates and the institution is the part that does not fit. */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden px-3 mb-2"
            >
              <div
                className="p-3"
                style={{ background: 'var(--frame-well)', border: '1px solid var(--k-edge)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 flex items-center justify-center text-sm flex-shrink-0"
                    style={{
                      background: 'var(--frame-rail)',
                      border: '2px solid var(--k-edge)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                    }}
                  >
                    {ownerInitial}
                  </div>
                  <div className="min-w-0">
                    <div
                      className="text-xs font-semibold truncate"
                      style={{ color: 'var(--text-primary)' }}
                      title={owner.name}
                    >
                      {owner.name}
                    </div>
                    {/* Wraps to two lines rather than truncating on one. The rail
                        is a fixed 220px and this value is whatever the owner's
                        standing happens to be, so one line is a bet on its length:
                        "CSE undergraduate" needs 136.5px of the 126px available and
                        was rendering as "CSE UNDERGRADUAT…". Shaving the tracking
                        until it fits would have bought 11px and left the next value
                        broken — it makes an admitted truncation into a hidden one.
                        The clamp keeps the ceiling, so a pathological value still
                        cannot push the nav down. */}
                    <div
                      className="line-clamp-2 text-[11px] uppercase"
                      style={{
                        color: 'var(--text-tertiary)',
                        fontFamily: 'var(--font-display)',
                        letterSpacing: '0.08em',
                        lineHeight: 1.3,
                        overflowWrap: 'anywhere',
                      }}
                      title={`${owner.work} · ${owner.at}`}
                    >
                      {owner.work}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isExpanded && !isMobile && (
          <div className="px-3 mb-2 flex justify-center">
            <Tooltip content={owner.name} side="right">
              <div
                className="w-8 h-8 flex items-center justify-center text-sm"
                style={{
                  background: 'var(--frame-rail)',
                  border: '2px solid var(--k-edge)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                }}
              >
                {ownerInitial}
              </div>
            </Tooltip>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2" aria-label="Main navigation">
          {NAV_ITEMS.map(item => (
            <NavItem
              key={item.href}
              item={item}
              isActive={pathname === item.href}
              isCollapsed={!isExpanded}
              onClick={isMobile ? closeMobile : undefined}
            />
          ))}

          <div className="k-rule-thin my-1.5 mx-1" role="separator" />

          <NavItem
            item={{ href: '/sources', label: 'Sources', icon: Database }}
            isActive={pathname === '/sources'}
            isCollapsed={!isExpanded}
            onClick={isMobile ? closeMobile : undefined}
          />
        </nav>

        {/* Exploration footer. A share of the archive opened this session — the
            one number in the rail, and the reason to keep going. */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="px-3 pb-4 overflow-hidden"
            >
              <div
                className="p-3"
                style={{ background: 'var(--frame-well)', border: '1px solid var(--k-edge)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="k-label">Opened</span>
                  <span className="k-figure text-[11px]" style={{ color: 'var(--accent-amber)' }}>
                    {num(seenCount, '0')} / {num(total)}
                  </span>
                </div>
                {/* The meter primitive's track, with a motion-driven fill — so
                    it must not also carry .k-meter-fill's CSS transition, or the
                    two would fight over the same property. */}
                <div className="k-meter">
                  <motion.div
                    className="h-full"
                    style={{ background: 'var(--amber)' }}
                    initial={false}
                    animate={{ width: `${exploredPercent}%` }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.4, ease: 'easeOut' }}
                  />
                </div>
                <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  {seenCount === 0 ? 'Open a receipt to begin' : 'Receipts opened this session'}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </>
  );
}

/** Exported for the TopBar's hamburger. */
export function MobileMenuButton() {
  const { openMobile } = useSidebar();
  return (
    <button
      onClick={openMobile}
      className="w-8 h-8 flex items-center justify-center"
      style={{
        background: 'var(--frame-well)',
        border: '2px solid var(--k-edge)',
        color: 'var(--text-secondary)',
      }}
      aria-label="Open navigation"
    >
      <Menu size={15} />
    </button>
  );
}
