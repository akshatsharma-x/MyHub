// One-off data profiler. Reads the three source datasets and prints the facts
// the ETL and the narrative design need. Not part of the app build.
import { readFileSync } from 'node:fs';

const RAW = new URL('../_raw/', import.meta.url);

/** Minimal RFC4180-ish CSV parser: handles quoted fields with commas/newlines. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  // Strip BOM — the Spotify export has one and it corrupts the first header.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map(h => h.trim());
  return rows
    .filter(r => r.length === header.length)
    .map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const top = (map, n = 15) =>
  [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

const bump = (map, k, by = 1) => map.set(k, (map.get(k) ?? 0) + by);

// ── Spotify ──────────────────────────────────────────────────────────────────
console.log('\n════════ SPOTIFY ════════');
const sp = parseCsv(readFileSync(new URL('spotify_history.csv', RAW), 'utf8'));
console.log('rows:', sp.length, '| sample:', JSON.stringify(sp[1000]));

const byYear = new Map(), byHour = new Map(), artistAll = new Map();
const artistByYear = new Map(), trackAll = new Map(), platforms = new Map();
let msTotal = 0, skips = 0;

for (const r of sp) {
  const y = r.ts.slice(0, 4);
  const hour = Number(r.ts.slice(11, 13));
  const ms = Number(r.ms_played) || 0;
  msTotal += ms;
  if (r.skipped === 'TRUE') skips++;
  bump(byYear, y);
  bump(byHour, hour);
  bump(platforms, r.platform);
  // Only count a play as "listened" past 30s — the dataset is full of 3-second
  // skips, and those should not decide who the top artist of a year was.
  if (ms > 30000) {
    bump(artistAll, r.artist_name, 1);
    bump(trackAll, `${r.track_name} — ${r.artist_name}`, 1);
    if (!artistByYear.has(y)) artistByYear.set(y, new Map());
    bump(artistByYear.get(y), r.artist_name, 1);
  }
}

console.log('total listening hours:', Math.round(msTotal / 3.6e6));
console.log('skip rate:', ((skips / sp.length) * 100).toFixed(1) + '%');
console.log('platforms:', top(platforms, 8));
console.log('\nplays by hour (0-23):');
for (let h = 0; h < 24; h++) console.log(' ', String(h).padStart(2, '0'), (byHour.get(h) ?? 0));
console.log('\nTOP ARTISTS ALL TIME:', top(artistAll, 20));
console.log('\nTOP TRACKS ALL TIME:', top(trackAll, 15));
console.log('\nTOP 6 ARTISTS PER YEAR:');
for (const y of [...artistByYear.keys()].sort())
  console.log(' ', y, JSON.stringify(top(artistByYear.get(y), 6)));

// ── Household ────────────────────────────────────────────────────────────────
console.log('\n════════ HOUSEHOLD ════════');
const hh = parseCsv(readFileSync(new URL('Daily Household Transactions.csv', RAW), 'utf8'));
console.log('rows:', hh.length, '| keys:', Object.keys(hh[0]));
const hhYear = new Map(), hhCat = new Map(), hhSub = new Map(), hhMode = new Map();
for (const r of hh) {
  const [d, m, y] = r.Date.split(' ')[0].split('/');
  bump(hhYear, y);
  bump(hhCat, `${r.Category}/${r.Subcategory}`);
  bump(hhSub, r.Subcategory);
  bump(hhMode, r.Mode);
  void d; void m;
}
console.log('by year:', [...hhYear.entries()].sort());
console.log('modes:', top(hhMode, 10));
console.log('TOP category/sub:', top(hhCat, 30));
console.log('\nSAMPLE NOTES (the real texture):');
for (const r of hh.filter(r => r.Note && r.Note.length > 12).slice(0, 25))
  console.log('  ', r.Date, '|', r.Category, '|', r.Amount, '|', r.Note);

// ── India cards ──────────────────────────────────────────────────────────────
console.log('\n════════ INDIA CARDS ════════');
const ic = parseCsv(readFileSync(new URL('Augmented_IndiaTransactMultiFacet2024.csv', RAW), 'utf8'));
console.log('rows:', ic.length, '| keys:', Object.keys(ic[0]));
const person = new Map(), icCat = new Map(), icMerch = new Map(), icState = new Map();
for (const r of ic) {
  bump(person, `${r.first} ${r.last}|${r.dob}|${r.job}`);
  if (r.category) bump(icCat, r.category);
  bump(icMerch, r.merchant);
  if (r.state) bump(icState, r.state);
}
console.log('distinct people:', person.size);
console.log('TOP people by txn count:', top(person, 12));
console.log('categories:', top(icCat, 20));
console.log('states:', top(icState, 12));
console.log('top merchants:', top(icMerch, 10));
// How complete is the geo for the busiest person?
const [busiest] = top(person, 1)[0];
const rows = ic.filter(r => `${r.first} ${r.last}|${r.dob}|${r.job}` === busiest);
console.log('\nbusiest person rows:', rows.length);
console.log('  with lat/long:', rows.filter(r => r.lat && r.long).length);
console.log('  with city:', rows.filter(r => r.city).length);
console.log('  with category:', rows.filter(r => r.category).length);
console.log('  date span:', rows.map(r => r.trans_date_trans_time).sort().at(0), '→',
  rows.map(r => r.trans_date_trans_time).sort().at(-1));
console.log('  sample:', JSON.stringify(rows.slice(0, 3), null, 1));
