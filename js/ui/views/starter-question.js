// The guest entry into Practice. Uses the same official question and scheme renderer
// as the question browser, without loading or changing the visitor's study settings.
import { $, html, on, setHtml } from '../../core/dom.js';
import { links } from '../../core/links.js';
import { getBundle } from '../../data/content-repository.js';
import { questionTier } from '../../engine/tiers.js';
import { addSubject } from '../enrol.js';
import { icon } from '../icons.js';
import { markSchemeBody, marksPill, questionBody, questionRef } from '../question-view.js';
import { scStyle, tintPage } from '../subject-colours.js';
import { emptyState, pageHead, toast } from '../ui.js';
import { zoomButton } from '../zoom.js';
import * as api from '../../data/api.js';

import { DEMO_SUBJECTS } from '../demo-subjects.js';

export function selectStarterQuestion({ questions, papersById }, demo = DEMO_SUBJECTS[0]) {
  const eligible = questions.filter((question) => {
    const paper = papersById.get(question.paper_id);
    return question.subject_id === demo.id &&
      question.source_type === 'real_past_paper' && paper?.paper_type === 'real_past_paper' &&
      !question.is_sample && !question.is_official_sample &&
      !question.linked_group && !question.depends_on_question_ids?.length &&
      Object.keys(question.context || {}).every((key) => ['full_question_image_url', 'full_scheme_image_url'].includes(key)) &&
      question.include_in_custom_pool !== false &&
      questionTier(question, papersById) === demo.tier && (paper.tier ?? null) === demo.tier &&
      question.difficulty === 'easy' && question.marks >= 1 && question.marks <= 2 &&
      (question.part_label ? question.scheme_scope === 'part' : question.scheme_scope === 'whole_question') &&
      String(question.scheme_question_number) === `${question.question_number}${question.part_label || ''}` &&
      question.provenance?.review_status === 'model_reviewed' &&
      question.content?.question_image_url && question.content?.mark_scheme_image_url &&
      paper.full_paper_pdf_url && paper.full_mark_scheme_pdf_url;
  });
  for (const id of demo.questions) {
    const preferred = eligible.find((question) => question.question_id === id);
    if (preferred) return preferred;
  }
  return eligible[0];
}

export async function mount(element, subjectId) {
  const demo = DEMO_SUBJECTS.find(({ id }) => id === subjectId) || DEMO_SUBJECTS[0];
  const bundle = await getBundle(demo.id);
  const { subject, papersById } = bundle;
  const title = `${subject.board} ${subject.level} ${demo.name}`;
  const question = selectStarterQuestion(bundle, demo);
  const tier = question ? questionTier(question, papersById) : null;
  const chooseSubject = links.subjects({ browse: 1, subject: demo.id, tier });
  if (!element.isConnected) return;
  tintPage(subject);
  if (!question) {
    setHtml(element, emptyState({
      title: 'Choose a question to practise',
      text: `Browse the ${title} question bank or choose another subject.`,
      action: html`<div class="row"><a class="btn btn--primary" href="${links.practice({ subject: demo.id })}">Browse ${title}</a><a class="btn" href="${chooseSubject}">Choose another subject</a></div>`,
    }));
    return;
  }

  const paper = papersById.get(question.paper_id);
  const ref = questionRef(question, papersById).replace(/ \((?:Non-Calculator|Calculator|Foundation|Higher)\)/g, '');
  const practice = { subject: demo.id, mode: 'individual', tier };
  const enrolled = api.getProgress().enrolled_subjects.includes(demo.id);
  setHtml(element, html`<div class="starter-practice stack" style="${scStyle(subject)}">
    ${pageHead({ title, sub: `${tier ? `${tier} tier · ` : ''} ${subject.spec_code}/${paper.paper_code}${paper.calculator === false ? ' · Non-calculator' : ''}` })}
    <article class="card stack" data-starter-card="${question.question_id}">
      <header class="starter-practice__heading">
        <h2 class="card__title">${ref}</h2>
        ${marksPill(question.marks)}
      </header>
      <div data-zoom-src="${ref}">
        <div class="starter-practice__question" data-zoom-body>${questionBody(question)}</div>
        <div class="starter-practice__actions">
          <button type="button" class="btn btn--primary" data-starter-scheme aria-expanded="false" aria-controls="starter-scheme">${icon('eye', { size: 16 })} Show mark scheme</button>
          ${zoomButton('question')}
        </div>
      </div>
      <section id="starter-scheme" class="starter-practice__scheme stack stack--sm" aria-labelledby="starter-scheme-title" hidden></section>
      <p class="muted">Filter past-paper questions by exam paper, topic or exact specification point, or build a timed test.</p>
      <details class="starter-practice__more">
        <summary class="btn">Find more questions ${icon('chevronDown', { size: 16 })}</summary>
        <div class="stack stack--sm starter-practice__choices">
          <h3>Keep practising ${title}</h3>
          ${tier ? html`<p class="small muted">${tier} tier is selected.</p>` : ''}
          <div class="row row--tight">
            <a class="btn btn--primary" href="${links.practice(practice)}">Continue with ${demo.name}</a>
            <a class="btn" href="${links.practice({ ...practice, filters: 'topics' })}">Choose topics</a>
            <a class="btn" href="${chooseSubject}">Choose another subject</a>
            ${enrolled ? '' : html`<button type="button" class="btn btn--ghost" data-starter-enrol>Add to My Subjects</button>`}
          </div>
        </div>
      </details>
    </article>
  </div>`);

  on(element, 'click', '[data-starter-scheme]', (event, button) => {
    const scheme = $('#starter-scheme', element);
    if (!scheme.hasChildNodes()) {
      setHtml(scheme, html`<div class="qsplit__head"><h3 id="starter-scheme-title">Official mark scheme</h3>
        <a class="btn btn--sm" href="${paper.full_mark_scheme_pdf_url}" target="_blank" rel="noopener" aria-label="Full scheme PDF">Scheme PDF ${icon('external', { size: 14 })}</a>
      </div><div class="starter-practice__scheme-crop" tabindex="0" role="group" aria-label="Official mark scheme image" data-zoom-src="Official mark scheme · ${ref}"><div data-zoom-body>${markSchemeBody(question, { wholeQuestion: !question.part_label })}</div></div>`);
    }
    scheme.hidden = !scheme.hidden;
    button.setAttribute('aria-expanded', String(!scheme.hidden));
    setHtml(button, html`${icon('eye', { size: 16 })} ${scheme.hidden ? 'Show mark scheme' : 'Hide mark scheme'}`);
  });
  on(element, 'click', '[data-starter-enrol]', async (event, button) => {
    if (!(await addSubject(subject, { initialTier: tier }))) return;
    button.remove();
    toast(`${demo.name} added to My Subjects.`, { type: 'success' });
  });
}
