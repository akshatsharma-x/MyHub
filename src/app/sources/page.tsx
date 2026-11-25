import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { META, RECEIPTS, SOURCES } from '@/lib/archive';
import { num, pct } from '@/lib/format';
import { kindDef } from '@/lib/kinds';
import { routeMetadata } from '@/lib/routes';
import type { ReceiptKind } from '@/lib/types';
import { KindIcon } from '@/components/receipt/KindIcon';
import { Slug } from '@/components/ui/Slug';

// The one route that renders on the server, so it names itself directly; the
// client-rendered routes do it through a layout.
export const metadata = routeMetadata('/sources');

/**
 * Sources — should I believe any of this?
 *
 * ── Why this page has almost no graphics ──────────────────────────────────────
 * This is the route where the design language's central claim gets tested: that
 * structure carried by type, spacing and hard rules is enough. There is no chart
 * on it, no meter, and no colour doing any work beyond the slug and the kind
 * marks. If it still reads as deliberate — if the hierarchy is obvious and the
 * long caveats are comfortable rather than a wall — the claim holds. If it had
 * needed a chart to look finished, it never did.
 *
 * Set at reading width throughout, because the one thing a page about
 * credibility cannot be is hard to read.
 *
 * ── The content rules ─────────────────────────────────────────────────────────
 * 1. Every caveat is printed in full, at body size, in the same ink as
 *    everything else. Small print is a way of disclosing something while hoping
 *    nobody reads it, and this page exists precisely so someone does.
 * 2. The per-source caveats state the *findings*. The defects section states the
 *    *decisions* taken because of them — so the two are not the same text twice,
 *    they are the problem and the standing rule.
 * 3. Every figure is read off `SOURCES`, `META` or `RECEIPTS`. A page arguing
 *    that the numbers can be checked cannot hand-type one of them.
 *
 * This is a server component: no state, nothing to hydrate. That is itself part
 * of the answer to "where does the data come from" — it is in the bundle, and
 * this is a document.
 */

const RECONSTRUCTED: Array<{ kind: ReceiptKind; rule: string; basis: string }> = [
  {
    kind: 'search',
    rule: 'An artist with at least fifty lifetime plays earns one receipt, placed twenty minutes before the first of their sessions the archive kept — the look-up precedes the listen. Any offset is a choice, so it is a small one and it is stated.',
    basis: 'That session. Open the slip and it is there.',
  },
  {
    kind: 'photo',
    rule: 'Any week in which the card ledger records uses in three or more cities becomes one frame — a journey, whether or not anyone actually pointed a camera at it.',
    basis: 'The card rows from that week, each one openable.',
  },
  {
    kind: 'message',
    rule: 'Ledger rows categorised as a gift, a transfer or pocket money become one implied exchange, on the reasoning that money does not move between two people in silence.',
    basis: 'The single ledger entry it was read from.',
  },
];

/**
 * Found / done. The `found` is why a rule exists; the `done` is the rule. Both
 * halves matter: a defect list without the response is an apology, and a
 * response without the defect is a boast.
 */
const DEFECTS: Array<{ found: string; done: string }> = [
  {
    found:
      'The streaming export documents its timestamps as UTC. Read that way and converted to Indian time, the listening peaks at 05:00 and all but stops at 17:00 — which is nobody’s day.',
    done:
      'They are used exactly as written, unshifted. Read as-is they peak at midnight and empty at noon, which is a person. The histogram decided this, not the documentation.',
  },
  {
    found:
      'The household ledger writes its dates day-first with inconsistent padding. The card ledger writes them month-first, including dates of birth.',
    done:
      'Two parsers, each reading its own file’s convention, and neither of them is new Date(string) — which would have silently read half of one file as a different month.',
  },
  {
    found: 'Many household rows carry a date but no time at all.',
    done:
      'Filed at midday, tagged time-unknown, and excluded from every chart plotted against the hour. The tag prints on the receipt, so a placeholder is never mistaken for a reading.',
  },
  {
    found:
      'The card ledger’s coordinates are synthetic — almost none of the rows carrying a latitude and longitude fall inside India — and the great majority of its cities appear under more than one state.',
    done:
      'No map is drawn anywhere in this project. A map would have looked impressive and been a lie. City names are real and are used as written; the state column is not shipped at all.',
  },
  {
    found:
      'The card ledger’s fraud label is true on just under half its rows, because the file was balanced for training a classifier. Every merchant name in it carries a fraud_ prefix for the same reason.',
    done:
      'The prefix is stripped and the merchant underneath is used. Flagged charges are shown, and the receipt says the flag describes how the dataset was built rather than something that happened to anyone. It is never dressed up as a mystery.',
  },
  {
    found:
      'The household ledger’s places were already anonymised at source as “Place 0” to “Place 5”.',
    done:
      'Preserved exactly, in the app and on every receipt. Inventing names for them would have been the single most dishonest thing available here.',
  },
  {
    found:
      'The card ledger carries card numbers, legal names, street addresses and dates of birth for something over a thousand people.',
    done:
      'None of it is shipped, beyond the one attribution stated above. The rule was to keep only the last four digits of a card number — then the column turned out to hold no last four digits to keep: every value was written out of a float, arriving either rounded to trailing zeros or printed as 4.42786e+18. Digits read off either shape are an artefact of the notation, not a card, so the line was removed rather than repaired.',
  },
];

const PIPELINE: ReadonlyArray<readonly [string, string]> = [
  ['tools/etl.mjs', 'reads the three CSVs — the only code in the project that ever touches them'],
  [
    'src/data/archive.json',
    'one static file: the receipts, the aggregates, and the source ledger printed above',
  ],
  ['src/lib/archive.ts', 'imports it and types it — the single seam where JSON becomes data'],
  [
    'src/lib/engine/',
    'derives the links, threads, patterns, chapters and entity graph, once, in memory',
  ],
];

export default function SourcesPage(): React.JSX.Element {
  const reconstructedTotal = RECEIPTS.filter((r) => r.provenance === 'reconstructed').length;
  const observedTotal = RECEIPTS.length - reconstructedTotal;
  const countOf = (kind: ReceiptKind): number => RECEIPTS.filter((r) => r.kind === kind).length;
  const totalRows = SOURCES.reduce((sum, s) => sum + s.rows, 0);

  return (
    <div className="mx-auto max-w-[74ch] space-y-9 pb-4">
      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <header>
        <Slug>Sources</Slug>
        {/* h2, not h1: the topbar already prints the page's one h1. */}
        <h2 className="k-display mt-2">SHOULD I BELIEVE ANY OF THIS?</h2>
        <p
          className="mt-5 text-[15px] leading-[1.75] sm:text-[17px]"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
        >
          Three public datasets, none of them about the same person, read together
          as though they were. That is a real liberty, and this page is where it is
          accounted for: what each file actually is, what had to be inferred, what
          is wrong with the data, and how it reaches your browser. Nothing here is
          in small print.
        </p>
      </header>

      <hr className="k-rule-hard" />

      {/* ── The join ─────────────────────────────────────────────────────── */}
      <section className="k-paper k-panel p-5 sm:p-7">
        <Slug>The join, stated plainly</Slug>
        <h2 className="k-display-sm mt-2">ONE ARCHIVE, THREE UNRELATED FILES</h2>
        <div
          className="mt-4 space-y-4 text-[15px] leading-[1.75]"
          style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
        >
          <p>
            The three files share no identifier, no format, and no idea of what a
            record is. One is a listening log, one is a hand-typed cash book, one is
            a card-transaction set built for fraud-detection research. They are
            joined on the only two things they have in common: <em>when</em>{' '}
            something happened, and the <em>names</em> inside it.
          </p>
          <p>
            {/* No count of people is stated here on purpose. This sentence used to
                open "The card file holds 1,500 cardholders", and that figure is in
                none of the file's identity columns — they report different totals
                from each other, and one customer id can carry five different
                people's names. The exact counts are measured in the ETL and printed
                in this source's caveat above, so the claim a reader can check sits
                next to the numbers backing it instead of being retyped here. */}
            Not one person in the card file has a usable personal timeline in it —
            its rows are shuffled across people by design, and its own identity
            columns disagree about how many people that even is. So that layer is
            not attributed to an individual out of the file, and neither is the
            archive. The archive is given one owner from outside all three files:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{META.owner.name}</strong>
            {/* Printed as authored. An earlier version lower-cased `work` to make
                it read as mid-sentence prose, which was safe for a title like
                "Software engineer" and wrong the moment the value carried an
                acronym — it rendered "cse undergraduate". Case belongs to
                whoever supplied the value, not to the sentence quoting it. */}
            , {META.owner.work} at {META.owner.at}.
          </p>
          <p>
            Being plain about what that does and does not mean:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              no row in any of these files is the owner’s.
            </strong>{' '}
            Nobody named here played these tracks, kept this cash book or carried
            this card. The name is whose archive this is <em>built as</em>, and
            the three ledgers are public data read against one real calendar —
            which is a liberty, stated here, and not a claim about anybody’s week.
          </p>
          <p>
            An earlier version of this page had it the other way round. The owner
            was lifted out of the card file — a row with a name, a date of birth
            and a job title — and that looked like the more rigorous choice
            precisely because every field had a citation. It was worse. A shuffled
            row’s date of birth describes nobody’s decade, so every reading built
            on it was a guess with a footnote: the cash book <em>must</em> be a
            nineteen-year-old’s, August 2018’s large credit <em>must</em> be a
            first salary. Naming the owner from outside is the more honest of the
            two, because it can be checked and it stops pretending.
          </p>
          <p>
            What is <em>not</em> invented is any figure attached to any of it.
            Every number in this project is computed from the rows, and every
            receipt states which file it came from. The claim is never “this
            happened to this person”. The claim is “this is what these records say
            once you stop reading them one at a time”.
          </p>

          {/* The anchors are the only facts in the archive with no source file
              behind them, so they are printed under a heading that says so
              rather than being folded into the prose above. A fact that cannot
              point at a row has to point at something. */}
          <div className="pt-1">
            <Slug>Facts from outside the files</Slug>
            <p className="nx-support mt-2">
              Three dated anchors, from {META.owner.name}’s own record. They are
              what let a chapter name a school year instead of estimating an age,
              and they select, drop and date exactly nothing.
            </p>
            <dl className="mt-4 space-y-2">
              {META.owner.anchors.map((anchor) => (
                <div
                  key={anchor.label}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pb-2"
                  style={{ borderBottom: '1px solid var(--k-edge)' }}
                >
                  <dt className="k-figure nx-numeric flex-none text-[13px]">{anchor.year}</dt>
                  <dd
                    className="min-w-0 flex-1 text-[14px]"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                  >
                    {anchor.label}
                    {anchor.note ? (
                      <span className="k-label ml-2" style={{ color: 'var(--text-tertiary)' }}>
                        {anchor.note}
                      </span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <p>
            The spans do not fully overlap, and that shows. The cash book stops in
            2018; the card file starts in 2022. Three years in the middle hold music
            and no money at all — and the app prints that as a finding rather than
            smoothing it over.
          </p>
        </div>
      </section>

      {/* ── The three sources ────────────────────────────────────────────── */}
      <section>
        <Slug>What each file is</Slug>
        <h2 className="k-display-sm mt-2">THE LEDGER OF SOURCES</h2>
        <p className="nx-support mt-3">
          {num(totalRows)} rows across three files, read once at build time.
        </p>

        <div className="mt-5 space-y-5">
          {SOURCES.map((source) => (
            <article key={source.id} className="k-paper k-panel p-5 sm:p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="k-display-sm break-words">{source.label}</h3>
                <span
                  className="break-all text-[12px]"
                  style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body-mono)' }}
                >
                  {source.file}
                </span>
              </div>

              <p
                className="mt-3 text-[15px] leading-[1.7]"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
              >
                {source.what}
              </p>

              {/* The figures sit on a rule, in the same four positions for all
                  three files — so they can be compared down the page without any
                  of them being put in a box. */}
              <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
                {[
                  { label: 'rows in the file', value: num(source.rows) },
                  { label: 'receipts it fed', value: num(source.receipts) },
                  { label: 'span in the file', value: source.span },
                  {
                    label: 'rows per receipt',
                    value:
                      source.receipts > 0
                        ? `${(source.rows / source.receipts).toFixed(1)}:1`
                        : '—',
                  },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="min-w-0 pt-2"
                    style={{ borderTop: '2px solid var(--k-edge)' }}
                  >
                    <dd className="k-figure nx-numeric block break-words text-[17px] leading-tight">
                      {f.value}
                    </dd>
                    <dt className="k-label mt-2 block" style={{ color: 'var(--text-tertiary)' }}>
                      {f.label}
                    </dt>
                  </div>
                ))}
              </dl>

              <div className="mt-5">
                <Slug>Kinds it feeds</Slug>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {source.feeds.map((kind) => (
                    <span key={kind} className="inline-flex items-center gap-1.5">
                      <KindIcon kind={kind} size={11} />
                      <span className="k-label" style={{ color: 'var(--text-tertiary)' }}>
                        {kindDef(kind).plural}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              <hr className="k-rule-thin my-5" />

              <Slug>What is wrong with it</Slug>
              <p
                className="mt-2.5 text-[15px] leading-[1.75]"
                style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
              >
                {source.caveat}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ── What was left out ───────────────────────────────────────────── */}
      <section>
        <Slug>What was left out</Slug>
        <h2 className="k-display-sm mt-2">
          {num(RECEIPTS.length)} RECEIPTS, NOT {num(totalRows)} ROWS
        </h2>
        <div
          className="mt-4 space-y-4 text-[15px] leading-[1.75]"
          style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
        >
          <p>
            A hundred and fifty thousand plays cannot ship to a browser, and a
            hundred and fifty thousand plays are not a story either. So two
            reductions happen, and both are stated here rather than left for someone
            to notice.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Plays become sessions.</strong>{' '}
            Consecutive plays less than thirty minutes apart are one receipt — the
            sitting, not the track, which is the unit a person would recognise having
            lived. A sitting has to reach four tracks and ten minutes to count;
            below that it is a track sampled and abandoned, and there are tens of
            thousands of those.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>
              Each kind is then capped by striding.
            </strong>{' '}
            Where a bucket exceeds its cap, the kept rows are taken at an even stride
            across the time-sorted list, so what survives is spread over the decade
            instead of piling into whichever year happened to be densest. It is a
            sample — and being a stride rather than a shuffle, it is the same sample
            on every rebuild.
          </p>
          <p>
            Two things follow. The charts and totals — plays, hours, spend by month —
            are computed over the <em>whole</em> files, before any cap; the receipts
            you can open and filter are the sample. And receipts before 2015 are
            dropped outright: the streaming export opens in 2013 with 185 plays that
            year and 23 the next, which is the tail of an account rather than a year
            of a life.
          </p>
        </div>
      </section>

      {/* ── Observed vs reconstructed ────────────────────────────────────── */}
      <section className="k-paper k-panel p-5 sm:p-7">
        <Slug>Observed and reconstructed</Slug>
        <h2 className="k-display-sm mt-2">WHAT WAS READ, AND WHAT WAS INFERRED</h2>

        <div
          className="mt-4 space-y-4 text-[15px] leading-[1.75]"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
        >
          <p>
            The brief asks for nine kinds of receipt. Six of them are in the files.
            Three are not — and rather than fake them or quietly drop them, the
            engine derives each one from something that <em>is</em> recorded, and
            marks every result as derived.
          </p>
          <p>
            So, plainly:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              no photo, message or search in this archive records a real photo,
              message or search.
            </strong>{' '}
            Each is an inference with a stated rule, and each carries the receipts it
            was drawn from — openable, from the slip itself, so the inference can be
            checked instead of taken on trust. The colour says so too: the six read
            kinds each hold a step of the ramp, and all three inferred kinds share
            one neutral grey.
          </p>
        </div>

        <dl className="mt-6 space-y-5">
          {RECONSTRUCTED.map(({ kind, rule, basis }) => (
            <div key={kind} className="pt-4" style={{ borderTop: '2px solid var(--k-edge)' }}>
              <dt className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <KindIcon kind={kind} size={12} />
                <span className="k-figure text-[15px] uppercase tracking-wide">
                  {kindDef(kind).plural}
                </span>
                <span
                  className="k-label nx-numeric ml-auto"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {num(countOf(kind))} receipts
                </span>
              </dt>
              <dd
                className="mt-2 text-[15px] leading-[1.7]"
                style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
              >
                {rule}
              </dd>
              <dd className="k-label mt-2.5" style={{ color: 'var(--text-tertiary)' }}>
                Basis: {basis}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-7 grid grid-cols-2 gap-5 sm:grid-cols-3">
          {[
            { value: num(observedTotal), label: 'receipts read from a file' },
            { value: num(reconstructedTotal), label: 'receipts the engine inferred' },
            {
              value: pct(reconstructedTotal / Math.max(1, RECEIPTS.length), 1),
              label: 'of the archive is inference',
            },
          ].map((f) => (
            <div
              key={f.label}
              className="min-w-0 pt-2"
              style={{ borderTop: '2px solid var(--k-edge)' }}
            >
              <span className="k-figure nx-numeric block break-words text-[22px] leading-none">
                {f.value}
              </span>
              <span className="k-label mt-2 block" style={{ color: 'var(--text-tertiary)' }}>
                {f.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Known defects ───────────────────────────────────────────────── */}
      <section>
        <Slug>Known defects</Slug>
        <h2 className="k-display-sm mt-2">WHAT IS BROKEN, AND WHAT WAS DONE</h2>
        <p className="nx-support mt-3">
          Each pair is a finding and the rule it produced. All of them were found by
          checking the data rather than by reading its documentation — and in the
          first case the documentation was simply wrong.
        </p>

        <dl className="mt-6 space-y-7">
          {DEFECTS.map((d, i) => (
            <div key={d.found} className="pt-4" style={{ borderTop: '2px solid var(--k-edge)' }}>
              <div className="flex gap-3.5">
                <span
                  className="k-figure nx-numeric flex-none text-[12px] leading-[1.7]"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <dt
                  className="min-w-0 text-[15px] leading-[1.7]"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                >
                  {d.found}
                </dt>
              </div>
              {/* The response is set behind a hard rule rather than a coloured
                  mark. This section sits on the room, and the room is cream in the
                  light theme — amber on cream is 1.8:1, and a marker that cannot
                  be seen in one of the two themes is not a marker. */}
              <dd
                className="ml-[26px] mt-3 border-l-2 pl-4 text-[15px] leading-[1.7]"
                style={{
                  borderColor: 'var(--k-edge)',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {d.done}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── How it reaches the browser ──────────────────────────────────── */}
      <section className="k-paper k-panel p-5 sm:p-7">
        <Slug>How the data reaches you</Slug>
        <h2 className="k-display-sm mt-2">THERE IS NO BACKEND</h2>

        <p
          className="mt-4 text-[15px] leading-[1.75]"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
        >
          Not “no backend yet”, and not a backend hidden behind a route handler. The
          three CSVs are read once, at build time, by a script that runs on a
          developer’s machine and never ships. It writes one JSON file. That file is
          imported as a module, so it is compiled into the bundle like any other
          constant.
        </p>

        <ol className="mt-6 space-y-3.5">
          {PIPELINE.map(([path, what], i) => (
            <li key={path} className="flex gap-3.5">
              <span
                className="k-figure nx-numeric flex-none text-[12px] leading-[1.6]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0">
                <span
                  className="block break-all text-[13px]"
                  style={{ fontFamily: 'var(--font-body-mono)', color: 'var(--text-primary)' }}
                >
                  {path}
                </span>
                <span
                  className="mt-1 block text-[15px] leading-[1.6]"
                  style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
                >
                  {what}
                </span>
              </span>
            </li>
          ))}
        </ol>

        <hr className="k-rule-thin my-6" />

        <div
          className="space-y-4 text-[15px] leading-[1.75]"
          style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
        >
          <p>
            Which means: no API, no database, no authentication, no runtime query of
            any kind, and not one network request after the page loads. Filtering{' '}
            {num(RECEIPTS.length)} receipts on{' '}
            <Link href="/roll" className="underline">
              the roll
            </Link>{' '}
            is a synchronous pass over an array already in memory — which is why it
            has no spinner and needs no debounce.
          </p>
          <p>
            One thing is persisted, and only one: the light-or-dark choice, under a
            single key in{' '}
            <code style={{ fontFamily: 'var(--font-body-mono)' }}>localStorage</code>.
            What you have read, what you have opened, and where you had got to in the
            story are all held in memory and deliberately forgotten when the tab
            closes.
          </p>
        </div>
      </section>

      {/* ── Out ─────────────────────────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap gap-3">
          <Link href="/story" className="k-btn k-btn-outline">
            Read the argument
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
          <Link href="/roll" className="k-btn k-btn-outline">
            Check it against the receipts
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
