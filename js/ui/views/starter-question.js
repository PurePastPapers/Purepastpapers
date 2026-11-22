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

const STARTER_SUBJECT_ID = 'EDX_GCSE_MATH_1MA1';
const PREFERRED_QUESTIONS = ['EDX_1MA1_2025_JUNE_1F_Q02_U01', 'EDX_1MA1_2025_JUNE_1F_Q03_U01'];

export function selectStarterQuestion({ questions, papersById }) {
  const eligible = questions.filter((question) => {
    const paper = papersById.get(question.paper_id);
    return question.subject_id === STARTER_SUBJECT_ID &&
      question.source_type === 'real_past_paper' && paper?.paper_type === 'real_past_paper' &&
      !question.is_sample && !question.is_official_sample && !question.part_label &&
      !question.linked_group && !question.depends_on_question_ids?.length &&
      !Object.keys(question.context || {}).length && question.include_in_custom_pool !== false &&
      questionTier(question, papersById) === 'Foundation' && paper.tier === 'Foundation' &&
      question.difficulty === 'easy' && question.marks >= 1 && question.marks <= 2 &&
      question.scheme_scope === 'whole_question' &&
      String(question.scheme_question_number) === String(question.question_number) &&
      question.provenance?.review_status === 'model_reviewed' &&
      question.content?.question_image_url && question.content?.mark_scheme_image_url &&
      paper.full_paper_pdf_url && paper.full_mark_scheme_pdf_url;
  });
  for (const id of PREFERRED_QUESTIONS) {
    const preferred = eligible.find((question) => question.question_id === id);
    if (preferred) return preferred;
  }
  return eligible[0];
}

export async function mount(element) {
  const bundle = await getBundle(STARTER_SUBJECT_ID);
  const { subject, papersById } = bundle;
  const question = selectStarterQuestion(bundle);
  const tier = question ? questionTier(question, papersById) : null;
  const chooseSubject = links.subjects({ browse: 1, subject: STARTER_SUBJECT_ID, tier });
  if (!element.isConnected) return;
  tintPage(subject);
  if (!question) {
    setHtml(element, emptyState({
      title: 'Choose a question to practise',
      text: 'Browse the Edexcel GCSE Maths question bank or choose another subject.',
      action: html`<div class="row"><a class="btn btn--primary" href="${links.practice({ subject: STARTER_SUBJECT_ID })}">Browse Edexcel GCSE Maths</a><a class="btn" href="${chooseSubject}">Choose another subject</a></div>`,
    }));
    return;
  }

  const paper = papersById.get(question.paper_id);
  const ref = questionRef(question, papersById).replace(/ \((?:Non-Calculator|Calculator|Foundation)\)/g, '');
  const practice = { subject: STARTER_SUBJECT_ID, mode: 'individual', tier };
  const enrolled = api.getProgress().enrolled_subjects.includes(STARTER_SUBJECT_ID);
  setHtml(element, html`<div class="starter-practice stack" style="${scStyle(subject)}">
    ${pageHead({ title: 'Edexcel GCSE Maths', sub: `${tier} tier · ${subject.spec_code}/${paper.paper_code}${paper.calculator === false ? ' · Non-calculator' : ''}` })}
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
          <h3>Keep practising Edexcel GCSE Maths</h3>
          <p class="small muted">${tier} tier is selected.</p>
          <div class="row row--tight">
            <a class="btn btn--primary" href="${links.practice(practice)}">Continue with Maths</a>
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
      </div><div class="starter-practice__scheme-crop" tabindex="0" role="group" aria-label="Official mark scheme image" data-zoom-src="Official mark scheme · ${ref}"><div data-zoom-body>${markSchemeBody(question)}</div></div>`);
    }
    scheme.hidden = !scheme.hidden;
    button.setAttribute('aria-expanded', String(!scheme.hidden));
    setHtml(button, html`${icon('eye', { size: 16 })} ${scheme.hidden ? 'Show mark scheme' : 'Hide mark scheme'}`);
  });
  on(element, 'click', '[data-starter-enrol]', async (event, button) => {
    if (!(await addSubject(subject, { initialTier: tier }))) return;
    button.remove();
    toast('Maths added to My Subjects.', { type: 'success' });
  });
}
