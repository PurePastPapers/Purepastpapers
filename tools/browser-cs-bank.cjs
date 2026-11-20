// Real OCR Computer Science source bank (H446 + AS H046), isolated demo account/profile.
// Requires Playwright. Run after `tools/cs/finalize.py --activate` (packs in the live index), with `npm start` serving.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const {reveal, results} = require('./browser-results.cjs'); // filters in a collapsed panel
const {readFileSync} = require('node:fs');
const path = require('node:path');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const subject = 'OCR_ALEVEL_CS_H446';
const root = path.join(__dirname, '..');
const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const packs = read('data/packs/index.json').packs.filter(p => p.file.startsWith('cs/')).map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);

(async () => {
  assert.equal(packs.length, 22, 'CS packs are not active in data/packs/index.json');
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
    const count = async () => {
      await page.waitForTimeout(250);
      return Number((await page.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]);
    };
    assert.equal(await count(), results(units), 'all units discoverable, demos hidden');

    // Qualification filter: AS H046 only. AUDIT_SKIP_QUALIFICATIONS=1 skips this step (and says
    // so) while the generic filter is missing from main (stale commit c353026).
    if (process.env.AUDIT_SKIP_QUALIFICATIONS) {
      console.log('SKIPPED: AS/A-level qualification filter (AUDIT_SKIP_QUALIFICATIONS)');
    } else {
      await (await reveal(page, '[data-multi="qualifications"][data-value="H046"]')).click();
      assert.equal(await count(), results(units, (q) => q.is_as), 'AS filter');
      await (await reveal(page, '[data-multi="qualifications"][data-value="H046"]')).click();
      assert.equal(await count(), results(units));
    }

    async function loaded(selector) {
      const image = page.locator(selector).first();
      await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(s => {
        const image = document.querySelector(s);
        return image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:');
      }, selector, {timeout: 30000});
    }
    // A paper whose parts carry a code-listing stem and part lead-ins: question, context and scheme pixels load.
    const insertPaper = 'OCR_H446_2024_JUNE_02';
    await (await reveal(page, '[data-filter="paper"]')).selectOption(insertPaper);
    assert.equal(await count(), results(units, (q) => q.paper_id === insertPaper));
    await loaded('.question-selected-part img');
    await loaded('[data-question-resources] img');
    assert(await page.getByText('Unscored context', {exact: false}).count() > 0);
    await page.locator('[data-scheme]').first().click();
    await loaded('.ms img');

    // AS paper: printed introductions (question stems, part lead-ins) are labelled on their parts.
    const fieldPaper = 'OCR_H046_2024_JUNE_01';
    await (await reveal(page, '[data-filter="paper"]')).selectOption(fieldPaper);
    assert.equal(await count(), results(units, (q) => q.paper_id === fieldPaper));
    assert(await page.locator('[data-question-resources] figcaption', {hasText: 'printed introduction'}).count() > 0, 'intro shown');
    await (await reveal(page, '[data-filter="paper"]')).selectOption('');

    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width, height: 1000});
      await page.waitForTimeout(200);
      // layout settles after a resize (js/ui/question-fit.js re-places the answer box)
      await page.waitForFunction((w) => document.documentElement.scrollWidth <= w, width, {timeout: 2000}).catch(() => {});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `overflow at ${width}`);
      if (process.env.AUDIT_SCREENSHOT_DIR) await page.screenshot({path: `${process.env.AUDIT_SCREENSHOT_DIR}/cs-${width}.png`});
    }
    // A paper page lists every published part, including every option.
    const sample = packs.find(p => p.papers[0].paper_id === insertPaper).papers[0];
    await page.goto(base + '/#/paper/' + subject + '/' + sample.paper_id);
    await page.waitForSelector('.paper-qs__count');
    assert.match(await page.locator('.paper-qs__count').textContent(), new RegExp(`${sample.question_ids.length} questions`));
    assert.equal(await page.getByText('Demo content', {exact: true}).count(), 0);
    assert.deepEqual(errors, []);
    console.log(`${packs.length} CS booklets / ${units.length} units; ${process.env.AUDIT_SKIP_QUALIFICATIONS ? 'AS filter SKIPPED' : 'AS filter'}; code stems and lead-ins; source+scheme pixels; paper page; 4 widths: PASS`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
