'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RECEIPTS, YEARS } from '@/lib/archive';
import { num, plural } from '@/lib/format';
import { kindDef, KIND_ORDER } from '@/lib/kinds';
import type { ReceiptKind } from '@/lib/types';

/**
 * Ten years of the archive as one printed band — the answer to "a clear visual
 * representation of the digital journey".
 *
 * Two bands, stacked, sharing one axis:
 *
 *   1. **Volume.** One column per year, divided into hard blocks by receipt kind,
 *      height proportional to that year's count. This is what the archive holds.
 *   2. **Coverage.** A strip under each year marking which ledgers were running.
 *      This is the more honest half of the graphic, because it makes the 2019–21
 *      hole a property of the *sources* rather than an absence of life.
 *
 * Without the second band the first one lies: a short 2019 column reads as "not
 * much happened", when what happened is that the household ledger stopped and the
 * card ledger had not started yet.
 *
 * ── Why this is DOM and not SVG ───────────────────────────────────────────────
 * A bar chart that has to fill any measure from 360px to 1920px needs either
 * `preserveAspectRatio="none"`, which stretches the year labels into something
 * the display face was never cut for, or a fixed aspect, which collapses to 87px
 * tall on a phone. Hard-edged rectangles are exactly what CSS boxes already are —
 * the radius scale is zeroed — so the columns are divs sized in percentages, the
 * labels are real text at a real size, and each year is a genuine focusable
 * button rather than an SVG group pretending to be one. No distortion, no
 * letterboxing, keyboard navigation for free.
 */

const BAND_PX = 168;
const COVER_PX = 22;

interface YearRow {
  year: number;
  total: number;
  byKind: Array<{ kind: ReceiptKind; count: number }>;
  music: boolean;
  money: boolean;
}

function coverageLabel(row: YearRow): string {
  if (row.music && row.money) return 'music and money';
  if (row.music) return 'music only — no ledger was running';
  if (row.money) return 'money only';
  return 'nothing recorded';
}

export function DecadeSpine(): React.JSX.Element {
  const router = useRouter();
  const [active, setActive] = useState<number | null>(null);

  const rows = useMemo<YearRow[]>(() => {
    const byYear = new Map<number, { counts: Map<ReceiptKind, number>; sources: Set<string> }>();
    for (const y of YEARS) byYear.set(y, { counts: new Map(), sources: new Set() });

    for (const r of RECEIPTS) {
      const row = byYear.get(Number(r.at.slice(0, 4)));
      if (!row) continue;
      row.counts.set(r.kind, (row.counts.get(r.kind) ?? 0) + 1);
      row.sources.add(r.source);
    }

    return YEARS.map((year) => {
      const row = byYear.get(year);
      const counts = row?.counts ?? new Map<ReceiptKind, number>();
      const sources = row?.sources ?? new Set<string>();
      const byKind = KIND_ORDER.map((kind) => ({ kind, count: counts.get(kind) ?? 0 })).filter(
        (k) => k.count > 0,
      );
      return {
        year,
        total: byKind.reduce((sum, k) => sum + k.count, 0),
        byKind,
        music: sources.has('spotify'),
        money: sources.has('household') || sources.has('cards'),
      };
    });
  }, []);

  const max = Math.max(1, ...rows.map((r) => r.total));
  const shown = active !== null ? rows.find((r) => r.year === active) : undefined;

  return (
    <div>
      <div className="flex items-end gap-[3px] sm:gap-2" style={{ height: BAND_PX }}>
        {rows.map((row) => {
          const dim = active !== null && active !== row.year;
          const heightPct = (row.total / max) * 100;

          return (
            <button
              key={row.year}
              type="button"
              onMouseEnter={() => setActive(row.year)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(row.year)}
              onBlur={() => setActive(null)}
              onClick={() => router.push(`/roll?year=${row.year}`)}
              // The button is the full slot height, not the drawn column — a thin
              // year would otherwise be a 4px-tall target.
              className="flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end"
              style={{ opacity: dim ? 0.38 : 1, transition: 'opacity 120ms ease' }}
              aria-label={`${row.year}: ${plural(row.total, 'receipt')}, ${coverageLabel(row)}. Open the roll filtered to ${row.year}.`}
            >
              <span
                className="flex w-full flex-col-reverse"
                style={{
                  height: `${heightPct}%`,
                  // A hard rule around the stack, so the column survives with
                  // every fill removed and thickens on hover instead of glowing.
                  border: `${active === row.year ? 3 : 2}px solid var(--k-edge-strong)`,
                  minHeight: 4,
                }}
              >
                {/* column-reverse so KIND_ORDER stacks from the baseline up, which
                    puts the same kind at the same depth in all ten years. */}
                {row.byKind.map(({ kind, count }) => (
                  <span
                    key={kind}
                    className="w-full"
                    style={{
                      height: `${(count / row.total) * 100}%`,
                      background: kindDef(kind).color,
                    }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {/* Coverage strip and the year axis, on the same slot geometry as the bars
          so the three lines up column for column. */}
      <div className="mt-2 flex gap-[3px] sm:gap-2">
        {rows.map((row) => (
          <div key={row.year} className="min-w-0 flex-1">
            <div
              className="flex w-full flex-col"
              style={{
                height: COVER_PX,
                border: '2px solid var(--k-edge)',
                opacity: active !== null && active !== row.year ? 0.38 : 1,
              }}
              aria-hidden="true"
            >
              <span
                className="w-full flex-1"
                style={{ background: row.music ? 'var(--level-2)' : 'var(--frame-hover-off)' }}
              />
              <span
                className="w-full flex-1"
                style={{ background: row.money ? 'var(--level-5)' : 'var(--frame-hover-off)' }}
              />
            </div>
            <div
              className="k-figure nx-numeric mt-1.5 text-center text-[11px] sm:text-[13px]"
              style={{
                color: active === row.year ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              {/* Four digits do not fit in a 33px slot on a 360px screen, and a
                  rotated label is not a fix. */}
              <span className="sm:hidden">&rsquo;{String(row.year).slice(2)}</span>
              <span className="hidden sm:inline">{row.year}</span>
            </div>
          </div>
        ))}
      </div>

      {/* The readout is real text under the graphic rather than a floating
          tooltip: it carries facts, it has to survive touch, and it holds its
          height so hovering never reflows the page. */}
      <div
        className="mt-5 flex min-h-[54px] flex-wrap items-baseline gap-x-4 gap-y-1 pt-3"
        style={{ borderTop: '2px solid var(--k-edge)' }}
        aria-live="polite"
      >
        {shown ? (
          <>
            <span className="k-figure nx-numeric text-[22px]">{shown.year}</span>
            <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              {plural(shown.total, 'receipt')} · {coverageLabel(shown)}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              {shown.byKind
                .slice()
                .sort((a, b) => b.count - a.count)
                .slice(0, 4)
                .map((k) => `${kindDef(k.kind).plural.toLowerCase()} ${num(k.count)}`)
                .join(' · ')}
            </span>
          </>
        ) : (
          <span className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
            Hover or focus a year to read its counts. Select one to open the roll filtered to it.
          </span>
        )}
      </div>

      {/* A legend, because a chart without one is decoration. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {KIND_ORDER.map((kind) => {
          const def = kindDef(kind);
          return (
            <span key={kind} className="inline-flex items-center gap-1.5">
              <span
                className="h-[11px] w-[11px] flex-none"
                style={{ background: def.color, border: '1px solid var(--k-edge-strong)' }}
                aria-hidden="true"
              />
              <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
                {def.plural}
              </span>
            </span>
          );
        })}
      </div>
      <p className="nx-support mt-3">
        Height is that year&rsquo;s receipt count. Grey blocks are reconstructed kinds. The strip
        below each column marks what was recording — upper half music, lower half money.
      </p>
    </div>
  );
}
