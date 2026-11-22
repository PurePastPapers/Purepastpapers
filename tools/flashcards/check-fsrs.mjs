// FSRS rating edge cases for the Flashcards beta (local QA stack only).
// Run with tools/flashcards/local-stack/run-browser-check.mjs tools/flashcards/check-fsrs.mjs
// Two signed-in browser sessions rate the same card with different grades at the
// same moment, a rating is retried with its original request ID, and a deck's target
// retention is changed between reviews.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { rateCard } from '../../js/flashcards/scheduler.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { sql, literal } = await import('./local-stack/server.mjs');
const { trackBackend } = await import('./local-stack/idle.mjs');
const accounts = JSON.parse(await readFile(process.env.PPP_FLASHCARD_QA_ACCOUNTS, 'utf8'));
const account = accounts.find(({ role }) => role === 'main');
const base = 'http://localhost:5173/';
const server = spawn(process.execPath, ['tools/serve.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
await once(server.stdout, 'data');
const bridge = await import(resolve(process.env.PPP_FLASHCARD_QA_NETWORK_MODULE));
const browser = await chromium.launch({ executablePath: process.env.PPP_CHROMIUM_EXECUTABLE });
const modulePath = '/js/flashcards/api.js';
const rows = async (query) => JSON.parse((await sql(`select coalesce(jsonb_agg(r),'[]') from (${query}) r`)).trim());
const issues = [];

async function session(viewport) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  await bridge.install(context);
  const page = await context.newPage();
  page.settle = trackBackend(page);
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => issues.push(error.message));
  await page.goto(`${base}#/flashcards`);
  await page.waitForURL(/#\/login\?next=/);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('heading', { name: /^Flashcards(?: Beta)?$/ }).waitFor();
  await page.settle();
  return page;
}
const api = (page, name, ...args) => page.evaluate(async ({ path, name, args }) => {
  try { return await (await import(path))[name](...args); } catch (error) { return { error: error.message, code: error.code, retryable: error.retryable }; }
}, { path: modulePath, name, args });
const state = async (cardId) => (await rows(`select s.revision,s.state,c.deck_id from public.flashcard_states s join public.flashcard_cards c on c.id=s.card_id where s.card_id=${literal(cardId)}`))[0];
const reviews = (cardId) => rows(`select request_id,revision,grade,settings,state_after,reviewed_at from public.flashcard_reviews where card_id=${literal(cardId)} order by revision`);

try {
  const desktop = await session({ width: 1440, height: 1000 });
  const phone = await session({ width: 390, height: 844 });
  const deck = await api(desktop, 'createDeck', { title: 'FSRS QA' });
  for (const front of ['Conflict card', 'Retention card', 'Control card']) {
    assert.equal((await api(desktop, 'saveNote', { deck_id: deck.id, type: 'basic', front, back: `${front} answer`, tags: [] })).status, 'saved');
  }
  const cards = await rows(`select c.id,n.front from public.flashcard_cards c join public.flashcard_notes n on n.id=c.note_id where c.deck_id=${literal(deck.id)}`);
  const byFront = Object.fromEntries(cards.map((card) => [card.front, card.id]));

  // 1. Both sessions show the first card and rate it differently at the same moment.
  for (const page of [desktop, phone]) {
    await page.reload();
    await page.getByRole('heading', { name: /^Flashcards(?: Beta)?$/ }).waitFor();
    await page.settle();
    await page.locator(`[data-action="study"][data-id="${deck.id}"]`).click();
    await page.getByText('Conflict card', { exact: true }).waitFor();
    await page.getByRole('button', { name: /Show answer/ }).click();
  }
  await Promise.all([
    desktop.getByRole('button', { name: /^Easy/ }).click(),
    phone.getByRole('button', { name: /^Again/ }).click(),
  ]);
  await Promise.all([desktop.settle(), phone.settle()]);
  const conflictLog = await reviews(byFront['Conflict card']);
  assert.equal(conflictLog.length, 1, 'exactly one of the conflicting ratings is saved');
  const winner = conflictLog[0];
  assert.ok([1, 4].includes(winner.grade));
  const loser = winner.grade === 4 ? phone : desktop;
  await loser.getByText('This card was already rated in another session.').waitFor();
  assert.deepEqual((await state(byFront['Conflict card'])).state, winner.state_after, 'the saved state is the winning rating');
  for (const page of [desktop, phone]) {
    assert.equal(await page.getByText('Your rating is waiting to be saved').count(), 0, 'a conflict is not left as a pending retry');
    assert.equal(await page.getByText('Conflict card', { exact: true }).count(), 0, 'both sessions move past the rated card');
  }

  // 2. A retried rating with the same request ID is applied once, even from the other session.
  const retained = await state(byFront['Control card']);
  const requestId = crypto.randomUUID();
  const first = await api(desktop, 'reviewCard', { id: byFront['Control card'], revision: retained.revision }, 3, requestId);
  const retry = await api(phone, 'reviewCard', { id: byFront['Control card'], revision: retained.revision }, 3, requestId);
  assert.equal(first.status, 'saved');
  assert.deepEqual(retry, first);
  assert.equal((await reviews(byFront['Control card'])).length, 1);
  const misuse = await api(phone, 'reviewCard', { id: byFront['Control card'], revision: retained.revision }, 4, requestId);
  assert.equal(misuse.retryable, false, 'reusing a request ID with another grade is rejected');
  assert.equal((await reviews(byFront['Control card'])).length, 1);

  // 3. Retention changes affect future ratings and leave existing due dates alone.
  const retentionCard = byFront['Retention card'];
  const firstReview = await api(desktop, 'reviewCard', { id: retentionCard, revision: 0 }, 4, crypto.randomUUID());
  assert.equal(firstReview.state.state, 'Review');
  const control = await state(byFront['Control card']);
  await api(desktop, 'updateDeck', deck.id, { target_retention: 80 });
  assert.equal((await rows(`select retention from public.flashcard_decks where id=${literal(deck.id)}`))[0].retention, 80);
  assert.deepEqual((await state(retentionCard)).state, firstReview.state, 'changing retention keeps the existing due date');
  assert.deepEqual((await state(byFront['Control card'])).state, control.state);
  // Simulate the card becoming due (time travel in the disposable database only).
  const past = new Date(Date.now() - 60_000).toISOString();
  await sql(`update public.flashcard_states set state=jsonb_set(state,'{due}',to_jsonb(${literal(past)}::text)) where card_id=${literal(retentionCard)}`);
  const dueState = (await state(retentionCard)).state;
  const second = await api(phone, 'reviewCard', { id: retentionCard, revision: 1 }, 3, crypto.randomUUID());
  assert.equal(second.status, 'saved');
  const at80 = rateCard(dueState, 3, second.reviewed_at, 0.8).card;
  const at90 = rateCard(dueState, 3, second.reviewed_at, 0.9).card;
  assert.deepEqual(second.state, at80, 'the new rating uses the 80% target');
  assert.ok(Date.parse(at80.due) > Date.parse(at90.due), 'a lower target retention schedules a longer interval');
  assert.deepEqual((await reviews(retentionCard)).map((review) => review.settings.retention), [90, 80]);
  assert.deepEqual(firstReview.state, (await reviews(retentionCard))[0].state_after, 'the earlier review log is unchanged');
  assert.deepEqual(issues, []);
  console.log('Simultaneous conflicting ratings from two sessions, same-ID retry, request-ID misuse and retention change (future-only) verified.');
} catch (error) {
  for (const context of browser.contexts()) for (const open of context.pages()) console.error(`--- ${open.url()}\n${(await open.locator('main').innerText().catch(() => '')).slice(0, 1200)}`);
  throw error;
} finally {
  await browser.close();
  server.kill();
}
