// Real Physics source bank, isolated demo account/profile. Requires optional dev Playwright.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const {results, allTopics, reveal} = require('./browser-results.cjs'); // linked parts are one result
const {readFileSync} = require('node:fs');
const path = require('node:path');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const subject = 'EDX_ALEVEL_PHYS_9PH0';
const root = path.join(__dirname, '..');
const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const packs = read('data/packs/index.json').packs.filter(p => p.file.startsWith('physics/')).map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);
const asUnits = results(units, (q) => q.is_as);
const year13 = results(units, (q) => q.introduced_year === 13);

(async () => {
  const browser = await chromium.launch({headless: true,
    ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !/net::ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED)/.test(message.text())) errors.push(message.text()); });
    await page.goto(base);
    await page.evaluate(async () => (await import('/js/data/demo.js')).enterDemoAccount());
    await page.goto(base + '/#/practice?subject=' + subject);
    await page.waitForSelector('[data-reset-filters]');
    await page.locator('[data-reset-filters]').click();
    await allTopics(page);
    const count = async () => Number((await page.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]);
    assert.equal(await count(), results(units));
    assert.equal(await page.locator('[data-multi="qualifications"][data-value="9PH0"]').count(), 1);
    assert.equal(await page.locator('[data-multi="qualifications"][data-value="8PH0"]').count(), 1);
    await (await reveal(page, '[data-curriculum-year]')).selectOption('13');
    await page.locator('[data-year13-only]').check();
    assert.equal(await count(), year13);
    await page.locator('[data-year13-only]').uncheck();
    await (await reveal(page, '[data-curriculum-year]')).selectOption('12');
    assert.equal(await count(), results(units, (q) => q.introduced_year !== 13));
    await page.locator('[data-reset-filters]').click();
    await (await reveal(page, '[data-multi="qualifications"][data-value="8PH0"]')).click();
    assert.equal(await count(), asUnits);
    await page.locator('[data-reset-filters]').click();
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
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width, height: 1000});
      // layout settles after a resize (js/ui/question-fit.js re-places the answer box)
      await page.waitForFunction((w) => document.documentElement.scrollWidth <= w, width, {timeout: 2000}).catch(() => {});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      if (process.env.AUDIT_SCREENSHOT_DIR) await page.screenshot({path: `${process.env.AUDIT_SCREENSHOT_DIR}/physics-${width}.png`});
    }
    assert.equal(await page.getByText('Demo content', {exact: true}).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`${packs.length} Physics booklets / ${units.length} units; AS ${asUnits}; Year 13 only ${year13}; source+scheme pixels; 4 widths: PASS`);
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exit(1);});
