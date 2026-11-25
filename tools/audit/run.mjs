#!/usr/bin/env node
// MyHUB's verification suite. Measures the production build in a real headless
// Chrome, with nothing to install beyond the app's own dependencies.
//
//   npm run verify                      build, then run every check
//   node tools/audit/run.mjs            every check, against the existing build
//   node tools/audit/run.mjs layout     only the named checks, in suite order
//   node tools/audit/run.mjs --list     what each check measures
//
//   --url=http://127.0.0.1:3000         audit a server that is already running
//   --cdp=9222                          drive a Chrome that is already running
//   CHROME_PATH=/path/to/chrome         when Chrome is not where it usually is
//
// Exits 1 if any check reports a finding. See tools/audit/README.md.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, openTab } from './lib/browser.mjs';
import { startServer } from './lib/server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The node-only checks run first because they are fast. The detector self-test
// runs before any sweep, because a sweep's "clean" means nothing until the
// rulers it uses have been seen to fire.
const ORDER = ['format', 'etl', 'detectors', 'layout', 'story', 'shell', 'interactions', 'dial', 'keyboard', 'semantics', 'runtime', 'contrast'];

const args = process.argv.slice(2);
const option = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const load = (name) => import(`./checks/${name}.mjs`);

if (args.includes('--list')) {
  for (const name of ORDER) console.log(`${name.padEnd(13)} ${(await load(name)).about}`);
  process.exit(0);
}

const wanted = args.filter((a) => !a.startsWith('--'));
const unknown = wanted.filter((w) => !ORDER.includes(w));
if (unknown.length) {
  console.error(`unknown check: ${unknown.join(', ')} — try --list`);
  process.exit(2);
}
const checks = await Promise.all((wanted.length ? ORDER.filter((n) => wanted.includes(n)) : ORDER).map(async (name) => ({ name, mod: await load(name) })));

let chrome = null;
let server = null;
const cleanup = async () => {
  server?.close();
  await chrome?.close();
};
// Ctrl+C is not the only way a run ends early. A run killed with a plain
// SIGTERM once left its `next start` serving on a stray port for hours, because
// only SIGINT was handled.
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(signal, async () => {
    await cleanup();
    process.exit(code);
  });
}

let failed = 0;
let skipped = 0;
try {
  let origin = null;
  let cdp = null;
  if (checks.some((c) => c.mod.browser !== false)) {
    origin = option('url') ?? (server = await startServer(ROOT)).url;
    cdp = option('cdp') ? Number(option('cdp')) : (chrome = await launchChrome()).port;
  }
  for (const { name, mod } of checks) {
    const t0 = performance.now();
    process.stdout.write(`${name.padEnd(13)} `);
    let r;
    try {
      r = await mod.run({ root: ROOT, origin, open: () => openTab(cdp, origin) });
    } catch (e) {
      r = { findings: [`the check itself crashed: ${e.message}`] };
    }
    const secs = `${Math.round((performance.now() - t0) / 1000)}s`.padStart(4);
    if (r.skipped) {
      skipped++;
      console.log(`SKIP ${secs}  ${r.skipped}`);
    } else if (r.findings.length) {
      failed++;
      console.log(`FAIL ${secs}  ${r.findings.length} finding${r.findings.length === 1 ? '' : 's'}`);
      for (const f of r.findings.slice(0, 25)) console.log(`        · ${f}`);
      if (r.findings.length > 25) console.log(`        … and ${r.findings.length - 25} more`);
    } else {
      console.log(`ok   ${secs}  ${r.summary}`);
    }
  }
} catch (e) {
  console.error(`\ncould not start the audit: ${e.message}`);
  failed++;
} finally {
  await cleanup();
}

const passed = checks.length - failed - skipped;
console.log(`\n${passed} passed · ${failed} failed · ${skipped} skipped`);
process.exit(failed ? 1 : 0);
