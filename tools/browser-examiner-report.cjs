// Examiner's report button and panel (docs/EXAMINER-REPORTS.md). Server on :5173 (`npm start`).
// Serves a fixture report for 9PH0 October 2020 Paper 2 in place of data/reports, so it
// runs whether or not real reports have been extracted. Checks:
//  - a part's own comment opens under the question, with the "discuss the answers" note;
//  - opening the mark scheme keeps the report open under the scheme (no note there), and
//    closing the scheme keeps it under the question; the panel's × closes it;
//  - a part with no comment says so and offers the general comments;
//  - a sub-part with only a parent-part comment says the comment covers the whole part;
//  - a linked question shows the whole-question comment once, then each part's own;
//  - crops can be enlarged, and panels fit phone and tablet widths;
//  - timed sets hide reports until marking, and share one report across linked parts;
//  - PDF-only, missing and wrong-paper report files fall back to the official link.
// Requires optional dev Playwright (PLAYWRIGHT_MODULE) and Chrome (CHROME_PATH).
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.AUDIT_URL || 'http://localhost:5173';
const SUBJECT = 'EDX_ALEVEL_PHYS_9PH0';
const PAPER = 'EDX_9PH0_2020_OCTOBER_02';
const PDF = 'https://qualifications.pearson.com/content/dam/pdf/A-Level/Physics/2015/Exam-materials/9PH0_02_pef_20201217.pdf';
const PACK_FILE = `physics/${PAPER}.json`;
const REPORT_PATH = `/data/reports/physics/${PAPER}.json`;
const PACK = require('../data/packs/index.json').packs.find((entry) => entry.file === PACK_FILE && entry.enabled !== false);
const id = (q, u) => `${PAPER}_Q${q}_U0${u}`;
const PACK_DATA = require(`../data/packs/${PACK_FILE}`);
const TEST_QUESTIONS = new Set([id(12, 1), id(12, 2), id(14, 2), id(14, 3), id(15, 4)]);
const sec = (n, heading, targets, text, extra = {}) => ({id: `s${n}`, heading, targets, pages: [n + 1], paras: [{k: 'p', t: text}], figures: [], ...extra});
const REPORT = {
  format: 'examiner-report-text-v1', paper_id: PAPER, subject_id: SUBJECT,
  source_url: PDF, source_sha256: '0'.repeat(64), source_pages: 10,
  general: {pages: [2], paras: [{k: 'p', t: 'FIXTURE general comment on the paper.'}]},
  sections: [
    sec(1, 'Question 12 (a)', [{q: '12', part: '(a)'}], 'FIXTURE comment on 12(a).', {
      pages: [2, 3],
      paras: [
        {k: 'p', t: 'FIXTURE comment on 12(a).'},
        {k: 'li', t: 'FIXTURE bullet'},
        {k: 'p', t: 'FIXTURE equation para', img: [{src: 'physics/img/FIXTURE_s1_1.webp', w: 600, h: 60}]},
        {k: 'ex', t: 'FIXTURE example comment.'},
        {k: 'tip', t: 'FIXTURE tip.'},
        {k: 'tip', t: 'FIXTURE tip.'},
      ],
      figures: [{page: 2, count: 1}, {page: 3, count: 1}],
    }),
    sec(2, 'Question 14', [{q: '14', part: ''}], 'FIXTURE whole question 14.'),
    sec(3, 'Question 14 (b)(i)', [{q: '14', part: '(b)(i)'}], 'FIXTURE comment on 14(b)(i).'),
    sec(4, 'Question 14 (b)(ii)', [{q: '14', part: '(b)(ii)'}], 'FIXTURE comment on 14(b)(ii).'),
    sec(5, 'Question 15 (c)', [{q: '15', part: '(c)'}], 'FIXTURE comment on 15(c) as a whole. ' + 'Long words wrap: '.repeat(20) + 'https://example.invalid/'.repeat(4)),
  ],
};

async function installFixture(page, mode = 'valid') {
  let requests = 0;
  assert.ok(PACK, 'the fixture uses an active past-paper pack');
  // Keep the five real questions the report fixture exercises, with their original question and scheme assets.
  await page.route('**/data/packs/index.json', (route) => route.fulfill({json: {packs: [PACK]}}));
  await page.route(`**/data/packs/${PACK_FILE}`, (route) => route.fulfill({json: {
    ...PACK_DATA,
    questions: PACK_DATA.questions.filter((question) => TEST_QUESTIONS.has(question.question_id)),
  }}));
  const papers = mode === 'pdf-only' ? {} : {[PAPER]: {file: `physics/${PAPER}.json`, sections: REPORT.sections.length}};
  await page.route('**/data/reports/index.json', (route) => route.fulfill({json: {format: 'examiner-report-index-v1', papers}}));
  await page.route(`**${REPORT_PATH}`, (route) => {
    requests++;
    if (mode === 'missing') return route.fulfill({status: 404});
    if (mode === 'wrong-paper') return route.fulfill({json: {...REPORT, paper_id: 'EDX_9PH0_2020_OCTOBER_01', source_url: 'https://example.invalid/wrong-paper.pdf'}});
    return route.fulfill({json: REPORT});
  });
  return () => requests;
}

async function enterDemo(page) {
  await page.goto(base);
  await page.evaluate(async (subject) => {
    await (await import('/js/data/demo.js')).enterDemoAccount();
    await (await import('/js/data/api.js')).setEnrolled(subject, true);
  }, SUBJECT);
}

async function openPractice(page) {
  await enterDemo(page);
  await page.goto(`${base}/#/practice?subject=${SUBJECT}&mode=individual`);
  await page.locator('[data-reset-filters]').click();
  await page.locator('[data-search]').fill(PAPER);
  await page.locator('[data-search]').press('Enter');
  await page.locator('[data-clear-chip="search"]').filter({hasText: PAPER}).waitFor();
  await page.locator(`[data-card^="${PAPER}"], [data-group^="LINKED_${PAPER}"]`).first().waitFor();
}

async function goTo(page, selector) {
  const card = page.locator(selector);
  for (let n = 0; n < 6 && !(await card.count()); n++) {
    const next = page.locator('[data-page-next], [data-page]:has-text("Next")').first();
    if (!(await next.count()) || !(await next.isEnabled())) break;
    await next.click();
  }
  await card.scrollIntoViewIfNeeded();
  return card;
}

async function assertGroupFeedback(fold) {
  await fold.locator('.er-sec').first().waitFor();
  const text = await fold.innerText();
  assert.equal(text.match(/FIXTURE whole question 14/g)?.length, 1);
  assert.ok(text.includes('14(b)(i).') && text.includes('14(b)(ii).'), 'both parts have their own comments');
  assert.ok(text.indexOf('14(b)(i).') < text.indexOf('14(b)(ii).'), 'comments follow printed part order');
}

async function checkTimedReport(browser) {
  const page = await browser.newPage({reducedMotion: 'reduce'});
  try {
    const requests = await installFixture(page);
    await enterDemo(page);
    const sessionId = await page.evaluate(async ({subjectId, questionIds}) => {
      const {createSession} = await import('/js/data/sessions.js');
      const {saveSession} = await import('/js/data/api.js');
      const session = createSession({
        kind: 'custom_test', subject_id: subjectId, title: 'Linked report test', question_ids: questionIds,
        timer: 'countdown', time_limit_minutes: 10, mark_mode: 'end',
      });
      await saveSession(session, {silent: true});
      return session.session_id;
    }, {subjectId: SUBJECT, questionIds: [id(14, 2), id(14, 3)]});
    await page.goto(`${base}/#/session/${sessionId}`);
    await page.locator('[data-answer]').first().waitFor();
    assert.equal(await page.locator('.erfold, .erpanel').count(), 0, 'timed answers have no report controls');
    assert.equal(requests(), 0);

    await page.locator('[data-finish]').first().click();
    await page.getByRole('dialog').getByRole('button', {name: 'Finish', exact: true}).click();
    const fold = page.locator('.erfold');
    await fold.first().waitFor();
    assert.equal(await fold.count(), 1, 'linked parts share a report during marking');
    assert.equal(await fold.locator('.er-sec').count(), 0, 'a closed fold has no rendered feedback');
    assert.equal(requests(), 0, 'a closed marking fold does not request report data');
    await fold.locator(':scope > summary').click();
    await assertGroupFeedback(fold);
    assert.equal(requests(), 1, 'opening the fold makes one report request');

    const marks = page.locator('.markcard [data-nudge="1"]');
    assert.equal(await marks.count(), 2, 'each linked part can be marked independently');
    for (const button of await marks.all()) await button.click();
    await page.locator('[data-save-results]').click();
    const review = page.locator('.review-card');
    await review.waitFor();
    const reviewFold = review.locator('.erfold');
    assert.equal(await reviewFold.count(), 1, 'linked parts share a report during review');
    const questionFold = review.locator('details.fold--row').filter({has: page.locator('.erfold')});
    if (await questionFold.count() && await questionFold.getAttribute('open') === null) await questionFold.locator(':scope > summary').click();
    await reviewFold.locator(':scope > summary').click();
    await assertGroupFeedback(reviewFold);
    assert.equal(requests(), 1, 'review reuses the already loaded report');
  } finally {
    await page.close();
  }
}

async function checkPdfFallback(browser, mode) {
  const page = await browser.newPage({reducedMotion: 'reduce'});
  try {
    const requests = await installFixture(page, mode);
    await openPractice(page);
    const card = await goTo(page, `[data-card="${id(12, 1)}"]`);
    await card.getByRole('button', {name: 'Examiner’s report', exact: true}).click();
    const report = card.locator('.erpanel');
    const source = report.getByRole('link', {name: /Open (?:the full report|page \d+)/});
    await source.waitFor();
    assert.equal((await source.getAttribute('href')).split('#')[0], PDF, `${mode} uses the paper's official link`);
    assert.doesNotMatch(await report.innerText(), /FIXTURE|wrong-paper\.pdf/);
    assert.equal(requests(), mode === 'pdf-only' ? 0 : 1);
    await card.locator('[data-scheme]').click();
    await card.locator('.qsplit__main.is-scheme .erpanel').waitFor();
    assert.ok(await source.isVisible(), `${mode} remains available with the mark scheme`);
    if (mode === 'pdf-only') {
      const group = await goTo(page, `[data-group^="LINKED_${PAPER}_Q14_"]`);
      await group.getByRole('button', {name: 'Examiner’s report', exact: true}).click();
      const groupSource = group.locator('.erpanel').getByRole('link', {name: 'Open the full report'});
      assert.equal(await groupSource.getAttribute('href'), PDF, 'linked questions have the same PDF-only control');
      assert.equal(requests(), 0);
    }
  } finally {
    await page.close();
  }
}

async function checkPracticeReport(browser) {
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}, reducedMotion: 'reduce'});
  try {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await installFixture(page);
    // A 1x1 WebP for the equation crop.
    await page.route('**/data/reports/physics/img/*.webp', (route) => route.fulfill({contentType: 'image/webp', body: Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64')}));
    await openPractice(page);

    // 1. A part's own comment, under the question.
    const a = await goTo(page, `[data-card="${id(12, 1)}"]`);
    const toggle = a.locator(`.qsplit__side [data-report="${id(12, 1)}"]`);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.press('Enter');
    const panel = a.locator('.qsplit__main .erpanel');
    await panel.locator('.er-sec').first().waitFor();
    assert.equal(await page.locator(':focus').getAttribute('aria-label'), 'Close the examiner’s report');
    assert.match(await panel.textContent(), /FIXTURE comment on 12\(a\)/);
    assert.equal(await panel.locator('.er-sec > ul > li').count(), 1);
    assert.ok(await panel.locator('.erpanel__warn').isVisible(), 'question view warns that answers are discussed');
    const responses = panel.locator('details.er-ex a');
    assert.deepEqual(await responses.evaluateAll((links) => links.map((link) => link.href)), [`${PDF}#page=2`, `${PDF}#page=3`]);
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
    assert.equal(await page.locator(':focus').getAttribute('data-report'), id(12, 1));
    assert.match(await a.locator(`.qsplit__side [data-report="${id(12, 1)}"]`).textContent(), /^\s*Examiner’s report\s*$/);

    // 2b. Tips once, example comments folded, equation paragraph as an image with its text as alt.
    await a.locator(`.qsplit__side [data-report="${id(12, 1)}"]`).click();
    await a.locator('.erpanel .er-sec').first().waitFor();
    assert.equal(await a.locator('.erpanel .er-tip').count(), 1, 'duplicate tips shown once');
    assert.equal(await a.locator('.erpanel details.er-ex').count(), 1);
    assert.ok(!(await a.locator('.erpanel details.er-ex li').isVisible()), 'example comments start folded');
    assert.equal(await a.locator('.erpanel img.er-crop').getAttribute('alt'), 'FIXTURE equation para');
    assert.ok(!/FIXTURE equation para/.test(await a.locator('.erpanel .erpanel__body').innerText()), 'crop replaces the garbled text');
    await a.locator('.erpanel').getByRole('button', {name: 'Enlarge the examiner’s comment'}).click();
    const zoom = page.getByRole('dialog', {name: /Examiner’s report/});
    await zoom.locator('img.er-crop').waitFor();
    assert.ok(await zoom.locator('img.er-crop').evaluate((image) => image.decode().then(() => image.naturalWidth > 0)));
    await zoom.getByRole('button', {name: 'Zoom in'}).click();
    assert.equal(await zoom.locator('[data-zoom-reset]').innerText(), '125%');
    await zoom.getByRole('button', {name: 'Close', exact: true}).click();
    await a.locator('.erpanel__close').click();

    // 3. No comment on this part.
    const b = await goTo(page, `[data-card="${id(12, 2)}"]`);
    await b.locator(`.qsplit__side [data-report="${id(12, 2)}"]`).click();
    await b.locator('.erpanel .er-general').waitFor();
    assert.match(await b.locator('.erpanel').textContent(), /didn’t comment on this question/);

    // 4. Sub-part with a parent-part comment.
    const c = await goTo(page, `[data-card="${id(15, 4)}"]`);
    await c.locator(`.qsplit__side [data-report="${id(15, 4)}"]`).click();
    await c.locator('.erpanel .er-sec').waitFor();
    assert.match(await c.locator('.erpanel').textContent(), /comments on this part as a whole/);
    assert.match(await c.locator('.erpanel .er-sec__badge').textContent(), /whole part/);

    // 5. Linked question 14(b)(i)+(ii): whole-question comment once, then each part.
    const group = await goTo(page, `[data-group^="LINKED_${PAPER}_Q14_"]`);
    const gid = await group.getAttribute('data-group');
    await group.locator(`[data-report="${gid}"]`).first().click();
    await assertGroupFeedback(group.locator('.erpanel'));
    await group.locator(`[data-scheme="${gid}"]`).click();
    await group.locator('.qgroup__foot').waitFor();
    assert.equal(await group.locator('.erpanel').count(), 1, 'stays open (once) with the schemes');

    // 6. Phone and tablet widths: nothing scrolls sideways.
    for (const width of [768, 390]) {
      await page.setViewportSize({width, height: 844});
      await page.waitForFunction((available) => document.documentElement.scrollWidth <= available, width, {timeout: 2000});
      for (const box of await page.locator('.erpanel').all()) {
        const r = await box.boundingBox();
        assert.ok(r.x >= 0 && r.x + r.width <= width + 1, `panel within ${width}px screen (${r.x}, ${r.width})`);
      }
    }
    await page.screenshot({path: process.env.SHOT || '/tmp/examiner-report-390.png', fullPage: false});

    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

async function checkQuestionSet(browser) {
  const page = await browser.newPage({reducedMotion: 'reduce'});
  try {
    await installFixture(page);
    await openPractice(page);
    // In a mark-as-you-go set the report is hidden until the mark scheme is revealed.
    const pick = await goTo(page, `[data-card="${id(12, 1)}"]`);
    await pick.locator(`[data-select="${id(12, 1)}"]`).click();
    await page.locator('[data-start-set]').click();
    await page.waitForSelector('[data-reveal]');
    assert.equal(await page.locator('.erfold, .erpanel').count(), 0, 'no report while answering');
    await page.locator('[data-reveal]').first().click();
    const fold = page.locator('.erfold').first();
    await fold.waitFor();
    await fold.locator(':scope > summary').click();
    await fold.locator('.er-sec').waitFor();
    assert.match(await fold.textContent(), /FIXTURE comment on 12\(a\)/);
  } finally {
    await page.close();
  }
}

(async () => {
  const checks = [
    ['Practice and zoom', checkPracticeReport],
    ['question set', checkQuestionSet],
    ['timed marking and review', checkTimedReport],
    ...['pdf-only', 'wrong-paper', 'missing'].map((mode) => [mode, (browser) => checkPdfFallback(browser, mode)]),
  ];
  for (const [name, check] of checks) {
    const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
    try {
      await check(browser);
      console.log(`examiner report browser check passed for ${name}`);
    } finally {
      await browser.close();
    }
  }
})().catch((error) => { console.error(error); process.exit(1); });
