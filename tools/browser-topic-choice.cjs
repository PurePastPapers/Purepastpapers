// Isolated profile: exercise manual/learned choices and expanded source cards.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const subject = 'EDX_ALEVEL_MATH_9MA0';

(async () => {
  const browser = await chromium.launch({headless: true,
    ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.evaluate(async () => (await import('/js/data/demo.js')).enterDemoAccount());
    await page.goto(base + '/#/practice?subject=' + subject + '&mode=individual');
    await page.waitForSelector('[data-reset-filters]');
    await page.locator('[data-reset-filters]').click();
    const cards = () => page.locator('.qlist .qcard').count();
    async function allExpanded() {
      assert.equal(await page.locator('.qlist [data-open][aria-expanded="true"]').count(), await cards());
      assert.equal(await page.locator('.qlist [data-scheme]').count(), await cards());
      assert((await cards()) > 0);
    }
    await allExpanded();
    assert.equal(await page.locator('[data-filter="rangeFrom"], [data-filter="rangeTo"], [data-filter="selectionMode"]').count(), 0);
    assert.equal(await page.getByText('Specification options', {exact: true}).count(), 0);
    assert.equal(await page.locator('.browser-topics [data-flag="learnedOnly"]').count(), 1);
    const actionBeforeQuestion = await page.locator('.qcard').first().evaluate(card =>
      Boolean(card.querySelector('[data-scheme]').compareDocumentPosition(card.querySelector('.question-selected-part')) & Node.DOCUMENT_POSITION_FOLLOWING));
    assert(actionBeforeQuestion);
    await page.locator('[data-page="2"]').click();
    await allExpanded();
    await page.locator('[data-reset-filters]').click();

    const state = () => page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.includes(':practice:'));
      return JSON.parse(localStorage.getItem(key));
    });
    const progress = await page.evaluate(async () => {
      const api = await import('/js/data/api.js');
      return JSON.stringify({learned: [...api.learnedSet()].sort(), attempts: api.getProgress().question_attempts});
    });
    await page.locator('[data-topic-organisation="official"]').check();
    const point = await page.evaluate(async id => {
      const {getBundle, specIndex} = await import('/js/data/content-repository.js');
      const api = await import('/js/data/api.js');
      const learned = api.learnedSet();
      const bundle = await getBundle(id);
      return bundle.questions.filter(q => q.provenance?.review_status === 'model_reviewed')
        .flatMap(q => [...specIndex.expand(q.primary_spec_points)]).find(id => !learned.has(id));
    }, subject);
    assert(point, 'fixture has an unlearned assessed point');
    await page.locator('[data-tree-bulk="none"]').click();
    const checkbox = page.locator(`[data-point="${point}"]`);
    await page.locator('.tree__section--filter').filter({has: checkbox}).locator(':scope > summary').click();
    await page.locator('.tree__topic').filter({has: checkbox}).locator(':scope > summary').click();
    await checkbox.check();
    await allExpanded();
    assert.deepEqual((await state()).focus, [point]);
    const id = await page.locator('[data-open]').first().getAttribute('data-open');
    await page.locator(`[data-answer="${id}"]`).fill('Keep my manual-topic draft');
    await page.locator(`[data-select="${id}"]`).check();
    const learnedToggle = () => page.locator('.browser-topics [data-flag="learnedOnly"]');
    await learnedToggle().check();
    assert(await page.locator('[data-topic-picker]').isHidden());
    assert.deepEqual((await state()).focus, [point], 'manual choices remain saved');
    assert((await cards()) > 0, 'learned mode is independent from the unlearned manual choice');
    const learnedResults = await page.locator('.qlist [data-open]').evaluateAll(es => es.map(e => e.dataset.open));
    assert(!learnedResults.includes(id));
    await page.reload();
    await page.waitForSelector('[data-reset-filters]');
    assert(await learnedToggle().isChecked());
    await learnedToggle().uncheck();
    assert(await page.locator('[data-topic-picker]').isVisible());
    assert.deepEqual((await state()).focus, [point]);
    assert.equal(await page.locator(`[data-answer="${id}"]`).inputValue(), 'Keep my manual-topic draft');
    assert(await page.locator(`[data-select="${id}"]`).isChecked());
    await page.locator(`[data-open="${id}"]`).click();
    assert.equal(await page.locator(`[data-answer="${id}"]`).count(), 0);
    await page.reload();
    await page.waitForSelector('[data-reset-filters]');
    assert.equal(await page.locator(`[data-open="${id}"]`).getAttribute('aria-expanded'), 'false');
    await page.locator(`[data-open="${id}"]`).click();
    assert.equal(await page.locator(`[data-answer="${id}"]`).inputValue(), 'Keep my manual-topic draft');
    const after = await page.evaluate(async () => {
      const api = await import('/js/data/api.js');
      return JSON.stringify({learned: [...api.learnedSet()].sort(), attempts: api.getProgress().question_attempts});
    });
    assert.equal(after, progress, 'view changes never edit learned coverage or marks');

    // An old saved range migrates into the one visible picker, and the old
    // empty openQuestions array must not collapse every card after upgrade.
    const expected = await page.evaluate(async id => {
      const {specIndex} = await import('/js/data/content-repository.js');
      const key = Object.keys(localStorage).find(k => k.includes(':practice:'));
      const state = JSON.parse(localStorage.getItem(key));
      state.focus = null;
      state.rangeFrom = 'EDX_MATH_PURE_ALG_2.1';
      state.rangeTo = 'EDX_MATH_PURE_ALG_2.2';
      state.openQuestions = [];
      delete state.closedQuestions;
      localStorage.setItem(key, JSON.stringify(state));
      return [...specIndex.range(id, state.rangeFrom, state.rangeTo)];
    }, subject);
    await page.reload();
    await page.waitForSelector('[data-reset-filters]');
    assert.deepEqual((await state()).focus, expected);
    assert.equal((await state()).rangeFrom, '');
    assert.equal((await state()).rangeTo, '');
    await allExpanded();
    await page.locator('[data-reset-filters]').click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width, height: 1000});
      // layout settles after a resize (js/ui/question-fit.js re-places the answer box)
      await page.waitForFunction((w) => document.documentElement.scrollWidth <= w, width, {timeout: 2000}).catch(() => {});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    }
    if (process.env.AUDIT_SCREENSHOT) {
      await page.locator('.browser-topics').scrollIntoViewIfNeeded();
      await page.screenshot({path: process.env.AUDIT_SCREENSHOT});
    }
    assert.deepEqual(errors, []);
    console.log('Single topic picker; learned/manual choices and drafts persist; old ranges migrate; every page starts expanded with scheme actions; explicit collapse persists; four widths: PASS');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exit(1);});
