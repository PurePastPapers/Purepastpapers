// PurePastPapers 30-second overview: a silent, looping cut of the core features for the landing page.
// Same deterministic engine as promo.js (PROMO.seek(t) draws the frame at t seconds), timed in seconds
// instead of beats because there is no music. PROMO.audit() simulates a viewer reading each scene.
(() => {
  'use strict';

  const FPS = 60;
  const LENS = [5.8, 7.4, 7.8, 5.8, 5.3, 6.8, 6.4, 4.6]; // seconds per scene
  const T = LENS.reduce((acc, len, i) => (acc.push(i ? acc[i - 1] + LENS[i - 1] : 0), acc), []);
  const DURATION = LENS.reduce((a, b) => a + b, 0);
  const at = (scene, seconds) => T[scene] + seconds;
  const CUES = []; // the engine records sound cues; this cut is silent, so they are ignored
  const SCN = [[0, 0], [2356, 266], [4484, 1710], [6840, 1520], [8892, 114], [11172, 494], [13300, 1862], [15656, 1558]]; // multiples of the 38 px grid

  // ── easing ──
  const E = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outBackBig: (t) => { const c1 = 2.8, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    inBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  };

  // ── tracks ──
  const DEF = { x: 0, y: 0, r: 0, s: 1, sx: 1, sy: 1, o: 1, ry: 0, draw: 0, clip: 0, num: 0, press: 0 };
  const tracks = new Map();
  const READ = []; // text the viewer is meant to read: { scene, id, words, at }
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const els = (target) => {
    if (typeof target === 'string') {
      const list = $$(target);
      if (!list.length) console.warn('promo: nothing matches', target);
      return list;
    }
    return Array.isArray(target) ? target : [target];
  };

  function tw(target, t0, dur, props, ease = 'outCubic') {
    for (const el of els(target)) {
      let m = tracks.get(el);
      if (!m) tracks.set(el, (m = new Map()));
      for (const [prop, value] of Object.entries(props)) {
        const [a, b] = Array.isArray(value) ? value : [null, value];
        if (!m.has(prop)) m.set(prop, []);
        m.get(prop).push({ t0, t1: t0 + Math.max(dur, 1e-6), a, b, ease: typeof ease === 'function' ? ease : E[ease] });
      }
    }
  }
  const cue = (t, type, extra = {}) => CUES.push({ t: +t.toFixed(4), type, ...extra });

  /** Registers text the viewer should read, starting when it appears. `w` scales its reading cost. */
  function read(scene, target, t, w = 1) {
    for (const el of els(target)) {
      const words = (el.textContent || '').trim().split(/\s+/).filter(Boolean).length;
      READ.push({ scene, id: el.id || String(target), words: Math.max(1, Math.round(words * w)), at: t });
    }
  }

  function finalize() {
    for (const m of tracks.values()) {
      for (const [prop, list] of m) {
        list.sort((p, q) => p.t0 - q.t0);
        let prev = DEF[prop];
        for (const k of list) {
          if (k.a === null) k.a = prev;
          prev = k.b;
        }
      }
    }
    CUES.sort((p, q) => p.t - q.t);
  }

  function valueAt(list, t) {
    if (t < list[0].t0) return list[0].a;
    let k = list[0];
    for (const c of list) {
      if (c.t0 <= t) k = c;
      else break;
    }
    const u = Math.min(1, Math.max(0, (t - k.t0) / (k.t1 - k.t0)));
    return k.a + (k.b - k.a) * k.ease(u);
  }

  function apply(el, m, t) {
    const v = {};
    for (const [prop, list] of m) v[prop] = valueAt(list, t);
    const has = (p) => p in v;
    const baseR = el._baseR ?? (el._baseR = parseFloat(el.dataset.r || 0));
    if (has('x') || has('y') || has('r') || has('s') || has('sx') || has('sy') || has('ry') || baseR) {
      let tr = has('ry') ? 'perspective(1800px) ' : '';
      tr += `translate(${(v.x ?? 0).toFixed(2)}px, ${(v.y ?? 0).toFixed(2)}px) rotate(${((v.r ?? 0) + baseR).toFixed(3)}deg)`;
      if (has('ry')) tr += ` rotateY(${v.ry.toFixed(2)}deg)`;
      const s = v.s ?? 1;
      tr += ` scale(${(s * (v.sx ?? 1)).toFixed(4)}, ${(s * (v.sy ?? 1)).toFixed(4)})`;
      el.style.transform = tr;
    }
    let hidden = false;
    if (has('o')) {
      el.style.opacity = Math.max(0, Math.min(1, v.o)).toFixed(3);
      hidden = v.o <= 0.002;
    }
    if (has('draw')) {
      el.style.strokeDasharray = '1 1';
      el.style.strokeDashoffset = (1 - v.draw).toFixed(4);
      hidden = hidden || v.draw <= 0.002;
    }
    if (has('clip')) {
      el.style.clipPath = `inset(-30% ${((1 - v.clip) * 110 - 5).toFixed(2)}% -30% -5%)`;
      hidden = hidden || v.clip <= 0.002;
    }
    if (has('num')) {
      const n = Math.round(v.num);
      el.textContent = (el.dataset.fmt || '{}').replace('{}', el.dataset.comma ? n.toLocaleString('en-GB') : n);
    }
    if (has('press')) el.style.boxShadow = `${(6 * (1 - v.press)).toFixed(1)}px ${(6 * (1 - v.press)).toFixed(1)}px 0 rgba(42,39,35,.35)`;
    el.style.visibility = hidden ? 'hidden' : '';
  }

  // ── camera ──
  const world = $('#world');
  const centre = (i) => [SCN[i][0] + 960, SCN[i][1] + 540];
  const PAN = 1.2; // seconds: fastest just before the downbeat, settling just after it
  const LEAD = 0.75;
  function camera(t) {
    let i = 0;
    while (i + 1 < T.length && t >= T[i + 1] - LEAD) i++;
    let [cx, cy] = centre(i);
    let z = 1, r = 0;
    const start = T[i] - LEAD;
    if (i > 0 && t < start + PAN) {
      const u = Math.max(0, (t - start) / PAN);
      const e = E.inOutCubic(u);
      const [ax, ay] = centre(i - 1);
      cx = ax + (cx - ax) * e;
      cy = ay + (cy - ay) * e;
      const bump = Math.sin(Math.PI * u);
      z = 1 - 0.08 * bump;
      r = (i % 2 ? 1 : -1) * 1.0 * bump;
    }
    // No opening zoom, and the hand-held drift repeats every 30 s, so the first and last frames match and the loop restarts cleanly.
    const w = (2 * Math.PI * t) / DURATION;
    cx += Math.sin(w * 3) * 3;
    cy += Math.cos(w * 2) * 2;
    r += Math.sin(w * 1) * 0.1;
    world.style.transform = `translate(960px, 540px) rotate(${r.toFixed(3)}deg) scale(${z.toFixed(4)}) translate(${(-cx).toFixed(2)}px, ${(-cy).toFixed(2)}px)`;
  }

  // ── geometry helpers ──
  function sceneRect(el) {
    let x = 0, y = 0, node = el;
    while (node && !node.classList.contains('scene')) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function handEllipse(cx, cy, rx, ry, start = -2.3, turns = 1.1) {
    const n = 72;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const a = start + u * turns * Math.PI * 2;
      const k = 1 + 0.035 * Math.sin(u * 9.1) + (u > 0.82 ? (u - 0.82) * 0.35 : 0);
      d += `${i ? ' L' : 'M'}${(cx + Math.cos(a) * rx * k).toFixed(1)} ${(cy + Math.sin(a) * ry * k).toFixed(1)}`;
    }
    return d;
  }
  function ringAround(pathSel, targetSel, padX, padY) {
    const box = sceneRect($(targetSel));
    $(pathSel).setAttribute('d', handEllipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2 + padX, box.h / 2 + padY));
  }

  // ── reusable moves (slower than v2) ──
  function tapeIn(el, t) {
    tw(el, t, 0.3, { s: [1.7, 1] }, 'outCubic');
    tw(el, t, 0.1, { o: [0, 1] }, 'linear');
    cue(t, 'tape');
  }
  function cardIn(target, t, { from = 'top', r0 = -10, dist = 1000, dur = 1.0, sound = 'thud' } = {}) {
    for (const el of els(target)) {
      const dx = from === 'left' ? -dist : from === 'right' ? dist : 0;
      const dy = from === 'top' ? -dist : from === 'bottom' ? dist : 0;
      tw(el, t, dur, { x: [dx, 0], y: [dy, 0], r: [r0, 0] }, 'outBack');
      tw(el, t, 0.14, { o: [0, 1] }, 'linear');
      if (sound) cue(t + dur * 0.45, sound);
      [...el.querySelectorAll(':scope > .tape')].forEach((tp, i) => tapeIn(tp, t + dur * 0.7 + i * 0.14));
    }
  }
  function pop(target, t, note = 0, ease = 'outBack', sound = 'pop') {
    tw(target, t, 0.7, { s: [0.25, 1] }, ease);
    tw(target, t, 0.1, { o: [0, 1] }, 'linear');
    if (sound) cue(t, sound, { note });
  }
  function rise(target, t, d = 40, dur = 0.8) {
    tw(target, t, dur, { y: [d, 0] }, 'outCubic');
    tw(target, t, dur * 0.5, { o: [0, 1] }, 'linear');
  }
  function write(target, t, dur, sound = true) {
    tw(target, t, dur, { clip: [0, 1] }, 'linear');
    tw(target, t, 0.01, { o: [0, 1] }, 'linear');
    if (sound) cue(t, 'scribble', { dur });
  }
  function draw(target, t, dur, ease = 'inOutSine', sound = 'scribble') {
    tw(target, t, dur, { draw: [0, 1] }, ease);
    if (sound) cue(t, sound, { dur });
  }
  function swipe(target, t, dur = 0.4, sound = true) {
    tw(target, t, dur, { sx: [0, 1] }, 'outCubic');
    tw(target, t, 0.01, { o: [0, 1] }, 'linear');
    if (sound) cue(t, 'swipe', { dur });
  }
  function count(target, t, dur, to, ticks = 12) {
    tw(target, t, dur, { num: [0, to] }, 'outCubic');
    const n = Math.min(ticks, to);
    for (let k = 1; k <= n; k++) cue(t + dur * (1 - Math.pow(1 - k / n, 1 / 3)), 'tick', { k });
  }
  function growMeter(fill, t, dur) {
    tw(fill, t, dur, { sx: [0, 1] }, 'outCubic');
    tw(fill, t, 0.05, { o: [0, 1] }, 'linear');
    cue(t, 'rise', { dur });
  }
  function click(cursor, ripple, t) {
    tw(cursor, t, 0.08, { s: 0.82 }, 'outQuad');
    tw(cursor, t + 0.08, 0.2, { s: 1 }, 'outBack');
    tw(ripple, t, 0.6, { s: [0.15, 1.5] }, 'outCubic');
    tw(ripple, t, 0.6, { o: [0.9, 0] }, 'linear');
    cue(t, 'click');
  }
  function shake(target, t, amp = 1.4) {
    tw(target, t, 0.09, { r: amp }, 'outQuad');
    tw(target, t + 0.09, 0.11, { r: -amp * 0.7 }, 'inOutSine');
    tw(target, t + 0.2, 0.24, { r: 0 }, 'outBack');
  }
  function tickChip(sel, t, note) {
    swipe(`${sel} .chip__fill`, t, 0.3, false);
    draw(`${sel} .chip__tick path`, t + 0.06, 0.24, 'outQuad', null);
    tw(sel, t, 0.36, { s: [1.15, 1] }, 'outBack');
    if (note !== null) cue(t, 'pop', { note });
  }

  // ── build generated bits ──
  const TICK_SVG = (cls = '') => `<svg class="${cls}" viewBox="0 0 28 28"><path pathLength="1" d="M5 15 L11 21 L23 7"/></svg>`;
  const chip = (id, label, learned, left, top, extra = '') =>
    `<div class="chip" id="${id}" style="left:${left}px;top:${top}px;${extra}">${learned ? `<i class="chip__fill"></i>${TICK_SVG('chip__tick')}` : ''}<span>${label}</span></div>`;
  const miniCard = (id, tags, marks, stamps, left, top, z) => `<div class="card mini" id="${id}" style="left:${left}px;top:${top}px;z-index:${z}">
      <div style="display:flex;gap:10px">${tags.map((tag, k) => `<div class="chip"${k ? ' style="border-style:dashed;background:var(--surface-2)"' : ''}>${k ? '+ ' : ''}${tag}</div>`).join('')}</div>
      ${marks ? `<span class="mini__marks">${marks} marks</span>` : ''}
      <div class="mini__l" style="width:94%"></div><div class="mini__l" style="width:68%"></div>${stamps}</div>`;
  const stampSvg = (kind) => `<svg width="40" height="40" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${
    kind === 'yes' ? '<path d="M5 15 L11 21 L23 7"/>' : kind === 'no' ? '<path d="M7 7 L21 21 M21 7 L7 21"/>' : '<path d="M9 6 V22 M19 6 V22"/>'}</svg>`;
  const stamp = (id, kind) => `<div class="stamp stamp--${kind}" id="${id}">${stampSvg(kind)}</div>`;

  function build() {
    $$('.scene').forEach((scene, i) => {
      scene.style.left = `${SCN[i][0]}px`;
      scene.style.top = `${SCN[i][1]}px`;
    });
    const place = (sel, x, y, r = 0) => {
      const el = $(sel);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.transform = `rotate(${r}deg)`;
    };
    place('#p-ring1', 2010, 860);
    place('#p-sticky1', 4110, 1380, 6);
    place('#p-clip', 6520, 2000, 28);
    place('#p-pencil', 8380, 1260, -24);
    place('#p-ring2', 10930, 1360);
    place('#p-sticky2', 13140, 1600, -5);
    place('#p-flame', 17620, 1300, 8);

    // O2: the spec card and the two questions it finds
    $('#o2-chips').innerHTML = ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'].map((l, i) => chip(`o2-c${i}`, l, i < 5, 40 + (i % 5) * 140, 50 + Math.floor(i / 5) * 96)).join('');
    $('#o2-minis').innerHTML = miniCard('o2-m0', ['2.2'], 4, '', 990, 600, 5) + miniCard('o2-m1', ['2.4'], 3, '', 1330, 620, 6);

    // O3: a question that needs two spec points waits at the gate
    $('#o3-chips').innerHTML = ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '3.4'].map((l, i) => chip(`o3-c${i}`, l, i < 5 || i === 7, 40 + (i % 5) * 140, 50 + Math.floor(i / 5) * 96)).join('');
    $('#o3-minis').innerHTML = miniCard('o3-m0', ['2.4', '3.4'], 5, stamp('o3-stw', 'wait') + stamp('o3-sty', 'yes'), 1050, 376, 5);

    // O5: Data Hub rows (example data)
    const ROWS = [['2.1', 'Motion', 'g', 'Secure', 82, 'var(--good)'], ['2.3', 'Momentum', 'r', 'Needs work', 31, '#d9776a'], ['2.4', 'Projectiles', 'a', 'Developing', 58, '#e5b84a']];
    $('#o5-rows').innerHTML = ROWS.map(([code, name, rag, label, pct, colour], i) => `<div class="hubrow" id="o5-row${i}" style="top:${110 + i * 130}px">
        <div class="chip">${code}</div><div class="hubrow__name" style="font-size:34px">${name}</div><div class="rag rag--${rag}" id="o5-rag${i}" style="font-size:22px">${label}</div>
        <div class="track"><i id="o5-fill${i}" style="width:${pct}%;background:${colour}"></i></div><div class="hubrow__val" id="o5-val${i}" data-fmt="{}%">${pct}%</div></div>`).join('');

    // O6: the teacher ticks what has been taught; a pupil who joins gets it ticked
    $('#o6-tchips').innerHTML = ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'].map((l, i) => chip(`o6-t${i}`, l, i < 5, 40 + (i % 5) * 140, 130 + Math.floor(i / 5) * 96)).join('');
    $('#o6-pchips').innerHTML = ['2.1', '2.2', '2.3', '2.4', '2.5'].map((l, i) => chip(`o6-p${i}`, l, true, 28 + i * 124, 130)).join('');

    // O7: the class heat map (example data)
    const HEAT = ['GGARGA', 'GAGRAG', 'AGGRGG', 'GGAAGA', 'GAGRGG'];
    const COL = { G: 'var(--good)', A: '#e5b84a', R: '#d9776a' };
    let grid = ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6'].map((l, c) => `<div class="hm-col" id="o7-h${c}" style="left:${220 + c * 125}px;top:86px">${l}</div>`).join('');
    grid += HEAT.map((row, r) => `<div class="hm-row" id="o7-n${r}" style="left:40px;top:${152 + r * 78}px">Pupil ${r + 1}</div>` +
      [...row].map((g, c) => `<div class="hm-cell" id="o7-c${r}${c}" style="left:${220 + c * 125}px;top:${136 + r * 78}px;background:${COL[g]}"></div>`).join('')).join('');
    grid += '<div id="o7-col" style="position:absolute;left:595px;top:80px;width:110px;height:430px"></div>';
    $('#o7-grid').innerHTML = grid;
    Object.assign($('#o7-ripple').style, { left: '1400px', top: '580px' });
  }

  // ── the timeline (seconds from each scene's start) ──
  function timeline() {
    tw('#brand', 0.3, 0.6, { x: [-60, 0] }, 'outBack');
    tw('#brand', 0.3, 0.2, { o: [0, 1] }, 'linear');
    tw('#brand', DURATION - 0.9, 0.5, { o: 0 }, 'linear'); // so the loop restarts on blank paper
    const slam = (sel, t, S) => { tw(sel, t, 0.5, { s: [2.8, 1], r: [-18, 0] }, 'inCubic'); tw(sel, t, 0.1, { o: [0, 1] }, 'linear'); read(S, sel, t); };

    // O1: the evidence
    {
      const S = 0, a = (s) => at(S, s);
      rise('#o1-hl', a(0.2)); read(S, '#o1-hl', a(0.2));
      cardIn('#o1-chart', a(0.7), { r0: -8, dur: 0.8 });
      rise('#o1-title', a(1.4), 24); read(S, '#o1-title', a(1.4), 0.7);
      tw('#o1-base', a(1.6), 0.3, { sx: [0, 1] }, 'outCubic');
      tw('#o1-b1', a(1.8), 0.7, { sy: [0, 1] }, 'outBack'); tw('#o1-b1', a(1.8), 0.05, { o: [0, 1] }, 'linear');
      tw('#o1-v1', a(1.8), 0.7, { y: [197, 0] }, 'outBack'); tw('#o1-v1', a(1.8), 0.2, { o: [0, 1] }, 'linear'); count('#o1-v1', a(1.8), 0.7, 40, 6);
      rise('#o1-l1', a(2.0), 18);
      tw('#o1-b2', a(2.5), 0.8, { sy: [0, 1] }, 'outBack'); tw('#o1-b2', a(2.5), 0.05, { o: [0, 1] }, 'linear');
      tw('#o1-v2', a(2.5), 0.8, { y: [300, 0] }, 'outBack'); tw('#o1-v2', a(2.5), 0.2, { o: [0, 1] }, 'linear'); count('#o1-v2', a(2.5), 0.8, 61, 6);
      rise('#o1-l2', a(2.7), 18);
      read(S, '#o1-v1', a(1.8), 2); read(S, '#o1-v2', a(2.5), 2);
      rise('#o1-c', a(3.6), 16); // an attribution, not something the viewer has to read
    }

    // O2: why filtering by spec point is better
    {
      const S = 1, a = (s) => at(S, s);
      rise('#o2-hl', a(0.2)); read(S, '#o2-hl', a(0.2));
      [0, 1, 2].forEach((k) => {
        tw(`#o2-p${k}`, a(0.5 + k * 0.3), 0.9, { y: [-700, 0], r: [(k % 2 ? 1 : -1) * 14, (k - 1) * 4] }, 'outBack');
        tw(`#o2-p${k}`, a(0.5 + k * 0.3), 0.12, { o: [0, 1] }, 'linear');
      });
      pop('#o2-q1', a(1.5), 0, 'outBackBig', null); pop('#o2-q2', a(1.75), 0, 'outBackBig', null);
      cardIn('#o2-sci', a(1.1), { from: 'bottom', r0: 5, dist: 500, dur: 0.8 });
      rise('#o2-sci p', a(1.7), 20); read(S, '#o2-sci p', a(1.7));
      rise('#o2-sci .cite', a(2.7), 16); // an attribution, not something the viewer has to read
      cardIn('#o2-spec', a(2.0), { r0: -9, dur: 0.8 });
      for (let i = 0; i < 5; i++) tickChip(`#o2-c${i}`, a(2.7 + i * 0.22), null);
      draw('#o2-arrow', a(3.9), 0.4, 'inOutSine', null);
      cardIn('#o2-m0', a(4.1), { from: 'right', r0: 6, dist: 700, dur: 0.7, sound: null });
      cardIn('#o2-m1', a(4.4), { from: 'right', r0: -6, dist: 700, dur: 0.7, sound: null });
      write('#o2-only', a(4.3), 0.9); read(S, '#o2-only', a(4.3));
    }

    // O3: questions wait until you're ready
    {
      const S = 2, a = (s) => at(S, s);
      rise('#o3-hl', a(0.2)); read(S, '#o3-hl', a(0.2));
      cardIn('#o3-spec', a(0.5), { r0: -9, dur: 0.8 });
      for (let i = 0; i < 5; i++) tickChip(`#o3-c${i}`, a(1.0 + i * 0.22), null);
      pop('#o3-gate', a(2.2), 0, 'outBack', null);
      tw('#o3-m0', a(2.6), 0.55, { y: [-760, 0], r: [-8, 0] }, 'outBack'); tw('#o3-m0', a(2.6), 0.06, { o: [0, 1] }, 'linear');
      tw('#o3-sty', a(1), 0.01, { o: 0 }, 'linear');
      pop('#o3-stw', a(3.2), 0, 'outBackBig', null);
      write('#o3-wait', a(3.0), 1.1); read(S, '#o3-wait', a(3.0));
      tickChip('#o3-c7', a(4.3), null);
      tw('#o3-stw', a(5.0), 0.3, { o: 0 }, 'linear');
      pop('#o3-sty', a(5.2), 0, 'outBackBig', null);
      tw('#o3-m0', a(5.7), 0.6, { x: 430 }, 'inOutCubic');
      write('#o3-now', a(4.9), 1.0); read(S, '#o3-now', a(4.9));
      rise('#o3-c', a(1.2), 16); // an attribution, not something the viewer has to read
    }

    // O4: mark scheme beside the answer
    {
      const S = 3, a = (s) => at(S, s);
      rise('#o4-hl', a(0.2)); read(S, '#o4-hl', a(0.2));
      cardIn('#o4-q', a(0.5), { from: 'left', r0: -8, dur: 0.8 }); read(S, '#o4-a', a(1.0), 0.3);
      pop('#o4-b1', a(1.3), 0, 'outBack', null); read(S, '#o4-b1', a(1.3), 0.6);
      cardIn('#o4-ms', a(2.2), { from: 'right', r0: 10, dur: 0.8, sound: null });
      rise('#o4-r1', a(2.8), 20, 0.5); rise('#o4-r2', a(3.1), 20, 0.5); read(S, '#o4-ms', a(2.8), 0.45);
      draw('#o4-x1', a(3.5), 0.25, 'outQuad', null); draw('#o4-x2', a(3.8), 0.25, 'outQuad', null);
    }

    // O5: Data Hub
    {
      const S = 4, a = (s) => at(S, s);
      rise('#o5-hl', a(0.2)); read(S, '#o5-hl', a(0.2));
      cardIn('#o5-hub', a(0.5), { r0: -7, dur: 0.8 }); read(S, '#o5-lab', a(1.1), 0.5);
      for (let i = 0; i < 3; i++) {
        const t = a(1.2 + i * 0.45);
        rise(`#o5-row${i}`, t, 24, 0.5); tw(`#o5-fill${i}`, t + 0.15, 0.6, { sx: [0, 1] }, 'outCubic');
        count(`#o5-val${i}`, t + 0.15, 0.6, [82, 31, 58][i], 4); pop(`#o5-rag${i}`, t + 0.4, null, 'outBack', null);
        read(S, `#o5-row${i}`, t, 0.35);
      }
      ringAround('#o5-ring', '#o5-row1', -12, 4);
      draw('#o5-ring', a(2.7), 0.6);
    }

    // O6: classrooms, joining
    {
      const S = 5, a = (s) => at(S, s);
      rise('#o6-hl', a(0.2)); read(S, '#o6-hl', a(0.2));
      slam('#o6-soon', a(0.8), S);
      cardIn('#o6-teacher', a(1.4), { from: 'left', r0: -8, dur: 0.8 }); read(S, '#o6-teacher .term__bar', a(1.8), 0.4);
      for (let i = 0; i < 5; i++) tickChip(`#o6-t${i}`, a(2.2 + i * 0.25), null);
      write('#o6-note', a(3.0), 1.5); read(S, '#o6-note', a(3.0));
      draw('#o6-arrow', a(3.5), 0.5, 'inOutSine', null);
      cardIn('#o6-pupil', a(3.9), { from: 'right', r0: 8, dist: 800, dur: 0.8, sound: null });
      pop('#o6-joined', a(4.5), 0, 'outBackBig', null);
      for (let i = 0; i < 5; i++) tickChip(`#o6-p${i}`, a(4.9 + i * 0.22), null);
    }

    // O7: classrooms, the whole class
    {
      const S = 6, a = (s) => at(S, s);
      rise('#o7-hl', a(0.2)); read(S, '#o7-hl', a(0.2));
      slam('#o7-soon', a(0.8), S);
      cardIn('#o7-heat', a(1.0), { from: 'left', r0: -8, dur: 0.8 });
      for (let c = 0; c < 6; c++) rise(`#o7-h${c}`, a(1.6) + c * 0.05, 20, 0.4);
      for (let r = 0; r < 5; r++) rise(`#o7-n${r}`, a(1.6) + r * 0.05, 20, 0.4);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
        const t = a(1.9 + (r + c) * 0.17);
        tw(`#o7-c${r}${c}`, t, 0.45, { s: [0.2, 1] }, 'outBack'); tw(`#o7-c${r}${c}`, t, 0.1, { o: [0, 1] }, 'linear');
      }
      ringAround('#o7-ring', '#o7-col', 22, 26);
      draw('#o7-ring', a(3.3), 0.7);
      pop('#o7-btn', a(3.8), 0, 'outBackBig', null); read(S, '#o7-btn', a(3.8), 0.6);
      tw('#o7-cursor', a(4.2), 0.6, { x: [1500, 1360], y: [1150, 600] }, 'outCubic'); tw('#o7-cursor', a(4.2), 0.1, { o: [0, 1] }, 'linear');
      click('#o7-cursor', '#o7-ripple', a(4.9));
      tw('#o7-cursor', a(5.1), 0.4, { x: 1700, y: 1200 }, 'inCubic');
    }

    // O8: logo and "no account", then everything fades so the loop restarts on blank paper
    {
      const S = 7, a = (s) => at(S, s);
      tw('#o8-mark', a(0.4) - 0.3, 0.3, { s: [3.2, 1], r: [-28, -4] }, 'inCubic');
      tw('#o8-mark', a(0.4) - 0.3, 0.06, { o: [0, 1] }, 'linear');
      tw('#o8-mark', a(0.4), 0.4, { sx: [1.12, 1], sy: [0.88, 1] }, 'outBack');
      tw('#o8-word', a(0.6), 0.7, { clip: [0, 1] }, 'outCubic'); tw('#o8-word', a(0.6), 0.01, { o: [0, 1] }, 'linear'); read(S, '#o8-word', a(0.6), 0.7);
      write('#o8-tag', a(1.3), 1.4); read(S, '#o8-tag', a(1.3));
      tw('#o8', LENS[S] - 0.5 + T[S], 0.5, { o: [1, 0] }, 'linear');
    }
  }

  /** Simulates a viewer reading each scene's text in order. Slack is spare time before the camera moves on. */
  function audit() {
    const SECS_PER_WORD = 0.33, SECS_PER_ITEM = 0.2;
    const rows = [];
    for (let i = 0; i < LENS.length; i++) {
      const items = READ.filter((r) => r.scene === i).sort((p, q) => p.at - q.at);
      const end = (T[i + 1] ?? DURATION) - (i < LENS.length - 1 ? LEAD + 0.5 : 0.6);
      let cursor = T[i], words = 0;
      for (const it of items) { cursor = Math.max(cursor, it.at) + SECS_PER_ITEM + it.words * SECS_PER_WORD; words += it.words; }
      rows.push({ scene: i + 1, id: $$('.scene')[i].id, bars: '', seconds: LENS[i], words, readsUntil: +(cursor - T[i]).toFixed(1), slack: +(end - cursor).toFixed(1) });
    }
    return rows;
  }

  function seek(t) {
    camera(t);
    for (const [el, m] of tracks) apply(el, m, t);
  }

  build();
  const ready = document.fonts.ready.then(async () => {
    await Promise.all([
      document.fonts.load('400 40px "Young Serif"'),
      document.fonts.load('700 40px "Nunito"'),
      document.fonts.load('800 40px "Nunito"'),
      document.fonts.load('700 40px "Caveat"'),
    ]);
    const { PPP_PATH, PPP_VIEWBOX } = await import('../../js/ui/logo.js');
    $$('.ppp-slot').forEach((slot) => {
      slot.style.cssText = `display:block;width:${slot.dataset.w}px`;
      slot.innerHTML = `<svg viewBox="${PPP_VIEWBOX}" style="display:block;width:100%;height:auto" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${PPP_PATH}"/></svg>`;
    });
    timeline();
    finalize();
    seek(0);
    return true;
  });

  window.PROMO = { duration: DURATION, fps: FPS, sceneStarts: T, music: {}, cues: CUES, seek, ready, audit };

  if (new URLSearchParams(location.search).has('render')) {
    document.body.classList.add('render');
    return;
  }
  const scrub = $('#scrub'), clock = $('#clock'), play = $('#play');
  scrub.max = String(DURATION);
  let playing = false, startAt = 0, offset = 0;
  const show = (t) => { seek(t); scrub.value = t; clock.textContent = `${t.toFixed(2)} s`; };
  ready.then(() => show(0));
  scrub.addEventListener('input', () => { offset = +scrub.value; if (playing) startAt = performance.now(); show(offset); });
  play.addEventListener('click', () => {
    playing = !playing;
    play.textContent = playing ? 'Pause' : 'Play';
    if (playing) {
      startAt = performance.now();
      const loop = () => {
        if (!playing) return;
        let t = offset + (performance.now() - startAt) / 1000;
        if (t >= DURATION) { offset = 0; startAt = performance.now(); t = 0; }
        show(t);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } else {
      offset += (performance.now() - startAt) / 1000;
    }
  });
})();
