import { html, on, setHtml } from '../../core/dom.js';
import { links, routeOf } from '../../core/links.js?v=exported-tests-1';
import { fmtDate } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { getBundle } from '../../data/content-repository.js';
import { offlineRetakeId } from '../../data/offline-progress.js';
import { getMarkingProvider } from '../../engine/marking.js';
import { resolveTestSnapshot, scoreTestSnapshot, verifyTestCrops } from '../../engine/test-snapshot.js?v=20261122-pdf2';
import { exportRetention, offerTestPdf, promptForOfflineAttempt } from '../test-pdf.js?v=20261122-pdf2';
import { icon } from '../icons.js';
import { confirmDialog, emptyState, pageHead, toast } from '../ui.js';
import { renderOfflineMarking } from './offline-test.js?v=20261122-pdf2';

export function savedTestState(attempt) {
  if (!attempt) return 'Ready to complete';
  const result = attempt.result;
  if (!result) return 'Completed on paper · Not marked';
  const label = result.mode === 'overall' ? 'Overall score' : result.percentage == null ? 'Partly marked' : 'Marked by question';
  return `${label} · ${result.awarded}/${result.maxMarks}${result.percentage == null ? '' : ` · ${result.percentage}%`}`;
}

export async function mount(element, context) {
  const paperId = context.params.paperId;
  const { subject } = context.query;
  const backHref = links.exportedTests({ subject });
  const practiceHref = links.practice({ subject });
  const available = api.exportedTests();
  const owner = api.currentUser()?.user_id ?? null;
  const detailHref = (id, params) => links.exportedTest(id, { subject, ...params });
  if (!paperId) {
    const tests = available.filter(test => !subject || test.subject_id === subject)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    context.setTitle('Exported tests');
    setHtml(element, html`${pageHead({
      title: 'Exported tests', crumbs: [{ label: 'Practice', href: practiceHref }, { label: 'Exported tests' }],
    })}
    ${tests.length ? html`<p class="small muted">${exportRetention()}</p><div class="stack">${tests.map(test => html`
      <article class="card row row--between">
        <div><h2 class="h3"><a href="${detailHref(test.paper_id)}">${test.title}</a></h2>
        <p class="small muted">${fmtDate(test.created_at)} · ${test.total_marks} marks · ${savedTestState(api.offlineAttempts(test.paper_id).at(-1))}</p></div>
        <div class="row row--tight row--nowrap">
          <a class="btn btn--sm" href="${detailHref(test.paper_id)}">Open test</a>
          <button type="button" class="btn btn--sm btn--icon btn--ghost" data-delete-export="${test.paper_id}"
            aria-label="Delete ${test.title}" title="Delete exported test">${icon('x')}</button>
        </div>
      </article>`)}</div>` : emptyState({ iconName: 'file', title: 'No exported tests yet',
      text: 'Build a custom test or select questions in Practice, then choose Export PDF.',
      action: html`<a class="btn btn--primary" href="${practiceHref}">Go to Practice</a>`,
    })}`);
    return on(element, 'click', '[data-delete-export]', async (event, button) => {
      const test = tests.find(item => item.paper_id === button.dataset.deleteExport);
      if (!test) return;
      button.disabled = true;
      try {
        const confirmed = await confirmDialog({
          title: 'Delete exported test?',
          message: `Remove “${test.title}” from Exported tests? Any marks you recorded will stay in your progress.`,
          confirmLabel: 'Delete test',
          danger: true,
        });
        if (!confirmed || !element.isConnected) return;
        if ((api.currentUser()?.user_id ?? null) !== owner) throw new Error('Your account changed. Open Exported tests again.');
        await api.deleteExportedTest(test.paper_id, test.created_at);
        if (element.isConnected) context.refresh();
      } catch (error) {
        toast(error.message, { type: 'error' });
      } finally {
        button.disabled = false;
      }
    });
  }
  const test = available.find(item => item.paper_id === paperId);
  if (!test) {
    setHtml(element, emptyState({
      iconName: 'file', title: 'This exported test is unavailable',
      text: 'Open Exported tests to see the tests saved in this account or browser tab.',
      action: html`<a class="btn" href="${backHref}">Exported tests</a>`,
    }));
    return undefined;
  }
  const { snapshot } = test;
  context.setTitle(snapshot.title);
  let verified = new Map();
  let recovery = '';
  try {
    const resolved = resolveTestSnapshot(snapshot, await getBundle(snapshot.subjectId));
    verified = await verifyTestCrops(snapshot, resolved);
  } catch {
    recovery = 'The question bank could not be loaded. You can enter an overall score or reopen this test to try again.';
  }
  const resolved = new Map([...verified].filter(([, item]) => !item.promptRevised));
  const attempts = () => api.offlineAttempts(paperId);
  const active = context.query.attempt ? attempts().find(item => item.session_id === context.query.attempt) : attempts().at(-1);
  if (context.query.attempt && !active) {
    setHtml(element, emptyState({
      iconName: 'file', title: 'This attempt is unavailable',
      action: html`<a class="btn" href="${detailHref(paperId)}">Open saved test</a>`,
    }));
    return undefined;
  }
  const marking = context.query.mark === '1';
  let dispose;
  let removeListener;
  let busy = false;
  const openAttempt = (attempt, mark = false, options) => context.navigate(
    routeOf(detailHref(paperId, { attempt: attempt.session_id, ...(mark ? { mark: 1 } : {}) })), options,
  );

  async function update(payload) {
    const attempt = active;
    const previous = attempt.result?.mode === 'parts' ? attempt.result : attempt.previous_part_result;
    // A bank revision may prevent editing an old mark. Its saved value remains valid for this attempt.
    const keep = Object.entries(previous?.marks || {}).filter(([id]) => !resolved.has(id));
    const result = scoreTestSnapshot(snapshot, payload, resolved, { preserve: Object.fromEntries(keep) });
    if (result.mode === 'parts') {
      result.canonicalIds = {};
      const provider = getMarkingProvider();
      for (const [id, marksAwarded] of Object.entries(result.marks)) {
        const question = resolved.get(id)?.question;
        if (!question) {
          result.canonicalIds[id] = previous?.canonicalIds?.[id] || id;
          continue;
        }
        const mark = await provider.mark({ question, answerText: '', marksAwarded });
        result.marks[id] = mark.marks_awarded;
        result.canonicalIds[id] = question.question_id;
        result.markedBy = mark.marked_by;
      }
    }
    if ((api.currentUser()?.user_id ?? null) !== owner) throw new Error('Your account changed. Open the test again.');
    const saved = await api.saveOfflineAttempt(paperId, { newAttemptId: attempt.session_id, expectedRevision: attempt.revision, result });
    openAttempt(saved, false, { replace: true });
  }

  function onExport() {
    return offerTestPdf({ snapshot, questions: verified, existing: true });
  }

  function draw() {
    if (!element.isConnected) return;
    dispose?.();
    removeListener?.();
    const marks = attempts();
    setHtml(element, html`
      ${marks.length > 1 ? html`<label class="field"><span class="field__label">Attempt history</span><select class="select" data-offline-history>
        ${marks.map((entry, index) => html`<option value="${entry.session_id}" ${entry.session_id === active?.session_id ? 'selected' : ''}>Attempt ${index + 1} · ${savedTestState(entry)}</option>`)}
      </select></label>` : ''}
      ${recovery ? html`<p role="status" class="small muted">${recovery}</p>` : ''}
      <div data-offline-view></div>`);
    removeListener = on(element, 'change', '[data-offline-history]', (event, select) => {
      context.navigate(routeOf(detailHref(paperId, { attempt: select.value })));
    });
    dispose = renderOfflineMarking(element.querySelector('[data-offline-view]'), {
      snapshot, questions: resolved,
      attempt: active ? { status: active.status, result: active.result, previousPartResult: active.previous_part_result } : null,
      markImmediately: marking, onSave: update, onExport, backHref,
      onMarkDone: active ? null : async () => {
        let mark = false;
        const attempt = await promptForOfflineAttempt(snapshot, () => { mark = true; });
        if (attempt) openAttempt(attempt, mark, { replace: true });
      },
      onRetake: active ? async () => {
        if (busy) return;
        busy = true;
        try {
          let markNext = false;
          const attempt = await promptForOfflineAttempt(snapshot, () => { markNext = true; }, offlineRetakeId);
          if (attempt) openAttempt(attempt, markNext);
        } catch (error) { toast(error.message, { type: 'error' }); }
        finally {
          busy = false;
        }
      } : null,
    });
  }
  draw();
  return () => { dispose?.(); removeListener?.(); };
}
