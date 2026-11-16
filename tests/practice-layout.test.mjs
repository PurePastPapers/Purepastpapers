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
  assert.ok(await opened.locator('[data-mark]').isVisible(), 'marks can be entered beside the scheme');

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
  assert.match(await page.locator('.runner__grid > :first-child').textContent(), /Mark scheme/, 'scheme takes the question’s place');
  assert.ok(await page.locator('[data-marks]').isVisible());
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
