// Handwritten answers in the session runner (past papers, built tests and question sets).
// Each answer box gets a "Write with Pencil" switch, as in Practice. Writing is stored with the
// same handwriting repository as Practice, keyed by the attempt id the result will be logged
// under, so the marking screen, the results review and the Data Hub all show it.
//
//   responseId = the go being marked (session.attempt_ids) or `${session_id}:${question_id}`,
//                which is the id commitSessionResult gives the logged attempt.
//   session.ink_answers[question_id] = responseId while the answer has any strokes.
//   session.ink_open[question_id]   = true while the student is writing rather than typing.

import { html } from '../core/dom.js';
import * as api from '../data/api.js';
import { createInkEditor, transferPencilStroke } from './ink-editor.js?v=practice-ink-3';

export function createSessionInk(element, session, { onChange = () => {} } = {}) {
  const editors = new Map();
  const values = new Map();
  const chains = new Map();
  const syncTimers = new Map();
  const transfers = new Map();
  session.ink_open ||= {};

  const responseIdFor = (id) => session.attempt_ids?.[id] || `${session.session_id}:${id}`;
  const hasInk = (id) => Boolean(session.ink_answers?.[id]);
  const isOpen = (id) => Boolean(session.ink_open[id]);

  /** The switch and writing area for one answer box. Put it after the textarea's field. */
  function controls(id) {
    const open = isOpen(id);
    return html`<div class="ink-answer session-ink" data-session-ink="${id}">
      <div class="session-ink__target" data-session-ink-target="${id}" ${open ? '' : 'hidden'}></div>
      <div class="row row--tight session-ink__bar">
        <button type="button" class="btn btn--sm" data-session-ink-toggle="${id}" aria-expanded="${open}">${open ? 'Use keyboard' : 'Write with Pencil'}</button>
        ${!open && hasInk(id) ? html`<span class="small muted">Handwritten answer saved</span>` : ''}
      </div>
    </div>`;
  }

  const fieldFor = (id) => element.querySelector(`textarea[data-answer="${CSS.escape(id)}"]`);
  const wrapperFor = (id) => element.querySelector(`[data-session-ink="${CSS.escape(id)}"]`);

  function persistRecord(id, sections, editor) {
    const responseId = responseIdFor(id);
    const key = `${responseId}\u0000${id}`;
    const hasStrokes = sections.some((section) => section.strokes.length > 0);
    const previous = values.get(key);
    if (!hasStrokes && !previous && !hasInk(id)) return;
    const record = {
      ...(previous || {}),
      schemaVersion: 1,
      ownerId: api.inkRepository().ownerId,
      responseId,
      partId: id,
      revision: previous?.revision || 1,
      status: 'saved',
      sections,
      updatedAt: new Date().toISOString(),
    };
    values.set(key, record);
    if (hasStrokes) (session.ink_answers ||= {})[id] = responseId;
    else if (session.ink_answers) delete session.ink_answers[id];
    onChange(id);
    editor?.setSaveState('Saving on this device…');
    const chain = (chains.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
      const latest = values.get(key) || record;
      const saved = await api.inkRepository().save({ ...latest, revision: latest.revision || 1 });
      if (!saved.conflict && values.get(key) === latest) values.set(key, saved);
      return saved;
    });
    chains.set(key, chain);
    chain.then((saved) => {
      if (chains.get(key) !== chain) return;
      editor?.setSaveState(saved.conflict
        ? 'Another version was saved on a different device. Your writing here is kept.'
        : hasStrokes ? 'Saved on this device' : 'Cleared');
      clearTimeout(syncTimers.get(key));
      syncTimers.set(key, setTimeout(() => {
        syncTimers.delete(key);
        api.syncInk({ responseId, partId: id }).then((synced) => {
          if (synced && editors.get(id) === editor && chains.get(key) === chain && hasStrokes) editor?.setSaveState('Saved and synced');
        }).catch(() => {});
      }, 1500));
    }).catch(() => {
      if (chains.get(key) === chain) editor?.setSaveState('Could not save · Try again');
    });
  }

  async function mount(id) {
    const target = element.querySelector(`[data-session-ink-target="${CSS.escape(id)}"]`);
    if (!target || editors.has(id) || target.dataset.loading) return;
    target.dataset.loading = 'true';
    target.textContent = 'Opening handwriting…';
    const responseId = responseIdFor(id);
    const key = `${responseId}\u0000${id}`;
    let value = values.get(key) || null;
    if (!value) {
      try {
        await chains.get(key)?.catch(() => {});
        value = (await api.loadInkState(responseId, id, { waitForCloudMs: 1200 })).record;
      } catch { value = null; }
      if (value) values.set(key, value);
    }
    delete target.dataset.loading;
    if (!target.isConnected || !isOpen(id) || editors.has(id)) return;
    let editor = null;
    editor = createInkEditor(target, {
      value,
      controlsBelow: true,
      onChange: (changed) => persistRecord(id, changed.sections, editor),
    });
    editors.set(id, editor);
    editor.setSaveState(value ? 'Saved on this device' : 'Ready to write');
    transfers.get(id)?.attach(editor);
    transfers.delete(id);
  }

  function unmount(id) {
    transfers.get(id)?.cancel();
    transfers.delete(id);
    editors.get(id)?.finishStroke();
    editors.get(id)?.destroy();
    editors.delete(id);
  }

  function setOpen(id, open, pencil = null) {
    const wrapper = wrapperFor(id);
    if (!wrapper) return;
    const target = wrapper.querySelector('[data-session-ink-target]');
    const button = wrapper.querySelector('[data-session-ink-toggle]');
    const field = fieldFor(id);
    if (open) session.ink_open[id] = true;
    else delete session.ink_open[id];
    if (field) {
      if (open) target.style.minBlockSize = `${Math.max(field.offsetHeight, 260)}px`;
      field.hidden = open;
    }
    target.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? 'Use keyboard' : 'Write with Pencil';
    wrapper.querySelector('.session-ink__bar .muted')?.remove();
    if (open) {
      if (pencil) transfers.set(id, pencil);
      void mount(id);
    } else {
      unmount(id);
      target.replaceChildren();
      target.style.minBlockSize = '';
      if (hasInk(id)) {
        const note = document.createElement('span');
        note.className = 'small muted';
        note.textContent = 'Handwritten answer saved';
        button.after(note);
      }
    }
    onChange(id);
  }

  /** Call after each render: hides typed fields of open answers and mounts their editors. */
  function afterRender() {
    for (const id of Object.keys(session.ink_open)) {
      const field = fieldFor(id);
      const target = element.querySelector(`[data-session-ink-target="${CSS.escape(id)}"]`);
      if (!target) continue;
      if (field) field.hidden = true;
      void mount(id);
    }
  }

  /** Call before a render replaces the page. */
  function beforeRender() {
    for (const id of [...editors.keys()]) unmount(id);
  }

  function onClick(event) {
    const button = event.target.closest?.('[data-session-ink-toggle]');
    if (!button || !element.contains(button)) return;
    event.preventDefault();
    const id = button.dataset.sessionInkToggle;
    setOpen(id, !isOpen(id));
  }
  // An Apple Pencil touching a typed answer box switches it to handwriting and keeps the stroke.
  function onPointerDown(event) {
    if (event.pointerType !== 'pen' || event.button !== 0) return;
    const field = event.target.closest?.('textarea[data-answer]');
    if (!field || !element.contains(field) || !wrapperFor(field.dataset.answer)) return;
    setOpen(field.dataset.answer, true, transferPencilStroke(event, element));
  }
  element.addEventListener('click', onClick);
  element.addEventListener('pointerdown', onPointerDown);

  return {
    controls,
    hasInk,
    afterRender,
    beforeRender,
    /** Waits for writing still being saved, then stops listening. */
    async flush() {
      for (const editor of editors.values()) editor.finishStroke();
      await Promise.allSettled([...chains.values()]);
    },
    destroy() {
      beforeRender();
      element.removeEventListener('click', onClick);
      element.removeEventListener('pointerdown', onPointerDown);
      for (const timer of syncTimers.values()) clearTimeout(timer);
      api.syncInk().catch(() => {});
    },
  };
}
