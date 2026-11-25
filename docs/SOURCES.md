# Sources, and what this archive does not know

MyHUB reads three real, public, independent datasets as if they were one person's
decade. That sentence contains a claim and an admission, and this document is
here so that neither is hidden. The `/sources` route in the app is a rendering of
what follows — if the two ever disagree, this file is wrong and should be fixed.

---

## The three files

| # | file | rows | span | what it actually is |
|---|---|---|---|---|
| A | `spotify_history.csv` | 149,860 | 2013-07 → 2024-12 | One listener's complete Spotify extended streaming history. One row per play, with millisecond duration, skip flag, shuffle flag and the reason a track started and ended. |
| B | `Daily Household Transactions.csv` | 2,461 | 2015 → 2018 | A hand-kept household expense ledger, in INR, with free-text notes. Someone typed these by hand, every day, for four years. |
| C | `Augmented_IndiaTransactMultiFacet2024.csv` | 10,267 | 2022-04 → 2024-04 | A synthetic-augmented Indian card-transaction set built for fraud-detection research. Carries merchant, category, amount, city, state and an `is_fraud` label. |

---

## The join, stated plainly

These three files are **not** the same person. A is one real listener. B is one
real household. C does not know how many people are in it: its identity columns
report **1,019 distinct customer ids, 1,330 distinct card numbers and 1,279
distinct names**, and **230 of the 917 customer ids that carry a full name carry
more than one person's** — one of them carries five. None of those people has a
usable personal timeline either: the busiest customer id holds 39 rows spread
across just five timestamps, and one identity's 17 rows all share a single
timestamp.

*(An earlier draft of this paragraph said "C contains 1,500 distinct cardholders
… the busiest holds 17 transactions and all 17 share a single timestamp." 1,500
is not any column's count — it is a round number that was never measured. The 17
is real but does not belong to the busiest identity. Both are now computed in
`tools/etl.mjs` and printed in that source's caveat, so the page and the figures
cannot drift apart again.)*

MyHUB joins them on purpose, and the join is the product's premise rather than a
mistake it is trying to get away with. One archive owner is named — **Akshat
Sharma, CSE undergraduate, Manipal University Jaipur** — and all three layers are
attributed to that one archive.

**The owner is named from outside all three files, and no row in any of them is
the owner's.** Nobody named here played these tracks, kept this cash book or
carried this card. This has to be the first thing the Sources page says, and it
is.

### Why the owner is no longer mined out of dataset C

An earlier build lifted the owner from a row of C: it scanned for a named
cardholder and took that row's name, `dob` and `job`. That looked like the
rigorous choice — every field had a citation — and it was the weaker one. C's
rows are shuffled across people who do not stay attached to their own identity
columns, so a row's date of birth describes nobody's decade, and adopting it
forced every reading of the ledgers to argue from a demographic guess:

- 2015's milk, autos and pocket money *had* to be a nineteen-year-old's, because
  the row said born 1996.
- 2018-08-31's **₹70,255** *had* to be a first salary, because the row said the
  person worked.

Two inferences stacked on a row picked for its name. Both are now dropped.

### The anchors, which replace it

`meta.owner.anchors` holds three dated facts from the owner's own record — the
only first-party document anywhere in this build, and the only facts in the
archive with no source file behind them:

| year | anchor | note |
|---|---|---|
| 2020 | Class X, CBSE | 93.8% |
| 2022 | Class XII, CBSE | 95.4% |
| 2023 | B.Tech CSE begins | Manipal University Jaipur |

They buy exactly one thing, and it is the thing the mined row could never give:
the app can now name a **year** instead of estimating an age. "August 2018 is a
household's income, and it lands two years short of the class X boards" is
checkable. "Twenty-two, and had started a job" was a guess wearing a
citation.

They select, drop and date **nothing**. No receipt, aggregate or source figure
depends on them — swapping the owner block regenerates an `archive.json` that is
byte-identical everywhere else, which is how that claim was checked. The Sources
page prints them under a heading that says they came from outside the files,
because a fact that cannot point at a row has to point at something.

What the ledgers still show on their own, with no persona needed:

- 2015–2018: the household ledger is milk, autos, snacks and **pocket money** —
  836 of its receipts carry an amount, the median is **₹124.50** and 382 of them
  are under ₹100. A house where money is counted out loud.
- 2018-08-31: **₹70,255** arrives at 09:27, categorised `Salary`, noted
  `From workplace ` (trailing space in the original) — one minute after the same
  hand writes down **₹36** for a half litre of milk. By 15:12 that afternoon ₹118
  goes out as a `Gift` noted `farewell contribution`, and ₹1,000 as
  `Family/Pocket money`. The ledger changes unit for one line and goes straight
  back to biscuits. **This is one day, not two dates:** an earlier draft of this
  file, of `DATA_BRIEF.md`, of `PAGES.md` and of the chapter copy said the two
  were "eleven days apart", which is wrong in size and backwards in order.
- 2022–2024: spending appears on a **card** instead of in cash, and starts
  including travel, entertainment and online shopping.

The seam between B and C is real and visible in the app: the household ledger
stops at the end of 2018, and the card ledger does not begin until April 2022.
**2019, 2020 and 2021 have music and no money.** MyHUB does not paper over that
gap. It has a chapter about it.

---

## Observed vs reconstructed

Every receipt in the archive carries a `provenance` stamp, and the UI prints it.
Colour encodes it too: reconstructed receipts are rendered in grey, observed
receipts in their kind's own colour.

**`observed`** — a row existed in a source file and this receipt is that row,
normalised. Music sessions, purchases, places, notes, events and entertainment
charges are all observed. The numbers are the file's numbers.

**`reconstructed`** — the receipt is an *inference*, and the app says so, on the
receipt, every time. Three of the brief's nine categories have no data behind
them in any of the three files, and rather than fabricate them silently or drop
them, MyHUB derives them and shows its working. Every reconstructed receipt
carries a non-empty `basis`: the ids of the observed receipts it was inferred
from, which the user can click through to and check.

| kind | inferred from | the inference |
|---|---|---|
| `search` | the first-ever appearance of an artist who later passed 50 plays | Discovery has to start somewhere. The first play of an artist who becomes a favourite marks a moment of looking something up. |
| `photo` | three or more card uses in different cities inside one week | That is a trip. Trips get photographed. |
| `message` | `Gift`, `Family/Pocket money` and `Money transfer` rows | Money does not move between two people in silence. A transfer implies a conversation. |

This is the honest position: **no photo, message or search in this archive is a
record of a real photo, message or search.** They are readings of the money and
the music. The app never claims otherwise, and a reader who distrusts an
inference can follow its basis back to the rows it came from.

---

## Known defects in the sources, and what was done about them

**Dataset A documents its timestamps as UTC, and the histogram says otherwise.**
This was the most expensive finding in the project and it reversed an earlier
decision, so the reasoning is recorded rather than the conclusion alone.

Read as UTC and shifted to IST (UTC+05:30), the listening peaks at **05:00** and
all but stops at **17:00** — a person who is most awake at dawn and asleep
through the entire afternoon and evening. That is nobody's day. Read exactly as
written, it peaks at **00:00** (10,884 plays) and empties at **noon** (724, a
ratio of 15.0×), with 38.1% of all listening between 22:00 and 03:59. That is a
night owl, and it is a person.

So **Spotify timestamps are used unshifted**: whatever the export's own
documentation says, these values are already local. The alternative was to trust
a column description over the shape of ten years of behaviour, and publish an
archive whose single most striking finding was an artefact of a timezone
conversion we chose to apply.

The consequence to keep in mind when editing: there is **no timezone conversion
anywhere in the ETL**, and nothing in the UI should claim one. If a future change
reintroduces a shift, the absent noon disappears and `/rhythms` and `/story`
both start lying.

**The two ledgers disagree about date order.** Dataset B is day-first
(`D/M/YYYY`, with inconsistent zero-padding and an optional time). Dataset C is
month-first (`M/D/YYYY H:mm`). Read either with the other's parser and you get a
plausible-looking archive that is quietly wrong, so each source has its own
parser and the ETL asserts the resulting year range against the range measured
from the file.

**Dataset B often has no time of day.** Those receipts are timestamped midday and
**tagged `time-unknown`**, and anything that plots receipts against the hour of
day excludes them. Guessing a plausible-looking hour would have corrupted the
one finding the archive is most confident about.

**Dataset C's coordinates are broken.** Of the 8,792 rows carrying a latitude and
longitude, only **128** fall inside India's bounding box (6–37°N, 68–98°E); the
rest are scattered worldwide, including a row labelled `Shimoga` sitting at
−3.66, 145.22, which is in Papua New Guinea. **No coordinates are shipped and the
app draws no map.** A map would have been the most impressive-looking thing in the
project and a fabrication.

**Dataset C's `state` column disagrees with its own `city` column.** **294 of its
311 cities appear under more than one state.** So `city` is used as written — the
names are real Indian places — and **`state` is not shipped at all**. No receipt
can therefore print a city under the wrong state. Anything in an older draft that
reads "`detail`: the state" is superseded.

**Every merchant in dataset C is prefixed `fraud_`** — an artefact of the file's
origin as a fraud-detection training set, applied to all rows regardless of the
`is_fraud` label. The prefix is stripped and the merchant underneath is used.

**`is_fraud` is not a finding about a person.** It is true on **5,046 of 10,267
rows — 49.1%**, because the file was balanced for training a classifier. An
earlier draft of this document called a flagged charge "the seed of a thread",
which was wrong twice: half the file would seed a thread, and the flag records
how the dataset was constructed rather than anything that happened to anybody.
Flagged rows are still shown, and the receipt says exactly that. It is never
dressed up as a mystery, and **`is_fraud` must not be used to rank, select or
weight anything.**

**Dataset C is ~91–94% filled per column.** Roughly one row in twelve is missing
something. A row missing what its receipt needs is dropped and counted in the ETL
summary, never rendered with a blank where a fact should be.

**Dataset B's places are already anonymised** in the source as `Place 0` …
`Place 5` and `Permanent Residence`. Those tokens are preserved exactly. Inventing
city names for them would have been the easy way to make the app look better and
would have been a lie.

**Dataset C's `cc_num` column was written out of a float, and has no last four
digits left in it.** The rule here used to be the obvious one — *only the last
four digits of `cc_num` ever leave the ETL* — and the receipts carried a
`CARD •••• NNNN` line under it. The rule was fine. The column is not. Every
value arrives already destroyed by whatever wrote the file, in one of two shapes:

- rounded, keeping its leading digits and padding the rest with zeros —
  `4126110000000000.0`, whose "last four digits" are the padding;
- printed in exponent notation — `4.42786e+18`, where stripping non-digits
  yields `44278618`: two mantissa digits with the exponent glued on.

Under the old rule **311 of the 359 card receipts printed `•••• 0000`**, and 45
of the remaining 48 printed `•••• 8618` — the same exponent, over and over,
looking exactly like a real card ending. Neither number is a card. They are
artefacts of the notation, and they were the only fabricated facts in the
archive: not inferred and labelled like the reconstructed receipts, but printed
as observed detail in the same typeface as the amount.

**So no card number is shipped at all, and the `CARD` line is gone rather than
repaired.** There is nothing to repair — the digits are not in the file to
recover. This is the same call as the broken coordinates: the impressive-looking
version was the fabricated one.

---

## What is curated rather than computed

Three things in MyHUB are editorial judgements, and it is worth being clear about
which:

1. **The persona.** One name across three datasets. Argued above.
2. **The chapter boundaries.** Six eras. The *boundaries* are a curatorial call —
   drawn where the measured behaviour shifts, but drawn by a person. Every
   *figure* a chapter displays is computed from the receipts inside it.
3. **The prose** — chapter theses, thread captions, pattern explanations. Written
   to explain what the numbers mean. No claim in any of it is allowed to outrun a
   number that can be recomputed from the receipts.

Everything else — links, threads, patterns, aggregates, facet counts — is derived
in code from the receipts at runtime, and rebuilding the archive rebuilds them.

---

## How the data reaches the browser

`node tools/etl.mjs` reads the three CSVs from `_raw/` and writes
`src/data/archive.json`. That is a **build-time step on a developer's machine**.
The app then `import`s that JSON, so the archive is bundled as a static module.

**There is no backend.** No API routes, no route handlers, no server actions, no
database, no authentication, and no runtime network request of any kind. Links,
threads, chapter statistics, patterns, search and filtering are all computed in
the browser from the bundled receipts.

The only value the product persists is the theme, under the single localStorage
key `app_theme`. Exploration state — which receipts and threads you have opened —
lives in React state and is gone when you close the tab, deliberately.

The raw CSVs are not committed (`_raw/` is gitignored); `src/data/archive.json`
is, so the app builds without them.
