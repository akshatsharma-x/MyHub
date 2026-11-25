// Every route at four widths in both themes, run through every page detector:
// overflow, unadmitted clipping, the 11px floor, sentinel strings, gendered
// pronouns, punctuation collisions, the owner's surfaces, the story's claims —
// plus a quiet console and a theme that actually took.

import { PAGE_DETECTORS } from '../lib/detectors.mjs';
import { ROUTES } from '../lib/routes.mjs';

export const about = 'every route × 360/768/1280/1920 × both themes, through every page detector';

export async function run({ open }) {
  const tab = await open();
  const findings = [];
  const room = {};
  let renders = 0;
  for (const theme of ['dark', 'light']) {
    await tab.theme(theme);
    for (const width of [360, 768, 1280, 1920]) {
      await tab.viewport(width);
      for (const route of ROUTES) {
        tab.logs.length = 0;
        await tab.goto(route);
        renders++;
        const where = `${route} @${width} ${theme}`;
        const got = await tab.eval(`document.documentElement.getAttribute('data-theme')`);
        if (got !== theme) findings.push(`${where}: data-theme is "${got}"`);
        room[theme] = await tab.eval('getComputedStyle(document.body).backgroundColor');
        for (const [name, d] of Object.entries(PAGE_DETECTORS)) {
          for (const f of await tab.run(d.fn)) findings.push(`${where}: [${name}] ${f}`);
        }
        for (const l of tab.logs) findings.push(`${where}: [console] ${l}`);
      }
    }
  }
  if (room.dark === room.light) findings.push(`both themes paint the same room colour (${room.dark})`);
  await tab.close();
  return { findings, summary: `${renders} renders clean · room ${room.dark} / ${room.light}` };
}
