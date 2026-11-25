// Keyboard access, driven with real key events through the Input domain so the
// browser itself moves focus. (A KeyboardEvent dispatched from page script moves
// nothing — an earlier drawer check "tabbed" forty times and measured a page
// whose focus never left <body>.)
//
//  · every route: Tab through every stop until focus wraps back to the skip
//    link, and require each stop to show a focus ring, carry an accessible
//    name, and land where it can be seen once any scroll has settled;
//  · the skip link: first stop, fully visible on top, lands on <main>, and the
//    next stop is inside the page;
//  · the receipt overlay: opened by Enter, focus moved in, held there through
//    Tab and Shift+Tab, released by Escape back to the receipt that opened it;
//  · the phone drawer: the same contract, plus aria-expanded on its toggle.

import { ROUTES } from '../lib/routes.mjs';

export const about = 'every tab stop on every route, the skip link, the overlay trap, the drawer trap';

const FOCUSED = function () {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const label = el.getAttribute('aria-labelledby');
  const name = (el.getAttribute('aria-label') || (label && document.getElementById(label)?.innerText) || el.innerText || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ');
  const ring = el.matches(':focus-visible') && ((cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none'));
  return {
    tag: el.tagName.toLowerCase(), name: name.slice(0, 40), ring, inMain: !!el.closest('main'),
    skip: el.classList.contains('nx-skip'),
    seen: r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && cs.visibility !== 'hidden',
  };
};

// html carries scroll-behavior: smooth, so focusing something below the fold
// starts an animated scroll. Wait until the element's VIEWPORT position stops
// moving — an earlier version polled its document position, which no scroll
// ever changes, and declared every scroll finished after three frames.
//
// "Stopped moving" alone is not enough either: in the frames between the focus
// and the start of the scroll animation nothing has moved yet, and one run took
// that stillness as settled and reported an index entry at 909px of a 900px
// viewport — which the browser scrolled to 434px half a second later. So a
// position counts as settled when it is still AND in view, or still for 800ms
// out of view, which is what a real failure looks like.
const SETTLE = `new Promise((res) => { const t0 = performance.now(); let last = null, still = 0; const tick = () => {
  const r = document.activeElement?.getBoundingClientRect();
  const y = Math.round(r?.top ?? 0) + ':' + Math.round(scrollY);
  if (y === last) still++; else { still = 0; last = y; }
  const inView = r && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  const waited = performance.now() - t0;
  if ((still > 2 && (inView || waited > 800)) || waited > 3000) return res();
  requestAnimationFrame(tick); }; tick(); })`;

/** Judges the stop that currently has focus: the same rulers for the walk and
 *  for the self-test that proves them. */
async function judge(tab) {
  let f = await tab.run(FOCUSED);
  if (!f) return null;
  if (!f.seen) {
    await tab.eval(SETTLE);
    f = await tab.run(FOCUSED);
  }
  const problems = [];
  if (!f.ring) problems.push('shows no focus ring');
  if (!f.name) problems.push('has no accessible name');
  if (!f.seen) problems.push('takes focus out of sight');
  return { f, problems };
}

export async function run({ open }) {
  const tab = await open();
  const findings = [];
  const flag = (where, what) => findings.push(`${where}: ${what}`);
  const stops = [];
  await tab.theme('dark');
  await tab.viewport(1280);

  // The rulers, proved first: a control that can never be scrolled into view,
  // one with its focus ring stripped, and one with no name must each be
  // reported by the same judgement the walk uses.
  await tab.goto('/story');
  await tab.eval(`(() => { const m = document.querySelector('main');
    const add = (css, text, fault) => { const b = document.createElement('button'); b.style.cssText = css; b.textContent = text; b.dataset.fault = fault; m.prepend(b); };
    add('position:fixed;left:-600px;top:10px', 'ghost', 'takes focus out of sight');
    add('outline:none !important;box-shadow:none !important', 'no ring', 'shows no focus ring');
    add('width:24px;height:24px', '', 'has no accessible name'); })()`);
  await tab.eval('document.activeElement?.blur()');
  const proved = new Set();
  for (let i = 0; i < 40 && proved.size < 3; i++) {
    await tab.press('Tab');
    const fault = await tab.eval('document.activeElement?.dataset.fault || null');
    const j = await judge(tab);
    if (fault && j?.problems.includes(fault)) proved.add(fault);
  }
  for (const want of ['takes focus out of sight', 'shows no focus ring', 'has no accessible name']) {
    if (!proved.has(want)) flag('self-test', `the "${want}" ruler did not fire on its injected case`);
  }

  for (const route of ROUTES) {
    await tab.goto(route);
    await tab.eval('document.activeElement?.blur(); window.scrollTo(0, 0)');
    let n = 0;
    let firstInMain = null;
    let wrapped = false;
    for (let i = 0; i < 1500; i++) {
      await tab.press('Tab');
      const j = await judge(tab);
      if (!j) break;
      if (j.f.skip && n > 0) { wrapped = true; break; }
      n++;
      if (j.f.inMain && firstInMain === null) firstInMain = n;
      for (const p of j.problems) flag(route, `stop ${n} <${j.f.tag}> "${j.f.name}" ${p}`);
    }
    if (!wrapped && n >= 1500) flag(route, 'the walk hit its 1500-stop ceiling without wrapping');
    stops.push(`${route} ${n}`);
  }

  // ── the skip link ──
  for (const width of [1280, 360]) {
    await tab.viewport(width, 800);
    await tab.goto('/roll');
    await tab.eval('document.activeElement?.blur()');
    await tab.press('Tab');
    // The link slides in on .k-btn's 120ms transform transition: at the moment
    // of focus it is still 55px above the viewport, and it rests 12px from the
    // top about 130ms later. Measured on arrival it read as hidden, so the check
    // waits for it to stop moving, as it does for a scrolled stop.
    await tab.eval(SETTLE);
    const s = await tab.eval(`(() => { const el = document.activeElement; const r = el.getBoundingClientRect();
      return { skip: el.classList.contains('nx-skip'), visible: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.width > 0 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el }; })()`);
    await tab.press('Enter');
    await new Promise((r) => setTimeout(r, 400));
    const onMain = await tab.eval(`document.activeElement?.id === 'main'`);
    await tab.press('Tab');
    await tab.eval(SETTLE);
    const next = await tab.eval(`!!document.activeElement?.closest('main')`);
    const where = `skip link @${width}`;
    if (!s.skip) flag(where, 'the first tab stop is not the skip link');
    else if (!s.visible) flag(where, 'the focused skip link is not fully visible on top');
    if (!onMain) flag(where, 'Enter did not move focus to <main>');
    if (!next) flag(where, 'the next tab stop is not inside the page');
  }

  // ── the receipt overlay ──
  await tab.viewport(1280);
  await tab.goto('/roll');
  await tab.eval('document.activeElement?.blur()');
  let trigger = false;
  for (let i = 0; i < 300 && !trigger; i++) {
    await tab.press('Tab');
    trigger = await tab.eval(`(() => { const el = document.activeElement; if (el && el.closest('main') && el.querySelector('.k-line')) { el.dataset.kbTrigger = '1'; return true; } return false; })()`);
  }
  if (!trigger) flag('overlay', 'no receipt on /roll can be reached by Tab');
  else {
    await tab.press('Enter');
    await new Promise((r) => setTimeout(r, 700));
    const o = await tab.eval(`({ open: !!document.querySelector('[role="dialog"][aria-modal="true"]'), inside: !!document.activeElement?.closest('[role="dialog"]') })`);
    if (!o.open) flag('overlay', 'Enter on a receipt did not open a modal dialog');
    if (!o.inside) flag('overlay', 'focus did not move into the overlay');
    let escaped = 0;
    for (let i = 0; i < 40; i++) {
      await tab.press('Tab', { shift: i % 3 === 2 });
      if (!(await tab.eval(`!!document.activeElement?.closest('[role="dialog"]')`))) escaped++;
    }
    if (escaped) flag('overlay', `focus left the modal on ${escaped} of 40 Tab/Shift+Tab presses`);
    await tab.press('Escape');
    await new Promise((r) => setTimeout(r, 600));
    const c = await tab.eval(`({ open: !!document.querySelector('[role="dialog"]'), back: document.activeElement?.dataset.kbTrigger === '1' })`);
    if (c.open) flag('overlay', 'Escape did not close it');
    if (!c.back) flag('overlay', 'focus did not return to the receipt that opened it');
  }

  // ── the phone drawer ──
  await tab.viewport(360, 760);
  await tab.goto('/');
  await tab.eval('document.activeElement?.blur()');
  let toggle = false;
  for (let i = 0; i < 12 && !toggle; i++) {
    await tab.press('Tab');
    toggle = await tab.eval(`document.activeElement?.getAttribute('aria-label') === 'Open navigation'`);
  }
  if (!toggle) flag('drawer', 'the hamburger cannot be reached by Tab');
  else {
    const state = () => tab.eval(`({ open: document.querySelector('.nx-shell')?.dataset.drawer === 'open',
      inRail: !!document.activeElement?.closest('#nx-rail'), onToggle: document.activeElement?.id === 'nx-rail-toggle',
      expanded: document.getElementById('nx-rail-toggle')?.getAttribute('aria-expanded') })`);
    await tab.press('Enter');
    await new Promise((r) => setTimeout(r, 450));
    let d = await state();
    if (!d.open) flag('drawer', 'Enter on the hamburger did not open it');
    if (!d.inRail) flag('drawer', 'focus stayed behind the scrim instead of moving into the drawer');
    if (d.expanded !== 'true') flag('drawer', `aria-expanded is "${d.expanded}" while open`);
    let left = 0;
    for (let i = 0; i < 25; i++) {
      await tab.press('Tab', { shift: i % 4 === 3 });
      if (!(await tab.eval(`!!document.activeElement?.closest('#nx-rail')`))) left++;
    }
    if (left) flag('drawer', `focus left the open drawer on ${left} of 25 presses`);
    await tab.press('Escape');
    await new Promise((r) => setTimeout(r, 450));
    d = await state();
    if (d.open) flag('drawer', 'Escape did not close it');
    if (!d.onToggle) flag('drawer', 'closing did not return focus to the hamburger');
    if (d.expanded !== 'false') flag('drawer', `aria-expanded is "${d.expanded}" once closed`);
  }

  for (const l of tab.logs) findings.push(`[console] ${l}`);
  await tab.close();
  return { findings, summary: `tab stops walked to wrap — ${stops.join(' · ')}` };
}
