// Review and self-mark a test that was completed from an exported PDF.
// The caller owns persistence and route changes. This module only renders the frozen
// snapshot and collects a validated marking choice.

import { $, html, isSafeUrl, on, setHtml } from '../../core/dom.js';
import { displayedPartLabel } from '../../engine/test-snapshot.js?v=20261127-pdf3';
import { markPicker, bindMarkPickers } from '../mark-picker.js';
import { markSchemeBody, questionBody, questionRef } from '../question-view.js';
import { openModal, toast } from '../ui.js';

/** Ask whether the just-exported paper has already been completed, then whether to mark it. */
export async function askOfflineCompletion({ onMarkDone, onMarkNow, retention = '' } = {}) {
  const completed = await openModal({
    title: 'Have you already completed this test?',
    body: html`<div class="stack"><p>Record this exported test as completed on paper. Your marks will remain unset until you enter them.</p>${retention ? html`<p class="small muted">${retention}</p>` : ''}</div>`,
    actions: [
      { label: 'Not yet', cancel: true },
      { label: 'Mark as done', value: 'done', variant: 'primary' },
    ],
  });
  if (completed !== 'done') return null;
  const attempt = await onMarkDone();
  const mark = await openModal({
    title: 'Would you like to mark it now?',
    body: html`<p>Choose how to enter the result. You can return to this test later.</p>`,
    actions: [
      { label: 'Later', cancel: true },
      { label: 'Mark now', value: 'mark', variant: 'primary' },
    ],
  });
  if (mark === 'mark') {
    await onMarkNow?.(attempt);
    return attempt;
  }
  toast('Completed on paper · Not marked', { type: 'success' });
  return attempt;
}

const safeMapGet = (map, key) => map instanceof Map ? map.get(key) : map?.[key];
const resolvedQuestion = (questions, id) => {
  const value = safeMapGet(questions, id);
  return value?.question || value || null;
};
const resolvedPaper = (questions, id) => safeMapGet(questions, id)?.paper || null;
const exactReference = (part, question) => part.reference || (question ? questionRef(question) : '');
const partMaximum = (part, question) => Number(part.maxMarks ?? question?.marks ?? 0);

function snapshotParts(snapshot, questions) {
  return (snapshot.groups || []).flatMap((group) => (group.parts || []).map((part) => ({
    ...part,
    groupNumber: group.number,
    groupReference: group.reference,
    question: resolvedQuestion(questions, part.id),
    paper: resolvedPaper(questions, part.id),
    schemeRevised: Boolean(safeMapGet(questions, part.id)?.schemeRevised),
  })));
}

function optionDefaults(choices, stored) {
  return choices.map((choice, index) => {
    const previous = stored?.[index];
    if (Array.isArray(previous)) return [...previous];
    return Array.from({ length: Math.min(choice.count, choice.options?.length || 0) }, (_, optionIndex) => optionIndex);
  });
}

/**
 * Render frozen offline-test review and marking. `onSave` receives
 * `{mode, marks, chosenOptions, total}`. Callbacks own navigation after saving.
 * Returns an unmount callback for delegated listeners.
 */
export function renderOfflineMarking(element, {
  snapshot,
  questions,
  attempt = null,
  onSave,
  onMarkDone,
  onRetake,
  onExport,
  backHref = '#',
  markImmediately = false,
} = {}) {
  if (!snapshot || snapshot.version !== 1) throw new Error('This saved test has an unsupported snapshot version.');
  const allParts = snapshotParts(snapshot, questions);
  const choices = Array.isArray(snapshot.choices) ? snapshot.choices : [];
  const activeAttempt = attempt;
  const saved = attempt?.result || {};
  const detail = saved.mode === 'parts' ? saved : attempt?.previousPartResult;
  let mode = saved.mode === 'overall' ? 'overall' : 'parts';
  let chosenOptions = optionDefaults(choices, detail?.chosenOptions);
  const marks = { ...(detail?.marks || {}) };
  let busy = false;
  let marking = Boolean(markImmediately && activeAttempt);

  const partsInSelectedChoices = () => {
    const selected = new Set();
    choices.forEach((choice, index) => {
      (chosenOptions[index] || []).forEach((optionIndex) => {
        (choice.options?.[optionIndex]?.partIds || []).forEach((id) => selected.add(id));
      });
    });
    return selected;
  };
  const hasSavedResult = () => Boolean(activeAttempt?.result && (saved.mode === 'parts' || saved.mode === 'overall'));
  const unavailable = allParts.filter((part) => !part.question);
  const available = allParts.filter((part) => part.question);
  const byChoiceIds = new Set(choices.flatMap((choice) => (choice.options || []).flatMap((option) => option.partIds || [])));
  const effectiveParts = () => {
    const selectedIds = partsInSelectedChoices();
    return choices.length ? available.filter((part) => byChoiceIds.has(part.id) ? selectedIds.has(part.id) : true) : available;
  };

  const choiceControl = () => choices.map((choice, choiceIndex) => html`<fieldset class="offline-test__choice">
    <legend>Choice ${choiceIndex + 1} · choose ${choice.count}</legend>
    ${(choice.options || []).map((option, optionIndex) => {
      const selected = chosenOptions[choiceIndex]?.includes(optionIndex);
      const inputType = choice.count === 1 ? 'radio' : 'checkbox';
      return html`<label class="check"><input type="${inputType}" name="offline-choice-${choiceIndex}" value="${optionIndex}" data-offline-choice="${choiceIndex}" ${selected ? 'checked' : ''}><span>${option.label || `Option ${optionIndex + 1}`} · ${option.maxMarks ?? 0} marks</span></label>`;
    })}
  </fieldset>`);

  const partCard = (part, index) => {
    const question = part.question;
    const max = partMaximum(part, question);
    const reference = exactReference(part, question);
    const display = displayedPartLabel(part.groupNumber || index + 1, part.label);
    const selected = !byChoiceIds.has(part.id) || partsInSelectedChoices().has(part.id);
    const value = Object.prototype.hasOwnProperty.call(marks, part.id) ? marks[part.id] : '';
    const schemePresent = !part.schemeRevised && (question.content?.mark_scheme_html || question.content?.mark_scheme_image_url);
    const sourceScheme = [question.provenance?.scheme_source_url, part.paper?.full_mark_scheme_pdf_url].find(url => url && isSafeUrl(url));
    return html`<article class="card ruled stack offline-test__part">
      <header class="row row--between">
        <div><h2 class="h2">${display}</h2><p class="small muted">${reference || 'Original source reference unavailable'}</p></div>
        <span class="marks-pill">${max} ${max === 1 ? 'mark' : 'marks'}</span>
      </header>
      <details class="fold"><summary>Show the question</summary>${questionBody(question)}</details>
      ${schemePresent ? html`<section><p class="field__label">Mark scheme for ${display}</p>${markSchemeBody(question)}</section>` : ''}
      ${mode === 'parts' && selected ? html`<div class="offline-test__picker">${markPicker({ id: part.id, max, value, attr: 'offline-mark', label: `Marks for ${display}` })}</div>` : ''}
      ${mode === 'parts' && !selected ? html`<p class="small muted">This alternative is not included in the score.</p>` : ''}
      ${mode === 'overall' ? html`<p class="small muted">${hasSavedResult() ? `${saved.marks?.[part.id] ?? '—'} / ${max} marks` : 'Enter an overall test score below.'}</p>` : ''}
      ${!schemePresent ? html`<p class="small muted">${part.schemeRevised ? 'The saved version of this mark scheme extract is unavailable.' : 'No mark scheme extract is available for this question.'}</p>
        ${sourceScheme ? html`<a href="${sourceScheme}" target="_blank" rel="noopener">Open the official mark scheme for the full paper</a>` : part.paper?.official_source_url && isSafeUrl(part.paper.official_source_url) ? html`<a href="${part.paper.official_source_url}" target="_blank" rel="noopener">Find the matching mark scheme on the official source</a>` : ''}` : ''}
    </article>`;
  };

  function draw() {
    const hasResult = hasSavedResult();
    if (!marking) {
      const statusText = activeAttempt?.status === 'completed_on_paper' && !hasResult
        ? 'Completed on paper · Not marked'
        : hasResult
          ? `${saved.percentage == null ? 'Partly marked' : 'Marked'} · ${saved.awarded ?? 0} / ${saved.maxMarks ?? snapshot.totalMarks} marks${saved.percentage != null ? ` · ${saved.percentage}%` : ''} · ${saved.mode === 'overall' ? 'Overall score only' : 'Question by question'}`
          : 'Saved test · Not completed';
      setHtml(element, html`<main class="offline-test stack">
        <header class="card offline-test__head">
          <div class="row row--between"><a class="btn btn--sm" href="${backHref}">Back to tests</a><div class="row row--tight">${onExport ? html`<button class="btn btn--sm" type="button" data-offline-export>Export again</button>` : ''}${onRetake ? html`<button class="btn btn--sm" type="button" data-offline-retake>Start a new attempt</button>` : ''}</div></div>
          <h1>${snapshot.title || 'Saved test'}</h1><p class="muted">${statusText}</p>
          <p class="small muted">Your exported test keeps its question order, numbers, references and score denominator.</p>
          ${hasResult && saved.mode === 'overall' ? html`<p>Overall score ${saved.awarded ?? saved.total} / ${saved.maxMarks ?? snapshot.totalMarks}${saved.percentage != null ? ` · ${saved.percentage}%` : ''}</p><p class="small muted">Per-question and topic scores remain unknown.</p>` : ''}
          ${hasResult && saved.mode === 'parts' ? html`<p>Question-by-question score ${saved.awarded ?? 0} / ${saved.maxMarks ?? snapshot.totalMarks}${saved.percentage != null ? ` · ${saved.percentage}%` : ' · Partly marked'}</p>` : ''}
        </header>
        <section class="card stack"><h2 class="h2">Questions in this test</h2><ul>${allParts.map((part) => html`<li>${displayedPartLabel(part.groupNumber, part.label)} · ${part.reference || part.id} · ${part.maxMarks ?? '?'} marks${!part.question ? ' · currently unavailable' : ''}</li>`)}</ul></section>
        <footer class="card offline-test__save">
          ${!activeAttempt ? html`<p class="muted">When you have completed the test on paper, mark this attempt as done to save it in your history.</p><button class="btn btn--primary btn--lg" type="button" data-offline-mark-done>Mark as done</button>` : ''}
          ${activeAttempt && !hasResult ? html`<p class="muted">${activeAttempt.status === 'completed_on_paper' ? 'Your completion is saved. You can enter marks when ready.' : 'This attempt is ready for marking.'}</p><button class="btn btn--primary btn--lg" type="button" data-offline-mark-now>Mark now</button>` : ''}
          ${hasResult ? html`<button class="btn btn--primary btn--lg" type="button" data-offline-mark-now>${saved.mode === 'overall' ? 'Review or enter detailed marks' : 'Review or update marks'}</button>` : ''}
        </footer>
      </main>`);
      return;
    }
    const activeParts = effectiveParts();
    const maxScore = snapshot.totalMarks;
    const currentMarks = activeParts.reduce((total, part) => total + (Number.isInteger(marks[part.id]) ? marks[part.id] : 0), 0);
    const chosenValid = choices.every((choice, index) => chosenOptions[index]?.length === choice.count);
    setHtml(element, html`<main class="offline-test stack">
      <header class="card offline-test__head">
        <div class="row row--between"><a class="btn btn--sm" href="${backHref}">Back to tests</a><div class="row row--tight">${onExport ? html`<button class="btn btn--sm" type="button" data-offline-export>Export again</button>` : ''}${onRetake ? html`<button class="btn btn--sm" type="button" data-offline-retake>Start a new attempt</button>` : ''}</div></div>
        <h1>${snapshot.title || 'Saved test'}</h1>
        <p class="muted">${activeAttempt?.status === 'completed_on_paper' && !hasResult ? 'Completed on paper · Not marked' : hasResult ? `${saved.percentage == null ? 'Partly marked' : 'Marked'} · ${saved.awarded ?? 0} / ${saved.maxMarks ?? snapshot.totalMarks} marks${saved.percentage != null ? ` · ${saved.percentage}%` : ''}` : 'Completed on paper · Ready to mark'}</p>
        <p class="small muted">The displayed question numbers and source references come from the exported test.</p>
      </header>
      ${unavailable.length ? html`<section class="card offline-test__unavailable" role="status"><h2>Some saved questions are unavailable</h2><p>They remain in the original test’s score denominator.</p><ul>${unavailable.map((part) => html`<li>${part.reference || part.id} · ${part.maxMarks ?? '?'} marks</li>`)}</ul></section>` : ''}
      ${choices.length && mode === 'parts' ? html`<section class="card stack"><h2 class="h2">Choose the required alternatives</h2>${choiceControl()}</section>` : ''}
      <nav class="offline-test__modes" aria-label="Marking method">
        <button class="btn ${mode === 'parts' ? 'btn--primary' : ''}" type="button" data-offline-mode="parts">Mark each question</button>
        <button class="btn ${mode === 'overall' ? 'btn--primary' : ''}" type="button" data-offline-mode="overall">Enter one total</button>
      </nav>
      ${mode === 'overall' ? html`<section class="card stack"><h2 class="h2">Enter one total</h2><p class="muted">Topic and per-question scores remain unknown for an overall-only result.</p><label class="field"><span class="field__label">Marks out of ${maxScore}</span><input class="input" type="number" min="0" max="${maxScore}" step="1" inputmode="numeric" value="${saved.mode === 'overall' ? saved.total ?? saved.awarded ?? '' : ''}" data-offline-total></label></section>` : ''}
      ${effectiveParts().map(partCard)}
      <footer class="card offline-test__save">
        ${mode === 'parts' ? html`<p class="muted" data-offline-progress>${currentMarks} marks entered · ${activeParts.length} selected question parts</p>` : ''}
        ${hasResult && saved.mode !== mode ? html`<p class="small muted">Saving in this mode replaces the saved result for this same attempt.</p>` : ''}
        ${mode === 'parts' && unavailable.length ? html`<p class="small muted">Unavailable parts cannot be marked. The original denominator stays ${snapshot.totalMarks} marks.</p>` : ''}
        <button type="button" class="btn btn--primary btn--lg" data-offline-save ${busy || (mode === 'parts' && !chosenValid) ? 'disabled' : ''}>${hasResult ? 'Save updated marks' : 'Save result'}</button>
      </footer>
    </main>`);
  }

  const offs = [
    on(element, 'click', '[data-offline-mark-done]', async () => {
      if (busy) return;
      busy = true;
      try {
        if (typeof onMarkDone !== 'function') throw new Error('This test cannot be saved right now. Try again later.');
        await onMarkDone();
      } catch (error) {
        toast(error?.message || 'The completion could not be saved. Try again.', { type: 'error', timeout: 6500 });
      } finally {
        busy = false;
      }
    }),
    on(element, 'click', '[data-offline-mark-now]', () => {
      marking = true;
      mode = saved.mode === 'overall' ? 'overall' : 'parts';
      draw();
    }),
    on(element, 'change', '[data-offline-mark]', (event, input) => {
      if (input.value === '') delete marks[input.dataset.offlineMark];
      else marks[input.dataset.offlineMark] = Number(input.value);
      const progress = $('[data-offline-progress]', element);
      if (progress) progress.textContent = `${effectiveParts().reduce((total, part) => total + (Number.isInteger(marks[part.id]) ? marks[part.id] : 0), 0)} marks entered · ${effectiveParts().length} selected question parts`;
    }),
    on(element, 'click', '[data-offline-mode]', (event, button) => {
      mode = button.dataset.offlineMode;
      draw();
    }),
    on(element, 'change', '[data-offline-choice]', (event, input) => {
      const choiceIndex = Number(input.dataset.offlineChoice);
      const choice = choices[choiceIndex];
      const current = new Set(chosenOptions[choiceIndex] || []);
      const optionIndex = Number(input.value);
      if (choice.count === 1) chosenOptions[choiceIndex] = [optionIndex];
      else if (input.checked) {
        if (current.size >= choice.count) {
          input.checked = false;
          return;
        }
        current.add(optionIndex);
        chosenOptions[choiceIndex] = [...current];
      } else {
        current.delete(optionIndex);
        chosenOptions[choiceIndex] = [...current];
      }
      draw();
    }),
    on(element, 'click', '[data-offline-save]', async () => {
      if (busy) return;
      const activeParts = effectiveParts();
      const max = snapshot.totalMarks;
      let payload;
      if (mode === 'overall') {
        const field = $('[data-offline-total]', element);
        const total = Number(field?.value);
        if (!field || field.value === '' || !Number.isInteger(total) || total < 0 || total > max) {
          toast(`Enter a whole number from 0 to ${max}.`, { type: 'error' });
          field?.focus();
          return;
        }
        payload = { mode: 'overall', marks: {}, chosenOptions: chosenOptions.map((selection) => [...selection]), total };
      } else {
        const current = {};
        let invalid = null;
        const inputs = new Map([...element.querySelectorAll('[data-offline-mark]')].map(input => [input.dataset.offlineMark, input]));
        activeParts.forEach((part) => {
          const input = inputs.get(part.id);
          if (!input || input.value === '') return;
          const value = Number(input.value);
          const partMax = partMaximum(part, part.question);
          if (!Number.isInteger(value) || value < 0 || value > partMax) invalid = part;
          else current[part.id] = value;
        });
        if (invalid) {
          toast(`Check the mark entered for ${invalid.reference || invalid.id}.`, { type: 'error' });
          return;
        }
        if (choices.some((choice, index) => chosenOptions[index]?.length !== choice.count)) {
          toast('Choose the required number of alternatives before saving.', { type: 'error' });
          return;
        }
        payload = { mode: 'parts', marks: current, chosenOptions: chosenOptions.map((selection) => [...selection]), total: null };
      }
      busy = true;
      const button = $('[data-offline-save]', element);
      button.disabled = true;
      try {
        if (typeof onSave !== 'function') throw new Error('Saving this result is unavailable. Return to the saved test and try again.');
        await onSave(payload);
        toast('Your result was saved for this attempt.', { type: 'success' });
      } catch (error) {
        toast(error?.message || 'Your result could not be saved. Try again.', { type: 'error', timeout: 6500 });
      } finally {
        busy = false;
        if (button.isConnected) button.disabled = false;
      }
    }),
    on(element, 'click', '[data-offline-retake]', () => { if (!busy) onRetake?.(); }),
    on(element, 'click', '[data-offline-export]', () => onExport?.()),
  ];

  draw();
  const unbindPickers = bindMarkPickers(element);
  return () => {
    offs.forEach((off) => off());
    unbindPickers();
  };
}
