// "Your exam board isn't here yet?" early sign-up. Stores the email, the board they want and,
// optionally, the subject, through the join_exam_board_waitlist RPC (supabase/migrations/
// 20261127170000_exam_board_waitlist.sql). No account and no email verification. We email
// everyone on the list when more boards are added.

import { html, on } from '../core/dom.js';
import { getClient } from '../data/adapters/supabase-adapter.js';

// Boards students ask for, including the ones already on the site (a board can be live for
// some subjects and missing for others).
const BOARDS = [
  'AQA',
  'OCR',
  'Pearson Edexcel',
  'WJEC Eduqas',
  'WJEC (Wales)',
  'CCEA (Northern Ireland)',
  'SQA (Scotland)',
  'Cambridge International (CIE)',
  'Pearson Edexcel International (IGCSE / IAL)',
  'Oxford AQA International',
  'International Baccalaureate (IB)',
  'Other',
];

const LEVELS = ['GCSE', 'A-Level', 'AS', 'IGCSE', 'Level 3', 'Other'];

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
let count = 0;

/**
 * The sign-up card.
 * @param {{ source: string, title?: string, text?: string, compact?: boolean }} options
 *   source: which page it is on (stored with the sign-up, e.g. 'home', 'subjects').
 *   email: optional value to fill in (the signed-in student's address).
 */
export function boardWaitlist({ source, email = '', title = 'Your exam board not here yet?', text = 'Tell us which board you need and we’ll email you as soon as it’s added. Just your email, no account needed.', compact = false }) {
  const id = `bw-${++count}`;
  return html`<section class="card ruled board-waitlist ${compact ? 'board-waitlist--compact' : ''}" aria-labelledby="${id}-title" data-board-waitlist="${source}">
    <i class="tape tape--c" aria-hidden="true"></i>
    <h2 class="board-waitlist__title" id="${id}-title">${title}</h2>
    <p class="board-waitlist__text">${text}</p>
    <form class="board-waitlist__form" novalidate>
      <label class="field board-waitlist__email">
        <span class="field__label">Email</span>
        <input class="input" type="email" name="email" autocomplete="email" inputmode="email" maxlength="254" required placeholder="you@example.com" value="${email}" />
      </label>
      <label class="field">
        <span class="field__label">Exam board you need</span>
        <select class="select" name="board" required>
          <option value="">Choose a board…</option>
          ${BOARDS.map((board) => html`<option value="${board}">${board}</option>`)}
        </select>
      </label>
      <label class="field">
        <span class="field__label">Subject <span class="muted">(optional)</span></span>
        <input class="input" type="text" name="subject" maxlength="120" autocomplete="off" placeholder="e.g. Chemistry" />
      </label>
      <label class="field">
        <span class="field__label">Level <span class="muted">(optional)</span></span>
        <select class="select" name="level">
          <option value="">Any</option>
          ${LEVELS.map((level) => html`<option value="${level}">${level}</option>`)}
        </select>
      </label>
      <div class="board-waitlist__actions">
        <button type="submit" class="btn btn--primary">Notify me</button>
        <p class="board-waitlist__status small" role="status" aria-live="polite" data-status></p>
      </div>
    </form>
  </section>`;
}

/** Wires every sign-up card inside `root`. Returns a cleanup function. */
export function wireBoardWaitlist(root) {
  return on(root, 'submit', '.board-waitlist__form', async (event, form) => {
    event.preventDefault();
    const card = form.closest('[data-board-waitlist]');
    const status = form.querySelector('[data-status]');
    const button = form.querySelector('button[type="submit"]');
    const say = (message, type = '') => {
      status.textContent = message;
      status.className = `board-waitlist__status small ${type ? `is-${type}` : ''}`;
    };
    const email = form.email.value.trim();
    const board = form.board.value;
    form.email.removeAttribute('aria-invalid');
    form.board.removeAttribute('aria-invalid');
    if (!EMAIL.test(email) || email.length > 254) {
      form.email.setAttribute('aria-invalid', 'true');
      form.email.focus();
      return say('Enter a valid email address.', 'error');
    }
    if (!board) {
      form.board.setAttribute('aria-invalid', 'true');
      form.board.focus();
      return say('Choose the exam board you need.', 'error');
    }
    if (button.disabled) return;
    button.disabled = true;
    say('Adding you…');
    try {
      const client = await getClient();
      const { error } = await client.rpc('join_exam_board_waitlist', {
        p_email: email,
        p_board: board,
        p_subject: form.subject.value.trim(),
        p_level: form.level.value,
        p_source: card?.dataset.boardWaitlist || '',
      });
      if (error) throw error;
      form.subject.value = '';
      form.board.value = '';
      say(`You’re on the list. We’ll email ${email} when ${board} is added.`, 'success');
    } catch (error) {
      console.warn('Board waitlist sign-up failed', error);
      say('That didn’t go through. Check your connection and try again.', 'error');
    } finally {
      button.disabled = false;
    }
  });
}
