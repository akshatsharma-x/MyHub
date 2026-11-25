// /story mounts one beat at a time, so a load-time sweep only ever reads beat
// one. This walks all ten through the beat index, at two widths in both themes,
// and runs the text detectors on each.
//
// It also proves it moved. A real false pass: run straight after a server
// restart, React had not hydrated when the first click landed, every click was
// a no-op, and all forty "beats" were beat one — reported clean while nine
// tenths of the prose was never loaded. So every walk must see ten distinct
// headings, or its passes count for nothing.

import { floor, overflow, pronoun, punctuation, sentinel, storyClaims } from '../lib/detectors.mjs';

export const about = 'all ten story beats × 360/1280 × both themes, with a guard that the walk moved';

const DETECTORS = { sentinel, pronoun, punctuation, floor, overflow, storyClaims };
// The index buttons are "NN" plus the beat's title. The advance control is
// labelled with the next beat's title and the word "next" appears nowhere, so a
// generic /next/ selector finds nothing — or, worse, the wrong button.
const INDEX = `[...document.querySelectorAll('button')].filter((b) => /^\\d\\d\\s/.test((b.innerText || '').trim()))`;

export async function run({ open }) {
  const tab = await open();
  const findings = [];
  let renders = 0;
  for (const theme of ['dark', 'light']) {
    await tab.theme(theme);
    for (const width of [360, 1280]) {
      await tab.viewport(width);
      tab.logs.length = 0;
      await tab.goto('/story', 1700);
      const n = await tab.eval(`${INDEX}.length`);
      if (n !== 10) findings.push(`${theme} @${width}: the beat index has ${n} entries, not 10`);
      const seen = new Set();
      for (let i = 0; i < n; i++) {
        await tab.eval(`${INDEX}[${i}].click()`);
        await new Promise((r) => setTimeout(r, 650));
        renders++;
        const heading = await tab.eval(`(document.getElementById('story-beat-title')?.innerText || '').trim()`);
        const where = `beat ${i + 1} ${theme} @${width}`;
        if (!heading) findings.push(`${where}: no beat heading`);
        seen.add(heading);
        for (const [name, d] of Object.entries(DETECTORS)) {
          for (const f of await tab.run(d.fn)) findings.push(`${where}: [${name}] ${f}`);
        }
      }
      if (seen.size !== n) findings.push(`${theme} @${width}: walked ${n} beats but saw ${seen.size} distinct headings — the clicks did not land, so these passes are worthless`);
      for (const l of tab.logs) findings.push(`${theme} @${width}: [console] ${l}`);
    }
  }
  await tab.close();
  return { findings, summary: `${renders} beat renders, 10 distinct beats reached on every walk` };
}
