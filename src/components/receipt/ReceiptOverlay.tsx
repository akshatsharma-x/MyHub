'use client';

import { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, X } from 'lucide-react';
import { useExploration } from '@/lib/ExplorationContext';
import { useOverlay } from '@/lib/OverlayContext';
import { basisOf, receiptById, relatedTo, threadById } from '@/lib/engine';
import { clip, dateLabel, plural, text } from '@/lib/format';
import type { Receipt } from '@/lib/types';
import { KindIcon } from './KindIcon';
import { ReceiptSheet } from './ReceiptSheet';

/**
 * One receipt, or one thread, read at full height — mounted once at the root and
 * opened from every page.
 *
 * The overlay is the product's actual answer to "discovering relationships": a
 * reader lands on a receipt from anywhere, sees what it is connected to *and the
 * reason for each connection*, and can walk that graph hop by hop without ever
 * losing the page they came from. That is why it is an overlay rather than a
 * route — the page underneath is the reader's place in the archive, and a
 * navigation would spend it.
 *
 * The backdrop is a flat scrim. Not a blur: the design language forbids frosted
 * glass, and a hard dimmed sheet is what a printed object laid over other
 * printed objects actually looks like.
 */

const RELATED_LIMIT = 10;

function ThreadBody({
  threadId,
  onOpenReceipt,
}: {
  threadId: string;
  onOpenReceipt: (id: string) => void;
}): React.JSX.Element | null {
  const thread = threadById(threadId);
  if (!thread) return null;

  const receipts = thread.receiptIds
    .map((id) => receiptById(id))
    .filter((r): r is Receipt => Boolean(r));

  return (
    <div className="k-paper">
      <div className="px-5 pt-5 pb-4 sm:px-6">
        <span className="k-slug">Thread</span>
        <h2 className="k-display-sm mt-2 break-words">{clip(thread.title, 90)}</h2>
        <p className="nx-support mt-3 break-words">{thread.caption}</p>
      </div>
      <hr className="k-rule-hard" />
      <div className="p-5 sm:p-6 space-y-3">
        {receipts.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onOpenReceipt(r.id)}
            className="k-receipt w-full flex items-start gap-3 p-3 text-left cursor-pointer"
          >
            <KindIcon kind={r.kind} size={12} />
            <span className="min-w-0 flex-1">
              <span
                className="block break-words"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 13,
                  lineHeight: 1.35,
                }}
              >
                {clip(r.title, 80)}
              </span>
              <span className="block text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {dateLabel(r.at, '')}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReceiptOverlay(): React.JSX.Element {
  const { receiptId, threadId, trail, pushReceipt, back, close, isOpen } = useOverlay();
  const { markSeen, markThreadSeen } = useExploration();
  const prefersReducedMotion = useReducedMotion();

  const panelRef = useRef<HTMLDivElement>(null);
  // Where focus was when the overlay opened, so it can be handed back. Without
  // this a keyboard reader who closes the overlay is returned to the top of the
  // document and has to walk the whole page again to get back to where they were.
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const receipt = receiptById(receiptId);

  useEffect(() => {
    if (isOpen && !returnFocusTo.current) {
      returnFocusTo.current = document.activeElement as HTMLElement | null;
    }
    if (!isOpen && returnFocusTo.current) {
      returnFocusTo.current.focus?.();
      returnFocusTo.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (receiptId) markSeen(receiptId);
  }, [receiptId, markSeen]);

  useEffect(() => {
    if (threadId) markThreadSeen(threadId);
  }, [threadId, markThreadSeen]);

  // Escape closes, Tab is trapped. The trap is a wrap rather than a block so the
  // reader can still cycle the overlay's own controls with the keyboard.
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;

      const root = panelRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    // The page behind must not scroll under a full-height sheet on mobile.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen, receiptId, threadId]);

  const related = receipt
    ? relatedTo(receipt.id, RELATED_LIMIT).map(({ receipt: r, link }) => ({
        receipt: r,
        reason: link.reason,
      }))
    : [];

  const basis = basisOf(receipt);

  const onOpenRelated = useCallback((id: string) => pushReceipt(id), [pushReceipt]);

  const heading = receipt
    ? (text(receipt.title) ?? 'Receipt')
    : threadId
      ? (text(threadById(threadId)?.title) ?? 'Thread')
      : 'Archive';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 flex justify-end"
          // Above the rail (40) and the topbar (30) — an overlay that the chrome
          // pokes through is not an overlay.
          style={{ zIndex: 60 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.16 }}
        >
          {/* The scrim is a literal rather than a token because globals.css has
              no semi-transparent background and that file is not ours to extend.
              It is the dark room's own base colour at 78%, and it is the same
              value in both themes on purpose: the overlay is above everything,
              so it dims the light room too. Inverting it to a pale wash in the
              light theme would put the sheet *behind* the page it covers. */}
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(8, 8, 15, 0.78)' }}
            onClick={close}
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={heading}
            tabIndex={-1}
            className="relative h-full w-full sm:max-w-[560px] overflow-y-auto outline-none"
            style={{
              background: 'var(--bg-base)',
              borderLeft: '2px solid var(--ink)',
            }}
            initial={prefersReducedMotion ? {} : { x: 24 }}
            animate={{ x: 0 }}
            exit={prefersReducedMotion ? {} : { x: 24 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* The overlay's own chrome: a back arrow that retraces the walk and
                a close. Both are always present so the controls never move as the
                reader goes deeper. */}
            <div
              className="k-room sticky top-0 flex items-center justify-between gap-3 px-5 py-3"
              style={{
                zIndex: 1,
                background: 'var(--bg-base)',
                borderBottom: '2px solid var(--k-edge)',
              }}
            >
              <button
                type="button"
                onClick={back}
                className="k-btn k-btn-outline px-3 py-2"
                aria-label={trail.length > 0 ? 'Back to the previous receipt' : 'Close'}
              >
                <ArrowLeft size={13} />
                <span>{trail.length > 0 ? 'Back' : 'Close'}</span>
              </button>

              <span className="k-label truncate" style={{ color: 'var(--text-tertiary)' }}>
                {trail.length > 0
                  ? `${plural(trail.length + 1, 'receipt')} deep`
                  : receipt
                    ? 'Receipt'
                    : 'Thread'}
              </span>

              <button
                type="button"
                onClick={close}
                className="k-btn k-btn-outline px-3 py-2"
                aria-label="Close"
              >
                <X size={13} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {receipt && (
                <>
                  <ReceiptSheet receipt={receipt} related={related} onOpen={onOpenRelated} />

                  {basis.length > 0 && (
                    <div className="k-paper k-panel-flat p-5">
                      <span className="k-slug">What this rests on</span>
                      <p className="nx-support mt-2">
                        This receipt is an inference. These are the observed rows it was read
                        from — open them and check.
                      </p>
                      <div className="mt-4 space-y-2">
                        {basis.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => onOpenRelated(b.id)}
                            className="k-receipt w-full flex items-start gap-3 p-3 text-left cursor-pointer"
                          >
                            <KindIcon kind={b.kind} size={12} />
                            <span className="min-w-0 flex-1">
                              <span
                                className="block break-words"
                                style={{
                                  fontFamily: 'var(--font-display)',
                                  fontWeight: 700,
                                  fontSize: 13,
                                  lineHeight: 1.35,
                                }}
                              >
                                {clip(b.title, 80)}
                              </span>
                              <span
                                className="block text-[11px] mt-1"
                                style={{ color: 'var(--text-tertiary)' }}
                              >
                                {dateLabel(b.at, '')}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {!receipt && threadId && (
                <ThreadBody threadId={threadId} onOpenReceipt={onOpenRelated} />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
