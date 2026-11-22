import { html } from '../core/dom.js';
import * as api from '../data/api.js';
import { askOfflineCompletion } from './views/offline-test.js';
import { openModal, toast } from './ui.js';

const labels = { question: 'Question paper', scheme: 'Mark scheme', combined: 'Combined PDF' };

export const exportRetention = () => !api.isSignedIn()
  ? 'Open Exported tests in Practice to return during this browser tab’s session.'
  : api.backendInfo().syncsAcrossDevices
    ? 'You can reopen this test from Exported tests on any device signed in to this account.'
    : 'This test is saved to your account in this browser.';

export function promptForOfflineAttempt(snapshot, onMarkNow, retakeId = null) {
  return askOfflineCompletion({
    retention: exportRetention(),
    onMarkDone: () => api.saveOfflineAttempt(snapshot.id, { newAttemptId: retakeId?.() }),
    onMarkNow,
  });
}

async function renderPdf(kind, options, signal, onProgress) {
  if ('Worker' in globalThis && 'OffscreenCanvas' in globalThis && 'createImageBitmap' in globalThis) {
    let worker;
    try {
      worker = new Worker(new URL('../engine/test-pdf-worker.js', import.meta.url), { type: 'module' });
      return await new Promise((resolve, reject) => {
        if (signal.aborted) { reject(signal.reason); return; }
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        worker.onmessage = ({ data }) => {
          if (data.progress) { onProgress(data.progress); return; }
          signal.removeEventListener('abort', abort);
          if (data.error) reject(new Error(data.error));
          else resolve(data.blob);
        };
        worker.onerror = () => {
          signal.removeEventListener('abort', abort);
          reject(new Error('The PDF worker is unavailable.'));
        };
        worker.postMessage({ kind, options });
      });
    } catch (error) {
      if (signal.aborted || (worker && error.message !== 'The PDF worker is unavailable.')) throw error;
    } finally {
      worker?.terminate();
    }
  }
  const { createQuestionPdf, createMarkSchemePdf, createCombinedPdf } = await import('../engine/test-pdf-render.js');
  const make = { question: createQuestionPdf, scheme: createMarkSchemePdf, combined: createCombinedPdf };
  return make[kind](options, { signal, onProgress });
}

export async function offerTestPdf({ snapshot, questions, onOpenTest, existing = false }) {
  let options = { kind: 'question', compact: false };
  for (;;) {
    const selected = await openModal({
      title: 'Export PDF',
      body: html`<div class="stack">
        <p>${snapshot.title} · ${snapshot.totalMarks} marks</p>
        <label class="field"><span class="field__label">File</span><select class="select" name="kind">${Object.entries(labels).map(([kind, label]) => html`<option value="${kind}" ${options.kind === kind ? 'selected' : ''}>${label}</option>`)}</select></label>
        <label class="check"><input type="checkbox" name="compact" ${options.compact ? 'checked' : ''}><span>Compact layout</span></label>
      </div>`,
      actions: [{ label: 'Cancel', cancel: true }, { label: 'Prepare PDF', variant: 'primary', collect: dialog => ({
        kind: dialog.querySelector('[name="kind"]').value, compact: dialog.querySelector('[name="compact"]').checked,
      }) }],
    });
    if (!selected) return;
    options = selected;
    const controller = new AbortController();
    let generated;
    const status = await openModal({
      title: 'Preparing PDF',
      body: html`<div class="stack"><progress aria-label="PDF progress"></progress><p role="status" data-pdf-status>Loading test material…</p></div>`,
      actions: [{ label: 'Cancel', cancel: true }, { label: 'Continue', variant: 'primary', value: 'ready' }],
      onOpen(dialog) {
        const next = dialog.querySelector('button[type="submit"]');
        const message = dialog.querySelector('[data-pdf-status]');
        const progress = dialog.querySelector('progress');
        next.hidden = true;
        const { signal } = controller;
        import('../engine/test-pdf-content.js')
          .then(async content => {
            const prepared = await content.prepareTestPdf(snapshot, questions, {
              ...options, signal, onProgress({ completed, total }) {
                progress.max = total;
                progress.value = completed;
                message.textContent = `Preparing question material (${completed} of ${total})…`;
              },
            });
            if (options.kind !== 'scheme' && !prepared.canExportQuestions) {
              const missing = prepared.missing.filter(item => item.kind !== 'scheme');
              return { problem: 'The question paper is incomplete.', missing };
            }
            const schemeNotices = prepared.missing.filter(item => item.kind === 'scheme');
            if (signal.aborted) return null;
            message.textContent = 'Laying out the pages…';
            await new Promise(resolve => setTimeout(resolve, 0));
            const blob = await renderPdf(options.kind, prepared[options.kind], signal, ({ completed, total }) => {
              progress.max = total;
              progress.value = completed;
              message.textContent = `Laying out the pages (${completed} of ${total})…`;
            });
            if (signal.aborted) return null;
            if (!existing) await api.saveExportedTest(snapshot);
            return { blob, missing: options.kind === 'question' ? [] : schemeNotices };
          })
          .catch(error => ({ problem: error.message || 'Could not prepare this PDF.' }))
          .then(result => {
            if (signal.aborted || !dialog.open) return;
            generated = result;
            next.click();
          });
      },
    });
    if (status !== 'ready') { controller.abort(); return; }
    if (!generated?.blob) {
      const retry = await openModal({
        title: 'PDF unavailable',
        body: html`<p>${generated?.problem || 'Could not prepare this PDF.'}</p>
          ${generated?.missing?.length ? html`<ul>${generated.missing.map(item => html`<li>${item.reference}: ${item.reason}</li>`)}</ul>` : ''}`,
        actions: [{ label: 'Back to test', cancel: true }, { label: 'Retry', value: 'retry', variant: 'primary' }],
      });
      if (retry === 'retry') continue;
      return;
    }
    const url = URL.createObjectURL(generated.blob);
    const file = `${snapshot.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'practice-test'}-${options.kind}.pdf`;
    let handedOff = false;
    await openModal({
      title: 'Your PDF is ready',
      body: html`<div class="stack">
        <div class="row row--tight"><a class="btn btn--primary" data-pdf-handoff href="${url}" download="${file}">Download ${labels[options.kind].toLowerCase()}</a>
          <a class="btn" data-pdf-handoff href="${url}" target="_blank" rel="noopener">Open PDF</a></div>
        <p class="small muted">In Safari, open the PDF and use Share to save it to Files or print it.</p>
        ${generated.missing.length ? html`<p class="small muted">Some scheme extracts are unavailable. See the source information beside those questions in the PDF.</p>` : ''}
      </div>`,
      onOpen(dialog) {
        dialog.addEventListener('click', event => {
          if (!event.target.closest('[data-pdf-handoff]')) return;
          handedOff = true;
          setTimeout(() => { if (dialog.open) dialog.close(); }, 0);
        });
      },
    });
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    if (handedOff && !existing && options.kind !== 'scheme') {
      try {
        await promptForOfflineAttempt(snapshot, onOpenTest);
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }
    return;
  }
}
