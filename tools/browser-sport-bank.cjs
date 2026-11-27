const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {allTopics, pickMark, reveal} = require('./browser-results.cjs');

const base = (process.env.AUDIT_URL || 'http://localhost:5173').replace(/\/$/, '');
const subject = 'OCR_L3_SPORT_CTEC';
const unit01 = 'OCR_05827_2025_JUNE_U01';
const unit03 = 'OCR_05827_2025_JUNE_U03';
const paper = id => `/#/paper/${subject}/${id}`;
const practice = mode => `/#/practice?subject=${subject}&mode=${mode}`;

async function decode(image) {
  await image.waitFor();
  return image.evaluate(async element => {
    await element.decode();
    return element.naturalHeight;
  });
}

async function findCard(page, paperId, label) {
  await page.locator('[data-filter="paper"]').first().waitFor({state: 'attached'});
  await (await reveal(page, '[data-filter="paper"]')).selectOption(paperId);
  const card = page.locator(`[data-card="${paperId}_${label}"]`);
  const next = page.getByRole('navigation', {name: 'Question results pages'}).getByRole('button', {name: 'Next', exact: true});
  while (!(await card.count()) && await next.count() && await next.isEnabled()) await next.click();
  await card.waitFor();
  if (await card.locator('[data-open]').getAttribute('aria-expanded') === 'false') await card.locator('[data-open]').click();
  return card;
}

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ['--disable-gpu']});
  try {
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    await context.route(/https:\/\/esm\.sh\/@supabase\/supabase-js@2\?bundle/, route => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      headers: {'access-control-allow-origin': '*'},
      body: 'export function createClient(){return {auth:{getSession:async()=>({data:{session:null},error:null})}}}',
    }));
    let page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(base);
    await page.evaluate(async id => {
      await (await import('/js/data/demo.js')).enterDemoAccount();
      const api = await import('/js/data/api.js');
      await api.setEnrolled(id, true);
      const doc = await fetch('/data/specs/' + id + '.json').then(r => r.json());
      await api.setLearned(doc.sections.flatMap(s => s.topics.flatMap(t => t.points.map(p => p.id))), true);
    }, subject);

    await page.goto(base + `/#/papers?subject=${subject}`);
    await page.locator(`a[href="#/paper/${subject}/${unit01}"]`).first().waitFor();
    await page.locator(`a[href="#/paper/${subject}/${unit03}"]`).first().waitFor();
    await page.goto(base + paper(unit01));
    assert.match(await page.locator('.paper-qs__count').innerText(), /49 of 70 marks/);
    assert.equal(await page.locator('[data-start]').count(), 0);
    assert.match(await page.getByText('Question paper (PDF)', {exact: true}).getAttribute('href'), /753061/);
    await page.goto(base + paper(unit03));
    assert.match(await page.locator('.paper-qs__count').innerText(), /60 (?:of 60 )?marks/);
    assert.equal(await page.locator('[data-start="timed"]').count(), 1);
    assert.match(await page.getByText('Mark scheme (PDF)', {exact: true}).getAttribute('href'), /753067/);

    await page.goto(base + practice('picker'));
    await page.locator('[data-reset-filters]').waitFor();
    await allTopics(page);
    const flow = await findCard(page, unit01, 'Q15_a');
    assert(await decode(flow.locator('.question-selected-part img').first()) > 500);
    assert.equal(await flow.locator('.ms img').count(), 0);
    await flow.locator('[data-scheme]').click();
    assert(await decode(flow.locator('.ms img').first()) > 0);
    await pickMark(page, 1, flow);
    await flow.getByText(/Saved 1\/4/).waitFor();
    await flow.locator('[data-select]').check({force: true});
    await page.locator('[data-export-test="selection"]').click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('[name="kind"]').selectOption('question');
    await dialog.getByRole('button', {name: 'Prepare PDF'}).click();
    const pdf = page.locator('a[data-pdf-handoff][download]').first();
    await pdf.waitFor();
    assert.match(await pdf.getAttribute('download'), /-question\.pdf$/);
    assert(await pdf.evaluate(async a => {
      const text = new TextDecoder('latin1').decode(await fetch(a.href).then(r => r.arrayBuffer()));
      return text.startsWith('%PDF-') && !/Mark scheme/i.test(text);
    }));
    await page.close();
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(base + practice('picker'));
    const rubric = await findCard(page, unit03, 'Q02_c');
    assert(await decode(rubric.locator('.question-selected-part img').first()) > 0);
    await rubric.locator('[data-scheme]').click();
    assert(await decode(rubric.locator('.ms img').first()) > 2000);

    await page.goto(base + practice('timed_test'));
    await page.locator('[data-start-test]').waitFor();
    assert(await page.locator('.testlist li').count() > 0);
    await page.locator('[data-start-test]').click();
    await page.locator('[data-timer]').waitFor();
    assert.equal(await page.locator('.ms').count(), 0);
    await page.locator('[data-finish]').first().click();
    await page.getByRole('dialog').getByRole('button', {name: 'Finish', exact: true}).click();
    await page.getByRole('heading', {name: 'Mark your answers', exact: true}).waitFor();
    const pickers = await page.locator('.markcard [data-markpick]').all();
    assert(pickers.length > 0);
    for (const picker of pickers) {
      if (await picker.locator('[data-pick="0"]').count()) await picker.locator('[data-pick="0"]').click();
      else await picker.locator('[data-pick-range]').fill('0');
    }
    await page.locator('[data-save-results]').click();
    await page.locator('.result-hero__score').waitFor();
    assert.equal(await page.locator('.grade-stamp').count(), 0);
    await page.getByRole('heading', {name: 'Review', exact: true}).waitFor();

    await page.setViewportSize({width: 390, height: 850});
    for (const [route, selector] of [[paper(unit03), '.paper-qs__count'], [practice('picker'), '[data-output]'], [practice('timed_test'), '[data-minutes-input]']]) {
      await page.goto(base + route);
      await page.locator(selector).first().waitFor();
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    }
    for (const unit of ['02', '04', '08', '17', '21']) {
      await page.goto(base + paper('OCR_05827_2025_JUNE_U' + unit));
      await page.getByText(/paper (not found|unavailable)/i).first().waitFor();
      assert.equal(await page.locator('[data-start]').count(), 0);
    }
    console.log('Sport 05827 Papers, crops, schemes, scoring, question PDF, builder and mobile layout: PASS');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
