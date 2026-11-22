// GCSE science part display (audit 2026-11-19). Server on :5173 (`npm start`).
// Reported: Combined Science Q4(a)/(b) parts showed earlier parts (their answer lines and
// marks) above the selected part, so an unselected sibling looked like the task.
//  - an independent part shows its own crop, an introduction with no other part's tariff,
//    and a "Show full question for context" control that opens and closes;
//  - opening or closing the full question changes nothing else: result count, open
//    scheme, attempts and saved progress stay the same;
//  - a part that builds on an earlier answer is shown with it as one linked question;
//  - a Foundation part's scheme is its own part's rows (tier-specific scheme), with the
//    whole-question scheme available separately;
//  - the test builder, active test, marking and review keep linked parts in one card.
// Requires optional dev Playwright (PLAYWRIGHT_MODULE) and Chrome (CHROME_PATH).
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const root = path.join(__dirname, '..');
const read = (file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
const SUBJECT = 'EDX_GCSE_COMBSCI_1SC0';
const PAPER = 'EDX_1SC0_2023_JUNE_1BF';
const pack = read(`data/packs/gcsebio/${PAPER}.json`);
const q4 = pack.questions.filter((q) => q.parent_question_id === `${PAPER}_Q04`);
const independent = q4.find((q) => q.part_label === '(b)(i)');
assert.ok(independent && !independent.depends_on_question_ids, 'Q4(b)(i) is an independent part');
const LINKED = [
  {subject: 'EDX_GCSE_PHYS_1PH0', tier: 'Higher', paper: 'EDX_1PH0_2025_JUNE_1H', question: 'Q10', marks: 2},
  {subject: 'EDX_GCSE_PHYS_1PH0', tier: 'Foundation', paper: 'EDX_1PH0_2022_JUNE_2F', question: 'Q04', marks: 3},
  {subject: SUBJECT, tier: 'Foundation', paper: 'EDX_1SC0_2022_JUNE_2PF', question: 'Q02', marks: 3},
];

(async () => {
  const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      const authCdnUnavailable = message.location().url.startsWith('https://esm.sh/@supabase/supabase-js@')
        && text.includes('net::ERR_EMPTY_RESPONSE');
      // The disposable profile works offline when the optional sign-in module is unavailable.
      if (!authCdnUnavailable && !/net::ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED)/.test(text)) errors.push(text);
    });
    await page.goto(base);
    await page.evaluate(async (id) => {
      await (await import('/js/data/demo.js')).enterDemoAccount();
      const api = await import('/js/data/api.js');
      await api.setEnrolled(id, true);
      await api.setPreference('tiers', {...(api.getProgress().preferences.tiers || {}), [id]: 'Foundation'});
    }, SUBJECT);
    const progressBefore = await page.evaluate(async () => JSON.stringify((await import('/js/data/api.js')).getProgress().question_attempts || []));
    await page.goto(`${base}/#/practice?subject=${SUBJECT}`);
    await page.waitForSelector('[data-reset-filters]');
    await page.locator('[data-reset-filters]').click();
    await page.locator('[data-search]').fill(PAPER);
    await page.locator('[data-search]').press('Enter');
    await page.waitForTimeout(800);
    const count = async () => Number((await page.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]);
    const before = await count();
    const card = page.locator(`[data-card="${independent.question_id}"]`);
    await card.scrollIntoViewIfNeeded();
    // the part's own crop and an introduction labelled unscored
    await page.waitForFunction((id) => {
      const img = document.querySelector(`[data-card="${id}"] .question-selected-part img`);
      return img?.complete && img.naturalWidth > 0 && img.src.startsWith('blob:');
    }, independent.question_id);
    assert.match(await card.locator('.question-selected-part img').getAttribute('data-math-image'), /Q04_U02\.webp$/);
    assert.equal(await card.locator('.question-resources').count(), 1);
    assert.match(await card.innerText(), /Part \(b\)\(i\) only · 2 marks/);
    // full question: closed, opens, closes; nothing else changes. The mark scheme takes the
    // question's place ("Back to question"), and coming back keeps the context as it was.
    const details = card.locator('[data-question-context]');
    assert.equal(await details.evaluate((d) => d.open), false);
    const summary = () => page.locator(`[data-card="${independent.question_id}"] [data-question-context] summary`);
    const isOpen = () => page.evaluate((id) => !!document.querySelector(`[data-card="${id}"] [data-question-context]`)?.open, independent.question_id);
    await summary().click();
    await page.waitForFunction((id) => document.querySelector(`[data-card="${id}"] [data-question-context]`)?.open, independent.question_id);
    await page.waitForFunction((id) => {
      const img = document.querySelector(`[data-card="${id}"] [data-question-context] img`);
      return img?.complete && img.naturalWidth > 0;
    }, independent.question_id);
    assert.equal(await count(), before);
    assert.match(await page.locator(`[data-card="${independent.question_id}"] .question-selected-part img`).getAttribute('data-math-image'), /Q04_U02\.webp$/);
    // the part scheme is this part's own rows; the whole-question scheme is separate
    await page.locator(`[data-card="${independent.question_id}"] [data-scheme]`).click();
    await page.waitForSelector(`[data-card="${independent.question_id}"] .ms img`);
    assert.equal(independent.scheme_scope, 'part');
    assert.match(await page.locator(`[data-card="${independent.question_id}"] .ms img`).first().getAttribute('data-math-image'), /Q04_U02_scheme\.webp$/);
    assert.equal(await page.locator(`[data-card="${independent.question_id}"] [data-full-scheme]`).count(), 1);
    assert.equal(await count(), before);
    await page.locator(`[data-card="${independent.question_id}"] [data-scheme]`).click();
    await page.waitForSelector(`[data-card="${independent.question_id}"] .question-selected-part img`);
    assert.equal(await isOpen(), true, 'context stays open after viewing the scheme');
    assert.match(await page.locator(`[data-card="${independent.question_id}"] .question-selected-part img`).getAttribute('data-math-image'), /Q04_U02\.webp$/);
    await summary().click();
    await page.waitForFunction((id) => !document.querySelector(`[data-card="${id}"] [data-question-context]`)?.open, independent.question_id);
    assert.equal(await count(), before);
    const progressAfter = await page.evaluate(async () => JSON.stringify((await import('/js/data/api.js')).getProgress().question_attempts || []));
    assert.equal(progressAfter, progressBefore, 'opening context or a scheme records no attempt');
    // In these official papers (a)(ii) asks for a reason for the answer to (a)(i).
    // Their independent (b) and later parts remain available as separate cards.
    for (const sample of LINKED) {
      await page.evaluate(async ({subject, tier}) => {
        const api = await import('/js/data/api.js');
        await api.setEnrolled(subject, true);
        await api.setPreference('tiers', {...(api.getProgress().preferences.tiers || {}), [subject]: tier});
      }, sample);
      const sampleUrl = `${base}/#/practice?subject=${sample.subject}`;
      if (page.url() === sampleUrl) await page.reload();
      else await page.goto(sampleUrl);
      await page.waitForSelector('[data-reset-filters]');
      await page.locator('[data-reset-filters]').click();
      await page.locator('[data-search]').fill(sample.paper);
      await page.locator('[data-search]').press('Enter');
      await page.waitForTimeout(800);
      const parent = `${sample.paper}_${sample.question}`;
      const expected = [`${parent}_U01`, `${parent}_U02`];
      const group = page.locator(`[data-group="LINKED_${expected[0]}"]`);
      const independentSibling = page.locator(`[data-card="${parent}_U03"]`);
      // The paper may list the linked group and the sibling on different result pages.
      let sawGroup = false;
      let sawSibling = false;
      for (let turn = 0; turn <= 5; turn += 1) {
        if (await group.count()) {
          assert.equal(await group.count(), 1);
          const show = group.getByRole('button', {name: 'Show question', exact: true});
          if (await show.count()) await show.click();
          assert.deepEqual(await group.locator('textarea[data-answer]').evaluateAll(nodes => nodes.map(node => node.dataset.answer)), expected);
          assert.equal(await group.locator('.marks-pill').textContent(), `${sample.marks} marks`);
          for (const id of expected) assert.equal(await page.locator(`[data-card="${id}"]`).count(), 0, `${id} is not offered alone`);
          sawGroup = true;
        }
        sawSibling ||= (await independentSibling.count()) === 1;
        if (sawGroup && sawSibling) break;
        const next = page.getByRole('button', {name: 'Next', exact: true});
        if (!(await next.count()) || await next.isDisabled()) break;
        await next.click();
        await page.waitForTimeout(600);
      }
      assert.ok(sawGroup && sawSibling, `${parent} shows a two-part linked card and an independent sibling`);
    }

    // Build a deterministic Foundation test with Q2(a)(i)–(a)(ii) and the independent (b)(i).
    const {paper, question, marks} = LINKED.at(-1);
    const parent = `${paper}_${question}`;
    const parts = [`${parent}_U01`, `${parent}_U02`];
    const sibling = `${parent}_U03`;
    await page.goto(`${base}/#/practice?subject=${SUBJECT}&mode=timed_test`);
    await page.locator('[data-practice-science=Physics]').click();
    await page.locator('[data-practice-science=Physics][aria-checked=true]').waitFor();
    const covered = page.locator('[data-covered]');
    if (await covered.isChecked()) await covered.uncheck({force: true});
    const paperFilter = page.locator('select[data-filter=paper]');
    const closedPaperFilters = page.locator('details.filter-details:not([open]) summary', {hasText: 'Paper filters'});
    if (await closedPaperFilters.count()) await closedPaperFilters.click();
    const papers = (await paperFilter.locator('option').allTextContents()).slice(1);
    assert.ok(papers.length && papers.every((text) => /Foundation/.test(text)), 'test builder offers Foundation papers only');
    await paperFilter.selectOption(paper);
    await page.locator('[data-tree-bulk=none]').click();
    for (const point of ['12.9', '12.3', '12.2', '12.6']) {
      await page.locator('[data-tree-search]').fill(point);
      await page.locator(`[data-point="EDX_GCSE_COMBSCI_PHYS_${point}"]`).check();
    }
    await page.locator('[data-topic-coverage=strict]').check();
    const preview = page.locator('.testlist li');
    assert.equal(await preview.count(), 2);
    assert.equal(await preview.filter({hasText: /2 linked parts\s+.+3 marks/s}).count(), 1);
    await page.locator('[data-start-test]').click();
    await page.waitForURL(/#\/session\//, {timeout: 10000});
    const group = page.locator('article.qgroup').filter({has: page.locator(`[data-answer="${parts[0]}"]`)});
    await group.waitFor();
    assert.deepEqual(await group.locator('[data-answer]').evaluateAll(nodes => nodes.map(node => node.dataset.answer)), parts);
    assert.equal(await group.locator('.marks-pill').textContent(), `${marks} marks`);
    const standalone = page.locator('.runner__item').filter({has: page.locator(`[data-answer="${sibling}"]`)});
    const sessionCrop = standalone.locator('.question-selected-part img');
    const sessionPart = await sessionCrop.getAttribute('data-math-image');
    assert.match(sessionPart, new RegExp(`${paper}/Q02_U03\\.webp$`));
    await sessionCrop.scrollIntoViewIfNeeded();
    await page.waitForFunction((src) => {
      const img = document.querySelector(`img[data-math-image="${src}"]`);
      return img?.complete && img.naturalWidth > 0;
    }, sessionPart);
    const sessionContext = standalone.locator('[data-question-context]');
    if (await sessionContext.count()) {
      await sessionContext.locator('summary').click();
      assert.equal(await sessionContext.evaluate(details => details.open), true);
      await sessionContext.locator('summary').click();
      assert.equal(await sessionCrop.getAttribute('data-math-image'), sessionPart, 'context toggle keeps the selected part');
    }
    for (const width of [390, 1280]) {
      await page.setViewportSize({width, height: 900});
      await page.waitForTimeout(300);
      // the runner's full-bleed backdrop (.runner__top::before) once widened the page
      // layout settles after a resize (js/ui/question-fit.js re-places the answer box)
      await page.waitForFunction((w) => document.documentElement.scrollWidth <= w, width, {timeout: 2000}).catch(() => {});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `session overflows at ${width}`);
    }

    const responses = ['First part answer', 'Second part answer'];
    for (const [index, id] of parts.entries()) await group.locator(`[data-answer="${id}"]`).fill(responses[index]);
    await page.locator('.runner__end [data-finish]').click();
    await page.getByRole('dialog').getByRole('button', {name: 'Finish', exact: true}).click();
    const field = (id) => page.locator(`[data-markbox="${id}"]`);
    const marking = page.locator('article.markcard').filter({has: field(parts[0])}).filter({has: field(parts[1])});
    await marking.waitFor();
    assert.equal(await page.locator('article.markcard').count(), 2);
    assert.equal(await marking.locator('.marks-pill').textContent(), '3 marks');
    assert.deepEqual(await marking.locator('[data-marks]').evaluateAll(nodes => nodes.map(node => node.dataset.marks)), parts);
    const schemeSuffixes = await marking.locator('.ms img').evaluateAll(nodes => nodes.map(node => node.dataset.mathImage.split('/').at(-1)));
    assert.deepEqual(schemeSuffixes, ['Q02_U01_scheme.webp', 'Q02_U02_scheme.webp']);
    assert.deepEqual(await marking.locator('.answer-text').allTextContents(), responses);
    await field(parts[0]).locator('[data-pick="1"]').click();
    await field(parts[1]).locator('[data-pick-range]').fill('2');
    await field(sibling).locator('[data-pick="1"]').click();
    await page.locator('[data-save-results]').click();
    assert.match(await page.locator('.result-hero__score').innerText(), /4\s*\/\s*4/);
    const review = page.locator('.review-card > details').filter({has: page.locator('img[data-math-image$="Q02_U01_scheme.webp"]')});
    assert.equal(await review.count(), 1);
    await review.locator(':scope > summary').click();
    assert.equal(await review.locator('.review-card__marks').textContent(), '3/3');
    assert.deepEqual(await review.locator('.answer-text').allTextContents(), responses);
    assert.equal(await review.locator('.ms img').count(), 2);
    assert.deepEqual(errors, []);
    console.log('1SC0 Foundation Q4(b)(i) standalone crop, context and scheme; 1PH0 linked Practice cards; 1SC0 2PF linked test preview, active session, marking and review: PASS');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
