// Data Hub "Flashcards" tab: cards studied, reviews, how well cards are remembered,
// the days the student studied, how they rate their answers and progress in each set.
// The numbers come from the student's flashcard sets and review log in Supabase.

import { html, setHtml } from '../../core/dom.js';
import { fmtRelative, localDayKey, plural, startOfDay, startOfWeek } from '../../core/utils.js';
import * as flashcards from '../../flashcards/api.js?v=hub-flashcards-1';
import { links } from '../../core/links.js';
import { subjectColour } from '../subject-colours.js';
import { emptyState } from '../ui.js';

const DAY_MS = 86400000;
const n = (value) => Number(value || 0).toLocaleString('en-GB');
const GRADES = [
  { label: 'Again', className: 'is-again' },
  { label: 'Hard', className: 'is-hard' },
  { label: 'Good', className: 'is-good' },
  { label: 'Easy', className: 'is-easy' },
];

/** The tab's frame; the numbers arrive with mountFlashcardsTab. */
export const flashcardsTab = () => html`<div data-hub-flashcards><p class="muted" style="padding:16px 0">Loading your flashcards…</p></div>`;

const stat = (label, value, note = '') => html`<div class="stat ruled"><i class="tape tape--c" aria-hidden="true"></i>
  <span class="stat__label">${label}</span><span class="stat__value">${value}</span>${note ? html`<span class="stat__note">${note}</span>` : ''}</div>`;

/** Consecutive days with reviews, ending today (or yesterday if today is empty). */
function streak(days) {
  let cursor = startOfDay(new Date());
  if (!days.has(localDayKey(cursor))) cursor -= DAY_MS;
  let count = 0;
  while (days.has(localDayKey(cursor))) { count += 1; cursor -= DAY_MS; }
  return count;
}

function heatmap(perDay, weeks) {
  const today = startOfDay(new Date());
  const first = startOfWeek(new Date(today)) - (weeks - 1) * 7 * DAY_MS;
  const counts = [...perDay.values()];
  const top = Math.max(1, ...counts);
  const level = (count) => (!count ? 0 : count <= top / 4 ? 1 : count <= top / 2 ? 2 : count <= (3 * top) / 4 ? 3 : 4);
  const cells = [];
  for (let index = 0; index < weeks * 7; index += 1) {
    const date = new Date(first + index * DAY_MS + DAY_MS / 2); // midday dodges clock changes
    if (startOfDay(date) > today) { cells.push(html`<i class="is-future"></i>`); continue; }
    const count = perDay.get(localDayKey(date)) || 0;
    const label = `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${plural(count, 'card')}`;
    cells.push(html`<i class="lv-${level(count)}" title="${label}"></i>`);
  }
  const active = [...perDay.keys()].filter((key) => key >= localDayKey(first)).length;
  return html`<div class="hf-heat" style="--weeks:${weeks}" role="img" aria-label="${plural(active, 'day')} with flashcards in the last ${weeks} weeks">${cells}</div>
    <div class="hf-key"><span>Less</span>${[0, 1, 2, 3, 4].map((value) => html`<i class="hf-swatch lv-${value}"></i>`)}<span>More cards</span></div>`;
}

function ratings(grades) {
  const total = grades.reduce((sum, value) => sum + value, 0);
  if (!total) return html`<p class="muted small">Rate some cards to see how you find them.</p>`;
  const share = grades.map((value) => Math.round((100 * value) / total));
  return html`<div class="hf-ratings" role="img" aria-label="${GRADES.map((grade, index) => `${share[index]}% ${grade.label}`).join(', ')}">
      ${GRADES.map((grade, index) => (grades[index] ? html`<i class="${grade.className}" style="width:${((100 * grades[index]) / total).toFixed(2)}%">${share[index] >= 12 ? grade.label : ''}</i>` : ''))}
    </div>
    <div class="hf-key">${GRADES.map((grade, index) => html`<span>${share[index]}% ${grade.label}</span>`)}</div>
    <p class="small muted">${plural(total, 'card')} rated in the last 30 days. Cards you rate Again come back the same day. Cards you rate Easy wait longest.</p>`;
}

function progressBar(deck) {
  const total = Number(deck.card_count) || 0;
  const studied = Math.min(total, Number(deck.studied_count) || 0);
  const known = Math.min(studied, Number(deck.known_count) || 0);
  const share = (value) => (total ? ((100 * value) / total).toFixed(2) : 0);
  return html`<span class="hf-bar" role="img" aria-label="${n(known)} known, ${n(studied - known)} learning, ${n(total - studied)} not started">
      <i class="is-known" style="width:${share(known)}%"></i><i class="is-learning" style="width:${share(studied - known)}%"></i></span>
    <span class="small muted">${n(studied)} of ${n(total)} · ${total ? Math.round((100 * studied) / total) : 0}%</span>`;
}

/**
 * Load and draw the tab. `subjectId` is 'all' or a subject id; `subjectNames` maps
 * subject ids to display names; `preferences` holds which subject each own set belongs to.
 */
export async function mountFlashcardsTab(slot, { subjectId, subjectNames, preferences }) {
  if (!flashcards.hasCloudAccount()) {
    setHtml(slot, emptyState({ iconName: 'layers', title: 'Flashcards need an account', text: 'Sign in to study flashcards. Your progress on every set shows up here.', action: html`<a class="btn btn--primary" href="${links.flashcards()}">Go to Flashcards</a>` }));
    return;
  }
  let decks, catalogue, summary;
  try {
    [decks, catalogue, summary] = await Promise.all([
      flashcards.listDecks({ sync: false }),
      flashcards.listCatalogue().catch(() => ({ entries: [] })),
      flashcards.hubSummary(),
    ]);
  } catch {
    if (slot.isConnected) setHtml(slot, html`<p class="muted" style="padding:16px 0">Your flashcard numbers could not load. Refresh the page to try again.</p>`);
    return;
  }
  if (!slot.isConnected) return;

  const entryFor = (deck) => catalogue.entries.find((entry) => entry.id === deck.catalogue_id) || null;
  const subjectOf = (deck) => (deck.catalogue_id ? entryFor(deck)?.subject_id : preferences?.flashcardDeckSubjects?.[deck.id]) || null;
  const mine = decks.filter((deck) => subjectId === 'all' || subjectOf(deck) === subjectId);
  if (!mine.length) {
    setHtml(slot, emptyState({
      iconName: 'layers',
      title: subjectId === 'all' ? 'No flashcard sets yet' : 'No flashcard sets for this subject yet',
      text: 'Add a PurePastPapers set or make your own. Every card you study shows up here.',
      action: html`<a class="btn btn--primary" href="${links.flashcards()}">Go to Flashcards</a>`,
    }));
    return;
  }

  const ids = new Set(mine.map((deck) => deck.id));
  const history = new Map((summary.decks || []).filter((row) => ids.has(row.deck_id)).map((row) => [row.deck_id, row]));
  const perDay = new Map();
  for (const row of summary.days || []) {
    if (!ids.has(row.deck_id)) continue;
    perDay.set(row.day, (perDay.get(row.day) || 0) + Number(row.reviews));
  }
  const sum = (list, read) => list.reduce((total, item) => total + (Number(read(item)) || 0), 0);
  const rows = [...history.values()];
  const reviews = sum(rows, (row) => row.reviews);
  const remembered = sum(rows, (row) => row.remembered);
  const grades = [0, 1, 2, 3].map((index) => sum(rows, (row) => row.grades_30?.[index]));
  const due = sum(mine, (deck) => Number(deck.due_count) + Number(deck.learning_count));
  const studied = sum(mine, (deck) => deck.studied_count);
  const cardTotal = sum(mine, (deck) => deck.card_count);
  const weeks = window.matchMedia('(max-width: 700px)').matches ? 12 : 20;

  const ordered = [...mine].sort((a, b) => (history.get(b.id)?.last_review || '').localeCompare(history.get(a.id)?.last_review || '')
    || (Number(b.studied_count) || 0) - (Number(a.studied_count) || 0));
  const setName = (deck) => {
    const subject = subjectOf(deck);
    const name = subjectNames.get(subject) || entryFor(deck)?.subject || '';
    if (deck.catalogue_id) return html`<b>${name || deck.title}</b>${name ? html` · ${entryFor(deck)?.deck_type || deck.title}` : ''}`;
    return html`${name ? html`<b>${name}</b> · ` : ''}${deck.title} <span class="small muted">(your own)</span>`;
  };
  const dot = (deck) => html`<span class="dot hf-dot" style="--sc:${subjectOf(deck) ? subjectColour(subjectOf(deck)) : 'var(--surface)'}" aria-hidden="true"></span>`;

  setHtml(slot, html`<div class="stack stack--lg">
    <section class="grid grid--stats" aria-label="Flashcard summary">
      ${stat('Cards studied', n(studied), `of ${n(cardTotal)} in your sets`)}
      ${stat('Reviews', n(reviews), `${n(sum(rows, (row) => row.reviews_week))} this week`)}
      ${stat('Remembered', reviews ? `${Math.round((100 * remembered) / reviews)}%` : '—', 'rated Good or Easy')}
      ${stat('Due now', n(due), due ? html`<a href="${links.flashcards()}">Study them</a>` : 'all caught up')}
      ${stat('Flashcard streak', n(streak(perDay)), 'days in a row')}
    </section>
    <div class="grid grid--2 hf-pair">
      <section class="card ruled tilt-2"><i class="tape tape--l" aria-hidden="true"></i>
        <div class="card__head"><h2 class="card__title">Days you studied flashcards</h2><span class="small muted">Last ${weeks} weeks</span></div>
        ${heatmap(perDay, weeks)}</section>
      <section class="card ruled tilt-4"><i class="tape tape--c" aria-hidden="true"></i>
        <div class="card__head"><h2 class="card__title">How you rate your answers</h2><span class="small muted">Last 30 days</span></div>
        ${ratings(grades)}</section>
    </div>
    <section class="card ruled tilt-1"><i class="tape tape--r" aria-hidden="true"></i>
      <div class="card__head"><h2 class="card__title">By set</h2>
        <div class="hf-key"><span><i class="hf-swatch is-known"></i>Known</span><span><i class="hf-swatch is-learning"></i>Learning</span><span><i class="hf-swatch"></i>Not started</span></div></div>
      <div class="table-wrap"><table class="table hf-table">
        <thead><tr><th>Set</th><th class="hf-col-bar">Cards studied</th><th class="num hf-hide-phone">Remembered</th><th class="num">Due</th><th class="hf-hide-phone">Last studied</th><th class="hf-hide-phone"><span class="sr-only">Study</span></th></tr></thead>
        <tbody>${ordered.map((deck) => {
          const row = history.get(deck.id);
          return html`<tr>
            <td>${dot(deck)} <a class="hf-set" href="${links.flashcards({ study: deck.id })}">${setName(deck)}</a></td>
            <td class="hf-col-bar">${progressBar(deck)}</td>
            <td class="num hf-hide-phone">${row?.reviews ? `${Math.round((100 * row.remembered) / row.reviews)}%` : '—'}</td>
            <td class="num">${n(Number(deck.due_count) + Number(deck.learning_count))}</td>
            <td class="small hf-hide-phone">${row?.last_review ? fmtRelative(row.last_review) : 'Not yet'}</td>
            <td class="right hf-hide-phone"><a class="btn btn--sm" href="${links.flashcards({ study: deck.id })}" tabindex="-1">Study</a></td>
          </tr>`;
        })}</tbody>
      </table></div>
    </section>
  </div>`);
}
