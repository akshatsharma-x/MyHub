# tools/audit — the verification suite

Every measured claim in `README.md` and `docs/PAGES.md` comes from this suite: the
renders at four widths, the 11px floor, the contrast, the keyboard paths, the zero
layout shift. It drives the **production build** in a real headless Chrome.
Nothing to install beyond the app's own dependencies: Node's global `WebSocket`
and `fetch` speak the DevTools protocol directly.

```sh
npm run verify                    # build, then every check
node tools/audit/run.mjs          # every check, against the existing build
node tools/audit/run.mjs layout   # only the named checks
node tools/audit/run.mjs --list   # what each check measures
```

It starts its own `next start` and its own Chrome on free ports and removes both
afterwards. `--url=http://127.0.0.1:3000` audits a server that is already running,
`--cdp=9222` drives a Chrome that is, and `CHROME_PATH` points at Chrome when it
is somewhere unusual. It exits 1 if any check reports a finding. A full run takes
a few minutes, most of it the keyboard walk.

## The checks

| check | what it proves |
|---|---|
| `format` | `clip`, `period` and the numeric formatters, on the real `src/lib/format.ts`. Nothing numeric prints `NaN`, `undefined` or `Infinity`. Needs Node 22.18+. |
| `etl` | Two ETL runs are byte-identical, to each other and to the committed `archive.json`. Skips loudly without `_raw/`, which is not committed. |
| `detectors` | Every page detector fires on the defect it exists to catch. Runs before any sweep. |
| `layout` | 8 routes × 360/768/1280/1920 × both themes, through every detector: overflow, unadmitted clipping, the 11px floor, sentinel strings, gendered pronouns, punctuation collisions, names on the dial landing on each other, the owner's surfaces. A quiet console, and the theme took. |
| `story` | All ten beats × 2 widths × 2 themes, with a guard that the walk actually moved. |
| `shell` | The static HTML is the final layout at 4 widths before any JS runs. CLS is 0, with the observer proved first. Drawer, collapse, resize and page-enter all behave. |
| `interactions` | The overlay, a walk to a related receipt, the filter disclosure, the phone drawer, a focused dial node and an expanded thread, each opened and measured. |
| `dial` | Every name the constellation can print, shown or focus-revealed, stays inside its panel and off every other name at 1280/1440/1920. |
| `keyboard` | Every tab stop on every route has a visible ring and a name, and lands in view. The skip link works. The overlay and the drawer trap focus, release it on Escape and return it. |
| `semantics` | One `h1`, no skipped heading levels, one `<main>`, no duplicate ids, nothing unnamed, `lang`. ⌘K reaches search from anywhere. |
| `runtime` | Every request is a same-origin GET, nothing touches `/api`, and `localStorage` holds exactly `app_theme`. The theme is right at first paint in six cases, and an unmatched URL answers 404. |
| `contrast` | Every visible text run meets WCAG AA in both themes, against what is actually painted behind it. |

## Rulers, and how each one has been wrong before

Each rule below exists because a check in this project once reported "clean"
while measuring nothing, or the wrong thing.

- **A detector is defined once.** `lib/detectors.mjs` holds each detector beside
  the faults that prove it fires, and the sweeps and the self-test call the same
  function. The suite this replaced proved its detectors using copies of them,
  which only proves the copies fire.
- **SVG text is measured through its screen CTM.** `getComputedStyle().fontSize`
  reports the size SVG text was *specified* at, so a 14-unit label drawn at 5.7px
  reports 14px.
- **Never key a check off authored casing.** `innerText` returns text after CSS
  `text-transform`, so matching a slug's source casing finds nothing.
- **Wrapping text is clipped vertically.** `scrollWidth > clientWidth` passes by
  construction for a line that wraps; a `line-clamp` needs the height check.
- **Prove the walk moved.** Ten clicks before hydration measured beat one ten
  times. The story check requires ten distinct headings.
- **Contrast is a stacking question.** An ancestor walk cannot see a positioned
  sibling painted behind the text, and it reported the rail's ink-on-amber active
  item as 1.09:1 on every run. The detector reads `elementsFromPoint`.
- **Use real key events.** A `KeyboardEvent` dispatched from page script moves no
  focus. The keyboard check uses the DevTools `Input` domain.
- **Wait on the right quantity.** With smooth scrolling, wait until the focused
  element's *viewport* position settles. Its document position never changes,
  and a check that waited on it declared every scroll finished after three frames.
- **Measure labels against each other, not just against their container.**
  Every dial check compared names with the panel, and none compared them with
  one another. 60 pairs of the dial's 21 printed names overlapped at 1280px, and
  the top of the music arc was a smear nobody's ruler could see.
- **An unreachable surface is a finding, never a skip.** The old interactions pass
  looked for dial nodes as `<button>`s after they had become SVG groups, logged
  "no node buttons", and called the dial clean.
- **Don't hard-type a count beside a computed one.** Summaries print what was
  measured.
