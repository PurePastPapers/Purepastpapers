import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const accounts = JSON.parse(await readFile(process.env.PPP_FLASHCARD_QA_ACCOUNTS, 'utf8'));
const primary = accounts.find(({ role }) => role === 'main');
const school = accounts.find(({ role }) => role === 'school');
const lookalike = accounts.find(({ role }) => role === 'lookalike');
const base = process.env.PPP_FLASHCARD_QA_ORIGIN || 'http://localhost:5173/';
const ankiPath = resolve(process.env.PPP_FLASHCARD_QA_APKG);
const server = process.env.PPP_FLASHCARD_QA_ORIGIN ? null : spawn(process.execPath, ['tools/serve.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
if (server) await once(server.stdout, 'data');
const networkBridge = process.env.PPP_FLASHCARD_QA_NETWORK_MODULE ? await import(resolve(process.env.PPP_FLASHCARD_QA_NETWORK_MODULE)) : null;
const proxyServer = process.env.PPP_FLASHCARD_QA_PROXY;
const browser = await chromium.launch({
  executablePath: process.env.PPP_CHROMIUM_EXECUTABLE,
  ...(proxyServer ? { proxy: { server: proxyServer, bypass: 'localhost,127.0.0.1' } } : {}),
});

const modulePath = '/js/flashcards/api.js';
const issues = [];
const desktop = { width: 1440, height: 1000 };
const phone = { width: 390, height: 844 };

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, isMobile: viewport === phone, hasTouch: viewport === phone });
  await networkBridge?.install(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', (error) => issues.push(error.message));
  if (process.env.PPP_FLASHCARD_QA_TRACE) {
    page.on("response", (res) => { const url = new URL(res.url()); if (url.pathname.includes("flashcard")) console.error(res.status(), url.pathname); });
    page.on("requestfailed", (req) => console.error(req.failure()?.errorText, new URL(req.url()).pathname));
  }
  return page;
}

async function signIn(page, account) {
  await page.goto(`${base}#/flashcards`);
  await page.waitForURL(/#\/login\?next=/);
  assert.equal(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('next'), '/flashcards');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  try { await page.getByRole('heading', { name: /^Flashcards(?: Beta)?$/ }).waitFor(); }
  catch (error) { throw new Error(`Sign-in did not reach Flashcards (${new URL(page.url()).hash}). ${(await page.locator('h1,.form-error').allTextContents()).join(' ')}`, { cause: error }); }
}

async function createDeck(page, title) {
  await page.getByRole('button', { name: 'Create deck', exact: true }).first().click();
  await page.getByLabel('Deck name').fill(title);
  await page.getByRole('dialog').getByRole('button', { name: 'Create deck' }).click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
}

const deckTile = (page, title) => page.locator('.flashcards__deck').filter({
  has: page.getByRole('heading', { name: title, exact: true }),
});
const appDecks = (page) => page.evaluate(async (path) => (await import(path)).listDecks(), modulePath);
const appCards = (page, deckId) => page.evaluate(async ({ path, id }) => (await import(path)).listCards(id), { path: modulePath, id: deckId });
const appCatalogue = (page) => page.evaluate(async (path) => (await import(path)).listCatalogue(), modulePath);

async function importFlow(page, title, source, setup) {
  if (await page.locator('[data-action="back-decks"]').count()) {
    await page.getByRole('button', { name: /My decks/ }).first().click();
  }
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.locator('[data-import-form] select[name="deck"]').selectOption({ label: title });
  await page.locator('[data-import-form] select[name="source"]').selectOption(source);
  await setup(page);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('heading', { name: 'Import preview' }).waitFor();
}

async function commit(page) {
  await page.getByRole('button', { name: 'Import cards', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-import-progress]')?.textContent.startsWith('Imported '), { timeout: 90_000 });
}

try {
  const page = await newPage(desktop);
  await signIn(page, primary);
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  assert.deepEqual(await navigation.getByRole('link').allTextContents(), ['Home', 'Past papers', 'Practice', 'Flashcards', 'Data Hub']);
  await page.locator('.flashcards__example summary').click();
  await page.locator('.flashcards__example').getByRole('button', { name: 'Show answer' }).click();
  await page.getByText('The mitochondrion', { exact: true }).waitFor();
  const title = `Flashcards QA ${Date.now()}`;
  await createDeck(page, title);
  await deckTile(page, title).getByRole('button', { name: 'Manage' }).click();
  await page.getByRole('button', { name: 'Add card' }).click();
  await page.getByLabel('Front', { exact: true }).fill('What stores a revision?');
  await page.getByLabel('Back or extra information').fill('Its review log.');
  await page.getByRole('dialog').locator('[name=tags]').fill('qa, reviews');
  await page.getByRole('button', { name: 'Save card' }).click();
  await page.locator('.flashcards__snippet').filter({ hasText: 'What stores a revision?' }).waitFor();

  await importFlow(page, title, 'quizlet', (p) => p.getByLabel('Exported text').fill('Quizlet QA term\tQuizlet QA definition'));
  await commit(page);
  await importFlow(page, title, 'quizlet', (p) => p.getByLabel('Exported text').fill('Quizlet QA term\tQuizlet QA definition'));
  assert.equal(await page.getByRole('button', { name: 'Import cards', exact: true }).isDisabled(), true);

  const csv = '"Front","Back","Tags"\n"CSV, QA question","First line\nSecond line with ""quotes""","audit"\n';
  await importFlow(page, title, 'csv', async (p) => {
    await p.locator('input[name="file"]').setInputFiles({ name: 'qa.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await p.getByLabel('First row contains headers').check();
    await p.getByLabel('Tags column (optional)').fill('3');
  });
  await page.locator('[data-import-preview]').getByText(/Second line with/).waitFor();
  await commit(page);
  const root = (await appDecks(page)).find((entry) => entry.title === title);
  assert.equal((await appCards(page, root.id)).length, 3);

  await importFlow(page, title, 'anki', (p) => p.locator('input[name="file"]').setInputFiles(ankiPath));
  await commit(page);
  const importedDecks = (await appDecks(page)).filter((entry) => entry.id !== root.id);
  let imported;
  let importedDeck;
  for (const deck of [root, ...importedDecks]) {
    const cards = await appCards(page, deck.id);
    imported = cards.find((card) => !card.suspended && card.type === 'basic' && !['What stores a revision?', 'Quizlet QA term', 'CSV, QA question'].includes(card.front));
    if (imported) { importedDeck = deck; break; }
  }
  assert.ok(imported, 'Anki fixture contains a new, unsuspended basic card');

  await page.getByRole('button', { name: /My decks/ }).first().click();
  await page.locator(`[data-action="open-deck"][data-id="${importedDeck.id}"]`).click();
  const row = page.locator('.flashcards__row').filter({ has: page.locator(`[data-id="${imported.id}"]`) });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Front', { exact: true }).fill('Edited in the desktop browser');
  await page.getByRole('button', { name: 'Save card' }).click();
  await page.getByText('Edited in the desktop browser', { exact: true }).waitFor();

  const mobile = await newPage(phone);
  await signIn(mobile, primary);
  await mobile.locator('.avatar').click();
  await mobile.getByRole('navigation', { name: 'More' }).getByRole('link', { name: 'Flashcards' }).waitFor();
  await mobile.keyboard.press('Escape');
  const saved = (await appCards(mobile, importedDeck.id)).find((card) => card.id === imported.id);
  assert.equal(saved.front, 'Edited in the desktop browser');

  // Rate the imported card through the authoritative service, then check its
  // exact schedule from the second independently authenticated browser session.
  const rate = (session, card, grade, requestId) => session.evaluate(async ({ path, card, grade, requestId }) => {
    try { return await (await import(path)).reviewCard(card, grade, requestId); }
    catch (error) { return { conflict: error.code, retryable: error.retryable }; }
  }, { path: modulePath, card: { id: card.id, revision: card.revision }, grade, requestId });
  const idempotencyKey = crypto.randomUUID();
  const [first, second] = await Promise.all([rate(page, imported, 3, idempotencyKey), rate(mobile, imported, 3, idempotencyKey)]);
  assert.equal(first.status, 'saved');
  assert.deepEqual(second, first);
  assert.equal((await rate(mobile, imported, 4, crypto.randomUUID())).conflict, 'conflict');
  await mobile.reload();
  await mobile.getByRole('heading', { name: 'Flashcards' }).waitFor();
  assert.deepEqual((await appCards(mobile, importedDeck.id)).find((item) => item.id === imported.id).state, first.state);

  // Simulate a lost acknowledgement before retrying with the same request ID.
  const before = await appCards(page, root.id);
  const candidate = before.find((card) => card.revision === 0 && !card.suspended);
  assert.ok(candidate);
  await page.getByRole('button', { name: /^My decks$/ }).click();
  await deckTile(page, title).getByRole('button', { name: 'Study' }).click();
  await page.getByRole('button', { name: /Show answer/ }).click();
  let failed = false;
  await page.route('**/functions/v1/flashcard-review', async (route) => {
    if (route.request().method() !== 'POST' || failed) return route.fallback();
    failed = true;
    if (networkBridge) await networkBridge.request(route.request());
    else await route.fetch();
    await route.abort();
  });
  await page.getByRole('button', { name: /^Again/ }).click();
  await page.getByText(/Your rating is waiting/).waitFor();
  await page.reload();
  await deckTile(page, title).getByRole('button', { name: 'Study' }).click();
  await page.getByRole('button', { name: /Retry Again/ }).click();
  await page.getByText(/Your rating is waiting/).waitFor({ state: 'hidden' });
  assert.equal((await appCards(page, root.id)).filter((card) => card.revision === 1).length, 1);

  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const schoolPage = await newPage(phone);
  await signIn(schoolPage, school);
  assert.equal((await appCatalogue(schoolPage)).schoolEligible, true);
  assert.equal((await appCards(schoolPage, root.id)).length, 0);
  assert.equal((await rate(schoolPage, imported, 3, crypto.randomUUID())).conflict, 'missing');
  const lookalikePage = await newPage(desktop);
  await signIn(lookalikePage, lookalike);
  const catalogue = await appCatalogue(lookalikePage);
  assert.equal(catalogue.schoolEligible, false);
  assert.ok(catalogue.entries.some((entry) => entry.status === 'coming_soon'));
  assert.equal(catalogue.entries.filter((entry) => entry.status === 'external').length, 3);

  for (const [route, heading] of [['#/papers', 'Past papers'], ['#/practice', 'Practice'], ['#/hub', 'Data Hub']]) {
    await page.goto(`${base}${route}`);
    await page.getByRole('heading', { name: heading, exact: true, level: 1 }).waitFor();
  }
  assert.deepEqual(issues, []);
  console.log('Desktop + mobile: signed-in route, demo, editor, Quizlet, CSV, Anki, duplicate protection, review retry, exact cross-session schedule, account isolation and site navigation verified.');
} finally {
  await browser.close();
  server?.kill();
}
