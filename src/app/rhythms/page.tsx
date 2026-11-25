'use client';

import { PATTERNS } from '@/lib/engine';
import { num } from '@/lib/format';
import { HourDial } from '@/components/charts/HourDial';
import { MonthlySpine } from '@/components/charts/MonthlySpine';
import { WeekGrid } from '@/components/charts/WeekGrid';
import { PatternBlock } from '@/components/pattern/PatternBlock';
import { Slug } from '@/components/ui/Slug';

/**
 * Rhythms — what was true about this person that they never noticed.
 *
 * Insight, not summary. The distinction is enforced structurally: nothing on this
 * page is a bare number. The dial states its finding in words beside the chart,
 * every pattern carries a figure *and* an explanation *and* the receipts it rests
 * on, and the monthly spine exists to make one comparison rather than to report
 * two series.
 *
 * There is deliberately no row of bordered metric tiles at the top. That is the
 * KPI dashboard the design language forbids, and it would also be the wrong
 * answer to this page's question: "5,342 hours" is a fact about a file, while
 * "the archive has no noon" is a fact about a person.
 */
export default function RhythmsPage(): React.JSX.Element {
  return (
    <div className="space-y-8">
      {/* ── 1. The hour dial ─────────────────────────────────────────────── */}
      <section className="k-paper k-panel">
        <div className="px-5 pt-5 pb-4 sm:px-6">
          <Slug>The headline</Slug>
          <h2 className="k-display-sm mt-2">THE ARCHIVE HAS NO NOON</h2>
          <p className="nx-support mt-3 max-w-[70ch]">
            Of everything in these three files, this is the finding that holds up
            best, because it is measured over the largest number of rows and needs
            no inference at all. Ten years of listening, bucketed by the hour the
            track started.
          </p>
        </div>
        <hr className="k-rule-hard" />
        <div className="p-5 sm:p-6">
          <HourDial />
        </div>
      </section>

      {/* ── 2. The week grid ────────────────────────────────────────────── */}
      <section className="k-paper k-panel">
        <div className="px-5 pt-5 pb-4 sm:px-6">
          <Slug>Seven days by twenty-four hours</Slug>
          <h2 className="k-display-sm mt-2">IT IS NOT A WEEKEND HABIT</h2>
          <p className="nx-support mt-3 max-w-[70ch]">
            The obvious explanation for a midnight peak is that it happens on
            Fridays and Saturdays. This grid is where that explanation fails: the
            late band runs across all seven rows, which makes it a schedule rather
            than a celebration.
          </p>
        </div>
        <hr className="k-rule-hard" />
        <div className="p-5 sm:p-6">
          <WeekGrid />
        </div>
      </section>

      {/* ── 3. The patterns ─────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <Slug>Mined, not written</Slug>
          <h2 className="k-display-sm mt-2">{num(PATTERNS.length)} THINGS THE ENGINE FOUND</h2>
          <p className="nx-support mt-3 max-w-[70ch]">
            Each one is a figure, what it means, and the receipts that prove it. The
            third part is the one that matters — open the slips and check the claim.
            Nothing here is asserted without something to open.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {PATTERNS.map((p) => (
            <PatternBlock key={p.id} pattern={p} />
          ))}
        </div>
      </section>

      {/* ── 4. The monthly spine ────────────────────────────────────────── */}
      <section className="k-paper k-panel">
        <div className="px-5 pt-5 pb-4 sm:px-6">
          <Slug>Music against money</Slug>
          <h2 className="k-display-sm mt-2">WHERE THE LEDGER GOES QUIET</h2>
          <p className="nx-support mt-3 max-w-[70ch]">
            Both series, month by month, on one axis. The listening never stops. The
            money stops for three years and then restarts in a different form — and
            that break is a fact about which files exist, not about which years were
            lived.
          </p>
        </div>
        <hr className="k-rule-hard" />
        <div className="p-5 sm:p-6">
          <MonthlySpine />
        </div>
      </section>
    </div>
  );
}
