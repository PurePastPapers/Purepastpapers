// Real AQA Geography source bank (A level 7037 + AS 7036), isolated demo account/profile.
// Requires Playwright. Run after `tools/geography/finalize.py --activate`, with `npm start` serving.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const subject = 'AQA_ALEVEL_GEOG_7037';
const root = path.join(__dirname, '..');
const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const packs = read('data/packs/index.json').packs.filter(p => p.file.startsWith('geography/')).map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);

(async () => {
  assert.equal(packs.length, 26, 'Geography packs are not active in data/packs/index.json');
  const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base);
    await page.evaluate(async id => {
      await (await import('/js/data/demo.js')).enterDemoAccount();
      await (await import('/js/data/api.js')).setEnrolled(id, true);
    }, subject);
    await page.goto(base + '/#/practice?subject=' + subject);
    await page.waitForSelector('[data-reset-filters]');
    await page.locator('[data-reset-filters]').click();
    const count = async () => {
      await page.waitForTimeout(250);
      return Number((await page.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]);
    };
    assert.equal(await count(), units.length, 'all units discoverable, demos hidden');

    // Qualification filter: AS 7036 only.
    await page.locator('[data-multi="qualifications"][data-value="7036"]').click();
    assert.equal(await count(), units.filter(q => q.is_as).length, 'AS filter');
    await page.locator('[data-multi="qualifications"][data-value="7036"]').click();
    assert.equal(await count(), units.length);

    async function loaded(selector) {
      const image = page.locator(selector).first();
      await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(s => {
        const image = document.querySelector(s);
        return image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:');
      }, selector, {timeout: 30000});
    }
    // An A-level paper whose parts use insert figures: question, figure and scheme pixels load.
    const insertPaper = 'AQA_7037_2024_JUNE_01';
    await page.locator('[data-filter="paper"]').selectOption(insertPaper);
    assert.equal(await count(), units.filter(q => q.paper_id === insertPaper).length);
    await loaded('.question-selected-part img');
    await loaded('[data-question-resources] img');
    assert(await page.getByText('Unscored context', {exact: false}).count() > 0);
    await page.locator('[data-scheme]').first().click();
    await loaded('.ms img');

    // AS fieldwork: the shared scenario is attached to its parts; multiple choice renders.
    const fieldPaper = 'AQA_7036_2024_JUNE_02';
    await page.locator('[data-filter="paper"]').selectOption(fieldPaper);
    assert.equal(await count(), units.filter(q => q.paper_id === fieldPaper).length);
    assert(await page.locator('[data-question-resources] figcaption', {hasText: 'shared introduction'}).count() > 0, 'stem shown');
    await page.locator('[data-filter="paper"]').selectOption('');

    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width, height: 1000});
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `overflow at ${width}`);
      if (process.env.AUDIT_SCREENSHOT_DIR) await page.screenshot({path: `${process.env.AUDIT_SCREENSHOT_DIR}/geography-${width}.png`});
    }
    // A paper page lists every published part, including every option.
    const sample = packs.find(p => p.papers[0].paper_id === insertPaper).papers[0];
    await page.goto(base + '/#/paper/' + subject + '/' + sample.paper_id);
    await page.waitForSelector('.paper-qs__count');
    assert.match(await page.locator('.paper-qs__count').textContent(), new RegExp(`${sample.question_ids.length} questions`));
    assert.equal(await page.getByText('Demo content', {exact: true}).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`${packs.length} Geography booklets / ${units.length} units; AS filter; insert figures; fieldwork stem; source+scheme pixels; paper page; 4 widths: PASS`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
