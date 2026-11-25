'use client';

import { useMemo, useState } from 'react';
import { AGGREGATES } from '@/lib/archive';
import { hourLabel, num, pct } from '@/lib/format';

/**
 * Twenty-four hours of listening, drawn as a column of hard blocks.
 *
 * This is the archive's single strongest finding, so it gets the largest graphic
 * on the page: 10,884 plays begin in the midnight hour and 724 begin at noon — a
 * fifteen-fold difference, measured over all 149,860 rows rather than over the
 * receipts that shipped.
 *
 * ── Why a bar chart and not a clock face ──────────────────────────────────────
 * A radial dial is the obvious metaphor for hours and the wrong chart for this
 * data. Radial segments encode magnitude as area, which people read badly, and
 * the two facts here are *comparisons* — midnight against noon, the peak against
 * the trough. A common baseline is what makes a comparison readable, and a
 * baseline is exactly what a circle does not have. So: a straight run of columns,
 * from 00:00 to 23:00, with the peak and the trough labelled in place rather than
 * left for the reader to hunt for.
 *
 * The annotation is the point. An unlabelled chart asks the reader to find the
 * finding; this one states it and lets them verify it.
 */

const DIAL_PX = 236;

/** Night is 22:00–04:00 inclusive — the window the pattern engine also uses, so
 *  the shaded band and the prose agree. */
function isNight(hour: number): boolean {
  return hour >= 22 || hour <= 4;
}

export function HourDial(): React.JSX.Element {
  const hours = AGGREGATES.playsByHour;
  const [active, setActive] = useState<number | null>(null);

  const { max, peak, trough, total, nightShare } = useMemo(() => {
    let max = 0;
    let peak = 0;
    let trough = 0;
    let total = 0;
    let night = 0;
    for (let h = 0; h < hours.length; h++) {
      const v = hours[h];
      total += v;
      if (isNight(h)) night += v;
      if (v > hours[peak]) peak = h;
      if (v < hours[trough]) trough = h;
      if (v > max) max = v;
    }
    return { max: Math.max(1, max), peak, trough, total, nightShare: total > 0 ? night / total : 0 };
  }, [hours]);

  const shown = active !== null ? active : null;

  return (
    <div>
      <div className="flex items-end gap-[2px] sm:gap-1" style={{ height: DIAL_PX }}>
        {hours.map((value, hour) => {
          const heightPct = (value / max) * 100;
          const marked = hour === peak || hour === trough;
          const dim = shown !== null && shown !== hour;

          return (
            <button
              key={hour}
              type="button"
              onMouseEnter={() => setActive(hour)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(hour)}
              onBlur={() => setActive(null)}
              className="flex h-full min-w-0 flex-1 cursor-default flex-col justify-end"
              style={{ opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease' }}
              aria-label={`${hourLabel(hour)}: ${num(value)} plays begin in this hour`}
            >
              <span
                className="w-full"
                style={{
                  height: `${Math.max(1.2, heightPct)}%`,
                  // The peak and the trough are the two facts, so they carry the
                  // amber fill. Every other hour is ink. One accent, used as a
                  // printed block, exactly as the language allows.
                  background: marked ? 'var(--amber)' : 'var(--level-2)',
                  border: `2px solid ${
                    shown === hour ? 'var(--text-primary)' : 'var(--k-edge-strong)'
                  }`,
                  // A night hour is marked by a heavier left edge rather than a
                  // second fill colour, so the band survives in greyscale.
                  borderLeftWidth: isNight(hour) ? 4 : 2,
                }}
              />
            </button>
          );
        })}
      </div>

      {/* The axis. Every third hour is labelled past sm; below it, every sixth —
          24 four-character labels do not fit in 320px and a rotated axis is not a
          fix. */}
      <div className="mt-2 flex gap-[2px] sm:gap-1">
        {hours.map((_, hour) => (
          <div key={hour} className="min-w-0 flex-1 text-center">
            <span
              className="k-figure nx-numeric text-[11px]"
              style={{
                color: hour === peak || hour === trough ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              <span className={hour % 6 === 0 ? '' : 'hidden sm:inline'}>
                {hour % 3 === 0 ? String(hour).padStart(2, '0') : <span className="invisible">00</span>}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* The readout. Holds its height so hovering never reflows the section. */}
      <div
        className="mt-5 flex min-h-[52px] flex-wrap items-baseline gap-x-4 gap-y-1 pt-3"
        style={{ borderTop: '2px solid var(--k-edge)' }}
        aria-live="polite"
      >
        {shown !== null ? (
          <>
            <span className="k-figure nx-numeric text-[22px]">{hourLabel(shown)}</span>
            <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              {num(hours[shown])} plays begin in this hour — {pct(hours[shown] / total, 1)} of
              everything ever played.
            </span>
          </>
        ) : (
          <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            The two amber columns are the peak and the trough. The heavier left edge marks
            22:00 to 04:00, which holds {pct(nightShare)} of all listening.
          </span>
        )}
      </div>

      {/* The finding, stated. This is the annotation the chart exists for. */}
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div style={{ borderLeft: '3px solid var(--amber)', paddingLeft: 12 }}>
          <div className="k-figure nx-numeric text-[28px] leading-none">{num(hours[peak])}</div>
          <p className="k-label mt-2">plays begin at {hourLabel(peak)} — the busiest hour</p>
        </div>
        <div style={{ borderLeft: '3px solid var(--amber)', paddingLeft: 12 }}>
          <div className="k-figure nx-numeric text-[28px] leading-none">{num(hours[trough])}</div>
          <p className="k-label mt-2">begin at {hourLabel(trough)} — the emptiest</p>
        </div>
      </div>

      <p className="nx-support mt-4 max-w-[70ch]">
        Measured over all {num(total)} plays in the streaming export, not over the receipts
        that shipped. Receipts tagged <span className="k-label">time-unknown</span> — the
        household ledger rows that recorded a date but no time — are excluded from every
        hour figure on this page rather than being assigned a plausible-looking one.
      </p>
    </div>
  );
}
