// Anki and CSV import check for the Flashcards beta (local QA stack only).
// Run with tools/flashcards/local-stack/run-browser-check.mjs tools/flashcards/check-anki-csv.mjs
// Imports an Anki-generated package (images, audio, reverse, cloze, suspended cards
// and nested decks) and a CSV with quoted multiline fields, then checks the saved
// rows, private media, the study queue and how each study card renders.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { sql, literal } = await import('./local-stack/server.mjs');
const accounts = JSON.parse(await readFile(process.env.PPP_FLASHCARD_QA_ACCOUNTS, 'utf8'));
const account = accounts.find(({ role }) => role === 'main');
const other = accounts.find(({ role }) => role === 'lookalike');
const base = 'http://localhost:5173/';
const apkg = resolve(process.env.PPP_FLASHCARD_QA_APKG);
const server = spawn(process.execPath, ['tools/serve.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
await once(server.stdout, 'data');
const bridge = await import(resolve(process.env.PPP_FLASHCARD_QA_NETWORK_MODULE));
const browser = await chromium.launch({ executablePath: process.env.PPP_CHROMIUM_EXECUTABLE });
const modulePath = '/js/flashcards/api.js';
const rows = async (query) => JSON.parse((await sql(`select coalesce(jsonb_agg(r),'[]') from (${query}) r`)).trim());
const issues = [];

async function open(viewport, who) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  await bridge.install(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => issues.push(error.message));
  await page.goto(`${base}#/flashcards`);
  await page.waitForURL(/#\/login\?next=/);
  await page.getByLabel('Email', { exact: true }).fill(who.email);
  await page.locator('input[name="password"]').fill(who.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('heading', { name: /^Flashcards(?: Beta)?$/ }).waitFor();
  return page;
}
async function idleDecks(page) {
  if (await page.getByRole('button', { name: /Back to deck/ }).count()) {
    await page.getByRole('button', { name: /Back to deck/ }).first().click();
    await page.getByRole('button', { name: 'Deck settings' }).waitFor();
    await page.waitForLoadState('networkidle');
  }
  if (!await page.getByRole('button', { name: 'Import', exact: true }).count()) await page.getByRole('button', { name: /My decks/ }).first().click();
  await page.getByRole('button', { name: 'Import', exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
}
async function createDeck(page, title) {
  await idleDecks(page);
  await page.getByRole('button', { name: 'Create deck', exact: true }).first().click();
  await page.getByLabel('Deck name').fill(title);
  await page.getByRole('dialog').getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  return (await rows(`select id from public.flashcard_decks where title=${literal(title)}`))[0].id;
}
async function importFile(page, title, source, setup) {
  await idleDecks(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.locator('[data-import-form] select[name="deck"]').selectOption({ label: title });
  await page.locator('[data-import-form] select[name="source"]').selectOption(source);
  await setup(page);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('heading', { name: 'Import preview' }).waitFor();
  const summary = (await page.locator('.flashcards__preview > p').nth(1).textContent()).trim();
  await page.getByRole('button', { name: 'Import cards', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-import-progress]')?.textContent.startsWith('Imported '), null, { timeout: 90_000 });
  return { summary, result: (await page.locator('[data-import-progress]').textContent()).trim() };
}
const api = (page, name, ...args) => page.evaluate(async ({ path, name, args }) => {
  try { return await (await import(path))[name](...args); } catch (error) { return { error: error.message, code: error.code }; }
}, { path: modulePath, name, args });

try {
  const page = await open({ width: 1440, height: 1000 }, account);
  const ankiDeck = await createDeck(page, 'Anki QA');
  const anki = await importFile(page, 'Anki QA', 'anki', (p) => p.locator('input[name="file"]').setInputFiles(apkg));
  assert.equal(anki.summary, '5 cards ready · 0 duplicates skipped · 0 invalid rows');
  assert.equal(anki.result, 'Imported 5 cards. 0 duplicates skipped.');

  // Nested decks are created under the chosen deck from the package hierarchy.
  const tree = await rows(`with recursive t as (select id,title,parent_id,title::text as path from public.flashcard_decks where id=${literal(ankiDeck)}
    union all select d.id,d.title,d.parent_id,t.path||'::'||d.title from public.flashcard_decks d join t on d.parent_id=t.id) select path from t order by path`);
  assert.deepEqual(tree.map((row) => row.path), ['Anki QA', 'Anki QA::Biology', 'Anki QA::Biology::Cells', 'Anki QA::Biology::Reproduction']);
  const saved = await rows(`select n.note_type,c.variant,c.suspended,d.title as deck,n.front,n.back from public.flashcard_cards c join public.flashcard_notes n on n.id=c.note_id join public.flashcard_decks d on d.id=c.deck_id order by n.created_at,c.variant`);
  assert.deepEqual(saved.map((card) => [card.note_type, card.variant, card.suspended, card.deck]).sort(), [
    ['basic', 'forward', false, 'Cells'], ['basic', 'forward', true, 'Reproduction'], ['basic', 'reverse', false, 'Cells'],
    ['cloze', 'cloze:1', false, 'Cells'], ['cloze', 'cloze:2', false, 'Cells'],
  ].sort());
  const media = await rows(`select id,mime_type,octet_length(data) as bytes from public.flashcard_media order by mime_type`);
  assert.deepEqual(media.map((item) => item.mime_type), ['audio/mpeg', 'image/png']);
  const imageCard = saved.find((card) => card.front.startsWith('Identify'));
  assert.match(imageCard.front, new RegExp(`<img src="media:${media[1].id}">`));
  assert.match(imageCard.front, new RegExp(`\\[sound:media:${media[0].id}\\]`));
  assert.doesNotMatch(imageCard.front, /tiny\.png|tone\.mp3/);

  // Study the Cells subdeck: the suspended card is excluded and every variant renders.
  const cells = (await rows(`select id from public.flashcard_decks where title='Cells'`))[0].id;
  const queue = await api(page, 'getStudyQueue', cells);
  assert.equal(queue.cards.length, 4);
  assert.equal((await api(page, 'getStudyQueue', (await rows(`select id from public.flashcard_decks where title='Reproduction'`))[0].id)).cards.length, 0, 'suspended Anki cards stay out of study');
  await idleDecks(page);
  await page.locator(`[data-action="study"][data-id="${cells}"]`).click();
  const faces = [];
  for (let i = 0; i < 4; i++) {
    const question = (await page.locator('.flashcards__study .flashcards__content').first().innerText()).trim();
    if (question.startsWith('Identify')) {
      await page.locator('.flashcards__study img').first().evaluate((image) => image.complete && image.naturalWidth > 0 ? null : new Promise((done, fail) => { image.onload = done; image.onerror = fail; }));
      assert.ok(await page.locator('.flashcards__study img').first().evaluate((image) => image.src.startsWith('blob:') && image.naturalWidth > 0), 'the private image renders');
      await page.locator('.flashcards__study audio').first().waitFor({ state: 'attached' });
    }
    await page.getByRole('button', { name: /Show answer/ }).click();
    const answer = (await page.locator('.flashcards__study .flashcards__content').nth(1).innerText()).trim();
    faces.push([question, answer]);
    const reviewed = await page.evaluate(() => document.querySelectorAll('.flashcards__study').length);
    await page.getByRole('button', { name: /^Good/ }).click();
    // Wait for the saved rating to bring the next question (or the end of the queue).
    await page.waitForFunction((previous) => {
      const label = document.querySelector('.flashcards__study p.small.muted')?.textContent;
      const text = document.querySelector('.flashcards__study .flashcards__content')?.innerText.trim();
      return (label === 'Question' && text !== previous) || /All caught up/.test(document.querySelector('.flashcards__study')?.textContent || '');
    }, question);
    void reviewed;
  }
  assert.deepEqual(faces.map(([q]) => q).sort(), [
    'Cell membrane',
    'Identify this cell part',
    'The [...] controls the cell. Mitochondria release energy.',
    'The nucleus controls the cell. [...] release energy.',
  ].sort().map((text) => text.replace('[...]', '[…]')));
  assert.ok(faces.some(([q, a]) => q === 'Cell membrane' && a.startsWith('Identify this cell part')), 'reverse card swaps the sides');
  assert.ok(faces.some(([q, a]) => q.startsWith('The […] controls') && a.startsWith('The nucleus controls the cell. Mitochondria')), 'cloze answer reveals the deletion');

  // CSV with quoted delimiters, escaped quotes and multiline fields, plus a deck column.
  const csvDeck = await createDeck(page, 'CSV QA');
  const csv = 'Front;Back;Tags;Deck\r\n"Semi; colon";"Line one\r\nLine two with ""quotes""";alpha beta;Chemistry::Bonding\r\n"Plain";"Answer";;\r\n"";"Missing front";;\r\n';
  const result = await importFile(page, 'CSV QA', 'csv', async (p) => {
    await p.locator('input[name="file"]').setInputFiles({ name: 'qa.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await p.locator('select[name="delimiter"]').selectOption(';');
    await p.getByLabel('First row contains headers').check();
    await p.getByLabel('Tags column (optional)').fill('3');
    await p.getByLabel('Deck column (optional)').fill('4');
  });
  assert.equal(result.summary, '2 cards ready · 0 duplicates skipped · 1 invalid row');
  const csvRows = await rows(`with recursive t as (select id, ''::text as path from public.flashcard_decks where id=${literal(csvDeck)}
    union all select d.id, ltrim(t.path||'::'||d.title,':') from public.flashcard_decks d join t on d.parent_id=t.id)
    select n.front,n.back,n.tags,t.path from public.flashcard_cards c join public.flashcard_notes n on n.id=c.note_id join t on t.id=c.deck_id order by n.front`);
  assert.deepEqual(csvRows, [
    { back: 'Answer', path: '', tags: [], front: 'Plain' },
    { front: 'Semi; colon', back: 'Line one\nLine two with "quotes"', tags: ['alpha', 'beta'], path: 'Chemistry::Bonding' },
  ]);

  // The multiline field is shown on two lines when studied.
  const bonding = (await rows(`select id from public.flashcard_decks where title='Bonding'`))[0].id;
  await idleDecks(page);
  await page.locator(`[data-action="study"][data-id="${bonding}"]`).click();
  await page.getByRole('button', { name: /Show answer/ }).click();
  assert.equal((await page.locator('.flashcards__study .flashcards__content').nth(1).innerText()).trim(), 'Line one\nLine two with "quotes"');

  // Another account cannot read these cards, notes or media.
  const intruder = await open({ width: 390, height: 844 }, other);
  assert.equal((await api(intruder, 'listCards', cells)).length, 0);
  for (const item of media) assert.equal((await api(intruder, 'readMedia', item.id)).error, 'This media is unavailable.');
  assert.deepEqual(issues, []);
  console.log('Anki package (nested decks, image, audio, reverse, cloze, suspended) and CSV (quoted multiline, deck column) imports verified, including private media.');
} finally {
  await browser.close();
  server.kill();
}
