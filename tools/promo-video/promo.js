// PurePastPapers promo: a tiny deterministic tween engine and the full timeline.
// PROMO.seek(t) draws the frame at t seconds. Nothing depends on wall-clock time,
// so render.mjs can capture any frame in any order. PROMO.cues lists the sound
// effects (time, type) and PROMO.music the song structure, for music.py, so picture
// and sound come from one timeline. Animation times are written in beats.
(() => {
  'use strict';

  const BPM = 84;
  const BEAT = 60 / BPM; // 0.714 s
  const BAR = BEAT * 4; // 2.857 s
  const BARS = 28;
  const DURATION = BARS * BAR; // 80 s
  const FPS = 60;
  const SCENE_BARS = [0, 3, 5, 8, 12, 15, 17, 20, 23, 26]; // every scene starts on a bar line
  const T = SCENE_BARS.map((bars) => bars * BAR);
  const MUSIC = { bpm: BPM, bars: BARS, dropBar: 5, breakBar: 16, liftBar: 17, liftEndBar: 23, stampBar: 24, hookBars: [8, 17] };
  const at = (scene, beats) => T[scene] + beats * BEAT;

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
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outBackBig: (t) => { const c1 = 2.8, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    inBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
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
  const PAN = 1.05; // seconds: fastest just before the downbeat, settling just after it
  const LEAD = 0.65;
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
      z = 1 - 0.09 * bump;
      r = (i % 2 ? 1 : -1) * 1.2 * bump;
    }
    z *= 1 + 0.12 * (1 - E.outCubic(Math.min(1, t / 3))); // opening push-out
    cx += Math.sin(t * 0.6) * 4; // a little hand-held breathing
    cy += Math.cos(t * 0.45) * 3;
    r += Math.sin(t * 0.31) * 0.12;
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

  // ── reusable moves (a touch slower than v1) ──
  function tapeIn(el, t) {
    tw(el, t, 0.28, { s: [1.7, 1] }, 'outCubic');
    tw(el, t, 0.08, { o: [0, 1] }, 'linear');
    cue(t, 'tape');
  }
  function cardIn(target, t, { from = 'top', r0 = -10, dist = 1000, dur = 0.9, sound = 'thud' } = {}) {
    for (const el of els(target)) {
      const dx = from === 'left' ? -dist : from === 'right' ? dist : 0;
      const dy = from === 'top' ? -dist : from === 'bottom' ? dist : 0;
      tw(el, t, dur, { x: [dx, 0], y: [dy, 0], r: [r0, 0] }, 'outBack');
      tw(el, t, 0.12, { o: [0, 1] }, 'linear');
      if (sound) cue(t + dur * 0.45, sound);
      [...el.querySelectorAll(':scope > .tape')].forEach((tp, i) => tapeIn(tp, t + dur * 0.7 + i * 0.14));
    }
  }
  function pop(target, t, note = 0, ease = 'outBack', sound = 'pop') {
    tw(target, t, 0.6, { s: [0.25, 1] }, ease);
    tw(target, t, 0.1, { o: [0, 1] }, 'linear');
    if (sound) cue(t, sound, { note });
  }
  function rise(target, t, d = 46, dur = 0.7) {
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
  function swipe(target, t, dur = 0.36, sound = true) {
    tw(target, t, dur, { sx: [0, 1] }, 'outCubic');
    tw(target, t, 0.01, { o: [0, 1] }, 'linear');
    if (sound) cue(t, 'swipe', { dur });
  }
  function src(target, t) {
    tw(target, t, 0.7, { x: [-70, 0], s: [0.8, 1] }, 'outBack');
    tw(target, t, 0.14, { o: [0, 1] }, 'linear');
    cue(t + 0.05, 'tape');
  }
  function count(target, t, dur, to, ticks = 14) {
    tw(target, t, dur, { num: [0, to] }, 'outCubic');
    const n = Math.min(ticks, to);
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
  function shake(target, t, amp = 1.6) {
    tw(target, t, 0.08, { r: amp }, 'outQuad');
    tw(target, t + 0.08, 0.1, { r: -amp * 0.7 }, 'inOutSine');
    tw(target, t + 0.18, 0.2, { r: 0 }, 'outBack');
  }
  function tickChip(sel, t, note) {
    swipe(`${sel} .chip__fill`, t, 0.24, false);
    draw(`${sel} .chip__tick path`, t + 0.05, 0.2, 'outQuad', null);
    tw(sel, t, 0.3, { s: [1.15, 1] }, 'outBack');
    if (note !== null) cue(t, 'pop', { note });
  }

  // ── build generated bits ──
  const TICK_SVG = (cls = '') => `<svg class="${cls}" viewBox="0 0 28 28"><path pathLength="1" d="M5 15 L11 21 L23 7"/></svg>`;
  const chip = (id, label, learned, left, top, extra = '') =>
    `<div class="chip" id="${id}" style="left:${left}px;top:${top}px;${extra}">${learned ? `<i class="chip__fill"></i>${TICK_SVG('chip__tick')}` : ''}<span>${label}</span></div>`;

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

    // S4 spec chips: 2.1 to 2.5 learned; 2.6, 2.7 and 3.4 not yet
    const S4 = ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '3.4'];
    $('#s4-chips').innerHTML = S4.map((label, i) => chip(`s4-c${i}`, label, i < 5, 40 + (i % 5) * 140, 130 + Math.floor(i / 5) * 92)).join('');

    // S4 questions through the gate: [spec tags, shown?]
    const MINIS = [[['2.2'], 1, 4], [['2.7'], 0, 6], [['2.4', '3.4'], 0, 0], [['2.1'], 1, 2], [['2.5'], 1, 5]];
    $('#s4-minis').innerHTML = MINIS.map(([tags, ok, marks], i) => `<div class="card mini" id="s4-m${i}" style="left:1050px;top:416px;z-index:${5 + i}">
        <div style="display:flex;gap:10px">${tags.map((tag, k) => `<div class="chip"${k ? ' style="border-style:dashed;background:var(--surface-2)"' : ''}>${k ? '+ ' : ''}${tag}</div>`).join('')}</div>
        ${marks ? `<span class="mini__marks">${marks} marks</span>` : ''}
        <div class="mini__l" style="width:94%"></div><div class="mini__l" style="width:68%"></div>
        <div class="stamp ${ok ? 'stamp--yes' : 'stamp--no'}" id="s4-st${i}"><svg width="40" height="40" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${ok ? '<path d="M5 15 L11 21 L23 7"/>' : '<path d="M7 7 L21 21 M21 7 L7 21"/>'}</svg></div>
      </div>`).join('');

    // S6 Data Hub rows (example data)
    const ROWS = [['2.1', 'Motion graphs', 'g', 'Secure', 82, 'var(--good)'], ['2.2', 'Forces', 'g', 'Secure', 74, 'var(--good)'], ['2.3', 'Momentum', 'r', 'Needs work', 31, '#d9776a'], ['2.4', 'Projectiles', 'a', 'Developing', 58, '#e5b84a']];
    $('#s6-rows').innerHTML = ROWS.map(([code, name, rag, label, pct, colour], i) => `<div class="hubrow" id="s6-row${i}" style="top:${96 + i * 112}px">
        <div class="chip">${code}</div><div class="hubrow__name">${name}</div><div class="rag rag--${rag}" id="s6-rag${i}">${label}</div>
        <div class="track"><i id="s6-fill${i}" style="width:${pct}%;background:${colour}"></i></div><div class="hubrow__val" id="s6-val${i}" data-fmt="{}%">${pct}%</div></div>`).join('');
    $('#s6-hub').style.height = '560px';

    // S7 the teacher marks what's been taught; pupils who join get it ticked
    $('#s7-tchips').innerHTML = ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'].map((label, i) => chip(`s7-t${i}`, label, i < 5, 40 + (i % 5) * 136, 172 + Math.floor(i / 5) * 92)).join('');
    $('#s7-pupils').innerHTML = [0, 1, 2].map((p) => `<div class="card pupil" id="s7-p${p}" data-r="${[1.2, -0.8, 1][p]}" style="left:1140px;top:${300 + p * 215}px">
        <div style="font:800 26px/1 var(--font)">Pupil ${p + 1}</div>
        <div class="joined" id="s7-j${p}"><svg width="22" height="22" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15 L11 21 L23 7"/></svg>Joined 12P</div>
        ${['2.1', '2.2', '2.3', '2.4', '2.5'].map((label, i) => chip(`s7-p${p}c${i}`, label, true, 28 + i * 104, 96)).join('')}
      </div>`).join('');

    // S8 class heatmap (example data): G secure, A developing, R needs work
    const HEAT = ['GGARGA', 'GAGRAG', 'AGGRGG', 'GGAAGA', 'GAGRGG'];
    const COL = { G: 'var(--good)', A: '#e5b84a', R: '#d9776a' };
    let grid = ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6'].map((label, c) => `<div class="hm-col" id="s8-h${c}" style="left:${220 + c * 125}px;top:86px">${label}</div>`).join('');
    grid += HEAT.map((row, r) => `<div class="hm-row" id="s8-n${r}" style="left:40px;top:${152 + r * 78}px">Pupil ${r + 1}</div>` +
      [...row].map((g, c) => `<div class="hm-cell" id="s8-c${r}${c}" style="left:${220 + c * 125}px;top:${136 + r * 78}px;background:${COL[g]}"></div>`).join('')).join('');
    grid += '<div id="s8-col" style="position:absolute;left:595px;top:80px;width:110px;height:430px"></div>';
    $('#s8-grid').innerHTML = grid;

    // S8 what the terminal will do
    const TODO = ['Set work filtered to the spec', 'Class results by spec point', 'Build and print class tests', 'Track each student'];
    $('#s8-items').innerHTML = TODO.map((label, i) => `<div class="todo" id="s8-i${i}" style="top:${176 + i * 76}px"><span class="todo__box"><svg width="52" height="52" viewBox="0 0 28 28" fill="none"><path id="s8-k${i}" pathLength="1" d="M4 15 L11 22 L26 3" stroke="#b5534a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${label}</div>`).join('');

    $('#s3-title').style.transformOrigin = '50% 0';
    $('#s3-hi').style.zIndex = '-1';
  }

  // ── the timeline (times in beats from each scene's downbeat) ──
  function timeline() {
    // lens furniture: brand and chapter tabs
    tw('#brand', 0.3, 0.7, { x: [-60, 0] }, 'outBack');
    tw('#brand', 0.3, 0.2, { o: [0, 1] }, 'linear');
    tw('#brand', T[8] - 0.8, 0.4, { o: 0, y: -30 }, 'inQuad');
    const chapters = [['#c1', 0.4, T[2]], ['#c2', T[2], T[3]], ['#c3', T[3], T[4]], ['#c4', T[4], T[5]], ['#c5', T[5], T[6]], ['#c6', T[6], T[8]]];
    for (const [sel, tin, tout] of chapters) {
      tw(sel, tin + 0.1, 0.65, { y: [-120, 0], r: [-6, 0] }, 'outBack');
      tw(sel, tin + 0.1, 0.12, { o: [0, 1] }, 'linear');
      tw(sel, tout - 0.65, 0.35, { y: -120 }, 'inBack');
      tw(sel, tout - 0.45, 0.12, { o: 0 }, 'linear');
    }
    for (let i = 1; i < T.length; i++) cue(T[i] - LEAD, 'whoosh', { dur: PAN });

    // S1 the problem (3 bars)
    cardIn('#s1-card', at(0, 0.25), { r0: -14 });
    [['#s1-l1', 1.5], ['#s1-l2', 2.5], ['#s1-l3', 3.5]].forEach(([sel, b]) => {
      rise(sel, at(0, b), 30, 0.5);
      swipe(`${sel} .hi`, at(0, b) + 0.28);
    });
    rise('#s1-l4', at(0, 5), 30, 0.5);
    write('#s1-feels', at(0, 6), 0.8);
    draw('#s1-arrow', at(0, 6.25), 0.45, 'inOutSine', null);
    draw('#s1-strike', at(0, 7.5), 0.6, 'inOutSine');
    shake('#s1-card', at(0, 7.6));
    pop('#s1-isnt', at(0, 8.5), 7, 'outBackBig');
    src('#s1-src', at(0, 3));

    // S2 what students actually do (2 bars)
    rise('#s2-hl', at(1, 0.2));
    cardIn('#s2-a', at(1, 0.5), { r0: -12 });
    count('#s2-n1', at(1, 1), 1.4, 84);
    cardIn('#s2-b', at(1, 1.5), { r0: 12 });
    count('#s2-n2', at(1, 2), 0.9, 11);
    src('#s2-src', at(1, 2.25));
    pop('#s2-see', at(1, 3.25), 2);
    for (const [b, dx] of [[3.75, -7], [4.25, 7], [4.75, 0]]) tw('#s2-pl, #s2-pr', at(1, b), 0.2, { x: dx }, 'outCubic');
    draw('#s2-circle', at(1, 4.25), 0.6);
    write('#s2-right', at(1, 4.75), 0.7);

    // S3 active recall (3 bars): the beat drops here
    $$('#s3-title .w').forEach((w, k) => {
      const t = at(2, k * 0.5);
      tw(w, t, 0.55, { y: [60, 0], s: [0.6, 1] }, 'outBack');
      tw(w, t, 0.1, { o: [0, 1] }, 'linear');
      cue(t, 'pop', { note: k });
    });
    swipe('#s3-hi', at(2, 3.5), 0.45);
    write('#s3-sub', at(2, 4), 1.1);
    tw('#s3-title', at(2, 5.5), 0.8, { y: [0, -132], s: [1, 0.62] }, 'inOutCubic');
    cardIn('#s3-chart', at(2, 5.75), { from: 'bottom', r0: 6 });
    tw('#s3-base', at(2, 6.5), 0.45, { sx: [0, 1] }, 'outCubic');
    growBar('#s3-b1', '#s3-v1', at(2, 6.75), 0.9, 184, 40);
    growBar('#s3-b2', '#s3-v2', at(2, 7.5), 1.0, 281, 61);
    pop('#s3-more', at(2, 9), 9, 'outBackBig');
    src('#s3-src', at(2, 6.5));

    // S4 filtered to the spec (4 bars)
    rise('#s4-hl', at(3, 0.2));
    write('#s4-sub', at(3, 0.75), 1.0);
    cardIn('#s4-spec', at(3, 1), { r0: -9 });
    for (let i = 0; i < 5; i++) tickChip(`#s4-c${i}`, at(3, 2.5 + i * 0.5), i);
    pop('#s4-gate', at(3, 4.75), 0, 'outBack', null);
    write('#s4-gatelab', at(3, 5), 0.6);
    write('#s4-stacklab', at(3, 5.25), 0.6);
    src('#s4-src', at(3, 3));
    let kept = 0;
    [1, 0, 0, 1, 1].forEach((ok, i) => {
      const t = at(3, 5.5 + i * 1.5);
      const card = `#s4-m${i}`;
      tw(card, t, 0.45, { y: [-760, 0], r: [-8, 0] }, 'outBack');
      tw(card, t, 0.06, { o: [0, 1] }, 'linear');
      cue(t + 0.2, 'thud', { soft: 1 });
      pop(`#s4-st${i}`, t + 0.5, ok ? 6 : 0, 'outBackBig', ok ? 'chime' : 'buzz');
      if (ok) {
        tw(card, t + 0.85, 0.45, { x: 430, y: kept * 26 - 6, r: [0, kept % 2 ? 3 : -3] }, 'inOutCubic');
        cue(t + 0.85, 'slide');
        kept++;
      } else {
        tw(card, t + 0.85, 0.6, { y: 900, r: i === 1 ? 32 : -28, x: i === 1 ? 60 : -50 }, 'inBack');
        tw(card, t + 0.85, 0.18, { o: 0.55 }, 'linear');
        cue(t + 0.95, 'drop');
        write(i === 1 ? '#s4-not' : '#s4-wait', t + 0.9, 0.8);
      }
    });
    write('#s4-nosurp', at(3, 12.75), 0.8);

    // S5 real exam questions, real mark schemes (3 bars)
    rise('#s5-hl', at(4, 0.2));
    cardIn('#s5-q', at(4, 0.5), { from: 'left', r0: -8 });
    write('#s5-a1', at(4, 1.75), 0.7);
    write('#s5-a2', at(4, 2.75), 0.7);
    write('#s5-a3', at(4, 3.75), 0.45);
    src('#s5-src', at(4, 2.5));
    cardIn('#s5-ms', at(4, 4), { from: 'right', r0: 10 });
    ['#s5-r1', '#s5-r2', '#s5-r3'].forEach((sel, i) => rise(sel, at(4, 4.75 + i * 0.25), 24, 0.5));
    draw('#s5-t1', at(4, 5.75), 0.2, 'outQuad', null); cue(at(4, 5.75), 'chime', { note: 0 });
    draw('#s5-t2', at(4, 6.25), 0.2, 'outQuad', null); cue(at(4, 6.25), 'chime', { note: 2 });
    draw('#s5-x3', at(4, 6.75), 0.25, 'outQuad', null); cue(at(4, 6.75), 'buzz');
    pop('#s5-score', at(4, 7.25), 4, 'outBackBig');
    draw('#s5-ring', at(4, 7.4), 0.55);
    draw('#s5-under', at(4, 8), 0.35, 'outQuad', null);
    write('#s5-redo', at(4, 8.1), 0.7);
    write('#s5-gap', at(4, 8.75), 0.9);

    // S6 Data Hub by spec point (2 bars)
    rise('#s6-hl', at(5, 0.2));
    cardIn('#s6-hub', at(5, 0.4), { r0: -7 });
    for (let i = 0; i < 4; i++) {
      const t = at(5, 1.1 + i * 0.4);
      rise(`#s6-row${i}`, t, 24, 0.45);
      tw(`#s6-fill${i}`, t + 0.15, 0.7, { sx: [0, 1] }, 'outCubic');
      count(`#s6-val${i}`, t + 0.15, 0.7, [82, 74, 31, 58][i], 5);
      pop(`#s6-rag${i}`, t + 0.5, null, 'outBack', null);
    }
    ringAround('#s6-ring', '#s6-row2', -12, 4);
    draw('#s6-ring', at(5, 3.1), 0.55);
    write('#s6-then', at(5, 3.6), 0.8);
    pop('#s6-btn', at(5, 4.4), 8, 'outBackBig');
    tw('#s6-btn', at(5, 5.4), 0.08, { press: 1, x: 5, y: 5 }, 'outQuad');
    tw('#s6-btn', at(5, 5.4) + 0.09, 0.2, { press: 0, x: 0, y: 0 }, 'outBack');
    cue(at(5, 5.4), 'click');

    // S7 teacher terminal: the class sets the spec (3 bars). Music lifts here.
    rise('#s7-hl', at(6, 0.2));
    tw('#s7-soon', at(6, 0.75), 0.45, { s: [2.6, 1], r: [-16, 0] }, 'inCubic');
    tw('#s7-soon', at(6, 0.75), 0.1, { o: [0, 1] }, 'linear');
    cue(at(6, 0.75) + 0.45, 'stamp', { soft: 1 });
    write('#s7-sub', at(6, 1.25), 0.9);
    cardIn('#s7-teacher', at(6, 1.5), { from: 'left', r0: -8 });
    for (let i = 0; i < 5; i++) tickChip(`#s7-t${i}`, at(6, 3 + i * 0.5), i);
    for (let p = 0; p < 3; p++) {
      cardIn(`#s7-p${p}`, at(6, 3.5 + p * 0.25), { from: 'right', r0: 8, sound: p === 0 ? 'thud' : null });
      draw(`#s7-a${p}`, at(6, 5.5 + p * 0.2), 0.5, 'inOutSine', p === 0 ? 'scribble' : null);
      pop(`#s7-j${p}`, at(6, 6.25 + p * 0.25), 4 + p, 'outBackBig', 'chime');
      for (let i = 0; i < 5; i++) tickChip(`#s7-p${p}c${i}`, at(6, 7 + i * 0.25 + p * 0.12), p === 0 ? 5 + i : null);
    }
    write('#s7-tick', at(6, 8.75), 1.1);

    // S8 teacher terminal: the whole class by spec point (3 bars)
    rise('#s8-hl', at(7, 0.2));
    cardIn('#s8-heat', at(7, 0.5), { from: 'left', r0: -8 });
    for (let c = 0; c < 6; c++) rise(`#s8-h${c}`, at(7, 1.25) + c * 0.05, 20, 0.4);
    for (let r = 0; r < 5; r++) rise(`#s8-n${r}`, at(7, 1.25) + r * 0.05, 20, 0.4);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 6; c++) {
        const t = at(7, 1.75 + (r + c) * 0.18);
        tw(`#s8-c${r}${c}`, t, 0.4, { s: [0.2, 1] }, 'outBack');
        tw(`#s8-c${r}${c}`, t, 0.08, { o: [0, 1] }, 'linear');
        if (c === 0) cue(t, 'flick', { k: r });
      }
    }
    ringAround('#s8-ring', '#s8-col', 22, 26);
    draw('#s8-ring', at(7, 4), 0.6);
    write('#s8-stuck', at(7, 4.5), 1.0);
    cardIn('#s8-list', at(7, 5.25), { from: 'right', r0: 10 });
    for (let i = 0; i < 4; i++) {
      rise(`#s8-i${i}`, at(7, 6 + i * 0.25), 20, 0.45);
      draw(`#s8-k${i}`, at(7, 6.75 + i * 0.5), 0.22, 'outQuad', null);
      cue(at(7, 6.75 + i * 0.5), 'pop', { note: 3 + i });
    }

    // S9 numbers + logo (3 bars). The stamp lands on bar 24.
    [['#s9-st0', '#s9-n0', 38], ['#s9-st1', '#s9-n1', 838], ['#s9-st2', '#s9-n2', 1097]].forEach(([card, num, to], i) => {
      cardIn(card, at(8, 0.25 + i * 0.25), { r0: [-10, 8, -6][i], sound: i === 0 ? 'thud' : null });
      count(num, at(8, 0.75), 1.6, to, i === 0 ? 14 : 0);
    });
    const stamp = MUSIC.stampBar * BAR;
    tw('#s9-mark', stamp - 0.34, 0.34, { s: [3.2, 1], r: [-28, -4] }, 'inCubic');
    tw('#s9-mark', stamp - 0.34, 0.06, { o: [0, 1] }, 'linear');
    tw('#s9-mark', stamp, 0.4, { sx: [1.12, 1], sy: [0.88, 1] }, 'outBack');
    cue(stamp, 'stamp');
    tw('#s9-word', stamp + 0.15, 0.7, { clip: [0, 1] }, 'outCubic');
    tw('#s9-word', stamp + 0.15, 0.01, { o: [0, 1] }, 'linear');
    rise('#s9-tag', stamp + BEAT);
    pop('#s9-url', stamp + BEAT * 1.75, 7, 'outBack');
    write('#s9-luck', stamp + BEAT * 2.5, 1.0);

    // S10 sources (2 bars)
    cardIn('#s10-card', at(9, 0.1), { from: 'bottom', r0: 5, sound: null });
    $$('#s10-list li').forEach((li, i) => rise(li, at(9, 0.6 + i * 0.2), 26, 0.55));
    rise('#s10-foot', at(9, 2), 20, 0.55);
  }

  // ── seek / preview ──
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
    ringAround('#s2-circle', '#s2-b', 70, 70);
    ringAround('#s5-ring', '#s5-score', 20, 6);
    timeline();
    finalize();
    seek(0);
    return true;
  });

  window.PROMO = { duration: DURATION, fps: FPS, bpm: BPM, sceneStarts: T, music: MUSIC, cues: CUES, seek, ready };

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
