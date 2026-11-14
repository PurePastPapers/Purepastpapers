// Rendering of questions and mark schemes, shared by lists, the session runner and reviews.
// A question's content may be HTML, an image, or both (PRD 8.2: question_html / question_image_url).

import { html, isSafeUrl, sanitizeHtml } from '../core/dom.js';
import { fmtMinutes } from '../core/utils.js';
import { difficultyBadge, sourceBadge } from './ui.js';

const image = (url, alt) => (url && isSafeUrl(url) ? html`<a href="${url}" target="_blank" rel="noopener" aria-label="Open ${alt} image at its original size"><img src="${url}" alt="${alt}" loading="lazy" /></a>` : '');

export function questionBody(question) {
  const { question_html: markup, question_image_url: url } = question.content || {};
  const context = question.context || {};
  const fullQuestion = context.full_question_html || (context.full_question_image_url && isSafeUrl(context.full_question_image_url));
  return html`<div class="stack">
    ${question.part_label ? html`<p class="small muted">Part ${question.part_label} only · ${question.marks} ${question.marks === 1 ? 'mark' : 'marks'}</p>` : ''}
    ${context.shared_stem_html ? html`<div class="qcontent question-stem">${sanitizeHtml(context.shared_stem_html)}</div>` : ''}
    <div class="qcontent question-selected-part">${sanitizeHtml(markup)}${image(url, `Question ${question.question_number}${question.part_label ? `, part ${question.part_label}` : ''}`)}</div>
    ${fullQuestion ? html`<details class="question-context">
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
  return html`<div class="ms"><div class="qcontent">${sanitizeHtml(markup)}${image(url, 'Mark scheme')}</div></div>`;
}

/** Plain-text opening of a question, for list cards. */
export function questionSnippet(question, length = 220) {
  const template = document.createElement('template');
  template.innerHTML = sanitizeHtml(question.content?.question_html)
    .toString()
    .replace(/<\/span><span class="frac__d">/g, '/') // fractions read as a/b
    .replace(/></g, '> <'); // keep words in neighbouring elements apart
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
  return [paperLabel, `Q${number}${part}`].filter(Boolean).join(' · ');
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
