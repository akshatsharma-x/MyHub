// The formatting rules, tested against src/lib/format.ts itself — imported
// directly, which Node can do because it strips TypeScript's types on load.
//
// An earlier version of this test mirrored `clip` and `text` in a stub. The stub
// paraphrased `text` without its sentinel guard, so clip('undefined') returned
// "undefined" and the case still printed ok. A copy of the code under test is
// not a test of that code; this file has no copies. Boundary cases carry literal
// expected strings, because describing a boundary in prose ("exactly at the
// cap") was off by one three times running.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const about = 'clip, period and the numeric formatters, on the real module';
export const browser = false;

export async function run({ root }) {
  // Importing a .ts file needs Node's type stripping: on by default from 22.18
  // and 23.6. The app itself only needs 20.9, so an older Node skips this.
  // Node also warns that the file's module type is unspecified (package.json
  // has no "type", and setting one for a test would change how every config
  // file loads); `npm run verify` silences exactly that warning code.
  if (!process.features.typescript) return { skipped: `Node ${process.version} cannot import TypeScript; needs 22.18+ or 23.6+` };
  const f = await import(pathToFileURL(join(root, 'src', 'lib', 'format.ts')).href);
  const findings = [];
  const eq = (label, got, want) => {
    if (got !== want) findings.push(`${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  };

  // clip — word boundary, a real ellipsis, never a dangling function word.
  eq('clip under the cap', f.clip('Saving Bank Account 1, 10 MAY 2017', 52), 'Saving Bank Account 1, 10 MAY 2017');
  eq('clip with length === max', f.clip('one two three four five six', 27), 'one two three four five six');
  eq('clip with length === max + 1', f.clip('one two three four five six', 26), 'one two three four five…');
  eq('clip drops an orphan run', f.clip('Seven receipts inside a single day, 10 MAY 2017 — three milestones, a listening session, a purchase, a search and a note.', 120),
    'Seven receipts inside a single day, 10 MAY 2017 — three milestones, a listening session, a purchase, a search…');
  eq('clip keeps content made only of function words', f.clip('the and of a in on at', 10), 'the…');
  eq('clip hard-cuts a token with no space', f.clip('Supercalifragilisticexpialidocious', 12), 'Supercalifra…');
  for (const bad of ['', '   ', 'undefined', 'null', 'NaN', undefined, 42]) eq(`clip(${JSON.stringify(bad)}) falls back`, f.clip(bad, 20, '‹fallback›'), '‹fallback›');

  // period — closes a sentence without doubling a mark already there.
  eq('period adds a full stop', f.period('the dates did'), 'the dates did.');
  for (const end of ['…', '.', '!', '?', ':', ';']) eq(`period leaves a closing "${end}"`, f.period(`done${end}`), `done${end}`);
  eq('period does not close a sentinel', f.period('undefined'), '');
  // The exact composition that shipped "a search and a…. The sources" on /rhythms.
  const caption = 'Seven receipts inside a single day, 10 MAY 2017 — three milestones, a listening session, a purchase, a search and a note.';
  const composed = `${f.period(`The strongest is "x" on 10 MAY 2017: ${f.clip(caption, 120)}`)} The sources never met; the dates did.`;
  if (/…\.|\.\./.test(composed)) findings.push(`the patterns.ts composition still collides: ${composed.slice(-70)}`);

  // Nothing numeric may print NaN, undefined or Infinity.
  for (const bad of [undefined, null, Number.NaN, Infinity, -Infinity, '12', 'abc', {}]) {
    for (const [name, fn] of [['num', f.num], ['inr', f.inr], ['pct', f.pct], ['compact', f.compact], ['dateLabel', f.dateLabel], ['duration', f.duration]]) {
      const out = fn(bad);
      if (/NaN|undefined|Infinity|null|\[object/.test(String(out))) findings.push(`${name}(${String(bad)}) printed "${out}"`);
    }
  }
  eq('num groups thousands', f.num(1234567), '1,234,567');
  eq('inr prints rupees', f.inr(70255), '₹70,255');
  eq('pct rounds a share', f.pct(0.381), '38%');

  return { findings, summary: 'clip, period and six numeric formatters hold on the real module' };
}
