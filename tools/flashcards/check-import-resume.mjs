// Large-import resilience check for the Flashcards beta (local QA stack only).
// Run with tools/flashcards/local-stack/run-browser-check.mjs tools/flashcards/check-import-resume.mjs
// It imports 5,000 synthetic Quizlet cards, interrupts the upload after staging
// starts, reloads, and checks resume, cancellation, study visibility, duplicate
// skipping and exact final counts against the database.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { sql, literal } = await import('./local-stack/server.mjs');
const { trackBackend } = await import('./local-stack/idle.mjs');
let settle;
const accounts = JSON.parse(await readFile(process.env.PPP_FLASHCARD_QA_ACCOUNTS, 'utf8'));
const account = accounts.find(({ role }) => role === 'main');
const base = 'http://localhost:5173/';
const server = spawn(process.execPath, ['tools/serve.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
await once(server.stdout, 'data');
const bridge = await import(resolve(process.env.PPP_FLASHCARD_QA_NETWORK_MODULE));
const browser = await chromium.launch({ executablePath: process.env.PPP_CHROMIUM_EXECUTABLE });
const modulePath = '/js/flashcards/api.js';
const CARDS = 5000;
const lines = (label) => Array.from({ length: CARDS }, (_, i) => `${label} term ${i + 1}\t${label} definition ${i + 1}`).join('\n');
const scalar = async (query) => JSON.parse((await sql(`select to_jsonb((${query}))`)).trim());
const issues = [];

async function signIn(page) {
  await page.goto(`${base}#/flashcards`);
  await page.waitForURL(/#\/login\?next=/);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('heading', { name: /^Flashcards(?: Beta)?$/ }).waitFor();
}
async function createDeck(page, title) {
  if (!await page.getByRole('button', { name: 'Create deck', exact: true }).count()) {
    await page.getByRole('button', { name: /My decks/ }).first().click();
    await page.getByRole('button', { name: 'Create deck', exact: true }).first().waitFor();
    await settle();
  }
  await page.getByRole('button', { name: 'Create deck', exact: true }).first().click();
  await page.getByLabel('Deck name').fill(title);
  await page.getByRole('dialog').getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  return scalar(`select id from public.flashcard_decks where title=${literal(title)}`);
}
async function preview(page, deckTitle, text) {
  // The decks view ignores clicks while it refreshes, so wait for each view before acting.
  if (!await page.getByRole('button', { name: 'Import', exact: true }).count()) {
    await page.getByRole('button', { name: /My decks/ }).first().click();
    await page.getByRole('button', { name: 'Import', exact: true }).waitFor();
    await settle();
  }
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.locator('[data-import-form] select[name="deck"]').selectOption({ label: deckTitle });
  await page.locator('[data-import-form] select[name="source"]').selectOption('quizlet');
  // Paste the export in one step (Playwright's fill is slow for 5,000 lines).
  await page.getByLabel('Exported text').evaluate((field, value) => { field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); }, text);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('heading', { name: 'Import preview' }).waitFor();
  return (await page.locator('.flashcards__preview > p').nth(1).textContent()).trim();
}
async function interruptAfter(page, chunks) {
  let seen = 0;
  await page.route('**/rest/v1/rpc/flashcard_import_chunk', (route) => (++seen > chunks ? route.abort('connectionreset') : route.fallback()));
  await page.getByRole('button', { name: 'Import cards', exact: true }).click();
  await page.getByText('The import could not finish. You can retry.').waitFor({ timeout: 120_000 });
  await page.unroute('**/rest/v1/rpc/flashcard_import_chunk');
}
async function commit(page) {
  await page.getByRole('button', { name: 'Import cards', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-import-progress]')?.textContent.startsWith('Imported '), null, { timeout: 180_000 });
  return page.locator('[data-import-progress]').textContent();
}
const api = (page, name, ...args) => page.evaluate(async ({ path, name, args }) => (await import(path))[name](...args), { path: modulePath, name, args });
const deckCounts = async (deckId) => ({
  cards: await scalar(`select count(*) from public.flashcard_cards where deck_id=${literal(deckId)}`),
  staged: await scalar(`select count(*) from public.flashcard_cards c join public.flashcard_imports i on i.id=c.import_id where c.deck_id=${literal(deckId)} and i.status='staging'`),
  notes: await scalar(`select count(distinct note_id) from public.flashcard_cards where deck_id=${literal(deckId)}`),
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await bridge.install(context);
  const page = await context.newPage();
  settle = trackBackend(page);
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => issues.push(error.message));
  await signIn(page);

  // 1. Resume: interrupt after staging begins, reload, re-select the same text.
  const resumeDeck = await createDeck(page, 'Large import resume');
  assert.equal(await preview(page, 'Large import resume', lines('Resume')), `${CARDS} cards ready · 0 duplicates skipped · 0 invalid rows`);
  await interruptAfter(page, 10);
  let counts = await deckCounts(resumeDeck);
  assert.equal(counts.staged, 1000, 'ten chunks of 100 cards were staged before the interruption');
  assert.equal(counts.cards, counts.staged, 'only staged rows exist for the interrupted import');
  assert.equal(await scalar(`select count(*) from public.flashcard_imports where status='staging'`), 1);
  await page.reload();
  await page.getByRole('heading', { name: /^Flashcards(?: Beta)?$/ }).waitFor();
  const decks = await api(page, 'listDecks');
  assert.equal(decks.find((deck) => deck.id === resumeDeck).card_count, 0, 'staged cards are not counted in the deck list');
  assert.equal((await api(page, 'listCards', resumeDeck)).length, 0, 'staged cards are not listed');
  assert.equal((await api(page, 'getStudyQueue', resumeDeck)).cards.length, 0, 'staged cards are not studied');
  const stagedCard = await scalar(`select id from public.flashcard_cards where deck_id=${literal(resumeDeck)} limit 1`);
  const review = await page.evaluate(async ({ path, id }) => {
    try { return await (await import(path)).reviewCard({ id, revision: 0 }, 3, crypto.randomUUID()); } catch (error) { return { code: error.code }; }
  }, { path: modulePath, id: stagedCard });
  assert.equal(review.code, 'missing', 'a staged card cannot be reviewed');
  assert.equal(await preview(page, 'Large import resume', lines('Resume')), `${CARDS} cards ready · 0 duplicates skipped · 0 invalid rows`);
  assert.equal((await commit(page)).trim(), `Imported ${CARDS} cards. 0 duplicates skipped.`);
  counts = await deckCounts(resumeDeck);
  assert.deepEqual(counts, { cards: CARDS, staged: 0, notes: CARDS });
  assert.equal(await scalar(`select count(*) from public.flashcard_cards where deck_id=${literal(resumeDeck)} and source_key is not null`), CARDS);
  assert.equal(await scalar(`select count(distinct source_key) from public.flashcard_cards where deck_id=${literal(resumeDeck)}`), CARDS, 'no duplicate cards were created by the retry');
  assert.equal((await api(page, 'listCards', resumeDeck)).length, CARDS);
  assert.equal((await api(page, 'getStudyQueue', resumeDeck)).cards.length, 20, 'the default daily new-card limit applies');

  // 2. Reimport: every card is a duplicate and nothing can be committed.
  assert.equal(await preview(page, 'Large import resume', lines('Resume')), `0 cards ready · ${CARDS} duplicates skipped · 0 invalid rows`);
  assert.equal(await page.getByRole('button', { name: 'Import cards', exact: true }).isDisabled(), true);

  // 3. Restore deleted cards by importing the same file again.
  const removed = await sql(`select string_agg(id::text, ',') from (select id from public.flashcard_cards where deck_id=${literal(resumeDeck)} order by created_at desc limit 2) r`);
  for (const id of removed.trim().split(',')) assert.equal(await api(page, 'deleteCard', id), true);
  assert.equal(await preview(page, 'Large import resume', lines('Resume')), `2 cards ready · ${CARDS - 2} duplicates skipped · 0 invalid rows`);
  assert.equal((await commit(page)).trim(), `Imported 2 cards. ${CARDS - 2} duplicates skipped.`);
  assert.equal((await deckCounts(resumeDeck)).cards, CARDS, 'deleted cards were restored by reimporting');

  // 4. Cancel: interrupt a different import, reload, cancel, and confirm nothing is left behind.
  const cancelDeck = await createDeck(page, 'Large import cancel');
  assert.equal(await preview(page, 'Large import cancel', lines('Cancel')), `${CARDS} cards ready · 0 duplicates skipped · 0 invalid rows`);
  await interruptAfter(page, 5);
  assert.equal((await deckCounts(cancelDeck)).staged, 500);
  await page.reload();
  await page.getByRole('heading', { name: /^Flashcards(?: Beta)?$/ }).waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel an unfinished import' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel import' }).click();
  await page.getByText('Unfinished import cancelled.').waitFor();
  assert.deepEqual(await deckCounts(cancelDeck), { cards: 0, staged: 0, notes: 0 });
  assert.equal(await scalar(`select count(*) from public.flashcard_imports where status='staging'`), 0);
  assert.equal(await scalar(`select count(*) from public.flashcard_notes n where not exists (select 1 from public.flashcard_cards c where c.note_id=n.id)`), 0, 'no orphan notes remain');
  assert.equal((await deckCounts(resumeDeck)).cards, CARDS, 'cancelling does not touch a completed import');
  assert.equal(await preview(page, 'Large import cancel', lines('Cancel')), `${CARDS} cards ready · 0 duplicates skipped · 0 invalid rows`);
  assert.equal((await commit(page)).trim(), `Imported ${CARDS} cards. 0 duplicates skipped.`);
  assert.deepEqual(await deckCounts(cancelDeck), { cards: CARDS, staged: 0, notes: CARDS });
  assert.deepEqual(issues, []);
  console.log('5,000-card import: interrupted staging hidden from study, resume to an exact count, reimport duplicates, restore of deleted cards and cancellation verified.');
} catch (error) {
  for (const context of browser.contexts()) for (const open of context.pages()) console.error(`--- ${open.url()}\n${(await open.locator('main').innerText().catch(() => '')).slice(0, 1500)}`);
  throw error;
} finally {
  await browser.close();
  server.kill();
}
