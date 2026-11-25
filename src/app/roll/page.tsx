'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { RECEIPTS } from '@/lib/archive';
import {
  EMPTY_QUERY,
  facetsFor,
  isEmptyQuery,
  linkCount,
  selectReceipts,
  summarise,
  type Query,
  type SortKey,
} from '@/lib/engine';
import { useExploration } from '@/lib/ExplorationContext';
import { useOverlay } from '@/lib/OverlayContext';
import { num, plural } from '@/lib/format';
import { KIND_DEFS, kindDef } from '@/lib/kinds';
import type { Provenance, ReceiptKind, SourceId } from '@/lib/types';
import { KindIcon } from '@/components/receipt/KindIcon';
import { ReceiptCard } from '@/components/receipt/ReceiptCard';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Slug } from '@/components/ui/Slug';

/**
 * The roll — where a reader goes to find one specific thing.
 *
 * It is deliberately a *searchable corpus* rather than a timeline: the default
 * ordering is newest-first because that is the least surprising entry point, but
 * the page's real subject is the facet rail and the sentence above the results.
 * The day this starts reading like a feed it has failed the brief's first rule.
 *
 * Every count in the rail is computed under the OTHER active filters, so the
 * rail is a map of where the archive still has something rather than a set of
 * switches that can strand the reader in a column of zeros.
 *
 * Filtering is synchronous against a memoised index. No spinner, no skeleton, no
 * debounce: if this ever needed one, the index would be the thing to fix.
 */

const PAGE_SIZE = 48;

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'amount', label: 'Largest' },
  { key: 'relevance', label: 'Closest' },
];

const PROVENANCE: Array<{ key: Provenance | 'all'; label: string }> = [
  { key: 'all', label: 'Everything' },
  { key: 'observed', label: 'Observed' },
  { key: 'reconstructed', label: 'Inferred' },
];

const SOURCE_LABELS: Record<SourceId, string> = {
  spotify: 'Streaming',
  household: 'Household ledger',
  cards: 'Card ledger',
};

/** One collapsible block of the rail. Open by default on desktop; on mobile the
 *  whole rail is one disclosure, so these stay open inside it. */
function RailGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <Slug>{title}</Slug>
      <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function RollBody(): React.JSX.Element {
  const params = useSearchParams();
  const { openReceipt } = useOverlay();
  const { seen } = useExploration();

  const fieldRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<Query>(EMPTY_QUERY);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [railOpen, setRailOpen] = useState(false);

  // `?year=` arrives from the decade spine and the chapter spreads; `?focus=1` is
  // what ⌘K pushes. Read once on mount rather than kept in sync, because after
  // that first read the filter state belongs to the page — writing every chip
  // back into the URL would turn the browser's back button into an undo stack for
  // individual checkboxes.
  useEffect(() => {
    const year = Number(params.get('year'));
    const kind = params.get('kind');
    const next: Partial<Query> = {};
    if (Number.isFinite(year) && year > 1970) next.years = [year];
    if (kind && kind in KIND_DEFS) next.kinds = [kind as ReceiptKind];
    if (Object.keys(next).length > 0) setQuery((q) => ({ ...q, ...next }));
    if (params.get('focus') === '1') fieldRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `/` focuses the field and Escape clears it — the two shortcuts a reader of a
  // search page tries without being told. Ignored while they are already typing
  // somewhere, so `/` stays a usable character.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA';
      if (e.key === '/' && !typing) {
        e.preventDefault();
        fieldRef.current?.focus();
      }
      if (e.key === 'Escape' && typing) {
        setQuery((q) => ({ ...q, q: '' }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => selectReceipts(RECEIPTS, query), [query]);
  const facets = useMemo(() => facetsFor(RECEIPTS, query), [query]);
  const sentence = useMemo(() => summarise(results, RECEIPTS), [results]);

  // Any change to what is being asked returns the reader to the top of the set;
  // holding a page offset across a filter change shows them page 3 of something
  // they have not seen page 1 of.
  const set = useCallback((patch: Partial<Query>) => {
    setShown(PAGE_SIZE);
    setQuery((q) => ({ ...q, ...patch }));
  }, []);

  const dirty = !isEmptyQuery(query);
  const visible = results.slice(0, shown);

  const rail = (
    <div className="space-y-6">
      <RailGroup title="Kind">
        {facets.kinds.map((f) => {
          const kind = f.value as ReceiptKind;
          return (
            <span key={f.value} className="inline-flex items-center gap-1.5">
              <KindIcon kind={kind} size={11} />
              <Chip
                label={kindDef(kind).plural}
                count={f.count}
                active={query.kinds.includes(kind)}
                onClick={() => set({ kinds: toggle(query.kinds, kind) })}
              />
            </span>
          );
        })}
      </RailGroup>

      <RailGroup title="Year">
        {facets.years.map((f) => {
          const year = Number(f.value);
          return (
            <Chip
              key={f.value}
              label={f.label}
              count={f.count}
              active={query.years.includes(year)}
              onClick={() => set({ years: toggle(query.years, year) })}
            />
          );
        })}
      </RailGroup>

      <RailGroup title="Source">
        {facets.sources.map((f) => {
          const source = f.value as SourceId;
          return (
            <Chip
              key={f.value}
              label={SOURCE_LABELS[source] ?? f.label}
              count={f.count}
              active={query.sources.includes(source)}
              onClick={() => set({ sources: toggle(query.sources, source) })}
            />
          );
        })}
      </RailGroup>

      <RailGroup title="How it is known">
        {PROVENANCE.map((p) => (
          <Chip
            key={p.key}
            label={p.label}
            active={query.provenance === p.key}
            accent={p.key === 'reconstructed'}
            onClick={() => set({ provenance: p.key })}
          />
        ))}
      </RailGroup>

      {facets.tags.length > 0 && (
        <RailGroup title="Tag">
          {facets.tags.slice(0, 22).map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              count={f.count}
              active={query.tags.includes(f.value)}
              onClick={() => set({ tags: toggle(query.tags, f.value) })}
            />
          ))}
        </RailGroup>
      )}

      {/* Only present when there is something to clear. A permanently visible
          "clear all" on an untouched page is a control that does nothing. */}
      {dirty && (
        <button
          type="button"
          onClick={() => {
            setShown(PAGE_SIZE);
            setQuery(EMPTY_QUERY);
          }}
          className="k-btn k-btn-outline w-full"
        >
          <X size={13} />
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── The header row ───────────────────────────────────────────────── */}
      <div className="k-paper k-panel p-5 sm:p-6">
        <label className="block">
          <span className="k-label">Search every field of every receipt</span>
          <span className="relative mt-2 flex items-center">
            <Search
              size={14}
              className="pointer-events-none absolute left-3"
              style={{ color: 'var(--ink-4)' }}
              aria-hidden="true"
            />
            <input
              ref={fieldRef}
              type="search"
              value={query.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="the beatles, autorickshaw, farewell, 70255…"
              className="k-field w-full py-3 pl-9 pr-3 text-[15px]"
              style={{ fontFamily: 'var(--font-body)' }}
            />
          </span>
        </label>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 break-words text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            {sentence}
          </p>
          <div className="flex flex-none flex-wrap items-center gap-2">
            <span className="k-label">Order</span>
            {SORTS.map((s) => (
              <Chip
                key={s.key}
                label={s.label}
                active={query.sort === s.key}
                onClick={() => set({ sort: s.key })}
              />
            ))}
          </div>
        </div>

        <p className="nx-support mt-3">
          Press <kbd className="k-label">/</kbd> to search from anywhere on this page.
          &ldquo;Closest&rdquo; ranks by how well a receipt matches what you typed, so it only
          differs from the others once there is a search term.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── The rail ──────────────────────────────────────────────────── */}
        {/* A disclosure below lg rather than a squeezed sidebar. A 360px screen
            cannot hold two columns, and a horizontally scrolling chip strip hides
            the counts that make the rail worth having. */}
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            className="k-btn k-btn-outline w-full"
            aria-expanded={railOpen}
          >
            {railOpen ? 'Hide filters' : dirty ? 'Filters — some are set' : 'Filters'}
          </button>
          {railOpen && (
            <div className="k-paper k-panel-flat mt-3 p-5">{rail}</div>
          )}
        </div>

        <aside className="hidden flex-none lg:block lg:w-[248px]">
          <div className="k-paper k-panel-flat p-5">{rail}</div>
        </aside>

        {/* ── The results ───────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {visible.length === 0 ? (
            <EmptyState
              slug="Nothing matched"
              title="NO RECEIPT ANSWERS TO THAT"
              detail={
                dirty
                  ? 'Every filter here narrows the same set, so two narrow ones can rule out everything. Clearing one usually brings the archive back.'
                  : 'The archive is empty, which should not be possible — it is built at compile time from three committed datasets.'
              }
              action={
                dirty ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShown(PAGE_SIZE);
                      setQuery(EMPTY_QUERY);
                    }}
                    className="k-btn k-btn-outline"
                  >
                    Clear all filters
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((r) => (
                  <ReceiptCard
                    key={r.id}
                    receipt={r}
                    onOpen={openReceipt}
                    linkCount={linkCount(r.id)}
                    seen={seen.has(r.id)}
                    dense
                  />
                ))}
              </div>

              {/* Real pagination, never an infinite feed, and the remainder is
                  always stated — a "show more" button that does not say how much
                  more is a silent truncation with a friendly face. */}
              <div className="mt-6 flex flex-wrap items-center gap-4">
                {shown < results.length ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShown((n) => n + PAGE_SIZE)}
                      className="k-btn k-btn-solid"
                    >
                      Show {num(Math.min(PAGE_SIZE, results.length - shown))} more
                    </button>
                    <span className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                      Showing {num(visible.length)} of {plural(results.length, 'match')}.
                    </span>
                  </>
                ) : (
                  <span className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                    That is all {plural(results.length, 'match')}.
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RollPage(): React.JSX.Element {
  // useSearchParams suspends during prerender, so the boundary is required. The
  // fallback is the page's own frame rather than a spinner: the filtering itself
  // is synchronous, and a loading state for work that takes no time is theatre.
  return (
    <Suspense
      fallback={
        <div className="k-paper k-panel p-5 sm:p-6">
          <Slug>The roll</Slug>
          <p className="nx-support mt-2">Reading the archive.</p>
        </div>
      }
    >
      <RollBody />
    </Suspense>
  );
}
