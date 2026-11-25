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
const SETTLE = `new Promise((res) => { let last = null, still = 0; const tick = () => {
  const y = Math.round(document.activeElement?.getBoundingClientRect().top ?? 0) + ':' + Math.round(scrollY);
  if (y === last) { if (++still > 2) return res(); } else { still = 0; last = y; }
  requestAnimationFrame(tick); }; tick(); setTimeout(res, 1500); })`;

export async function run({ open }) {
  const tab = await open();
  const findings = [];
  const flag = (where, what) => findings.push(`${where}: ${what}`);
  const stops = [];
  await tab.theme('dark');
  await tab.viewport(1280);

  for (const route of ROUTES) {
    await tab.goto(route);
    await tab.eval('document.activeElement?.blur(); window.scrollTo(0, 0)');
    let n = 0;
    let firstInMain = null;
    let wrapped = false;
    for (let i = 0; i < 1500; i++) {
      await tab.press('Tab');
      let f = await tab.run(FOCUSED);
      if (!f) break;
      if (f.skip && n > 0) { wrapped = true; break; }
      if (!f.seen) {
        await tab.eval(SETTLE);
        f = await tab.run(FOCUSED);
      }
      n++;
      if (f.inMain && firstInMain === null) firstInMain = n;
      if (!f.ring) flag(route, `stop ${n} <${f.tag}> "${f.name}" shows no focus ring`);
      if (!f.name) flag(route, `stop ${n} <${f.tag}> has no accessible name`);
      if (!f.seen) flag(route, `stop ${n} <${f.tag}> "${f.name}" takes focus out of sight`);
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
