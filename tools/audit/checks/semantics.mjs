// What a screen reader is given: exactly one h1 per page (the top bar prints
// it), a heading outline that never skips a level, one <main>, no duplicate ids,
// no unlabelled images or exposed SVGs, and a language. Run on every route and
// on the 404, which is held to the same rules.
//
// Plus the one shortcut the app has: Cmd/Ctrl+K must land in the roll's search
// field from anywhere — including from the roll itself, where it once changed
// the URL and left the cursor where it was.

import { ROUTES } from '../lib/routes.mjs';

export const about = 'one h1, no skipped levels, landmarks, ids, names, lang; and ⌘K from anywhere';

const OUTLINE = function () {
  const hs = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((h) => h.getClientRects().length).map((h) => Number(h.tagName[1]));
  const skips = [];
  for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) skips.push(`h${hs[i - 1]}→h${hs[i]}`);
  const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
  const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  const bareSvg = [...document.querySelectorAll('svg')].filter((s) => !s.closest('[aria-hidden="true"]') && s.getAttribute('aria-hidden') !== 'true' && !s.getAttribute('role') && !s.getAttribute('aria-label') && !s.querySelector('title')).length;
  return {
    h1: hs.filter((h) => h === 1).length, first: hs[0], skips: [...new Set(skips)],
    main: document.querySelectorAll('main').length, dup,
    imgNoAlt: [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length,
    bareSvg, lang: document.documentElement.lang,
  };
};

export async function run({ open }) {
  const tab = await open();
  const findings = [];
  await tab.theme('dark');
  await tab.viewport(1280);
  const MISSING = '/this-page-does-not-exist';
  for (const route of [...ROUTES, MISSING]) {
    await tab.goto(route);
    const o = await tab.run(OUTLINE);
    if (o.h1 !== 1) findings.push(`${route}: ${o.h1} h1 elements`);
    if (o.first !== 1) findings.push(`${route}: the outline starts at h${o.first}`);
    if (o.skips.length) findings.push(`${route}: the outline skips ${o.skips.join(', ')}`);
    if (o.main !== 1) findings.push(`${route}: ${o.main} <main> elements`);
    if (o.dup.length) findings.push(`${route}: duplicate ids ${o.dup.slice(0, 5).join(', ')}`);
    if (o.imgNoAlt) findings.push(`${route}: ${o.imgNoAlt} <img> without alt`);
    if (o.bareSvg) findings.push(`${route}: ${o.bareSvg} SVGs exposed to assistive tech with no name`);
    if (o.lang !== 'en') findings.push(`${route}: <html lang> is "${o.lang}"`);
  }

  for (const from of ['/', '/roll']) {
    await tab.goto(from);
    await tab.eval('document.activeElement?.blur()');
    await tab.press('k', { meta: true });
    await new Promise((r) => setTimeout(r, 1500));
    const k = await tab.eval(`({ path: location.pathname, field: document.activeElement?.id })`);
    if (k.path !== '/roll' || k.field !== 'roll-search') findings.push(`⌘K from ${from} ended at ${k.path} with focus on "${k.field || 'nothing'}"`);
  }
  // Chrome logs the 404 document itself as a failed resource; on the one URL
  // visited in order to get a 404, that line is the expected result, so it alone
  // is dropped. Any other error on the 404 page still fails.
  const expected = (l) => l.includes('status of 404') && l.includes(MISSING);
  for (const l of tab.logs.filter((x) => !expected(x))) findings.push(`[console] ${l}`);
  await tab.close();
  return { findings, summary: `${ROUTES.length} routes and the 404: one h1, no skipped levels; ⌘K lands in search from anywhere` };
}
