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
  const demo = await import('/js/data/demo.js');
  await demo.enterDemoAccount();
  await (await import('/js/data/api.js')).setEnrolled('EDX_ALEVEL_BIOL_9BN0', true);
  import { mount } from '/js/ui/views/flashcards.js';
  await mount(document.querySelector('main'), { setTitle: (title) => { document.title = title; } });
</script>`;

const fixtureApi = `
  const personal = { id: 'personal', title: 'Personal revision', card_count: 2, new_count: 2 };
  const another = { id: 'another', title: 'Another revision deck', card_count: 1, new_count: 1 };
  const official = { id: 'official', title: 'A-level Biology Atomic', catalogue_id: 'biology', card_count: 3238, suspended_count: 3238 };
  const makeCard = (id, front, deckId, options = {}) => ({
    id, note_id: id, deck_id: deckId, front, back: 'Answer to ' + front, tags: [],
    variant: 'forward', type: 'basic', suspended: false, revision: 0, ...options
  });
  const firstStudy = makeCard('first-study', 'First study question', personal.id);
  const secondStudy = makeCard('second-study', 'Second study question', personal.id);
  const otherStudy = makeCard('other-study', 'Question in another deck', another.id);
  const libraryCards = [
    makeCard('bio-first', 'Membrane transport', official.id, { suspended: true, subdeck_path: 'Cells', tags: ['spec::1.1'] }),
    ...Array.from({ length: official.card_count - 2 }, (_, index) => makeCard('bio-' + index, 'Cells question ' + index, official.id, { suspended: true, subdeck_path: 'Cells', tags: ['spec::1.1'] })),
    makeCard('bio-second', 'Genetics retrieval', official.id, { suspended: true, subdeck_path: 'Genetics', tags: ['spec::1.10'] })
  ];
  let added = false;
  const rated = new Set();
  const savedRequests = new Set();

  const { call } = window.flashcardFixture;
  export const hasCloudAccount = () => true;
  export const listDecks = async () => { await call('decks'); return [personal, another, ...(added ? [official] : [])]; };
  export async function listCatalogue() {
    await call('catalogue');
    return { schoolEligible: true, entries: [{
      id: 'biology', title: official.title, card_count: official.card_count,
      available: true, subject: 'Biology', subject_id: 'EDX_ALEVEL_BIOL_9BN0', qualification: 'A-level 9BN0', board: 'Edexcel', deck_type: 'Atomic'
    }] };
  }
  export async function addCatalogueDeck() {
    await call('add');
    added = true;
    return { status: 'added', deck_id: official.id };
  }
  export async function listCardPage(id, { query = '', specPoint = '', page = 1, pageSize = 30 } = {}) {
    await call('manager');
    const rows = id === official.id ? libraryCards : [firstStudy, secondStudy];
    const cards = rows.filter((card) => (!specPoint || card.tags.includes(specPoint))
      && (card.front + card.back).toLowerCase().includes(query.toLowerCase()));
    const offset = (page - 1) * pageSize;
    const active = cards.filter((card) => !card.suspended).length;
    return { cards: cards.slice(offset, offset + pageSize), total: cards.length, active, unsuspendable: cards.length - active, protected: 0 };
  }
  export const listDeckSpecPoints = async (id) => id === official.id
    ? ['spec::1.1', 'spec::1.10']
    : [];
  export const listDeckSpecSets = async (id) => id === official.id
    ? [{ tags: ['spec::1.1'], cards: 3237, active: 0, optional: false }, { tags: ['spec::1.10'], cards: 1, active: 0, optional: false }]
    : [];
  export const applySpecSelection = async () => ({ total: 3238, active: 0, changed: 0 });
  export const removeCatalogueDeck = async () => ({ status: 'removed' });
  export const listDeckTopics = async () => [{ path: 'Cells', total: 3237, suspended: 3237 }, { path: 'Genetics', total: 1, suspended: 1 }];
  export const getCard = async (id, cardId) => (id === official.id ? libraryCards : [firstStudy, secondStudy]).find((card) => card.id === cardId);
  export async function getStudyQueue(id) {
    await call('queue');
    const cards = id === official.id ? [] : id === another.id ? [otherStudy] : [firstStudy, secondStudy];
    return { cards: cards.filter((card) => !rated.has(card.id)), nextDue: null };
  }
  export async function reviewCard(card, grade, requestId) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(requestId)) {
      throw new Error('Review request ID must be a UUID v4');
    }
    window.flashcardFixture.reviewRequests.push({ cardId: card.id, grade, requestId });
    await call('review');
    if (!savedRequests.has(requestId)) {
      savedRequests.add(requestId);
      rated.add(card.id);
      await call('commit');
    }
    if (window.flashcardFixture.loseNextAcknowledgement) {
      window.flashcardFixture.loseNextAcknowledgement = false;
      throw Object.assign(new Error('Lost acknowledgement'), { retryable: true });
    }
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
    reviewRequests: [],
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
  if (!desktop) {
    await page.addInitScript(() => Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined }));
  }
  await page.route(fixture, (route) => route.fulfill({ contentType: 'text/html', body: fixturePage }));
  await page.route('**/js/flashcards/api.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: fixtureApi }));
  await page.goto(fixture, { waitUntil: 'domcontentloaded' });

  const gate = (method, name) => page.evaluate(([action, key]) => window.flashcardFixture[action](key), [method, name]);
  const waitForCall = (name) => page.waitForFunction((key) => window.flashcardFixture.calls.has(key), name);
  const heading = (name) => page.getByRole('heading', { name, exact: true });
  await waitForCall('decks');
  await page.getByRole('heading', { name: /^Flashcards(?: Beta)?$/ }).waitFor();
  await page.getByText('Loading your sets…', { exact: true }).waitFor();
  assert.equal(await heading('Start your first deck').count(), 0, 'loading must not display an empty collection');
  await gate('release', 'decks');
  await heading('Personal revision').waitFor();

  const guide = page.getByRole('button', { name: 'How to use Flashcards' });
  assert.ok(await guide.evaluate((button) => Boolean(
    document.querySelector('.fc-panel')
      .compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING
  )), 'the guide follows the sets');
  if (desktop) await guide.press('Enter');
  else await guide.tap();
  const guideDialog = page.getByRole('dialog', { name: 'How to use Flashcards' });
  await guideDialog.waitFor();
  for (const instruction of ['Choose a set.', 'Choose which cards.', 'Review.']) {
    await guideDialog.getByText(instruction, { exact: true }).waitFor();
  }
  await page.keyboard.press('Escape');
  await guideDialog.waitFor({ state: 'hidden' });
  assert.equal(await guide.evaluate((button) => button === document.activeElement), true,
    'dismissing the guide returns focus to its trigger');

  // The PurePastPapers sets load with the home page, so the screen opens straight away.
  await page.locator('[data-action="catalogue"]').click();
  const catalogue = page.locator('.fc-ppp').filter({ has: heading('Atomic') });
  await catalogue.waitFor();
  assert.equal(await guide.count(), 0, 'the guide belongs to the Flashcards home');

  await gate('hold', 'add');
  await catalogue.getByRole('button', { name: '+ Add to my sets' }).click();
  await waitForCall('add');
  assert.equal(await catalogue.getByRole('button', { name: /Add/ }).isDisabled(), true, 'an in-flight add is visibly disabled');
  await gate('release', 'add');
  await catalogue.getByRole('button', { name: /Open/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: '+ Add to my sets', exact: true }).count(), 0, 'an owned deck cannot be added twice');

  await catalogue.getByRole('button', { name: /Open/ }).click();
  await page.locator('.fc-sethead__title').waitFor();
  await page.locator('[data-choice-mode][value="learnt"]:checked').waitFor();
  await gate('hold', 'manager');
  await page.getByRole('button', { name: /Browse all/ }).click();
  await waitForCall('manager');
  await heading('A-level Biology Atomic').waitFor();
  await page.getByText('Loading cards…', { exact: true }).waitFor();
  await gate('release', 'manager');
  const search = page.locator('[data-search]');
  await search.waitFor();
  await page.getByText('Page 1 of 135', { exact: true }).waitFor();
  assert.equal(await page.locator('.flashcards__row').count(), 24, 'initial manager render is limited to one card page');
  const spec = page.locator('[data-spec-point]');
  await spec.selectOption('spec::1.1');
  await page.getByText('3237 matching cards · 0 in play', { exact: true }).waitFor();
  assert.equal(await page.locator('.flashcards__row').count(), 24, 'filtered counts cover every page');
  await spec.selectOption('spec::1.10');
  await page.getByText('Genetics retrieval', { exact: true }).waitFor();
  assert.equal(await page.locator('.flashcards__row').count(), 1, 'near-prefix specification points stay distinct');
  await spec.selectOption('');
  await page.getByText('Membrane transport', { exact: true }).waitFor();
  await search.evaluate((input) => { window.originalCardSearch = input; });
  await search.fill('Genetics');
  await page.getByText('Genetics retrieval', { exact: true }).waitFor();
  await page.getByText('Membrane transport', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await search.evaluate((input) => input === window.originalCardSearch && input === document.activeElement), true,
    'results must update without replacing the focused search control');

  await page.getByRole('button', { name: /^(Study|Start studying)$/ }).click();
  await page.getByRole('button', { name: /Choose cards/ }).waitFor();
  assert.equal(await heading('All caught up').count(), 0, 'a fully suspended deck should guide the student to topics');

  await page.getByRole('button', { name: /Back to the set/ }).click();
  await page.locator('[data-action="back-decks"]').first().click();
  const personal = page.locator('.fc-own').filter({ has: heading('Personal revision') });
  await personal.getByRole('button', { name: /^(Study|Start studying)$/ }).click();
  await page.getByText('First study question', { exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement.matches('[data-study-question]'));
  await page.locator('[data-study-question]').evaluate((question) => { window.firstQuestion = question; });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.activeElement.matches('[data-study-answer-face]'));
  assert.equal(await page.locator('[data-study-question]').evaluate((question) => question === window.firstQuestion), true,
    'revealing the answer should preserve the question element');
  for (const theme of ['dark', 'light']) {
    const { grades, answer } = await page.evaluate(async (theme) => {
      document.documentElement.dataset.theme = theme;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.allSettled(document.getAnimations().map((animation) => animation.finished));
      const rgb = (color) => color.match(/[\d.]+/g).map(Number);
      const luminance = (channels) => channels.slice(0, 3).reduce((sum, channel, index) => {
        const srgb = channel / 255;
        const linear = srgb <= .04045 ? srgb / 12.92 : ((srgb + .055) / 1.055) ** 2.4;
        return sum + linear * [.2126, .7152, .0722][index];
      }, 0);
      const inspect = (element) => {
        const style = getComputedStyle(element);
        const fill = rgb(style.backgroundColor);
        const pair = [luminance(rgb(style.color)), luminance(fill)].sort((a, b) => b - a);
        return { fill, contrast: (pair[0] + .05) / (pair[1] + .05) };
      };
      return {
        grades: [...document.querySelectorAll('[data-action="grade"]')].map((button) => ({
          label: button.dataset.gradeLabel, ...inspect(button),
        })),
        answer: inspect(document.querySelector('[data-study-answer-face]')),
      };
    }, theme);
    assert.deepEqual(grades.map(({ label }) => label), ['Again', 'Hard', 'Good', 'Easy']);
    assert.ok(grades.every(({ contrast }) => contrast >= 4.5), `${theme} grade labels meet normal-text contrast: ${JSON.stringify(grades)}`);
    assert.equal(new Set(grades.map(({ fill }) => fill.join(','))).size, 4, 'each grade has its own fill');
    const [red, amber, green, blue] = grades.map(({ fill }) => fill);
    assert.ok(red[0] > red[1] && amber[0] > amber[1] && amber[1] > amber[2]
      && green[1] > green[0] && blue[2] > blue[0], `${theme} applies red, amber, green and blue in order`);
    assert.ok(answer.fill[2] > answer.fill[0] && answer.contrast >= 4.5, `${theme} answer has a readable blue inset`);
  }

  await page.evaluate(() => {
    new MutationObserver(() => {
      if (document.querySelector('main').textContent.includes('All caught up')) {
        window.flashcardFixture.unexpectedStates.push('All caught up');
      }
    }).observe(document.querySelector('main'), { childList: true, subtree: true });
  });
  await gate('hold', 'review');
  await page.keyboard.press('3');
  await waitForCall('review');
  await page.getByText('Saving the previous rating…', { exact: true }).waitFor();
  // The buffered card must be usable before the review or queue resolves.
  const queueCalls = await page.evaluate(() => window.flashcardFixture.calls.get('queue'));
  await gate('hold', 'queue');
  await page.getByText('Second study question', { exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement.matches('[data-study-question]'));
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.activeElement.matches('[data-study-answer-face]'));
  await page.keyboard.press('3');
  const good = page.getByRole('button', { name: /^Good/ });
  assert.equal(await good.isDisabled(), true, 'the next card cannot be rated while a save is pending');
  assert.equal(await page.evaluate(() => window.flashcardFixture.calls.get('review')), 1,
    'the blocked shortcut must not send a second review request');
  await gate('release', 'review');
  await page.waitForFunction(() => !document.querySelector('[data-grade="3"]').disabled);
  assert.equal(await page.evaluate(() => document.activeElement.matches('[data-study-answer-face]')), true,
    'acknowledgement must preserve the focus of a revealed answer');
  assert.equal(await page.evaluate(() => window.flashcardFixture.calls.get('queue')), queueCalls,
    'a saved rating should advance directly to the next queued card');
  assert.deepEqual(await page.evaluate(() => window.flashcardFixture.unexpectedStates), [],
    'a rating must not flash a completed state between two study cards');
  await page.keyboard.press('3');
  await page.getByText('Loading the next card…', { exact: true }).waitFor();
  assert.equal(await heading('All caught up').count(), 0, 'an exhausted local batch still needs server confirmation');
  await gate('release', 'queue');
  await heading('All caught up').waitFor();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForCall('decks');
  await gate('release', 'decks');
  await personal.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByText('First study question', { exact: true }).waitFor();
  await page.keyboard.press('Space');
  await page.evaluate(() => { window.flashcardFixture.loseNextAcknowledgement = true; });
  await gate('hold', 'review');
  await page.keyboard.press('3');
  await page.getByText('Second study question', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Back to deck/ }).click();
  await page.locator('[data-action="back-decks"]').first().click();
  const another = page.locator('.fc-own').filter({ has: heading('Another revision deck') });
  await another.getByRole('button', { name: 'Study', exact: true }).click();
  const otherQuestion = page.getByText('Question in another deck', { exact: true });
  await otherQuestion.waitFor();
  assert.equal(await page.evaluate(() => window.flashcardFixture.calls.get('commit') || 0), 0,
    'another deck must be usable while the previous deck rating is still in flight');
  await gate('release', 'review');
  await waitForCall('commit');
  assert.equal(await otherQuestion.isVisible(), true, 'a lost acknowledgement must leave the active deck visible');
  assert.equal(await page.getByRole('button', { name: /Retry Good/ }).count(), 0,
    'a failed save in another deck must leave its recovery UI in that deck');
  await page.getByRole('button', { name: /Back to deck/ }).click();
  await page.locator('[data-action="back-decks"]').first().click();
  await personal.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByText('Answer to First study question', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^Retry Good/ }).click();
  await page.getByText('Second study question', { exact: true }).waitFor();
  const recovered = await page.evaluate(() => ({
    requests: window.flashcardFixture.reviewRequests, commits: window.flashcardFixture.calls.get('commit'),
  }));
  assert.equal(recovered.requests.length, 2);
  assert.deepEqual(recovered.requests[1], recovered.requests[0], 'retry must reuse the first card, grade and request ID');
  assert.equal(recovered.commits, 1, 'recovery may acknowledge the rating only once');

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
    'the study screen must fit the viewport');
  assert.deepEqual(errors, [], 'the view must not throw browser errors');
  console.log('Flashcards loading, catalogue add/open, focused search, suspended-deck guidance and study transitions passed.');
} finally {
  await browser?.close();
  server.kill();
}
