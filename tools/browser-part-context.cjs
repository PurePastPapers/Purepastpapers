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
//  - the test builder lists linked parts as one question.
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
    page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED)/.test(m.text())) errors.push(m.text()); }); // offline sandbox: web fonts
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
      await page.goto(`${base}/#/practice?subject=${sample.subject}`);
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

    // Test builder: a Foundation test drawn from the paper starts, and its questions show
    // the part's own crop with the full question available as context only.
    await page.goto(`${base}/#/practice?subject=${SUBJECT}&mode=timed_test`);
    await page.waitForSelector('[data-start-test]');
    const paperOption = page.locator('select[data-filter="paper"] option', {hasText: '1BF'});
    if (await paperOption.count()) {
      await page.locator('select[data-filter="paper"]').selectOption(await paperOption.first().getAttribute('value'));
      await page.waitForTimeout(600);
    }
    const papers = await page.$$eval('select[data-filter="paper"] option', (nodes) => nodes.slice(1).map((n) => n.textContent));
    assert.ok(papers.length && papers.every((text) => /Foundation/.test(text)), 'test builder offers Foundation papers only');
    await page.locator('[data-start-test]').click();
    await page.waitForURL(/#\/session\//, {timeout: 10000});
    await page.waitForFunction(() => {
      const img = document.querySelector('.question-selected-part img');
      return img?.complete && img.naturalWidth > 0;
    });
    const sessionPart = await page.locator('.question-selected-part img').first().getAttribute('data-math-image');
    assert.match(sessionPart, /assets\/gcse(bio|chem|phys)\/EDX_1SC0_\d{4}_[A-Z]+_\dPF|assets\/gcse(bio|chem|phys)\/EDX_1SC0_\d{4}_[A-Z]+_\d[BCP]F/, 'session question comes from a Foundation paper');
    const sessionContext = page.locator('[data-question-context]').first();
    if (await sessionContext.count()) {
      const heading = await page.locator('main').innerText();
      await sessionContext.locator('summary').click();
      await page.waitForFunction(() => document.querySelector('[data-question-context]')?.open);
      await sessionContext.locator('summary').click();
      assert.equal(await page.locator('.question-selected-part img').first().getAttribute('data-math-image'), sessionPart, 'context toggle keeps the question');
      assert.equal((await page.locator('main').innerText()).split('\n')[0], heading.split('\n')[0]);
    }
    for (const width of [390, 1280]) {
      await page.setViewportSize({width, height: 900});
      await page.waitForTimeout(300);
      // the runner's full-bleed backdrop (.runner__top::before) once widened the page
      // layout settles after a resize (js/ui/question-fit.js re-places the answer box)
      await page.waitForFunction((w) => document.documentElement.scrollWidth <= w, width, {timeout: 2000}).catch(() => {});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `session overflows at ${width}`);
    }
    assert.deepEqual(errors, []);
    console.log('1SC0 Foundation Q4(b)(i): own crop, introduction, full-question toggle (no count, scheme or progress change), part scheme; 1PH0 linked parts as one card; Foundation test session: PASS');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
