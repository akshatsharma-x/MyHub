// Chrome over the DevTools protocol with nothing to install: Node's global
// WebSocket and fetch, and whichever Chrome or Chromium is on the machine.
//
// Every check gets its own tab. A tab wraps the protocol in the handful of
// verbs the checks actually use — navigate, evaluate, press a key, set a
// viewport, seed the theme — and records console errors, warnings and uncaught
// exceptions as they happen, so any check can assert a quiet console.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
};

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const c of CANDIDATES[process.platform] ?? []) {
    if (c.includes('/') || c.includes('\\')) {
      if (existsSync(c)) return c;
      continue;
    }
    try {
      return execFileSync('which', [c], { encoding: 'utf8' }).trim();
    } catch {
      /* not on PATH */
    }
  }
  return null;
}

/** Starts a headless Chrome on a free port, in a throwaway profile. */
export async function launchChrome() {
  const bin = findChrome();
  if (!bin) throw new Error('No Chrome or Chromium found. Set CHROME_PATH to its executable.');
  const profile = mkdtempSync(join(tmpdir(), 'myhub-audit-'));
  const proc = spawn(
    bin,
    [
      '--headless=new',
      // Port 0: Chrome picks a free one and writes it to DevToolsActivePort.
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      // A managed Chrome can force-install extensions even into a fresh headless
      // profile. One here opened its own welcome tab, which pushed the audit's
      // tab into the background, where requestAnimationFrame never fires — and
      // the first check to await a frame hung forever. These keep a background
      // renderer running at full speed, and openTab() also brings each audit
      // tab to the front, so neither ordering can stall a check again.
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  // Chrome keeps writing to its profile for a moment after SIGTERM, so removing
  // the directory straight after kill() races it (ENOTEMPTY). Wait for the exit.
  const exited = new Promise((res) => proc.once('exit', res));
  const close = async () => {
    proc.kill();
    await Promise.race([exited, sleep(5000)]);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150; i++) {
    if (existsSync(portFile)) {
      const port = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
      if (port) return { port, close };
    }
    await sleep(100);
  }
  await close();
  throw new Error('Chrome started but never reported a DevTools port.');
}

const KEYS = {
  Tab: { code: 'Tab', vk: 9 },
  Enter: { code: 'Enter', vk: 13, text: '\r' },
  Escape: { code: 'Escape', vk: 27 },
  k: { code: 'KeyK', vk: 75 },
};

/**
 * Opens a tab. `origin` is the app under test; `run(fn, ...args)` evaluates a
 * plain function in the page, which is how every detector is called.
 */
export async function openTab(cdpPort, origin) {
  const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message));
      else p.res(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push(`exception: ${(d.exception?.description || d.text || '').slice(0, 240)}`);
    } else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      logs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 240)}`);
    } else if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
      logs.push(`${m.params.entry.level}: ${(m.params.entry.text || '').slice(0, 200)} ${m.params.entry.url || ''}`.trim());
    }
    for (const fn of listeners) fn(m);
  };

  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });

  let themeSeed = null;

  const tab = {
    origin,
    logs,
    send,
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error(`page threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      }
      return r.result.value;
    },

    /** Runs `fn` in the page. It is serialised with toString(), so it must not
     *  close over anything outside its own body; pass what it needs as args. */
    run(fn, ...args) {
      return tab.eval(`(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(', ')})`);
    },

    async viewport(width, height = 900) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    },

    /** Stores the theme before any page script runs, so the pre-paint script
     *  reads it and the page boots in it rather than correcting into it. */
    async theme(theme) {
      if (themeSeed) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: themeSeed });
      themeSeed = theme
        ? (await send('Page.addScriptToEvaluateOnNewDocument', {
            source: `try{localStorage.setItem('app_theme',${JSON.stringify(theme)})}catch(e){}`,
          })).identifier
        : null;
    },

    /** Navigates, waits for the load event, then lets hydration and effects settle. */
    async goto(path, settle = 1200) {
      const loaded = new Promise((res) => {
        const off = tab.on((m) => {
          if (m.method === 'Page.loadEventFired') {
            off();
            res();
          }
        });
      });
      await send('Page.navigate', { url: origin + path });
      await Promise.race([loaded, sleep(15000)]);
      await sleep(settle);
    },

    /** A real key press through the Input domain, so the browser itself acts on
     *  it — a KeyboardEvent dispatched from page script moves no focus. */
    async press(key, { shift = false, meta = false } = {}) {
      const k = KEYS[key];
      const base = { key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers: (shift ? 8 : 0) | (meta ? 4 : 0) };
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
      if (k.text) await send('Input.dispatchKeyEvent', { type: 'char', ...base, text: k.text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },

    async screenshot() {
      return Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
    },

    async close() {
      ws.close();
      await fetch(`http://127.0.0.1:${cdpPort}/json/close/${target.id}`).catch(() => {});
    },
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  return tab;
}
