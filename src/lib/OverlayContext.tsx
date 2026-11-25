'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Which receipt or thread the reader is currently looking at, and how they got
 * there.
 *
 * This is deliberately in-memory and nowhere else. The overlay is not a route,
 * so it is not in the URL; it is not a preference, so it is not in
 * localStorage. Closing the tab forgets what you were reading, which is the
 * correct behaviour for an archive you are browsing rather than editing — and
 * it keeps the product's one-persisted-key rule intact.
 */
interface OverlayState {
  receiptId: string | null;
  threadId: string | null;
  /** Ids visited within this overlay session, oldest first, excluding the current one. */
  trail: string[];
  openReceipt: (id: string) => void;
  /** Follow a link from the open receipt, keeping a trail so `back` can retrace it. */
  pushReceipt: (id: string) => void;
  openThread: (id: string) => void;
  back: () => void;
  close: () => void;
  isOpen: boolean;
}

const OverlayCtx = createContext<OverlayState | null>(null);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [trail, setTrail] = useState<string[]>([]);

  // Opening from a page is a fresh start, so the trail resets. Walking the link
  // graph from inside the overlay is the case that accumulates one.
  const openReceipt = useCallback((id: string) => {
    setThreadId(null);
    setReceiptId(id);
    setTrail([]);
  }, []);

  const pushReceipt = useCallback((id: string) => {
    setReceiptId((current) => {
      if (current === id) return current;
      if (current) setTrail((t) => [...t, current]);
      return id;
    });
    setThreadId(null);
  }, []);

  const openThread = useCallback((id: string) => {
    setReceiptId(null);
    setThreadId(id);
    setTrail([]);
  }, []);

  // With an empty trail there is nowhere to go back to, so the only sensible
  // reading of "back" is to leave — which is also what Escape does, and what a
  // reader pressing a lone back arrow expects.
  const back = useCallback(() => {
    setTrail((t) => {
      if (t.length === 0) {
        setReceiptId(null);
        setThreadId(null);
        return t;
      }
      setReceiptId(t[t.length - 1]);
      return t.slice(0, -1);
    });
  }, []);

  const close = useCallback(() => {
    setReceiptId(null);
    setThreadId(null);
    setTrail([]);
  }, []);

  const value = useMemo<OverlayState>(
    () => ({
      receiptId,
      threadId,
      trail,
      openReceipt,
      pushReceipt,
      openThread,
      back,
      close,
      isOpen: receiptId !== null || threadId !== null,
    }),
    [receiptId, threadId, trail, openReceipt, pushReceipt, openThread, back, close],
  );

  return <OverlayCtx.Provider value={value}>{children}</OverlayCtx.Provider>;
}

export function useOverlay(): OverlayState {
  const ctx = useContext(OverlayCtx);
  if (!ctx) throw new Error('useOverlay must be used inside OverlayProvider');
  return ctx;
}
