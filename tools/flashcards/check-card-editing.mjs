// Card editing check for the Flashcards beta (local QA stack only).
// Run with tools/flashcards/local-stack/run-browser-check.mjs tools/flashcards/check-card-editing.mjs
// Creates Basic, Reverse and Cloze notes in the browser, studies one card, edits
// its text and tags, moves it, and checks that its identity, schedule and review
// history survive. Also checks cloze variant removal requires confirmation.
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
const accounts = JSON.parse(await readFile(process.env.PPP_FLASHCARD_QA_ACCOUNTS, 'utf8'));
const account = accounts.find(({ role }) => role === 'main');
const base = 'http://localhost:5173/';
const server = spawn(process.execPath, ['tools/serve.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
await once(server.stdout, 'data');
const bridge = await import(resolve(process.env.PPP_FLASHCARD_QA_NETWORK_MODULE));
const browser = await chromium.launch({ executablePath: process.env.PPP_CHROMIUM_EXECUTABLE });
const rows = async (query) => JSON.parse((await sql(`select coalesce(jsonb_agg(r),'[]') from (${query}) r`)).trim());
const issues = [];

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await bridge.install(context);
  const page = await context.newPage();
  const settle = trackBackend(page);
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => issues.push(error.message));
  await page.goto(`${base}#/flashcards`);
  await page.waitForURL(/#\/login\?next=/);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('heading', { name: /^Flashcards(?: Beta)?$/ }).waitFor();

  async function toDecks() {
    if (await page.getByRole('button', { name: /Back to deck/ }).count()) { await page.getByRole('button', { name: /Back to deck/ }).click(); await page.getByRole('button', { name: 'Deck settings' }).waitFor(); }
    if (await page.getByRole('button', { name: /^← My decks$/ }).count()) await page.getByRole('button', { name: /^← My decks$/ }).click();
    await page.getByRole('button', { name: 'Create deck', exact: true }).first().waitFor();
    await settle();
  }
  async function createDeck(title) {
    await toDecks();
    await page.getByRole('button', { name: 'Create deck', exact: true }).first().click();
    await page.getByLabel('Deck name').fill(title);
    await page.getByRole('dialog').getByRole('button', { name: 'Create deck' }).click();
    await page.getByRole('heading', { name: title, exact: true }).waitFor();
    await settle();
    return (await rows(`select id from public.flashcard_decks where title=${literal(title)}`))[0].id;
  }
  async function manage(deckId) {
    await toDecks();
    await page.locator(`[data-action="open-deck"][data-id="${deckId}"]`).click();
    await page.getByRole('button', { name: 'Deck settings' }).waitFor();
    await settle();
  }
  async function addCard(type, front, back, tags = '') {
    const before = await page.locator('.flashcards__row').count();
    await page.getByRole('button', { name: 'Add card' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('[name=type]').selectOption(type);
    await dialog.locator('[name=front]').fill(front);
    await dialog.locator('[name=back]').fill(back);
    await dialog.locator('[name=tags]').fill(tags);
    await dialog.getByRole('button', { name: 'Save card' }).click();
    await dialog.waitFor({ state: 'detached' });
    // The list redraws when the save (and its refresh) has finished.
    await page.waitForFunction((count) => document.querySelectorAll('.flashcards__row').length > count, before);
    await settle();
  }
  const cardsOf = (deck) => rows(`select c.id,c.variant,c.note_id,n.note_type,n.front,n.back,n.tags,s.revision,s.state from public.flashcard_cards c join public.flashcard_notes n on n.id=c.note_id join public.flashcard_states s on s.card_id=c.id where c.deck_id=${literal(deck)} order by c.created_at,c.variant`);
  const row = (cardId) => page.locator('.flashcards__row').filter({ has: page.locator(`[data-id="${cardId}"]`) });

  const deckA = await createDeck('Editing QA');
  const deckB = await createDeck('Moved QA');
  await manage(deckA);
  await addCard('basic', 'Basic question', 'Basic answer', 'one');
  await addCard('reverse', 'Reverse front', 'Reverse back');
  await addCard('cloze', '{{c1::Alpha}} and {{c2::Beta::second letter}}', 'Greek letters');
  let cards = await cardsOf(deckA);
  assert.deepEqual(cards.map((card) => [card.note_type, card.variant]), [
    ['basic', 'forward'], ['reverse', 'forward'], ['reverse', 'reverse'], ['cloze', 'cloze:1'], ['cloze', 'cloze:2'],
  ]);

  // Study every new card once and record what the question side shows.
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  const questions = [];
  for (let i = 0; i < 5; i++) {
    const question = (await page.locator('.flashcards__study .flashcards__content').first().innerText()).trim();
    questions.push(question);
    await page.getByRole('button', { name: /Show answer/ }).click();
    await page.getByRole('button', { name: i === 0 ? /^Good/ : /^Easy/ }).click();
    await page.waitForFunction((previous) => {
      const text = document.querySelector('.flashcards__study .flashcards__content')?.innerText.trim();
      return (document.querySelector('.flashcards__study p.small.muted')?.textContent === 'Question' && text !== previous) || /All caught up/.test(document.querySelector('.flashcards__study')?.textContent || '');
    }, question);
  }
  // Sibling cards of one note share a creation time, so their relative order may vary.
  assert.equal(questions[0], 'Basic question');
  assert.deepEqual(questions.slice(1, 3).sort(), ['Reverse back', 'Reverse front']);
  assert.deepEqual(questions.slice(3).sort(), ['Alpha and [second letter]', '[…] and Beta']);

  // Edit the reviewed Basic card's text and tags, then move it to another deck.
  const [basic] = await cardsOf(deckA);
  assert.equal(basic.revision, 1);
  const before = await rows(`select request_id,revision,grade,state_after from public.flashcard_reviews where card_id=${literal(basic.id)}`);
  assert.equal(before.length, 1);
  await toDecks();
  await manage(deckA);
  await row(basic.id).getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('dialog').locator('[name=front]').fill('Basic question, edited');
  await page.getByRole('dialog').locator('[name=tags]').fill('two, three');
  await page.getByRole('dialog').getByRole('button', { name: 'Save card' }).click();
  await page.getByText('Basic question, edited', { exact: true }).waitFor();
  await settle();
  await row(basic.id).getByRole('button', { name: 'Move', exact: true }).click();
  await page.getByRole('dialog').locator('[name=deck]').selectOption(deckB);
  await page.getByRole('dialog').getByRole('button', { name: 'Move card' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await settle();
  const [moved] = await cardsOf(deckB);
  assert.equal(moved.id, basic.id, 'the card keeps its ID');
  assert.equal(moved.note_id, basic.note_id);
  assert.equal(moved.front, 'Basic question, edited');
  assert.deepEqual(moved.tags, ['two', 'three']);
  assert.equal(moved.revision, 1);
  assert.deepEqual(moved.state, basic.state, 'the due date and FSRS state are unchanged');
  assert.deepEqual(await rows(`select request_id,revision,grade,state_after from public.flashcard_reviews where card_id=${literal(basic.id)}`), before, 'review history is unchanged');
  await manage(deckB);
  const meta = await row(basic.id).locator('p.small').innerText();
  assert.match(meta, /Learning · Due /);
  assert.match(meta, /two, three/);

  // Removing a cloze variant asks first; cancelling leaves the note unchanged.
  await manage(deckA);
  let clozeCards = (await cardsOf(deckA)).filter((card) => card.note_type === 'cloze');
  await row(clozeCards[0].id).getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('dialog').locator('[name=front]').fill('{{c1::Alpha}} and Beta');
  await page.getByRole('dialog').getByRole('button', { name: 'Save card' }).click();
  await page.getByRole('dialog').getByText('This edit removes 1 card from study').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await settle();
  assert.deepEqual((await cardsOf(deckA)).filter((card) => card.note_type === 'cloze').map((card) => [card.id, card.front]), clozeCards.map((card) => [card.id, card.front]));
  await row(clozeCards[0].id).getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('dialog').locator('[name=front]').fill('{{c1::Alpha}} and Beta');
  await page.getByRole('dialog').getByRole('button', { name: 'Save card' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await settle();
  let remaining = (await cardsOf(deckA)).filter((card) => card.note_type === 'cloze');
  assert.deepEqual(remaining.map((card) => [card.id, card.variant, card.revision]), [[clozeCards[0].id, 'cloze:1', 1]]);
  assert.equal(await (await rows(`select count(*) as n from public.flashcard_reviews where card_id=${literal(clozeCards[1].id)}`))[0].n, 1, 'the removed variant keeps its review log');

  // Adding a cloze number needs no confirmation and keeps the existing card.
  await row(clozeCards[0].id).getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('dialog').locator('[name=front]').fill('{{c1::Alpha}} and {{c3::Gamma}}');
  await page.getByRole('dialog').getByRole('button', { name: 'Save card' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await settle();
  remaining = (await cardsOf(deckA)).filter((card) => card.note_type === 'cloze');
  assert.deepEqual(remaining.map((card) => [card.variant, card.revision]), [['cloze:1', 1], ['cloze:3', 0]]);
  assert.equal(remaining[0].id, clozeCards[0].id);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll on a phone');
  assert.deepEqual(issues, []);
  console.log('Basic, Reverse and Cloze study cards; edit and move keep ID, schedule and history; cloze removal confirmation verified (phone viewport).');
} catch (error) {
  for (const context of browser.contexts()) for (const open of context.pages()) console.error(`--- ${open.url()}\n${(await open.locator('body').innerText().catch(() => '')).slice(0, 1500)}`);
  throw error;
} finally {
  await browser.close();
  server.kill();
}
