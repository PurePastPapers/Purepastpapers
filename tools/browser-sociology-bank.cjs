// Real AQA Sociology source bank (A level 7192 + AS 7191), isolated demo account/profile.
// Requires Playwright. Run after `tools/sociology/finalize.py --activate`, with `npm start` serving.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const subject = 'AQA_ALEVEL_SOC_7192';
const root = path.join(__dirname, '..');
const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const packs = read('data/packs/index.json').packs.filter(p => p.file.startsWith('sociology/')).map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);

(async () => {
  assert.equal(packs.length, 31, 'Sociology packs are not active in data/packs/index.json');
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

    // The paper filter sits in the compact filter bar's "More" popover.
    const selectPaper = async id => {
      const more = page.locator('[data-section="fpop-more"]').first();
      if (await more.count() && !(await more.evaluate(d => d.open))) await more.locator('summary').first().click();
      await page.locator('[data-filter="paper"]').first().selectOption(id);
    };

    async function loaded(selector) {
      const image = page.locator(selector).first();
      await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(s => {
        const image = document.querySelector(s);
        return image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:');
      }, selector, {timeout: 30000});
    }
    // Paper 2 (route options only) and Paper 3; scheme pixels load.
    const itemPaper = 'AQA_7192_2024_JUNE_02';
    await selectPaper(itemPaper);
    assert.equal(await count(), units.filter(q => q.paper_id === itemPaper).length);
    await loaded('.question-selected-part img');
    await selectPaper('AQA_7192_2025_JUNE_03');
    assert.equal(await count(), units.filter(q => q.paper_id === 'AQA_7192_2025_JUNE_03').length);
    await loaded('.question-selected-part img');
    await page.locator('[data-scheme]').first().click();
    await loaded('.ms img');

    // AS Paper 2 (Families and households route).
    const stemPaper = 'AQA_7191_2025_JUNE_02';
    await selectPaper(stemPaper);
    assert.equal(await count(), units.filter(q => q.paper_id === stemPaper).length);
    await selectPaper('');

    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width, height: 1000});
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `overflow at ${width}`);
      if (process.env.AUDIT_SCREENSHOT_DIR) await page.screenshot({path: `${process.env.AUDIT_SCREENSHOT_DIR}/sociology-${width}.png`});
    }
    // A paper page lists every published part, including every option.
    const sample = packs.find(p => p.papers[0].paper_id === itemPaper).papers[0];
    await page.goto(base + '/#/paper/' + subject + '/' + sample.paper_id);
    await page.waitForSelector('.paper-qs__count');
    assert.match(await page.locator('.paper-qs__count').textContent(), new RegExp(`${sample.question_ids.length} questions`));
    assert.equal(await page.getByText('Demo content', {exact: true}).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`${packs.length} Sociology booklets / ${units.length} units; source+scheme pixels; paper page; 4 widths: PASS`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
