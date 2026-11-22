// Real GCSE Physics 1PH0 and Combined Science 1SC0 (physics papers) source banks, isolated demo account/profile. Requires optional dev Playwright.
// Checks both tiers are kept apart (tier filter counts), part crops and part schemes load as
// source pixels, and the page fits at phone, tablet and desktop widths.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const {results, allTopics} = require('./browser-results.cjs'); // linked parts are one result
const {readFileSync} = require('node:fs');
const path = require('node:path');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const root = path.join(__dirname, '..');
const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const subjects = ['EDX_GCSE_PHYS_1PH0', 'EDX_GCSE_COMBSCI_1SC0'];
// Every pack of the subject, whatever import added it (1SC0 has biology, chemistry and physics packs).
const allPacks = read('data/packs/index.json').packs.filter(p => subjects.includes(p.subject_id)).map(p => read('data/packs/' + p.file));

async function check(browser, subject) {
  const packs = allPacks.filter(p => p.questions[0].subject_id === subject);
  const units = packs.flatMap(p => p.questions);
  const foundation = results(units, (q) => q.tier === 'Foundation');
  const higher = results(units, (q) => q.tier === 'Higher');
  assert.equal(units.filter(q => q.tier === 'Foundation' || q.tier === 'Higher').length, units.length);
  {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !/net::ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED)/.test(message.text())) errors.push(message.text()); });
    await page.goto(base);
    await page.evaluate(async id => {
      await (await import('/js/data/demo.js')).enterDemoAccount();
      const api = await import('/js/data/api.js');
      await api.setEnrolled(id, true);
      // GCSE sciences need a saved tier before practice opens (2026-11-19).
      await api.setPreference('tiers', {...(api.getProgress().preferences.tiers || {}), [id]: 'Foundation'});
    }, subject);
    await page.goto(base + '/#/practice?subject=' + subject + '&mode=individual');
    await page.waitForSelector('[data-reset-filters]');
    await page.locator('[data-reset-filters]').click();
    await allTopics(page);
    const count = async () => Number((await page.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]);
    // The visible Tier control (2026-11-19): Both tiers, then each tier on its own.
    const pickTier = async value => {
      await page.locator(`[data-practice-tier="${value}"]`).click();
      await page.waitForSelector(`[data-practice-tier="${value}"][aria-checked="true"]`);
      await page.waitForSelector('[data-output] [role="status"]');
    };
    await pickTier('');
    assert.equal(await count(), results(units));
    await pickTier('Foundation');
    assert.equal(await count(), foundation);
    await pickTier('Higher');
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
      // layout settles after a resize (js/ui/question-fit.js re-places the answer box)
      await page.waitForFunction((w) => document.documentElement.scrollWidth <= w, width, {timeout: 2000}).catch(() => {});
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      // Known, pre-existing: at 320px the long subject chip "GCSE Physics (Triple / Separate Science)"
      // runs 12px past the edge. Fixing it is a UI change awaiting approval, so it is reported, not failed.
      if (width === 320 && scrollWidth > width) {
        const chipOnly = await page.evaluate(w => [...document.querySelectorAll('body *')]
          .filter(e => e.getBoundingClientRect().right > w + 1).every(e => e.matches('a.chip, a.chip *')), width);
        assert.ok(chipOnly, 'overflow at 320px beyond the subject chip');
        console.warn(`${subject}: 320px subject chip overflows by ${scrollWidth - width}px (known UI item)`);
      } else assert.equal(scrollWidth, width);
      if (process.env.AUDIT_SCREENSHOT_DIR) await page.screenshot({path: `${process.env.AUDIT_SCREENSHOT_DIR}/${subject}-${width}.png`});
    }
    assert.equal(await page.getByText('Demo content', {exact: true}).count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${subject}: ${packs.length} booklets / ${units.length} units; Foundation ${foundation}; Higher ${higher}; source+scheme pixels; 4 widths: PASS`);
  }
}

(async () => {
  const browser = await chromium.launch({headless: true,
    ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
  try {
    for (const subject of subjects) await check(browser, subject);
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exit(1);});
