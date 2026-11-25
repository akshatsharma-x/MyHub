'use client';

import { useMemo, useState } from 'react';
import { AGGREGATES } from '@/lib/archive';
import { compact, inr, monthLabel, num } from '@/lib/format';

/**
 * Listening and spending on one shared time axis, month by month.
 *
 * The chart exists for a single comparison: music runs continuously from 2015 to
 * the end, and money stops dead between 2019 and 2021. Put them on separate axes
 * and that is two unrelated facts; put them on the same months and it becomes one
 * finding — *the silence is in the ledger, not in the person.*
 *
 * The two series are drawn as opposed bands from a shared centre rule rather than
 * as two lines on one scale, because the units are plays and rupees and forcing
 * them into a common y-axis would be a lie about magnitude. Mirroring compares
 * only what is comparable: presence, absence, and shape over time.
 *
 * Both halves are normalised to their own maximum, which is stated on the chart —
 * an unlabelled dual axis is how this kind of graphic usually misleads.
 */

const BAND_PX = 96;

interface MonthRow {
  ym: string;
  plays: number;
  spend: number;
}

export function MonthlySpine(): React.JSX.Element {
  const [active, setActive] = useState<string | null>(null);

  const rows = useMemo<MonthRow[]>(() => {
    // The union of both series, so a month present in one and absent in the other
    // still occupies a slot. Dropping it would close the gap this chart is about.
    const keys = new Set([
      ...Object.keys(AGGREGATES.playsByMonth),
      ...Object.keys(AGGREGATES.spendByMonth),
    ]);
    return [...keys]
      .filter((ym) => ym >= '2015-01')
      .sort()
      .map((ym) => ({
        ym,
        plays: AGGREGATES.playsByMonth[ym] ?? 0,
        spend: AGGREGATES.spendByMonth[ym] ?? 0,
      }));
  }, []);

  const maxPlays = Math.max(1, ...rows.map((r) => r.plays));
  const maxSpend = Math.max(1, ...rows.map((r) => r.spend));
  const shown = active ? rows.find((r) => r.ym === active) : undefined;

  // Year boundaries, for the ticks. Drawn from the data rather than a range, so a
  // rebuild that changes the span relabels itself.
  const yearStarts = useMemo(() => {
    const seen = new Set<string>();
    return rows.map((r, i) => {
      const year = r.ym.slice(0, 4);
      if (seen.has(year)) return null;
      seen.add(year);
      return { year, index: i };
    });
  }, [rows]);

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {/* Listening, upward. */}
          <div className="flex items-end gap-[1px]" style={{ height: BAND_PX }}>
            {rows.map((r) => (
              <button
                key={`p-${r.ym}`}
                type="button"
                onMouseEnter={() => setActive(r.ym)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(r.ym)}
                onBlur={() => setActive(null)}
                className="flex h-full min-w-0 flex-1 cursor-default flex-col justify-end"
                style={{ opacity: active && active !== r.ym ? 0.4 : 1 }}
                aria-label={`${monthLabel(r.ym)}: ${num(r.plays)} plays`}
              >
                <span
                  className="w-full"
                  style={{
                    height: `${(r.plays / maxPlays) * 100}%`,
                    background: 'var(--level-2)',
                    minHeight: r.plays > 0 ? 2 : 0,
                  }}
                />
              </button>
            ))}
          </div>

          {/* The shared centre rule — the axis both series are measured from. */}
          <div style={{ borderTop: '2px solid var(--k-edge-strong)' }} />

          {/* Spending, downward. */}
          <div className="flex items-start gap-[1px]" style={{ height: BAND_PX }}>
            {rows.map((r) => (
              <button
                key={`s-${r.ym}`}
                type="button"
                onMouseEnter={() => setActive(r.ym)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(r.ym)}
                onBlur={() => setActive(null)}
                className="flex h-full min-w-0 flex-1 cursor-default flex-col justify-start"
                style={{ opacity: active && active !== r.ym ? 0.4 : 1 }}
                aria-label={`${monthLabel(r.ym)}: ${r.spend > 0 ? inr(r.spend) : 'no ledger'}`}
              >
                <span
                  className="w-full"
                  style={{
                    height: `${(r.spend / maxSpend) * 100}%`,
                    background: 'var(--level-5)',
                    minHeight: r.spend > 0 ? 2 : 0,
                  }}
                />
              </button>
            ))}
          </div>

          {/* Year ticks. */}
          <div className="mt-1.5 flex gap-[1px]">
            {rows.map((r, i) => {
              const tick = yearStarts[i];
              return (
                <div key={`t-${r.ym}`} className="min-w-0 flex-1 text-center">
                  {tick && (
                    <span
                      className="k-figure nx-numeric text-[11px]"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {tick.year.slice(2)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className="mt-5 flex min-h-[46px] flex-wrap items-baseline gap-x-4 gap-y-1 pt-3"
        style={{ borderTop: '2px solid var(--k-edge)' }}
        aria-live="polite"
      >
        {shown ? (
          <>
            <span className="k-figure nx-numeric text-[15px]">{monthLabel(shown.ym)}</span>
            <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              {shown.plays > 0 ? `${num(shown.plays)} plays` : 'no listening'} ·{' '}
              {shown.spend > 0 ? inr(shown.spend) : 'no ledger was running'}
            </span>
          </>
        ) : (
          <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            Above the rule: plays, peaking at {num(maxPlays)} in a month. Below it: rupees,
            peaking at {compact(maxSpend)}. Each half is scaled to its own maximum — the shapes
            are comparable, the heights are not.
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-[11px] w-[11px] flex-none"
            style={{ background: 'var(--level-2)', border: '1px solid var(--k-edge-strong)' }}
            aria-hidden="true"
          />
          <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
            Plays
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-[11px] w-[11px] flex-none"
            style={{ background: 'var(--level-5)', border: '1px solid var(--k-edge-strong)' }}
            aria-hidden="true"
          />
          <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
            Rupees
          </span>
        </span>
      </div>
    </div>
  );
}
