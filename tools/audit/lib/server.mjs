// The production build, served by `next start` on a free local port. The suite
// measures what ships, so it refuses to run against a missing build rather than
// quietly starting a dev server, whose output is not what a reader gets.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { sleep } from './browser.mjs';

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

export async function startServer(root) {
  if (!existsSync(join(root, '.next', 'BUILD_ID'))) {
    throw new Error('No production build in .next/. Run `npm run build` first — `npm run verify` does both.');
  }
  const port = await freePort();
  const proc = spawn(
    process.execPath,
    [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port), '-H', '127.0.0.1'],
    { cwd: root, stdio: 'ignore' },
  );
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(url)).ok) return { url, close: () => proc.kill() };
    } catch {
      /* not listening yet */
    }
    await sleep(100);
  }
  proc.kill();
  throw new Error('`next start` did not answer within 20s.');
}
