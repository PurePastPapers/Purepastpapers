// Browser checks for js/ui/question-fit.js: the answer box goes below short questions and
// beside long ones, and the question fits the screen, decided from the question, not the subject.
// Needs Playwright with a Chromium browser; skipped where that is not installed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* skipped below */ }
const skip = chromium ? false : 'Playwright is not installed';
const PORT = 5900 + Math.floor(Math.random() * 300);
const BASE = `http://localhost:${PORT}/`;
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

/** Opens a mark-as-you-go session on the given real questions; returns the page. */
async function session(viewport, subject, pick) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(BASE);
  const id = await page.evaluate(async ({ subject, pick }) => {
    await (await import('/js/data/demo.js')).enterDemoAccount();
    const api = await import('/js/data/api.js');
    await api.setEnrolled(subject, true);
    const repo = await import('/js/data/content-repository.js');
    const real = (await repo.getBundle(subject)).questions.filter((q) => !q.is_sample && q.content?.question_image_url);
    const question = real.find((q) => new RegExp(pick).test(q.question_id)) || real[0];
    const { createSession } = await import('/js/data/sessions.js');
    const s = createSession({ kind: 'practice', subject_id: subject, title: 'Practice', question_ids: [question.question_id], mark_mode: 'each' });
    await api.saveSession(s, { silent: true });
    return s.session_id;
  }, { subject, pick });
  await page.goto(`${BASE}#/session/${id}`);
  await page.waitForSelector('.runner__grid[data-qlayout]', { timeout: 15_000 });
  return { page, errors };
}

const boxes = (page) => page.evaluate(() => {
  const box = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
  return { question: box('.runner__grid .qview'), answer: box('.runner__grid .answer-card'), layout: document.querySelector('.runner__grid').dataset.qlayout };
});

test('A short essay question puts a full-width answer box below it, all on one screen', { skip }, async () => {
  const { page, errors } = await session({ width: 1440, height: 900 }, 'AQA_ALEVEL_POL_7152', '_Q01_');
  const { question, answer, layout } = await boxes(page);
  assert.equal(layout, 'below');
  assert.ok(question.bottom <= answer.top, 'answer box is under the question');
  assert.ok(answer.width > 1000, `answer box is ${answer.width}px wide`);
  assert.ok(answer.bottom <= 900, 'question and answer box fit the screen');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Blank working space in a crop is shortened, so a one-line maths question stacks too', { skip }, async () => {
  const { page, errors } = await session({ width: 1440, height: 900 }, 'EDX_GCSE_MATH_1MA1', '2019_JUNE_2H_Q13_');
  const { layout } = await boxes(page);
  const image = await page.evaluate(() => { const img = document.querySelector('.runner__grid .qview img'); return { shown: img.naturalHeight, trimmed: img.dataset.qfitTrimmed }; });
  assert.equal(image.trimmed, 'true');
  assert.ok(image.shown < 400, `question image is ${image.shown}px tall after trimming`);
  assert.equal(layout, 'below');
  assert.deepEqual(errors, []);
  await page.close();
});

test('A tall question keeps the answer box beside it, never squeezed, and the question fits or the box stays pinned', { skip }, async () => {
  const { page, errors } = await session({ width: 1440, height: 900 }, 'EDX_ALEVEL_HIST_9HI0', '2H_Q02_');
  const { question, answer, layout } = await boxes(page);
  assert.ok(['beside', 'long'].includes(layout), `layout is ${layout}`);
  assert.ok(question.right <= answer.left, 'answer box is to the right of the question');
  assert.ok(answer.width >= 360, `answer box is ${answer.width}px wide`);
  if (layout === 'beside') assert.ok(question.bottom <= 900, 'question fits the screen');
  else assert.equal(await page.locator('.runner__grid .runner__side').evaluate((node) => getComputedStyle(node).position), 'sticky');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Phones always stack the answer box under the question', { skip }, async () => {
  const { page, errors } = await session({ width: 390, height: 844 }, 'EDX_ALEVEL_HIST_9HI0', '2H_Q02_');
  const { question, answer, layout } = await boxes(page);
  assert.equal(layout, 'below');
  assert.ok(question.bottom <= answer.top);
  assert.deepEqual(errors, []);
  await page.close();
});
