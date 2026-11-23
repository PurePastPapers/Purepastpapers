// Rendering of questions and mark schemes, shared by lists, the session runner and reviews.
// A question's content may be HTML, an image, or both (PRD 8.2: question_html / question_image_url).

import { html, isSafeUrl, sanitizeHtml } from '../core/dom.js';
import { sourceImage } from '../data/source-images.js';
import { fmtMinutes } from '../core/utils.js';
import { difficultyBadge, sourceBadge } from './ui.js';
import { icon } from './icons.js';

const image = sourceImage;

export function questionBody(question, { contextOpen = false } = {}) {
  const { question_html: markup, question_image_url: url } = question.content || {};
  const context = question.context || {};
  const fullQuestion = context.full_question_html || (context.full_question_image_url && isSafeUrl(context.full_question_image_url));
  return html`<div class="stack">
    ${question.part_label ? html`<p class="small muted">Part ${question.part_label} only · ${question.marks} ${question.marks === 1 ? 'mark' : 'marks'}</p>` : ''}
    ${context.shared_stem_html ? html`<div class="qcontent question-stem">${sanitizeHtml(context.shared_stem_html)}</div>` : ''}
    ${resources(question)}
    ${question.provenance?.source_lead_in_regions && !question.provenance.source_lead_in_in_stem ? partLeadIn(question) : ''}
    <div class="qcontent question-selected-part">${sanitizeHtml(markup)}${image(url, `${question.preview_text || 'Source-rendered question'}. Question ${question.question_number}${question.part_label ? `, part ${question.part_label}` : ''}`)}</div>
    ${fullQuestion ? html`<details class="question-context" data-question-context="${question.question_id}" ${contextOpen ? 'open' : ''}>
      <summary>Show full question for context</summary>
      <div class="stack" style="margin-top:12px">
        <p class="small muted">Context only. Answer and mark only the selected ${question.part_label ? 'part' : 'question'} above; other parts do not count towards this attempt.</p>
        <div class="qcontent">${sanitizeHtml(context.full_question_html)}${image(context.full_question_image_url, 'Full question for context only')}</div>
      </div>
    </details>` : ''}
    ${articleResource(question)}
  </div>`;
}

function articleResource(question) {
  const article = question.context?.article;
  if (!article) return '';
  const articlePages = (article.page_image_urls || []).filter(isSafeUrl);
  return articlePages.length ? html`<details class="question-context" data-article-context="${question.question_id}">
      <summary>Pre-release scientific article (unscored context)</summary>
      <div class="stack" style="margin-top:12px">
        <p class="small muted">Pearson issued this article to candidates before the exam. It is context only and carries no marks.</p>
        ${articlePages.map((page, index) => html`<div class="qcontent">${image(page, `Scientific article page ${index + 1}`)}</div>`)}
        ${article.url && /^https:/i.test(article.url) ? html`<p class="small"><a href="${article.url}" target="_blank" rel="noopener">Open the official article PDF</a></p>` : ''}
      </div>
    </details>` : html`<p class="small muted">This question uses the pre-release scientific article for its paper. Pearson has not made that article publicly available, so it is not reproduced here.</p>`;
}

/**
 * Printed resources a part needs but does not score: a question's shared stem (e.g. an
 * AQA fieldwork scenario) and figures from the insert or printed with an earlier part.
 * Shown open, before the part, and labelled unscored.
 */
function resources(question) {
  const context = question.context || {};
  const stem = context.stem_image_url && isSafeUrl(context.stem_image_url) ? context.stem_image_url : null;
  // Several printed introductions, e.g. a question's code listing and then its part's lead-in.
  const intros = (Array.isArray(context.intros) ? context.intros : []).filter((intro) => intro && isSafeUrl(intro.image_url));
  const figures = (Array.isArray(context.figures) ? context.figures : []).filter((figure) =>
    figure && (isSafeUrl(figure.image_url) || /^https:\/\//i.test(figure.official_url || '')));
  if (!stem && !intros.length && !figures.length) return '';
  return html`<section class="stack question-resources" aria-label="Resources for this question (unscored)" data-question-resources="${question.question_id}">
    <p class="small muted">Resources for this question. Unscored context: they carry no marks of their own.</p>
    ${stem ? html`<figure class="qcontent"><figcaption class="small">${question.part_label ? `Question ${question.question_number}: introduction and earlier material this part uses` : `Question ${question.question_number} (shared introduction)`}</figcaption>${image(stem, `Introduction to question ${question.question_number}, unscored context`)}</figure>` : ''}
    ${intros.map((intro) => html`<figure class="qcontent"><figcaption class="small">${intro.label} (printed introduction)</figcaption>${image(intro.image_url, `${intro.label}, unscored context`)}</figure>`)}
    ${figures.map((figure) => html`<figure class="qcontent">
      <figcaption class="small">${figure.label} · ${figure.source === 'insert' ? 'from the insert' : figure.source === 'resource_booklet' ? 'from the resources booklet' : 'from the question paper'}</figcaption>
      ${image(figure.image_url, `${figure.label}, unscored resource`)}
      ${/^https:\/\//i.test(figure.official_url || '') ? html`<a class="small" href="${figure.official_url}" target="_blank" rel="noopener">Open the official source for ${figure.label}</a>` : ''}
    </figure>`)}
  </section>`;
}

export function markSchemeBody(question, { wholeQuestion = true } = {}) {
  const { mark_scheme_html: markup, mark_scheme_image_url: url } = question.content || {};
  if (!markup && !url) return html`<p class="muted">No mark scheme has been added for this question yet.</p>`;
  const full = wholeQuestion && question.scheme_scope === 'part' && question.context?.full_scheme_image_url && isSafeUrl(question.context.full_scheme_image_url) ? question.context.full_scheme_image_url : null;
  return html`<div class="ms">${question.scheme_scope === 'full_question' && question.part_label ? html`<p class="small muted">Official scheme for the original question, including other parts. Save marks only for the selected ${question.marks}-mark unit.</p>` : question.scheme_scope === 'parent_part' ? html`<p class="small muted">The board prints this scheme for the whole part${question.scheme_part ? ` ${question.scheme_part}` : ''}. Save marks only for the selected ${question.marks}-mark unit.</p>` : ''}<div class="qcontent">${sanitizeHtml(markup)}${image(url, question.part_label ? `Mark scheme for part ${question.part_label}` : 'Mark scheme')}</div>
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
export function questionMeta(question, { specIndex = null, topics = true, organisation = 'textbook', referencesOpen = false, level = '' } = {}) {
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
    ${difficultyBadge(question.difficulty)}${level
      ? html`<span class="tag" data-level="${level}">${level} · ${question.qualification_code || question.spec_code || ''}</span>`
      : question.is_as ? html`<span class="tag">AS · ${question.qualification_code || 'AS'}</span>` : ''}
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

// ── linked parts (engine/linked-parts.js): one question, every part with its own answer ──

/** "June 2022 Paper 1H · Q10(a)–(d)", or "… · Q21–22" when the group spans questions. */
export function linkedRef(entry, papersById) {
  const numbers = [...new Set(entry.parts.map((part) => String(part.question_number)))];
  if (numbers.length > 1) {
    const paper = papersById?.get(entry.paper_id);
    const questions = entry.linked_group?.contiguous ? `Q${numbers[0]}–${numbers.at(-1)}` : numbers.map((number) => `Q${number}`).join(', ');
    return [paper ? paper.title.replace(/:.*/, '') : '', questions].filter(Boolean).join(' · ');
  }
  return questionRef({ ...entry.parts[0], part_label: entry.part_label }, papersById);
}

/** A part's own label: "(c)", or "Q22" for a group that spans questions. */
export function linkedPartLabel(part, entry) {
  const spans = new Set(entry.parts.map((item) => String(item.question_number))).size > 1;
  return spans ? `Q${part.question_number}${part.part_label && !/^\d/.test(part.part_label) ? part.part_label : ''}` : (part.part_label || `Q${part.question_number}`);
}

/** The earlier parts of the group whose answers this part uses. */
export function linkedUses(part, entry) {
  return (part.depends_on_question_ids || [])
    .map((id) => entry.parts.find((item) => item.question_id === id))
    .filter(Boolean)
    .map((item) => linkedPartLabel(item, entry));
}

export function linkedNote(entry) {
  const users = entry.parts.filter((part) => linkedUses(part, entry).length);
  const join = (labels) => labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}` : labels[0];
  const usedBy = users.map((part) => linkedPartLabel(part, entry));
  const used = [...new Set(users.flatMap((part) => linkedUses(part, entry)))];
  return html`<p class="qgroup__note">${icon('layers', { size: 18 })}<span><strong>${entry.parts.length} linked parts, shown as one question.</strong>
    ${usedBy.length === 1 ? `Part ${usedBy[0]} uses your answer to ${join(used)}, so answer them in order.` : usedBy.length ? `Parts ${join(usedBy)} build on your earlier answers, so answer them in order.` : 'Answer them in order.'}
    Each part has its own answer box and its own marks.</span></p>`;
}

/** The question's introduction and printed resources, shown once above the parts. */
export function linkedIntro(entry) {
  const parents = new Set();
  const assets = new Set();
  const articles = new Set();
  const firstUse = (seen, key) => {
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  return html`${entry.parts.map((part) => {
    const context = part.context || {};
    const showStem = firstUse(parents, part.parent_question_id || part.question_number);
    const extra = {
      stem_image_url: showStem && firstUse(assets, context.stem_image_url) ? context.stem_image_url : null,
      intros: Array.isArray(context.intros) ? context.intros.filter((intro) => firstUse(assets, intro?.image_url)) : [],
      figures: Array.isArray(context.figures) ? context.figures.filter((figure) => firstUse(assets, figure?.image_url)) : [],
    };
    const article = context.article && firstUse(articles, context.article.url || part.paper_id);
    return html`${showStem && context.shared_stem_html ? html`<div class="qcontent question-stem">${sanitizeHtml(context.shared_stem_html)}</div>` : ''}
      ${resources({ ...part, part_label: '', context: extra })}
      ${article ? articleResource(part) : ''}`;
  })}`;
}

/** One part's own printed text: anything printed just before its label, then its crop. */
export function linkedPartBody(part) {
  const { question_html: markup, question_image_url: url } = part.content || {};
  return html`${partLeadIn(part)}
    <div class="qcontent">${sanitizeHtml(markup)}${image(url, `${part.preview_text || 'Question part'}. Part ${part.part_label || part.question_number}`)}</div>`;
}

function partLeadIn(part) {
  const lead = part.context?.lead_in_image_url;
  return lead && isSafeUrl(lead)
    ? html`<div class="qcontent qgroup__lead">${image(lead, `Text printed before part ${part.part_label || ''}`)}</div>`
    : '';
}
