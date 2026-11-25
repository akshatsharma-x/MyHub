// WCAG AA for every visible text run, on every route, in both themes — against
// what is actually painted behind the text (see the contrast detector for why
// that is a stacking-order question and not a DOM one).

import { contrast } from '../lib/detectors.mjs';
import { ROUTES } from '../lib/routes.mjs';

export const about = 'every visible text run at WCAG AA, both themes, by stacking order';

export async function run({ open }) {
  const tab = await open();
  const findings = [];
  for (const theme of ['dark', 'light']) {
    await tab.theme(theme);
    await tab.viewport(1440, 1000);
    for (const route of ROUTES) {
      await tab.goto(route, 1600);
      for (const f of await tab.run(contrast.fn)) findings.push(`${route} ${theme}: ${f}`);
    }
  }
  await tab.close();
  return { findings, summary: `${ROUTES.length} routes × 2 themes, every text run at AA or better` };
}
