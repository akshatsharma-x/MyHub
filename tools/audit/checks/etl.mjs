// The committed archive is the ETL's output, byte for byte, and the ETL is
// deterministic. Runs tools/etl.mjs twice into temporary files (ETL_OUT), and
// requires both runs to be identical to each other and to src/data/archive.json.
//
// It needs the three raw CSVs in _raw/, which are not committed. Without them it
// reports SKIPPED, loudly — a check that quietly passed when its input was
// missing would read as coverage it never had.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const about = 'two ETL runs byte-identical to each other and to the committed archive';
export const browser = false;

const RAW = ['spotify_history.csv', 'Daily Household Transactions.csv', 'Augmented_IndiaTransactMultiFacet2024.csv'];
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

export async function run({ root }) {
  const missing = RAW.filter((f) => !existsSync(join(root, '_raw', f)));
  if (missing.length) return { skipped: `_raw/ is missing ${missing.join(', ')} — the datasets are not committed (see README)` };

  const dir = mkdtempSync(join(tmpdir(), 'myhub-etl-'));
  try {
    const out = [join(dir, 'a.json'), join(dir, 'b.json')];
    for (const o of out) execFileSync(process.execPath, ['tools/etl.mjs'], { cwd: root, env: { ...process.env, ETL_OUT: o }, stdio: 'ignore' });
    const [a, b] = out.map(sha);
    const committed = sha(join(root, 'src', 'data', 'archive.json'));
    const findings = [];
    if (a !== b) findings.push(`two runs over the same input differ (${a.slice(0, 12)} vs ${b.slice(0, 12)}) — the ETL is not deterministic`);
    if (a !== committed) findings.push(`the committed archive (${committed.slice(0, 12)}) is not what the ETL produces (${a.slice(0, 12)}) — rerun node tools/etl.mjs`);
    return { findings, summary: `two runs and the committed archive all hash to ${a.slice(0, 12)}…` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
