// Second pass: the facts the ETL needs to make concrete choices.
import { readFileSync } from 'node:fs';
import { parseCsv } from './profile.mjs';

const RAW = new URL('../_raw/', import.meta.url);
const bump = (m, k, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const top = (m, n = 15) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

console.log('════════ CARDS: shape for a 2023-24 ledger ════════');
const ic = parseCsv(readFileSync(new URL('Augmented_IndiaTransactMultiFacet2024.csv', RAW), 'utf8'));
const ym = new Map(), fraud = new Map(), hour = new Map();
let noDate = 0, noAmt = 0;
for (const r of ic) {
  const t = r.trans_date_trans_time;
  if (!t) { noDate++; continue; }
  const [datePart, timePart] = t.split(' ');
  const [m, d, y] = datePart.split('/');
  bump(ym, `${y}-${String(m).padStart(2, '0')}`);
  bump(fraud, r.is_fraud || '(blank)');
  if (timePart) bump(hour, Number(timePart.split(':')[0]));
  if (!r.amt) noAmt++;
  void d;
}
console.log('by year-month:', [...ym.entries()].sort());
console.log('is_fraud:', [...fraud.entries()]);
console.log('rows missing date:', noDate, '| missing amt:', noAmt);
console.log('txn by hour:', [...hour.entries()].sort((a, b) => a[0] - b[0]));

// Completeness per field — decides what the UI is allowed to print.
const fields = Object.keys(ic[0]);
console.log('\nfield fill rate:');
for (const f of fields) {
  const n = ic.filter(r => r[f] && r[f] !== '').length;
  console.log('  ', f.padEnd(24), (n / ic.length * 100).toFixed(1) + '%');
}
// Are the lat/longs actually in India? (India ≈ lat 8–37, long 68–97)
const geo = ic.filter(r => r.merch_lat && r.merch_long);
const inIndia = geo.filter(r => {
  const la = +r.merch_lat, lo = +r.merch_long;
  return la > 8 && la < 37 && lo > 68 && lo < 97;
});
console.log(`\ngeo rows: ${geo.length}, plausibly in India: ${inIndia.length}`);
console.log('cities (non-blank):', top(ic.reduce((m, r) => (r.city && bump(m, r.city), m), new Map()), 15));
console.log('merchant sample (cleaned):', [...new Set(ic.map(r => r.merchant).filter(Boolean))]
  .slice(0, 12).map(s => s.replace(/^fraud_/, '')));
console.log('entertainment merchants:', [...new Set(
  ic.filter(r => r.category === 'entertainment').map(r => r.merchant.replace(/^fraud_/, '')))].slice(0, 10));

console.log('\n════════ SPOTIFY: session shape ════════');
const sp = parseCsv(readFileSync(new URL('spotify_history.csv', RAW), 'utf8'))
  .filter(r => r.ts).sort((a, b) => a.ts.localeCompare(b.ts));
// A session = consecutive plays separated by < 30 min. The receipt is the
// session, not the play — "a 2AM session, 14 tracks" is a moment; one play is a row.
const GAP = 30 * 60 * 1000;
const sessions = [];
let cur = null;
for (const r of sp) {
  const t = Date.parse(r.ts.replace(' ', 'T') + 'Z');
  if (!cur || t - cur.end > GAP) {
    cur = { start: t, end: t, plays: [r], ms: Number(r.ms_played) || 0 };
    sessions.push(cur);
  } else {
    cur.end = t; cur.plays.push(r); cur.ms += Number(r.ms_played) || 0;
  }
}
console.log('sessions:', sessions.length);
const buckets = { '1': 0, '2-4': 0, '5-9': 0, '10-24': 0, '25+': 0 };
for (const s of sessions) {
  const n = s.plays.length;
  buckets[n === 1 ? '1' : n < 5 ? '2-4' : n < 10 ? '5-9' : n < 25 ? '10-24' : '25+']++;
}
console.log('by track count:', buckets);
const meaty = sessions.filter(s => s.plays.length >= 4 && s.ms > 10 * 60 * 1000);
console.log('sessions >=4 tracks & >10min:', meaty.length);
const byYear = new Map();
for (const s of meaty) bump(byYear, new Date(s.start).getUTCFullYear());
console.log('meaty sessions per year:', [...byYear.entries()].sort());
// Obsessions: one track played >=5x inside a single session.
let obsess = 0;
for (const s of sessions) {
  const c = new Map();
  for (const p of s.plays) bump(c, p.track_name);
  if ([...c.values()].some(v => v >= 5)) obsess++;
}
console.log('sessions with a >=5x repeat (obsession loops):', obsess);
