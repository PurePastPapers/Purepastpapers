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

    // Qualification, year and paper filters live in the "More" dropdown of the filter bar.
    const more = '[data-section="fpop-more"]';
    const openMore = async () => { if (!await page.locator(more + '[open]').count()) await page.locator(more + ' > summary').click(); };
    const pickPaper = async id => {
      await openMore();
      await page.locator('[data-filter="paper"]').selectOption(id);
      await page.keyboard.press('Escape');
    };
    // Qualification filter: AS 7036 only.
    await openMore();
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
    await pickPaper(insertPaper);
    assert.equal(await count(), units.filter(q => q.paper_id === insertPaper).length);
    await loaded('.question-selected-part img');
    await loaded('[data-question-resources] img');
    assert(await page.getByText('Unscored context', {exact: false}).count() > 0);
    await page.locator('[data-scheme]').first().click();
    await loaded('.ms img');

    // AS fieldwork: the shared scenario is attached to its parts; multiple choice renders.
    const fieldPaper = 'AQA_7036_2024_JUNE_02';
    await pickPaper(fieldPaper);
    assert.equal(await count(), units.filter(q => q.paper_id === fieldPaper).length);
    assert(await page.locator('[data-question-resources] figcaption', {hasText: 'introduction and earlier material this part uses'}).count() > 0, 'stem shown');
    await pickPaper('');

    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width, height: 1000});
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `overflow at ${width}`);
      if (process.env.AUDIT_SCREENSHOT_DIR) await page.screenshot({path: `${process.env.AUDIT_SCREENSHOT_DIR}/geography-${width}.png`});
    }
    // Past papers: every booklet is listed, and only the packs of subjects being studied are fetched.
    const fetched = [];
    page.on('request', request => { if (request.url().includes('/data/packs/')) fetched.push(request.url().split('/data/packs/')[1]); });
    await page.setViewportSize({width: 1440, height: 1000});
    await page.goto(base + '/#/papers?subject=' + subject);
    await page.reload();
    await page.waitForSelector('.paper-card');
    const papers = packs.map(p => p.papers[0]);
    const cards = page.locator('.paper-card');
    assert.equal(await cards.count(), papers.length, 'every booklet has a card');
    assert.equal(await page.locator('.banner--warn').count(), 0, 'no load warning');
    // The demo account also studies Maths and Physics; subjects it does not study are never fetched.
    assert.deepEqual(fetched.filter(file => /^(biology|history|politics)\//.test(file)), [], 'packs of other subjects are not fetched');
    assert.equal(fetched.filter(file => file.startsWith('geography/')).length, papers.length);
    // Each card names its qualification; A-level papers come before AS in a series.
    const codes = await page.locator('.paper-card__code').allTextContents();
    assert.equal(codes.filter(code => code.startsWith('A-Level · 7037 · Paper')).length, papers.filter(p => !p.is_as).length);
    assert.equal(codes.filter(code => code.startsWith('AS · 7036 · Paper')).length, papers.filter(p => p.is_as).length);
    assert.match(codes[0], /^A-Level · 7037 · Paper 1/);
    const headings = await page.locator('.paper-group__head h2').allTextContents();
    assert.deepEqual(headings, ['2025', '2024', '2023', '2022', '2021', '2020', 'Official samples']);
    await page.locator('[data-filter="level"][data-value="A-Level"]').click();
    assert.equal(await cards.count(), papers.filter(p => !p.is_as).length, 'A-level filter');
    await page.locator('[data-filter="level"][data-value="AS"]').click();
    assert.equal(await cards.count(), papers.filter(p => p.is_as).length, 'AS filter');
    await page.locator('[data-filter="level"][data-value="all"]').click();
    assert.equal(await cards.count(), papers.length);

    // A paper page lists every published part, including every option, and links its insert.
    const sample = packs.find(p => p.papers[0].paper_id === insertPaper).papers[0];
    await page.goto(base + '/#/paper/' + subject + '/' + sample.paper_id);
    await page.waitForSelector('.paper-qs__count');
    assert.match(await page.locator('.paper-qs__count').textContent(), new RegExp(`${sample.question_ids.length} questions`));
    assert.equal(await page.getByText('Demo content', {exact: true}).count(), 0);
    assert.equal(await page.locator('h1').textContent().then(text => text.trim()), 'A-Level Paper 1: Physical geography');
    assert.equal(await page.locator(`a[href="${sample.insert_pdf_url}"]`).count(), 1, 'insert link');
    assert.deepEqual((await page.locator('.paper-questions__num').allTextContents()).slice(0, 5), ['1.1', '1.2', '1.3', '1.4', '2.1']);
    assert.deepEqual(errors, []);
    console.log(`${packs.length} Geography booklets / ${units.length} units; AS filter; insert figures; fieldwork stem; source+scheme pixels; past papers list; paper page with insert; 4 widths: PASS`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
