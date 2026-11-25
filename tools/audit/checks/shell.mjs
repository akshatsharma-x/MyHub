// The frame around every page, which is where a layout most visibly breaks.
//
// 1. First paint. With JavaScript disabled the static HTML + CSS is exactly what
//    a phone shows until the bundle has run, so it must already be the final
//    layout: the rail off-canvas below lg, docked at 220px above it.
// 2. Layout shift. A PerformanceObserver registered at document start sums every
//    layout-shift entry, and the total must be zero at every width. The shell's
//    geometry used to be Motion targets computed from JS, and this read 0.37 at
//    1280px and 0.60 at 360px. The observer is proved first: a "0" from one that
//    cannot see shifts would read exactly the same.
// 3. The controls: drawer open/close by every route out, collapse and expand,
//    resizing across the breakpoint with the drawer open, and a page-enter that
//    replays on navigation and leaves no transform behind.

export const about = 'pre-JS layout and CLS at 4 widths, drawer, collapse, resize, page-enter';

const CLS_PROBE = `
  window.__cls = 0;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
`;

const GEOMETRY = function () {
  const a = document.getElementById('nx-rail');
  const m = document.querySelector('main');
  const h = document.querySelector('header');
  const s = document.querySelector('.nx-shell');
  const r = a.getBoundingClientRect();
  return {
    railLeft: Math.round(r.left), railRight: Math.round(r.right), railWidth: Math.round(r.width),
    railVisibility: getComputedStyle(a).visibility,
    mainMargin: getComputedStyle(m).marginLeft,
    barLeft: Math.round(h.getBoundingClientRect().left),
    drawer: s.dataset.drawer, rail: s.dataset.rail,
    scrim: !!document.querySelector('div.fixed.inset-0.z-30'),
    path: location.pathname,
  };
};

export async function run({ open }) {
  const findings = [];
  const fail = (what, g) => findings.push(`${what}${g ? ' — ' + JSON.stringify(g) : ''}`);
  const tab = await open();
  await tab.theme('dark');

  // ── 1. the static HTML, before any script ──
  await tab.send('Emulation.setScriptExecutionDisabled', { value: true });
  for (const width of [360, 768, 1280, 1920]) {
    await tab.viewport(width);
    await tab.goto('/', 600);
    const g = await tab.eval(`(() => { const a = document.getElementById('nx-rail'), m = document.querySelector('main');
      return { railRight: Math.round(a.getBoundingClientRect().right), mainMargin: getComputedStyle(m).marginLeft,
               text: (m.innerText || '').trim().length, opacity: getComputedStyle(m.firstElementChild).opacity }; })()`);
    const docked = width >= 1024;
    if (docked ? g.railRight !== 220 || g.mainMargin !== '220px' : g.railRight > 0 || g.mainMargin !== '0px') {
      fail(`pre-JS @${width}: the static HTML is not the final layout`, g);
    }
    if (g.text < 200) fail(`pre-JS @${width}: the page has no readable content before JS runs`, g);
  }
  await tab.send('Emulation.setScriptExecutionDisabled', { value: false });

  // ── 2. layout shift — the observer proved, then measured ──
  const probe = await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: CLS_PROBE });
  await tab.viewport(1280);
  await tab.goto('/', 1500);
  await tab.eval(`(() => { const d = document.createElement('div'); d.style.height = '300px'; document.querySelector('main').prepend(d); })()`);
  await tab.eval('new Promise((r) => setTimeout(r, 400))');
  const proof = await tab.eval('window.__cls');
  if (!(proof > 0)) fail(`the layout-shift observer did not register an injected 300px shift (read ${proof}), so CLS readings below mean nothing`);
  for (const width of [360, 768, 1280, 1920]) {
    await tab.viewport(width);
    await tab.goto('/', 2200);
    const cls = await tab.eval('window.__cls');
    if (cls > 0.001) fail(`CLS @${width} is ${cls.toFixed(4)} — something moved after first paint`);
  }
  await tab.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: probe.identifier });

  // ── 3. the controls ──
  const click = (sel) => tab.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true; })()`);
  const geo = () => tab.run(GEOMETRY);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  tab.logs.length = 0;

  await tab.viewport(360, 760);
  await tab.goto('/');
  let g = await geo();
  if (!(g.railRight <= 0 && g.railVisibility === 'hidden' && g.mainMargin === '0px' && g.barLeft === 0)) fail('phone: the closed drawer is not off-canvas and hidden', g);
  if (!(await click('[aria-label="Open navigation"]'))) fail('phone: no hamburger');
  await wait(450);
  g = await geo();
  if (!(g.railLeft === 0 && g.railWidth === 220 && g.railVisibility === 'visible' && g.drawer === 'open' && g.scrim)) fail('phone: the drawer did not open on screen with its scrim', g);
  await click('div.fixed.inset-0.z-30');
  await wait(450);
  g = await geo();
  if (!(g.drawer === 'closed' && g.railVisibility === 'hidden' && !g.scrim)) fail('phone: the scrim did not close the drawer', g);
  await click('[aria-label="Open navigation"]');
  await wait(450);
  if (!(await click('[aria-label="Close navigation"]'))) fail('phone: the open drawer has no close control');
  await wait(450);
  if ((await geo()).drawer !== 'closed') fail('phone: the close control did not close the drawer');
  await click('[aria-label="Open navigation"]');
  await wait(450);
  await tab.eval(`[...document.querySelectorAll('#nx-rail a')].find((a) => a.getAttribute('href') === '/roll').click()`);
  await wait(1200);
  g = await geo();
  if (!(g.path === '/roll' && g.drawer === 'closed')) fail('phone: following a link did not navigate and close the drawer', g);
  await click('[aria-label="Open navigation"]');
  await wait(450);
  await tab.viewport(1280);
  await wait(700);
  g = await geo();
  if (!(g.drawer === 'closed' && g.railLeft === 0 && g.railWidth === 220 && g.mainMargin === '220px' && g.barLeft === 220 && !g.scrim)) {
    fail('growing past the breakpoint with the drawer open did not dock the rail and reset the drawer', g);
  }

  await tab.goto('/');
  if (!(await click('[aria-label="Collapse sidebar"]'))) fail('desktop: no collapse control');
  await wait(500);
  g = await geo();
  if (!(g.rail === 'collapsed' && g.railWidth === 60 && g.mainMargin === '60px' && g.barLeft === 60)) fail('desktop: collapse did not move the rail, the main column and the bar together to 60px', g);
  if (!(await click('[aria-label="Expand sidebar"]'))) fail('desktop: no expand control');
  await wait(500);
  g = await geo();
  if (!(g.rail === 'expanded' && g.railWidth === 220 && g.mainMargin === '220px' && g.barLeft === 220)) fail('desktop: expand did not return everything to 220px', g);

  const before = await tab.eval(`(() => { const d = document.querySelector('main > div'); d.__marked = 1; return getComputedStyle(d).animationName; })()`);
  await tab.eval(`[...document.querySelectorAll('#nx-rail a')].find((a) => a.getAttribute('href') === '/threads').click()`);
  await wait(120);
  const mid = await tab.eval(`(() => { const d = document.querySelector('main > div'); return { fresh: !d.__marked, anim: getComputedStyle(d).animationName }; })()`);
  await wait(700);
  const after = await tab.eval(`(() => { const d = document.querySelector('main > div'); const cs = getComputedStyle(d); return { opacity: cs.opacity, transform: cs.transform }; })()`);
  if (!(before === 'nx-page-enter' && mid.fresh && mid.anim === 'nx-page-enter')) fail('navigation did not mount a fresh canvas running the page-enter', { before, mid });
  if (!(after.opacity === '1' && after.transform === 'none')) fail('the page-enter did not finish fully visible with no transform left behind', after);

  for (const l of tab.logs) fail(`[console] ${l}`);
  await tab.close();
  return { findings, summary: 'first paint is final at 4 widths, CLS 0, drawer/collapse/resize/page-enter behave' };
}
