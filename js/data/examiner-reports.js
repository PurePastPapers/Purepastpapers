// The "Examiner's report" panel: the official report's comments on one question or part.
// Report text is split per paper by tools/reports/extract.py into data/reports/<slug>/<PAPER>.json
// and listed in data/reports/index.json; both load only when a panel opens.
// Views render a placeholder with reportPanel(); observeExaminerReports() fills it in, the
// same way source images are hydrated, so opening a report never redraws the page.
import { html, isSafeUrl, setHtml } from '../core/dom.js';
import { groupSections, pageLink, sectionsFor } from '../engine/examiner-report.js';
import { icon } from '../ui/icons.js';
import { zoomButton } from '../ui/zoom.js';

let indexPromise = null;
let indexed = null; // paper ids with a split report, once the index has loaded
const reports = new Map();
const resolved = new Map(); // paper id -> report or null, once loaded (lets a redraw show it at once)
const panels = new Map(); // panel key -> { units, paper, view, label, group }

async function getJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

/** Load the list of split reports. Views await this before drawing, so buttons only show where comments exist. */
export function loadReportIndex() {
  indexPromise ||= getJson('data/reports/index.json').catch(() => ({ papers: {} })).then((index) => {
    indexed = new Set(Object.keys(index.papers || {}));
    return index;
  });
  return indexPromise;
}
const loadIndex = loadReportIndex;

/** The split report for a paper, or null when it has not been split yet. */
export async function loadReport(paperId) {
  if (!reports.has(paperId)) {
    reports.set(paperId, loadIndex().then((index) => {
      const entry = index.papers?.[paperId];
      return entry && /^[a-z]+\/[A-Z0-9_]+\.json$/.test(entry.file) ? getJson(`data/reports/${entry.file}`) : null;
    }).then((report) => { resolved.set(paperId, report); return report; }).catch((error) => { reports.delete(paperId); throw error; }));
  }
  return reports.get(paperId);
}

/** Whether a paper's report has been split into questions (call loadReportIndex() first). */
export const hasExaminerReport = (paper) => Boolean(paper?.examiner_report_url && isSafeUrl(paper.examiner_report_url) && indexed?.has(paper.paper_id));

/**
 * Placeholder for a question's (or a linked group's) report comments.
 * view: 'question' when the question is showing (adds a "contains answers" note),
 * 'scheme' when the mark scheme is.
 */
export function reportPanel({ key, units, paper, view = 'question', label = '', group = false, closeAttr = null }) {
  if (!hasExaminerReport(paper)) return '';
  const panel = { units, paper, view, label, group };
  panels.set(key, panel);
  const ready = resolved.has(paper.paper_id);
  return html`<section class="erpanel" data-er-panel="${key}" ${ready ? html`data-er-bound="true"` : ''} aria-label="Examiner’s report${label ? ` for ${label}` : ''}" tabindex="-1">
    <header class="erpanel__head">
      <span class="erpanel__title">${icon('book', { size: 15 })} Examiner’s report${label ? html`<span class="muted"> · ${label}</span>` : ''}</span>
      ${closeAttr ? html`<button type="button" class="erpanel__close" ${closeAttr} aria-label="Close the examiner’s report">${icon('x', { size: 16 })}</button>` : ''}
    </header>
    ${view === 'question' ? html`<p class="erpanel__warn small">${icon('info', { size: 13 })} Examiners discuss the answers here. Try the question first.</p>` : ''}
    <div class="erpanel__body" data-er-body aria-live="polite">${ready ? render(panel, resolved.get(paper.paper_id)) : html`<p class="small muted">Loading the examiners’ comments…</p>`}</div>
  </section>`;
}

const partName = (part) => (part.part_label ? `(${part.part_label.replace(/^\(|\)$/g, '')})` : `Question ${part.question_number}`);

const SAFE_IMG = /^[a-z]+\/img\/[A-Za-z0-9_]+\.webp$/;

/** Crops of the printed report, used where equations would not survive as text. Tap or
 *  "Enlarge" opens them in the site's zoom viewer (js/ui/zoom.js), which phones need. */
function crops(images, alt, title = 'Examiner’s report') {
  const shown = (images || []).filter((image) => SAFE_IMG.test(image.src));
  if (!shown.length) return '';
  return html`<div class="er-crops" data-zoom-src="${title}">
    <div data-zoom-body>${shown.map((image) => html`<img class="er-crop" src="data/reports/${image.src}" width="${image.w}" height="${image.h}" loading="lazy" decoding="async" alt="${alt}">`)}</div>
    ${zoomButton('examiner’s comment')}
  </div>`;
}

function paragraphs(paras) {
  const out = [];
  let list = null;
  for (const para of paras || []) {
    if (para.img?.length) {
      if (list) { out.push(html`<ul>${list}</ul>`); list = null; }
      out.push(crops(para.img, para.t));
      continue;
    }
    if (para.k === 'li') { (list ||= []).push(html`<li>${para.t}</li>`); continue; }
    if (list) { out.push(html`<ul>${list}</ul>`); list = null; }
    out.push(para.k === 'h' ? html`<p class="er-sec__sub">${para.t}</p>` : html`<p>${para.t}</p>`);
  }
  if (list) out.push(html`<ul>${list}</ul>`);
  return out;
}

function sectionBlock(section, report, { relation = 'own', note = '' } = {}) {
  const paras = section.paras || [];
  const unique = (kind) => [...new Set(paras.filter((para) => para.k === kind).map((para) => para.t))];
  const tips = unique('tip');
  const examples = unique('ex');
  const figures = (section.figures || []).reduce((sum, figure) => sum + figure.count, 0);
  const figurePage = section.figures?.[0]?.page || section.pages?.[0];
  const link = pageLink(report.source_url, figurePage);
  const badge = relation === 'whole' ? 'On the whole question' : relation === 'parent' ? 'On the whole part' : '';
  const scripts = figures === 1 ? 'an example response' : figures ? `${figures} example responses` : 'example responses';
  return html`<article class="er-sec">
    <p class="er-sec__head">${section.heading}${badge ? html`<span class="er-sec__badge">${badge}</span>` : ''}</p>
    ${note ? html`<p class="small muted">${note}</p>` : ''}
    ${section.img?.length
      ? crops(section.img, paras.filter((para) => para.k !== 'tip' && para.k !== 'ex').map((para) => para.t).join(' '), `Examiner’s report · ${section.heading}`)
      : paragraphs(paras.filter((para) => para.k !== 'tip' && para.k !== 'ex'))}
    ${tips.map((tip) => html`<p class="er-tip"><strong>Examiner tip</strong> ${tip}</p>`)}
    ${examples.length
      ? html`<details class="er-ex"><summary>Comments on example responses (${examples.length})</summary>
          <ul>${examples.map((text) => html`<li>${text}</li>`)}</ul>
          ${link ? html`<p class="small muted">The responses themselves are images in the report: <a href="${link}" target="_blank" rel="noopener">see page ${figurePage}</a>.</p>` : ''}
        </details>`
      : figures ? html`<p class="small er-sec__fig">${icon('file', { size: 13 })} The report shows ${scripts} here${link ? html`: <a href="${link}" target="_blank" rel="noopener">see page ${figurePage}</a>` : ''}.</p>` : ''}
  </article>`;
}

function sourceLine(report, paper, page) {
  const link = pageLink(report?.source_url || paper.examiner_report_url, page);
  const who = paper.board ? `${paper.board === 'Edexcel' ? 'Pearson Edexcel' : paper.board} examiner’s report` : 'examiner’s report';
  return html`<p class="erpanel__src small muted">From the official ${who}${paper.year ? `, ${paper.series && paper.series !== 'Demo' ? `${paper.series} ` : ''}${paper.year}` : ''}, quoted as printed.
    ${link ? html`<a href="${link}" target="_blank" rel="noopener">${page ? `Open page ${page}` : 'Open the full report'} ${icon('external', { size: 12 })}</a>` : ''}</p>`;
}

function noComment(report, paper) {
  const general = report?.general?.paras?.length ? html`<details class="er-general"><summary>The examiners’ general comments on this paper</summary>${paragraphs(report.general.paras)}</details>` : '';
  return html`<p>The examiners didn’t comment on this question in their report.</p>${general}${sourceLine(report, paper, report?.general?.pages?.[0])}`;
}

function render(panel, report) {
  const { units, paper, group } = panel;
  if (!report) {
    return html`<p>This report hasn’t been split into questions on the site yet.</p>${sourceLine(null, paper)}`;
  }
  if (group) {
    const { whole, perPart } = groupSections(units, report);
    const blocks = [];
    for (const section of whole) blocks.push(sectionBlock(section, report, { relation: 'whole' }));
    for (const part of units) {
      const entry = perPart.get(part.question_id);
      if (!entry?.matches.length) continue;
      blocks.push(html`<p class="er-part">Part ${partName(part)}</p>`);
      for (const match of entry.matches) {
        const first = match.firstShownWith && units.find((unit) => unit.question_id === match.firstShownWith);
        blocks.push(first
          ? html`<p class="small muted er-sec">The comment on ${match.section.heading} is shown with part ${partName(first)} above.</p>`
          : sectionBlock(match.section, report, { relation: match.relation }));
      }
    }
    if (!blocks.length) return noComment(report, paper);
    const firstPage = [...whole, ...[...perPart.values()].flatMap((entry) => entry.matches.map((match) => match.section))][0]?.pages?.[0];
    return html`${blocks}${sourceLine(report, paper, firstPage)}`;
  }
  const [unit] = units;
  const { scope, matches, parts } = sectionsFor(unit, report);
  if (scope === 'none') return noComment(report, paper);
  const note = parts.length && scope === 'full_question' ? 'The report comments on the whole question, not this part on its own.'
    : scope === 'parent_part' ? 'The report comments on this part as a whole.' : '';
  return html`${note ? html`<p class="small muted">${note}</p>` : ''}
    ${matches.map((match) => sectionBlock(match.section, report, { relation: parts.length ? match.relation : 'own' }))}
    ${sourceLine(report, paper, matches[0]?.section.pages?.[0])}`;
}

async function hydrate(element) {
  const panel = panels.get(element.dataset.erPanel);
  const body = element.querySelector('[data-er-body]');
  if (!panel || !body) return;
  try {
    setHtml(body, render(panel, await loadReport(panel.paper.paper_id)));
  } catch {
    setHtml(body, html`<p>The examiners’ comments couldn’t load. Check your connection and try again.</p>${sourceLine(null, panel.paper)}`);
  }
}

export function observeExaminerReports(root = document) {
  const run = () => {
    for (const element of root.querySelectorAll('[data-er-panel]')) {
      if (element.dataset.erBound) continue;
      element.dataset.erBound = 'true';
      hydrate(element);
    }
  };
  const observer = new MutationObserver(run);
  observer.observe(root, { childList: true, subtree: true });
  run();
  return () => observer.disconnect();
}

/** After a view redraws, bring a newly opened panel into view without jumping if it is visible. */
export function revealPanel(root, key) {
  requestAnimationFrame(() => {
    const panel = [...root.querySelectorAll('[data-er-panel]')].find((element) => element.dataset.erPanel === key);
    if (!panel) return;
    const box = panel.getBoundingClientRect();
    if (box.top < 0 || box.top > window.innerHeight - 80) panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
}

/**
 * Closed-by-default report for screens that already show the mark scheme (a session after
 * "Mark scheme", the marking step and the results review). It only appears once the scheme
 * is revealed, never while a test is running.
 */
export function reportFold({ key, units, paper, group = false }) {
  if (!hasExaminerReport(paper)) return '';
  return html`<details class="erfold" data-er-fold="${key}">
    <summary>${icon('book', { size: 15 })} Examiner’s report${group ? ` for all ${units.length} parts` : ''}</summary>
    ${reportPanel({ key: `fold:${key}`, units, paper, view: 'scheme', group })}
  </details>`;
}
