// Rendering of questions and mark schemes, shared by lists, the session runner and reviews.
// A question's content may be HTML, an image, or both (PRD 8.2: question_html / question_image_url).

import { html, isSafeUrl, sanitizeHtml } from '../core/dom.js';
import { fmtMinutes } from '../core/utils.js';
import { difficultyBadge, sourceBadge } from './ui.js';

const image = (url, alt) => (url && isSafeUrl(url) ? html`<a href="${url}" target="_blank" rel="noopener" aria-label="Open ${alt} image at its original size"><img src="${url}" alt="${alt}" loading="lazy" /></a>` : '');

/** A vertical slice of a stitched source image: nothing is retyped, only cropped. */
function slice(url, [width, height], { y0, y1 }, alt) {
  if (!url || !isSafeUrl(url) || !(width > 0) || !(height > 0)) return '';
  const visible = Math.max(1, Math.round(height * (y1 - y0)));
  return html`<div class="qslice-scroll" tabindex="0"><div class="qslice" role="img" aria-label="${alt}" style="aspect-ratio:${width} / ${visible};max-width:${Math.round(width * 0.66)}px">
    <img src="${url}" alt="" loading="lazy" width="${width}" height="${height}" style="margin-top:-${((y0 * height) / width * 100).toFixed(3)}%" />
  </div></div>`;
}

function slicedBody(question, { contextOpen }) {
  const { question_image_url: url, image_size: size, question_slices: slices, preview_text: preview } = question.content;
  const context = question.context || {};
  const ref = `Question ${question.question_number}${question.part_label ? ` part ${question.part_label}` : ''}`;
  const describe = (role) => `${ref}${role === 'stem' ? ', opening information' : role === 'tail' ? ', figure or data' : ''}${preview && role === 'part' ? `: ${preview}` : ''}`;
  const stem = slices.filter((item) => item.role === 'stem');
  const rest = slices.filter((item) => item.role !== 'stem');
  const deps = (question.depends_on_question_ids || []).length;
  return html`<div class="stack stack--sm">
    ${question.part_label ? html`<p class="small muted">Part ${question.part_label} only · ${question.marks} ${question.marks === 1 ? 'mark' : 'marks'}</p>` : ''}
    ${stem.map((item) => html`<div class="question-stem">${slice(url, size, item, describe('stem'))}</div>`)}
    ${context.earlier_parts ? html`<details class="question-context" data-question-earlier="${question.question_id}" ${context.earlier_parts_open ? 'open' : ''}>
      <summary>${context.earlier_parts_open ? 'Earlier parts (shown because this part follows on from them)' : 'Show earlier parts'}</summary>
      <div class="stack stack--sm" style="margin-top:10px">
        <p class="small muted">${deps ? 'This part uses the earlier parts.' : 'For context.'} They are not marked here and do not count towards this attempt.</p>
        ${slice(url, size, context.earlier_parts, `${ref}: earlier parts of the question`)}
      </div>
    </details>` : ''}
    <div class="question-selected-part">${rest.map((item) => slice(url, size, item, describe(item.role)))}</div>
    ${question.part_label ? html`<details class="question-context" data-question-context="${question.question_id}" ${contextOpen ? 'open' : ''}>
      <summary>Show the full question</summary>
      <div class="stack stack--sm" style="margin-top:10px">
        <p class="small muted">Context only. Answer and mark only part ${question.part_label}; other parts do not count towards this attempt.</p>
        ${slice(url, size, { y0: 0, y1: 1 }, `Full ${ref.replace(/ part .*/, '')}`)}
      </div>
    </details>` : ''}
  </div>`;
}

export function questionBody(question, { contextOpen = false } = {}) {
  if (Array.isArray(question.content?.question_slices) && question.content.image_size) return slicedBody(question, { contextOpen });
  const { question_html: markup, question_image_url: url } = question.content || {};
  const context = question.context || {};
  const fullQuestion = context.full_question_html || (context.full_question_image_url && isSafeUrl(context.full_question_image_url));
  return html`<div class="stack">
    ${question.part_label ? html`<p class="small muted">Part ${question.part_label} only · ${question.marks} ${question.marks === 1 ? 'mark' : 'marks'}</p>` : ''}
    ${context.shared_stem_html ? html`<div class="qcontent question-stem">${sanitizeHtml(context.shared_stem_html)}</div>` : ''}
    <div class="qcontent question-selected-part">${sanitizeHtml(markup)}${image(url, `Question ${question.question_number}${question.part_label ? `, part ${question.part_label}` : ''}`)}</div>
    ${fullQuestion ? html`<details class="question-context" data-question-context="${question.question_id}" ${contextOpen ? 'open' : ''}>
      <summary>Show full question for context</summary>
      <div class="stack" style="margin-top:12px">
        <p class="small muted">Context only. Answer and mark only the selected ${question.part_label ? 'part' : 'question'} above; other parts do not count towards this attempt.</p>
        <div class="qcontent">${sanitizeHtml(context.full_question_html)}${image(context.full_question_image_url, 'Full question for context only')}</div>
      </div>
    </details>` : ''}
  </div>`;
}

export function markSchemeBody(question) {
  const { mark_scheme_html: markup, mark_scheme_image_url: url } = question.content || {};
  if (!markup && !url) return html`<p class="muted">No mark scheme has been added for this question yet.</p>`;
  const size = question.content?.mark_scheme_size;
  if (url && size) {
    return html`<div class="ms"><div class="stack stack--sm">
      ${question.content.mark_scheme_scope === 'question' && question.part_label ? html`<p class="small muted">Official mark scheme for the whole of Question ${question.question_number}. Use the rows for part ${question.part_label}; this part is out of ${question.marks}.</p>` : ''}
      ${slice(url, size, { y0: 0, y1: 1 }, `Mark scheme for question ${question.question_number}`)}
    </div></div>`;
  }
  return html`<div class="ms"><div class="qcontent">${sanitizeHtml(markup)}${image(url, 'Mark scheme')}</div></div>`;
}

/** Plain-text opening of a question, for list cards. */
export function questionSnippet(question, length = 220) {
  if (question.content?.preview_text) return question.content.preview_text;
  const template = document.createElement('template');
  template.innerHTML = sanitizeHtml(question.content?.question_html)
    .toString()
    .replace(/></g, '> <'); // keep words in neighbouring elements apart
  for (const node of template.content.querySelectorAll('sup')) node.textContent = `^(${node.textContent})`;
  for (const node of template.content.querySelectorAll('sub')) node.textContent = `_(${node.textContent})`;
  // Preserve grouped denominators and nested fractions instead of flattening
  // 1/(2 + cos x) into the mathematically different '1/2 + cos x'.
  for (const fraction of [...template.content.querySelectorAll('.frac')].reverse()) {
    const numerator = fraction.querySelector(':scope > .frac__n');
    const denominator = fraction.querySelector(':scope > .frac__d');
    if (numerator && denominator) fraction.textContent = `(${numerator.textContent.trim()})/(${denominator.textContent.trim()})`;
  }
  const text = template.content.textContent.replace(/\s+/g, ' ').trim();
  if (!text) return question.content?.question_image_url ? 'Question shown as an image.' : 'No preview available.';
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

/** "Demo Paper A · Q4" or "June 2023 Paper 1 · Q7" */
export function questionRef(question, papersById) {
  const paper = papersById?.get(question.paper_id);
  const paperLabel = paper ? paper.title.replace(/:.*/, '') : question.source_type === 'ai_spec_question' ? 'AI question' : '';
  const number = String(question.question_number ?? '');
  // Older packs may already carry "7(b)"; new part records can keep number "7".
  const normalise = (value) => String(value).replace(/[\s()]/g, '').toLowerCase();
  const hasPart = question.part_label && normalise(number).endsWith(normalise(question.part_label));
  const label = String(question.part_label || '').trim();
  // Accept original "(b)(ii)" labels and compact "b(ii)" without inventing
  // an extra wrapper around the whole nested path.
  const suffix = label.startsWith('(') ? label : label.replace(/^([^()]+)(.*)$/, '($1)$2');
  const part = label && !hasPart ? suffix : '';
  return [paperLabel, `${question.section_label ? `${question.section_label} ` : ''}Q${number}${part}`].filter(Boolean).join(' · ');
}

export const marksPill = (marks) => html`<span class="marks-pill">${marks} ${marks === 1 ? 'mark' : 'marks'}</span>`;

/** Marks, time, difficulty, source and (optionally) the topics a question is tagged with. */
export function questionMeta(question, { specIndex = null, topics = true } = {}) {
  const primary = question.primary_spec_points || [];
  const crossover = question.crossover_spec_points || [];
  const labelOf = (id) => {
    const node = specIndex?.get(id);
    return node ? [node.code, node.title].filter(Boolean).join(' ') : 'Unmapped specification point';
  };
  const codeOf = (id) => {
    const node = specIndex?.get(id);
    if (!node) return 'Unmapped specification point';
    return node.code ? `${node.code}${node.type !== 'point' ? ' (whole topic)' : ''}` : node.title;
  };
  const tags = new Map();
  if (topics && specIndex) {
    for (const id of primary) {
      const title = specIndex.topicOf(id)?.title || specIndex.get(id)?.title || 'Unmapped specification point';
      if (!tags.has(title)) tags.set(title, []);
      tags.get(title).push(labelOf(id));
    }
  }
  return html`<div class="qcard__meta">
    ${difficultyBadge(question.difficulty)}
    <span class="small muted">about ${fmtMinutes(question.estimated_minutes || 1)}</span>
    ${sourceBadge(question)} ${[...tags].map(([title, labels]) => html`<span class="tag" title="${labels.join(' · ')}">${title}</span>`)}
    ${crossover.length ? html`<span class="tag" title="${specIndex ? crossover.map(labelOf).join(' · ') : 'Also needs knowledge from other topics'}">+ crossover</span>` : ''}
    ${topics && specIndex && primary.length ? html`<span class="question-spec-codes small muted" title="${primary.map(labelOf).join(' · ')}">Spec ${[...new Set(primary.map(codeOf))].join(' · ')}</span>` : ''}
    ${topics && specIndex && crossover.length ? html`<span class="question-spec-codes small muted" title="${crossover.map(labelOf).join(' · ')}">Also needs ${[...new Set(crossover.map(codeOf))].join(' · ')}</span>` : ''}
  </div>`;
}
