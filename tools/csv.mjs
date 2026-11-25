// Quote-aware RFC4180-ish CSV reader, shared by the profilers and the ETL.
// Pure module on purpose: importing tools/profile.mjs for its parser re-ran that
// file's entire profiling body, so the parser now lives somewhere side-effect free.

/**
 * @param {string} text raw file contents
 * @returns {Array<Record<string, string>>} one object per row, keyed by header
 */
export function parseCsv(text) {
  // The Spotify export is UTF-8 with a BOM, which otherwise corrupts the first
  // header key into "﻿spotify_track_uri".
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [], field = '', quoted = false;
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

  if (!rows.length) return [];
  const header = rows.shift().map(h => h.trim());
  const out = [];
  for (const r of rows) {
    // A short/long row means a malformed line, not a row with blanks; the
    // callers would silently read a shifted column, so drop it instead.
    if (r.length !== header.length) continue;
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = r[i];
    out.push(obj);
  }
  return out;
}

/** Rows the parser refused, so the ETL can report them honestly. */
export function countMalformed(text) {
  const before = text.split('\n').filter(l => l.length).length;
  return Math.max(0, before - 1 - parseCsv(text).length);
}
