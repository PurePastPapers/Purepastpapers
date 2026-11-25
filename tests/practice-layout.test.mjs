// Browser checks for the Practice layout: compact filter bar, question/answer side by side
// on Find questions, and the pinned actions on a single question. Needs Playwright with a
// Chromium browser; the test is skipped where that is not installed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* skipped below */ }
const skip = chromium ? false : 'Playwright is not installed';
const PORT = 5600 + Math.floor(Math.random() * 300);
const BASE = `http://localhost:${PORT}/`;
const SUBJECT = 'EDX_ALEVEL_PHYS_9PH0';
let server;
let browser;

before(async () => {
  if (skip) return;
  server = spawn(process.execPath, [fileURLToPath(new URL('../tools/serve.mjs', import.meta.url)), String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.kill();
});

async function demoPage(viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#app, main, body')?.textContent.length > 0);
  await page.evaluate(async () => { const m = await import('/js/data/demo.js'); await m.enterDemoAccount(); });
  await page.goto(`${BASE}#/practice?subject=${SUBJECT}&mode=individual`);
  await page.waitForSelector('.fbar .fpop');
  return { page, errors };
}

test('signed-in Psychology handwriting opens on a slow connection', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true });
  try {
    await page.addInitScript(() => localStorage.setItem('ppp:welcome-seen', '1'));
    await page.route('https://esm.sh/**', route => route.fulfill({
      contentType: 'application/javascript',
      body: `
        const user = { id: 'ink-test', email: 'ink-test@example.com', user_metadata: {} };
        export function createClient() {
          return {
            auth: {
              async getSession() { return { data: { session: { user } } }; },
              async getUser() { return { data: { user } }; },
              onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
            },
            from() {
              const query = {
                select() { return query; },
                eq() { return query; },
                order() { return query; },
                limit() { return query; },
                abortSignal() { return query; },
                async maybeSingle() { return { data: { progress: { enrolled_subjects: ['AQA_ALEVEL_PSYCH_7182'] } } }; },
                then() { /* Hold handwriting and draft requests open. */ },
              };
              return query;
            },
          };
        }`,
    }));
    await page.goto(`${BASE}#/practice?subject=AQA_ALEVEL_PSYCH_7182&mode=individual`);
    // Authentication bootstraps asynchronously; navigation alone does not mean
    // the mocked signed-in session has been loaded yet.
    await page.waitForFunction(async () => (await import('/js/data/api.js')).isSignedIn());
    assert.equal(await page.evaluate(async () => (await import('/js/data/api.js')).isSignedIn()), true);
    const answer = page.locator('.ink-answer').first();
    await answer.getByRole('button', { name: 'Write with Pencil' }).click();
    await answer.locator('canvas').waitFor({ timeout: 6000 });
    await answer.getByRole('button', { name: 'Use keyboard' }).click();
    assert.equal(await answer.getByRole('button', { name: 'Write with Pencil' }).isVisible(), true);
  } finally { await page.close(); }
});

test('tablet Practice switches an answer to ink on the first Pencil stroke and keeps the question in place', { skip }, async () => {
  const viewport = { width: 1194, height: 834 };
  const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true });
  try {
    await page.addInitScript(() => localStorage.setItem('ppp:welcome-seen', '1'));
    await page.goto(`${BASE}#/practice?subject=${SUBJECT}&mode=individual`);
    const input = page.locator('textarea[data-answer]').first();
    await input.fill('Typed working');
    const side = input.locator('xpath=ancestor::div[contains(@class,"qsplit__side")]');
    const keyboard = side.getByRole('button', { name: 'Use keyboard' });
    await input.evaluate(field => {
      field.scrollIntoView({ block: 'center' });
      const rect = field.getBoundingClientRect();
      window.testQuestionLayout = field.closest('.qsplit');
      const pencil = (type, y) => new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 7, button: 0,
        clientX: rect.left + 65, clientY: rect.top + y,
      });
      field.dispatchEvent(pencil('pointerdown', 35));
      document.dispatchEvent(pencil('pointermove', 90));
      document.dispatchEvent(pencil('pointerup', 90));
    });
    const canvas = side.locator('canvas').first();
    await keyboard.waitFor();
    await canvas.waitFor();
    assert.equal(await input.isVisible(), false);
    assert.equal(await canvas.evaluate(node => getComputedStyle(node.closest('.ink-editor__canvas')).touchAction), 'none');
    assert.ok(await canvas.evaluate(node => getComputedStyle(node.closest('.qsplit')).gridTemplateColumns.split(' ').length === 1));
    await page.waitForFunction(() => {
      const canvas = window.testQuestionLayout.querySelector('canvas');
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let inkRows = 0;
      for (let y = 0; y < canvas.height; y++) {
        const firstAlpha = y * canvas.width * 4 + 3;
        for (let x = 0; x < canvas.width; x++) {
          if (data[firstAlpha + x * 4]) { inkRows++; break; }
        }
      }
      return inkRows > 35;
    });
    const before = await canvas.boundingBox();
    await page.setViewportSize({ ...viewport, height: 750 });
    const after = await canvas.boundingBox();
    assert.equal(after.width, before.width);
    assert.equal(after.height, before.height);
    await keyboard.click();
    assert.equal(await input.inputValue(), 'Typed working');
    assert.equal(await input.isVisible(), true);
  } finally { await page.close(); }
});

test('Practice opens on Build a test where the subject offers it; ?mode= still wins', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(BASE);
  await page.evaluate(async () => { const m = await import('/js/data/demo.js'); await m.enterDemoAccount(); });
  const selected = async (url) => {
    await page.goto(`${BASE}${url}`);
    await page.reload();
    await page.waitForSelector('[data-mode][aria-selected="true"]');
    return (await page.locator('[data-mode][aria-selected="true"]').textContent()).trim();
  };
  assert.equal(await selected(`#/practice?subject=${SUBJECT}`), 'Build a test');
  assert.equal(await selected(`#/practice?subject=${SUBJECT}&mode=individual`), 'Individual questions');
  assert.equal(await selected(`#/practice?subject=${SUBJECT}`), 'Build a test', 'the choice is not remembered over the default');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Practice carries the current mode to any subject that supports it', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  try {
    const maths = 'EDX_ALEVEL_MATH_9MA0';
    const biology = 'EDX_ALEVEL_BIOL_9BN0';
    const history = 'EDX_ALEVEL_HIST_9HI0';
    const paperOnly = 'AQA_GCSE_PSYCH_8182';
    await page.goto(BASE);
    await page.evaluate(async enrolled_subjects => {
      const api = await import('/js/data/api.js');
      await api.signUp({
        displayName: 'Practice mode test', email: 'practice-mode@onspec.local', password: 'onspec-practice-mode',
        isDemo: true, initialProgress: { enrolled_subjects },
      });
    }, [maths, biology, SUBJECT, history, paperOnly]);

    const activeSubject = (subject) => page.locator(`.subject-pills a[href*="subject=${subject}"][aria-current="true"]`);
    const selectedMode = (mode) => page.locator(`[data-mode="${mode}"][aria-selected="true"]`);
    const switchSubject = async (subject, mode) => {
      await page.locator(`.subject-pills a[href*="subject=${subject}"]`).click();
      await activeSubject(subject).waitFor();
      if (mode) await selectedMode(mode).waitFor();
    };
    const mixed = page.locator('[data-difficulty="mixed"][aria-checked="true"]');

    await page.goto(`${BASE}#/practice?subject=${maths}&mode=individual`);
    await activeSubject(maths).waitFor();
    await selectedMode('individual').waitFor();
    await switchSubject(biology, 'individual');
    await page.goBack();
    await activeSubject(maths).waitFor();
    await selectedMode('individual').waitFor();

    await page.getByRole('tab', { name: 'Build a test' }).click();
    await selectedMode('timed_test').waitFor();
    await switchSubject(SUBJECT, 'timed_test');
    assert.equal(await mixed.evaluate(button => getComputedStyle(button).backgroundColor), 'rgb(201, 222, 245)');
    await switchSubject(biology, 'timed_test');
    assert.equal(await mixed.evaluate(button => getComputedStyle(button).color), 'rgb(25, 51, 77)');

    await page.getByRole('tab', { name: 'Individual questions' }).click();
    await selectedMode('individual').waitFor();
    await switchSubject(SUBJECT, 'individual');
    await switchSubject(history, 'picker');
    await page.locator('#practice-mode-panel .fbar').waitFor();
    await page.getByRole('tab', { name: 'Build a test' }).click();
    await selectedMode('timed_test').waitFor();
    await switchSubject(biology, 'timed_test');
    await switchSubject(history, 'timed_test');
    await switchSubject(paperOnly);
    assert.equal(await page.getByRole('tablist', { name: 'Practice mode' }).count(), 0);
    await page.getByRole('heading', { name: 'No practice questions available yet' }).waitFor();
  } finally {
    await page.close();
  }
});

test('Find questions: the filter is one compact bar of dropdowns', { skip }, async () => {
  const { page, errors } = await demoPage({ width: 1366, height: 900 });
  const bar = await page.locator('.fbar').boundingBox();
  assert.ok(bar.height < 160, `filter bar is ${bar.height}px tall`);
  assert.deepEqual(await page.locator('.fpop__label').allTextContents(), ['Topics', 'Difficulty', 'Marks', 'Progress', 'More']);
  assert.equal(await page.locator('.fpop[open]').count(), 0);

  // Covered topics are on by default for a student who has ticked topics; the topic
  // list appears once the switch is turned off.
  assert.ok(await page.locator('.fbar [data-covered]').isChecked(), 'covered topics are on by default');
  // With the switch on, the Topics dropdown lists only covered spec points, each one tickable.
  await page.locator('[data-section="fpop-topics"] > summary').click();
  const coveredRows = await page.locator('[data-section="fpop-topics"] [data-point]').count();
  assert.ok(coveredRows > 0, 'covered spec points are listed');
  await page.locator('[data-section="fpop-topics"] > summary').click();
  await page.locator('.fbar .covered-pill').click();
  await page.waitForSelector('.fbar .covered-pill:not(.is-on)');
  await page.locator('[data-section="fpop-topics"] > summary').click();
  assert.ok(await page.locator('[data-section="fpop-topics"] [data-tree]').isVisible());
  assert.ok(await page.locator('[data-section="fpop-topics"] [data-point]').count() > coveredRows, 'every spec point is listed once the switch is off');
  await page.locator('[data-section="fpop-difficulty"] > summary').click();
  assert.equal(await page.locator('.fpop[open]').count(), 1, 'only one dropdown open at a time');

  // A filter choice redraws the bar but keeps the dropdown open and shows the choice.
  await page.locator('[data-multi="difficulties"][data-value="easy"]').click();
  await page.waitForSelector('[data-section="fpop-difficulty"][open] .fpop__value.is-set');
  assert.equal((await page.locator('[data-section="fpop-difficulty"] .fpop__value').textContent()).trim(), 'Easy');

  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.fpop[open]').count(), 0, 'Escape closes the dropdown');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Resetting question filters keeps the open handwriting editor', { skip }, async () => {
  const { page, errors } = await demoPage({ width: 1366, height: 900 });
  try {
    const toggle = page.locator('[data-ink-toggle]').first();
    const part = await toggle.getAttribute('data-ink-part');
    const editor = page.locator(`[data-ink-target="${part}"]`);
    await toggle.click();
    await editor.waitFor({ state: 'visible' });
    await page.locator('[data-reset-filters]').click();
    await editor.waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test('Find questions: answer box beside or below the question, mark scheme replaces the question', { skip }, async () => {
  const { page, errors } = await demoPage({ width: 1366, height: 900 });
  await page.waitForSelector('.qsplit[data-qlayout]');
  const card = page.locator('.qcard').filter({ has: page.locator('.qsplit[data-qlayout]') }).first();
  const layout = await card.locator('.qsplit').getAttribute('data-qlayout');
  const main = await card.locator('.qsplit__main').boundingBox();
  const side = await card.locator('.qsplit__side').boundingBox();
  if (layout === 'below') assert.ok(main.y + main.height <= side.y, 'a short question sits above the answer box');
  else assert.ok(main.x + main.width <= side.x, 'a long question sits to the left of the answer box');
  assert.ok(await card.locator('.qsplit__side [data-answer]').isVisible());

  // The demo account has done some questions before: the popup asks which attempt this is.
  await card.locator('.qsplit__answer').click();
  const popup = page.locator('dialog.modal');
  if (await popup.isVisible().catch(() => false) || await popup.waitFor({ timeout: 800 }).then(() => true, () => false)) {
    await popup.getByRole('button', { name: 'Start a new attempt' }).click();
  }
  const fresh = page.locator('.qcard').filter({ has: page.locator('.qsplit[data-qlayout]') }).first();
  await fresh.locator('.qsplit__answer').fill('My answer');
  await fresh.locator('[data-scheme]').click();
  const opened = page.locator('.qcard').filter({ has: page.locator('.qsplit__main.is-scheme') }).first();
  await opened.waitFor();
  assert.ok(await opened.locator('.qsplit__main .ms').isVisible(), 'mark scheme is on the left');
  assert.equal(await opened.locator('.qsplit__main .qcontent').count() >= 1, true);
  assert.equal(await opened.locator('.qsplit__answer').inputValue(), 'My answer', 'answer is kept');
  assert.ok(await opened.locator('[data-markpick]').isVisible(), 'marks can be entered beside the scheme');

  await opened.locator('[data-scheme]').click();
  await page.waitForFunction(() => !document.querySelector('.qsplit__main.is-scheme'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('Single question: Flag and Mark scheme pinned, then Go back and Finish', { skip }, async () => {
  const { page, errors } = await demoPage({ width: 1366, height: 900 });
  await page.locator('[data-select]').first().check();
  await page.locator('[data-start-set]').click();
  await page.waitForSelector('.runner__nav--pinned');

  const nav = page.locator('.runner__nav--pinned');
  const box = await nav.boundingBox();
  assert.ok(box.y + box.height <= 900 && box.y + box.height > 820, `actions bar sits at the bottom (y=${box.y})`);
  assert.ok(await nav.getByRole('button', { name: /Flag question/ }).isVisible());
  assert.ok(await nav.getByRole('button', { name: /Mark scheme/ }).isVisible());
  assert.equal(await page.locator('.runner__grid [data-reveal]').count(), 0, 'no second mark scheme button in the page');

  await nav.getByRole('button', { name: /Mark scheme/ }).click();
  await page.waitForSelector('.qview--scheme');
  assert.doesNotMatch(await page.locator('.runner__grid > :first-child').textContent(), /Mark scheme/, 'the question stays in place');
  assert.ok(await page.locator('.runner__grid--compare .qview--scheme').isVisible(), 'the scheme sits beside the question');
  assert.ok(await page.locator('[data-markpick]').isVisible());
  assert.ok(await nav.getByRole('button', { name: /Go back/ }).isVisible());
  assert.ok(await nav.getByRole('button', { name: /^Finish$/ }).isVisible());

  await nav.getByRole('button', { name: /Go back/ }).click();
  await page.waitForSelector('.qview:not(.qview--scheme)');
  assert.ok(await nav.getByRole('button', { name: /Mark scheme/ }).isVisible());
  assert.deepEqual(errors, []);
  await page.close();
});

test('Phone width: nothing overflows the screen sideways', { skip }, async () => {
  const { page, errors } = await demoPage({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.fbar, .fbar *, .qsplit, .qsplit *')]
    .filter((node) => node.getBoundingClientRect().right > innerWidth + 1).map((node) => node.className));
  assert.deepEqual(overflow, []);
  await page.locator('[data-select]').first().check();
  await page.locator('[data-start-set]').click();
  const nav = page.locator('.runner__nav--pinned');
  await nav.waitFor();
  const box = await nav.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844);
  assert.deepEqual(errors, []);
  await page.close();
});

test('a long Foundation test preview fits a phone with a question expanded', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    await page.goto(`${BASE}#/practice?subject=EDX_GCSE_BIOL_1BI0&mode=timed_test&tier=Foundation`);
    await page.locator('[data-minutes="90"]').click();
    await page.locator('[data-test-preview] > summary').first().click();
    const image = page.locator('[data-test-preview-body] img').first();
    await image.waitFor();
    await page.waitForFunction(() => {
      const image = document.querySelector('[data-test-preview-body] img');
      return image?.complete && image.naturalWidth > 0;
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  } finally {
    await page.close();
  }
});

test('Enlarge: question, mark scheme and answer box open large over the page', { skip }, async () => {
  const { page, errors } = await demoPage({ width: 1366, height: 900 });
  const card = page.locator('.qcard').filter({ has: page.locator('.qsplit') }).first();
  const small = await card.locator('.qsplit__main img').first().boundingBox();

  await card.locator('.qsplit__main [data-zoom]').click();
  const dialog = page.locator('dialog.zoom[open]');
  await dialog.waitFor();
  assert.match(await dialog.locator('.zoom__title').textContent(), /^Question/);
  const big = await dialog.locator('img').first().boundingBox();
  assert.ok(big.width > small.width * 1.5, `enlarged image is ${big.width}px wide (was ${small.width}px)`);
  assert.equal(await dialog.locator('a').count(), 0, 'the enlarged image is not a link');
  await dialog.locator('[data-zoom-step="1"]').click();
  await dialog.locator('[data-zoom-step="1"]').click();
  const popups = [];
  page.context().on('page', (opened) => popups.push(opened.url()));
  const at = await dialog.locator('.zoom__body').boundingBox();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2 - 150, at.y + at.height / 2 - 40, { steps: 8 });
  await page.mouse.up();
  await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
  await page.waitForTimeout(300);
  assert.deepEqual(popups, [], 'dragging or clicking the enlarged question opens nothing');
  assert.ok(await dialog.locator('.zoom__body').evaluate((node) => node.scrollLeft > 0), 'dragging moved the view');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog.zoom').count(), 0, 'Escape closes it');

  // Clicking the question image itself also enlarges it.
  await card.locator('.qsplit__main img').first().click();
  await dialog.waitFor();
  await dialog.locator('[data-zoom-close]').click();
  assert.equal(await page.locator('dialog.zoom').count(), 0);

  // Typing in the enlarged answer box edits the real answer.
  await card.locator('.qsplit__answerfield [data-zoom]').click();
  await dialog.locator('.zoom__answer').fill('Typed large');
  await dialog.locator('[data-zoom-close]').click();
  assert.equal(await card.locator('.qsplit__answer').inputValue(), 'Typed large');

  await card.locator('[data-scheme]').click();
  const opened = page.locator('.qcard').filter({ has: page.locator('.qsplit__main.is-scheme') }).first();
  await opened.locator('.qsplit__main [data-zoom]').click();
  assert.match(await dialog.locator('.zoom__title').textContent(), /^Mark scheme/);
  assert.equal(await dialog.locator('.qsplit__label, button:not([data-zoom-close]):not([data-zoom-step]):not([data-zoom-reset])').count(), 0);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Enlarge on a phone: opens zoomed in, and the magnifying glasses zoom in and out', { skip }, async () => {
  const { page, errors } = await demoPage({ width: 390, height: 844 });
  await page.locator('[data-select]').first().check();
  await page.locator('[data-start-set]').click();
  await page.locator('.qview [data-zoom]').click();
  const dialog = page.locator('dialog.zoom[open]');
  await dialog.waitFor();
  const box = await dialog.boundingBox();
  assert.ok(box.width >= 389 && box.height >= 840, 'fills the phone screen');
  const body = dialog.locator('.zoom__body');
  const pct = dialog.locator('[data-zoom-reset]');
  assert.equal((await pct.textContent()).trim(), '200%');
  assert.ok(await body.evaluate((node) => node.scrollWidth > node.clientWidth), 'wider than the screen, scrolls sideways');
  assert.equal((await dialog.locator('.zoom__hint').textContent()).trim(), 'Drag to move around');

  await pct.click();
  assert.equal((await pct.textContent()).trim(), '100%');
  assert.ok(await body.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), '100% shows the whole width');
  assert.ok(!(await dialog.locator('.zoom__hint').isVisible()));
  await dialog.locator('[data-zoom-step="1"]').click();
  assert.equal((await pct.textContent()).trim(), '125%');
  for (let i = 0; i < 10; i++) await dialog.locator('[data-zoom-step="-1"]').click({ force: true });
  assert.equal((await pct.textContent()).trim(), '50%');
  assert.ok(await dialog.locator('[data-zoom-step="-1"]').isDisabled(), 'stops at the smallest zoom');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Marks: a coloured slider for questions over 1 mark', { skip }, async () => {
  const { page, errors } = await demoPage({ width: 1366, height: 900 });
  const small = page.locator('.qcard').filter({ has: page.locator('.marks-pill', { hasText: /^3 marks$/ }) }).first();
  await small.locator('[data-scheme]').click();
  const picker = page.locator('.qcard [data-markpick]').first();
  await picker.waitFor();
  assert.equal(await picker.locator('[data-pick]').count(), 0, 'no buttons above 1 mark');
  const range = picker.locator('[data-pick-range]');
  await range.fill('1');
  assert.equal(await picker.getAttribute('data-rag'), 'red');      // 1/3 = 33%
  await range.fill('2');
  assert.equal(await picker.getAttribute('data-rag'), 'amber');    // 2/3 = 67%
  await range.fill('3');
  assert.equal(await picker.getAttribute('data-rag'), 'green');    // 3/3 = 100%
  assert.equal(await picker.locator('input[type="hidden"]').inputValue(), '3');
  await page.locator('.qcard [data-scheme][aria-expanded="true"]').first().click();

  await page.locator('[data-section="fpop-marks"] > summary').click();
  await page.locator('[data-filter="markMin"]').fill('7');
  await page.locator('[data-filter="markMin"]').press('Tab');
  await page.keyboard.press('Escape');
  const big = page.locator('.qcard:not(.is-locked)').filter({ has: page.locator('.marks-pill', { hasText: /^(\d{2}|[7-9]) marks$/ }) }).first();
  await big.locator('[data-scheme]').click();
  const slider = page.locator('.qcard .markpick--slider').first();
  await slider.waitFor();
  const max = Number(await slider.getAttribute('data-max'));
  assert.ok(max >= 7);
  await slider.locator('[data-pick-range]').fill('5');
  assert.equal(await slider.locator('input[type="hidden"]').inputValue(), '5');
  await slider.locator('[data-nudge="1"]').click();
  assert.equal(await slider.locator('input[type="hidden"]').inputValue(), '6');
  assert.match(await slider.locator('[data-pick-value]').textContent(), new RegExp(`6 / ${max}`));
  assert.deepEqual(errors, []);
  await page.close();
});

test('Practice saves ink locally during a slow account write and reopens it on another device', { skip }, async () => {
  const subject = 'AQA_ALEVEL_PSYCH_7182';
  let progress = { enrolled_subjects: [subject] };
  let stamp = '2026-11-25T00:00:00.000Z';
  let ink;
  let finishProgress;
  const uploadGate = new Promise(resolve => { finishProgress = resolve; });
  const first = await browser.newPage({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const second = await browser.newPage();
  try {
    for (const page of [first, second]) {
      await page.addInitScript(() => localStorage.setItem('ppp:welcome-seen', '1'));
      await page.route('**/__practice_ink_qa', async route => {
        const { action, args } = route.request().postDataJSON();
        let data;
        if (action === 'loadProgress') data = { progress, updated_at: stamp };
        if (action === 'saveProgress') {
          await uploadGate;
          ({ progress, updated_at: stamp } = args);
          data = [{ user_id: 'ink-sync-test' }];
        }
        if (action === 'saveInk') {
          ink = args.p_record;
          data = { status: 'saved', revision: ink.revision };
        }
        if (action === 'loadInk') data = ink && (!args.response_id || args.response_id === ink.responseId)
          ? [{ record: ink, revision: ink.revision, updated_at: stamp }] : [];
        await route.fulfill({ json: { data } });
      });
      await page.route('https://esm.sh/**', route => route.fulfill({
        contentType: 'application/javascript',
        body: `
          const user = { id: 'ink-sync-test', email: 'ink-sync@example.com', user_metadata: {} };
          const call = (action, args) => fetch('/__practice_ink_qa', {
            method: 'POST', body: JSON.stringify({ action, args }),
          }).then(response => response.json());
          export function createClient() {
            return {
              auth: {
                async getSession() { return { data: { session: { user } } }; },
                async getUser() { return { data: { user } }; },
                onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
              },
              from(table) {
                const filters = {};
                let update;
                const query = {
                  select() { return query; },
                  eq(key, value) { filters[key] = value; return query; },
                  order() { return query; },
                  limit() { return query; },
                  abortSignal() { return query; },
                  update(value) { update = value; return query; },
                  maybeSingle() { return call('loadProgress'); },
                  then(resolve, reject) {
                    const result = update ? call('saveProgress', update)
                      : table === 'ink_responses' ? call('loadInk', filters) : Promise.resolve({ data: [] });
                    return result.then(resolve, reject);
                  },
                };
                return query;
              },
              rpc(name, args) {
                return { abortSignal() { return call('saveInk', args); } };
              },
            };
          }`,
      }));
    }

    const url = `${BASE}#/practice?subject=${subject}&mode=individual`;
    await first.goto(url);
    const answer = first.locator('.ink-answer').first();
    await answer.getByRole('button', { name: 'Write with Pencil' }).click();
    const surface = answer.locator('.ink-editor__canvas');
    await surface.evaluate(area => {
      const { left, top } = area.getBoundingClientRect();
      for (const [type, offset] of [['pointerdown', 0], ['pointermove', 30], ['pointerup', 60]]) {
        area.dispatchEvent(new PointerEvent(type, {
          pointerId: 5, pointerType: 'pen', button: 0, clientX: left + 20 + offset, clientY: top + 20 + offset,
        }));
      }
    });
    await answer.getByRole('button', { name: 'Save handwritten answer' }).click();
    await answer.getByRole('button', { name: 'Answer saved' }).waitFor();
    assert.equal(await answer.getByRole('button', { name: 'Answer saved' }).isEnabled(), true);
    await answer.getByRole('status').getByText('Saved on this device · Syncing…').waitFor();
    finishProgress();
    await answer.getByRole('status').getByText('Saved and synced').waitFor();

    await second.goto(url);
    const reopened = second.locator('.ink-answer').first();
    await reopened.getByRole('button', { name: 'Write with Pencil' }).click();
    await reopened.getByRole('button', { name: 'Saved answer' }).waitFor();
    const restored = await second.evaluate(async ({ responseId, partId }) => {
      const { createInkRepository } = await import('/js/data/ink.js');
      return createInkRepository('ink-sync-test').load(responseId, partId);
    }, { responseId: ink.responseId, partId: ink.partId });
    assert.deepEqual(restored.sections, ink.sections);
  } finally {
    finishProgress();
    await Promise.all([first.close(), second.close()]);
  }
});
