// Real GCSE Mathematics 1MA1 source bank, isolated demo account/profile. Requires optional dev Playwright.
// Checks both tiers are kept apart (tier filter counts), part crops and part schemes load as
// source pixels, and the page fits at phone, tablet and desktop widths.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const subject = 'EDX_GCSE_MATH_1MA1';
const root = path.join(__dirname, '..');
const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const packs = read('data/packs/index.json').packs.filter(p => p.file.startsWith('gcsemaths/')).map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);
const foundation = units.filter(q => q.tier === 'Foundation').length;
const higher = units.filter(q => q.tier === 'Higher').length;

(async () => {
  assert.equal(foundation + higher, units.length);
  const browser = await chromium.launch({headless: true,
    ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
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
    const count = async () => Number((await page.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]);
    assert.equal(await count(), units.length);
    const tier = page.locator('[data-filter="tier"]').first();
    if (!(await tier.isVisible())) await page.locator('summary.fpop__btn', {hasText: 'More'}).first().click();
    await tier.selectOption('Foundation');
    assert.equal(await count(), foundation);
    await tier.selectOption('Higher');
    assert.equal(await count(), higher);
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
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      if (process.env.AUDIT_SCREENSHOT_DIR) await page.screenshot({path: `${process.env.AUDIT_SCREENSHOT_DIR}/gcsemaths-${width}.png`});
    }
    assert.equal(await page.getByText('Demo content', {exact: true}).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`${packs.length} GCSE Maths booklets / ${units.length} units; Foundation ${foundation}; Higher ${higher}; source+scheme pixels; 4 widths: PASS`);
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exit(1);});
