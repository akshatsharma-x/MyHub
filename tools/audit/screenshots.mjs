#!/usr/bin/env node
// Regenerates the README's screenshots in docs/screenshots/ from the production
// build, through the same headless Chrome the audit uses. Run after `npm run
// build` whenever the design changes, so the pictures never drift from the app.
//
//   node tools/audit/screenshots.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, openTab, sleep } from './lib/browser.mjs';
import { startServer } from './lib/server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'screenshots');

const SHOTS = [
  { file: 'archive.png', route: '/', theme: 'dark', width: 1440, height: 900 },
  { file: 'story.png', route: '/story', theme: 'dark', width: 1440, height: 900 },
  { file: 'constellation.png', route: '/constellation', theme: 'dark', width: 1440, height: 900 },
  { file: 'rhythms-light.png', route: '/rhythms', theme: 'light', width: 1440, height: 900 },
  { file: 'receipt.png', route: '/roll', theme: 'light', width: 1440, height: 900, open: true },
  { file: 'phone.png', route: '/', theme: 'dark', width: 390, height: 844 },
];

const server = await startServer(ROOT);
const chrome = await launchChrome();
try {
  mkdirSync(OUT, { recursive: true });
  const tab = await openTab(chrome.port, server.url);
  for (const s of SHOTS) {
    await tab.theme(s.theme);
    await tab.viewport(s.width, s.height);
    await tab.goto(s.route, 1800);
    if (s.open) {
      await tab.eval(`[...document.querySelectorAll('main button')].find((x) => x.querySelector('.k-line'))?.click()`);
      await sleep(1200);
    }
    writeFileSync(join(OUT, s.file), await tab.screenshot());
    console.log(`docs/screenshots/${s.file}  ${s.route} · ${s.theme} · ${s.width}×${s.height}`);
  }
  await tab.close();
} finally {
  server.close();
  await chrome.close();
}
