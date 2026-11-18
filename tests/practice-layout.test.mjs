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

test('Find questions: the filter is one compact bar of dropdowns', { skip }, async () => {
  const { page, errors } = await demoPage({ width: 1366, height: 900 });
  const bar = await page.locator('.fbar').boundingBox();
  assert.ok(bar.height < 160, `filter bar is ${bar.height}px tall`);
  assert.deepEqual(await page.locator('.fpop__label').allTextContents(), ['Topics', 'Difficulty', 'Marks', 'Progress', 'More']);
  assert.equal(await page.locator('.fpop[open]').count(), 0);

  await page.locator('[data-section="fpop-topics"] > summary').click();
  assert.ok(await page.locator('[data-section="fpop-topics"] [data-tree]').isVisible());
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

test('Find questions: question left, answer right, mark scheme replaces the question', { skip }, async () => {
  const { page, errors } = await demoPage({ width: 1366, height: 900 });
  const card = page.locator('.qcard').filter({ has: page.locator('.qsplit') }).first();
  const main = await card.locator('.qsplit__main').boundingBox();
  const side = await card.locator('.qsplit__side').boundingBox();
  assert.ok(main.x + main.width <= side.x, 'question sits to the left of the answer box');
  assert.ok(await card.locator('.qsplit__side [data-answer]').isVisible());

  await card.locator('.qsplit__answer').fill('My answer');
  await card.locator('[data-scheme]').click();
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
  assert.equal(await dialog.locator('.qsplit__label, button:not([data-zoom-close]):not([data-zoom-fit])').count(), 0);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Enlarge on a phone: the question can be dragged around or fitted to the screen', { skip }, async () => {
  const { page, errors } = await demoPage({ width: 390, height: 844 });
  await page.locator('[data-select]').first().check();
  await page.locator('[data-start-set]').click();
  await page.locator('.qview [data-zoom]').click();
  const dialog = page.locator('dialog.zoom[open]');
  await dialog.waitFor();
  const box = await dialog.boundingBox();
  assert.ok(box.width >= 389 && box.height >= 840, 'fills the phone screen');
  const body = dialog.locator('.zoom__body');
  const scrollable = await body.evaluate((node) => node.scrollWidth > node.clientWidth);
  assert.ok(scrollable, 'the enlarged question is wider than the screen and scrolls sideways');
  assert.equal((await dialog.locator('.zoom__hint').textContent()).trim(), 'Drag to move around');

  await dialog.locator('[data-zoom-fit]').click();
  assert.ok(await body.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), 'Fit to screen shows the whole width');
  assert.equal((await dialog.locator('[data-zoom-fit]').textContent()).trim(), 'Zoom in');
  await dialog.locator('[data-zoom-fit]').click();
  assert.ok(await body.evaluate((node) => node.scrollWidth > node.clientWidth));
  assert.deepEqual(errors, []);
  await page.close();
});

test('Marks: buttons for 1-6 mark questions, a slider for 7 or more', { skip }, async () => {
  const { page, errors } = await demoPage({ width: 1366, height: 900 });
  const small = page.locator('.qcard').filter({ has: page.locator('.marks-pill', { hasText: /^3 marks$/ }) }).first();
  await small.locator('[data-scheme]').click();
  const picker = page.locator('.qcard [data-markpick]').first();
  await picker.waitFor();
  assert.deepEqual(await picker.locator('[data-pick]').allTextContents(), ['0', '1', '2', '3']);
  await picker.locator('[data-pick="2"]').click();
  assert.equal(await picker.locator('[data-pick="2"]').getAttribute('aria-checked'), 'true');
  assert.equal(await picker.locator('input[type="hidden"]').inputValue(), '2');
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
