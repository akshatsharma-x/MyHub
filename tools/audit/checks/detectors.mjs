// Proves every detector can fire. Runs first: a sweep reporting "clean" means
// nothing until the ruler it used has been seen to report a defect.
//
// Each fault is injected into a freshly loaded page and the detector is run
// before and after. 'fires' needs at least one finding the untouched page did
// not have; 'clean' needs none — that form pins down a false positive a ruler
// used to report, so the fix cannot quietly regress.

import { ALL_DETECTORS } from '../lib/detectors.mjs';

export const about = 'every detector fires on the defect it exists to catch';

export async function run({ open }) {
  const tab = await open();
  const findings = [];
  let cases = 0;
  await tab.viewport(1280);
  await tab.theme('dark');
  for (const [name, d] of Object.entries(ALL_DETECTORS)) {
    for (const [i, f] of d.faults.entries()) {
      cases++;
      await tab.goto(f.route);
      const before = await tab.run(d.fn);
      await tab.run(f.inject);
      await tab.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const after = await tab.run(d.fn);
      const fresh = after.filter((x) => !before.includes(x));
      const ok = f.expect === 'fires' ? fresh.length > 0 : fresh.length === 0;
      if (!ok) {
        findings.push(
          f.expect === 'fires'
            ? `${name} #${i + 1} on ${f.route}: did NOT fire on its injected defect`
            : `${name} #${i + 1} on ${f.route}: reported a case it must not: ${fresh[0]}`,
        );
      }
    }
  }
  await tab.close();
  return { findings, summary: `${cases} faults across ${Object.keys(ALL_DETECTORS).length} detectors behave as specified` };
}
