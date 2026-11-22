// Real AQA GCSE Geography 8035 source bank, isolated demo account/profile.
// Requires Playwright. Run after `tools/gcsegeog/finalize.py --activate` (packs in the live index), with `npm start` serving.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const {reveal, results} = require('./browser-results.cjs'); // filters in a collapsed panel
const {readFileSync} = require('node:fs');
const path = require('node:path');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const subject = 'AQA_GCSE_GEOG_8035';
const root = path.join(__dirname, '..');
const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const packs = read('data/packs/index.json').packs.filter(p => p.file.startsWith('gcsegeog/')).map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);

(async () => {
  assert.equal(packs.length, 20, 'GCSE Geography packs are not active in data/packs/index.json');
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
    await page.goto(base + '/#/practice?subject=' + subject + '&mode=individual');
    await page.waitForSelector('[data-reset-filters]');
    await page.locator('[data-reset-filters]').click();
    const count = async () => {
      await page.waitForTimeout(250);
      return Number((await page.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]);
    };
    assert.equal(await count(), results(units), 'all units discoverable, demos hidden');

    async function loaded(selector) {
      const image = page.locator(selector).first();
      await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(s => {
        const image = document.querySelector(s);
        return image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:');
      }, selector, {timeout: 30000});
    }
    // A Paper 1 booklet whose parts use OS map keys from the insert: question, figure and scheme pixels load.
    const insertPaper = 'AQA_8035_2024_JUNE_01';
    await (await reveal(page, '[data-filter="paper"]')).selectOption(insertPaper);
    assert.equal(await count(), results(units, q => q.paper_id === insertPaper));
    await loaded('.question-selected-part img');
    await loaded('[data-question-resources] img');
    assert(await page.locator('[data-question-resources] figcaption', {hasText: 'from the insert'}).count() > 0, 'insert key labelled');
    await page.locator('[data-scheme]').first().click();
    await loaded('.ms img');

    // A Paper 3 booklet: the resources booklet figures are labelled and load beside the issue-evaluation part.
    const bookletPaper = 'AQA_8035_2024_JUNE_03';
    await (await reveal(page, '[data-filter="paper"]')).selectOption(bookletPaper);
    assert.equal(await count(), results(units, q => q.paper_id === bookletPaper));
    assert(await page.locator('[data-question-resources] figcaption', {hasText: 'from the resources booklet'}).count() > 0, 'resources booklet figure labelled');
    await loaded('[data-question-resources] img');
    await (await reveal(page, '[data-filter="paper"]')).selectOption('');

    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width, height: 1000});
      await page.waitForTimeout(200);
      // layout settles after a resize (js/ui/question-fit.js re-places the answer box)
      await page.waitForFunction(w => document.documentElement.scrollWidth <= w, width, {timeout: 2000}).catch(() => {});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `overflow at ${width}`);
      if (process.env.AUDIT_SCREENSHOT_DIR) await page.screenshot({path: `${process.env.AUDIT_SCREENSHOT_DIR}/gcsegeog-${width}.png`});
    }
    // A paper page lists every published part, including every Section C option.
    const sample = packs.find(p => p.papers[0].paper_id === insertPaper).papers[0];
    await page.goto(base + '/#/paper/' + subject + '/' + sample.paper_id);
    await page.waitForSelector('.paper-qs__count');
    assert.match(await page.locator('.paper-qs__count').textContent(), new RegExp(`${sample.question_ids.length} questions`));
    assert.equal(await page.getByText('Demo content', {exact: true}).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`${packs.length} GCSE Geography booklets / ${units.length} units; insert keys; resources booklet figures; source+scheme pixels; paper page; 4 widths: PASS`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
