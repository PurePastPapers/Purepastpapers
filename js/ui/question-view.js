// Rendering of questions and mark schemes, shared by lists, the session runner and reviews.
// A question's content may be HTML, an image, or both (PRD 8.2: question_html / question_image_url).

import { html, isSafeUrl, sanitizeHtml } from '../core/dom.js';
import { sourceImage } from '../data/source-images.js';
import { fmtMinutes } from '../core/utils.js';
import { difficultyBadge, sourceBadge } from './ui.js';

const image = sourceImage;

export function questionBody(question, { contextOpen = false } = {}) {
  const { question_html: markup, question_image_url: url } = question.content || {};
  const context = question.context || {};
  const fullQuestion = context.full_question_html || (context.full_question_image_url && isSafeUrl(context.full_question_image_url));
  const article = context.article;
  const articlePages = (article?.page_image_urls || []).filter(isSafeUrl);
  return html`<div class="stack">
    ${question.part_label ? html`<p class="small muted">Part ${question.part_label} only · ${question.marks} ${question.marks === 1 ? 'mark' : 'marks'}</p>` : ''}
    ${context.shared_stem_html ? html`<div class="qcontent question-stem">${sanitizeHtml(context.shared_stem_html)}</div>` : ''}
    ${resources(question)}
    <div class="qcontent question-selected-part">${sanitizeHtml(markup)}${image(url, `${question.preview_text || 'Source-rendered question'}. Question ${question.question_number}${question.part_label ? `, part ${question.part_label}` : ''}`)}</div>
    ${fullQuestion ? html`<details class="question-context" data-question-context="${question.question_id}" ${contextOpen ? 'open' : ''}>
      <summary>Show full question for context</summary>
      <div class="stack" style="margin-top:12px">
        <p class="small muted">Context only. Answer and mark only the selected ${question.part_label ? 'part' : 'question'} above; other parts do not count towards this attempt.</p>
        <div class="qcontent">${sanitizeHtml(context.full_question_html)}${image(context.full_question_image_url, 'Full question for context only')}</div>
      </div>
    </details>` : ''}
    ${article ? articlePages.length ? html`<details class="question-context" data-article-context="${question.question_id}">
      <summary>Pre-release scientific article (unscored context)</summary>
      <div class="stack" style="margin-top:12px">
        <p class="small muted">Pearson issued this article to candidates before the exam. It is context only and carries no marks.</p>
        ${articlePages.map((page, index) => html`<div class="qcontent">${image(page, `Scientific article page ${index + 1}`)}</div>`)}
        ${article.url && /^https:/i.test(article.url) ? html`<p class="small"><a href="${article.url}" target="_blank" rel="noopener">Open the official article PDF</a></p>` : ''}
      </div>
    </details>` : html`<p class="small muted">This question uses the pre-release scientific article for its paper. Pearson has not made that article publicly available, so it is not reproduced here.</p>` : ''}
  </div>`;
}

/**
 * Printed resources a part needs but does not score: a question's shared stem (e.g. an
 * AQA fieldwork scenario) and figures from the insert or printed with an earlier part.
 * Shown open, before the part, and labelled unscored.
 */
function resources(question) {
  const context = question.context || {};
  const stem = context.stem_image_url && isSafeUrl(context.stem_image_url) ? context.stem_image_url : null;
  const figures = (Array.isArray(context.figures) ? context.figures : []).filter((figure) => figure && isSafeUrl(figure.image_url));
  if (!stem && !figures.length) return '';
  return html`<section class="stack question-resources" aria-label="Resources for this question (unscored)" data-question-resources="${question.question_id}">
    <p class="small muted">Resources for this question. Unscored context: they carry no marks of their own.</p>
    ${stem ? html`<figure class="qcontent"><figcaption class="small">${question.part_label ? `Question ${question.question_number}: introduction and earlier material this part uses` : `Question ${question.question_number} (shared introduction)`}</figcaption>${image(stem, `Introduction to question ${question.question_number}, unscored context`)}</figure>` : ''}
    ${figures.map((figure) => html`<figure class="qcontent"><figcaption class="small">${figure.label} · ${figure.source === 'insert' ? 'from the insert' : 'printed earlier in the question paper'}</figcaption>${image(figure.image_url, `${figure.label}, unscored resource`)}</figure>`)}
  </section>`;
}

export function markSchemeBody(question) {
  const { mark_scheme_html: markup, mark_scheme_image_url: url } = question.content || {};
  if (!markup && !url) return html`<p class="muted">No mark scheme has been added for this question yet.</p>`;
  const full = question.scheme_scope === 'part' && question.context?.full_scheme_image_url && isSafeUrl(question.context.full_scheme_image_url) ? question.context.full_scheme_image_url : null;
  return html`<div class="ms">${question.scheme_scope === 'full_question' ? html`<p class="small muted">Official scheme for the original question, including other parts. Save marks only for the selected ${question.marks}-mark unit.</p>` : ''}<div class="qcontent">${sanitizeHtml(markup)}${image(url, question.part_label ? `Mark scheme for part ${question.part_label}` : 'Mark scheme')}</div>
    ${full ? html`<details class="question-context" data-full-scheme="${question.question_id}"><summary>Show the mark scheme for the whole question</summary><div class="qcontent" style="margin-top:12px">${image(full, 'Mark scheme for the whole question, context only')}</div></details>` : ''}</div>`;
}

/** Plain-text opening of a question, for list cards. */
export function questionSnippet(question, length = 220) {
  if (question.preview_text) return question.preview_text;
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
  return [paperLabel, `Q${number}${part}`].filter(Boolean).join(' · ');
}

export const marksPill = (marks) => html`<span class="marks-pill">${marks} ${marks === 1 ? 'mark' : 'marks'}</span>`;

/** Marks, time, difficulty, source and (optionally) the topics a question is tagged with. */
export function questionMeta(question, { specIndex = null, topics = true, organisation = 'textbook', referencesOpen = false } = {}) {
  const primary = question.primary_spec_points || [];
  const crossover = question.crossover_spec_points || [];
  const labelOf = (id) => {
    const node = specIndex?.get(id);
    return node ? [node.code, node.title].filter(Boolean).join(' ') : 'Unmapped specification point';
  };
  const tags = new Map();
  if (topics && specIndex) {
    for (const id of primary) {
      const title = specIndex.topicOf(id)?.title || specIndex.get(id)?.title || 'Unmapped specification point';
      if (!tags.has(title)) tags.set(title, []);
      tags.get(title).push(labelOf(id));
    }
  }
  const textbook = question.textbook_references || [];
  const bookTags = [...new Set(textbook.filter(ref => ref.role === 'Assessed').map(ref => `${ref.book} · ${ref.chapter}`))];
  return html`<div class="qcard__meta">
    ${difficultyBadge(question.difficulty)}${question.is_as ? html`<span class="tag">AS · ${question.qualification_code || 'AS'}</span>` : ''}
    <span class="small muted">about ${fmtMinutes(question.estimated_minutes || 1)}</span>
    ${sourceBadge(question)} ${organisation === 'textbook' && bookTags.length
      ? bookTags.map(title => html`<span class="tag">${title}</span>`)
      : [...tags].map(([title, labels]) => html`<span class="tag" title="${labels.join(' · ')}">${title}</span>`)}
    ${crossover.length ? html`<span class="tag" title="${specIndex ? crossover.map(labelOf).join(' · ') : 'Also needs knowledge from other topics'}">+ crossover</span>` : ''}
    ${topics && specIndex && primary.length ? html`<details class="question-reference-details" data-question-references="${question.question_id}" ${referencesOpen ? 'open' : ''}>
      <summary>Topics & references</summary><div class="stack stack--sm">
        ${textbook.length ? html`<div><strong>Textbook sections</strong><ul>${textbook.map(ref => html`<li>${ref.book} · ${ref.code} ${ref.title} <span class="small muted">(${ref.role}${ref.precision === 'chapter' ? '; chapter-level link, subsection not resolved' : ''})</span></li>`)}</ul></div>` : ''}
        <div><strong>Official ${question.board || 'exam-board'} specification</strong><ul>${[...new Set([...primary, ...crossover])].map(id => html`<li>${labelOf(id)} <span class="small muted">(${primary.includes(id) ? 'Assessed' : 'Prerequisite'})</span></li>`)}</ul></div>
        ${textbook.length ? html`<p class="small muted">Textbook subsection numbers and official specification numbers are separate references.</p>` : ''}
      </div></details>` : ''}
  </div>`;
}
