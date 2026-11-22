// The "Examiner's report" panel: the official report's comments on one question or part.
// Report text is split per paper by tools/reports/extract.py into data/reports/<slug>/<PAPER>.json
// and listed in data/reports/index.json. Excerpts load when a panel opens.
// Views render a placeholder with reportPanel(); observeExaminerReports() fills it in, the
// same way source images are hydrated, so opening a report never redraws the page.
import { html, setHtml } from '../core/dom.js';
import { groupSections, pageLink, sectionsFor } from '../engine/examiner-report.js';
import { icon } from '../ui/icons.js';
import { zoomButton } from '../ui/zoom.js';

let indexPromise = null;
let indexed = null;
const reports = new Map();
const resolved = new Map(); // paper id -> report or null, once loaded (lets a redraw show it at once)
const panels = new Map(); // panel key -> { units, paper, view, label, group }

async function getJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

/** Load the report catalogue before drawing links and controls. */
export function loadReportIndex() {
  indexPromise ||= getJson('data/reports/index.json').catch(() => ({ papers: {} })).then((index) => {
    indexed = index;
    return index;
  });
  return indexPromise;
}

export function reportSourceUrl(paper) {
  if (!paper || indexed?.unavailable?.[paper.paper_id]) return null;
  return pageLink(indexed?.papers?.[paper.paper_id]?.source_url || paper.examiner_report_url);
}

export async function loadReport(paper) {
  const id = paper.paper_id;
  if (!reports.has(id)) {
    const pending = loadReportIndex().then(async (index) => {
      const entry = index.papers?.[id];
      if (!entry) return null;
      if (!/^[a-z]+\/[A-Z0-9_]+\.json$/.test(entry.file)) throw new Error('Invalid examiner report path');
      const report = await getJson(`data/reports/${entry.file}`);
      if (report.format !== 'examiner-report-text-v1' || report.paper_id !== id ||
          report.subject_id !== paper.subject_id || report.source_url !== reportSourceUrl(paper) ||
          !Array.isArray(report.sections)) {
        throw new Error('Examiner report does not match this paper');
      }
      return report;
    }).then((report) => {
      resolved.set(id, report);
      return report;
    }).catch((error) => {
      reports.delete(id);
      throw error;
    });
    reports.set(id, pending);
  }
  return reports.get(id);
}

export const hasExaminerReport = (paper) => Boolean(reportSourceUrl(paper));

/**
 * Placeholder for a question's (or a linked group's) report comments.
 * view: 'question' when the question is showing (adds a "contains answers" note),
 * 'scheme' when the mark scheme is.
 */
export function reportPanel({ key, units, paper, view = 'question', label = '', group = false, closeAttr = null, lazy = false }) {
  if (!hasExaminerReport(paper)) return '';
  const panel = { units, paper, view, label, group };
  panels.set(key, panel);
  const ready = !lazy && resolved.has(paper.paper_id);
  return html`<section class="erpanel" data-er-panel="${key}" ${ready ? html`data-er-bound="true"` : ''} aria-label="Examiner’s report${label ? ` for ${label}` : ''}" tabindex="-1">
    <header class="erpanel__head">
      <span class="erpanel__title">${icon('book', { size: 15 })} Examiner’s report${label ? html`<span class="muted"> · ${label}</span>` : ''}</span>
      ${closeAttr ? html`<button type="button" class="erpanel__close" ${closeAttr} aria-label="Close the examiner’s report">${icon('x', { size: 16 })}</button>` : ''}
    </header>
    ${view === 'question' ? html`<p class="erpanel__warn small">${icon('info', { size: 13 })} Examiners discuss the answers here. Try the question first.</p>` : ''}
    <div class="erpanel__body" data-er-body aria-live="polite">${ready ? render(panel, resolved.get(paper.paper_id)) : html`<p class="small muted">Loading the examiners’ comments…</p>`}</div>
  </section>`;
}

export function reportQuestionLabel(question) {
  const part = String(question.part_label || '').replace(/\s+/g, '');
  const decimal = part.match(/^(\d+)\.(\d+)$/);
  return decimal ? `Q${decimal[1].padStart(2, '0')}.${decimal[2]}` : `Q${question.question_number}${part}`;
}
const partName = (part) => part.part_label || `Question ${part.question_number}`;

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

function sectionBlock(section, report, { relation = 'own' } = {}) {
  const paras = section.paras || [];
  const unique = (kind) => [...new Set(paras.filter((para) => para.k === kind).map((para) => para.t))];
  const tips = unique('tip');
  const examples = unique('ex');
  const figures = section.figures || [];
  const pagesFor = (type) => [...new Set(figures.filter((figure) => (figure.kind || 'candidate_response') === type)
    .flatMap((figure) => figure.pages || [figure.page]))];
  const links = (pages) => pages.map((page, i) => html`${i ? ' · ' : ''}<a href="${pageLink(report.source_url, page)}" target="_blank" rel="noopener">Page ${page}</a>`);
  const figurePages = pagesFor('candidate_response');
  const responseLinks = links(figurePages.length ? figurePages : section.pages?.slice(0, 1) || []);
  const diagramLinks = links(pagesFor('examiner_diagram'));
  const sectionNames = [...new Set((section.targets || []).map((target) => target.section).filter(Boolean))];
  const sectionScope = sectionNames.length === 1 ? `Section ${sectionNames[0]}` : `Sections ${sectionNames.join(' and ')}`;
  const badge = relation === 'whole' ? 'On the whole question' : relation === 'parent' ? 'On the whole part'
    : relation === 'section' ? `On ${sectionScope} as a whole` : '';
  const shared = section.targets?.length > 1;
  const page = section.pages?.[0];
  const pageOnly = !paras.length && !section.img?.length && !figures.length && page;
  const exemplars = (section.exemplar_links || []).map((entry) => ({...entry, url: pageLink(entry.source_url, entry.page)})).filter((entry) => entry.url);
  return html`<article class="er-sec">
    <p class="er-sec__head">${section.heading}${badge ? html`<span class="er-sec__badge">${badge}</span>` : ''}${shared ? html`<span class="er-sec__badge">Shared feedback</span>` : ''}</p>
    ${section.img?.length
      ? crops(section.img, paras.filter((para) => para.k !== 'tip' && para.k !== 'ex').map((para) => para.t).join(' '), `Examiner’s report · ${section.heading}`)
      : paragraphs(paras.filter((para) => para.k !== 'tip' && para.k !== 'ex'))}
    ${pageOnly ? html`<p class="small"><a href="${pageLink(report.source_url, pageOnly)}" target="_blank" rel="noopener">Read on page ${pageOnly} of the official report</a></p>` : ''}
    ${tips.map((tip) => html`<p class="er-tip"><strong>Examiner tip</strong> ${tip}</p>`)}
    ${examples.length
      ? html`<details class="er-ex"><summary>Comments on example responses</summary>
          <ul>${examples.map((text) => html`<li>${text}</li>`)}</ul>
          ${responseLinks.length ? html`<p class="small muted">Candidate responses in the official PDF · ${responseLinks}</p>` : ''}
        </details>`
      : figurePages.length ? html`<p class="small er-sec__fig">${icon('file', { size: 13 })} Candidate responses in the official PDF · ${responseLinks}</p>` : ''}
    ${diagramLinks.length ? html`<p class="small er-sec__fig">Examiner diagram in the official PDF · ${diagramLinks}</p>` : ''}
    ${exemplars.length ? html`<p class="small muted">Sample-answer commentary · ${exemplars.map((entry, i) => html`${i ? ' · ' : ''}<a href="${entry.url}" target="_blank" rel="noopener">Page ${entry.page}</a>`)}</p>` : ''}
    ${page && !pageOnly && relation === 'section' ? html`<p class="small"><a href="${pageLink(report.source_url, page)}" target="_blank" rel="noopener">Open section feedback on page ${page}</a></p>` : ''}
  </article>`;
}

function sourceLine(report, paper, page) {
  const link = pageLink(report?.source_url || reportSourceUrl(paper), page);
  const who = paper.board ? `${paper.board === 'Edexcel' ? 'Pearson Edexcel' : paper.board} examiner’s report` : 'examiner’s report';
  return html`<p class="erpanel__src small muted">From the official ${who}${paper.year ? `, ${paper.series && paper.series !== 'Demo' ? `${paper.series} ` : ''}${paper.year}` : ''}${report && report.coverage_status !== 'unreadable' && report.coverage_status !== 'pdf_only' ? ', quoted as printed' : ''}.
    ${link ? html`<a href="${link}" target="_blank" rel="noopener">${page ? `Open page ${page}` : 'Open the full report'} ${icon('external', { size: 12 })}</a>` : ''}</p>`;
}

function noComment(report, paper) {
  const general = report?.general?.paras?.length ? html`<details class="er-general"><summary>The examiners’ general comments on this paper</summary>${paragraphs(report.general.paras)}</details>` : '';
  const message = report.coverage_status === 'general_only' ? 'This report gives general feedback on the paper.'
    : ['partial', 'pdf_only', 'unreadable'].includes(report.coverage_status) ? 'Open the official report for any further feedback on this question.'
    : 'The examiners didn’t comment on this question in their report.';
  return html`<p>${message}</p>${general}${sourceLine(report, paper, report.general?.pages?.[0])}`;
}

function render(panel, report) {
  const { units, paper, group } = panel;
  if (!report) {
    return html`<p>This report hasn’t been split into questions on the site yet.</p>${sourceLine(null, paper)}`;
  }
  if (group) {
    const { whole, sectionWide, perPart } = groupSections(units, report);
    if (!whole.length && !sectionWide.length && ![...perPart.values()].some((entry) => entry.matches.length)) return noComment(report, paper);
    const blocks = [];
    for (const section of sectionWide) blocks.push(sectionBlock(section, report, { relation: 'section' }));
    for (const section of whole) blocks.push(sectionBlock(section, report, { relation: 'whole' }));
    for (const part of units) {
      const entry = perPart.get(part.question_id);
      blocks.push(html`<p class="er-part">Part ${partName(part)}</p>`);
      if (!entry.matches.length) blocks.push(html`<p class="small muted">No separate feedback for this part.</p>`);
      for (const match of entry.matches) {
        const first = match.firstShownWith && units.find((unit) => unit.question_id === match.firstShownWith);
        blocks.push(first
          ? html`<p class="small muted er-sec">The comment on ${match.section.heading} is shown with part ${partName(first)} above.</p>`
          : sectionBlock(match.section, report, { relation: match.relation }));
      }
    }
    const partSections = [...perPart.values()].flatMap((entry) => entry.matches.map((match) => match.section));
    const firstPage = [...partSections, ...whole, ...sectionWide][0]?.pages?.[0];
    return html`${blocks}${sourceLine(report, paper, firstPage)}`;
  }
  const [unit] = units;
  const { scope, matches, parts } = sectionsFor(unit, report);
  if (scope === 'none') return noComment(report, paper);
  const note = parts.length && scope === 'full_question' ? 'The report comments on the whole question, not this part on its own.'
    : scope === 'parent_part' ? 'The report comments on this part as a whole.' : '';
  const sourceMatch = matches.find((match) => match.relation === 'own') || matches.find((match) => match.relation !== 'section') || matches[0];
  return html`${note ? html`<p class="small muted">${note}</p>` : ''}
    ${matches.map((match) => sectionBlock(match.section, report, { relation: !parts.length && match.relation === 'whole' ? 'own' : match.relation }))}
    ${sourceLine(report, paper, sourceMatch?.section.pages?.[0])}`;
}

async function hydrate(element) {
  const panel = panels.get(element.dataset.erPanel);
  const body = element.querySelector('[data-er-body]');
  if (!panel || !body) return;
  try {
    setHtml(body, render(panel, await loadReport(panel.paper)));
  } catch {
    setHtml(body, html`<p>The examiners’ comments couldn’t load. Check your connection and try again.</p>${sourceLine(null, panel.paper)}`);
  }
}

export function observeExaminerReports(root = document) {
  const run = () => {
    for (const element of root.querySelectorAll('[data-er-panel]')) {
      if (element.dataset.erBound || element.closest('details.erfold:not([open])')) continue;
      element.dataset.erBound = 'true';
      hydrate(element);
    }
  };
  const observer = new MutationObserver(run);
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener('toggle', run, true);
  run();
  return () => {
    observer.disconnect();
    root.removeEventListener('toggle', run, true);
  };
}

/** After a view redraws, bring a newly opened panel into view without jumping if it is visible. */
export function revealPanel(root, key) {
  requestAnimationFrame(() => {
    const panel = [...root.querySelectorAll('[data-er-panel]')].find((element) => element.dataset.erPanel === key);
    if (!panel) return;
    panel.querySelector('.erpanel__close')?.focus({ preventScroll: true });
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
    ${reportPanel({ key: `fold:${key}`, units, paper, view: 'scheme', group, lazy: true })}
  </details>`;
}
