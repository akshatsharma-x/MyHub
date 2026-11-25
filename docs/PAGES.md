# MyHUB — route specification

Eight routes. Each one earns its place by answering a different question, and no
two overlap. Read this alongside `docs/DATA_BRIEF.md` (what the data is) and
`docs/SOURCES.md` (what it does and does not know).

The judged requirements and where each is met:

| requirement | met by |
|---|---|
| 1. a way to explore the receipts | `/roll` primarily, plus every page's click-through to the overlay |
| 2. meaningful filtering / searching / navigation | `/roll` — full-text, faceted, sorted, with live counts |
| 3. a mechanism for discovering relationships or patterns | `/threads`, `/constellation`, `/rhythms` — three different mechanisms |
| 4. an interactive storytelling experience | `/story` primarily, `/chapters` as the browsable form |
| 5. a clear visual representation of the digital journey | `/` decade spine, `/chapters`, `/rhythms` dial and grid |
| 6. responsive design | all eight, measured at 360 / 768 / 1280 / 1920 in both themes — see below |

And the anti-requirement, which outranks all six: **do not just build a
timeline.** No route is allowed to be a chronological list of cards as its main
idea. `/roll` comes closest and is deliberately a *searchable corpus* with a
default sort, not a timeline — the day it starts reading like a feed, it has
failed.

---

## How the layout claims were checked

"Tested at four widths" is the kind of line that is usually written from having
looked at the page. These were driven through a real browser against the
production build and measured, because the two questions that matter here are
both invisible in the source:

- **64 renders** — 8 routes × 4 widths × 2 themes — each checked for horizontal
  document overflow, text clipped with no ellipsis to admit it, any text node
  whose *computed* size falls under the 11px floor, and the strings `undefined` /
  `null` / `NaN` in visible text. Plus the click-gated surfaces the load-time
  pass can never see: the receipt overlay, a second receipt opened from inside
  it, the filter rail, the mobile navigation rail, and an opened thread.
- **The 11px floor inside SVG needs its own ruler.** `getComputedStyle().fontSize`
  on an SVG label reports the size it was *specified* at, not the size it renders
  at — a 14-unit label in a 1480-unit viewBox drawn 600px wide renders at 5.7px
  and still reports 14px. That blind spot is how `/constellation` shipped labels
  under the floor in a first draft. The floor is therefore measured through each
  element's screen CTM, and the dial now carries no `<text>` at all: every name on
  it is HTML in an overlay, set in CSS pixels.
- **The dial's labels were checked by focusing all 131 nodes** at three widths and
  comparing each revealed name to the panel that has to contain it. Nothing crosses
  the edge. The binding case is not a node name but a rim kind label — the
  purchases sector's, with 12px of clearance inside the geometry box and 16px of
  panel padding beyond that before it would touch ink.
- **The two blocks that print the owner were measured separately**, because they
  are the only places where a change to `meta.owner` can reach the layout: the
  masthead's standing line on `/`, and the anchors list on `/sources`. 32 renders
  — 8 routes × {360, 1280} × 2 themes — confirm the standing line stays inside
  its row at 360px where an inline `work · at` pair is most likely to escape, and
  that the anchors list renders three rows, each with a four-digit year and a
  non-empty label, inside its box. The same pass scans visible text for a
  gendered pronoun, since the owner's are unrecorded and the archive must not
  guess them from a name.

A detector that has never fired proves nothing, so each check was also run against
the defect it exists to catch — a 9px figure, a stray `undefined`, an over-wide
block, a gendered pronoun, a dropped anchor row, an anchor row escaping its list
box, an emptied standing line — and all seven fired, each reporting clean on the
untouched page first.

**One of them had to be repaired before it could fire, and the reason generalises.**
The anchors check first located its list by matching the heading text `Facts from
outside the files`, and reported clean on every render — because a `<Slug>` is
upper-cased in CSS and `innerText` returns the *transformed* text, so the match
never hit and the check quietly measured nothing. It now finds the list by shape:
the `<dl>` whose rows pair a four-digit `<dt>` with a `<dd>`. **Never key a check
off authored casing when the value is read back through `innerText`** — it is the
same class of mistake as reading an SVG label's size off `getComputedStyle`, and
it fails the same silent way.

---

## Shared rules for every route

- The shell already provides the frame: fixed 220/60 sidebar, 56px topbar, and a
  centred `max-w-7xl` canvas with `px-5 py-6 lg:px-8 lg:py-8`. **Do not add
  another max-width, another page padding, or another `<h1>`** — the topbar
  already renders the page title. Pages start at their first section.
- Every section is introduced by a `<Slug>` and a display-face heading. The
  `.k-slug` class prints its own `//` prefix; never type the slashes.
- Vertical rhythm is `space-y-8` between sections, `space-y-4` within one.
- Panels are `.k-panel` on the dark room, or `.k-paper` where a sheet of cream
  paper is the right metaphor (long-form reading: chapter bodies, story beats,
  the sources ledger). Receipts themselves are always `.k-receipt`.
- **No page renders more than ~60 receipt cards at once.** Page, or cap and say
  what was capped — never silently truncate, and never mount 2,000 cards.
- Every number on screen goes through `src/lib/format.ts`. Every receipt is
  clickable and opens the shared overlay. Every list has an `<EmptyState>`.
- Responsive: single column under 768px, and nothing may overflow at 360px.
  Charts are SVG with `viewBox` + `preserveAspectRatio`, never a fixed pixel
  width. Filter rails collapse to a horizontal scroller or a disclosure, not a
  squeezed sidebar.
- `'use client'` wherever there is state, and there is state nearly everywhere.
  Anything reading `useSearchParams` needs a `<Suspense>` boundary around it.
- No page fetches anything. Everything comes from `@/lib/archive` and
  `@/lib/engine`, which are already computed once at module scope.

---

## `/` — The Archive

**The question:** what is this, whose is it, and where do I start?

Not a dashboard. An opening spread.

1. **The masthead.** A `.k-paper` sheet, full width. The owner's name in the
   display face at size, the span (`2015 — 2024`), and one authored sentence that
   states the premise honestly: three datasets, one reading. Under it, on the
   sheet's footer rule, **four** small figures — receipts, years, sources, hours
   listened — set as baseline-aligned inline `.k-figure` / `.k-label` pairs. **No
   bordered boxes, no cards, no KPI grid**, which is the part of this line that is
   a rule rather than a description.

   *This said "three small figures … as `<Figure>`". It is four, and none of them
   is `<Figure>`.* The component exists at `src/components/ui/Figure.tsx` and
   stacks its label under its value in a block; the footer rule needs the number
   and its noun side by side on one baseline, which a block cannot give. So the
   masthead was written inline and `<Figure>` ended up with no importers anywhere
   in `src/` — see the note at the end of this file.
2. **The decade spine.** The signature visual, and the answer to requirement 5.
   One horizontal SVG band per year, 2015→2024, each year a stack of hard-edged
   blocks coloured by receipt kind, height proportional to that year's volume.
   Under it, a thin second band showing what the archive *knows* each year —
   music-only in 2019–21, both ledgers elsewhere — so the gap is visible at a
   glance. Hovering a year shows its counts; clicking it navigates to `/roll`
   pre-filtered to that year. This single graphic must make a stranger understand
   the shape of the whole archive in about four seconds.
3. **One thread, in full.** The strongest thread from the engine, rendered as an
   actual chain of receipts with the link reasons printed between them. A working
   example of the product's whole idea, on the front page, requiring no clicks.
4. **Three patterns.** The top three from `buildPatterns`, each as a big figure +
   title + one line, linking into `/rhythms`.
5. **The six chapters** as a compact index — title, years, thesis line — linking
   into `/chapters`.
6. **A single call to the story.** One `.k-btn-amber` to `/story`.

Do not put a search box here; the topbar has one and `/roll` owns searching.

---

## `/roll` — The Roll

**The question:** where is the specific thing I am looking for?

Requirement 2, and it has to feel fast and precise.

- **Left rail (desktop) / disclosure (mobile):** the filter set, driven entirely
  by `facetsFor` so every option carries a live count under the *other* active
  filters. Kind (9, with `KindIcon` + count), year (10), source (3), provenance
  (observed / reconstructed / all), tags. `<Chip>` for each. A "clear all" that
  only appears when something is set.
- **Header row:** the search field (`.k-field`, autofocused when
  `?focus=1` — that is what ⌘K pushes, so honour it), the sort control
  (newest / oldest / amount / relevance), and `summarise()` printed as a real
  sentence: *"412 receipts · 2017–2019 · mostly purchases."*
- **Results:** `ReceiptCard` in a responsive column grid (1 / 2 / 3 / 4 across the
  breakpoints), 48 per page with real pagination or a "show 48 more" button.
  Never an infinite feed.
- **Every card shows its link count** and opens the overlay on click. The overlay
  is the bridge from searching into discovering.
- Filtering is synchronous against the memoised index — no spinner, no skeleton,
  no debounce theatre. If it ever needs a debounce, the index is wrong.
- Keyboard: `/` focuses the field, `Escape` clears it.

---

## `/threads` — Threads

**The question:** which of these things happened together?

Requirement 3, mechanism one. This is the route that directly answers the brief's
*"a song, a location, a photo, a purchase and an event may all be one moment."*

- **A thread is rendered as a chain, not a list.** Receipts left to right (wrapping
  on narrow screens), with the derived link between each pair printed **on the
  connector** in the label face. Quote the engine's real phrasing when
  documenting this, not a paraphrase: *"Only 2h apart, the same evening."* ·
  *"Both carry Saving Bank Account 1, 4h apart."* · *"Alwar returns after 3mo
  away."* An earlier draft of this line offered *"eleven days later"* as the
  example, which no link can ever print — `gapLabel` in `src/lib/format.ts`
  emits `11d`, never a spelled-out interval. The connector is a hard 2px rule
  with a small square joint — never a curved arrow, never a dashed animation.
- Header: strength, span, the kinds present as `KindIcon` row, and the authored
  `caption` — which is the sentence that tells the reader why this set of receipts
  is a moment rather than a coincidence.
- **Sorting and filtering that matter here:** strongest first (default), most
  kinds, longest span, or by a kind the thread must contain. A filter for
  "crosses at least 3 kinds" is worth having because cross-kind threads are the
  interesting ones.
- Show 12 threads, load more on demand. Each expands in place to reveal the full
  receipt set; collapsed it shows the first four plus a count.
- Mark threads seen via `ExplorationContext` — the sidebar meter reads from it.

---

## `/constellation` — Constellation

**The question:** what is connected to what, across the whole decade?

Requirement 3, mechanism two, and the route most at risk of becoming a
meaningless hairball. So: **the nodes are entities, not receipts.**

- Nodes: the top ~150 entities by receipt count — artists, merchants, categories,
  places, modes. Size by count, colour by the dominant kind of the receipts they
  appear on. Edges: co-occurrence on the same receipt or within a thread, above a
  weight floor.
- Hand-rolled SVG. A deterministic layout — seeded radial or a fixed number of
  force iterations computed once with no RNG — so the graph is the same on every
  load and can be reasoned about. Never animate a physics simulation forever.
- **Interaction is the point:** hovering an entity dims everything unconnected to
  it; clicking pins it and opens a side panel listing its receipts, its strongest
  co-occurrences, and its span. Clicking a receipt in the panel opens the overlay.
  A kind filter re-colours and re-weights the graph rather than reloading it.
- A legend, always visible, that explains what size and colour mean. A graph
  without a legend is decoration.
- **Mobile:** an SVG graph is not usable at 360px. Below `lg`, render the same
  data as a ranked, grouped entity list with the same click-through and the same
  co-occurrence panel. Same information, appropriate form — not a pinch-zoom
  canvas and not a "view on desktop" apology.

---

## `/chapters` — Chapters

**The question:** who was this person, era by era?

Requirement 4 in its browsable form, requirement 5 in its narrative form.

- Six chapters from `CHAPTERS`, each a `.k-paper` spread: the era's years as a
  large printed figure, the title, the `thesis` set large, the `body` as reading
  text at a comfortable measure (`max-w-prose`, body sans, not the display mono).
- Beside the prose, that chapter's computed `ChapterStats`: receipt count, spend,
  top artists as a small ranked bar set, the 24-slot `hourProfile` as a hard-edged
  micro-histogram, `medianHourLabel`.
- **The point of this page is comparison**, so make the chapters comparable: the
  same stat blocks in the same positions, same scales across all six, so that
  2017's density and 2019's silence are visible as shape rather than as numbers.
- A chapter navigator — a sticky rail or a top strip of six — that jumps between
  them and shows where you are.
- Each chapter ends with 4–6 representative receipts from its span and a link
  into `/roll` filtered to those years.
- `THE QUIET YEAR` will have no spend. It must render as *"the ledger stops
  here"*, stated as a finding, never as `₹—` or an empty panel. That is the test
  of whether this page was built honestly.

---

## `/rhythms` — Rhythms

**The question:** what was true about this person that they never noticed?

Requirement 3, mechanism three. Insight, not summary.

1. **The hour dial.** 24 hard-edged radial or columnar segments, IST, from
   `aggregates.playsByHour`. This is the archive's headline finding — a peak at
   midnight and an almost total absence at noon — so it gets the largest single
   graphic on the page, annotated in place: the trough labelled, not left for the
   reader to find. State that `time-unknown` receipts are excluded.
2. **The week grid.** 7×24 hard squares from `playsByWeekdayHour`, amber-stepped
   by density. No gradient fill, no smoothing, no rounded cells — a printed
   letterpress grid. Hovering a cell states the hour, day and count in words.
3. **The patterns.** All 8–14 from `buildPatterns`. Each: `figure` set very large
   in the display face, `figureLabel`, title, `detail` explaining what it *means*,
   and its `evidence` receipts as a row of small cards that open the overlay. The
   figure-plus-explanation-plus-proof triad is what separates this from a stats
   page, so no pattern ships without all three.
4. **The monthly spine** from `spendByMonth` and `playsByMonth` on one shared
   time axis, so the 2019–21 money gap is visible against continuous listening.

Do **not** build a row of four bordered metric tiles at the top of this page.
That is the KPI dashboard the design language explicitly forbids.

---

## `/story` — Story

**The question:** what does it all mean?

Requirement 4, and the route that has to land the brief's *Raw Data → Insights →
Connections → Story* arc. This is the closing argument.

- A **paced, stepped narrative** — 8–12 beats, one at a time, advanced by the
  reader (a `.k-btn` pair, arrow keys, and a beat index down the side). Not an
  autoplaying slideshow, not a scroll-jacked scroller, and not a wall of prose.
  The reader controls the pace, always, and can jump to any beat.
- **Each beat pairs an authored sentence with the evidence for it**: a figure, a
  graphic, or a live receipt/thread pulled from the engine. The prose is never
  alone on screen and the data is never unexplained.
- The arc, roughly:
  1. 149,860 plays and 12,728 transactions — raw exhaust, meaningless.
  2. Aggregate them and a person appears: the archive has no noon.
  3. Money says what music cannot: milk, autos, pocket money — a household
     counting out loud with a student in it. **Not "a school-age child",** which
     is what this line and the beat both said until the rows were checked: four
     auto fares name a university campus, the whole `Education` column is xerox
     and print-outs, no row anywhere carries a school fee or a uniform, and the
     one "school" in the file is a motor driving school. The beat now names a
     student and explicitly declines to supply an age.
  4. 2018-08-31: ₹70,255 in at 09:27, ₹118 back out as a farewell contribution
     at 15:12. One day, one ledger — and the income is the household's, which
     the anchors settle rather than assume.
  5. Taste is not random — 2016, the Beatles arrive and everything reorganises.
  6. 2020: the Killers overtake them. The world is indoors.
  7. 2022: the language changes. Sabina, Drexler, Juanes.
  8. Connections: one thread, in full, as proof that separate records are one
     moment.
  9. What the archive does not know — 2019–21 has music and no money; photos,
     messages and searches are inferences, and here is their basis.
  10. What it adds up to. One paragraph. Earned, specific, and not a greeting
      card.
- Ends with routes out: the roll, the chapters, the sources.
- Every factual claim in every beat must be computed or cited, and the beat
  should show the number it claims.

---

## `/sources` — Sources

**The question:** should I believe any of this?

The route that makes everything above credible, rendered from
`ARCHIVE.sources` (`SourceLedger[]`) and `docs/SOURCES.md`.

- A `.k-paper` ledger, one block per source: file name, what it actually is, row
  count, span, receipts fed, which kinds it feeds, and its `caveat` printed in
  full rather than in small print.
- **The join, stated plainly** — the persona, why it is defensible, and that
  nobody in dataset C has a usable individual timeline. The page states the
  identity-column disagreement (1,019 customer ids · 1,330 card numbers · 1,279
  names, and 230 of 917 ids carrying more than one person's name) rather than a
  count of people, because the file does not have one. **Not "1,500 people",**
  which is what this line said until the columns were counted.
- **Observed vs reconstructed** — the three inferred kinds, the rule each one
  uses, and the honest sentence: no photo, message or search here records a real
  photo, message or search.
- **Known defects and what was done** — UTC→IST, day-first vs month-first,
  `time-unknown`, the broken coordinates (and therefore no map), the `fraud_`
  prefix, the ~92% fill rate, the preserved `Place N` anonymisation, and the
  `cc_num` column that was written out of a float and so ships nothing at all.
- **How the data reaches the browser** — build-time ETL → static JSON → bundled
  import. No backend, no API, no database, no runtime network call. One
  localStorage key, for the theme.

Set this page at reading width and treat it as typography. It is the one route
where the design language's claim — that structure carried by type, spacing and
hard rules is enough — gets tested with almost no graphics to hide behind.

---

## The receipt overlay (shared, not a route)

One component, mounted once, reachable from every page.

- In-memory state only, in a small context (`openReceiptId` / `openThreadId`).
  **No URL state, no localStorage** — closing the tab forgets it, deliberately.
- Renders `ReceiptSheet`: the full receipt, every line, every tag, the provenance
  stamp with its basis, and — the important part — **its related receipts with the
  derived reason printed for each**, from `relatedTo(id)`. Clicking one navigates
  the overlay to that receipt, so a reader can walk the graph receipt by receipt
  without ever leaving the page they came from.
- A back affordance for that walk, a close on `Escape` and on backdrop click,
  focus trapped while open and returned to the trigger on close, and
  `aria-modal`. The backdrop is a flat scrim — **no blur**.
- Marks the receipt seen in `ExplorationContext` on open, which is what drives the
  sidebar's exploration meter.
- Full height on mobile, a right-hand sheet or centred panel on desktop. It must
  be usable at 360px with a long note body and a dozen related receipts.

---

## Unused: `src/components/ui/Figure.tsx`

Nothing in `src/` imports it. Verified by grepping every `.ts`/`.tsx` under `src`
for the identifier and finding only its own declaration.

It is a correct component and it reads like the rest of the build — value through
`@/lib/format`'s `text` with a `—` fallback, the amber emphasis done as a printed
3px left rule rather than as coloured type, `k-label` for the noun. It was written
for the masthead. The masthead needed its number and noun on one baseline, so it
was built from inline `.k-figure` / `.k-label` spans instead (see §1), and every
later surface that shows a figure — pattern blocks, chapter headers, the sources
ledger — did the same. The component was never deleted and never called.

**It is left in place rather than removed**, and this note exists so it is not
mistaken for a component in use. Deleting it is the obvious tidy-up and is a
judgement about the repo rather than about the archive, so it is recorded here for
whoever decides, alongside the two things that decision should account for:

- it is the only place in the build where the "figure plus label" pairing is
  written once rather than inline, so it is the natural home for that pairing if a
  future surface wants a stacked figure;
- nothing measures it. It renders on no route, so no harness in this project
  covers it — a clean audit run says nothing about whether it still works.
