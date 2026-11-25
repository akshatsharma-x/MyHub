// The surfaces a load-time sweep can never see, each opened and then put
// through the same layout detectors: the receipt overlay, a second receipt
// walked to from inside it, the roll's filter disclosure, the phone drawer, a
// focused constellation node and an expanded thread.
//
// A surface that cannot be reached is a finding, never a skip. The harness this
// replaces looked for constellation nodes as <button>s after the dial had
// become SVG groups, logged "no node buttons" as information, and reported the
// surface clean on every run.

import { clipped, floor, overflow, punctuation, sentinel } from '../lib/detectors.mjs';

export const about = 'overlay, overlay trail, filter disclosure, drawer, focused dial node, open thread';

const DETECTORS = { overflow, clipped, floor, sentinel, punctuation };

export async function run({ open }) {
  const tab = await open();
  const findings = [];
  let surfaces = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const measure = async (where) => {
    surfaces++;
    for (const [name, d] of Object.entries(DETECTORS)) {
      for (const f of await tab.run(d.fn)) findings.push(`${where}: [${name}] ${f}`);
    }
  };

  for (const theme of ['dark', 'light']) {
    await tab.theme(theme);
    for (const width of [360, 768, 1280]) {
      await tab.viewport(width);
      const at = `${theme} @${width}`;

      // The receipt overlay, and a walk to a related receipt from inside it.
      await tab.goto('/roll');
      const opened = await tab.eval(`(() => { const b = [...document.querySelectorAll('main button')].find((x) => x.querySelector('.k-line')); if (!b) return false; b.click(); return true; })()`);
      await wait(1100);
      const heading = await tab.eval(`document.querySelector('[role="dialog"]')?.getAttribute('aria-label') || null`);
      if (!opened || !heading) findings.push(`${at}: the receipt overlay did not open from /roll`);
      else {
        await measure(`overlay ${at}`);
        const walked = await tab.eval(`(() => { const d = document.querySelector('[role="dialog"]');
          const b = [...d.querySelectorAll('button')].find((x) => !/^(close|back)/i.test(x.getAttribute('aria-label') || '') && (x.innerText || '').trim().length > 10);
          if (!b) return false; b.click(); return true; })()`);
        await wait(900);
        const next = await tab.eval(`document.querySelector('[role="dialog"]')?.getAttribute('aria-label') || null`);
        if (!walked || !next || next === heading) findings.push(`${at}: the overlay offered no related receipt to walk to`);
        else await measure(`overlay trail ${at}`);
        await tab.press('Escape');
        await wait(500);
      }

      // The filters become a disclosure below lg; above it they are inline and
      // already measured by the layout sweep.
      if (width < 1024) {
        await tab.goto('/roll');
        const toggled = await tab.eval(`(() => { const b = [...document.querySelectorAll('main button[aria-expanded]')].find((x) => /filters/i.test(x.innerText)); if (!b) return false; b.click(); return true; })()`);
        await wait(700);
        if (!toggled) findings.push(`${at}: no filter disclosure on /roll below lg`);
        else await measure(`filter rail ${at}`);

        await tab.goto('/');
        if (!(await tab.eval(`(() => { const b = document.querySelector('[aria-label="Open navigation"]'); if (!b) return false; b.click(); return true; })()`))) {
          findings.push(`${at}: no hamburger below lg`);
        } else {
          await wait(600);
          await measure(`phone drawer ${at}`);
        }
      }

      // A focused dial node: the dial draws its nodes as SVG groups with
      // role="button", so that is what is clicked.
      if (width >= 1024) {
        await tab.goto('/constellation', 1800);
        const node = await tab.eval(`(() => { const g = [...document.querySelectorAll('svg g[role="button"]')]; if (!g.length) return 0; g[Math.min(3, g.length - 1)].dispatchEvent(new MouseEvent('click', { bubbles: true })); return g.length; })()`);
        await wait(700);
        if (!node) findings.push(`${at}: no dial nodes found on /constellation`);
        else await measure(`focused dial node ${at}`);
      }

      // A thread expanded to its full chain.
      await tab.goto('/threads');
      const expanded = await tab.eval(`(() => { const b = [...document.querySelectorAll('main button[aria-expanded="false"]')].find((x) => /more|all|show/i.test(x.innerText)); if (!b) return false; b.click(); return true; })()`);
      await wait(800);
      if (!expanded) findings.push(`${at}: no collapsed thread to expand on /threads`);
      else await measure(`expanded thread ${at}`);
    }
  }
  for (const l of tab.logs) findings.push(`[console] ${l}`);
  await tab.close();
  return { findings, summary: `${surfaces} opened surfaces measured clean` };
}
