// Every name the constellation dial can print, measured against the panel that
// has to contain it.
//
// A node's name is printed when the node is large, or when it is focused — so
// the rim case, a long name on a small node at the edge, is invisible until
// something clicks it. Each node is clicked in turn and the label its focus
// reveals is measured. The labels that are always printed are measured too: the
// harness this replaces only compared revealed labels, so on every run it
// "checked all 131 nodes" while the 29 printed without any focus — 21 node names
// and the 8 sector labels round the rim — were never part of its check.

export const about = 'every dial label — always-shown and focus-revealed — inside its panel at 1280/1440/1920';

const WALK = async function () {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const svg = [...document.querySelectorAll('svg')].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  if (!svg) return { error: 'no dial svg' };
  const holder = svg.parentElement;
  const layer = holder.querySelector('div[aria-hidden="true"]');
  if (!layer) return { error: 'no label layer over the dial' };
  const nodes = [...svg.querySelectorAll('g[role="button"]')];
  if (!nodes.length) return { error: 'no dial nodes' };
  const res = { nodes: nodes.length, always: 0, revealed: 0, problems: [] };
  const judge = (s, why) => {
    const r = s.getBoundingClientRect();
    const p = holder.getBoundingClientRect();
    const px = parseFloat(getComputedStyle(s).fontSize);
    if (r.right > p.right + 0.5 || r.left < p.left - 0.5) res.problems.push(`${why} "${s.textContent.trim()}" crosses the panel edge by ${Math.round(Math.max(r.right - p.right, p.left - r.left))}px`);
    if (px < 10.995) res.problems.push(`${why} "${s.textContent.trim()}" at ${px}px`);
  };
  const shown = () => [...layer.querySelectorAll('span')].filter((s) => s.textContent.trim() && s.getClientRects().length);
  const before = new Set(shown().map((s) => s.textContent.trim()));
  for (const s of shown()) { res.always++; judge(s, 'always-shown label'); }
  for (const g of nodes) {
    g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wait(60);
    for (const s of shown()) {
      if (before.has(s.textContent.trim())) continue;
      res.revealed++;
      judge(s, 'revealed label');
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) res.problems.push(`focusing a node made the document ${document.documentElement.scrollWidth - innerWidth}px too wide`);
    g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wait(25);
  }
  return res;
};

export async function run({ open }) {
  const tab = await open();
  const findings = [];
  const counts = [];
  await tab.theme('dark');
  for (const width of [1280, 1440, 1920]) {
    await tab.viewport(width, 1100);
    await tab.goto('/constellation', 2200);
    const r = await tab.run(WALK);
    if (r.error) {
      findings.push(`@${width}: ${r.error}`);
      continue;
    }
    if (r.revealed === 0) findings.push(`@${width}: focusing ${r.nodes} nodes revealed no labels at all — the walk measured nothing`);
    for (const p of r.problems) findings.push(`@${width}: ${p}`);
    counts.push(`@${width} ${r.nodes} nodes, ${r.always} shown + ${r.revealed} revealed`);
  }
  await tab.close();
  return { findings, summary: `labels measured — ${counts.join(' · ')}` };
}
