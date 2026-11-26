// PurePastPapers promo: a tiny deterministic tween engine and the full timeline.
// PROMO.seek(t) draws the frame at t seconds. Nothing depends on wall-clock time,
// so render.mjs can capture any frame in any order. PROMO.cues lists the sound
// effects (time, type) for music.py, so picture and sound come from one timeline.
(() => {
  'use strict';

  const BPM = 96;
  const BEAT = 60 / BPM; // 0.625 s
  const BAR = BEAT * 4; // 2.5 s
  const DURATION = 28 * BAR; // 70 s
  const FPS = 60;
  const T = [0, 3, 5, 9, 12, 15, 18, 21, 24, 26].map((bars) => bars * BAR); // scene starts, on bar lines

  // Scene positions on one big desk (top-left of each 1920x1080 frame).
  const SCN = [
    [0, 0], [2350, 260], [4500, 1700], [6850, 1500], [8900, 120],
    [11200, 500], [13300, 1850], [15650, 1550], [17800, 300], [17800, 1750],
  ];

  // ── easing ──
  const E = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outBackBig: (t) => { const c1 = 2.8, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    inBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
    outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  };

  // ── tracks ──
  const DEF = { x: 0, y: 0, r: 0, s: 1, sx: 1, sy: 1, o: 1, ry: 0, draw: 0, clip: 0, num: 0, press: 0 };
  const tracks = new Map(); // element -> Map(prop -> [track])
  const CUES = [];
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
    if (has('num')) el.textContent = (el.dataset.fmt || '{}').replace('{}', Math.round(v.num));
    if (has('press')) el.style.boxShadow = `${(6 * (1 - v.press)).toFixed(1)}px ${(6 * (1 - v.press)).toFixed(1)}px 0 rgba(42,39,35,.35)`;
    el.style.visibility = hidden ? 'hidden' : '';
  }

  // ── camera ──
  const world = $('#world');
  const centre = (i) => [SCN[i][0] + 960, SCN[i][1] + 540];
  const PAN = 0.8; // seconds; the camera is fastest just before the downbeat and settles just after
  function camera(t) {
    let i = 0;
    while (i + 1 < T.length && t >= T[i + 1] - 0.5) i++;
    let [cx, cy] = centre(i);
    let z = 1, r = 0;
    const start = T[i] - 0.5;
    if (i > 0 && t < start + PAN) {
      const u = Math.max(0, (t - start) / PAN);
      const e = E.inOutCubic(u);
      const [ax, ay] = centre(i - 1);
      cx = ax + (cx - ax) * e;
      cy = ay + (cy - ay) * e;
      const bump = Math.sin(Math.PI * u);
      z = 1 - 0.1 * bump;
      r = (i % 2 ? 1 : -1) * 1.4 * bump;
    }
    z *= 1 + 0.12 * (1 - E.outCubic(Math.min(1, t / 2.6))); // opening push-out
    cx += Math.sin(t * 0.71) * 4; // a little hand-held breathing
    cy += Math.cos(t * 0.53) * 3;
    r += Math.sin(t * 0.37) * 0.12;
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

  // ── reusable moves ──
  function tapeIn(el, t) {
    tw(el, t, 0.24, { s: [1.7, 1] }, 'outCubic');
    tw(el, t, 0.08, { o: [0, 1] }, 'linear');
    cue(t, 'tape');
  }
  function cardIn(target, t, { from = 'top', r0 = -10, dist = 1000, dur = 0.75, sound = 'thud' } = {}) {
    for (const el of els(target)) {
      const dx = from === 'left' ? -dist : from === 'right' ? dist : 0;
      const dy = from === 'top' ? -dist : from === 'bottom' ? dist : 0;
      tw(el, t, dur, { x: [dx, 0], y: [dy, 0], r: [r0, 0] }, 'outBack');
      tw(el, t, 0.1, { o: [0, 1] }, 'linear');
      if (sound) cue(t + dur * 0.45, sound);
      [...el.querySelectorAll(':scope > .tape')].forEach((tp, i) => tapeIn(tp, t + dur * 0.7 + i * 0.12));
    }
  }
  function pop(target, t, note = 0, ease = 'outBack', sound = 'pop') {
    tw(target, t, 0.5, { s: [0.25, 1] }, ease);
    tw(target, t, 0.08, { o: [0, 1] }, 'linear');
    if (sound) cue(t, sound, { note });
  }
  function rise(target, t, d = 46, dur = 0.6) {
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
  function swipe(target, t, dur = 0.32) {
    tw(target, t, dur, { sx: [0, 1] }, 'outCubic');
    tw(target, t, 0.01, { o: [0, 1] }, 'linear');
    cue(t, 'swipe', { dur });
  }
  function src(target, t) {
    tw(target, t, 0.6, { x: [-70, 0], s: [0.8, 1] }, 'outBack');
    tw(target, t, 0.12, { o: [0, 1] }, 'linear');
    cue(t + 0.05, 'tape');
  }
  function count(target, t, dur, to) {
    tw(target, t, dur, { num: [0, to] }, 'outCubic');
    const n = Math.min(14, to);
    for (let k = 1; k <= n; k++) cue(t + dur * (1 - Math.pow(1 - k / n, 1 / 3)), 'tick', { k });
  }
  function growBar(bar, val, t, dur, h, to) {
    tw(bar, t, dur, { sy: [0, 1] }, 'outBack');
    tw(bar, t, 0.05, { o: [0, 1] }, 'linear');
    tw(val, t, dur, { y: [h, 0] }, 'outBack');
    tw(val, t, 0.2, { o: [0, 1] }, 'linear');
    count(val, t, dur, to);
    cue(t, 'rise', { dur });
  }
  function click(cursor, ripple, t) {
    tw(cursor, t, 0.07, { s: 0.82 }, 'outQuad');
    tw(cursor, t + 0.07, 0.16, { s: 1 }, 'outBack');
    tw(ripple, t, 0.5, { s: [0.15, 1.5] }, 'outCubic');
    tw(ripple, t, 0.5, { o: [0.9, 0] }, 'linear');
    cue(t, 'click');
  }
  function shake(target, t, amp = 1.6) {
    tw(target, t, 0.07, { r: amp }, 'outQuad');
    tw(target, t + 0.07, 0.09, { r: -amp * 0.7 }, 'inOutSine');
    tw(target, t + 0.16, 0.18, { r: 0 }, 'outBack');
  }

  // ── build generated bits ──
  const TICK_SVG = (cls = '') => `<svg class="${cls}" viewBox="0 0 28 28"><path pathLength="1" d="M5 15 L11 21 L23 7"/></svg>`;

  function build() {
    // place scenes and props
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

    // S5 spec chips
    const chips = ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'];
    $('#s5-chips').innerHTML = chips
      .map((label, i) => {
        const learned = i < 5;
        const left = 40 + (i % 5) * 140;
        const top = 130 + Math.floor(i / 5) * 92;
        return `<div class="chip" id="s5-c${i}" style="left:${left}px;top:${top}px">${learned ? `<i class="chip__fill"></i>${TICK_SVG('chip__tick')}` : ''}<span>${label}</span></div>`;
      })
      .join('');

    // S5 question cards that go through the "learned it?" gate
    const MINIS = [['2.2', 1, 4], ['2.7', 0, 6], ['2.4', 1, 3], ['2.6', 0, 5], ['2.1', 1, 2]];
    $('#s5-minis').innerHTML = MINIS.map(([spec, ok, marks], i) => `<div class="card mini" id="s5-m${i}" style="left:1050px;top:416px;z-index:${5 + i}">
        <div class="chip">${spec}</div><span class="mini__marks">${marks} marks</span>
        <div class="mini__l" style="width:94%"></div><div class="mini__l" style="width:68%"></div>
        <div class="stamp ${ok ? 'stamp--yes' : 'stamp--no'}" id="s5-st${i}"><svg width="40" height="40" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${ok ? '<path d="M5 15 L11 21 L23 7"/>' : '<path d="M7 7 L21 21 M21 7 L7 21"/>'}</svg></div>
      </div>`).join('');

    // S6 topic cards (3 stacks of 4) and the order they are dealt into a mixed test
    const TOPICS = [['Vectors', 'var(--blue)'], ['Integration', 'var(--peach)'], ['Trig', 'var(--green)']];
    let html = '';
    for (let k = 0; k < 3; k++) {
      for (let j = 0; j < 4; j++) {
        html += `<div class="tcard" id="s6-t${k}${j}" style="left:${185 + k * 270 - j * 5}px;top:${410 - j * 8}px;background:${TOPICS[k][1]};z-index:${j + 1}">
          <span style="position:absolute;left:14px;top:10px;font:400 50px/1 var(--font-display)">${TOPICS[k][0][0]}</span><span style="position:absolute;right:14px;bottom:12px;font:800 22px/1 var(--font)">${TOPICS[k][0]}</span></div>`;
      }
    }
    $('#s6-cards').innerHTML = html;

    // S8 sign-up maze steps
    const STEPS = ['Create an account', 'Confirm your email', 'Pick a plan', 'Watch the tutorial', 'Find your topic'];
    $('#s8-steps').innerHTML = STEPS.map((label, i) => `<div class="step" id="s8-st${i}" style="left:${140 + i * 125}px;top:${800 - i * 104}px">${label}</div>`).join('');

    // S9 recap cards
    const RECAP = ['Active recall', 'Mark scheme check', 'Right difficulty', 'Mixed practice', 'Spaced review', 'Low friction'];
    $('#s9-recap').innerHTML = RECAP.map((label, i) => {
      const left = 300 + (i % 3) * 460;
      const top = 120 + Math.floor(i / 3) * 112;
      return `<div class="card" id="s9-r${i}" data-r="${[-1.5, 1, -0.6, 1.2, -1, 0.8][i]}" style="left:${left}px;top:${top}px;width:400px;height:86px;display:flex;align-items:center;gap:20px;padding:0 26px">
        <span style="position:relative;width:42px;height:42px;border:3px solid var(--ink);border-radius:7px;flex:none">
          <svg style="position:absolute;left:-4px;top:-10px;overflow:visible" width="50" height="50" viewBox="0 0 28 28" fill="none"><path id="s9-k${i}" pathLength="1" d="M4 15 L11 22 L26 3" stroke="#b5534a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span><span style="font:800 30px/1 var(--font)">${label}</span></div>`;
    }).join('');

    // cursor tips start off-frame; ripples sit where the clicks land
    Object.assign($('#s3-ripple').style, { left: '480px', top: '600px' });
    Object.assign($('#s8-ripple').style, { left: '430px', top: '520px' });
    $('#s3-title').style.transformOrigin = '50% 0';
    $('#s3-hi').style.zIndex = '-1';
  }

  // ── the timeline ──
  function timeline() {
    const b = BEAT;

    // lens furniture: brand and chapter tabs
    tw('#brand', 0.3, 0.6, { x: [-60, 0] }, 'outBack');
    tw('#brand', 0.3, 0.2, { o: [0, 1] }, 'linear');
    tw('#brand', T[8] - 0.6, 0.35, { o: 0, y: -30 }, 'inQuad');
    const chapters = [['#c1', 0.4, T[2]], ['#c2', T[2], T[3]], ['#c3', T[3], T[4]], ['#c4', T[4], T[5]], ['#c5', T[5], T[6]], ['#c6', T[6], T[7]], ['#c7', T[7], T[8]]];
    for (const [sel, tin, tout] of chapters) {
      tw(sel, tin + 0.1, 0.55, { y: [-120, 0], r: [-6, 0] }, 'outBack');
      tw(sel, tin + 0.1, 0.1, { o: [0, 1] }, 'linear');
      tw(sel, tout - 0.5, 0.3, { y: -120 }, 'inBack');
      tw(sel, tout - 0.3, 0.1, { o: 0 }, 'linear');
    }
    for (let i = 1; i < T.length; i++) cue(T[i] - 0.5, 'whoosh', { dur: PAN });

    // S1 the problem (0 to 7.5)
    cardIn('#s1-card', 0.2, { r0: -14 });
    [['#s1-l1', 1.25], ['#s1-l2', 1.875], ['#s1-l3', 2.5]].forEach(([sel, t]) => {
      rise(sel, t, 30, 0.4);
      swipe(`${sel} .hi`, t + 0.22);
    });
    rise('#s1-l4', 3.4, 30, 0.4);
    write('#s1-feels', 4.0, 0.6);
    draw('#s1-arrow', 4.15, 0.4, 'inOutSine', null);
    draw('#s1-strike', 5.0, 0.5, 'inOutSine');
    shake('#s1-card', 5.1);
    pop('#s1-isnt', 5.625, 7, 'outBackBig');
    src('#s1-src', 2.5);

    // S2 what students actually do (7.5 to 12.5)
    rise('#s2-hl', T[1] + 0.15);
    cardIn('#s2-a', T[1] + 0.4, { r0: -12 });
    count('#s2-n1', T[1] + 0.9, 1.3, 84);
    cardIn('#s2-b', T[1] + 1.0, { r0: 12 });
    count('#s2-n2', T[1] + 1.5, 0.8, 11);
    src('#s2-src', T[1] + 1.4);
    pop('#s2-see', T[1] + 2.3, 2);
    for (const [t, dx] of [[2.65, -7], [3.05, 7], [3.45, 0]]) tw('#s2-pl, #s2-pr', T[1] + t, 0.18, { x: dx }, 'outCubic');
    draw('#s2-circle', T[1] + 3.1, 0.55);
    write('#s2-right', T[1] + 3.5, 0.65);

    // S3 active recall (12.5 to 22.5): the beat drops here
    $$('#s3-title .w').forEach((w, k) => {
      const t = T[2] + k * (b / 2);
      tw(w, t, 0.5, { y: [60, 0], s: [0.6, 1] }, 'outBack');
      tw(w, t, 0.08, { o: [0, 1] }, 'linear');
      cue(t, 'pop', { note: k });
    });
    swipe('#s3-hi', T[2] + 2.05, 0.4);
    write('#s3-sub', T[2] + 2.3, 0.9);
    tw('#s3-title', T[2] + 3.3, 0.7, { y: [0, -132], s: [1, 0.62] }, 'inOutCubic');
    cardIn('#s3-flip', T[2] + 3.6, { from: 'left', r0: -14 });
    tw('#s3-cursor', T[2] + 4.15, 0.55, { x: [900, 470], y: [1150, 598] }, 'outCubic');
    tw('#s3-cursor', T[2] + 4.15, 0.05, { o: [0, 1] }, 'linear');
    click('#s3-cursor', '#s3-ripple', T[2] + 4.75);
    tw('#s3-flip-inner', T[2] + 4.8, 0.65, { ry: [0, 180] }, 'inOutCubic');
    tw('#s3-flip', T[2] + 4.8, 0.32, { s: 1.06 }, 'outQuad');
    tw('#s3-flip', T[2] + 5.12, 0.4, { s: 1 }, 'outBack');
    cue(T[2] + 4.8, 'flip');
    tw('#s3-cursor', T[2] + 5.4, 0.5, { x: 720, y: 1200 }, 'inCubic');
    cardIn('#s3-chart', T[2] + 5.0, { from: 'right', r0: 10 });
    tw('#s3-base', T[2] + 5.5, 0.4, { sx: [0, 1] }, 'outCubic');
    growBar('#s3-b1', '#s3-v1', T[2] + 5.8, 0.8, 184, 40);
    growBar('#s3-b2', '#s3-v2', T[2] + 6.45, 0.9, 281, 61);
    pop('#s3-more', T[2] + 7.35, 9, 'outBackBig');
    src('#s3-src', T[2] + 6.0);
    write('#s3-oops', T[2] + 7.8, 1.0);
    draw('#s3-arrow', T[2] + 8.55, 0.42, 'inOutSine', null);

    // S4 past paper question + mark scheme (22.5 to 30)
    rise('#s4-hl', T[3] + 0.15);
    cardIn('#s4-q', T[3] + 0.5, { from: 'left', r0: -8 });
    write('#s4-a1', T[3] + 1.4, 0.6);
    write('#s4-a2', T[3] + 2.0, 0.6);
    write('#s4-a3', T[3] + 2.6, 0.35);
    src('#s4-src', T[3] + 1.8);
    cardIn('#s4-ms', T[3] + 2.7, { from: 'right', r0: 10 });
    ['#s4-r1', '#s4-r2', '#s4-r3'].forEach((sel, i) => rise(sel, T[3] + 3.2 + i * 0.15, 24, 0.4));
    draw('#s4-t1', T[3] + 3.9, 0.18, 'outQuad', null); cue(T[3] + 3.9, 'chime', { note: 0 });
    draw('#s4-t2', T[3] + 4.2, 0.18, 'outQuad', null); cue(T[3] + 4.2, 'chime', { note: 2 });
    draw('#s4-x3', T[3] + 4.5, 0.22, 'outQuad', null); cue(T[3] + 4.5, 'buzz');
    pop('#s4-score', T[3] + 4.9, 4, 'outBackBig');
    draw('#s4-ring', T[3] + 5.0, 0.5);
    draw('#s4-under', T[3] + 5.35, 0.3, 'outQuad', null);
    write('#s4-redo', T[3] + 5.45, 0.6);
    write('#s4-gap', T[3] + 5.85, 0.8);

    // S5 only what you've learned (30 to 37.5)
    rise('#s5-hl', T[4] + 0.15);
    cardIn('#s5-spec', T[4] + 0.4, { r0: -9 });
    for (let i = 0; i < 5; i++) {
      const t = T[4] + 1.4 + i * (b / 4);
      swipe(`#s5-c${i} .chip__fill`, t, 0.2);
      draw(`#s5-c${i} .chip__tick path`, t + 0.04, 0.16, 'outQuad', null);
      tw(`#s5-c${i}`, t, 0.25, { s: [1.15, 1] }, 'outBack');
      cue(t, 'pop', { note: i });
    }
    pop('#s5-gate', T[4] + 2.1, 0, 'outBack', null);
    write('#s5-gatelab', T[4] + 2.2, 0.5);
    write('#s5-stacklab', T[4] + 2.55, 0.55);
    let kept = 0;
    let firstNo = true;
    [1, 0, 1, 0, 1].forEach((ok, i) => {
      const t = T[4] + 2.7 + i * b;
      const card = `#s5-m${i}`;
      tw(card, t, 0.38, { y: [-760, 0], r: [-8, 0] }, 'outBack');
      tw(card, t, 0.05, { o: [0, 1] }, 'linear');
      cue(t + 0.18, 'thud', { soft: 1 });
      pop(`#s5-st${i}`, t + 0.36, ok ? 6 : 0, 'outBackBig', ok ? 'chime' : 'buzz');
      if (ok) {
        tw(card, t + 0.6, 0.36, { x: 430, y: kept * 26 - 6, r: [0, kept % 2 ? 3 : -3] }, 'inOutCubic');
        cue(t + 0.6, 'slide');
        kept++;
      } else {
        tw(card, t + 0.6, 0.5, { y: 900, r: i === 1 ? 32 : -28, x: i === 1 ? 60 : -50 }, 'inBack');
        tw(card, t + 0.6, 0.15, { o: 0.55 }, 'linear');
        cue(t + 0.7, 'drop');
        if (firstNo) write('#s5-not', t + 0.62, 0.7);
        firstNo = false;
      }
    });
    write('#s5-snap', T[4] + 6.1, 0.7);
    src('#s5-src', T[4] + 1.7);

    // S6 interleaving (37.5 to 45)
    rise('#s6-hl', T[5] + 0.15);
    write('#s6-sub', T[5] + 0.5, 0.8);
    for (let k = 0; k < 3; k++) {
      for (let j = 0; j < 4; j++) {
        const t = T[5] + 0.9 + k * 0.15 + j * 0.04;
        tw(`#s6-t${k}${j}`, t, 0.55, { y: [-700, 0], r: [k * 6 - 6, (j - 1.5) * 2] }, 'outBack');
        tw(`#s6-t${k}${j}`, t, 0.05, { o: [0, 1] }, 'linear');
      }
      cue(T[5] + 1.15 + k * 0.15, 'thud', { soft: 1 });
    }
    const ORDER = [0, 1, 2, 1, 0, 2, 2, 0, 1, 0, 1, 2];
    const used = [0, 0, 0];
    ORDER.forEach((k, m) => {
      const j = 3 - used[k]++; // deal from the top of each stack
      const sel = `#s6-t${k}${j}`;
      const fromX = 185 + k * 270 - j * 5, fromY = 410 - j * 8;
      const toX = 160 + m * 62, toY = 356 + 1.4 * Math.pow(m - 5.5, 2);
      const t = T[5] + 2.0 + m * 0.075;
      tw(sel, t, 0.5, { x: toX - fromX, r: -15 + m * 2.7 }, 'inOutCubic');
      tw(sel, t, 0.25, { y: toY - fromY - 150 }, 'outQuad');
      tw(sel, t + 0.25, 0.25, { y: toY - fromY }, 'inQuad');
      const card = $(sel);
      card.style.zIndex = String(20 + m);
      cue(t, 'flick', { k: m });
    });
    write('#s6-mixed', T[5] + 3.2, 0.7);
    cardIn('#s6-chart', T[5] + 2.6, { from: 'right', r0: 10 });
    tw('#s6-base', T[5] + 3.1, 0.4, { sx: [0, 1] }, 'outCubic');
    growBar('#s6-b1', '#s6-v1', T[5] + 3.4, 0.7, 92, 20);
    growBar('#s6-b2', '#s6-v2', T[5] + 3.95, 0.9, 290, 63);
    write('#s6-aside', T[5] + 4.9, 1.0);
    src('#s6-src', T[5] + 2.2);

    // S7 spacing (45 to 52.5)
    rise('#s7-hl', T[6] + 0.15);
    write('#s7-sub', T[6] + 0.5, 0.8);
    cardIn('#s7-chart', T[6] + 0.7, { from: 'left', r0: -8 });
    tw('#s7-legend, #s7-ticks', T[6] + 1.3, 0.3, { o: [0, 1] }, 'linear');
    draw('#s7-axes', T[6] + 1.2, 0.45, 'inOutSine', null);
    tw('#s7-none', T[6] + 1.5, 1.9, { clip: [0, 1] }, 'linear');
    const curve = [['#s7-c1', 1.5, 0.37], ['#s7-j1', 1.875, 0.1], ['#s7-c2', 2.0, 0.5], ['#s7-j2', 2.5, 0.1], ['#s7-c3', 2.62, 0.5], ['#s7-j3', 3.125, 0.1], ['#s7-c4', 3.25, 0.75]];
    for (const [sel, t, dur] of curve) draw(sel, T[6] + t, dur, sel.includes('-j') ? 'outQuad' : 'inOutSine', null);
    cue(T[6] + 1.5, 'scribble', { dur: 2.5 });
    [['#s7-m1', 1.875], ['#s7-m2', 2.5], ['#s7-m3', 3.125]].forEach(([sel, t], i) => pop(sel, T[6] + t, 3 + i * 2, 'outBackBig'));
    write('#s7-rev', T[6] + 1.95, 0.4, false);
    cardIn('#s7-d1', T[6] + 3.7, { from: 'right', r0: 20, sound: null });
    cardIn('#s7-d2', T[6] + 3.8, { from: 'right', r0: 16, sound: null });
    cardIn('#s7-d3', T[6] + 3.9, { from: 'right', r0: 12 });
    pop('#s7-badge', T[6] + 4.5, 5);
    write('#s7-cap', T[6] + 4.9, 0.9);
    src('#s7-src', T[6] + 1.6);

    // S8 low friction (52.5 to 60)
    rise('#s8-hl', T[7] + 0.15);
    for (let i = 0; i < 5; i++) pop(`#s8-st${i}`, T[7] + 0.5 + i * 0.11, i, 'outBack');
    write('#s8-maze', T[7] + 1.15, 0.6);
    for (let i = 0; i < 5; i++) {
      shake(`#s8-st${i}`, T[7] + 1.9 + i * 0.02, 2.2);
      const t = T[7] + 2.25 + (4 - i) * 0.08;
      tw(`#s8-st${i}`, t, 0.6, { y: 900, r: i % 2 ? 34 : -30, x: (i - 2) * 30 }, 'inBack');
      cue(t + 0.35, 'crash', { k: i });
    }
    tw('#s8-maze', T[7] + 2.3, 0.3, { o: 0, y: 30 }, 'inQuad');
    pop('#s8-btn', T[7] + 2.85, 6, 'outBackBig');
    tw('#s8-cursor', T[7] + 3.0, 0.5, { x: [1000, 420], y: [1150, 512] }, 'outCubic');
    tw('#s8-cursor', T[7] + 3.0, 0.05, { o: [0, 1] }, 'linear');
    click('#s8-cursor', '#s8-ripple', T[7] + 3.55);
    tw('#s8-btn', T[7] + 3.55, 0.06, { press: 1, x: 5, y: 5 }, 'outQuad');
    tw('#s8-btn', T[7] + 3.66, 0.18, { press: 0, x: 0, y: 0 }, 'outBack');
    tw('#s8-q', T[7] + 3.75, 0.6, { y: [-150, 0], s: [0.4, 1], r: [-6, 0] }, 'outBack');
    tw('#s8-q', T[7] + 3.75, 0.08, { o: [0, 1] }, 'linear');
    cue(T[7] + 3.75, 'pop', { note: 9 });
    tw('#s8-cursor', T[7] + 4.25, 0.5, { x: 760, y: 1200 }, 'inCubic');
    write('#s8-noacc', T[7] + 4.2, 0.8);
    cardIn('#s8-f', T[7] + 4.3, { from: 'right', r0: 10 });
    draw('#s8-ring', T[7] + 5.45, 0.5);
    write('#s8-easy', T[7] + 5.85, 0.6);
    src('#s8-src', T[7] + 4.7);

    // S9 recap + logo (60 to 65)
    for (let i = 0; i < 6; i++) {
      const t = T[8] + 0.15 + i * (b / 2);
      pop(`#s9-r${i}`, t, null, 'outBack', null);
      draw(`#s9-k${i}`, t + 0.18, 0.2, 'outQuad', null);
      cue(t + 0.18, 'pop', { note: i + 2 });
    }
    const stamp = T[8] + 2.5; // bar 25 downbeat (62.5 s)
    tw('#s9-mark', stamp - 0.3, 0.3, { s: [3.2, 1], r: [-28, -4] }, 'inCubic');
    tw('#s9-mark', stamp - 0.3, 0.06, { o: [0, 1] }, 'linear');
    tw('#s9-mark', stamp, 0.35, { sx: [1.12, 1], sy: [0.88, 1] }, 'outBack');
    cue(stamp, 'stamp');
    tw('#s9-word', stamp + 0.1, 0.6, { clip: [0, 1] }, 'outCubic');
    tw('#s9-word', stamp + 0.1, 0.01, { o: [0, 1] }, 'linear');
    rise('#s9-tag', stamp + 0.5);
    pop('#s9-url', stamp + 0.9, 7, 'outBack');
    write('#s9-luck', stamp + 1.3, 0.8);

    // S10 sources (65 to 70)
    cardIn('#s10-card', T[9] + 0.1, { from: 'bottom', r0: 5, sound: null });
    $$('#s10-list li').forEach((li, i) => rise(li, T[9] + 0.6 + i * 0.12, 26, 0.5));
    rise('#s10-foot', T[9] + 1.8, 20, 0.5);
  }

  // ── seek / preview ──
  function seek(t) {
    camera(t);
    for (const [el, m] of tracks) apply(el, m, t);
  }

  build();
  // ring paths need final layout, so measure once fonts are in
  const ready = document.fonts.ready.then(async () => {
    await Promise.all([
      document.fonts.load('400 40px "Young Serif"'),
      document.fonts.load('700 40px "Nunito"'),
      document.fonts.load('800 40px "Nunito"'),
      document.fonts.load('700 40px "Caveat"'),
    ]);
    ringAround('#s2-circle', '#s2-b', 70, 70);
    ringAround('#s4-ring', '#s4-score', 20, 6);
    ringAround('#s8-ring', '#s8-A .serif', 26, 14);
    timeline();
    finalize();
    seek(0);
    return true;
  });

  window.PROMO = { duration: DURATION, fps: FPS, bpm: BPM, sceneStarts: T, cues: CUES, seek, ready };

  // Live preview with a scrubber (hidden when rendering).
  if (new URLSearchParams(location.search).has('render')) {
    document.body.classList.add('render');
    return;
  }
  const scrub = $('#scrub'), clock = $('#clock'), play = $('#play');
  const audio = new Audio('out/promo-audio.wav');
  let playing = false, startAt = 0, offset = 0;
  const show = (t) => { seek(t); scrub.value = t; clock.textContent = `${t.toFixed(2)} s`; };
  ready.then(() => show(0));
  scrub.addEventListener('input', () => { offset = +scrub.value; if (playing) { startAt = performance.now(); audio.currentTime = offset; } show(offset); });
  play.addEventListener('click', () => {
    playing = !playing;
    play.textContent = playing ? 'Pause' : 'Play';
    if (playing) {
      if (offset >= DURATION) offset = 0;
      startAt = performance.now();
      audio.currentTime = offset;
      audio.play().catch(() => {});
      const loop = () => {
        if (!playing) return;
        const t = offset + (performance.now() - startAt) / 1000;
        if (t >= DURATION) { playing = false; play.textContent = 'Play'; offset = DURATION; audio.pause(); show(DURATION); return; }
        show(t);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } else {
      offset += (performance.now() - startAt) / 1000;
      audio.pause();
    }
  });
})();
