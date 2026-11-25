# MyHUB — data brief

The single source of truth for the ETL and the engine. Every number below was
measured from the real files by `tools/profile.mjs` / `tools/profile2.mjs`. Do
not restate a figure that is not here; re-measure instead.

---

## 1. The product in one paragraph

**MyHUB — Your Life, In Receipts.** Three real public datasets are read as one
person's decade of digital exhaust. Every moment is printed as a **receipt**.
The app's job is not to list them: it derives **links** between receipts,
stitches links into **threads** (moments), groups threads into **chapters**
(eras), mines **patterns**, and narrates the whole as a **story**. Frontend
only — a build-time ETL turns the CSVs into one static JSON module; at runtime
there is no fetch, no API, no database, and the only persisted value in the
product is the theme.

---

## 2. The three sources (measured facts)

### A. `spotify_history.csv` — 149,860 plays, 2013-07-08 → 2024-12
Columns: `spotify_track_uri, ts, platform, ms_played, track_name, artist_name,
album_name, reason_start, reason_end, shuffle, skipped`.
- `ts` is format `YYYY-MM-DD HH:MM:SS`. The export **documents it as UTC and it is
  not** — see the note below the hour histogram. **Use it unshifted.**
- 5,342 total listening hours. Skip rate 5.3%. Platform: 93% android.
- Plays by year: 2013:185, 2014:23, 2015:2809, 2016:6413, **2017:26320**,
  2018:14817, 2019:14927, 2020:24280, 2021:22991, 2022:16202, 2023:11023,
  2024:9870.
- **Plays by hour — the archive's headline finding.** Peak 00:00 (10,884),
  23:00 (10,516), 20:00 (10,494). Trough 12:00 (**724**), 11:00 (903). Peak is
  **15.0×** the trough; 22:00–03:59 carries **38.1%** of all listening. This person
  is awake at night. It is the truest single sentence the data supports.
- **These are the unshifted numbers, and that is deliberate.** The export's own
  documentation says `ts` is UTC. Convert it to IST and the peak moves to 05:00
  with listening stopping at 17:00 — most awake at dawn, asleep all afternoon and
  evening, which is nobody's day. Read as written it is a night owl. **The
  histogram decides this, not the column description: apply no timezone shift
  anywhere.** Reintroducing one deletes the finding above.
- Top artists all-time: The Beatles 7,806 · The Killers 4,711 · John Mayer
  3,138 · Bob Dylan 2,248 · Paul McCartney 1,760 · Johnny Cash 1,501 · The
  Rolling Stones 1,388 · The Strokes 1,342 · Pink Floyd 1,210 · Imagine Dragons
  1,191 · Howard Shore 1,175 · Led Zeppelin 1,094.
- Top track all-time: **"Ode To The Mets" — The Strokes, 193 plays.**
  Then "In the Blood" — John Mayer 162 · "Dying Breed" — The Killers 152.
- Film scores are a real thread: Howard Shore 1,175 (Lord of the Rings),
  Ennio Morricone 841 ("Nuovo Cinema Paradiso" 111 plays),
  Pietro Mascagni "Cavalleria rusticana: Intermezzo" 118.
- **Sessions** (consecutive plays, gap < 30 min): **8,706** total; **4,966** with
  ≥4 tracks and >10 min. Per year (meaty): 2013:6, 2014:2, 2015:93, 2016:269,
  2017:767, 2018:690, 2019:434, 2020:667, 2021:745, 2022:559, 2023:379,
  2024:355. (2013–14 fall below `ARCHIVE_FROM_YEAR` and ship no receipts.)
- **83 sessions are obsession loops** — one track, by one artist, played ≥5×
  inside a session that is itself substantial.
- **Those two figures replace 8,881 / 5,016 / 97, which this file carried for a
  long time, and the discrepancy is worth reading before changing either.**
  `tools/profile2.mjs` really does print the old numbers; the ETL really does
  produce the new ones. Three rules differ, and in each case the ETL's is the one
  the archive should be using:
  - **The gap is measured from the end of the previous play, not its start.**
    `profile2` breaks a session when two *start* times are >30 min apart, which
    splits a sitting in half whenever one long track is playing — 30 minutes of
    music is not 30 minutes of silence. Measuring from `start + ms_played` merges
    those: 8,850 → **8,706**.
  - **`spotifyEpoch` parses `ts` only to the minute**, discarding seconds, which
    moves a handful of plays across the 30-minute boundary: 8,881 → 8,850. This is
    imprecision rather than a decision, but it is immaterial at a 30-minute
    threshold and correcting it would rewrite every receipt id for nothing.
  - **An obsession loop is keyed on track *plus artist*, and only counted in a
    session that passed the ≥4-tracks / >10-min bar.** Both narrowings were
    checked against the rows and both hold:
    - Keying on the title alone merges different songs that share a name. It
      counts `"The Boxer" ×8` in one 2021 session — which is Bob Dylan, Simon &
      Garfunkel, Joan Baez, The Chemical Brothers and three more, i.e. eight
      different recordings, not one track eight times. Also `"Master of the
      House" ×7` across five *Les Misérables* casts and `"Cielito Lindo" ×6`
      across four singers. The ETL titles these receipts `"<track> ×<n>"`, so this
      key would print a repeat count the named track never earned. 91 → 83 plus
      the 8 below.
    - The 8 loops in non-meaty sessions are **skip-spam, not devotion**: every one
      averages under 52 s per play and most under 15 s. The worst is 36 plays
      totalling **18 seconds** (2017-10-12 04:03, `"AKA…What A Life!" ×5`) and 74
      plays in 7.3 min at 6 s each (2017-10-14). Stamping the word *obsession* on
      someone scrubbing through a queue would be the archive inventing a feeling.
- Counting rule: only count a play toward "who the top artist was" when
  `ms_played > 30000`. The file is full of 3-second skips.

### B. `Daily Household Transactions.csv` — 2,461 rows, 2015 → 2018
Columns: `Date, Mode, Category, Subcategory, Note, Amount, Income/Expense, Currency` (INR).
- Rows per year: 2015:401, 2016:349, **2017:1035**, 2018:676.
- `Date` is **`D/M/YYYY`** or `DD/MM/YYYY`, optionally followed by ` HH:MM:SS`.
  Day-first. Padding is inconsistent. Many rows have **no time at all**.
- Modes: Saving Bank account 1 (1,223), Cash (1,046), Credit Card (162).
- Top category/subcategory: Food/Milk 162 · Transportation/auto 142 ·
  Food/snacks 115 · Food/Grocery 113 · Household/Kirana 83 · Food/Lunch 68 ·
  subscription/Mobile Service Provider 66 · Investment/Mutual fund 66 ·
  Health/Medicine 61 · Transportation/Train 55 · Food/Dinner 55 ·
  Family/Pocket money 49 · Food/Tea 43 · Food/Ice cream 36.
- `Note` is **real free text and the best texture in the whole archive**:
  "Idli medu Vada mix 2 plates" · "Half lit  milk" (note the double space —
  preserve it, do not tidy) · "2 Place 5 to Place 0" · "Permanent Residence -
  Tata Play recharge" · "Place 2 station to Permanent Residence" ·
  "11 clothes ironing" · "farewell contribution" · "Domino's Pizza" ·
  "From workplace " · "Warna Srikhand pav kg" · "Dahi 2 packets" ·
  "2 plates poha" · "HBR 2 Months subscription" · "Data booster pack".
- **Places are anonymised in the source as `Place 0`…`Place 5`,
  `Permanent Residence`.** Preserve those tokens exactly. Do not invent city
  names for them. The anonymisation is part of the archive's character.
- `Income/Expense` includes income rows: Salary (43 rows, e.g. **₹70,255 on
  31/08/2018 "From workplace"**), Interest, Dividend earned on Shares
  ("Astral Stocks", "Reliance Stocks"), Gpay Reward.
- Notable dated moments: `31/08/2018 Gift ₹118 "farewell contribution"`,
  `Festivals` (16 rows), `Education` (18), `maid` (17).

### C. `Augmented_IndiaTransactMultiFacet2024.csv` — 10,267 rows, 2022-04 → 2024-04
Columns: `trans_id, trans_date_trans_time, cc_num, merchant, category, amt,
first, last, gender, street, city, state, lat, long, city_pop, job, dob,
merch_lat, merch_long, is_fraud, customer_id`.
- `trans_date_trans_time` is **`M/D/YYYY H:MM`** — **month-first**, unlike
  dataset B. 9,417 rows carry a parseable date; the rest do not.
- Monthly volume is even, ~300–575/month, 2022-04 → 2024-04.
- **Only four categories**: `online_shopping` 2,596 · `travel` 2,419 ·
  `entertainment` 2,388 · `fitness_and_medical` 2,067.
- **Every field is ~91–94% filled.** Roughly one row in twelve is missing
  something. Skip a row that lacks what its receipt needs; never print a blank.
- Merchants are anonymised corporate names and **every one is prefixed
  `fraud_`** — an artefact of the dataset's origin as a fraud-detection set.
  **Strip the `fraud_` prefix.** e.g. `fraud_Bedi-Krish Pvt Ltd` →
  `Bedi-Krish Pvt Ltd`.
- ~~`is_fraud` is a real flag on real rows. **Use it.**~~ **Superseded — measured,
  and the earlier instruction was wrong.** `is_fraud` is true on **5,046 of 10,267
  rows (49.1%)**, because the file was balanced for training a classifier. It is a
  property of how the dataset was built, not an event in anyone's life. So:
  **do not use it to rank, select, weight or seed anything.** Flagged rows are
  shown with a stamp, and the receipt states what the flag actually means. Report
  the count honestly — and count it over *every* row, before any validation
  `return`, or the numerator comes from the surviving rows and the denominator from
  the whole file.
- **`lat`/`long`/`merch_lat`/`merch_long` are unusable** — of the 8,792 rows
  carrying coordinates, only **128** fall inside India's bounding box (6–37°N,
  68–98°E); the rest are scattered worldwide (one "Shimoga" row sits at −3.66,
  145.22, in Papua New Guinea). **Do not ship coordinates and do not draw a map.**
- **`city` is usable; `state` is not.** **294 of the 311 cities appear under more
  than one state**, so the two columns contradict each other and only `city` is
  shipped. City names are real Indian places: Aurangabad 100 · Kharagpur 78 ·
  Berhampur 72 · Jhansi 71 · Proddatur 69 · Nagpur 67 · Shahjahanpur 67 ·
  Nizamabad 65 · Ghaziabad 65 · Satna 65 · Nashik 65 · Orai 64 · Satara 62 ·
  Kota 60 · Akola 60. Ignore the state counts in any older draft of this file:
  they are counts of a column that disagrees with itself.
- **The file does not agree with itself about how many people are in it.**
  `customer_id` says **1,019**, `cc_num` says **1,330**, first+last name says
  **1,279** — and **230 of the 917 customer ids that carry a full name carry more
  than one person's name**. There is no key here that identifies a person.
  Earlier drafts of this bullet said "1,500 distinct people appear", which is not
  any of those three counts; it was never measured. All five figures are now
  computed in `tools/etl.mjs` and printed in the source's caveat, so this file
  cannot drift away from them again.
- **No single person has a usable timeline** either. Under `customer_id` the
  busiest identity holds **39 rows across only five timestamps**; the largest
  single-timestamp burst anywhere in the file is **17 rows**, and that identity's
  entire history is those 17 rows. (The same drafts attached the 17 to "the
  busiest", which is a different identity. The 17 is real; the attribution was
  not.) So the card layer is attributed to the archive owner as a whole. Say so
  on the Sources page.
- **`cc_num` holds no recoverable digits and nothing from it is shipped.** Every
  value was written out of a float: either rounded with zero padding
  (`4126110000000000.0`) or in exponent notation (`4.42786e+18`). See §6 rule 4.

---

## 3. The archive owner

Named from outside all three datasets:

> **Akshat Sharma** — CSE undergraduate, Manipal University Jaipur.

Plus three dated anchors from the owner's own record, which is the only
first-party document in the build and the only place in the archive where a fact
has no source file behind it:

| year | anchor | note |
|---|---|---|
| 2020 | Class X, CBSE | 93.8% |
| 2022 | Class XII, CBSE | 95.4% |
| 2023 | B.Tech CSE begins | Manipal University Jaipur |

```
meta.owner = {
  name: 'Akshat Sharma',
  work: 'CSE undergraduate',
  at:   'Manipal University Jaipur',
  anchors: [ { label, year, note? } × 3 ],
}
```

**There is no `born` field, deliberately.** An earlier draft took the owner from a
row of dataset C — name, `dob` and `job` straight off the row — and that is the
one decision in this brief that has been reversed. C shuffles its rows across
people its own identity columns cannot even count consistently, so a row's date
of birth describes nobody's decade; adopting it
forced two readings that were guesses with citations attached (2015 *must* be a
nineteen-year-old's pocket money; August 2018 *must* be a first salary). No
date of birth was available for the named owner either, and inventing one would
be the same defect in a new coat.

What the anchors buy: the app can name a **year** rather than estimate an age.
The rules that follow from that:

- Any copy that reasons about the owner's life stage must cite an anchor year,
  never an age. "Two years short of the class X boards" is allowed; "aged
  fourteen" is not.
- The August 2018 ₹70,255 is **the household's income, not the owner's** — the
  anchors put it two years before the class X boards. Chapter and story copy that
  said otherwise has been corrected.
- The owner's pronouns are not recorded anywhere, so copy and comments use
  they/them or avoid the pronoun. Do not infer them from the name.
- **An anchor may date the archive. It may never explain the data.** This one was
  learned the hard way: a draft of beat two explained the missing noon in the hour
  histogram by saying the owner was in school during those hours. It reads as the
  anchors finally earning their place, and it is the exact inference the first rule
  above forbids — the plays are not the owner's, so the owner's timetable cannot
  account for them. An anchor is a fact about the person the archive is *named
  for*; the histogram is a fact about a listener who is not that person. Where the
  file does not hold the reason, say the reason is absent.
- The anchors select, drop and date **nothing**. Changing the owner block must
  leave `archive.json` byte-identical outside `meta.owner`; that was verified by
  diffing a regenerated archive against the previous one.

---

## 4. Chapters (curated boundaries, computed figures)

Boundaries are a **curatorial call** grounded in measured shifts. Every figure a
chapter displays must be computed from the receipts in its span, never authored.

| id | title | years | the measured shift it names |
|---|---|---|---|
| `ch-first-signal` | FIRST SIGNAL | 2015–2016 | Taste has no centre: Rolling Stones 51, David Bisbal 51, Bieber 37, Sinatra 31, Hozier 28. Then in 2016 The Beatles arrive at 385 and everything reorganises. Household ledger opens: milk, autos, pocket money. |
| `ch-beatles-years` | THE BEATLES YEARS | 2017–2018 | Peak everything. 26,320 plays in 2017 — the densest year in the archive. Beatles 1,636 then 1,219; John Mayer 850; The Killers 732. The household ledger peaks at 1,035 rows. 2018-08-31 holds all of it in one day: a Beatles track seven times over at 05:19, ₹70,255 in under Salary at 09:27, ₹118 out as a farewell contribution at 15:12. |
| `ch-quiet-year` | THE QUIET YEAR | 2019 | 14,927 plays, Beatles still first at 1,211 — but the household ledger **stops**. The money goes dark for three years. The archive's most honest chapter: it knows what was played and nothing about what was spent. |
| `ch-indoor-voices` | INDOOR VOICES | 2020–2021 | The Killers overtake The Beatles for the first time in five years (1,545 vs 982). The Strokes 559. Howard Shore 298 — hours of Lord of the Rings score. Listening climbs to 24,280 plays while the world is indoors. |
| `ch-another-language` | ANOTHER LANGUAGE | 2022–2023 | Taste switches language: Joaquín Sabina 521, Jorge Drexler 247, Juanes 230. April 2022 the card ledger opens — money becomes visible again, now as travel, entertainment and online shopping. |
| `ch-steady-state` | STEADY STATE | 2024 | John Mayer returns to first (380), ABBA arrives at 276. Both ledgers close: cards in April, plays in December. |

Chapter `body` copy must only make claims these numbers support.

---

## 5. Receipt mapping

Target volume: **1,600–2,400 receipts**, JSON under ~2 MB. Aggregates are
computed over **all** source rows; receipts are a curated selection.

### From A (spotify) → `music`, plus `search`
- **`music` — one receipt per listening session** (gap < 30 min measured from the
  previous play's *end*), keeping sessions with ≥4 tracks and >10 min → **4,966**
  candidates. Select **~900**: keep every one of the **83** obsession loops; keep
  every session that starts between 00:00 and 04:00 up to a per-year cap; then
  fill proportionally by year so all ten years are represented.
  - `title`: the session's dominant artist + track count, e.g.
    `"14 tracks — mostly The Beatles"`. If one track is ≥5× repeated, title it
    `"Ode To The Mets ×7"` and tag `obsession`.
  - `detail`: album or the top three artists.
  - `lines`: `TRACKS`, `DURATION`, `STARTED`, `SKIPPED`, `SHUFFLE`, `PLATFORM`.
  - `entities`: every artist in the session (normalised), plus album names.
  - `tags`: `night` (starts 22:00–04:59), `dawn` (05:00–07:59), `obsession`,
    `soundtrack` (Howard Shore / Morricone / Mascagni present), `long-session`
    (>90 min).
  - **Timezone: none.** ~~Convert to IST (UTC+05:30).~~ **Superseded.** `ts` is
    read exactly as written — see the note under A's hour histogram for the
    measurement that settled it. There is no conversion in the ETL, and the UI
    names no timezone, because the archive cannot prove which one it is in.
- **`search` (reconstructed)** — the first time an artist ever appears in the
  history is a discovery. Emit ~120 of these for artists that went on to ≥50
  lifetime plays: `title: 'who is bob dylan'` styled as a query, `basis` = the
  id of that first session, `provenance: 'reconstructed'`.

### From B (household) → `purchase`, `note`, `place`, `movie`, `event`, `message`
- **`purchase`** — every expense row with a usable amount (~2,100). `lines`:
  `AMOUNT`, `MODE`, `CATEGORY`, `SUBCATEGORY`. `entities`: category,
  subcategory, mode, and significant words from the note.
- **`note`** — rows whose `Note` is ≥12 characters and not a pure restatement of
  the category (~400). The note text goes in `body` **verbatim, including odd
  spacing**. A note receipt and its purchase receipt are the same underlying
  row; link them `derived-from`… no — emit the note only where the text carries
  something the purchase line does not, and cross-reference by shared entities.
- **`place`** — rows where `Category` is `Transportation`, or the note mentions
  `Place N` / `station` / `Permanent Residence` (~300). Parse routes:
  `"2 Place 5 to Place 0"` → `place: 'Place 5 → Place 0'`.
- **`movie`** — `subscription` rows naming Netflix / Tata Sky / Tata Play / HBR,
  and any `Entertainment` category row.
- **`event`** — income rows (Salary, Interest, Dividend), `Festivals`, `Gift`,
  `Education`, and anything whose note reads like a milestone ("farewell
  contribution"). Salary rows are the archive's clearest life events.
- **`message` (reconstructed)** — from `Gift`, `Family/Pocket money` and
  `Money transfer` rows: the transfer implies a conversation. ~60 of them,
  `basis` set, stamped.
- **Time**: many rows have no time. Use `T12:00` and **tag the receipt
  `time-unknown`** so the UI can decline to plot it on an hour dial. Never
  invent a plausible-looking hour.

### From C (cards) → `purchase`, `place`, `movie`, `photo`
- **`purchase`** — rows with date + amount + merchant (~600 selected, spread
  evenly across the 25 months). ~~Over-sample the `is_fraud` rows.~~
  **Superseded:** half the file is flagged, so over-sampling it selects nothing in
  particular. Select by even stride across time only.
  `lines`: `AMOUNT`, `MERCHANT`, `CATEGORY`, `CITY`, ~~`CARD` (last 4 of `cc_num`
  only — never the full number)~~. **Superseded: there is no `CARD` line.** The
  rule was right and the column is unusable — `cc_num` was written out of a
  float, so it arrives either rounded to zero padding (`4126110000000000.0`) or
  in exponent notation (`4.42786e+18`). Stripping non-digits off those yields
  `0000` and `8618`, and under the old rule **311 of 359 card receipts printed
  `•••• 0000`** while 45 more printed the exponent as a card ending. Those were
  the only fabricated facts in the archive — not labelled inferences like the
  reconstructed receipts, but printed as observed detail. The line is deleted, not
  repaired: the digits are not in the file to recover. `entities`: merchant,
  category, city — **not state**. Flagged rows get `tags: ['flagged']`.
- **`place`** — one per distinct city/month pair where a card was used (~150).
  `title`: the city. `detail`: the month, e.g. `"Apr 2022"` — ~~the state~~,
  **never the state**, because that column contradicts the city column. No
  coordinates.
- **`movie`** — `category === 'entertainment'` rows (~150).
- **`photo` (reconstructed)** — where three or more card uses in different
  cities fall inside one week, that is a trip; emit a frame per trip (~90),
  `basis` = the purchase ids, stamped.

### Entity normalisation (the link engine depends on this)
`lowercase → strip punctuation except spaces → collapse whitespace → trim`.
Drop tokens shorter than 3 characters and this stop list: `the, and, for, from,
with, pvt, ltd, inc, plc, group, sons, place, month, subscription, expense,
cash, other`. An entity that appears on **more than 25% of all receipts** is
noise — drop it at the end of the ETL and log which ones went.

### IDs
`mus-0001` · `sea-0001` · `hh-0001` (purchase) · `nte-0001` · `plc-0001` ·
`mov-0001` · `evt-0001` · `msg-0001` · `cd-0001` · `pho-0001`.
Zero-padded to 4, stable across runs, **sorted by time before numbering** so a
rebuild produces byte-identical output.

---

## 6. Hard rules

1. **No `undefined`, `null`, `NaN` or raw error text may reach the UI.** Import
   from `@/lib/format` and print through it. A missing field is an omitted line.
2. Every `title` is non-empty. Drop the row instead of titling it "Untitled".
3. Amounts are INR. Never convert, never invent a currency symbol other than ₹.
4. **Never ship any part of `cc_num`.** ~~Never ship `cc_num` beyond the last
   four digits.~~ The weaker rule was not violated — it was satisfied by digits
   that were not a card number at all, because the column is a stringified float.
   A privacy rule that passes on destroyed data still ships a fabrication. See §5.
5. `provenance: 'reconstructed'` **must** carry a non-empty `basis`.
6. Deterministic: no `Math.random()`, no `Date.now()`. Two runs byte-identical.
7. The ETL prints a summary — counts by kind, by source, by year, dropped rows
   with reasons, and the final JSON size. That summary is the build's receipt.
