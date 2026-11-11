// Small SVG charts for the Data Hub — no chart library.
// House rules: one y-axis, thin marks, hairline grid, text in ink (never in the series
// colour), a hover/focus tooltip on every mark, and a "View as table" twin for every chart.
// Series colours come from the validated --series-N tokens, assigned in fixed order.

import { esc } from '../core/dom.js';
import { fmtDate, fmtDayMonth } from '../core/utils.js';

const MARGIN = { top: 14, right: 16, bottom: 26, left: 34 };

function niceScale(maxValue, targetTicks = 4) {
  const max = Math.max(1, maxValue);
  const rough = max / targetTicks;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) || 10 * power;
  const cleanStep = Math.max(1, Math.round(step * 100) / 100);
  const top = Math.ceil(max / cleanStep) * cleanStep;
  const ticks = [];
  for (let value = 0; value <= top + 1e-9; value += cleanStep) ticks.push(Math.round(value * 100) / 100);
  return { top, ticks };
}

function tableTwin(columns, rows) {
  return (
    `<details class="chart-table"><summary>View as table</summary><div class="table-wrap">` +
    `<table class="table table--compact"><thead><tr>${columns.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows
      .map((row) => `<tr>${row.map((cell, i) => `<td${columns[i].num ? ' class="num"' : ''}>${esc(cell)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div></details>`
  );
}

/** Redraws when the container changes width. Returns a cleanup function. */
function responsive(container, draw) {
  let width = 0;
  const render = () => {
    const next = Math.floor(container.clientWidth);
    if (!next || next === width) return;
    width = next;
    draw(width);
  };
  const observer = new ResizeObserver(render);
  observer.observe(container);
  render();
  return () => observer.disconnect();
}

function tooltipFor(chart) {
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  chart.append(tip);
  return {
    show(x, y, markup) {
      tip.innerHTML = markup;
      tip.hidden = false;
      const half = tip.offsetWidth / 2;
      tip.style.left = `${Math.min(Math.max(x, half + 4), chart.clientWidth - half - 4)}px`;
      tip.style.top = `${Math.max(y, tip.offsetHeight + 12)}px`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

/**
 * Single-series column chart.
 * @param {HTMLElement} container
 * @param {{ data: {label: string, value: number, detail?: string}[], unit: string, height?: number, tableLabel?: string }} options
 */
export function columnChart(container, { data, unit, height = 190, tableLabel = 'Period' }) {
  container.classList.add('chart');
  return responsive(container, (width) => {
    const plotW = width - MARGIN.left - MARGIN.right;
    const plotH = height - MARGIN.top - MARGIN.bottom;
    const { top, ticks } = niceScale(Math.max(...data.map((d) => d.value), 0));
    const y = (value) => MARGIN.top + plotH - (value / top) * plotH;
    const band = plotW / data.length;
    const barW = Math.min(24, band * 0.6);
    const labelEvery = band < 44 ? 2 : 1;
    const baseline = MARGIN.top + plotH;
    const lastIndex = data.length - 1;

    const grid = ticks
      .map(
        (tick) =>
          `<line x1="${MARGIN.left}" x2="${width - MARGIN.right}" y1="${y(tick)}" y2="${y(tick)}" stroke="${tick === 0 ? 'var(--axis)' : 'var(--grid)'}" stroke-width="1"/>` +
          `<text class="tick-num" x="${MARGIN.left - 8}" y="${y(tick) + 4}" text-anchor="end">${tick}</text>`,
      )
      .join('');

    const bars = data
      .map((d, i) => {
        const x = MARGIN.left + band * i + (band - barW) / 2;
        const barTop = y(d.value);
        const r = Math.min(4, (baseline - barTop) / 2);
        const path =
          d.value > 0
            ? `<path class="chart__bar" fill="var(--series-1)" style="pointer-events:none" d="M${x},${baseline}V${barTop + r}Q${x},${barTop} ${x + r},${barTop}H${x + barW - r}Q${x + barW},${barTop} ${x + barW},${barTop + r}V${baseline}Z"/>`
            : '';
        const label =
          (lastIndex - i) % labelEvery === 0
            ? `<text x="${x + barW / 2}" y="${height - 8}" text-anchor="middle">${esc(d.label)}</text>`
            : '';
        // Label selectively: only the most recent period carries its value.
        const direct =
          i === lastIndex && d.value > 0
            ? `<text class="direct-label" x="${x + barW / 2}" y="${barTop - 6}" text-anchor="middle">${d.value}</text>`
            : '';
        return (
          `<rect class="chart__hit" data-i="${i}" x="${MARGIN.left + band * i}" y="${MARGIN.top}" width="${band}" height="${plotH}" tabindex="0" role="img" aria-label="${esc(`${d.label}: ${d.value} ${unit}`)}"/>` +
          path + label + direct
        );
      })
      .join('');

    container.innerHTML =
      `<svg class="chart__svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(`${unit} by ${tableLabel.toLowerCase()}`)}">${grid}${bars}</svg>` +
      tableTwin([{ label: tableLabel }, { label: unit, num: true }], data.map((d) => [d.detail || d.label, d.value]));

    const tip = tooltipFor(container);
    for (const hit of container.querySelectorAll('.chart__hit')) {
      const d = data[Number(hit.dataset.i)];
      const show = () => {
        const x = Number(hit.getAttribute('x')) + band / 2;
        tip.show(x, y(d.value), `<strong>${d.value}</strong> ${esc(unit)}<br>${esc(d.detail || d.label)}`);
      };
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', tip.hide);
      hit.addEventListener('blur', tip.hide);
    }
  });
}

/**
 * Percentage-over-time line chart, one line per series.
 * @param {HTMLElement} container
 * @param {{ series: {name: string, slot: number, points: {t: string, value: number, title?: string}[]}[], height?: number }} options
 *   `slot` is the fixed categorical slot (1–8) for the series — colour follows the entity.
 */
export function lineChart(container, { series, height = 230 }) {
  container.classList.add('chart');
  const all = series.flatMap((s) => s.points.map((point) => ({ ...point, time: new Date(point.t).getTime(), series: s })));
  const tMin = Math.min(...all.map((p) => p.time));
  const tMax = Math.max(...all.map((p) => p.time));
  const span = Math.max(tMax - tMin, 1);

  return responsive(container, (width) => {
    const plotW = width - MARGIN.left - MARGIN.right - 8;
    const plotH = height - MARGIN.top - MARGIN.bottom;
    const x = (time) => MARGIN.left + (tMax === tMin ? plotW / 2 : ((time - tMin) / span) * plotW);
    const y = (value) => MARGIN.top + plotH - (Math.min(100, Math.max(0, value)) / 100) * plotH;

    const grid = [0, 25, 50, 75, 100]
      .map(
        (tick) =>
          `<line x1="${MARGIN.left}" x2="${width - MARGIN.right}" y1="${y(tick)}" y2="${y(tick)}" stroke="${tick === 0 ? 'var(--axis)' : 'var(--grid)'}" stroke-width="1"/>` +
          (tick % 50 === 0 ? `<text class="tick-num" x="${MARGIN.left - 8}" y="${y(tick) + 4}" text-anchor="end">${tick}${tick === 100 ? '%' : ''}</text>` : ''),
      )
      .join('');

    const dates =
      tMax === tMin
        ? `<text x="${x(tMin)}" y="${height - 8}" text-anchor="middle">${esc(fmtDayMonth(tMin))}</text>`
        : `<text x="${x(tMin)}" y="${height - 8}" text-anchor="start">${esc(fmtDayMonth(tMin))}</text>` +
          `<text x="${x(tMax)}" y="${height - 8}" text-anchor="end">${esc(fmtDayMonth(tMax))}</text>`;

    const lines = series
      .map((s) => {
        const points = s.points.map((point) => [x(new Date(point.t).getTime()), y(point.value)]);
        const colour = `var(--series-${s.slot})`;
        const path = points.length > 1 ? `<path d="M${points.map((p) => p.join(',')).join('L')}" fill="none" stroke="${colour}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : '';
        const [endX, endY] = points[points.length - 1];
        const end = `<circle cx="${endX}" cy="${endY}" r="5" fill="${colour}" stroke="var(--surface)" stroke-width="2"/>`;
        const direct =
          series.length === 1
            ? `<text class="direct-label" x="${Math.min(endX, width - 30)}" y="${endY - 11}" text-anchor="middle">${Math.round(s.points[s.points.length - 1].value)}%</text>`
            : '';
        return path + end + direct;
      })
      .join('');

    const legend =
      series.length > 1
        ? `<div class="legend">${series.map((s) => `<span class="legend__item"><span class="legend__key" style="background:var(--series-${s.slot})"></span>${esc(s.name)}</span>`).join('')}</div>`
        : '';

    container.innerHTML =
      `<svg class="chart__svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Percentage scores over time">` +
      `${grid}${dates}<line class="chart__cross" y1="${MARGIN.top}" y2="${MARGIN.top + plotH}" stroke="var(--axis)" stroke-width="1" visibility="hidden"/>${lines}` +
      `<circle class="chart__focus" r="5" fill="var(--surface)" stroke="var(--ink)" stroke-width="2" visibility="hidden"/>` +
      `<rect class="chart__hit" x="${MARGIN.left}" y="${MARGIN.top}" width="${width - MARGIN.left - MARGIN.right}" height="${plotH}"/></svg>` +
      legend +
      tableTwin(
        [{ label: 'Date' }, { label: 'Subject' }, { label: 'Paper or test' }, { label: 'Score', num: true }],
        [...all].sort((a, b) => b.time - a.time).map((p) => [fmtDate(p.t), p.series.name, p.title || '', `${Math.round(p.value)}%`]),
      );

    const tip = tooltipFor(container);
    const cross = container.querySelector('.chart__cross');
    const focus = container.querySelector('.chart__focus');
    const hit = container.querySelector('.chart__hit');
    const hide = () => {
      tip.hide();
      cross.setAttribute('visibility', 'hidden');
      focus.setAttribute('visibility', 'hidden');
    };
    hit.addEventListener('pointermove', (event) => {
      const bounds = container.querySelector('svg').getBoundingClientRect();
      const px = event.clientX - bounds.left;
      const py = event.clientY - bounds.top;
      // Snap to the nearest point: the reader aims at a date, never at a 2px line.
      let nearest = null;
      let distance = Infinity;
      for (const point of all) {
        const d = Math.abs(x(point.time) - px) + Math.abs(y(point.value) - py) * 0.35;
        if (d < distance) {
          distance = d;
          nearest = point;
        }
      }
      if (!nearest) return;
      const cx = x(nearest.time);
      const cy = y(nearest.value);
      cross.setAttribute('x1', cx);
      cross.setAttribute('x2', cx);
      cross.setAttribute('visibility', 'visible');
      focus.setAttribute('cx', cx);
      focus.setAttribute('cy', cy);
      focus.setAttribute('visibility', 'visible');
      tip.show(
        cx,
        cy,
        `<strong>${Math.round(nearest.value)}%</strong><br>` +
          `<span class="chart-tip__key" style="background:var(--series-${nearest.series.slot})"></span>${esc(nearest.series.name)}<br>` +
          `${nearest.title ? `${esc(nearest.title)}<br>` : ''}${esc(fmtDate(nearest.t))}`,
      );
    });
    hit.addEventListener('pointerleave', hide);
  });
}
