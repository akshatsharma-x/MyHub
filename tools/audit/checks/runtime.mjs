// The brief's hard constraints, measured in a browser rather than asserted:
//
//  · no backend: across a full visit — every route, a search, an opened receipt,
//    a theme switch — every request is a same-origin read, nothing touches /api,
//    and nothing answers with an error;
//  · one key: afterwards localStorage holds app_theme and nothing else, and
//    sessionStorage, cookies and IndexedDB are empty;
//  · the theme is right at FIRST paint, read at DOMContentLoaded before React
//    runs, for a stored choice either way, no choice under either OS setting,
//    and a corrupted value; the toggle writes the key and survives a reload;
//  · an unmatched URL answers 404.

import { ROUTES } from '../lib/routes.mjs';

export const about = 'same-origin reads only, no /api, one storage key, theme at first paint ×6, 404 status';

export async function run({ open, origin }) {
  const tab = await open();
  const findings = [];
  const requests = [];
  const failed = [];
  tab.on((m) => {
    if (m.method === 'Network.requestWillBeSent') requests.push({ url: m.params.request.url, method: m.params.request.method });
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) failed.push(`${m.params.response.status} ${m.params.response.url}`);
  });
  await tab.send('Network.enable');
  await tab.send('Network.setCacheDisabled', { cacheDisabled: true });
  await tab.viewport(1280);
  await tab.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });

  // ── a full visit ──
  for (const r of ROUTES) await tab.goto(r, 900);
  await tab.eval(`[...document.querySelectorAll('#nx-rail a')].find((a) => a.getAttribute('href') === '/roll').click()`);
  await new Promise((r) => setTimeout(r, 1200));
  await tab.eval(`(() => { const i = document.getElementById('roll-search'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'milk'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await new Promise((r) => setTimeout(r, 500));
  await tab.eval(`[...document.querySelectorAll('main button')].find((x) => x.querySelector('.k-line'))?.click()`);
  await new Promise((r) => setTimeout(r, 700));
  // The toggle is named by whichever sr-only span the theme leaves displayed,
  // not by an aria-label; a first draft looked for one and called it broken.
  await tab.eval(`[...document.querySelectorAll('button')].find((b) => b.querySelector('.nx-when-dark'))?.click()`);
  await new Promise((r) => setTimeout(r, 400));

  const origins = [...new Set(requests.map((r) => new URL(r.url).origin))];
  if (origins.some((o) => o !== origin)) findings.push(`requests left the origin: ${origins.filter((o) => o !== origin).join(', ')}`);
  // Reads only: GET, and HEAD. A static export's router sends a HEAD to each
  // page before prefetching its segment files, to catch a redirect first
  // (next/dist/client/components/segment-cache/cache.js), so HEAD is the
  // framework reading a file. Anything that can change state — a form post, a
  // server action — is what this exists to catch.
  for (const r of requests.filter((x) => x.method !== 'GET' && x.method !== 'HEAD').slice(0, 3)) findings.push(`a ${r.method} request: ${r.url}`);
  for (const r of requests.filter((x) => /\/api\//.test(x.url)).slice(0, 3)) findings.push(`an /api request: ${r.url}`);
  for (const f of failed.slice(0, 5)) findings.push(`a failed response during a normal visit: ${f}`);

  const store = await tab.eval(`(async () => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookies: document.cookie,
    idb: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [] }))()`);
  if (JSON.stringify(store.local) !== '["app_theme"]') findings.push(`localStorage holds ${JSON.stringify(store.local)}, not exactly ["app_theme"]`);
  if (store.session.length || store.cookies || store.idb.length) findings.push(`other storage in use: ${JSON.stringify(store)}`);

  // ── the theme at first paint ──
  await tab.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `document.addEventListener('DOMContentLoaded', () => { window.__themeAtParse = document.documentElement.getAttribute('data-theme'); }, { once: true });`,
  });
  const CASES = [['dark', 'light', 'dark'], ['light', 'dark', 'light'], [null, 'light', 'light'], [null, 'dark', 'dark'], ['purple', 'light', 'light'], ['', 'dark', 'dark']];
  for (const [stored, os, want] of CASES) {
    await tab.send('Storage.clearDataForOrigin', { origin, storageTypes: 'local_storage' });
    await tab.goto('/sources', 300);
    if (stored !== null) await tab.eval(`localStorage.setItem('app_theme', ${JSON.stringify(stored)})`);
    await tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: os }] });
    await tab.send('Page.reload', { ignoreCache: true });
    await new Promise((r) => setTimeout(r, 1300));
    const t = await tab.eval(`({ atParse: window.__themeAtParse, now: document.documentElement.getAttribute('data-theme') })`);
    if (t.atParse !== want || t.now !== want) findings.push(`stored=${JSON.stringify(stored)} with the OS on ${os}: first paint ${t.atParse}, after hydration ${t.now}, expected ${want}`);
  }

  await tab.send('Storage.clearDataForOrigin', { origin, storageTypes: 'local_storage' });
  await tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await tab.goto('/');
  const clicked = await tab.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.querySelector('.nx-when-dark')); if (!b) return false; b.click(); return true; })()`);
  await new Promise((r) => setTimeout(r, 500));
  const t1 = await tab.eval(`({ attr: document.documentElement.getAttribute('data-theme'), key: localStorage.getItem('app_theme') })`);
  await tab.send('Page.reload', {});
  await new Promise((r) => setTimeout(r, 1300));
  const t2 = await tab.eval(`({ atParse: window.__themeAtParse, attr: document.documentElement.getAttribute('data-theme') })`);
  if (!clicked) findings.push('the theme toggle could not be found');
  else if (!(t1.attr === 'light' && t1.key === 'light' && t2.atParse === 'light' && t2.attr === 'light')) findings.push(`the toggle did not switch, store and keep the theme: ${JSON.stringify({ t1, t2 })}`);
  await tab.send('Emulation.setEmulatedMedia', { features: [] });

  const missing = await fetch(`${origin}/this-page-does-not-exist`);
  if (missing.status !== 404) findings.push(`an unmatched URL answered ${missing.status}, not 404`);

  for (const l of tab.logs) findings.push(`[console] ${l}`);
  await tab.close();
  return { findings, summary: `${requests.length} requests, all same-origin reads; one storage key; theme right at first paint in ${CASES.length} cases` };
}
