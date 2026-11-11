// Rendering of questions and mark schemes, shared by lists, the session runner and reviews.
// A question's content may be HTML, an image, or both (PRD 8.2: question_html / question_image_url).

import { html, isSafeUrl, sanitizeHtml } from '../core/dom.js';
import { fmtMinutes } from '../core/utils.js';
import { difficultyBadge, sourceBadge } from './ui.js';

const image = (url, alt) => (url && isSafeUrl(url) ? html`<img src="${url}" alt="${alt}" loading="lazy" />` : '');

export function questionBody(question) {
  const { question_html: markup, question_image_url: url } = question.content || {};
  return html`<div class="qcontent">${sanitizeHtml(markup)}${image(url, `Question ${question.question_number}`)}</div>`;
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
  return [paperLabel, `Q${question.question_number}`].filter(Boolean).join(' · ');
}

export const marksPill = (marks) => html`<span class="marks-pill">${marks} ${marks === 1 ? 'mark' : 'marks'}</span>`;

/** Marks, time, difficulty, source and (optionally) the topics a question is tagged with. */
export function questionMeta(question, { specIndex = null, topics = true } = {}) {
  const tags = topics && specIndex ? [...new Set((question.primary_spec_points || []).map((id) => specIndex.topicOf(id)?.title || specIndex.label(id)))] : [];
  return html`<div class="qcard__meta">
    ${difficultyBadge(question.difficulty)}
    <span class="small muted">about ${fmtMinutes(question.estimated_minutes || 1)}</span>
    ${sourceBadge(question)} ${tags.map((tag) => html`<span class="tag">${tag}</span>`)}
    ${(question.crossover_spec_points || []).length ? html`<span class="tag" title="Also needs knowledge from other topics">+ crossover</span>` : ''}
  </div>`;
}
