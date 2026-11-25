/**
 * Formatters. The one rule this module exists to enforce: the UI must never
 * render the strings `undefined`, `null`, `NaN` or a raw error message. Every
 * function here takes an unknown-ish input and returns either a usable string
 * or a caller-supplied fallback — so a call site can print the result directly
 * without a guard, and a missing field becomes an omitted line rather than a
 * visible defect.
 *
 * The card dataset is ~92% complete per column, so roughly one row in twelve is
 * missing *something*. That is not an edge case here; it is the common case.
 */

/** True only for a finite number — rejects NaN, Infinity, null and strings. */
export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** A non-empty, trimmed string, or undefined. The gate before printing text. */
export function text(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (!t) return undefined;
  // Guards against source rows that literally contain these words, and against
  // a `${value}` interpolation that already stringified a missing field.
  if (t === 'undefined' || t === 'null' || t === 'NaN' || t === 'nan') return undefined;
  return t;
}

/**
 * Integer with thousands separators. `—` when there is no number to print.
 *
 * Grouped in thousands, not lakhs — and the split from `inr()` below is
 * deliberate. Money in this archive is rupees and is grouped the Indian way;
 * a count of rows or plays is not money, and the ETL bakes its own counts into
 * committed strings with thousands grouping (see `nnum` in tools/etl.mjs, which
 * exists to mirror this function). When those two disagree the same figure
 * prints two ways in one card — `1,49,860 rows in the file` directly above a
 * caveat reading `149,860 plays`, which is what /sources caught.
 *
 * Grouped by hand rather than by `toLocaleString`, because `en-IN` gives lakhs
 * and an explicit regex cannot drift with the runtime's ICU data.
 */
export function num(v: unknown, fallback = '—'): string {
  if (!isNum(v)) return fallback;
  const n = Math.round(v);
  return `${n < 0 ? '−' : ''}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** Indian rupees. The source datasets are INR throughout, so no conversion. */
export function inr(v: unknown, fallback = '—'): string {
  if (!isNum(v)) return fallback;
  const abs = Math.abs(v);
  // Receipts show exact paise only under ₹100, where 510.85 is the real figure
  // and rounding it to 511 would misreport a line item.
  const body = abs < 100 && !Number.isInteger(v)
    ? abs.toFixed(2)
    : Math.round(abs).toLocaleString('en-IN');
  return `${v < 0 ? '−' : ''}₹${body}`;
}

/** Compact figures for headline numbers: 149,860 → 149.9K. */
export function compact(v: unknown, fallback = '—'): string {
  if (!isNum(v)) return fallback;
  const a = Math.abs(v);
  if (a >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

export function pct(v: unknown, digits = 0, fallback = '—'): string {
  if (!isNum(v)) return fallback;
  return `${(v * 100).toFixed(digits)}%`;
}

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

/**
 * Parses the archive's own timestamp format (`YYYY-MM-DDTHH:mm`, local wall
 * clock, no zone) without going through Date's zone handling — `new Date(str)`
 * on a zoneless string is treated as local in some engines and UTC in others,
 * which would shift a 2AM play into the previous day for half the world.
 */
export function parseAt(at: unknown): {
  y: number; m: number; d: number; h: number; min: number;
} | null {
  const s = text(at);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d, h: m[4] ? +m[4] : 0, min: m[5] ? +m[5] : 0 };
}

/** `14 MAR 2017` */
export function dateLabel(at: unknown, fallback = '—'): string {
  const p = parseAt(at);
  if (!p) return fallback;
  return `${String(p.d).padStart(2, '0')} ${MONTHS[p.m - 1]} ${p.y}`;
}

/** `02:14` — 24-hour, because the whole point of this archive is the night. */
export function timeLabel(at: unknown, fallback = '—'): string {
  const p = parseAt(at);
  if (!p) return fallback;
  return `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
}

/** `14 MAR 2017 · 02:14` */
export function stampLabel(at: unknown, fallback = '—'): string {
  const p = parseAt(at);
  if (!p) return fallback;
  return `${dateLabel(at)} · ${timeLabel(at)}`;
}

/** `MAR 2017` */
export function monthLabel(ym: unknown, fallback = '—'): string {
  const s = text(ym);
  if (!s) return fallback;
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return fallback;
  const mo = +m[2];
  if (mo < 1 || mo > 12) return fallback;
  return `${MONTHS[mo - 1]} ${m[1]}`;
}

/** Milliseconds → `4h 12m` / `12m` / `48s`. */
export function duration(ms: unknown, fallback = '—'): string {
  if (!isNum(ms) || ms < 0) return fallback;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** `02` → `02:00`. Used by the dial and the heatmap axes. */
export function hourLabel(h: unknown, fallback = '—'): string {
  if (!isNum(h)) return fallback;
  const n = Math.round(h);
  if (n < 0 || n > 23) return fallback;
  return `${String(n).padStart(2, '0')}:00`;
}

/** Words that must not be the last thing before the ellipsis. A truncation that
 *  stops on one reads as a cut rather than an omission: `a search and a…` looks
 *  like the renderer broke, `a search and…` looks like there was more to say.
 *  The run is stripped whole, so `… a search and a` loses both words at once. */
const CLIP_ORPHAN = /(?:\s+(?:a|an|the|and|or|of|in|on|at|to|for|with|by|from|as|is|was))+$/i;

/** Truncates on a word boundary and adds a real ellipsis.
 *
 *  The ellipsis is a real `…`, one character — which is what makes this function
 *  the far end of a hazard: any caller that appends its own sentence-final full
 *  stop prints `….`, as one on `/rhythms` did. Join through `period` instead. */
export function clip(v: unknown, max = 72, fallback = ''): string {
  const s = text(v);
  if (!s) return fallback;
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  const kept = (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd();
  // `|| kept` because a short string of nothing but function words would
  // otherwise clip to a bare ellipsis and lose the only content it had.
  return `${kept.replace(CLIP_ORPHAN, '') || kept}…`;
}

/** Closes a sentence without doubling punctuation the text already carries.
 *
 *  Use this wherever assembled prose ends in a value rather than in a literal —
 *  a title, a caption, anything that came out of `clip`. `clip` ends a truncated
 *  string with a real `…`, so a call site that bolted its own full stop on
 *  printed this, live, on `/rhythms`:
 *
 *      … a purchase, a search and a…. The sources never met; the dates did.
 *
 *  Two marks, and the same call site had a second way to produce one: a caption
 *  short enough to survive `clip` untruncated arrives with its own full stop
 *  already on it, giving `… and a note.. The sources never met`. Neither is an
 *  `undefined` or a `NaN`, so nothing in the sentinel sweeps was ever going to
 *  catch them — a fact rendered with broken punctuation still reads as a bug in
 *  the archive rather than in the typesetting.
 *
 *  The set below is every mark that can legitimately close a fragment here.
 *  A comma is deliberately **not** in it: text ending in one is mid-clause, and
 *  a full stop is the right thing to add. */
export function period(v: unknown, mark = '.'): string {
  // Through `text`, so a fragment that is only the word "undefined" returns empty
  // rather than becoming a tidily punctuated `undefined.`
  const s = text(v);
  if (!s) return '';
  return /[.!?…:;]$/.test(s) ? s : `${s}${mark}`;
}

/** `3` → `3 receipts`, `1` → `1 receipt`. Counts through `num`, so a figure reads
 *  the same here as it does standing on its own. */
export function plural(n: unknown, one: string, many?: string, fallback = '—'): string {
  if (!isNum(n)) return fallback;
  const k = Math.round(n);
  return `${num(k)} ${k === 1 ? one : many ?? `${one}s`}`;
}

/** Days between two archive timestamps, or null if either is unparseable. */
export function daysBetween(a: unknown, b: unknown): number | null {
  const pa = parseAt(a), pb = parseAt(b);
  if (!pa || !pb) return null;
  const da = Date.UTC(pa.y, pa.m - 1, pa.d);
  const db = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round(Math.abs(db - da) / 86400000);
}

/** Hours between two archive timestamps, or null. */
export function hoursBetween(a: unknown, b: unknown): number | null {
  const pa = parseAt(a), pb = parseAt(b);
  if (!pa || !pb) return null;
  const ta = Date.UTC(pa.y, pa.m - 1, pa.d, pa.h, pa.min);
  const tb = Date.UTC(pb.y, pb.m - 1, pb.d, pb.h, pb.min);
  return Math.abs(tb - ta) / 3600000;
}

/** `31h` / `3d` / `2mo` — the gap label the link engine prints in a reason. */
export function gapLabel(hours: unknown, fallback = '—'): string {
  if (!isNum(hours) || hours < 0) return fallback;
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 48) return `${Math.round(hours)}h`;
  const d = Math.round(hours / 24);
  if (d < 60) return `${d}d`;
  const mo = Math.round(d / 30);
  if (mo < 24) return `${mo}mo`;
  return `${(d / 365).toFixed(1)}y`;
}
