import { html, on, setHtml } from '../../core/dom.js';
import { links, routeOf } from '../../core/links.js';
import { fmtDate } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { getBundle } from '../../data/content-repository.js';
import { offlineRetakeId } from '../../data/offline-progress.js';
import { getMarkingProvider } from '../../engine/marking.js';
import { resolveTestSnapshot, scoreTestSnapshot } from '../../engine/test-snapshot.js';
import { exportRetention, offerTestPdf, promptForOfflineAttempt } from '../test-pdf.js';
import { emptyState, pageHead, toast } from '../ui.js';
import { renderOfflineMarking } from './offline-test.js';

export function savedTestState(attempt) {
  if (!attempt) return 'Ready to complete';
  const result = attempt.result;
  if (!result) return 'Completed on paper · Not marked';
  const label = result.mode === 'overall' ? 'Overall score' : result.percentage == null ? 'Partly marked' : 'Marked by question';
  return `${label} · ${result.awarded}/${result.maxMarks}${result.percentage == null ? '' : ` · ${result.percentage}%`}`;
}

export async function mount(element, context) {
  const paperId = context.params.paperId;
  const available = api.exportedTests();
  if (!paperId) {
    context.setTitle('Exported tests');
    setHtml(element, html`${pageHead({
      title: 'Exported tests', crumbs: [{ label: 'Practice', href: links.practice() }, { label: 'Exported tests' }],
    })}
    <p class="small muted">${exportRetention()}</p>
    ${available.length ? html`<div class="stack">${available.slice().reverse().map(test => html`
      <article class="card row row--between">
        <div><h2 class="h3"><a href="${links.exportedTest(test.paper_id)}">${test.title}</a></h2>
        <p class="small muted">${fmtDate(test.created_at)} · ${test.total_marks} marks · ${savedTestState(api.offlineAttempts(test.paper_id).at(-1))}</p></div>
        <a class="btn btn--sm" href="${links.exportedTest(test.paper_id)}">Open test</a>
      </article>`)}</div>` : emptyState({ iconName: 'file', title: 'No exported tests yet',
      text: 'Build a custom test or select questions in Practice, then choose Export PDF.',
      action: html`<a class="btn btn--primary" href="${links.practice()}">Go to Practice</a>`,
    })}`);
    return undefined;
  }
  const test = available.find(item => item.paper_id === paperId);
  if (!test) {
    setHtml(element, emptyState({
      iconName: 'file', title: 'This exported test is unavailable',
      text: 'Open Exported tests to see the tests saved in this account or browser tab.',
      action: html`<a class="btn" href="${links.exportedTests()}">Exported tests</a>`,
    }));
    return undefined;
  }
  const { snapshot } = test;
  context.setTitle(snapshot.title);
  let resolved = new Map();
  let recovery = '';
  try {
    resolved = resolveTestSnapshot(snapshot, await getBundle(snapshot.subjectId));
  } catch {
    recovery = 'The question bank could not be loaded. You can enter an overall score or reopen this test to try again.';
  }
  const attempts = () => api.offlineAttempts(paperId);
  let active = context.query.attempt ? attempts().find(item => item.session_id === context.query.attempt) : attempts().at(-1);
  let marking = context.query.mark === '1';
  let dispose;
  let removeListener;
  let busy = false;

  async function update(payload) {
    const previous = active.result;
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
    active = await api.saveOfflineAttempt(paperId, { newAttemptId: active.session_id, expectedRevision: active.revision, result });
    marking = false;
    draw();
  }

  function onExport() {
    return offerTestPdf({ snapshot, questions: resolved, existing: true });
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
      context.navigate(routeOf(links.exportedTest(paperId, { attempt: select.value })));
    });
    dispose = renderOfflineMarking(element.querySelector('[data-offline-view]'), {
      snapshot, questions: resolved,
      attempt: active ? { id: active.session_id, status: active.status, result: active.result } : null,
      markImmediately: marking, onSave: update, onExport, backHref: links.exportedTests(),
      onMarkDone: active ? null : async () => {
        try {
          await promptForOfflineAttempt(snapshot, () => { marking = true; });
          active = attempts().at(-1);
          draw();
        } catch (error) { toast(error.message, { type: 'error' }); }
      },
      onRetake: active ? async () => {
        if (busy) return;
        busy = true;
        try {
          let markNext = false;
          await promptForOfflineAttempt(snapshot, () => { markNext = true; }, offlineRetakeId);
          marking = markNext;
        } catch (error) { toast(error.message, { type: 'error' }); }
        finally {
          active = attempts().at(-1);
          busy = false;
          draw();
        }
      } : null,
    });
  }
  draw();
  return () => { dispose?.(); removeListener?.(); };
}
