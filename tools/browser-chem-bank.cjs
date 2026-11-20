// Real OCR Chemistry A source bank (H432 + AS H032), isolated demo account/profile.
// Requires Playwright. Run after `tools/chem/finalize.py --activate` (packs in the live index), with `npm start` serving,
// or against the deployed site with AUDIT_URL=https://purepastpapers.com (fresh profile; progress is browser-local).
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const {results, allTopics, reveal, pickMark} = require('./browser-results.cjs'); // linked parts are one result
const {readFileSync} = require('node:fs');
const path = require('node:path');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const subject = 'OCR_ALEVEL_CHEM_H432';
const root = path.join(__dirname, '..');
const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const packs = read('data/packs/index.json').packs.filter(p => p.file.startsWith('chem/')).map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);
const asUnits = results(units, (q) => q.is_as);
const year13 = results(units, (q) => q.introduced_year === 13);

(async () => {
  assert.equal(packs.length, 52, 'Chemistry packs are not all active in data/packs/index.json');
  const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
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
    // Filters sit in popovers: open "More" (qualification, year, series, paper) before using its controls.
    const pop = async key => {
      if (!(await page.locator(`[data-section="fpop-${key}"]`).evaluate(el => el.open))) await page.locator(`[data-section="fpop-${key}"] > summary`).click();
    };
    const more = () => pop('more');
    const count = async () => {
      await page.waitForTimeout(250);
      return Number((await page.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]);
    };
    assert.equal(await count(), results(units), 'all units discoverable, demos hidden');

    // Qualification chips and content-year logic (AS in Year 12 and cumulative Year 13; "Year 13 topics only").
    await more();
    assert.equal(await page.locator('[data-multi="qualifications"][data-value="H432"]').count(), 1);
    await (await reveal(page, '[data-multi="qualifications"][data-value="H032"]')).click();
    assert.equal(await count(), asUnits, 'AS filter');
    await pop('topics'); await page.locator('[data-curriculum-year]').selectOption('13');
    assert.equal(await count(), asUnits, 'AS stays in the cumulative Year 13 pool');
    await pop('topics'); await page.locator('[data-year13-only]').check();
    assert.equal(await count(), 0, 'no AS unit is Year 13 only');
    await page.locator('[data-reset-filters]').click();
    await more();
    await pop('topics'); await page.locator('[data-curriculum-year]').selectOption('13');
    await pop('topics'); await page.locator('[data-year13-only]').check();
    assert.equal(await count(), year13, 'Year 13 only');
    await pop('topics'); await page.locator('[data-year13-only]').uncheck();
    await pop('topics'); await page.locator('[data-curriculum-year]').selectOption('12');
    assert.equal(await count(), results(units, (q) => q.introduced_year !== 13), 'Year 12 pool');
    await page.locator('[data-reset-filters]').click();

    async function loaded(selector) {
      const image = page.locator(selector).first();
      await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(s => {
        const image = document.querySelector(s);
        return image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:');
      }, selector, {timeout: 30000});
    }
    // A paper with part stems/lead-ins: question, context and scheme pixels load; the scheme stays hidden until requested.
    const contextPaper = packs.find(p => p.questions.some(q => (q.context.intros || []).length && !p.papers[0].is_official_sample)).papers[0].paper_id;
    await page.locator('[data-reset-filters]').click();
    await more();
    await (await reveal(page, '[data-filter="paper"]')).selectOption(contextPaper);
    assert.equal(await count(), results(units, (q) => q.paper_id === contextPaper));
    await loaded('.question-selected-part img');
    await loaded('[data-question-resources] img');
    assert(await page.getByText('Unscored context', {exact: false}).count() > 0);
    assert.equal(await page.locator('.ms img').count(), 0, 'scheme hidden until requested');
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
    await page.locator('[data-reset-filters]').click();

    // Official sample paper keeps its distinct label.
    await page.goto(base + '/#/paper/' + subject + '/OCR_H432_SAMPLE_01');
    await page.getByText('Official sample', {exact: false}).first().waitFor();

    await page.goto(base + '/#/practice?subject=' + subject);
    await page.waitForSelector('[data-reset-filters]');
    await page.evaluate(() => document.querySelectorAll('details.fpop[open]').forEach(d => { d.open = false; }));
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width, height: 1000});
      await page.waitForTimeout(200);
      // layout settles after a resize (js/ui/question-fit.js re-places the answer box)
      await page.waitForFunction((w) => document.documentElement.scrollWidth <= w, width, {timeout: 2000}).catch(() => {});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `overflow at ${width}`);
      if (process.env.AUDIT_SCREENSHOT_DIR) await page.screenshot({path: `${process.env.AUDIT_SCREENSHOT_DIR}/chem-${width}.png`});
    }
    // A paper page lists every published unit, and the withdrawn June 2022 Question 13 is not listed.
    const withdrawn = packs.find(p => p.papers[0].paper_id === 'OCR_H432_2022_JUNE_01').papers[0];
    await page.goto(base + '/#/paper/' + subject + '/' + withdrawn.paper_id);
    await page.waitForSelector('.paper-qs__count');
    assert.match(await page.locator('.paper-qs__count').textContent(), new RegExp(`${withdrawn.question_ids.length} questions`));
    assert.equal(withdrawn.total_marks, 99);
    assert.equal(await page.getByText('Demo content', {exact: true}).count(), 0);

    // A guest can browse without saving learned coverage.
    const guest = await browser.newPage({viewport: {width: 390, height: 900}});
    await guest.goto(base + '/#/practice?subject=' + subject);
    await guest.waitForTimeout(1500);
    const guestLearned = await guest.evaluate(async () => {
      const api = await import('/js/data/api.js');
      return api.getProgress ? (api.getProgress()?.learned_spec_points || []).length : 0;
    }).catch(() => 0);
    assert.equal(guestLearned, 0);
    assert.deepEqual(errors, []);
    console.log(`${packs.length} Chemistry booklets / ${units.length} units; AS ${asUnits}; Year 13 only ${year13}; stems/lead-ins; source+scheme pixels; saved 0/reload; sample label; withdrawn Q13; 4 widths; guest unchanged: PASS`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
