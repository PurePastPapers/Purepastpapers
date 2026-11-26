const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {allTopics, pickMark, reveal} = require('./browser-results.cjs');

const base = (process.env.AUDIT_URL || 'http://localhost:5173').replace(/\/$/, '');
const subject = 'OCR_L3_IT_AAQ';
const papersUrl = `${base}/#/papers?subject=${subject}`;
const paperUrl = unit => `${base}/#/paper/${subject}/OCR_${unit}_SAMPLE`;
const practiceUrl = mode => `${base}/#/practice?subject=${subject}&mode=${mode}`;

async function image(locator) {
  await locator.waitFor();
  await locator.evaluate(async element => {
    await element.decode();
    if (!element.naturalWidth) throw new Error('Source image did not render');
  });
}

async function reviewTest(page) {
  assert.equal(await page.locator('.ms img, .qview--scheme').count(), 0);
  await page.locator('[data-finish]').first().click();
  await page.getByRole('dialog').getByRole('button', {name: 'Finish', exact: true}).click();
  await page.getByRole('heading', {name: 'Mark your answers', exact: true}).waitFor();
  const marks = page.locator('.markcard [data-markpick]');
  const count = await marks.count();
  assert(count > 0);
  await image(page.locator('.markcard .ms img').first());
  for (const picker of await marks.all()) {
    const zero = picker.locator('[data-pick="0"]');
    if (await zero.count()) await zero.click();
    else await picker.locator('[data-pick-range]').fill('0');
  }
  assert.match(await page.locator('[data-markbar]').innerText(), new RegExp(`${count} of ${count} marked`));
  await page.locator('[data-save-results]').click();
  await page.locator('.result-hero__score').waitFor();
  assert.equal(await page.locator('.grade-stamp').count(), 0);
  await page.getByRole('heading', {name: 'Review', exact: true}).waitFor();
  assert(await page.locator('.review-card').count() > 0);
}

async function checkWidth(page, width) {
  await page.waitForFunction(expected => document.documentElement.scrollWidth <= expected + 1, width);
}

async function checkExport(page, card) {
  await card.locator('[data-select]').check({force: true});
  await page.locator('[data-export-test="selection"]').click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('[name="kind"]').selectOption('question');
  await dialog.getByRole('button', {name: 'Prepare PDF'}).click();
  const handoff = page.locator('a[data-pdf-handoff][download]').first();
  await handoff.waitFor({timeout: 60000});
  assert.match(await handoff.getAttribute('download'), /-question\.pdf$/);
  const pdf = await handoff.evaluate(async anchor => new TextDecoder('latin1').decode(await (await fetch(anchor.href)).arrayBuffer()));
  assert(pdf.startsWith('%PDF-'));
  assert(!/Mark scheme|mark.scheme/i.test(pdf));
  await page.keyboard.press('Escape');
}

async function run(browser, width) {
  const context = await browser.newContext({viewport: {width, height: 920}});
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    await context.route(/https:\/\/esm\.sh\/@supabase\/supabase-js@2\?bundle/, route => route.fulfill({
      contentType: 'application/javascript',
      headers: {'access-control-allow-origin': '*'},
      body: 'export function createClient(){return {auth:{getSession:async()=>({data:{session:null},error:null})}}}',
    }));
    await page.goto(base);
    await page.evaluate(async id => {
      await (await import('/js/data/demo.js')).enterDemoAccount();
      const api = await import('/js/data/api.js');
      await api.setEnrolled(id, true);
      const bundle = await (await import('/js/data/content-repository.js')).getBundle(id);
      const points = bundle.spec.sections.flatMap(section => section.topics.flatMap(topic => topic.points.map(point => point.id)));
      await api.setLearned(points, true);
    }, subject);

    await page.goto(papersUrl);
    await page.getByRole('heading', {name: 'Official samples', exact: true}).waitFor();
    const f200 = page.locator('.paper-card').filter({hasText: 'Fundamentals of data analytics'});
    const f201 = page.locator('.paper-card').filter({hasText: 'Big data and machine learning'});
    await f200.waitFor();
    await f201.waitFor();
    await page.locator('[data-filter="qualification"][data-value="H019"]').click();
    await f201.waitFor({state: 'detached'});
    assert.equal(await f200.count(), 1);
    const references = page.getByRole('region', {name: 'Coursework and teacher references'});
    assert.equal(await references.getByRole('link').count(), 7);
    assert.match(await references.getByRole('link', {name: /F205/}).getAttribute('href'), /\.zip$/);
    assert.match(await references.getByRole('link', {name: /F201 annotated/}).getAttribute('href'), /722887/);
    await checkWidth(page, width);

    for (const [unit, id, expected] of [
      ['F200', 'OCR_F200_SAMPLE_Q02_a', /pizza-sales table/],
      ['F201', 'OCR_F201_SAMPLE_Q01_c', /loyalty records/],
    ]) {
      await page.goto(paperUrl(unit));
      assert.match(await page.locator('.paper-qs__count').innerText(), /60 of 60 marks/);
      const button = page.locator(`[data-open="${id}"]`);
      assert.match(await button.locator('xpath=ancestor::li').innerText(), expected);
      await button.click();
      await page.waitForURL('**/#/session/**');
      await image(page.locator('img[data-math-image$="_question.webp"]').first());
      await image(page.locator('img[data-math-image*="/context_"]').first());
      assert.equal(await page.locator('.ms img, .qview--scheme').count(), 0);
      await checkWidth(page, width);
    }

    await page.goto(practiceUrl('individual'));
    await page.locator('[data-reset-filters]').waitFor();
    await allTopics(page);
    const routeFilter = '[data-multi="qualifications"][data-value="H019"]';
    await (await reveal(page, routeFilter)).click();
    await page.locator('[data-filter="paper"]').first().selectOption('OCR_F200_SAMPLE');
    const card = page.locator('[data-card="OCR_F200_SAMPLE_Q01_W"]');
    await card.waitFor();
    assert.equal(await page.locator('[data-card^="OCR_F201"]').count(), 0);
    const open = card.locator('[data-open]');
    if (await open.count() && await open.getAttribute('aria-expanded') === 'false') await open.click();
    await image(card.locator('img[data-math-image$="_question.webp"]').first());
    await card.locator('[data-answer]').fill('Raw facts and figures.');
    await card.locator('[data-scheme]').click();
    await image(card.locator('.ms img').first());
    await pickMark(page, 1, card);
    await card.getByText(/Saved 1\/1/).waitFor();
    await checkExport(page, card);

    await page.goto(practiceUrl('timed_test'));
    await page.locator('[data-start-test]').waitFor();
    const qualification = await reveal(page, routeFilter);
    if (await qualification.getAttribute('aria-pressed') !== 'true') await qualification.click();
    assert(await page.locator('.testlist li').count() > 0);
    await page.locator('[data-start-test]').click();
    await page.waitForURL('**/#/session/**');
    await page.locator('[data-timer]').waitFor();
    const session = await page.evaluate(async () => {
      const api = await import('/js/data/api.js');
      return api.resumableSessions().find(item => location.hash.endsWith(item.session_id));
    });
    assert(session.question_ids.every(id => id.startsWith('OCR_F200_SAMPLE_')));
    assert(session.total_marks > 0 && session.total_marks <= 60);
    await checkWidth(page, width);
    await reviewTest(page);

    await page.goto(paperUrl('F201'));
    await page.locator('[data-start="timed"]').click();
    await page.waitForURL('**/#/session/**');
    await page.locator('[data-timer]').waitFor();
    const whole = await page.evaluate(async () => (await import('/js/data/api.js')).resumableSessions().find(item => location.hash.endsWith(item.session_id)));
    assert.equal(whole.time_limit_seconds ?? whole.timer?.initial_seconds ?? whole.time_limit_minutes * 60, 90 * 60);
    assert.equal(whole.total_marks, 60);
    assert.equal(whole.question_ids.length, 23);
    await checkWidth(page, width);
    assert.equal(await page.locator('.ms img, .qview--scheme').count(), 0);
    assert.deepEqual(pageErrors, []);
    console.log(`${width}px: Papers, route control, both data items, Practice marking, blind PDF export, custom test review, full specimen`);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH});
  try {
    for (const width of [1440, 390]) await run(browser, width);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
