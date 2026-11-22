// Real source bank, isolated account/profile. Requires optional dev Playwright.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const subject = 'EDX_ALEVEL_MATH_9MA0';
const {results, allTopics, reveal, pickMark} = require('./browser-results.cjs'); // linked parts are one result
const {readFileSync} = require('node:fs');
const path = require('node:path');
const units = JSON.parse(readFileSync(path.join(__dirname, '../data/packs/index.json'), 'utf8')).packs
  .flatMap((entry) => JSON.parse(readFileSync(path.join(__dirname, '../data/packs', entry.file), 'utf8')).questions)
  .filter((q) => q.subject_id === subject);
assert.equal(units.length, 1110);
assert.equal(units.filter((q) => q.is_as).length, 377);

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
    await allTopics(page);
    const count = async () => Number((await page.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]);
    assert.equal(await count(), results(units));
    const catalogue = await page.evaluate(async id => {
      const bundle = await (await import('/js/data/content-repository.js')).getBundle(id);
      return {papers: bundle.papers.length, historical: bundle.questionsById.has('EDX_9MA0_DEMO_PURE_Q01')};
    }, subject);
    assert.deepEqual(catalogue, {papers: 60, historical: true});
    await (await reveal(page, '[data-multi="qualifications"][data-value="8MA0"]')).click();
    const asCount = await count();
    assert.equal(asCount, results(units, (q) => q.is_as));
    await (await reveal(page, '[data-curriculum-year]')).selectOption('12');
    assert.equal(await count(), asCount);
    await (await reveal(page, '[data-curriculum-year]')).selectOption('13');
    assert.equal(await count(), asCount);
    await page.locator('[data-year13-only]').check();
    assert.equal(await count(), 0);
    await page.locator('[data-year13-only]').uncheck();
    assert.equal(await count(), asCount);
    assert.equal(await page.locator('[data-open][aria-expanded="true"]').count(), 30);
    assert.equal(await page.locator('[data-scheme]').count(), 30);
    async function loaded(selector) {
      const image = page.locator(selector).first();
      await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(selector => {
        const image = document.querySelector(selector);
        return image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:');
      }, selector);
    }
    await loaded('.question-selected-part img');
    await page.locator('[data-scheme]').first().click();
    await loaded('.ms img');
    await pickMark(page, 0); // mark picker, not a dropdown
    const markedId = await page.locator('[data-card]').first().getAttribute('data-card');
    const zeros = () => page.evaluate(async (id) => ((await import('/js/data/api.js')).getProgress().question_attempts || []).filter((a) => a.question_id === id && a.marks_awarded === 0).length, markedId);
    const zerosBefore = await zeros();
    await page.locator('[data-mark-confirmation]:not([hidden])').first().waitFor();   // marks save as the slider settles
    // an account that has tried the question before is asked whether to change that attempt (560c827)
    const fresh = page.getByRole('button', {name: 'Start a new attempt'});
    if (await fresh.waitFor({timeout: 2000}).then(() => true, () => false)) {
      await fresh.click();
      await pickMark(page, 0);
      await page.locator('[data-mark-confirmation]:not([hidden])').first().waitFor();   // marks save as the slider settles
    }
    await page.waitForTimeout(1400);
    await page.reload();
    await page.waitForSelector('[data-reset-filters]');
    // every attempt is kept (560c827): the zero is saved as its own attempt and survives the reload
    assert.equal(await zeros(), zerosBefore + 1, 'a deliberate zero is saved');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width, height: 1000});
      // layout settles after a resize (js/ui/question-fit.js re-places the answer box)
      await page.waitForFunction((w) => document.documentElement.scrollWidth <= w, width, {timeout: 2000}).catch(() => {});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    }
    await page.locator('[data-reset-filters]').click();
    const layout = await page.evaluate(() => {
      const filters = document.querySelector('[data-controls]').getBoundingClientRect();
      const results = document.querySelector('[data-output]').getBoundingClientRect();
      return {before: filters.bottom <= results.top, fullWidth: Math.abs(filters.width - results.width) <= 1};
    });
    assert.deepEqual(layout, {before: true, fullWidth: true});
    // Exercise the official sample label and source pixels via its genuine paper page.
    await page.goto(base + '/#/paper/' + subject + '/EDX_8MA0_SAMPLE_01');
    await page.getByText('Official sample assessment', {exact: true}).first().waitFor();
    assert.equal(await page.getByText('Demo content', {exact: true}).count(), 0);
    assert((await page.locator('a[href$=".zip"]').count()) > 0);
    assert.deepEqual(errors, []);
    console.log('60 source booklets / 1,110 units; AS 377 in Year12 and cumulative13; none in13-only; source+scheme pixels; saved0/reload; 4 widths; sample labels; legacy lookup: PASS');
    if (process.env.AUDIT_SCREENSHOT) await page.screenshot({path: process.env.AUDIT_SCREENSHOT});
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exit(1);});
