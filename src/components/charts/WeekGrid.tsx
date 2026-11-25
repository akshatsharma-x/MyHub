'use client';

import { useMemo, useState } from 'react';
import { AGGREGATES } from '@/lib/archive';
import { hourLabel, num, pct } from '@/lib/format';

/**
 * Seven days by twenty-four hours, as a letterpress grid.
 *
 * Stepped, not smooth. The density is quantised into five levels and each cell
 * takes one of five flat fills — no gradient, no interpolation, no rounded
 * corners. A continuous heat ramp implies a precision this data does not have and
 * reads as a weather map; five printed steps read as a table that has been inked,
 * which is what it is.
 *
 * The finding it carries is the one the hour dial cannot: that the late hours are
 * not a weekend habit. If they were, the bottom-right of this grid would be dark
 * and the rest pale. It is not.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Five steps. The lowest is an empty cell with a rule, so a zero reads as
 *  "nothing here" rather than as the faintest possible something. */
const STEPS = [
  'var(--frame-hover-off)',
  'var(--level-1)',
  'var(--level-2)',
  'var(--amber-deep)',
  'var(--amber)',
] as const;

const STEP_LABELS = ['none', 'a little', 'some', 'a lot', 'the most'] as const;

export function WeekGrid(): React.JSX.Element {
  const grid = AGGREGATES.playsByWeekdayHour;
  const [active, setActive] = useState<{ day: number; hour: number } | null>(null);

  const { max, total } = useMemo(() => {
    let max = 0;
    let total = 0;
    for (const row of grid) {
      for (const v of row) {
        total += v;
        if (v > max) max = v;
      }
    }
    return { max: Math.max(1, max), total };
  }, [grid]);

  const stepOf = (v: number): number => {
    if (v <= 0) return 0;
    // Quantised on a square root so the four inked steps divide the *visible*
    // range rather than the raw one; on a linear split the busiest few cells take
    // the top two steps and the other 160 all collapse into step 1.
    const ratio = Math.sqrt(v / max);
    return Math.min(4, 1 + Math.floor(ratio * 4));
  };

  const shown = active ? grid[active.day]?.[active.hour] ?? 0 : null;

  return (
    <div>
      <div className="overflow-x-auto">
        {/* min-w keeps the cells from collapsing to slivers on a phone; the
            container scrolls instead, which is the honest trade for a 7×24 table.
            The page never overflows — this one element does, deliberately. */}
        <div className="min-w-[520px]">
          <div className="flex">
            <div className="w-10 flex-none" aria-hidden="true" />
            <div className="flex flex-1 gap-[2px]">
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} className="min-w-0 flex-1 text-center">
                  <span
                    className="k-figure nx-numeric text-[11px]"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-1.5 space-y-[2px]">
            {grid.map((row, day) => (
              <div key={day} className="flex items-center">
                <div className="w-10 flex-none pr-2">
                  <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
                    {DAYS[day]}
                  </span>
                </div>
                <div className="flex flex-1 gap-[2px]">
                  {row.map((value, hour) => {
                    const step = stepOf(value);
                    const isActive = active?.day === day && active?.hour === hour;
                    return (
                      <button
                        key={hour}
                        type="button"
                        onMouseEnter={() => setActive({ day, hour })}
                        onMouseLeave={() => setActive(null)}
                        onFocus={() => setActive({ day, hour })}
                        onBlur={() => setActive(null)}
                        className="min-w-0 flex-1 cursor-default"
                        style={{
                          height: 22,
                          background: STEPS[step],
                          border: `${isActive ? 2 : 1}px solid ${
                            isActive ? 'var(--text-primary)' : 'var(--k-edge)'
                          }`,
                        }}
                        aria-label={`${DAYS[day]} at ${hourLabel(hour)}: ${num(value)} plays`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The readout, in words rather than as a coordinate pair. */}
      <div
        className="mt-5 flex min-h-[46px] flex-wrap items-baseline gap-x-4 gap-y-1 pt-3"
        style={{ borderTop: '2px solid var(--k-edge)' }}
        aria-live="polite"
      >
        {active && shown !== null ? (
          <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            <span className="k-figure nx-numeric">{num(shown)}</span> plays began on a{' '}
            {DAYS[active.day] === 'Sun' || DAYS[active.day] === 'Sat' ? 'weekend ' : ''}
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
              active.day
            ]}{' '}
            in the {hourLabel(active.hour)} hour — {pct(shown / total, 1)} of the whole week.
          </span>
        ) : (
          <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            Hover or focus a cell to read its count. Every row uses the same five steps, so the
            days can be compared against each other.
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {STEPS.map((fill, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <span
              className="h-[11px] w-[11px] flex-none"
              style={{ background: fill, border: '1px solid var(--k-edge-strong)' }}
              aria-hidden="true"
            />
            <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
              {STEP_LABELS[i]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
