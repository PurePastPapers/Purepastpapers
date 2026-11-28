// PurePastPapers explainer (v3 draft): a tiny deterministic tween engine and the full timeline.
// PROMO.seek(t) draws the frame at t seconds. Nothing depends on wall-clock time, so render.mjs
// can capture any frame in any order. PROMO.cues lists the sound effects and PROMO.music the song
// structure for music.py, so picture and sound come from one timeline.
// Everything is written in beats from each scene's downbeat. PROMO.audit() simulates a viewer
// reading each scene's text in order and reports how much time is left over.
(() => {
  'use strict';

  const BPM = 72;
  const BEAT = 60 / BPM; // 0.833 s
  const BAR = BEAT * 4; // 3.333 s
  const FPS = 60;
  // Scene lengths in bars (the audit says whether each leaves enough time to read).
  //            s1 s2 s3 s4 s5 s6 s7 s8 s8b s9 s10
  const LEN = [6, 7, 7, 7, 6, 7, 7, 6, 6, 4, 4];
  const STARTS_BARS = LEN.reduce((acc, len, i) => (acc.push(i ? acc[i - 1] + LEN[i - 1] : 0), acc), []);
  const BARS = LEN.reduce((a, b) => a + b, 0);
  const DURATION = BARS * BAR;
  const T = STARTS_BARS.map((bars) => bars * BAR);
  const MUSIC = {
    bpm: BPM, bars: BARS,
    dropBar: STARTS_BARS[1], // "Remove the friction. Keep the difficulty."
    breakBar: STARTS_BARS[7] - 1, liftBar: STARTS_BARS[7], liftEndBar: STARTS_BARS[9], // teacher terminal
    stampBar: STARTS_BARS[9] + 1, // logo stamp
    hookBars: [STARTS_BARS[3], STARTS_BARS[5] + 1],
  };
  const at = (scene, beats) => T[scene] + beats * BEAT;

  // Scene positions on one big desk (top-left of each 1920x1080 frame).
  const SCN = [
    [0, 0], [2350, 260], [4500, 1700], [6850, 1500], [8900, 120], [11200, 500],
    [13300, 1850], [15650, 1550], [17800, 300], [20000, 1400], [20000, 2700],
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
  const tracks = new Map();
  const CUES = [];
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
    z *= 1 + 0.1 * (1 - E.outCubic(Math.min(1, t / 3.5)));
    cx += Math.sin(t * 0.5) * 3;
    cy += Math.cos(t * 0.4) * 2;
    r += Math.sin(t * 0.27) * 0.1;
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

    // S3: the spec card and the two questions it finds
    $('#s3-chips').innerHTML = ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'].map((l, i) => chip(`s3-c${i}`, l, i < 5, 40 + (i % 5) * 136, 126 + Math.floor(i / 5) * 92)).join('');
    $('#s3-minis').innerHTML = miniCard('s3-m0', ['2.2'], 4, '', 1010, 650, 5) + miniCard('s3-m1', ['2.4'], 3, '', 1350, 660, 6);

    // S4: questions pass through the "all learned?" gate
    $('#s4-chips').innerHTML = ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '3.4'].map((l, i) => chip(`s4-c${i}`, l, i < 5 || i === 7, 40 + (i % 5) * 140, 126 + Math.floor(i / 5) * 92)).join('');
    $('#s4-minis').innerHTML =
      miniCard('s4-m0', ['2.2'], 4, stamp('s4-st0', 'yes'), 1050, 376, 5) +
      miniCard('s4-m1', ['2.7'], 6, stamp('s4-st1', 'no'), 1050, 376, 6) +
      miniCard('s4-m2', ['2.4', '3.4'], 5, stamp('s4-st2w', 'wait') + stamp('s4-st2y', 'yes'), 1050, 376, 7);

    // S7: Data Hub rows (example data)
    const ROWS = [['2.1', 'Motion graphs', 'g', 'Secure', 82, 'var(--good)'], ['2.2', 'Forces', 'g', 'Secure', 74, 'var(--good)'], ['2.3', 'Momentum', 'r', 'Needs work', 31, '#d9776a'], ['2.4', 'Projectiles', 'a', 'Developing', 58, '#e5b84a']];
    $('#s7-rows').innerHTML = ROWS.map(([code, name, rag, label, pct, colour], i) => `<div class="hubrow" id="s7-row${i}" style="top:${110 + i * 112}px">
        <div class="chip">${code}</div><div class="hubrow__name">${name}</div><div class="rag rag--${rag}" id="s7-rag${i}">${label}</div>
        <div class="track"><i id="s7-fill${i}" style="width:${pct}%;background:${colour}"></i></div><div class="hubrow__val" id="s7-val${i}" data-fmt="{}%">${pct}%</div></div>`).join('');

    // S8: the teacher marks what's been taught; pupils who join get it ticked
    $('#s8-tchips').innerHTML = ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'].map((l, i) => chip(`s8-t${i}`, l, i < 5, 40 + (i % 5) * 136, 172 + Math.floor(i / 5) * 92)).join('');
    $('#s8-pupils').innerHTML = [0, 1, 2].map((p) => `<div class="card pupil" id="s8-p${p}" data-r="${[1.2, -0.8, 1][p]}" style="left:1140px;top:${330 + p * 215}px">
        <div style="font:800 26px/1 var(--font)">Pupil ${p + 1}</div>
        <div class="joined" id="s8-j${p}"><svg width="22" height="22" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15 L11 21 L23 7"/></svg>Joined 12P</div>
        ${['2.1', '2.2', '2.3', '2.4', '2.5'].map((l, i) => chip(`s8-p${p}c${i}`, l, true, 28 + i * 104, 96)).join('')}
      </div>`).join('');

    // S8b: class heat map (example data)
    const HEAT = ['GGARGA', 'GAGRAG', 'AGGRGG', 'GGAAGA', 'GAGRGG'];
    const COL = { G: 'var(--good)', A: '#e5b84a', R: '#d9776a' };
    let grid = ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6'].map((l, c) => `<div class="hm-col" id="s8-h${c}" style="left:${220 + c * 125}px;top:86px">${l}</div>`).join('');
    grid += HEAT.map((row, r) => `<div class="hm-row" id="s8-n${r}" style="left:40px;top:${152 + r * 78}px">Pupil ${r + 1}</div>` +
      [...row].map((g, c) => `<div class="hm-cell" id="s8-c${r}${c}" style="left:${220 + c * 125}px;top:${136 + r * 78}px;background:${COL[g]}"></div>`).join('')).join('');
    grid += '<div id="s8-col" style="position:absolute;left:595px;top:80px;width:110px;height:430px"></div>';
    $('#s8-grid').innerHTML = grid;
    const TODO = ['Set spec-filtered work', 'Class results by spec point', 'Printable class tests', 'Track each student'];
    $('#s8-items').innerHTML = TODO.map((label, i) => `<div class="todo" id="s8-i${i}" style="top:${176 + i * 84}px"><span class="todo__box"><svg width="52" height="52" viewBox="0 0 28 28" fill="none"><path id="s8-k${i}" pathLength="1" d="M4 15 L11 22 L26 3" stroke="#b5534a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${label}</div>`).join('');

    // S9: recap
    const RECAP = [['Find', 'the spec filter'], ['Start', 'no account'], ['Check', 'the mark scheme'], ['Decide', 'the Data Hub']];
    $('#s9-recap').innerHTML = RECAP.map(([a, b], i) => {
      const left = 190 + (i % 2) * 790, top = 130 + Math.floor(i / 2) * 120;
      return `<div class="card" id="s9-r${i}" data-r="${[-1.2, 1, -0.8, 1.2][i]}" style="left:${left}px;top:${top}px;width:720px;height:96px;display:flex;align-items:center;gap:22px;padding:0 28px">
        <span style="position:relative;width:46px;height:46px;border:3px solid var(--ink);border-radius:8px;flex:none"><svg style="position:absolute;left:-4px;top:-12px;overflow:visible" width="56" height="56" viewBox="0 0 28 28" fill="none"><path id="s9-k${i}" pathLength="1" d="M4 15 L11 22 L26 3" stroke="#b5534a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span style="font:800 32px/1.1 var(--font)">${a}: <span style="font-weight:700;color:var(--ink-2)">${b}</span></span></div>`;
    }).join('');

    Object.assign($('#s5-ripple').style, { left: '700px', top: '540px' });
    $('#s3-title') && ($('#s3-title').style.transformOrigin = '50% 0');
  }

  // ── the timeline (beats from each scene's downbeat) ──
  function timeline() {
    // lens furniture: brand and chapter tabs
    tw('#brand', 0.3, 0.8, { x: [-60, 0] }, 'outBack');
    tw('#brand', 0.3, 0.2, { o: [0, 1] }, 'linear');
    tw('#brand', T[9] - 1.0, 0.5, { o: 0, y: -30 }, 'inQuad');
    const chapters = [['#c1', 0.4, T[1]], ['#c2', T[1], T[2]], ['#c3', T[2], T[4]], ['#c4', T[4], T[5]], ['#c5', T[5], T[6]], ['#c6', T[6], T[7]], ['#c7', T[7], T[9]]];
    for (const [sel, tin, tout] of chapters) {
      tw(sel, tin + 0.1, 0.8, { y: [-120, 0], r: [-6, 0] }, 'outBack');
      tw(sel, tin + 0.1, 0.14, { o: [0, 1] }, 'linear');
      tw(sel, tout - 0.8, 0.4, { y: -120 }, 'inBack');
      tw(sel, tout - 0.55, 0.14, { o: 0 }, 'linear');
    }
    for (let i = 1; i < T.length; i++) cue(T[i] - LEAD, 'whoosh', { dur: PAN });

    // S1 (idx 0): why do most students re-read?
    {
      const S = 0, a = (b) => at(S, b);
      rise('#s1-hl', a(0.25)); read(S, '#s1-hl', a(0.25));
      cardIn('#s1-a', a(1.25), { r0: -12 });
      rise('#s1-a-t', a(2.5), 24); read(S, '#s1-a-t', a(2.5));
      count('#s1-n1', a(3), 1.6, 84); read(S, '#s1-n1', a(3), 2);
      rise('#s1-a-l1', a(4.25), 24); read(S, '#s1-a-l1', a(4.25));
      rise('#s1-a-l2', a(5.25), 24); read(S, '#s1-a-l2', a(5.25));
      rise('#s1-a-m', a(6.5), 24); read(S, '#s1-a-m', a(6.5)); growMeter('#s1-m1', a(6.9), 1.0);
      rise('#s1-a-c', a(7.75), 20); read(S, '#s1-a-c', a(7.75), 0.2);
      cardIn('#s1-b', a(9), { r0: 12 });
      rise('#s1-b-t', a(10.25), 24); read(S, '#s1-b-t', a(10.25));
      count('#s1-n2', a(10.75), 1.6, 61); read(S, '#s1-n2', a(10.75), 2);
      rise('#s1-b-l1', a(12.25), 24); read(S, '#s1-b-l1', a(12.25));
      rise('#s1-b-l2', a(13.75), 24); read(S, '#s1-b-l2', a(13.75));
      rise('#s1-b-m', a(15), 24); read(S, '#s1-b-m', a(15)); growMeter('#s1-m2', a(15.4), 1.2);
      rise('#s1-b-c', a(16.25), 20); read(S, '#s1-b-c', a(16.25), 0.2);
      rise('#s1-b-c2', a(16.75), 20); read(S, '#s1-b-c2', a(16.75), 0.2);
      write('#s1-note', a(17.5), 1.6); read(S, '#s1-note', a(17.5));
    }

    // S2 (idx 1): the idea
    {
      const S = 1, a = (b) => at(S, b);
      rise('#s2-hl', a(0.25)); read(S, '#s2-hl', a(0.25));
      draw('#s2-path', a(1), 3.2, 'inOutSine', null);
      [0, 1, 2, 3, 4].forEach((k) => {
        pop(`#s2-st${k}`, a(1.5 + k * 1.0), k, 'outBack'); read(S, `#s2-st${k}`, a(1.5 + k * 1.0), 0.8);
        pop(`#s2-ft${k}`, a(2.0 + k * 1.0), null, 'outBack', null); read(S, `#s2-ft${k}`, a(2.0 + k * 1.0), 0.5);
      });
      // the friction tags peel off and fall, one by one; the difficulty tag stays
      [0, 1, 3, 4].forEach((k, n) => {
        const t = a(8 + n * 0.7);
        tw(`#s2-ft${k}`, t, 0.9, { y: 620, r: (n % 2 ? 1 : -1) * 28 }, 'inBack');
        tw(`#s2-ft${k}`, t + 0.5, 0.4, { o: 0 }, 'linear');
        cue(t + 0.5, 'drop');
      });
      tw('#s2-st2', a(9), 0.6, { s: 1.08 }, 'outQuad'); tw('#s2-st2', a(9.7), 0.5, { s: 1 }, 'outBack');
      cardIn('#s2-fogg', a(11), { r0: -8 });
      rise('#s2-fogg p', a(12.25), 20); read(S, '#s2-fogg p', a(12.25));
      rise('#s2-fogg .cite', a(15), 16); read(S, '#s2-fogg .cite', a(15), 0.2);
      cardIn('#s2-bjork', a(17), { r0: 8 });
      rise('#s2-bjork p', a(18.25), 20); read(S, '#s2-bjork p', a(18.25));
      rise('#s2-bjork .cite', a(21), 16); read(S, '#s2-bjork .cite', a(21), 0.2);
      write('#s2-note', a(22.5), 1.4); read(S, '#s2-note', a(22.5), 0.8);
    }

    // S3 (idx 2): friction 1, finding questions
    {
      const S = 2, a = (b) => at(S, b);
      rise('#s3-hl', a(0.25)); read(S, '#s3-hl', a(0.25));
      [0, 1, 2, 3, 4, 5].forEach((k) => {
        tw(`#s3-p${k}`, a(1 + k * 0.4), 0.9, { y: [-700, 0], r: [(k % 2 ? 1 : -1) * 14, (k % 3 - 1) * 4] }, 'outBack');
        tw(`#s3-p${k}`, a(1 + k * 0.4), 0.12, { o: [0, 1] }, 'linear');
        cue(a(1 + k * 0.4) + 0.4, 'thud', { soft: 1 });
      });
      read(S, '#s3-pile', a(1), 0.3);
      tw('#s3-lens', a(3.25), 0.5, { o: [0, 1] }, 'linear');
      [[40, 60], [260, 20], [420, 120], [300, 260], [100, 250], [30, 150]].forEach(([x, y], n) => tw('#s3-lens', a(3.5 + n * 0.85), 0.8, { x, y }, 'inOutCubic'));
      cue(a(3.5), 'swipe', { dur: 4.6 });
      write('#s3-q', a(4.25), 1.6); read(S, '#s3-q', a(4.25));
      tw('#s3-lens', a(8.6), 0.5, { o: 0 }, 'linear');
      tw('#s3-pile', a(8.6), 1.2, { o: 0.28, x: -20, y: 10, s: 0.96 }, 'inOutCubic');
      cardIn('#s3-spec', a(9.25), { r0: -9 }); read(S, '#s3-spec .serif', a(10), 0.6);
      for (let i = 0; i < 5; i++) tickChip(`#s3-c${i}`, a(10.75 + i * 0.45), i);
      read(S, '#s3-chips', a(10.75), 0.7);
      draw('#s3-arrow', a(13.25), 0.6, 'inOutSine', null);
      cardIn('#s3-m0', a(13.75), { from: 'top', r0: -6, dist: 500, sound: 'thud' });
      cardIn('#s3-m1', a(14.5), { from: 'top', r0: 6, dist: 500, sound: 'thud' });
      write('#s3-only', a(15.25), 1.2); read(S, '#s3-only', a(15.25));
      cardIn('#s3-sci', a(16.5), { from: 'bottom', r0: 5, dist: 500 });
      rise('#s3-sci p', a(17.5), 20); read(S, '#s3-sci p', a(17.5));
      rise('#s3-sci .cite', a(19.25), 16); read(S, '#s3-sci .cite', a(19.25), 0.2);
    }

    // S4 (idx 3): only what you've learned
    {
      const S = 3, a = (b) => at(S, b);
      rise('#s4-hl', a(0.25)); read(S, '#s4-hl', a(0.25));
      cardIn('#s4-spec', a(1), { r0: -9 }); read(S, '#s4-spec .serif', a(2), 0.6);
      for (let i = 0; i < 5; i++) tickChip(`#s4-c${i}`, a(2.5 + i * 0.45), i);
      read(S, '#s4-chips', a(2.5), 0.8);
      pop('#s4-gate', a(5), 0, 'outBack', null);
      write('#s4-stacklab', a(5.25), 0.9); read(S, '#s4-stacklab', a(5.25));
      let kept = 0;
      const pass = (id, t) => { tw(id, t, 0.6, { x: 430, y: kept * 26 - 6, r: [0, kept % 2 ? 3 : -3] }, 'inOutCubic'); cue(t, 'slide'); kept++; };
      const drop = (id, t) => { tw(id, t, 0.55, { y: [-760, 0], r: [-8, 0] }, 'outBack'); tw(id, t, 0.06, { o: [0, 1] }, 'linear'); cue(t + 0.25, 'thud', { soft: 1 }); return t + 0.6; };
      let t = drop('#s4-m0', a(6));
      pop('#s4-st0', t, 6, 'outBackBig', 'chime'); pass('#s4-m0', t + 1.0);
      t = drop('#s4-m1', a(8.5));
      pop('#s4-st1', t, 0, 'outBackBig', 'buzz');
      tw('#s4-m1', t + 1.2, 0.7, { y: 900, r: 30, x: 60 }, 'inBack'); tw('#s4-m1', t + 1.2, 0.2, { o: 0.5 }, 'linear'); cue(t + 1.4, 'drop');
      write('#s4-not', t + 1.0, 1.4); read(S, '#s4-not', t + 1.0);
      t = drop('#s4-m2', a(11));
      pop('#s4-st2w', t, 3, 'outBackBig', 'pop');
      tw('#s4-st2y', a(1), 0.01, { o: 0 }, 'linear');
      write('#s4-wait', t + 1.0, 1.6); read(S, '#s4-wait', t + 1.0);
      const tk = a(14.5);
      tickChip('#s4-c7', tk, 7);
      tw('#s4-st2w', tk + 0.8, 0.3, { o: 0 }, 'linear');
      pop('#s4-st2y', tk + 1.0, 6, 'outBackBig', 'chime');
      pass('#s4-m2', tk + 2.0);
      write('#s4-now', tk + 1.0, 1.2); read(S, '#s4-now', tk + 1.0);
      cardIn('#s4-sci', a(17.5), { from: 'bottom', r0: 5, dist: 500 });
      rise('#s4-sci p', a(18.5), 20); read(S, '#s4-sci p', a(18.5));
      rise('#s4-sci .cite', a(20), 16); read(S, '#s4-sci .cite', a(20), 0.2);
    }

    // S5 (idx 4): friction 2, getting started
    {
      const S = 4, a = (b) => at(S, b);
      rise('#s5-hl', a(0.25)); read(S, '#s5-hl', a(0.25));
      cardIn('#s5-site', a(1.25), { r0: -8 }); read(S, '#s5-site .serif', a(2.5), 0.5);
      pop('#s5-b1', a(3.5), 5, 'outBack'); pop('#s5-b2', a(4.0), 7, 'outBack'); read(S, '#s5-b1', a(3.5), 0.6); read(S, '#s5-b2', a(4.0), 0.6);
      rise('#s5-nolog', a(5), 16); read(S, '#s5-nolog', a(5));
      tw('#s5-cursor', a(7.5), 0.9, { x: [1000, 640], y: [1150, 560] }, 'outCubic'); tw('#s5-cursor', a(7.5), 0.1, { o: [0, 1] }, 'linear');
      click('#s5-cursor', '#s5-ripple', a(9));
      cardIn('#s5-q', a(9.4), { from: 'right', r0: 10, dist: 800 }); read(S, '#s5-q', a(10.2), 0.6);
      tw('#s5-cursor', a(10.5), 0.8, { x: 900, y: 1200 }, 'inCubic');
      write('#s5-one', a(11.5), 1.6); read(S, '#s5-one', a(11.5));
      cardIn('#s5-sci', a(14), { from: 'bottom', r0: 5, dist: 500 });
      rise('#s5-sci p', a(15.25), 20); read(S, '#s5-sci p', a(15.25));
      rise('#s5-sci .cite', a(17), 16); read(S, '#s5-sci .cite', a(17), 0.2);
    }

    // S6 (idx 5): friction 3, checking
    {
      const S = 5, a = (b) => at(S, b);
      rise('#s6-hl', a(0.25)); read(S, '#s6-hl', a(0.25));
      cardIn('#s6-q', a(1), { from: 'left', r0: -8 }); read(S, '#s6-q .abs:nth-of-type(3)', a(2), 0.8);
      write('#s6-a1', a(3), 1.4); read(S, '#s6-a1', a(3));
      write('#s6-a2', a(4.5), 1.0); read(S, '#s6-a2', a(4.5));
      pop('#s6-b1', a(6), 5, 'outBack'); pop('#s6-b2', a(6.5), 7, 'outBack'); read(S, '#s6-b1', a(6), 0.6); read(S, '#s6-b2', a(6.5), 0.6);
      cardIn('#s6-ms', a(7.5), { from: 'right', r0: 10 });
      rise('#s6-r1', a(8.6), 24); read(S, '#s6-r1', a(8.6), 0.8);
      rise('#s6-r2', a(9.4), 24); read(S, '#s6-r2', a(9.4), 0.8);
      draw('#s6-x1', a(10.4), 0.3, 'outQuad', null); cue(a(10.4), 'buzz');
      draw('#s6-x2', a(11), 0.3, 'outQuad', null); cue(a(11), 'buzz');
      pop('#s6-score', a(11.6), 4, 'outBackBig'); read(S, '#s6-score', a(11.6), 1);
      draw('#s6-ring', a(11.85), 0.7);
      write('#s6-redo', a(12.8), 1.4); read(S, '#s6-redo', a(12.8));
      write('#s6-gap', a(14.4), 1.2); read(S, '#s6-gap', a(14.4));
      write('#s6-exam', a(16), 1.2); read(S, '#s6-exam', a(16));
      cardIn('#s6-sci', a(17.5), { from: 'bottom', r0: 5, dist: 500 });
      rise('#s6-sci p', a(18.6), 20); read(S, '#s6-sci p', a(18.6));
      rise('#s6-sci .cite', a(20.2), 16); read(S, '#s6-sci .cite', a(20.2), 0.2);
    }

    // S7 (idx 6): friction 4, knowing what's next
    {
      const S = 6, a = (b) => at(S, b);
      rise('#s7-hl', a(0.25)); read(S, '#s7-hl', a(0.25));
      cardIn('#s7-hub', a(1.25), { r0: -7 }); read(S, '#s7-hub .label', a(2.25), 0.6);
      for (let i = 0; i < 4; i++) {
        const t = a(3.5 + i * 1.25);
        rise(`#s7-row${i}`, t, 24, 0.7);
        tw(`#s7-fill${i}`, t + 0.25, 0.9, { sx: [0, 1] }, 'outCubic');
        count(`#s7-val${i}`, t + 0.25, 0.9, [82, 74, 31, 58][i], 5);
        pop(`#s7-rag${i}`, t + 0.7, null, 'outBack', null);
        read(S, `#s7-row${i}`, t, 0.7);
      }
      ringAround('#s7-ring', '#s7-row2', -12, 4);
      draw('#s7-ring', a(9.25), 0.8);
      write('#s7-then', a(10.5), 1.8); read(S, '#s7-then', a(10.5));
      pop('#s7-btn', a(13.25), 8, 'outBackBig');
      tw('#s7-btn', a(15), 0.1, { press: 1, x: 5, y: 5 }, 'outQuad'); tw('#s7-btn', a(15) + 0.11, 0.25, { press: 0, x: 0, y: 0 }, 'outBack'); cue(a(15), 'click');
      cardIn('#s7-sci', a(16.5), { from: 'bottom', r0: 5, dist: 500 });
      rise('#s7-sci p', a(17.75), 20); read(S, '#s7-sci p', a(17.75));
      rise('#s7-sci .cite', a(20), 16); read(S, '#s7-sci .cite', a(20), 0.2);
      write('#s7-fact', a(21.25), 1.4); read(S, '#s7-fact', a(21.25));
    }

    // S8 (idx 7): teacher terminal, the class sets the spec. Music lifts here.
    {
      const S = 7, a = (b) => at(S, b);
      rise('#s8-hl', a(0.25)); read(S, '#s8-hl', a(0.25));
      tw('#s8-soon', a(1.5), 0.55, { s: [2.6, 1], r: [-16, 0] }, 'inCubic'); tw('#s8-soon', a(1.5), 0.1, { o: [0, 1] }, 'linear'); cue(a(1.5) + 0.55, 'stamp', { soft: 1 }); read(S, '#s8-soon', a(1.5));
      write('#s8-sub', a(3), 1.6); read(S, '#s8-sub', a(3));
      cardIn('#s8-teacher', a(5), { from: 'left', r0: -8 }); read(S, '#s8-teacher .serif', a(6), 0.6);
      for (let i = 0; i < 5; i++) tickChip(`#s8-t${i}`, a(7 + i * 0.6), i);
      read(S, '#s8-tchips', a(7), 0.6);
      for (let p = 0; p < 3; p++) {
        cardIn(`#s8-p${p}`, a(11 + p * 0.5), { from: 'right', r0: 8, sound: p === 0 ? 'thud' : null });
        draw(`#s8-a${p}`, a(13 + p * 0.4), 0.7, 'inOutSine', p === 0 ? 'scribble' : null);
        pop(`#s8-j${p}`, a(14.5 + p * 0.5), 4 + p, 'outBackBig', 'chime');
        for (let i = 0; i < 5; i++) tickChip(`#s8-p${p}c${i}`, a(16 + i * 0.3 + p * 0.15), p === 0 ? 5 + i : null);
      }
      read(S, '#s8-pupils', a(11), 0.3);
      write('#s8-tick', a(18), 2.0); read(S, '#s8-tick', a(18));
    }

    // S8b (idx 8): teacher terminal, the whole class at a glance
    {
      const S = 8, a = (b) => at(S, b);
      rise('#s8b-hl', a(0.25)); read(S, '#s8b-hl', a(0.25));
      cardIn('#s8-heat', a(1), { from: 'left', r0: -8 }); read(S, '#s8-heat .label', a(2), 0.6);
      for (let c = 0; c < 6; c++) rise(`#s8-h${c}`, a(2.5) + c * 0.06, 20, 0.5);
      for (let r = 0; r < 5; r++) rise(`#s8-n${r}`, a(2.5) + r * 0.06, 20, 0.5);
      read(S, '#s8-grid', a(2.5), 0.12);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
        const t = a(3.25 + (r + c) * 0.22);
        tw(`#s8-c${r}${c}`, t, 0.5, { s: [0.2, 1] }, 'outBack'); tw(`#s8-c${r}${c}`, t, 0.1, { o: [0, 1] }, 'linear');
        if (c === 0) cue(t, 'flick', { k: r });
      }
      ringAround('#s8-ring', '#s8-col', 22, 26);
      draw('#s8-ring', a(7), 0.8);
      write('#s8-stuck', a(8), 1.6); read(S, '#s8-stuck', a(8));
      cardIn('#s8-list', a(9.5), { from: 'right', r0: 10 }); read(S, '#s8-list .serif', a(10.5), 0.6); read(S, '#s8-list .soon', a(11), 0.6);
      for (let i = 0; i < 4; i++) {
        rise(`#s8-i${i}`, a(11.5 + i * 1.0), 20, 0.6); read(S, `#s8-i${i}`, a(11.5 + i * 1.0));
        draw(`#s8-k${i}`, a(12.25 + i * 1.0), 0.3, 'outQuad', null);
        cue(a(12.25 + i * 1.0), 'pop', { note: 3 + i });
      }
    }

    // S9 (idx 9): recap, then the logo stamps in on bar 2
    {
      const S = 9, a = (b) => at(S, b);
      for (let i = 0; i < 4; i++) {
        pop(`#s9-r${i}`, a(0.5 + i * 0.9), null, 'outBack', null); read(S, `#s9-r${i}`, a(0.5 + i * 0.9), 0.5);
        draw(`#s9-k${i}`, a(1.0 + i * 0.9), 0.3, 'outQuad', null); cue(a(1.0 + i * 0.9), 'pop', { note: i + 2 });
      }
      const stampAt = MUSIC.stampBar * BAR;
      tw('#s9-mark', stampAt - 0.4, 0.4, { s: [3.2, 1], r: [-28, -4] }, 'inCubic');
      tw('#s9-mark', stampAt - 0.4, 0.06, { o: [0, 1] }, 'linear');
      tw('#s9-mark', stampAt, 0.45, { sx: [1.12, 1], sy: [0.88, 1] }, 'outBack');
      cue(stampAt, 'stamp');
      tw('#s9-word', stampAt + 0.2, 0.8, { clip: [0, 1] }, 'outCubic'); tw('#s9-word', stampAt + 0.2, 0.01, { o: [0, 1] }, 'linear'); read(S, '#s9-word', stampAt + 0.2, 0.7);
      rise('#s9-tag', stampAt + BEAT * 1.5); read(S, '#s9-tag', stampAt + BEAT * 1.5);
      write('#s9-last', stampAt + BEAT * 3.5, 1.8); read(S, '#s9-last', stampAt + BEAT * 3.5);
      pop('#s9-url', stampAt + BEAT * 6, 7, 'outBack'); read(S, '#s9-url', stampAt + BEAT * 6, 0.5);
    }

    // S10 (idx 10): sources (a reference card: not audited for reading time)
    {
      const S = 10, a = (b) => at(S, b);
      cardIn('#s10-card', a(0.2), { from: 'bottom', r0: 5, sound: null });
      $$('#s10-list li').forEach((li, i) => rise(li, a(1 + i * 0.35), 24, 0.7));
      rise('#s10-foot', a(4), 20, 0.7);
    }
  }

  /** Simulates a viewer reading each scene's text in order. Slack is spare time before the camera moves on. */
  function audit() {
    const SECS_PER_WORD = 0.33; // about 180 words a minute
    const SECS_PER_ITEM = 0.2; // finding the next thing to read
    const rows = [];
    for (let i = 0; i < T.length - 1; i++) {
      const items = READ.filter((r) => r.scene === i).sort((p, q) => p.at - q.at);
      const end = T[i + 1] - LEAD - 0.5; // leave half a second of stillness before the camera pans
      let cursor = T[i];
      let words = 0;
      for (const it of items) {
        cursor = Math.max(cursor, it.at) + SECS_PER_ITEM + it.words * SECS_PER_WORD;
        words += it.words;
      }
      rows.push({ scene: i + 1, id: $$('.scene')[i].id, bars: LEN[i], seconds: +(LEN[i] * BAR).toFixed(1), words, readsUntil: +(cursor - T[i]).toFixed(1), slack: +(end - cursor).toFixed(1) });
    }
    return rows;
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
    const { PPP_PATH, PPP_VIEWBOX } = await import('../../js/ui/logo.js');
    $$('.ppp-slot').forEach((slot) => {
      slot.style.cssText = `display:block;width:${slot.dataset.w}px`;
      slot.innerHTML = `<svg viewBox="${PPP_VIEWBOX}" style="display:block;width:100%;height:auto" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${PPP_PATH}"/></svg>`;
    });
    ringAround('#s6-ring', '#s6-score', 20, 6);
    timeline();
    finalize();
    seek(0);
    return true;
  });

  window.PROMO = { duration: DURATION, fps: FPS, bpm: BPM, sceneStarts: T, music: MUSIC, cues: CUES, seek, ready, audit };

  // Live preview with a scrubber (hidden when rendering).
  if (new URLSearchParams(location.search).has('render')) {
    document.body.classList.add('render');
    return;
  }
  const scrub = $('#scrub'), clock = $('#clock'), play = $('#play');
  scrub.max = String(DURATION);
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
