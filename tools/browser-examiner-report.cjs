// Examiner's report button and panel (docs/EXAMINER-REPORTS.md). Server on :5173 (`npm start`).
// Serves a fixture report for 9PH0 October 2020 Paper 2 in place of data/reports, so it
// runs whether or not real reports have been extracted. Checks:
//  - a part's own comment opens under the question, with the "discuss the answers" note;
//  - opening the mark scheme keeps the report open under the scheme (no note there), and
//    closing the scheme keeps it under the question; the panel's × closes it;
//  - a part with no comment says so and offers the general comments;
//  - a sub-part with only a parent-part comment says the comment covers the whole part;
//  - a linked question shows the whole-question comment once, then each part's own;
//  - nothing scrolls sideways at 390 px with the panel open; no page errors.
// Requires optional dev Playwright (PLAYWRIGHT_MODULE) and Chrome (CHROME_PATH).
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const SUBJECT = 'EDX_ALEVEL_PHYS_9PH0';
const PAPER = 'EDX_9PH0_2020_OCTOBER_02';
const id = (q, u) => `${PAPER}_Q${q}_U0${u}`;
const sec = (n, heading, targets, text, extra = {}) => ({id: `s${n}`, heading, targets, pages: [n + 1], paras: [{k: 'p', t: text}], figures: [], ...extra});
const REPORT = {
  format: 'examiner-report-text-v1', paper_id: PAPER, subject_id: SUBJECT,
  source_url: 'https://qualifications.pearson.com/fixture/9PH0_02_pef.pdf', source_sha256: '0'.repeat(64),
  general: {pages: [2], paras: [{k: 'p', t: 'FIXTURE general comment on the paper.'}]},
  sections: [
    sec(1, 'Question 12 (a)', [{q: '12', part: '(a)'}], 'FIXTURE comment on 12(a).', {paras: [{k: 'p', t: 'FIXTURE comment on 12(a).'}, {k: 'li', t: 'FIXTURE bullet'}], figures: [{page: 2, count: 2}]}),
    sec(2, 'Question 14', [{q: '14', part: ''}], 'FIXTURE whole question 14.'),
    sec(3, 'Question 14 (b)(i)', [{q: '14', part: '(b)(i)'}], 'FIXTURE comment on 14(b)(i).'),
    sec(4, 'Question 14 (b)(ii)', [{q: '14', part: '(b)(ii)'}], 'FIXTURE comment on 14(b)(ii).'),
    sec(5, 'Question 15 (c)', [{q: '15', part: '(c)'}], 'FIXTURE comment on 15(c) as a whole. ' + 'Long words wrap: '.repeat(20) + 'https://example.invalid/'.repeat(4)),
  ],
};

(async () => {
  const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.route('**/data/reports/index.json', (route) => route.fulfill({json: {format: 'examiner-report-index-v1', papers: {[PAPER]: {file: `physics/${PAPER}.json`, sections: 5}}}}));
    await page.route(`**/data/reports/physics/${PAPER}.json`, (route) => route.fulfill({json: REPORT}));
    await page.goto(base);
    await page.evaluate(async (s) => { await (await import('/js/data/demo.js')).enterDemoAccount(); await (await import('/js/data/api.js')).setEnrolled(s, true); }, SUBJECT);
    await page.goto(`${base}/#/practice?subject=${SUBJECT}`);
    await page.waitForSelector('[data-reset-filters]');
    await page.locator('[data-reset-filters]').click();
    await page.locator('[data-search]').fill(PAPER);
    await page.locator('[data-search]').press('Enter');
    await page.waitForTimeout(800);
    const goTo = async (selector) => {
      for (let n = 0; n < 6 && !(await page.locator(selector).count()); n++) {
        const next = page.locator('[data-page-next], [data-page]:has-text("Next")').first();
        if (!(await next.count())) break;
        await next.click(); await page.waitForTimeout(300);
      }
      const card = page.locator(selector);
      await card.scrollIntoViewIfNeeded();
      return card;
    };

    // 1. A part's own comment, under the question.
    const a = await goTo(`[data-card="${id(12, 1)}"]`);
    const toggle = a.locator(`.qsplit__side [data-report="${id(12, 1)}"]`);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    const panel = a.locator('.qsplit__main .erpanel');
    await panel.locator('.er-sec').first().waitFor();
    assert.match(await panel.textContent(), /FIXTURE comment on 12\(a\)/);
    assert.equal(await panel.locator('li').count(), 1);
    assert.ok(await panel.locator('.erpanel__warn').isVisible(), 'question view warns that answers are discussed');
    assert.match(await panel.locator('.er-sec__fig a').getAttribute('href'), /#page=2$/);
    assert.equal(await a.locator(`.qsplit__side [data-report="${id(12, 1)}"]`).getAttribute('aria-expanded'), 'true');
    assert.ok(!/FIXTURE whole question 14|14\(b\)/.test(await panel.textContent()), 'no other question\'s comments');

    // 2. Mark scheme opened while the report is open: report stays, under the scheme.
    await a.locator(`[data-scheme="${id(12, 1)}"]`).click();
    await a.locator('.qsplit__main.is-scheme .erpanel .er-sec').waitFor();
    assert.equal(await a.locator('.qsplit__main.is-scheme .erpanel__warn').count(), 0, 'no warning under the scheme');
    const order = await a.locator('.qsplit__main').evaluate((main) => [...main.children].map((c) => c.className.split(' ')[0]));
    assert.equal(order[order.length - 1], 'erpanel', 'report sits below the mark scheme');
    await a.locator(`[data-scheme="${id(12, 1)}"]`).first().click(); // back to question
    await a.locator('.qsplit__main:not(.is-scheme) .erpanel').waitFor();
    await a.locator('.erpanel__close').click();
    assert.equal(await a.locator('.erpanel').count(), 0);
    assert.match(await a.locator(`.qsplit__side [data-report="${id(12, 1)}"]`).textContent(), /^\s*Examiner’s report\s*$/);

    // 3. No comment on this part.
    const b = await goTo(`[data-card="${id(12, 2)}"]`);
    await b.locator(`.qsplit__side [data-report="${id(12, 2)}"]`).click();
    await b.locator('.erpanel .er-general').waitFor();
    assert.match(await b.locator('.erpanel').textContent(), /didn’t comment on this question/);

    // 4. Sub-part with a parent-part comment.
    const c = await goTo(`[data-card="${id(15, 4)}"]`);
    await c.locator(`.qsplit__side [data-report="${id(15, 4)}"]`).click();
    await c.locator('.erpanel .er-sec').waitFor();
    assert.match(await c.locator('.erpanel').textContent(), /comments on this part as a whole/);
    assert.match(await c.locator('.erpanel .er-sec__badge').textContent(), /whole part/);

    // 5. Linked question 14(b)(i)+(ii): whole-question comment once, then each part.
    const group = await goTo(`[data-group^="LINKED_${PAPER}_Q14_"]`);
    const gid = await group.getAttribute('data-group');
    await group.locator(`[data-report="${gid}"]`).first().click();
    await group.locator('.erpanel .er-sec').first().waitFor();
    const text = await group.locator('.erpanel').textContent();
    assert.equal(text.match(/FIXTURE whole question 14/g).length, 1);
    assert.ok(text.indexOf('14(b)(i).') < text.indexOf('14(b)(ii).'));
    await group.locator(`[data-scheme="${gid}"]`).click();
    await group.locator('.qgroup__foot').waitFor();
    assert.equal(await group.locator('.erpanel').count(), 1, 'stays open (once) with the schemes');

    // 6. Phone width: nothing scrolls sideways.
    await page.setViewportSize({width: 390, height: 844});
    await page.waitForFunction(() => document.documentElement.scrollWidth <= 390, null, {timeout: 2000});
    for (const box of await page.locator('.erpanel').all()) {
      const r = await box.boundingBox();
      assert.ok(r.x >= 0 && r.x + r.width <= 391, `panel within the screen (${r.x}, ${r.width})`);
    }
    await page.screenshot({path: process.env.SHOT || '/tmp/examiner-report-390.png', fullPage: false});

    // 7. In a question set the report is hidden until the mark scheme is revealed, then a fold.
    await page.setViewportSize({width: 1280, height: 1000});
    const pick = await goTo(`[data-card="${id(12, 1)}"]`);
    await pick.locator(`[data-select="${id(12, 1)}"]`).check();
    await page.locator('[data-start-set]').click();
    await page.waitForSelector('[data-reveal]');
    assert.equal(await page.locator('.erfold, .erpanel').count(), 0, 'no report while answering');
    await page.locator('[data-reveal]').first().click();
    const fold = page.locator('.erfold').first();
    await fold.waitFor();
    await fold.locator('summary').click();
    await fold.locator('.er-sec').waitFor();
    assert.match(await fold.textContent(), /FIXTURE comment on 12\(a\)/);
    assert.deepEqual(errors, []);
    console.log('examiner report browser check passed');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
