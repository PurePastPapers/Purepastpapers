// Real Biology A source bank in an isolated demo profile. Requires optional dev Playwright
// and a running server (npm start). Counts come from the committed packs.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const {results, allTopics, reveal, pickMark} = require('./browser-results.cjs'); // linked parts are one result
const {readFileSync} = require('node:fs');
const path = require('node:path');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const subject = 'EDX_ALEVEL_BIOL_9BN0';
const root = path.join(__dirname, '..');
const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const packs = read('data/packs/index.json').packs.filter(p => p.file.startsWith('biology/')).map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);
const asUnits = results(units, (q) => q.is_as);
const year13 = results(units, (q) => q.introduced_year === 13);
const articlePaper = 'EDX_9BN0_2023_JUNE_03';

(async () => {
  const browser = await chromium.launch({headless: true,
    ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !/net::ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED)/.test(message.text())) errors.push(message.text()); });
    await page.goto(base);
    await page.evaluate(async id => {
      await (await import('/js/data/demo.js')).enterDemoAccount();
      await (await import('/js/data/api.js')).setEnrolled(id, true);
    }, subject);
    await page.goto(base + '/#/practice?subject=' + subject);
    await page.waitForSelector('[data-reset-filters]');
    await page.locator('[data-reset-filters]').click();
    await allTopics(page);
    const count = async () => Number((await page.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]);
    assert.equal(await count(), results(units));

    // Generated seed placeholders are hidden; demo records remain only for historical lookups.
    const catalogue = await page.evaluate(async id => {
      const bundle = await (await import('/js/data/content-repository.js')).getBundle(id);
      return {papers: bundle.papers.length, placeholder: bundle.papers.some(p => p.paper_id === 'EDX_9BN0_2023_JUNE_P1'),
        demoVisible: bundle.questions.some(q => q.is_sample), legacyLabel: (await import('/js/data/content-repository.js')).specIndex.label('EDX_BIOL_T2_2.4')};
    }, subject);
    assert.equal(catalogue.papers, packs.length);
    assert.equal(catalogue.placeholder, false);
    assert.equal(catalogue.demoVisible, false);
    assert.notEqual(catalogue.legacyLabel, 'EDX_BIOL_T2_2.4');

    // Qualification chips and content-year logic (Year 13 cumulative; "Year 13 topics only").
    assert.equal(await page.locator('[data-multi="qualifications"][data-value="9BN0"]').count(), 1);
    await (await reveal(page, '[data-multi="qualifications"][data-value="8BN0"]')).click();
    assert.equal(await count(), asUnits);
    await (await reveal(page, '[data-curriculum-year]')).selectOption('13');
    assert.equal(await count(), asUnits);
    await page.locator('[data-year13-only]').check();
    assert.equal(await count(), 0);
    await page.locator('[data-reset-filters]').click();
    await (await reveal(page, '[data-curriculum-year]')).selectOption('13');
    await page.locator('[data-year13-only]').check();
    assert.equal(await count(), year13);
    await page.locator('[data-year13-only]').uncheck();
    await (await reveal(page, '[data-curriculum-year]')).selectOption('12');
    assert.equal(await count(), results(units, (q) => q.introduced_year !== 13));
    await page.locator('[data-reset-filters]').click();

    // Expanded questions, lazily resolved lossless pixels and the scheme on request.
    async function loaded(selector) {
      const image = page.locator(selector).first();
      await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(selector => {
        const image = document.querySelector(selector);
        return image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:');
      }, selector);
    }
    assert((await page.locator('[data-open][aria-expanded="true"]').count()) > 0);
    assert.equal(await page.locator('.ms img').count(), 0);
    await loaded('.question-selected-part img');
    await page.locator('[data-scheme]').first().click();
    await loaded('.ms img');

    // A deliberate zero survives reload.
    await pickMark(page, 0); // mark picker, not a dropdown
    const markedId = await page.locator('[data-card]').first().getAttribute('data-card');
    const zeros = () => page.evaluate(async (id) => ((await import('/js/data/api.js')).getProgress().question_attempts || []).filter((a) => a.question_id === id && a.marks_awarded === 0).length, markedId);
    const zerosBefore = await zeros();
    await page.locator('[data-save-mark]').first().click();
    // an account that has tried the question before is asked whether to change that attempt (560c827)
    const fresh = page.getByRole('button', {name: 'Start a new attempt'});
    if (await fresh.waitFor({timeout: 2000}).then(() => true, () => false)) {
      await fresh.click();
      await pickMark(page, 0);
      await page.locator('[data-save-mark]').first().click();
    }
    await page.waitForTimeout(1400);
    await page.reload();
    await page.waitForSelector('[data-reset-filters]');
    // every attempt is kept (560c827): the zero is saved as its own attempt and survives the reload
    assert.equal(await zeros(), zerosBefore + 1, 'a deliberate zero is saved');

    // Paper 3 pre-release article is available as unscored context.
    await (await reveal(page, '[data-filter="paper"]')).selectOption(articlePaper);
    const articleToggle = page.locator('[data-article-context] summary').first();
    for (let i = 0; i < 6 && !(await articleToggle.count()); i++) {
      const next = page.locator('[data-page-next], [data-next-page]').first();
      if (!(await next.count())) break;
      await next.click();
    }
    await articleToggle.scrollIntoViewIfNeeded();
    await articleToggle.click();
    await loaded('[data-article-context][open] img');
    assert((await page.getByText('carries no marks').count()) > 0);
    await page.locator('[data-reset-filters]').click();

    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width, height: 1000});
      // layout settles after a resize (js/ui/question-fit.js re-places the answer box)
      await page.waitForFunction((w) => document.documentElement.scrollWidth <= w, width, {timeout: 2000}).catch(() => {});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      if (process.env.AUDIT_SCREENSHOT_DIR) await page.screenshot({path: `${process.env.AUDIT_SCREENSHOT_DIR}/biology-${width}.png`});
    }
    assert.equal(await page.getByText('Demo content', {exact: true}).count(), 0);

    // Official sample label on its genuine paper page.
    await page.goto(base + '/#/paper/' + subject + '/EDX_9BN0_SAMPLE_01');
    await page.getByText('Official sample assessment', {exact: true}).first().waitFor();

    // A guest can choose topics without saving learned coverage.
    const guest = await browser.newPage({viewport: {width: 390, height: 900}});
    await guest.goto(base + '/#/practice?subject=' + subject);
    await guest.waitForTimeout(1500);
    const guestLearned = await guest.evaluate(async () => {
      const api = await import('/js/data/api.js');
      return api.getProgress ? (api.getProgress()?.learned_spec_points || []).length : 0;
    }).catch(() => 0);
    assert.equal(guestLearned, 0);

    assert.deepEqual(errors, []);
    console.log(`${packs.length} Biology booklets / ${units.length} units; AS ${asUnits}; Year 13 only ${year13}; placeholders hidden; ` +
      'legacy ids resolve; source+scheme pixels; saved 0/reload; article context; sample label; 4 widths; guest unchanged: PASS');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exit(1);});
