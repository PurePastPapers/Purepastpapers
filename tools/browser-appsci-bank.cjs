// Local-only Applied Science sample-bank preview. The public packs are not enabled while
// rights are being confirmed; this test adds them to the pack index only in its isolated
// browser response so we can exercise the actual Practice and paper-page UI.
const assert = require('node:assert/strict');
const {readFileSync, readdirSync} = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {allTopics, pickMark, results, reveal} = require('./browser-results.cjs');

const base = (process.env.AUDIT_URL || 'http://localhost:5173').replace(/\/$/, '');
const subject = 'OCR_L3_APPSCI_AAQ';
const root = path.join(__dirname, '..');
const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const files = readdirSync(path.join(root, 'data/packs/appsci')).filter(file => file.endsWith('.json')).sort();
const packs = files.map(file => read(`data/packs/appsci/${file}`));
const papers = packs.flatMap(pack => pack.papers);
const units = packs.flatMap(pack => pack.questions);
const byId = new Map(units.map(question => [question.question_id, question]));
const crossover = units.find(question => question.crossover_spec_points?.length && question.primary_spec_points?.length);
const markingQuestion = units.find(question => question.marks > 0 && question.content?.question_image_url);
const testPoints = [...new Set(units.flatMap(question => [...(question.primary_spec_points || []), ...(question.crossover_spec_points || [])]))];
const practice = mode => `/#/practice?subject=${subject}&mode=${mode}`;
const preview = process.env.APPSCI_PREVIEW === '1';
const activeEntries = read('data/packs/index.json').packs.filter(entry => entry.file.startsWith('appsci/') && entry.enabled !== false);

assert.deepEqual(papers.map(paper => paper.paper_id).sort(), ['OCR_F180_SAMPLE', 'OCR_F181_SAMPLE']);
assert(crossover, 'Expected a reviewed Applied Science crossover question');
assert(markingQuestion, 'Expected a question with an official image asset for marking and export');
if (!preview && activeEntries.length !== 2) throw new Error('Applied Science packs are inactive; use APPSCI_PREVIEW=1 for an isolated local preview.');

async function loadImage(image) {
  await image.scrollIntoViewIfNeeded();
  await image.evaluate(async element => {
    await element.decode();
    if (!element.complete || !element.naturalWidth) throw new Error('Question image did not render');
  }, undefined, {timeout: 20000});
}

async function count(page) {
  const status = page.locator('[data-output] .browser-results-heading [role="status"], [data-output] [role="status"]').first();
  await status.waitFor();
  return Number((await status.innerText()).match(/\d+/)?.[0] || 0);
}

async function findCard(page, id) {
  const card = page.locator(`[data-card="${id}"]`);
  for (let attempt = 0; attempt < 8 && !(await card.count()); attempt++) {
    const next = page.getByRole('navigation', {name: 'Question results pages'}).getByRole('button', {name: 'Next', exact: true});
    if (!(await next.count()) || !(await next.isEnabled())) break;
    await next.click();
  }
  return card;
}

async function exportQuestion(page) {
  await page.locator('[data-export-test="selection"]').click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name="kind"]').selectOption('question');
  await dialog.getByRole('button', {name: 'Prepare PDF'}).click();
  const handoff = page.locator('a[data-pdf-handoff][download]').first();
  await handoff.waitFor({timeout: 60000});
  assert.match(await handoff.getAttribute('download'), /-question\.pdf$/);
  const pdf = await handoff.evaluate(async anchor => {
    const response = await fetch(anchor.href);
    return new TextDecoder('latin1').decode(await response.arrayBuffer());
  });
  assert(pdf.startsWith('%PDF-'));
  assert(!/Mark scheme|mark.scheme/i.test(pdf), 'question-only export must not include mark-scheme text');
  await handoff.click();
  await page.waitForTimeout(200);
  for (let attempt = 0; attempt < 3; attempt++) {
    const openDialog = page.locator('dialog[open]');
    if (!(await openDialog.count())) break;
    await page.keyboard.press('Escape');
    await openDialog.first().waitFor({state: 'hidden', timeout: 2000}).catch(() => {});
  }
}

(async () => {
  const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
  try {
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    if (preview) {
      await context.route('**/data/packs/index.json', async route => {
        const response = await route.fetch();
        const index = await response.json();
        const previewEntries = packs.map((pack, i) => ({file: `appsci/${files[i]}`, subject_id: subject, enabled: true}));
        await route.fulfill({response, json: {...index, packs: [...index.packs.filter(entry => !entry.file.startsWith('appsci/')), ...previewEntries]}});
      });
    }
    // This is a local demo-profile check; return a minimal no-session client instead of
    // depending on the externally hosted Supabase package in the headless test runner.
    await context.route(/https:\/\/esm\.sh\/@supabase\/supabase-js@2\?bundle/, route => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      headers: {'access-control-allow-origin': '*'},
      body: 'export function createClient(){return {auth:{getSession:async()=>({data:{session:null},error:null})}}}',
    }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !/net::ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED)/.test(message.text())) errors.push(message.text()); });
    page.on('requestfailed', request => errors.push(`${request.url()} ${request.failure()?.errorText || 'request failed'}`));
    await page.goto(base);
    await page.evaluate(async id => {
      await (await import('/js/data/demo.js')).enterDemoAccount();
      await (await import('/js/data/api.js')).setEnrolled(id, true);
    }, subject);

    await page.goto(base + `/#/papers?subject=${subject}`);
    await page.getByRole('heading', {name: 'Official samples', exact: true}).waitFor();
    for (const paper of papers) {
      const card = page.locator(`.paper-card:has(a[href="#/paper/${subject}/${paper.paper_id}"])`).first();
      await card.waitFor();
      assert.match(await card.innerText(), new RegExp(paper.paper_code));
    }
    for (const paper of papers) {
      await page.goto(base + `/#/paper/${subject}/${paper.paper_id}`);
      await page.locator('.paper-qs__count').waitFor();
      const countLabel = await page.locator('.paper-qs__count').innerText();
      const expectedQuestionGroups = results(units, question => question.paper_id === paper.paper_id);
      assert.match(countLabel, new RegExp(`${expectedQuestionGroups} questions?`));
      assert(countLabel.includes(`${paper.available_marks} of ${paper.total_marks} marks`), 'coverage shows both available and printed marks');
      assert.equal(await page.locator('[data-start="timed"]').count(), 0, 'partial samples cannot start a full timed paper');
      await page.getByText(/a timed sitting is unavailable/i).waitFor();
      assert.match(await page.locator('h1').innerText(), new RegExp(paper.paper_code));
    }

    // Verify the learned-only gate using only the chosen crossover question's required tags.
    const learned = [...new Set([...crossover.primary_spec_points, ...crossover.crossover_spec_points])];
    await page.evaluate(async points => (await import('/js/data/api.js')).setLearned(points, true), learned);
    await page.goto(base + practice('individual'));
    await page.locator('[data-reset-filters]').waitFor();
    await page.locator('[data-reset-filters]').click();
    const covered = page.locator('[data-covered]').first();
    if (await covered.count() && !(await covered.isChecked())) await covered.check({force: true});
    const allowedCount = results(units, question => {
      const required = [...(question.primary_spec_points || []), ...(question.crossover_spec_points || [])];
      return required.length > 0 && required.every(point => learned.includes(point));
    });
    assert.equal(await count(page), allowedCount, 'learned-only practice includes only questions whose required points are learned');
    await covered.uncheck({force: true});
    await page.locator('[data-reset-filters]').click();

    // Exact point selection plus the strict/crossover switch exercises the main filter contract.
    const point = crossover.primary_spec_points[0];
    await (await reveal(page, `[data-point="${point}"]`)).check({force: true});
    await page.locator('[data-topic-coverage="strict"]').check({force: true});
    const strictCount = await count(page);
    await page.locator('[data-topic-coverage="crossover"]').check({force: true});
    const crossoverCount = await count(page);
    assert(crossoverCount >= strictCount, 'crossover mode may include additional assessed questions');
    assert(await (await findCard(page, crossover.question_id)).count(), `crossover question ${crossover.question_id} remains discoverable`);

    // Open an exact sample item, reveal its source pixels and scheme, and save a mark.
    await page.locator('[data-reset-filters]').click();
    const card = await findCard(page, markingQuestion.question_id);
    assert(await card.count(), `missing marking fixture ${markingQuestion.question_id}`);
    if ((await card.locator('[data-open]').count()) && (await card.locator('[data-open]').getAttribute('aria-expanded')) === 'false') await card.locator('[data-open]').click();
    await loadImage(card.locator('.question-selected-part img').first());
    await card.locator('[data-answer]').fill('Regression check answer.');
    await card.locator('[data-scheme]').click();
    await loadImage(card.locator('.ms img').first());
    await pickMark(page, Math.min(markingQuestion.marks, 1), card);
    await card.getByText(new RegExp(`Saved ${Math.min(markingQuestion.marks, 1)}/${markingQuestion.marks}`)).waitFor();
    const stored = await page.evaluate(async id => (await import('/js/data/api.js')).exportData().progress.question_attempts.some(item => item.question_id === id), markingQuestion.question_id);
    assert(stored, 'mark is recorded for later review');

    // Select and export a question-only PDF. The scheme stays excluded from this export.
    await card.locator('[data-select]').check({force: true});
    await exportQuestion(page);

    // Build a custom timed test from selected topics and confirm it opens as a timed session.
    await page.evaluate(async points => (await import('/js/data/api.js')).setLearned(points, true), testPoints);
    await page.goto(base + practice('timed_test'));
    await page.locator('[data-start-test]').waitFor();
    await page.waitForTimeout(600);
    const customLength = page.locator('[data-minutes-input]');
    assert.equal(await customLength.evaluate(input => Boolean(input.closest('[inert]'))), false, 'custom duration input is actionable');
    await customLength.click();
    await customLength.press('Control+A');
    await customLength.pressSequentially('15');
    assert(await page.locator('.testlist li').count() > 0, 'Build a Test contains sample questions');
    await page.waitForFunction(() => document.querySelector('[data-minutes-input]')?.value === '15', null, {timeout: 5000});
    assert.equal(await page.locator('[data-minutes-input]').inputValue(), '15', 'custom duration is retained');
    await page.locator('[data-start-test]').click();
    await page.locator('[data-session], [data-session-timer], [data-timer]').first().waitFor({timeout: 15000});
    assert.equal(await page.locator('[data-timer]').count(), 1, 'custom test has a running timer');
    assert.equal(await page.locator('.qview--scheme, .ms').count(), 0, 'mark schemes stay hidden while answering');
    await page.locator('[data-finish]').first().click();
    const finishDialog = page.getByRole('dialog');
    await finishDialog.getByRole('button', {name: 'Finish', exact: true}).click();
    await page.getByRole('heading', {name: 'Mark your answers', exact: true}).waitFor();
    const markPickers = page.locator('.markcard [data-markpick]');
    const markPickerCount = await markPickers.count();
    assert(markPickerCount > 0, 'timed questions enter the marking stage');
    for (let i = 0; i < markPickerCount; i++) {
      const picker = markPickers.nth(i);
      if (await picker.locator('[data-pick="0"]').count()) await picker.locator('[data-pick="0"]').click();
      else await picker.locator('[data-pick-range]').fill('0');
    }
    assert.match(await page.locator('[data-markbar]').innerText(), new RegExp(`${markPickerCount} of ${markPickerCount} marked`));
    assert(await page.locator('.markcard .ms').count() > 0, 'official schemes appear in the review stage');
    await page.locator('[data-save-results]').click();
    await page.locator('.result-hero__score').waitFor();
    assert.equal(await page.locator('.grade-stamp').count(), 0, 'raw-marks policy does not invent a sample grade');
    await page.getByRole('heading', {name: 'Review', exact: true}).waitFor();
    assert(await page.locator('.review-card').count() > 0, 'the saved test exposes answer and scheme review');

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({width, height: 1000});
      await page.waitForFunction(w => document.documentElement.scrollWidth <= w, width, {timeout: 5000});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `horizontal overflow at ${width}px`);
    }
    for (const [route, ready] of [
      [`/#/papers?subject=${subject}`, '.paper-card'],
      [`/#/paper/${subject}/OCR_F180_SAMPLE`, '.paper-qs__count'],
      [`/#/paper/${subject}/OCR_F181_SAMPLE`, '.paper-qs__count'],
      [practice('individual'), '.browser-results-heading'],
      [practice('timed_test'), '[data-minutes-input]'],
    ]) {
      await page.goto(base + route);
      await page.locator(ready).first().waitFor();
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({width, height: 1000});
        try {
          await page.waitForFunction(w => document.documentElement.scrollWidth <= w, width, {timeout: 5000});
        } catch (error) {
          console.error('Responsive failure', route, width, await page.evaluate(() => [...document.querySelectorAll('main *')]
            .filter(node => node.getBoundingClientRect().right > innerWidth + 1)
            .map(node => ({tag: node.tagName, cls: node.className, text: node.textContent.slice(0, 100), right: node.getBoundingClientRect().right})).slice(0, 12)));
          throw error;
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${route}: overflow at ${width}px`);
      }
    }
    await page.goto(base + '/#/practice?subject=OCR_L3_BUS_CTEC&mode=individual');
    await page.getByText('Applied Business', {exact: false}).first().waitFor({timeout: 15000});
    assert.deepEqual(errors, []);
    console.log(`${preview ? 'Isolated local preview' : 'Active bank'}: ${papers.length} official sample papers / ${units.length} scored units; grouping, learned gate, exact point and crossover filters, marking and review, question-only export, 15-minute custom test, raw marks, timed scheme gate, other Level 3 route, paper/practice/builder/review at 320/390/1440 px: PASS`);
    await context.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
