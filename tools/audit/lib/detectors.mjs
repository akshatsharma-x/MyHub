// The page-side detectors, each defined exactly once.
//
// A detector is a plain function evaluated in the page (serialised with
// toString(), so it must not reference anything outside its own body). It
// returns findings as strings, and an empty array when the page is clean.
//
// Every detector carries the faults that prove it can fire, and checks/
// detectors.mjs runs those faults against these same functions. That pairing is
// the point. The suite this replaces proved its detectors fired using copies of
// them ("same logic as persona.mjs"), which proves only that the copies fire —
// a stub that paraphrases the code under test is not a test of that code.
//
// A fault is { route, inject, expect }: `inject` mutates the live page, and
// `expect` is 'fires' (the detector must report something new) or 'clean' (it
// must not — used where a ruler once reported a false positive, to prove the fix
// stays fixed).

/* ── text that must never reach the screen ─────────────────────────────────── */

export const sentinel = {
  about: 'undefined / null / NaN / Infinity / [object Object] in visible text',
  fn: function () {
    const t = document.body.innerText;
    const out = [];
    for (const m of t.matchAll(/\b(undefined|null|NaN|Infinity)\b|\[object Object\]/g)) {
      out.push(`"${m[0]}" in …${t.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}…`);
      if (out.length >= 5) break;
    }
    return out;
  },
  faults: [
    { route: '/sources', expect: 'fires', inject: function () { document.querySelector('main p').append(' undefined'); } },
  ],
};

export const pronoun = {
  about: 'a gendered pronoun — the owner\'s pronouns are unrecorded, so none may be guessed',
  fn: function () {
    const t = document.body.innerText;
    const out = [];
    for (const m of t.matchAll(/\b(he|him|his|she|her|hers|himself|herself)\b/gi)) {
      out.push(`"${m[0]}" in …${t.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}…`);
      if (out.length >= 5) break;
    }
    return out;
  },
  faults: [
    { route: '/sources', expect: 'fires', inject: function () { document.querySelector('main p').append(' It is his own record.'); } },
  ],
};

export const punctuation = {
  about: 'two marks colliding — …. or .. or an empty value leaving "" () or a bare ₹',
  fn: function () {
    const t = (document.body.innerText || '').replace(/\s+/g, ' ');
    const RULES = [
      [/…\s*\./g, 'an ellipsis followed by a full stop'],
      [/([.!?])\s*\1/g, 'the same terminal mark twice'],
      [/[a-z0-9)"”]\s+\./g, 'a space before a full stop'],
      [/,\s*\./g, 'a comma then a full stop'],
      [/\s+,/g, 'a space before a comma'],
      [/:\s*\./g, 'a colon then a full stop'],
      [/\(\s*\)/g, 'an empty bracket pair'],
      [/“\s*”|"\s*"/g, 'empty quotes'],
      [/₹\s*(?![0-9])/g, 'a rupee sign with no amount'],
    ];
    const out = [];
    for (const [re, why] of RULES) {
      for (const m of t.matchAll(re)) {
        out.push(`${why}: …${t.slice(Math.max(0, m.index - 40), m.index + m[0].length + 20)}…`);
        if (out.length >= 8) return out;
      }
    }
    return out;
  },
  // Case one is the string that actually shipped on /rhythms, pasted back in.
  faults: [
    { route: '/rhythms', expect: 'fires', inject: function () { const p = document.createElement('p'); p.textContent = 'a purchase, a search and a…. The sources never met; the dates did.'; document.querySelector('main').append(p); } },
    { route: '/rhythms', expect: 'fires', inject: function () { const p = document.createElement('p'); p.textContent = 'three kinds of receipt at once, one evening.. The sources never met.'; document.querySelector('main').append(p); } },
    { route: '/rhythms', expect: 'fires', inject: function () { const p = document.createElement('p'); p.textContent = 'The strongest is "" on 10 MAY 2017.'; document.querySelector('main').append(p); } },
    { route: '/rhythms', expect: 'fires', inject: function () { const p = document.createElement('p'); p.textContent = 'The largest single line is ₹ on a Tuesday.'; document.querySelector('main').append(p); } },
  ],
};

/* ── layout ────────────────────────────────────────────────────────────────── */

export const floor = {
  about: 'text that carries a fact set below 11px, measured as rendered',
  // For SVG text getComputedStyle reports the size it was SPECIFIED at, not the
  // size it renders at: a 14-unit label in a 1480-unit viewBox drawn 600px wide
  // renders at 5.7px and reports 14. So SVG text is scaled through its CTM.
  fn: function () {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      let px = parseFloat(cs.fontSize);
      if (el instanceof SVGElement && el.getScreenCTM) {
        const m = el.getScreenCTM();
        if (m) px *= Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
      }
      if (px < 10.995) {
        const key = `${px.toFixed(1)}|${el.tagName}|${el.className}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(`${px.toFixed(2)}px <${el.tagName.toLowerCase()}> "${el.textContent.trim().slice(0, 40)}"`);
        if (out.length >= 8) break;
      }
    }
    return out;
  },
  faults: [
    { route: '/sources', expect: 'fires', inject: function () { document.querySelector('main dl dt').style.fontSize = '9px'; } },
  ],
};

export const overflow = {
  about: 'the document scrolling sideways, and the leaf elements that cause it',
  fn: function () {
    const W = innerWidth;
    const sw = document.documentElement.scrollWidth;
    if (sw <= W + 1) return [];
    const vis = (el) => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const out = [`the document is ${sw - W}px wider than the viewport`];
    for (const el of document.querySelectorAll('body *')) {
      // The phone drawer waits off-canvas by design; it is not breakage.
      if (!vis(el) || el.closest('#nx-rail')) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= W + 1 && r.left >= -1) continue;
      const kidOut = [...el.children].some((c) => {
        const cr = c.getBoundingClientRect();
        return vis(c) && (cr.right > W + 1 || cr.left < -1);
      });
      if (!kidOut) out.push(`<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 50)}"> spans ${Math.round(r.left)}…${Math.round(r.right)}`);
      if (out.length >= 6) break;
    }
    return out;
  },
  faults: [
    { route: '/sources', expect: 'fires', inject: function () { const d = document.createElement('div'); d.style.cssText = 'width:3000px;height:4px'; document.querySelector('main').append(d); } },
  ],
};

export const clipped = {
  about: 'text cut off by its own box with no ellipsis to admit it',
  fn: function () {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      if (cs.textOverflow === 'ellipsis' || !/hidden|clip/.test(cs.overflowX)) continue;
      // .sr-only is a 1px clipped box on purpose: it is how text is hidden from
      // sight and left to a screen reader.
      if (el.clientWidth <= 2 || String(el.className).includes('sr-only')) continue;
      if (el.scrollWidth > el.clientWidth + 2 && el.textContent.trim()) {
        out.push(`<${el.tagName.toLowerCase()}> loses ${el.scrollWidth - el.clientWidth}px of "${el.textContent.trim().slice(0, 40)}"`);
        if (out.length >= 6) break;
      }
    }
    return out;
  },
  faults: [
    { route: '/sources', expect: 'fires', inject: function () { const d = document.createElement('div'); d.style.cssText = 'width:80px;overflow:hidden;white-space:nowrap'; d.textContent = 'a sentence far too long for its box'; document.querySelector('main').append(d); } },
  ],
};

/* ── the owner, where the page prints the owner ────────────────────────────── */

export const masthead = {
  about: 'the front page\'s standing line: present, non-empty, inside its row, 11px+',
  fn: function () {
    if (location.pathname !== '/') return [];
    const h = document.querySelector('main h2.k-display');
    if (!h) return ['the masthead name is missing'];
    const row = h.nextElementSibling;
    // Found by shape — the "work · at" span — not by the owner's job title.
    const s = row && [...row.querySelectorAll('span')].find((x) => x.textContent.includes('·'));
    if (!s) return [`the standing line is absent; the row reads "${row ? row.textContent.trim() : ''}"`];
    const out = [];
    const sr = s.getBoundingClientRect();
    const pr = row.getBoundingClientRect();
    if (sr.right > pr.right + 0.6 || sr.left < pr.left - 0.6) out.push('the standing line escapes its row');
    if (parseFloat(getComputedStyle(s).fontSize) < 10.995) out.push('the standing line is under 11px');
    return out;
  },
  faults: [
    { route: '/', expect: 'fires', inject: function () { const h = document.querySelector('main h2.k-display'); [...h.nextElementSibling.querySelectorAll('span')].find((x) => x.textContent.includes('·')).textContent = ''; } },
  ],
};

export const anchors = {
  about: 'the three dated anchors on /sources: three rows, a year and a label each, inside the list',
  fn: function () {
    if (location.pathname !== '/sources') return [];
    // Located by shape: the dl whose rows pair a four-digit dt with a dd. Its
    // heading is a Slug, which CSS upper-cases, and innerText reports the
    // transformed text — keying off the authored casing found nothing, and the
    // check passed while measuring nothing.
    const dl = [...document.querySelectorAll('dl')].find((l) =>
      [...l.children].some((r) => {
        const dt = r.querySelector('dt');
        return dt && /^(19|20)\d\d$/.test(dt.textContent.trim()) && r.querySelector('dd');
      }));
    if (!dl) return ['the anchors list is missing'];
    const out = [];
    const rows = [...dl.children];
    if (rows.length !== 3) out.push(`the anchors list has ${rows.length} rows, not 3`);
    const box = dl.getBoundingClientRect();
    for (const r of rows) {
      const dt = r.querySelector('dt');
      const dd = r.querySelector('dd');
      const year = dt ? dt.textContent.trim() : '';
      if (!/^(19|20)\d\d$/.test(year)) out.push(`an anchor's year reads "${year}"`);
      if (!dd || !dd.textContent.trim()) out.push(`anchor ${year} has no label`);
      if (r.getBoundingClientRect().right > box.right + 0.6) out.push(`anchor ${year} escapes the list`);
    }
    return out;
  },
  faults: [
    { route: '/sources', expect: 'fires', inject: function () { const dl = [...document.querySelectorAll('dl')].find((l) => l.querySelector('dt')); dl.removeChild(dl.lastElementChild); } },
    { route: '/sources', expect: 'fires', inject: function () { const dl = [...document.querySelectorAll('dl')].find((l) => l.querySelector('dt')); dl.style.overflow = 'visible'; dl.firstElementChild.style.cssText += ';width:2000px'; } },
  ],
};

export const railStanding = {
  about: 'the rail\'s owner line: wraps to two lines, never clipped either way, never a prefix',
  // A width check alone is the wrong ruler here: a wrapping element never
  // overflows horizontally, so scrollWidth > clientWidth passes by construction.
  // A line-clamp hides overflow VERTICALLY, so both axes are measured.
  fn: function () {
    const rail = document.getElementById('nx-rail');
    if (!rail || getComputedStyle(rail).visibility === 'hidden') return [];
    const el = [...rail.querySelectorAll('div')].find((e) => e.children.length === 0 && /·/.test(e.getAttribute('title') || ''));
    if (!el) return rail.getBoundingClientRect().width < 100 ? [] : ['the expanded rail has no standing line'];
    const out = [];
    if (el.scrollWidth > el.clientWidth + 0.5) out.push(`clipped sideways (${el.scrollWidth} > ${el.clientWidth})`);
    if (el.scrollHeight > el.clientHeight + 0.5) out.push(`clamped off (${el.scrollHeight} > ${el.clientHeight})`);
    const whole = (el.getAttribute('title') || '').split(' · ')[0].trim();
    if (el.textContent.trim() !== whole) out.push(`reads "${el.textContent.trim()}", not "${whole}"`);
    if (parseFloat(getComputedStyle(el).fontSize) < 10.995) out.push('under 11px');
    const nav = rail.querySelector('nav');
    if (!nav || nav.getBoundingClientRect().top >= rail.getBoundingClientRect().height) out.push('the nav is pushed out of the rail');
    return out;
  },
  faults: [
    { route: '/', expect: 'clean', inject: function () { const el = [...document.querySelectorAll('#nx-rail div')].find((e) => e.children.length === 0 && /·/.test(e.getAttribute('title') || '')); el.textContent = 'CSE undergrad'; el.title = 'CSE undergrad · Manipal University Jaipur'; } },
    { route: '/', expect: 'fires', inject: function () { const el = [...document.querySelectorAll('#nx-rail div')].find((e) => e.children.length === 0 && /·/.test(e.getAttribute('title') || '')); el.textContent = 'Senior Principal Research Engineer'; el.title = 'Senior Principal Research Engineer · Somewhere'; } },
    // An unbreakable token wider than the rail. overflow-wrap: anywhere breaks
    // it onto a third line, which the clamp then hides, so this must fire.
    { route: '/', expect: 'fires', inject: function () { const el = [...document.querySelectorAll('#nx-rail div')].find((e) => e.children.length === 0 && /·/.test(e.getAttribute('title') || '')); el.textContent = 'Undergraduateinformaticsandcomputation42'; el.title = 'Undergraduateinformaticsandcomputation42 · Somewhere'; } },
  ],
};

/* ── the constellation's names ─────────────────────────────────────────────── */

export const dialNames = {
  about: 'two names printed on the constellation dial landing on each other',
  // Every earlier check measured each dial label against the PANEL, and none
  // measured labels against each other — so 60 overlapping pairs among the 21
  // printed names went unreported while the top of the music arc was a smear.
  fn: function () {
    if (location.pathname !== '/constellation') return [];
    const svg = [...document.querySelectorAll('svg')].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    const layer = svg && svg.parentElement.querySelector('div[aria-hidden="true"]');
    // Below xl the dial is not drawn; the same data is a list.
    if (!layer || !layer.getClientRects().length) return [];
    const names = [...layer.querySelectorAll('span')].filter((x) => x.textContent.trim() && x.getClientRects().length);
    const out = [];
    let pairs = 0;
    for (let i = 0; i < names.length; i++) {
      const a = names[i].getBoundingClientRect();
      for (let j = i + 1; j < names.length; j++) {
        const b = names[j].getBoundingClientRect();
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          pairs++;
          if (out.length < 5) out.push(`"${names[i].textContent.trim()}" lands on "${names[j].textContent.trim()}"`);
        }
      }
    }
    if (pairs > out.length) out.push(`… ${pairs} overlapping pairs in all`);
    return out;
  },
  faults: [
    { route: '/constellation', expect: 'fires', inject: function () { const svg = [...document.querySelectorAll('svg')].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]; const names = [...svg.parentElement.querySelector('div[aria-hidden="true"]').querySelectorAll('span')].filter((x) => x.textContent.trim()); names[1].style.left = names[0].style.left; names[1].style.top = names[0].style.top; names[1].style.transform = names[0].style.transform; } },
  ],
};

/* ── the story's claims ─────────────────────────────────────────────────────── */

export const storyClaims = {
  about: 'a beat that hands the owner an age, or explains the empty noon with schooling',
  // DATA_BRIEF §3: copy may cite an anchor YEAR, never an age or a life stage.
  // An older check looked only for "school" beside a causal conjunction, which
  // is how "a school-age child" survived 32 clean renders: asserting someone's
  // age does not need a conjunction.
  fn: function () {
    if (location.pathname !== '/story') return [];
    const sec = document.querySelector('section[aria-labelledby="story-beat-title"]');
    if (!sec) return ['the beat section is missing'];
    const prose = [...sec.querySelectorAll('p')].map((p) => (p.innerText || '').trim()).filter((t) => t.length > 40).join(' ');
    const out = [];
    const age = prose.match(/\bschool-age|\baged? (?:nineteen|twenty|eighteen|fourteen|\d\d)\b|\b\d\d[- ]year[- ]old|\bteenage|\bin (?:his|her|their) (?:teens|twenties|thirties)\b/i);
    if (age) out.push(`AGE-CLAIM "${age[0]}"`);
    if (/\b(school|timetable)\b/i.test(prose) && !/only timetable this archive actually knows|reason for the trough is not in the file|would explain it/i.test(prose)) {
      out.push('ANCHOR-AS-CAUSE: schooling offered as the reason for the empty noon');
    }
    return out;
  },
  faults: [
    { route: '/story', expect: 'fires', inject: function () { const p = document.createElement('p'); p.textContent = 'Read the smallest lines and this is a house with a school-age child in it, counting out loud.'; document.querySelector('section[aria-labelledby="story-beat-title"]').append(p); } },
    { route: '/story', expect: 'fires', inject: function () { const p = document.createElement('p'); p.textContent = 'The listening stops at noon because the school timetable takes the middle of every day away.'; document.querySelector('section[aria-labelledby="story-beat-title"]').append(p); } },
  ],
};

/* ── contrast ───────────────────────────────────────────────────────────────── */

export const contrast = {
  about: 'visible text below WCAG AA against what is actually painted behind it',
  // The background is resolved by stacking order, not DOM ancestry:
  // elementsFromPoint lists everything under the text's own pixel, topmost
  // first, and compositing starts at the text's element and works down. An
  // ancestor walk cannot see a positioned SIBLING painted behind the text — the
  // rail's active item is ink on an amber block that is a sibling, and the old
  // ruler measured it against the rail instead, as 1.09:1, on every run.
  //
  // elementsFromPoint only sees the viewport, so the page is stepped through one
  // screen at a time and each text node is measured where it actually sits.
  fn: async function () {
    const parse = (c) => {
      const m = /rgba?\(([^)]+)\)/.exec(c || '');
      if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const lum = (c) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => { const la = lum(a); const lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
    const composite = (layers) => {
      let acc = { r: 255, g: 255, b: 255, a: 1 };
      for (let k = layers.length - 1; k >= 0; k--) acc = over(layers[k], acc);
      return acc;
    };
    const ancestorBg = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0) { layers.push(c); if (c.a >= 0.999) break; }
      }
      return composite(layers);
    };
    const stackBg = (el, x, y) => {
      const stack = document.elementsFromPoint(x, y);
      const i = stack.indexOf(el);
      if (i < 0) return ancestorBg(el);
      const layers = [];
      for (let k = i; k < stack.length; k++) {
        const c = parse(getComputedStyle(stack[k]).backgroundColor);
        if (c && c.a > 0) { layers.push(c); if (c.a >= 0.999) break; }
      }
      return composite(layers);
    };
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const out = [];
    const seen = new Set();
    const done = new Set();
    const H = innerHeight;
    const max = document.documentElement.scrollHeight;
    for (let y = 0; y < max; y += H) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await frame();
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (done.has(n) || !n.nodeValue.trim()) continue;
        const el = n.parentElement;
        if (!el || String(el.className).includes('sr-only')) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.9) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rect = range.getClientRects()[0];
        if (!rect || rect.width < 1 || rect.height < 1) continue;
        const cx = rect.left + Math.min(rect.width / 2, 6);
        const cy = rect.top + rect.height / 2;
        if (cy < 0 || cy >= H || cx < 0 || cx >= innerWidth) continue;
        done.add(n);
        const fg0 = parse(cs.color);
        if (!fg0) continue;
        const bg = stackBg(el, cx, cy);
        const fg = fg0.a >= 0.999 ? fg0 : over(fg0, bg);
        const px = parseFloat(cs.fontSize);
        const wt = parseInt(cs.fontWeight, 10) || 400;
        const need = px >= 24 || (px >= 18.66 && wt >= 700) ? 3 : 4.5;
        const cr = ratio(fg, bg);
        if (cr < need) {
          const bgs = `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`;
          const key = `${cs.color}|${bgs}|${px}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(`${cr.toFixed(2)}:1 (needs ${need}) ${px}px/${wt} ${cs.color} on ${bgs} "${n.nodeValue.trim().slice(0, 30)}"`);
        }
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    return out;
  },
  faults: [
    { route: '/sources', expect: 'fires', inject: function () { const p = document.createElement('p'); p.style.cssText = 'color:#8a8a8a;background:#9a9a9a;font-size:14px;padding:8px'; p.textContent = 'grey on grey'; document.querySelector('main').prepend(p); } },
    // The false positive that every earlier run reported: ink on an amber block
    // that is a positioned sibling of the text, inside a near-black parent.
    // Stacking order sees the amber (about 9.9:1); an ancestor walk saw the
    // near-black parent (1.09:1). This case must stay clean.
    { route: '/sources', expect: 'clean', inject: function () { const d = document.createElement('div'); d.style.cssText = 'position:relative;background:#06060c;color:#141410;padding:8px'; d.innerHTML = '<span style="position:absolute;inset:0;background:#eab54c"></span><span style="position:relative;font-size:14px">ink on an amber sibling</span>'; document.querySelector('main').prepend(d); } },
  ],
};

/** The detectors every layout render runs. */
export const PAGE_DETECTORS = { sentinel, pronoun, punctuation, floor, overflow, clipped, masthead, anchors, railStanding, dialNames, storyClaims };
export const ALL_DETECTORS = { ...PAGE_DETECTORS, contrast };
