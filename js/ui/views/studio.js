// Content Studio — tools for whoever maintains the question and paper database.
//   • checks every subject's data against the schemas
//   • keeps a "content pack" in this browser so new questions can be tried immediately
//   • exports that pack as JSON to drop into /data/packs for everyone
// The same pack format carries Phase 2 AI questions and Phase 3 predicted papers.

import { DIFFICULTIES, SOURCE_TYPES } from '../../config/app.config.js';
import { $, download, html, on, readFileText, setHtml } from '../../core/dom.js';
import { plural } from '../../core/utils.js';
import { getBundles, getSubjects, invalidateContent, readLocalPack, specIndex, writeLocalPack } from '../../data/content-repository.js';
import { validateBundle, validateQuestion } from '../../data/schema.js';
import { icon } from '../icons.js';
import { banner, confirmDialog, loadingBlock, pageHead, subjectName, toast } from '../ui.js';

export async function mount(element, context) {
  context.setTitle('Content Studio');
  const subjects = (await getSubjects()).filter((subject) => subject.has_written_exam);

  setHtml(
    element,
    html`${pageHead({
        crumbs: [{ label: 'Account', href: '#/account' }, { label: 'Content Studio' }],
        title: 'Content Studio',
        sub: 'For the site owner. Check the database, add questions to a content pack, and export the pack for the site.',
      })}
      <div class="stack stack--lg">
        ${banner(
          html`Content lives in the <span class="mono">/data</span> folder as JSON. Additions made here are saved as a <strong>content pack in this browser</strong>, so
            you can try them straight away. To publish them, export the pack, save it in <span class="mono">/data/packs</span> and list it in
            <span class="mono">/data/packs/index.json</span>. Question papers are the copyright of their exam boards: only add material you are allowed to use.`,
        )}
        <section class="card" data-pack></section>
        <section class="card">
          <div class="card__head"><h2 class="card__title">Add a question</h2></div>
          <form class="stack" data-question-form novalidate>
            <div class="grid">
              <label class="field"><span class="field__label">Subject</span>
                <select class="select" name="subject_id">${subjects.map((subject) => html`<option value="${subject.subject_id}">${subjectName(subject)}</option>`)}</select>
              </label>
              <label class="field"><span class="field__label">Paper</span><select class="select" name="paper_id" data-papers></select></label>
              <label class="field"><span class="field__label">Source</span>
                <select class="select" name="source_type">${Object.entries(SOURCE_TYPES).map(([value, type]) => html`<option value="${value}">${type.label}</option>`)}</select>
              </label>
            </div>
            <div class="grid">
              <label class="field"><span class="field__label">Question number</span><input class="input" name="question_number" placeholder="7" required /></label>
              <label class="field"><span class="field__label">Marks</span><input class="input" type="number" name="marks" min="1" step="1" required /></label>
              <label class="field"><span class="field__label">Estimated minutes</span><input class="input" type="number" name="estimated_minutes" min="1" step="1" placeholder="auto" /></label>
              <label class="field"><span class="field__label">Difficulty</span>
                <select class="select" name="difficulty">${DIFFICULTIES.map((difficulty) => html`<option value="${difficulty.id}">${difficulty.label}</option>`)}</select>
              </label>
            </div>
            <div class="grid grid--2">
              <label class="field">
                <span class="field__label">Primary spec points</span>
                <select class="select select--list" name="primary" multiple size="9" data-points></select>
                <span class="field__hint">The topics the question tests. Hold Ctrl or Cmd to choose several.</span>
              </label>
              <div class="stack">
                <label class="field">
                  <span class="field__label">Crossover spec points (same subject)</span>
                  <select class="select select--list" name="crossover" multiple size="5" data-points></select>
                </label>
                <label class="field">
                  <span class="field__label">Crossover spec points from other subjects</span>
                  <input class="input mono" name="crossover_other" placeholder="EDX_MATH_PURE_TRIG, EDX_MATH_PURE_EXP_6.3" />
                  <span class="field__hint">Spec point or topic ids, separated by commas.</span>
                </label>
              </div>
            </div>
            <div class="grid grid--2">
              <label class="field"><span class="field__label">Question (HTML)</span><textarea class="textarea mono" name="question_html" placeholder="&lt;p&gt;Question text…&lt;/p&gt;"></textarea></label>
              <label class="field"><span class="field__label">Mark scheme (HTML)</span><textarea class="textarea mono" name="mark_scheme_html" placeholder="&lt;p&gt;Mark scheme…&lt;/p&gt;"></textarea></label>
              <label class="field"><span class="field__label">Question image path or URL</span><input class="input mono" name="question_image_url" placeholder="assets/papers/9PH0_2024_P1_Q7.png" /></label>
              <label class="field"><span class="field__label">Mark scheme image path or URL</span><input class="input mono" name="mark_scheme_image_url" placeholder="assets/ms/9PH0_2024_P1_Q7_MS.png" /></label>
            </div>
            <label class="check"><input type="checkbox" name="include_in_custom_pool" checked /><span>Include in the customisable practice pool</span></label>
            <div data-form-issues></div>
            <div><button type="submit" class="btn btn--primary">${icon('plus', { size: 16 })} Add to the content pack</button></div>
          </form>
        </section>
        <section class="card">
          <div class="card__head">
            <h2 class="card__title">Database check</h2>
            <button type="button" class="btn btn--sm" data-check>${icon('refresh', { size: 15 })} Check all subjects</button>
          </div>
          <div data-health><p class="muted small">Loads every subject and validates its papers and questions against the schema.</p></div>
        </section>
      </div>`,
  );

  // ── local content pack ──
  function drawPack() {
    const pack = readLocalPack();
    setHtml(
      $('[data-pack]', element),
      html`<div class="card__head">
          <h2 class="card__title">Content pack in this browser</h2>
          <span class="small muted">${plural(pack.questions.length, 'question')} · ${plural(pack.papers.length, 'paper')}</span>
        </div>
        <div class="row">
          <button type="button" class="btn" data-pack-export ${pack.questions.length + pack.papers.length ? '' : 'disabled'}>${icon('download')} Export pack</button>
          <label class="btn">${icon('upload')} Import pack<input type="file" accept="application/json,.json" data-pack-import hidden /></label>
          <button type="button" class="btn btn--ghost" data-pack-clear ${pack.questions.length + pack.papers.length ? '' : 'disabled'}>Clear pack</button>
        </div>
        ${pack.questions.length
          ? html`<ul class="facts" style="margin-top:14px">
              ${pack.questions.slice(-8).map((question) => html`<li><span class="mono small">${question.question_id}</span><strong>${question.marks} marks</strong></li>`)}
            </ul>`
          : ''}`,
    );
  }

  // ── question form ──
  const form = $('[data-question-form]', element);
  async function fillSubjectFields() {
    const subjectId = form.elements.subject_id.value;
    const bundle = (await getBundles([subjectId])).get(subjectId);
    if (!bundle) return;
    setHtml(
      $('[data-papers]', form),
      html`<option value="">No paper (standalone question)</option>
        ${bundle.papers.map((paper) => html`<option value="${paper.paper_id}">${paper.title}</option>`)}`,
    );
    const options = bundle.spec.sections.map(
      (section) =>
        html`<optgroup label="${section.title}">
          ${section.topics.flatMap((topic) => topic.points.map((point) => html`<option value="${point.id}">${topic.title}: ${point.code} ${point.title}</option>`))}
        </optgroup>`,
    );
    for (const select of form.querySelectorAll('[data-points]')) setHtml(select, options);
  }

  on(element, 'change', '[name="subject_id"]', fillSubjectFields);

  on(element, 'submit', '[data-question-form]', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const subjectId = data.get('subject_id');
    const bundle = (await getBundles([subjectId])).get(subjectId);
    const { subject } = bundle;
    const paper = bundle.papersById.get(data.get('paper_id')) || null;
    const number = String(data.get('question_number') || '').trim();
    const marks = Number(data.get('marks'));
    const otherPoints = String(data.get('crossover_other') || '').split(',').map((id) => id.trim()).filter(Boolean);
    const stem = paper ? paper.paper_id : `${subject.id_stem}_${data.get('source_type') === 'ai_spec_question' ? 'AISPEC' : 'EXTRA'}`;
    const question = {
      question_id: `${stem}_Q${number.padStart(2, '0')}`,
      source_type: data.get('source_type'),
      paper_id: paper?.paper_id ?? null,
      include_in_custom_pool: data.get('include_in_custom_pool') === 'on',
      subject_id: subjectId,
      board: subject.board,
      level: subject.level,
      subject: subject.subject,
      spec_code: subject.spec_code,
      subject_category: subject.subject_category,
      year: paper?.year ?? null,
      series: paper?.series ?? null,
      question_number: number,
      marks,
      estimated_minutes: Number(data.get('estimated_minutes')) || Math.max(1, Math.round(marks * (subject.level === 'GCSE' ? 1.1 : 1.25))),
      difficulty: data.get('difficulty'),
      primary_spec_points: data.getAll('primary'),
      crossover_spec_points: [...data.getAll('crossover'), ...otherPoints],
      content: {
        question_html: String(data.get('question_html') || '').trim() || null,
        question_image_url: String(data.get('question_image_url') || '').trim() || null,
        mark_scheme_html: String(data.get('mark_scheme_html') || '').trim() || null,
        mark_scheme_image_url: String(data.get('mark_scheme_image_url') || '').trim() || null,
      },
    };
    const issues = validateQuestion(question, { specIndex, paperIds: new Set(bundle.papers.map((item) => item.paper_id)), subjectId });
    if (!number) issues.unshift({ level: 'error', message: 'Enter the question number.' });
    if (bundle.questionsById.has(question.question_id)) issues.unshift({ level: 'error', message: `${question.question_id} already exists. Use a different question number.` });
    const errors = issues.filter((item) => item.level === 'error');
    setHtml(
      $('[data-form-issues]', form),
      issues.length ? banner(html`<ul class="issues">${issues.map((item) => html`<li><strong>${item.level === 'error' ? 'Fix' : 'Note'}:</strong> ${item.message}</li>`)}</ul>`, { type: errors.length ? 'error' : 'warn' }) : '',
    );
    if (errors.length) return;
    const pack = readLocalPack();
    pack.questions = [...pack.questions.filter((item) => item.question_id !== question.question_id), question];
    writeLocalPack(pack);
    drawPack();
    toast(`${question.question_id} added. It is now in the practice pool on this device.`, { type: 'success' });
  });

  on(element, 'click', '[data-pack-export]', () => {
    const pack = readLocalPack();
    download('content-pack.json', JSON.stringify({ ...pack, pack_id: `pack-${new Date().toISOString().slice(0, 10)}`, title: 'Content pack' }, null, 2));
  });
  on(element, 'change', '[data-pack-import]', async (event, input) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const incoming = JSON.parse(await readFileText(file));
      if (!Array.isArray(incoming.questions) && !Array.isArray(incoming.papers)) throw new Error('That file is not a content pack: it needs "questions" or "papers".');
      const pack = readLocalPack();
      const merge = (current, added, key) => [...current.filter((item) => !added.some((other) => other[key] === item[key])), ...added];
      pack.questions = merge(pack.questions, incoming.questions || [], 'question_id');
      pack.papers = merge(pack.papers, incoming.papers || [], 'paper_id');
      writeLocalPack(pack);
      drawPack();
      toast(`Imported ${plural((incoming.questions || []).length, 'question')} and ${plural((incoming.papers || []).length, 'paper')}. Run the database check to validate them.`, { type: 'success' });
    } catch (error) {
      toast(error instanceof SyntaxError ? 'That file is not valid JSON.' : error.message, { type: 'error' });
    }
  });
  on(element, 'click', '[data-pack-clear]', async () => {
    const confirmed = await confirmDialog({ title: 'Clear the content pack?', message: 'Questions and papers added in this browser will be removed. Export the pack first if you want to keep them.', confirmLabel: 'Clear pack', danger: true });
    if (!confirmed) return;
    writeLocalPack({ papers: [], questions: [] });
    drawPack();
  });

  // ── database check ──
  on(element, 'click', '[data-check]', async () => {
    const target = $('[data-health]', element);
    setHtml(target, loadingBlock('Checking every subject…'));
    invalidateContent();
    const bundles = await getBundles(subjects.map((subject) => subject.subject_id));
    const rows = [...bundles.values()].map((bundle) => {
      const issues = validateBundle(bundle, specIndex);
      return {
        bundle,
        issues,
        official: bundle.papers.filter((paper) => paper.paper_type === 'real_past_paper' && !paper.is_sample).length,
        withPdf: bundle.papers.filter((paper) => paper.full_paper_pdf_url).length,
        real: bundle.questions.filter((question) => question.source_type === 'real_past_paper' && !question.is_sample).length,
        demo: bundle.questions.filter((question) => question.is_sample).length,
        ai: bundle.questions.filter((question) => question.source_type !== 'real_past_paper').length,
      };
    });
    const allIssues = rows.flatMap((row) => row.issues.map((item) => ({ ...item, subject: row.bundle.subject })));
    const errorCount = allIssues.filter((item) => item.level === 'error').length;
    setHtml(
      target,
      html`${banner(
          errorCount
            ? html`<strong>${plural(errorCount, 'error')}</strong> and ${plural(allIssues.length - errorCount, 'warning')} found.`
            : html`<strong>No errors.</strong> ${allIssues.length ? plural(allIssues.length, 'warning') : 'Every record matches the schema.'}`,
          { type: errorCount ? 'error' : 'info' },
        )}
        ${allIssues.length
          ? html`<ul class="issues" style="margin-top:12px">
              ${allIssues.slice(0, 60).map((item) => html`<li><strong>${item.level === 'error' ? 'Error' : 'Warning'}</strong> · ${item.subject.subject} · <span class="mono small">${item.id}</span>: ${item.message}</li>`)}
            </ul>`
          : ''}
        <div class="table-wrap" style="margin-top:14px">
          <table class="table table--compact">
            <thead>
              <tr><th>Subject</th><th class="num">Official papers</th><th class="num">With PDF</th><th class="num">Official questions</th><th class="num">Demo questions</th><th class="num">AI questions</th><th class="num">Issues</th></tr>
            </thead>
            <tbody>
              ${rows.map(
                (row) =>
                  html`<tr>
                    <td>${subjectName(row.bundle.subject)}</td>
                    <td class="num">${row.official}</td><td class="num">${row.withPdf}</td><td class="num">${row.real}</td>
                    <td class="num">${row.demo}</td><td class="num">${row.ai}</td><td class="num">${row.issues.length}</td>
                  </tr>`,
              )}
            </tbody>
          </table>
        </div>`,
    );
  });

  drawPack();
  await fillSubjectFields();
}
