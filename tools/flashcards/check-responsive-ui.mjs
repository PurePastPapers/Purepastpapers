// Browser-level check for latency and interaction regressions. Delayed requests
// use a fixture API so the assertions do not depend on network speed or Supabase.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const port = Number(process.env.PPP_FLASHCARD_UI_QA_PORT || 5179);
const origin = `http://localhost:${port}`;
const fixture = `${origin}/flashcard-ui-fixture`;

const fixturePage = `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/components.css">
<link rel="stylesheet" href="/css/flashcards.css">
<main id="fixture"></main>
<script type="module">
  import { mount } from '/js/ui/views/flashcards.js';
  await mount(document.querySelector('main'), { setTitle: (title) => { document.title = title; } });
</script>`;

const fixtureApi = `
  const personal = { id: 'personal', title: 'Personal revision', card_count: 2, new_count: 2 };
  const official = { id: 'official', title: 'A-level Biology Atomic', catalogue_id: 'biology', card_count: 3238, suspended_count: 3238 };
  const makeCard = (id, front, deckId, options = {}) => ({
    id, note_id: id, deck_id: deckId, front, back: 'Answer to ' + front, tags: [],
    variant: 'forward', type: 'basic', suspended: false, revision: 0, ...options
  });
  const firstStudy = makeCard('first-study', 'First study question', personal.id);
  const secondStudy = makeCard('second-study', 'Second study question', personal.id);
  const libraryCards = [
    makeCard('bio-first', 'Membrane transport', official.id, { suspended: true, subdeck_path: 'Cells' }),
    ...Array.from({ length: official.card_count - 2 }, (_, index) => makeCard('bio-' + index, 'Cells question ' + index, official.id, { suspended: true, subdeck_path: 'Cells' })),
    makeCard('bio-second', 'Genetics retrieval', official.id, { suspended: true, subdeck_path: 'Genetics' })
  ];
  let added = false;
  let rated = 0;

  const { call } = window.flashcardFixture;
  export const hasCloudAccount = () => true;
  export const listDecks = async () => { await call('decks'); return [personal, ...(added ? [official] : [])]; };
  export async function listCatalogue() {
    await call('catalogue');
    return { schoolEligible: true, entries: [{
      id: 'biology', title: official.title, card_count: official.card_count,
      available: true, subject: 'Biology', qualification: 'A-level 9BN0', board: 'Edexcel', deck_type: 'Atomic'
    }] };
  }
  export async function addCatalogueDeck() {
    await call('add');
    added = true;
    return { status: 'added', deck_id: official.id };
  }
  export async function listCardPage(id, { query = '', page = 1, pageSize = 30 } = {}) {
    await call('manager');
    const rows = id === official.id ? libraryCards : [firstStudy, secondStudy];
    const cards = rows.filter((card) => (card.front + card.back).toLowerCase().includes(query.toLowerCase()));
    const offset = (page - 1) * pageSize;
    return { cards: cards.slice(offset, offset + pageSize), total: cards.length };
  }
  export const listDeckTopics = async () => [{ path: 'Cells', total: 3237, suspended: 3237 }, { path: 'Genetics', total: 1, suspended: 1 }];
  export const getCard = async (id, cardId) => (id === official.id ? libraryCards : [firstStudy, secondStudy]).find((card) => card.id === cardId);
  export async function getStudyQueue(id) {
    await call('queue');
    return { cards: id === official.id ? [] : [firstStudy, secondStudy].slice(rated), nextDue: null };
  }
  export async function reviewCard() {
    await call('review');
    rated++;
    return { status: 'saved' };
  }
`;

function installGates() {
  const gates = new Map();
  const calls = new Map();
  const unexpectedStates = [];
  window.flashcardFixture = {
    calls,
    unexpectedStates,
    hold: (name) => {
      let release;
      const promise = new Promise((resolve) => { release = resolve; });
      gates.set(name, { promise, release });
    },
    release: (name) => {
      gates.get(name)?.release();
      gates.delete(name);
    },
    call: async (name) => {
      calls.set(name, (calls.get(name) ?? 0) + 1);
      await gates.get(name)?.promise;
    },
  };
  window.flashcardFixture.hold('decks');
}

const server = spawn(process.execPath, ['tools/serve.mjs', String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
let browser;
try {
  await once(server.stdout, 'data');
  browser = await chromium.launch({ executablePath: process.env.PPP_CHROMIUM_EXECUTABLE });
  const desktop = process.env.PPP_FLASHCARD_UI_QA_DESKTOP === '1';
  const page = await browser.newPage(desktop
    ? { viewport: { width: 1440, height: 900 } }
    : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page.setDefaultTimeout(4_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(installGates);
  await page.route(fixture, (route) => route.fulfill({ contentType: 'text/html', body: fixturePage }));
  await page.route('**/js/flashcards/api.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: fixtureApi }));
  await page.goto(fixture, { waitUntil: 'domcontentloaded' });

  const gate = (method, name) => page.evaluate(([action, key]) => window.flashcardFixture[action](key), [method, name]);
  const waitForCall = (name) => page.waitForFunction((key) => window.flashcardFixture.calls.has(key), name);
  const heading = (name) => page.getByRole('heading', { name, exact: true });
  await waitForCall('decks');
  await page.getByRole('heading', { name: /^Flashcards(?: Beta)?$/ }).waitFor();
  await page.getByText('Loading your decks…', { exact: true }).waitFor();
  assert.equal(await heading('Start your first deck').count(), 0, 'loading must not display an empty collection');
  await gate('release', 'decks');
  await heading('Personal revision').waitFor();

  await gate('hold', 'catalogue');
  await page.locator('[data-action="catalogue"]').click();
  await waitForCall('catalogue');
  await page.getByText('Loading the deck catalogue…', { exact: true }).waitFor();
  await gate('release', 'catalogue');
  const catalogue = page.locator('.flashcards__catalogue-card').filter({ has: heading('A-level Biology Atomic') });
  await catalogue.waitFor();

  await gate('hold', 'add');
  await catalogue.getByRole('button', { name: 'Add deck' }).click();
  await waitForCall('add');
  assert.equal(await catalogue.getByRole('button', { name: /Add/ }).isDisabled(), true, 'an in-flight add is visibly disabled');
  await gate('release', 'add');
  await catalogue.getByRole('button', { name: /Open/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Add deck', exact: true }).count(), 0, 'an owned deck cannot be added twice');

  await gate('hold', 'manager');
  await catalogue.getByRole('button', { name: /Open/ }).click();
  await waitForCall('manager');
  await heading('A-level Biology Atomic').waitFor();
  await page.getByText('Loading cards…', { exact: true }).waitFor();
  await gate('release', 'manager');
  const search = page.locator('[data-search]');
  await search.waitFor();
  await page.getByText('Page 1 of 135', { exact: true }).waitFor();
  assert.equal(await page.locator('.flashcards__row').count(), 24, 'initial manager render is limited to one card page');
  await search.evaluate((input) => { window.originalCardSearch = input; });
  await search.fill('Genetics');
  await page.getByText('Genetics retrieval', { exact: true }).waitFor();
  await page.getByText('Membrane transport', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await search.evaluate((input) => input === window.originalCardSearch && input === document.activeElement), true,
    'results must update without replacing the focused search control');

  await page.getByRole('button', { name: /^(Study|Start studying)$/ }).click();
  await page.getByRole('button', { name: /Choose topics/ }).waitFor();
  assert.equal(await heading('All caught up').count(), 0, 'a fully suspended deck should guide the student to topics');

  await page.getByRole('button', { name: /Back to deck/ }).click();
  await page.locator('[data-action="back-decks"]').first().click();
  const personal = page.locator('.flashcards__deck').filter({ has: heading('Personal revision') });
  await personal.getByRole('button', { name: /^(Study|Start studying)$/ }).click();
  await page.getByText('First study question', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Show answer/ }).click();

  await page.evaluate(() => {
    new MutationObserver(() => {
      if (document.querySelector('main').textContent.includes('All caught up')) {
        window.flashcardFixture.unexpectedStates.push('All caught up');
      }
    }).observe(document.querySelector('main'), { childList: true, subtree: true });
  });
  await gate('hold', 'review');
  await page.getByRole('button', { name: /^Good/ }).click();
  await waitForCall('review');
  await page.getByText('Saving rating…', { exact: true }).waitFor();
  // A slow queue endpoint must not delay an already returned card.
  const queueCalls = await page.evaluate(() => window.flashcardFixture.calls.get('queue'));
  await gate('hold', 'queue');
  await gate('release', 'review');
  await page.getByText('Second study question', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.flashcardFixture.calls.get('queue')), queueCalls,
    'a saved rating should advance directly to the next queued card');
  assert.deepEqual(await page.evaluate(() => window.flashcardFixture.unexpectedStates), [],
    'a rating must not flash a completed state between two study cards');
  await page.getByRole('button', { name: /Show answer/ }).click();
  await page.getByRole('button', { name: /^Good/ }).click();
  await page.getByText('Loading the next card…', { exact: true }).waitFor();
  assert.equal(await heading('All caught up').count(), 0, 'an exhausted local batch still needs server confirmation');
  await gate('release', 'queue');
  await heading('All caught up').waitFor();

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
    'the study screen must fit the viewport');
  assert.deepEqual(errors, [], 'the view must not throw browser errors');
  console.log('Flashcards loading, catalogue add/open, focused search, suspended-deck guidance and study transitions passed.');
} finally {
  await browser?.close();
  server.kill();
}
