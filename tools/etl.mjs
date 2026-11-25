/**
 * MyHUB build-time ETL.
 *
 * Reads the three source CSVs from _raw/ and writes src/data/archive.json, which
 * the app imports as a static module. This is the ONLY code that ever sees the
 * raw files, and it runs on a developer's machine — never at request time. There
 * is no backend in this project: the JSON it emits is bundled, and every link,
 * thread and pattern is derived from it in the browser.
 *
 * Run: node tools/etl.mjs
 *
 * Contract: src/lib/types.ts. Mapping rules and measured source facts:
 * docs/DATA_BRIEF.md. Honesty ledger: docs/SOURCES.md.
 *
 * Determinism is a requirement, not a nicety — the emitted archive is committed,
 * so two runs must produce byte-identical output. No Math.random(), no
 * Date.now(), and every selection is a sort plus a stride.
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { parseCsv } from './csv.mjs';

const RAW = '_raw';
const OUT = 'src/data/archive.json';

const F_SPOTIFY = `${RAW}/spotify_history.csv`;
const F_HOUSEHOLD = `${RAW}/Daily Household Transactions.csv`;
const F_CARDS = `${RAW}/Augmented_IndiaTransactMultiFacet2024.csv`;

/** How many receipts each bucket contributes. Tuned so the whole archive lands
 *  in the 1,600–2,400 band while every one of the nine kinds stays populated. */
const CAP = {
  music: 820,
  search: 110,
  hhPlace: 170,
  hhNote: 200,
  hhPurchase: 240,
  hhMessage: 55,
  cardPurchase: 280,
  cardPlace: 150,
  cardMovie: 110,
  cardPhoto: 60,
};

const SESSION_GAP_MS = 30 * 60 * 1000;

/** Receipts before this are dropped. The Spotify export opens in 2013 but carries
 *  only 185 plays that year and 23 in 2014 — not a year of a life, just the tail
 *  of an account. The archive proper starts where the household ledger does.
 *  Aggregates still cover the full export; this bounds the receipts only. */
const ARCHIVE_FROM_YEAR = 2015;

// ─────────────────────────────────────────────────────────────────────────────
// Small deterministic formatters. The ETL pre-formats every `lines` value, so
// these mirror src/lib/format.ts rather than importing it (that file is TS).
//
// "Mirror" is a claim about two files, and it has been wrong once already — see
// `clip` below, which drifted into a hard character cut while format.ts moved to
// a word boundary. If you change a formatter in either file, diff it against its
// twin; the compiler cannot, because one side is TypeScript and the other is not.
// ─────────────────────────────────────────────────────────────────────────────

/** Indian digit grouping, done by hand: toLocaleString('en-IN') depends on the
 *  Node build's ICU data, and this file's output is committed. */
function inr(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const neg = n < 0;
  const v = Math.abs(n);
  // Paise only survive on small amounts, where ₹510.85 rounding to ₹511 would
  // misreport a real figure. Above that they are noise.
  const keepPaise = v < 100 && Math.round(v * 100) % 100 !== 0;
  const s = keepPaise ? v.toFixed(2) : String(Math.round(v));
  const [ipRaw, fp] = s.split('.');
  let ip = ipRaw;
  if (ip.length > 3) {
    const last3 = ip.slice(-3);
    const rest = ip.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    ip = `${rest},${last3}`;
  }
  return `${neg ? '-₹' : '₹'}${ip}${fp ? `.${fp}` : ''}`;
}

function nnum(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function durationFromMs(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** '2017-03-14T02:14' → '14 MAR 2017' */
function dateLabel(at) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(at || '');
  if (!m) return '—';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

function timeLabel(at) {
  const m = /T(\d{2}):(\d{2})$/.exec(at || '');
  return m ? `${m[1]}:${m[2]}` : '—';
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function iso(y, mo, d, h, mi) {
  return `${pad(y, 4)}-${pad(mo, 2)}-${pad(d, 2)}T${pad(h, 2)}:${pad(mi, 2)}`;
}

function titleCase(s) {
  return s.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity normalisation. The link engine matches on these tokens, so their
// quality decides the quality of every connection in the product.
// ─────────────────────────────────────────────────────────────────────────────

const STOP = new Set([
  'the', 'and', 'for', 'from', 'with', 'pvt', 'ltd', 'inc', 'plc', 'llc', 'co',
  'group', 'sons', 'place', 'month', 'months', 'subscription', 'expense',
  'cash', 'other', 'misc', 'new', 'old', 'per', 'via', 'not', 'all', 'own',
]);

function normEntity(s) {
  if (typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole-phrase entities (an artist, a merchant, a category). Kept intact so
 *  "the beatles" joins to "the beatles" rather than to every receipt with "the". */
function addEntity(set, raw) {
  const v = normEntity(raw);
  if (v.length < 3) return;
  if (STOP.has(v)) return;
  set.add(v);
}

/** Significant words out of free text, for the household notes. */
function addWords(set, raw, limit = 4) {
  const v = normEntity(raw);
  if (!v) return;
  let taken = 0;
  for (const w of v.split(' ')) {
    if (taken >= limit) break;
    if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
    set.add(w);
    taken++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Date parsing. One parser per source, because the two ledgers disagree about
// field order and reading either with the other's parser yields a
// plausible-looking archive that is silently wrong.
// ─────────────────────────────────────────────────────────────────────────────

/** Spotify: 'YYYY-MM-DD HH:MM:SS' in UTC. Returns an epoch, or null.
 *  Parsed by regex into Date.UTC rather than handed to `new Date(string)`, so
 *  the machine's timezone can never shift a 2AM play onto the previous day. */
function spotifyEpoch(ts) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(ts || '');
  if (!m) return null;
  const e = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isFinite(e) ? e : null;
}

/**
 * The play's wall clock, taken as the file writes it — deliberately unshifted.
 *
 * Spotify's export format documents `ts` as UTC, and the first version of this
 * ETL duly added +05:30. The resulting histogram peaks at 05:00 and falls to 677
 * plays at 17:00: a listener whose day collapses to nothing in the late afternoon
 * and crests at dawn. Nobody does that. Read as written, the same data is an
 * ordinary night-owl profile — 10,884 plays at midnight against 724 at noon,
 * declining smoothly through the morning and recovering through the evening.
 *
 * The shape is the evidence: this file's timestamps have already been localised.
 * Shifting them does not correct a distortion, it introduces one, and it would
 * have handed the app a headline finding that was an artefact of its own ETL.
 * docs/SOURCES.md states this decision and the reasoning.
 */
function wallParts(epoch) {
  const d = new Date(epoch);
  return {
    at: iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()),
    hour: d.getUTCHours(),
    weekday: d.getUTCDay(),
    ym: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}`,
    year: d.getUTCFullYear(),
  };
}

/** Household: DAY-first `D/M/YYYY`, padding inconsistent, time optional. */
function householdAt(s) {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(s || '');
  if (!m) return null;
  const day = +m[1];
  const mon = +m[2];
  const year = +m[3];
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  const timeKnown = m[4] !== undefined;
  const h = timeKnown ? +m[4] : 12;
  const mi = timeKnown ? +m[5] : 0;
  if (h > 23 || mi > 59) return null;
  return { at: iso(year, mon, day, h, mi), timeKnown, year };
}

/** Cards: MONTH-first `M/D/YYYY H:mm`. */
function cardAt(s) {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(s || '');
  if (!m) return null;
  const mon = +m[1];
  const day = +m[2];
  const year = +m[3];
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  const timeKnown = m[4] !== undefined;
  const h = timeKnown ? +m[4] : 12;
  const mi = timeKnown ? +m[5] : 0;
  if (h > 23 || mi > 59) return null;
  return { at: iso(year, mon, day, h, mi), timeKnown, year };
}

function money(s) {
  if (typeof s !== 'string') return null;
  const v = Number(s.replace(/[₹,\s]/g, ''));
  return Number.isFinite(v) && v !== 0 ? Math.abs(v) : null;
}

function isTrue(s) {
  return /^true$/i.test((s || '').trim());
}

/** ISO-ish week key, used to find trips. Monday-based, from a wall-clock date. */
function weekKey(at) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(at);
  if (!m) return '';
  const e = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const day = new Date(e).getUTCDay();
  const monday = e - ((day + 6) % 7) * 86400000;
  const d = new Date(monday);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection. Every cap is applied by striding across a time-sorted list, so the
// kept receipts are spread over the decade instead of clustering in whichever
// year happened to be densest — and the result is identical on every run.
// ─────────────────────────────────────────────────────────────────────────────

function pickSpread(sorted, cap, forced = new Set()) {
  if (sorted.length <= cap) return sorted.slice();
  const out = [];
  const taken = new Set();
  for (let i = 0; i < sorted.length; i++) {
    if (forced.has(sorted[i]._ref)) {
      out.push(sorted[i]);
      taken.add(i);
    }
  }
  const room = cap - out.length;
  if (room > 0) {
    const stride = sorted.length / room;
    for (let k = 0; k < room; k++) {
      let i = Math.floor(k * stride);
      while (i < sorted.length && taken.has(i)) i++;
      if (i >= sorted.length) break;
      taken.add(i);
      out.push(sorted[i]);
    }
  }
  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a._ref < b._ref ? -1 : 1));
  return out;
}

function bump(map, key, by = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + by);
}

function topN(map, n, nameKey = 'name', countKey = 'count') {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, n)
    .map(([k, v]) => ({ [nameKey]: k, [countKey]: v }));
}

const log = (...a) => console.log(...a);
const dropped = new Map();
function drop(reason, n = 1) {
  bump(dropped, reason, n);
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Spotify
// ═════════════════════════════════════════════════════════════════════════════

log('\n── reading spotify_history.csv …');
let spotifyRows = parseCsv(readFileSync(F_SPOTIFY, 'utf8'));
const spotifyRowCount = spotifyRows.length;
log(`   ${nnum(spotifyRowCount)} rows`);

const playsByHour = new Array(24).fill(0);
const playsByWeekdayHour = Array.from({ length: 7 }, () => new Array(24).fill(0));
const playsByMonth = new Map();
const artistPlays = new Map();
const trackPlays = new Map();
const artistPlaysByYear = new Map();
let totalMs = 0;
let skipped = 0;
// The file's own first and last play. These exist because `/sources` prints this
// span under the label "span in the file", directly beside "rows in the file".
// It used to be derived from the ~900 *selected* session receipts instead, which
// made it a span of the sample wearing the label of the file: it reported
// 2013-07 → 2024-11 while the last row is 2024-12-15 and `playsByMonth` — which
// is computed over every row — carries 148 plays in 2024-12. Same loop, same
// rows as the aggregates, so the label and the number now agree.
let spSpanFrom = '';
let spSpanTo = '';

/** Compact play records, so the 150k parsed row objects can be collected. */
const plays = [];
for (const r of spotifyRows) {
  const e = spotifyEpoch(r.ts);
  if (e === null) {
    drop('spotify: unparseable ts');
    continue;
  }
  const artist = (r.artist_name || '').trim();
  const track = (r.track_name || '').trim();
  if (!artist && !track) {
    drop('spotify: no artist and no track');
    continue;
  }
  const ms = Number(r.ms_played) || 0;
  const p = wallParts(e);

  playsByHour[p.hour]++;
  playsByWeekdayHour[p.weekday][p.hour]++;
  bump(playsByMonth, p.ym);
  if (!spSpanFrom || p.at < spSpanFrom) spSpanFrom = p.at;
  if (!spSpanTo || p.at > spSpanTo) spSpanTo = p.at;
  totalMs += ms;
  if (isTrue(r.skipped)) skipped++;

  // A 3-second skip is not a vote. Only a real listen counts toward who an
  // artist was to this person.
  if (ms > 30000 && artist) {
    bump(artistPlays, artist);
    bump(trackPlays, `${track}\u0000${artist}`);
    if (!artistPlaysByYear.has(p.year)) artistPlaysByYear.set(p.year, new Map());
    bump(artistPlaysByYear.get(p.year), artist);
  }

  plays.push({
    e,
    at: p.at,
    hour: p.hour,
    ms,
    track,
    artist,
    album: (r.album_name || '').trim(),
    skipped: isTrue(r.skipped),
    shuffle: isTrue(r.shuffle),
    platform: (r.platform || '').trim(),
  });
}
spotifyRows = null;

const totalPlays = plays.length;
plays.sort((a, b) => a.e - b.e || (a.track < b.track ? -1 : 1));
log(`   ${nnum(totalPlays)} usable plays · ${nnum(Math.round(totalMs / 3600000))} listening hours`);
log(`   hour peak ${playsByHour.indexOf(Math.max(...playsByHour))}:00 (${nnum(Math.max(...playsByHour))}) · trough ${playsByHour.indexOf(Math.min(...playsByHour))}:00 (${nnum(Math.min(...playsByHour))})`);

function shortPlatform(s) {
  if (/android/i.test(s)) return 'Android';
  if (/ios|iphone|ipad/i.test(s)) return 'iOS';
  if (/windows/i.test(s)) return 'Windows';
  if (/(^|\W)(mac|osx|os x)/i.test(s)) return 'macOS';
  if (/web/i.test(s)) return 'Web player';
  if (/cast|chromecast/i.test(s)) return 'Cast';
  if (/linux/i.test(s)) return 'Linux';
  return s ? titleCase(s.split(/[\s(]/)[0]) : '';
}

// Sessionise: consecutive plays with less than a 30-minute gap are one sitting.
// The session, not the individual play, is the archive's unit of music — 149,860
// rows cannot ship to a browser, and a single track tells no story anyway.
const sessions = [];
let cur = null;
for (const p of plays) {
  if (!cur || p.e - cur.lastE > SESSION_GAP_MS) {
    if (cur) sessions.push(cur);
    cur = {
      startE: p.e, lastE: p.e, at: p.at, hour: p.hour, tracks: 0, ms: 0,
      artists: new Map(), albums: new Map(), trackCounts: new Map(),
      skips: 0, shuffles: 0, platform: p.platform,
    };
  }
  cur.lastE = p.e + Math.max(0, p.ms);
  cur.tracks++;
  cur.ms += p.ms;
  if (p.artist) bump(cur.artists, p.artist);
  if (p.album) bump(cur.albums, p.album);
  if (p.track) bump(cur.trackCounts, `${p.track}\u0000${p.artist}`);
  if (p.skipped) cur.skips++;
  if (p.shuffle) cur.shuffles++;
}
if (cur) sessions.push(cur);

const meaty = sessions.filter((s) => s.tracks >= 4 && s.ms > 10 * 60 * 1000);
log(`   ${nnum(sessions.length)} sessions · ${nnum(meaty.length)} with ≥4 tracks and >10 min`);

const SOUNDTRACK = /howard shore|ennio morricone|pietro mascagni|hans zimmer|john williams/i;

const musicCandidates = meaty.map((s, i) => {
  const [topArtist] = topN(s.artists, 1, 'name', 'plays');
  const artistList = topN(s.artists, 3, 'name', 'plays');
  const [topTrack] = topN(s.trackCounts, 1, 'key', 'plays');
  const [topAlbum] = topN(s.albums, 1, 'name', 'plays');
  const repeat = topTrack ? topTrack.plays : 0;
  const trackName = topTrack ? topTrack.key.split('\u0000')[0] : '';
  const obsession = repeat >= 5 && trackName !== '';
  const artistName = topArtist ? topArtist.name : '';

  const tags = [];
  if (s.hour >= 22 || s.hour < 5) tags.push('night');
  else if (s.hour < 8) tags.push('dawn');
  if (obsession) tags.push('obsession');
  if (s.ms > 90 * 60 * 1000) tags.push('long-session');
  if ([...s.artists.keys()].some((a) => SOUNDTRACK.test(a))) tags.push('soundtrack');
  if (s.artists.size === 1) tags.push('single-artist');

  const entities = new Set();
  for (const a of s.artists.keys()) addEntity(entities, a);
  for (const al of [...s.albums.keys()].slice(0, 3)) addEntity(entities, al);

  const lines = [
    { label: 'TRACKS', value: nnum(s.tracks) },
    { label: 'DURATION', value: durationFromMs(s.ms) },
    { label: 'STARTED', value: timeLabel(s.at) },
  ];
  if (s.skips > 0) lines.push({ label: 'SKIPPED', value: `${nnum(s.skips)} of ${nnum(s.tracks)}` });
  if (s.shuffles > 0) lines.push({ label: 'SHUFFLE', value: s.shuffles === s.tracks ? 'On' : 'Partly' });
  const plat = shortPlatform(s.platform);
  if (plat) lines.push({ label: 'PLATFORM', value: plat });

  const title = obsession
    ? `${trackName} ×${repeat}`
    : artistName
      ? `${s.tracks} tracks — mostly ${artistName}`
      : `${s.tracks} tracks`;

  const detail = obsession
    ? artistName
    : s.artists.size === 1
      ? (topAlbum ? topAlbum.name : artistName)
      : artistList.map((a) => a.name).join(' · ');

  return {
    _ref: `mus:${i}`,
    _prefix: 'mus',
    _sortRank: obsession ? 0 : tags.includes('night') ? 1 : 2,
    kind: 'music',
    at: s.at,
    title,
    detail: detail || undefined,
    lines,
    entities: [...entities],
    tags,
    source: 'spotify',
    provenance: 'observed',
    _artists: [...s.artists.keys()],
    _year: Number(s.at.slice(0, 4)),
  };
});

// Every obsession loop is kept — 83 of them, and each is a genuinely odd human
// moment. The rest of the budget is spread across years proportionally so no
// year drops out of the archive.
//
// This comment said 97 until it was measured, because 97 is what
// `tools/profile2.mjs` prints and the brief repeated it. The log line below has
// printed 83 the whole time; nobody read the code's own output against the
// comment sitting above it. The gap is three rules, all of them this file's and
// all of them better than the profiler's — gap measured from the end of the
// previous play rather than its start, a loop keyed on track *and* artist, and
// loops only counted in sessions that cleared the ≥4 / >10 min bar. See
// DATA_BRIEF §2A, which now records the attribution rather than the figure
// alone. A hard-typed count beside a computed one is a claim waiting to rot:
// the count is `musicCandidates.filter(obsession)`, and it is logged, not typed.
const musicByYear = new Map();
for (const c of musicCandidates) {
  if (!musicByYear.has(c._year)) musicByYear.set(c._year, []);
  musicByYear.get(c._year).push(c);
}
const musicSelected = [];
const yearsSorted = [...musicByYear.keys()].sort((a, b) => a - b);
for (const y of yearsSorted) {
  const list = musicByYear.get(y);
  const share = list.length / musicCandidates.length;
  const quota = Math.max(24, Math.round(CAP.music * share));
  list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a._ref < b._ref ? -1 : 1));
  const forced = new Set(list.filter((c) => c._sortRank === 0).map((c) => c._ref));
  musicSelected.push(...pickSpread(list, quota, forced));
}
log(`   music receipts: ${nnum(musicSelected.length)} (obsession loops kept: ${nnum(musicCandidates.filter((c) => c.tags.includes('obsession')).length)})`);

// ── Reconstructed searches ──────────────────────────────────────────────────
// Discovery has to start somewhere. The first shipped session featuring an
// artist who went on to matter is read as the moment of looking them up. The
// receipt says so, and carries that session as its basis.
const QUERY_SHAPES = [
  (a) => `who is ${a.toLowerCase()}`,
  (a) => `${a.toLowerCase()} best songs`,
  (a) => `${a.toLowerCase()} discography`,
  (a) => `${a.toLowerCase()} live`,
  (a) => `${a.toLowerCase()} album order`,
];

const firstSessionForArtist = new Map();
for (const c of musicSelected) {
  for (const a of c._artists) {
    if (!firstSessionForArtist.has(a)) firstSessionForArtist.set(a, c);
  }
}

const searchCandidates = [];
for (const { name, plays: lifetime } of topN(artistPlays, 400, 'name', 'plays')) {
  if (lifetime < 50) continue;
  const first = firstSessionForArtist.get(name);
  if (!first) continue;
  // Twenty minutes before the session it explains: the look-up precedes the
  // listen. Any offset is a choice, so it is a small and stated one.
  const e = Date.UTC(
    +first.at.slice(0, 4), +first.at.slice(5, 7) - 1, +first.at.slice(8, 10),
    +first.at.slice(11, 13), +first.at.slice(14, 16),
  ) - 20 * 60 * 1000;
  const d = new Date(e);
  const shape = QUERY_SHAPES[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % QUERY_SHAPES.length];
  const entities = new Set();
  addEntity(entities, name);
  searchCandidates.push({
    _ref: `sea:${name}`,
    _prefix: 'sea',
    _basisRefs: [first._ref],
    kind: 'search',
    at: iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()),
    title: shape(name),
    detail: 'Inferred discovery',
    body: `No search history exists in this archive. This is read from the listening record: the first time ${name} appears, followed by ${nnum(lifetime)} plays over the years after.`,
    lines: [
      { label: 'FIRST HEARD', value: dateLabel(first.at) },
      { label: 'PLAYS SINCE', value: nnum(lifetime) },
      { label: 'INFERRED FROM', value: '1 listening session' },
    ],
    entities: [...entities],
    tags: ['discovery', 'inferred'],
    source: 'spotify',
    provenance: 'reconstructed',
  });
}
searchCandidates.sort((a, b) => (a.at < b.at ? -1 : 1));
const searchSelected = pickSpread(searchCandidates, CAP.search);
log(`   search receipts: ${nnum(searchSelected.length)} (reconstructed from first appearances)`);

// ═════════════════════════════════════════════════════════════════════════════
// B. Household ledger — someone typed these by hand, every day, for four years.
// ═════════════════════════════════════════════════════════════════════════════

log('\n── reading Daily Household Transactions.csv …');
const hhRows = parseCsv(readFileSync(F_HOUSEHOLD, 'utf8'));
log(`   ${nnum(hhRows.length)} rows`);

const spendByMonth = new Map();
const spendByCategory = new Map();

const PLACE_RE = /\bPlace\s*\d+\b|\bPermanent Residence\b|\bstation\b/i;
// Deliberately excludes HBR — that is Harvard Business Review, a reading
// subscription, and filing it under entertainment would be a small lie.
const SCREEN_RE = /netflix|tata sky|tata play|hotstar|prime video|amazon prime|sony liv|zee5|cinema|movie|theatre|bookmyshow/i;

function tidyPlace(s) {
  return s.replace(/\s+/g, ' ').replace(/place\s*(\d+)/i, (_, d) => `Place ${d}`).trim();
}

function routeOf(note) {
  const P = '(Place\\s*\\d+|Permanent Residence)';
  const pair = new RegExp(`${P}\\s*(?:station)?\\s*(?:to|-|–|→)\\s*${P}`, 'i').exec(note);
  if (pair) return `${tidyPlace(pair[1])} → ${tidyPlace(pair[2])}`;
  const one = new RegExp(P, 'i').exec(note);
  return one ? tidyPlace(one[1]) : '';
}

/** Does the note say anything the category columns do not? Only then is it worth
 *  a receipt of its own, rather than duplicating a purchase line. */
function noteRich(note, cat, sub, mode) {
  const t = note.trim();
  if (t.length < 18) return false;
  const known = new Set(normEntity(`${cat} ${sub} ${mode}`).split(' ').filter(Boolean));
  const fresh = normEntity(t)
    .split(' ')
    .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w) && !known.has(w));
  return fresh.length >= 2;
}

/** Truncation, mirroring `clip` in src/lib/format.ts — including the word
 *  boundary and the orphan rule, which this function did not have.
 *
 *  It used to be `t.slice(0, max - 1)`: a hard character cut. The header above
 *  says these formatters mirror format.ts, and for this one that was simply not
 *  true — format.ts has backed off to the last space since it was written. The
 *  cost was 14 strings baked into archive.json ending mid-word, every single
 *  truncated string in the file:
 *
 *      nte-0042  "…1 rabdi malai, 1 masala pap…"      (papad)
 *      nte-0121  "…500gb HDD Rs.1800 + Msof…"         (Msoffice)
 *      pho-0017  "…Jorhat, Gandhina…"                 (Gandhinagar)
 *
 *  The last one is the reason this is a defect and not a preference. A city name
 *  is a fact the archive is asserting, and half a city name is not a shorter
 *  fact — it is an unreadable one, of a place that does not exist. Backing off to
 *  the word boundary drops the partial city instead, which is honest: the
 *  ellipsis already says there were more.
 *
 *  The backoff is **conditional**, and the condition matters: `sp > max * 0.6`
 *  refuses to throw away more than 40% of the budget, so when the last space
 *  falls early this still hard-cuts and still severs a word. The claim it earns
 *  is therefore not "never severs" but "never severs at the caps this file
 *  passes" — 60 for note titles, 48 for the CITIES line. Measured over all 1,940
 *  real ledger notes at both caps: 26 severed before, 0 after. At a cap of 24 it
 *  severs again, by design.
 *
 *  A mirror nobody diffs is just two implementations. Both now strip the same
 *  orphan run, so neither ends on "and a…". */
const CLIP_ORPHAN = /(?:\s+(?:a|an|the|and|or|of|in|on|at|to|for|with|by|from|as|is|was))+$/i;

function clip(s, max) {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  const kept = (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd();
  return `${kept.replace(CLIP_ORPHAN, '') || kept}…`;
}

const hhBuckets = { event: [], movie: [], place: [], note: [], purchase: [] };
const messageSeeds = [];
let hhSpanFrom = '';
let hhSpanTo = '';

hhRows.forEach((r, i) => {
  const when = householdAt(r.Date);
  if (!when) {
    drop('household: unparseable date');
    return;
  }
  const amount = money(r.Amount);
  const cat = (r.Category || '').trim();
  const sub = (r.Subcategory || '').trim();
  const mode = (r.Mode || '').trim();
  // Internal spacing is preserved — "Half lit  milk" is what the person typed,
  // and tidying it would quietly edit the only handwriting in this archive.
  const note = (r.Note || '').replace(/^\s+|\s+$/g, '');
  const flow = (r['Income/Expense'] || '').trim();
  const isIncome = /^income$/i.test(flow);

  if (!cat && !sub && !note) {
    drop('household: no category, subcategory or note');
    return;
  }
  if (!hhSpanFrom || when.at < hhSpanFrom) hhSpanFrom = when.at;
  if (!hhSpanTo || when.at > hhSpanTo) hhSpanTo = when.at;

  if (amount !== null && !isIncome) {
    bump(spendByMonth, when.at.slice(0, 7), amount);
    bump(spendByCategory, cat || 'Uncategorised', amount);
  }

  const route = routeOf(note) || (PLACE_RE.test(sub) ? tidyPlace(sub) : '');

  // One row becomes exactly one receipt. Its kind is decided by priority, so a
  // transport row is a place rather than a duplicate purchase, and a row whose
  // note carries real text becomes a note instead of a line of accounting.
  let kind;
  if (isIncome || /^(festival|gift|education)/i.test(cat)) kind = 'event';
  else if (/^entertainment/i.test(cat) || (/^subscription/i.test(cat) && SCREEN_RE.test(`${sub} ${note}`))) kind = 'movie';
  else if (/^transport/i.test(cat) || PLACE_RE.test(note)) kind = 'place';
  else if (noteRich(note, cat, sub, mode)) kind = 'note';
  else kind = 'purchase';

  const entities = new Set();
  addEntity(entities, cat);
  addEntity(entities, sub);
  addEntity(entities, mode);
  addWords(entities, note);
  if (route) addEntity(entities, route);

  const lines = [];
  if (amount !== null) lines.push({ label: isIncome ? 'RECEIVED' : 'AMOUNT', value: inr(amount) });
  if (mode) lines.push({ label: 'MODE', value: mode });
  if (cat) lines.push({ label: 'CATEGORY', value: cat });
  if (sub) lines.push({ label: 'SUBCATEGORY', value: sub });

  const catLine = cat && sub ? `${cat} · ${sub}` : cat || sub;
  const tags = [];
  if (!when.timeKnown) tags.push('time-unknown');
  if (isIncome) tags.push('income');
  if (/^(festival|gift)/i.test(cat)) tags.push('milestone');
  if (kind === 'place') tags.push('transit');
  if (kind === 'note') tags.push('handwritten');
  if (kind === 'movie') tags.push('screen');
  if (/cash/i.test(mode)) tags.push('cash');

  let title;
  let body;
  if (kind === 'note') {
    title = clip(note, 60);
    body = note;
  } else if (kind === 'place') {
    title = route || sub || cat;
  } else {
    title = note.length >= 5 ? clip(note, 60) : sub || cat;
  }
  if (!title) {
    drop(`household: untitleable ${kind} row`);
    return;
  }

  const receipt = {
    _ref: `hh:${i}`,
    _prefix: kind === 'purchase' ? 'hh' : kind === 'note' ? 'nte' : kind === 'place' ? 'plc' : kind === 'movie' ? 'mov' : 'evt',
    kind,
    at: when.at,
    title,
    detail: isIncome && catLine ? `${catLine} received` : catLine || undefined,
    body,
    lines,
    amount: amount === null ? undefined : amount,
    place: route || undefined,
    entities: [...entities],
    tags,
    source: 'household',
    provenance: 'observed',
  };
  hhBuckets[kind].push(receipt);

  // Money does not move between two people in silence. These rows are the seed
  // of a conversation no dataset here recorded.
  if (/^gift/i.test(cat) || /pocket money|transfer/i.test(`${sub} ${cat}`)) {
    messageSeeds.push({ receipt, amount, cat, sub, mode, note, at: when.at, timeKnown: when.timeKnown });
  }
});

for (const k of Object.keys(hhBuckets)) {
  hhBuckets[k].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a._ref < b._ref ? -1 : 1));
}

const hhSelected = [
  ...hhBuckets.event,
  ...hhBuckets.movie,
  ...pickSpread(hhBuckets.place, CAP.hhPlace),
  ...pickSpread(hhBuckets.note, CAP.hhNote),
  ...pickSpread(hhBuckets.purchase, CAP.hhPurchase),
];
const hhKept = new Set(hhSelected.map((r) => r._ref));

// A message can only rest on a receipt that actually ships, or its basis would
// point at nothing and the honesty claim would be hollow.
const messageCandidates = messageSeeds
  .filter((s) => hhKept.has(s.receipt._ref))
  .map((s, i) => {
    const entities = new Set();
    addEntity(entities, s.cat);
    addEntity(entities, s.sub);
    addWords(entities, s.note);
    const lines = [];
    if (s.amount !== null) lines.push({ label: 'ABOUT', value: inr(s.amount) });
    if (s.mode) lines.push({ label: 'SETTLED VIA', value: s.mode });
    if (s.sub || s.cat) lines.push({ label: 'CATEGORY', value: s.sub ? `${s.cat} · ${s.sub}` : s.cat });
    lines.push({ label: 'INFERRED FROM', value: '1 ledger entry' });
    const tags = ['inferred'];
    if (!s.timeKnown) tags.push('time-unknown');
    return {
      _ref: `msg:${i}`,
      _prefix: 'msg',
      _basisRefs: [s.receipt._ref],
      kind: 'message',
      at: s.at,
      title: s.note.length >= 5 ? clip(s.note, 60) : s.sub || s.cat,
      detail: 'Implied conversation',
      body: `No messages exist in this archive. This one is read from the ledger: ${inr(s.amount || 0)} moved between two people, which does not happen without someone asking.`,
      lines,
      entities: [...entities],
      tags,
      source: 'household',
      provenance: 'reconstructed',
    };
  })
  .filter((r) => r.title);
messageCandidates.sort((a, b) => (a.at < b.at ? -1 : 1));
const messageSelected = pickSpread(messageCandidates, CAP.hhMessage);

log(`   events ${hhBuckets.event.length} · screen ${hhBuckets.movie.length} · places ${hhBuckets.place.length}→${Math.min(hhBuckets.place.length, CAP.hhPlace)} · notes ${hhBuckets.note.length}→${Math.min(hhBuckets.note.length, CAP.hhNote)} · purchases ${hhBuckets.purchase.length}→${Math.min(hhBuckets.purchase.length, CAP.hhPurchase)} · messages ${messageCandidates.length}→${messageSelected.length}`);

// ═════════════════════════════════════════════════════════════════════════════
// C. Card ledger — nobody in it has a usable individual timeline, so the whole
// layer is attributed to the archive owner. docs/SOURCES.md says so.
//
// This header said "1,500 cardholders" until the identity columns were counted
// and none of them said 1,500 (see the counting block below). The file's row
// count is measured two lines down; its people were not measurable, so the
// number is gone rather than corrected.
// ═════════════════════════════════════════════════════════════════════════════

log('\n── reading Augmented_IndiaTransactMultiFacet2024.csv …');
const cardRows = parseCsv(readFileSync(F_CARDS, 'utf8'));
log(`   ${nnum(cardRows.length)} rows`);

const CAT_LABEL = {
  online_shopping: 'Online shopping',
  travel: 'Travel',
  entertainment: 'Entertainment',
  fitness_and_medical: 'Fitness & medical',
};

// ── The archive owner ────────────────────────────────────────────────────────
//
// An earlier build lifted the owner out of this file: it scanned for a named
// cardholder row and took that row's name, date of birth and job title. It read
// as the rigorous choice — nothing invented, every field sourced — and it was
// the opposite. The card file is shuffled cardholders with no individual
// timeline — and its own identity columns disagree about how many of them there
// are — so a row's `dob` and `job` describe nobody's decade. Adopting them
// forced every reading of the ledgers to argue from a demographic guess: the
// cash book *must* be a nineteen-year-old's because the row says born 1996, and
// August 2018's large credit *must* be a first salary because the row says the
// person works. Two inferences stacked on a row picked for its name.
//
// So the owner is now stated rather than mined, and what makes that an upgrade
// in honesty instead of a downgrade is `anchors`. They are dated facts from the
// owner's own record — the one first-party document anywhere in this build — and
// they let the app name a year instead of estimating an age. "The cash book
// stops two years before the class X boards" is checkable — and it had to be
// checked, because the first draft of this very comment said "the year before",
// which the ledger's own last row (2018-09-20) refutes against a 2020 anchor.
// "Aged nineteen" was a guess wearing a citation.
//
// Nothing here touches a single receipt: no row is selected, dropped or dated by
// any of it, and the ONLY key this block writes is `meta.owner`. The Sources
// page prints the anchors under a heading that says they came from outside the
// files, because a fact with no source file has to declare itself.
const owner = {
  name: 'Akshat Sharma',
  work: 'CSE undergraduate',
  at: 'Manipal University Jaipur',
  anchors: [
    { label: 'Class X, CBSE', year: 2020, note: '93.8%' },
    { label: 'Class XII, CBSE', year: 2022, note: '95.4%' },
    { label: 'B.Tech CSE begins', year: 2023, note: 'Manipal University Jaipur' },
  ],
};
log(`   owner: ${owner.name}, ${owner.work}, ${owner.at}`);
log(`   anchors: ${owner.anchors.map((a) => `${a.label} ${a.year}`).join(' · ')} (from outside the files)`);

const cardBuckets = { purchase: [], movie: [] };
const cityMonth = new Map();
let flaggedCount = 0;
let cardSpanFrom = '';
let cardSpanTo = '';
let cardDated = 0;

// ── Counts for the source caveat, taken over EVERY row ───────────────────────
// These have to be tallied before the validation `return`s below, because the
// caveat quotes them against `cardRows.length`. Counting them inside the loop
// body instead gives a numerator drawn from the rows that survived validation
// and a denominator drawn from the whole file — which reported the fraud label
// as true on 3,962 of 10,267 rows when the real figure is a little under half.
// A wrong number on the page whose only job is to be trusted is the worst kind.
let flaggedAll = 0;
let coordRows = 0;
let coordInIndia = 0;
const stateByCity = new Map();
// How many people are in this file? The caveat used to hard-type "1,500
// cardholders", a figure that is in none of the identity columns: they disagree
// with each other, which is a better version of the same point and is the actual
// reason the layer cannot be attributed to an individual. So count all three and
// let the page quote the disagreement instead of a round number nobody measured.
const custIds = new Set();
const cardNums = new Set();
const namePairs = new Set();
const namesById = new Map();
for (const r of cardRows) {
  const cust = (r.customer_id || '').trim();
  const card = (r.cc_num || '').trim();
  const first = (r.first || '').trim();
  const last = (r.last || '').trim();
  if (cust) custIds.add(cust);
  if (card) cardNums.add(card);
  if (first && last) {
    namePairs.add(`${first}\u0000${last}`);
    if (cust) {
      if (!namesById.has(cust)) namesById.set(cust, new Set());
      namesById.get(cust).add(`${first}\u0000${last}`);
    }
  }
  if (Number(r.is_fraud) === 1) flaggedAll++;
  const lat = Number.parseFloat(r.lat);
  const long = Number.parseFloat(r.long);
  if (Number.isFinite(lat) && Number.isFinite(long)) {
    coordRows++;
    // India's bounding box, generously drawn: 6°–37°N, 68°–98°E.
    if (lat >= 6 && lat <= 37 && long >= 68 && long <= 98) coordInIndia++;
  }
  const city = (r.city || '').trim();
  if (city) {
    if (!stateByCity.has(city)) stateByCity.set(city, new Set());
    // Only *named* states count toward the contradiction. 779 card rows carry a
    // city with the state column empty, and adding '' to this set counted a
    // missing value as a second state — inflating the figure from 294 to 303 and
    // crediting nine cities with a disagreement they do not have. The figure is
    // the published reason `state` is not shipped at all, so it has to be the
    // honest one; 294 of 311 still settles the question.
    const state = (r.state || '').trim();
    if (state) stateByCity.get(city).add(state);
  }
}
const cityCount = stateByCity.size;
const cityMultiState = [...stateByCity.values()].filter((s) => s.size > 1).length;
const idsWithName = namesById.size;
const idsMultiName = [...namesById.values()].filter((s) => s.size > 1).length;

cardRows.forEach((r, i) => {
  const when = cardAt(r.trans_date_trans_time);
  if (!when) {
    drop('cards: unparseable or missing date');
    return;
  }
  const amount = money(r.amt);
  if (amount === null) {
    drop('cards: missing amount');
    return;
  }
  const merchant = (r.merchant || '').replace(/^fraud_/i, '').trim();
  if (!merchant) {
    drop('cards: missing merchant');
    return;
  }
  const rawCat = (r.category || '').trim();
  const category = CAT_LABEL[rawCat] || (rawCat ? titleCase(rawCat.replace(/_/g, ' ')) : '');
  const city = (r.city || '').trim();
  // Written as '1.0' / '0.0', not '1' / '0'. And true on just under half the
  // file — it was balanced for training a classifier, so the label describes the
  // dataset's construction, not anything that happened to a person. The count
  // that reaches the caveat is `flaggedAll`, tallied above over every row; this
  // one only tracks the rows that became receipts.
  const flagged = Number(r.is_fraud) === 1;

  cardDated++;
  if (!cardSpanFrom || when.at < cardSpanFrom) cardSpanFrom = when.at;
  if (!cardSpanTo || when.at > cardSpanTo) cardSpanTo = when.at;
  bump(spendByMonth, when.at.slice(0, 7), amount);
  bump(spendByCategory, category || 'Uncategorised', amount);
  if (flagged) flaggedCount++;

  if (city) {
    const key = `${city}\u0000${when.at.slice(0, 7)}`;
    if (!cityMonth.has(key)) cityMonth.set(key, { city, at: when.at, uses: 0, spend: 0 });
    const g = cityMonth.get(key);
    g.uses++;
    g.spend += amount;
    if (when.at < g.at) g.at = when.at;
  }

  const entities = new Set();
  addEntity(entities, merchant);
  addEntity(entities, category);
  addEntity(entities, city);

  const lines = [{ label: 'AMOUNT', value: inr(amount) }];
  lines.push({ label: 'MERCHANT', value: merchant });
  if (category) lines.push({ label: 'CATEGORY', value: category });
  if (city) lines.push({ label: 'CITY', value: city });
  // There is no CARD line, and the reason is a defect in the source rather than a
  // policy about privacy. The rule was "only ever the last four digits", which is
  // the right rule; the problem is that this file has no last four digits to ship.
  //
  // `cc_num` was written out of a float column, so every value arrives already
  // destroyed, in one of two ways:
  //
  //   '4126110000000000.0'  — rounded to ~7 significant digits, the rest zeros
  //   '4.42786e+18'         — printed in scientific notation, 6 digits survive
  //
  // The old line was `(r.cc_num || '').replace(/\D/g, '').slice(-4)`, and against
  // those two shapes it did not read a card number, it manufactured one. Stripping
  // non-digits from the first shape yields '…0000', so **311 of the 359 receipts
  // that carried this line printed `•••• 0000`**. Stripping them from the second
  // deletes the '.', the 'e' and the '+' but *keeps the exponent*, so
  // '4.42786e+18' became '44278618' and the receipt printed `•••• 8618` — two
  // mantissa digits with the exponent glued on. That is why 45 of the remaining 48
  // ended in '18': not a coincidence in the data, the exponent of 1e18.
  //
  // So every value this line has ever printed was an artefact of a float's decimal
  // representation. `•••• 0000` is the worse of the two, because it looks like an
  // unset field, and `•••• 8618` is worse still, because it looks like a fact. A
  // fabricated fact is exactly what the archive's own rule forbids, and the rule
  // for a field the source did not preserve is the same as for any other missing
  // field: omit the line. Nothing here can be recovered by parsing more carefully.
  //
  // Recorded in docs/SOURCES.md beside the broken coordinates and the
  // self-contradicting `state` column, which are the same kind of finding.

  const tags = ['card'];
  if (flagged) tags.push('flagged');
  if (/^travel$/i.test(rawCat)) tags.push('travel');
  if (/^entertainment$/i.test(rawCat)) tags.push('screen');

  const kind = /^entertainment$/i.test(rawCat) ? 'movie' : 'purchase';
  cardBuckets[kind].push({
    _ref: `cd:${i}`,
    _prefix: kind === 'movie' ? 'mov' : 'cd',
    _city: city,
    _week: weekKey(when.at),
    kind,
    at: when.at,
    title: merchant,
    detail: category || undefined,
    lines,
    amount,
    city: city || undefined,
    entities: [...entities],
    tags,
    source: 'cards',
    provenance: 'observed',
  });
});
log(`   ${nnum(cardDated)} dated rows · ${nnum(flaggedCount)} of them flagged · ${nnum(flaggedAll)}/${nnum(cardRows.length)} flagged across the whole file`);
log(`   geography: ${nnum(coordInIndia)}/${nnum(coordRows)} coordinates inside India · ${nnum(cityMultiState)}/${nnum(cityCount)} cities under more than one state`);

for (const k of Object.keys(cardBuckets)) {
  cardBuckets[k].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a._ref < b._ref ? -1 : 1));
}

// Three or more cities inside one week is a trip, and trips get photographed.
// Built from every dated row so the trips are real ones, then the rows they rest
// on are force-kept in the shipped purchases so the basis always resolves.
const weeks = new Map();
for (const p of cardBuckets.purchase) {
  if (!p._city) continue;
  if (!weeks.has(p._week)) weeks.set(p._week, []);
  weeks.get(p._week).push(p);
}

const photoCandidates = [];
const forcedCardRefs = new Set();
for (const [wk, rows] of [...weeks.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const byCity = new Map();
  for (const r of rows) if (!byCity.has(r._city)) byCity.set(r._city, r);
  if (byCity.size < 3) continue;
  const reps = [...byCity.values()].sort((a, b) => (a.at < b.at ? -1 : 1)).slice(0, 4);
  const cities = reps.map((r) => r._city);
  const spend = rows.reduce((s, r) => s + r.amount, 0);
  const entities = new Set();
  for (const r of reps) {
    addEntity(entities, r._city);
  }
  photoCandidates.push({
    _ref: `pho:${wk}`,
    _prefix: 'pho',
    _basisRefs: reps.map((r) => r._ref),
    _forces: reps.map((r) => r._ref),
    kind: 'photo',
    at: reps[0].at,
    title: `${cities[0]} → ${cities[cities.length - 1]}`,
    detail: `${byCity.size} cities in one week`,
    body: `No photographs exist in this archive. This frame is read from the card ledger: ${nnum(rows.length)} uses across ${byCity.size} cities in the week of ${dateLabel(wk)} — ${cities.join(', ')} — which is a journey whether or not anyone pointed a camera at it.`,
    lines: [
      { label: 'CITIES', value: clip(cities.join(', '), 48) },
      { label: 'CARD USES', value: nnum(rows.length) },
      { label: 'SPEND', value: inr(spend) },
      { label: 'WEEK OF', value: dateLabel(wk) },
    ],
    city: cities[0],
    entities: [...entities],
    tags: ['travel', 'inferred'],
    source: 'cards',
    provenance: 'reconstructed',
  });
}
const photoSelected = pickSpread(photoCandidates, CAP.cardPhoto);
for (const p of photoSelected) for (const ref of p._forces) forcedCardRefs.add(ref);

const cardPurchaseSelected = pickSpread(cardBuckets.purchase, CAP.cardPurchase, forcedCardRefs);
const cardMovieSelected = pickSpread(cardBuckets.movie, CAP.cardMovie);

const placeCandidates = [...cityMonth.values()]
  .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.city < b.city ? -1 : 1))
  .map((g, i) => {
    const entities = new Set();
    addEntity(entities, g.city);
    return {
      _ref: `plc-cd:${i}`,
      _prefix: 'plc',
      kind: 'place',
      at: g.at,
      title: g.city,
      detail: `${MONTHS[Number(g.at.slice(5, 7)) - 1]} ${g.at.slice(0, 4)}`,
      lines: [
        { label: 'CARD USES', value: nnum(g.uses) },
        { label: 'SPEND', value: inr(g.spend) },
        { label: 'FIRST SEEN', value: dateLabel(g.at) },
      ],
      amount: Math.round(g.spend),
      city: g.city,
      entities: [...entities],
      tags: ['travel', 'card'],
      source: 'cards',
      provenance: 'observed',
    };
  });
const cardPlaceSelected = pickSpread(placeCandidates, CAP.cardPlace);

log(`   purchases ${cardBuckets.purchase.length}→${cardPurchaseSelected.length} · screen ${cardBuckets.movie.length}→${cardMovieSelected.length} · places ${placeCandidates.length}→${cardPlaceSelected.length} · photos ${photoCandidates.length}→${photoSelected.length}`);

// ═════════════════════════════════════════════════════════════════════════════
// Assemble
// ═════════════════════════════════════════════════════════════════════════════

const allCandidates = [
  ...musicSelected, ...searchSelected,
  ...hhSelected, ...messageSelected,
  ...cardPurchaseSelected, ...cardMovieSelected, ...cardPlaceSelected, ...photoSelected,
];
const all = allCandidates.filter((r) => Number(r.at.slice(0, 4)) >= ARCHIVE_FROM_YEAR);
drop(`before ${ARCHIVE_FROM_YEAR}: the account's thin opening years`, allCandidates.length - all.length);

// Time order first, then number — so a rebuild that shifts one bucket's cap does
// not renumber the entire archive at random.
all.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a._prefix < b._prefix ? -1 : a._prefix > b._prefix ? 1 : a._ref < b._ref ? -1 : 1));

const counters = new Map();
const refToId = new Map();
for (const r of all) {
  const n = (counters.get(r._prefix) || 0) + 1;
  counters.set(r._prefix, n);
  r.id = `${r._prefix}-${pad(n, 4)}`;
  refToId.set(r._ref, r.id);
}

// A reconstructed receipt with an unresolvable basis would be an unsupported
// claim, which is exactly what the provenance model exists to prevent.
const resolved = [];
for (const r of all) {
  if (r.provenance === 'reconstructed') {
    const basis = (r._basisRefs || []).map((ref) => refToId.get(ref)).filter(Boolean);
    if (!basis.length) {
      drop('reconstructed receipt whose basis did not ship');
      continue;
    }
    r.basis = basis;
  }
  resolved.push(r);
}

// An entity on a quarter of all receipts is a category label, not a connection,
// and would wire the constellation into a single useless hub.
const entityCount = new Map();
for (const r of resolved) for (const e of r.entities) bump(entityCount, e);
const hubFloor = Math.max(20, Math.round(resolved.length * 0.25));
const hubs = [...entityCount.entries()].filter(([, n]) => n > hubFloor).map(([e]) => e).sort();
const hubSet = new Set(hubs);
if (hubs.length) log(`\n── dropped ${hubs.length} hub entities (on >${hubFloor} of ${resolved.length} receipts): ${hubs.join(', ')}`);

const KEEP = ['id', 'kind', 'at', 'title', 'detail', 'body', 'lines', 'amount', 'place', 'city', 'entities', 'tags', 'source', 'provenance', 'basis'];

// Fields the Receipt contract declares non-optional. An empty array is still a
// value here, and stripping it to save bytes is how `r.tags.includes(...)` ends
// up throwing in a component that was entitled to trust the type. Optional
// fields are dropped when empty; required ones are always written.
const REQUIRED = new Set(['id', 'kind', 'at', 'title', 'entities', 'tags', 'source', 'provenance']);

const receipts = resolved.map((r) => {
  const out = {};
  for (const k of KEEP) {
    let v = r[k];
    if (k === 'entities') v = r.entities.filter((e) => !hubSet.has(e)).sort();
    if (k === 'tags') v = [...new Set(r.tags)].sort();
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0 && !REQUIRED.has(k)) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
});

const years = [...new Set(receipts.map((r) => Number(r.at.slice(0, 4))))].sort((a, b) => a - b);
const from = receipts.length ? receipts[0].at : '';
const to = receipts.length ? receipts[receipts.length - 1].at : '';

function objFromMap(map, sortKeys = true) {
  const entries = [...map.entries()];
  if (sortKeys) entries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const o = {};
  for (const [k, v] of entries) o[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
  return o;
}

const artistsByYear = {};
for (const y of [...artistPlaysByYear.keys()].sort((a, b) => a - b)) {
  artistsByYear[String(y)] = topN(artistPlaysByYear.get(y), 8, 'name', 'plays');
}

const aggregates = {
  playsByHour,
  playsByWeekdayHour,
  playsByMonth: objFromMap(playsByMonth),
  artistsByYear,
  topArtists: topN(artistPlays, 30, 'name', 'plays'),
  topTracks: topN(trackPlays, 24, 'key', 'plays').map(({ key, plays }) => {
    const [name, artist] = key.split('\u0000');
    return { name, artist: artist || '—', plays };
  }),
  spendByMonth: objFromMap(spendByMonth),
  spendByCategory: objFromMap(spendByCategory),
  totalListeningHours: Math.round(totalMs / 3600000),
  totalPlays,
  skipRate: Math.round((skipped / Math.max(1, totalPlays)) * 10000) / 10000,
};

function span(a, b) {
  return a && b ? `${a.slice(0, 7)} → ${b.slice(0, 7)}` : '—';
}

const countBy = (pred) => receipts.filter(pred).length;

const sources = [
  {
    id: 'spotify',
    file: 'spotify_history.csv',
    label: 'Spotify streaming history',
    what: 'One listener’s complete extended streaming history — every play, with duration, skip and shuffle flags.',
    rows: spotifyRowCount,
    receipts: countBy((r) => r.source === 'spotify'),
    span: span(spSpanFrom, spSpanTo),
    feeds: ['music', 'search'],
    caveat: 'The export documents its timestamps as UTC, but the hour histogram says otherwise: read as UTC and shifted to IST, listening peaks at 05:00 and all but stops at 17:00, which is nobody\'s day. Read as written, it peaks at midnight and empties at noon. They are already local, so they are used unshifted. 149,860 plays cannot ship to a browser, so the unit here is the listening session — consecutive plays less than 30 minutes apart. Searches are reconstructed from first appearances, not recorded.',
  },
  {
    id: 'household',
    file: 'Daily Household Transactions.csv',
    label: 'Household ledger',
    what: 'A hand-kept daily expense ledger in INR, with free-text notes someone typed every day for four years.',
    rows: hhRows.length,
    receipts: countBy((r) => r.source === 'household'),
    span: span(hhSpanFrom, hhSpanTo),
    feeds: ['purchase', 'note', 'place', 'movie', 'event', 'message'],
    caveat: 'Dates are day-first with inconsistent padding and many rows carry no time at all; those are filed at midday and tagged time-unknown, and excluded from anything plotted against the hour. Places were already anonymised in the source as "Place 0"–"Place 5" and are preserved as written. Messages are reconstructed from transfers, not recorded.',
  },
  {
    id: 'cards',
    file: 'Augmented_IndiaTransactMultiFacet2024.csv',
    label: 'Card ledger',
    what: 'An Indian card-transaction set built for fraud-detection research, carrying merchant, category, amount, city and a per-row fraud label.',
    rows: cardRows.length,
    receipts: countBy((r) => r.source === 'cards'),
    span: span(cardSpanFrom, cardSpanTo),
    feeds: ['purchase', 'place', 'movie', 'photo'],
    caveat: `Its three identity columns do not agree on how many people are in it — ${nnum(custIds.size)} distinct customer ids, ${nnum(cardNums.size)} distinct card numbers, ${nnum(namePairs.size)} distinct names — and ${nnum(idsMultiName)} of ${nnum(idsWithName)} customer ids carry more than one person's name. Nobody here has a usable personal timeline, so the layer is attributed to the archive owner as a whole. Every merchant carried a "fraud_" prefix as an artefact of the file's origin, which is stripped. Its fraud label is true on ${nnum(flaggedAll)} of ${nnum(cardRows.length)} rows — just under half, because the file was balanced for training a classifier — so a flagged charge here describes how the dataset was built, not something that happened to a person, and the app says so rather than dressing it up as a mystery. The geography is synthetic: of the ${nnum(coordRows)} rows carrying coordinates, only ${nnum(coordInIndia)} fall inside India, and ${nnum(cityMultiState)} of ${nnum(cityCount)} cities appear under more than one state, so the state column is not shipped and no map is drawn. City names are real and are used as written. No card number is shipped at all: the column was written out of a float, so it reaches the ETL either rounded to trailing zeros or printed as 4.42786e+18, and there are no last four digits left in it to keep.`,
  },
];

const archive = {
  meta: {
    owner,
    from,
    to,
    receipts: receipts.length,
    years: years.length,
    builtFrom: sources.map((s) => s.file),
  },
  receipts,
  aggregates,
  sources,
};

mkdirSync('src/data', { recursive: true });
writeFileSync(OUT, `${JSON.stringify(archive, null, 0)}\n`);

// ═════════════════════════════════════════════════════════════════════════════
// The build's own receipt
// ═════════════════════════════════════════════════════════════════════════════

const byKind = new Map();
const bySource = new Map();
const byYear = new Map();
for (const r of receipts) {
  bump(byKind, r.kind);
  bump(bySource, r.source);
  bump(byYear, r.at.slice(0, 4));
}

log('\n════════════════════════════════════════════════════════');
log(`archive: ${nnum(receipts.length)} receipts · ${from.slice(0, 10)} → ${to.slice(0, 10)} · ${years.length} years`);
log(`file:    ${OUT} · ${(statSync(OUT).size / 1048576).toFixed(2)} MB`);
log('\nby kind');
for (const [k, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
  log(`  ${k.padEnd(9)} ${String(n).padStart(5)}`);
}
const missing = ['music', 'movie', 'place', 'purchase', 'photo', 'message', 'search', 'event', 'note'].filter((k) => !byKind.has(k));
log(missing.length ? `  ! MISSING KINDS: ${missing.join(', ')}` : '  ✓ all nine kinds present');
log('\nby source');
for (const [k, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) log(`  ${k.padEnd(9)} ${String(n).padStart(5)}`);
log('\nby year');
for (const [k, n] of [...byYear.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) log(`  ${k} ${String(n).padStart(5)}`);
log('\nprovenance');
log(`  observed      ${nnum(countBy((r) => r.provenance === 'observed'))}`);
log(`  reconstructed ${nnum(countBy((r) => r.provenance === 'reconstructed'))} (all carry a basis: ${receipts.every((r) => r.provenance !== 'reconstructed' || (r.basis && r.basis.length)) ? 'yes' : 'NO'})`);
log('\ndropped rows');
for (const [k, n] of [...dropped.entries()].sort((a, b) => b[1] - a[1])) log(`  ${String(n).padStart(6)}  ${k}`);
if (!dropped.size) log('  none');
log('\nsanity');
const blank = receipts.filter((r) => !r.title || !r.id || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(r.at));
log(`  malformed receipts: ${blank.length}`);
const raw = readFileSync(OUT, 'utf8');
for (const bad of ['undefined', 'NaN', 'null', 'Infinity']) {
  const n = raw.split(bad).length - 1;
  log(`  literal "${bad}" in JSON: ${n}`);
}
log(`  entities per receipt: min ${Math.min(...receipts.map((r) => r.entities.length))} · avg ${(receipts.reduce((s, r) => s + r.entities.length, 0) / receipts.length).toFixed(1)}`);
log(`  hour histogram: peak ${playsByHour.indexOf(Math.max(...playsByHour))}:00 · trough ${playsByHour.indexOf(Math.min(...playsByHour))}:00`);
log('════════════════════════════════════════════════════════\n');
