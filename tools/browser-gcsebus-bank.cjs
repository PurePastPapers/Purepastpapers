// Pearson Edexcel GCSE Business 1BS0 browser smoke check. Uses an isolated demo profile.
// Serve the checkout with npm start or set AUDIT_URL to the deployed site.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {allTopics, pickMark, results, reveal} = require('./browser-results.cjs');

const base = (process.env.AUDIT_URL || 'http://localhost:5173').replace(/\/$/, '');
const subject = 'EDX_GCSE_BUS_1BS0';
const paper1 = 'EDX_1BS0_2024_JUNE_P1';
const paper2 = 'EDX_1BS0_2025_JUNE_P2';
const june2024Source = 'https://qualifications.pearson.com/content/dam/pdf/GCSE/Business/2017/Exam-materials/1bs0-01-que-20240515.pdf';
const practice = mode => `/#/practice?subject=${subject}&mode=${mode}`;
const fixtures = [
  {id: paper1 + '_Q5A', label: 'Q5(a)', marks: 2, resource: /Table 2/i},
  {id: paper1 + '_Q5B', label: 'Q5(b)', marks: 2, resource: /Table 2/i},
  {id: paper1 + '_Q6C', label: 'Q6(c)', marks: 9, resource: /Extract A|Adikoggz|Section B/i},
  {id: paper1 + '_Q7E', label: 'Q7(e)', marks: 12, resource: /Extract B|PFC|Section C/i},
  {id: paper2 + '_Q1B', label: 'Q1(b)'},
];

async function read(request, route) {
  const response = await request.get(base + route);
  assert(response.ok(), `${route}: HTTP ${response.status()}`);
  return response.json();
}

async function loaded(image) {
  await image.scrollIntoViewIfNeeded();
  await image.evaluate(async element => {
    await element.decode();
    if (!element.complete || !element.naturalWidth) throw new Error('Image did not render');
  }, undefined, {timeout: 20000});
}

async function assertResultCount(page, count) {
  await page.locator('[data-output] .browser-results-heading [role="status"]')
    .getByText(new RegExp(`^${count} questions?$`)).waitFor();
}

async function findCard(page, id) {
  const card = page.locator(`[data-card="${id}"]`);
  while (!(await card.count())) {
    const next = page.getByRole('navigation', {name: 'Question results pages'})
      .getByRole('button', {name: 'Next', exact: true});
    assert(await next.count() && await next.isEnabled(), `Missing question card ${id}`);
    await next.click();
  }
  return card;
}

async function checkExport(page) {
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', {name: 'Prepare PDF'}).click();
  const handoff = modal.locator('a[data-pdf-handoff][download]');
  await handoff.waitFor({timeout: 60000});
  const pdf = await handoff.evaluate(async anchor => {
    const response = await fetch(anchor.href);
    return new TextDecoder('latin1').decode(await response.arrayBuffer());
  });
  assert(pdf.startsWith('%PDF-'));
  assert.equal((pdf.match(/\/Type \/XObject \/Subtype \/Image/g) || []).length, 2, 'question-only PDF contains the case and question crops');
  for (const pageNumber of [16, 27]) {
    const sourceUri = Buffer.from(june2024Source + '#page=' + pageNumber).toString('hex');
    assert(pdf.includes(`/URI <${sourceUri}>`), `official source page ${pageNumber} links from the PDF`);
  }
  assert.match(await handoff.getAttribute('download'), /-question\.pdf$/);
}

(async () => {
  const browser = process.env.AUDIT_CDP
    ? await chromium.connectOverCDP(process.env.AUDIT_CDP)
    : await chromium.launch({headless: true, ...(process.env.CHROME_PATH && {executablePath: process.env.CHROME_PATH})});
  let context;
  try {
    context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    const {packs} = await read(context.request, '/data/packs/index.json');
    const entries = packs.filter(pack => pack.subject_id === subject);
    const bank = await Promise.all(entries.map(pack => read(context.request, '/data/packs/' + pack.file)));
    const papers = bank.flatMap(pack => pack.papers);
    const questions = bank.flatMap(pack => pack.questions);
    assert.equal(papers.length, 16, 'published Business papers');
    assert.equal(new Set(papers.map(paper => paper.paper_id)).size, 16, 'unique paper IDs');
    assert(papers.every(paper => !paper.is_sample && paper.total_marks === 90));
    const byId = new Map(questions.map(question => [question.question_id, question]));

    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.evaluate(async subjectId => {
      await (await import('/js/data/demo.js')).enterDemoAccount();
      await (await import('/js/data/api.js')).setEnrolled(subjectId, true);
    }, subject);

    await page.goto(base + `/#/papers?subject=${subject}`);
    await page.locator(`.paper-card a[href="#/paper/${subject}/${paper1}"]`).first().waitFor();
    for (const id of [paper1, paper2]) {
      await page.goto(base + `/#/paper/${subject}/${id}`);
      const count = page.locator('.paper-qs__count');
      await count.waitFor();
      const questionsOnPaper = results(questions, question => question.paper_id === id);
      assert.match(await count.innerText(), new RegExp(`${questionsOnPaper} questions? · 90 marks`));
      if (id === paper1) {
        const booklet = page.getByRole('link', {name: 'Official source booklet (PDF)'});
        assert.equal(await booklet.getAttribute('href'), june2024Source + '#page=25');
      }
    }

    await page.goto(base + practice('picker'));
    await page.locator('[data-reset-filters]').click();
    await allTopics(page);
    await assertResultCount(page, results(questions));
    const exactPoint = byId.get(paper1 + '_Q5A').primary_spec_points[0];
    await (await reveal(page, '[data-tree-bulk="none"]')).click();
    await (await reveal(page, `[data-point="${exactPoint}"]`)).check();
    const focusChip = page.locator('[data-clear-chip="focus"]');
    await focusChip.waitFor();
    assert.match(await focusChip.innerText(), /1 spec points selected/);
    await (await reveal(page, '[data-filter="paper"]')).selectOption(paper1);
    await findCard(page, paper1 + '_Q5A');
    await page.locator('[data-reset-filters]').click();

    for (const {id, label, marks, resource} of fixtures) {
      const question = byId.get(id);
      assert(question, `Missing fixture ${id}`);
      assert.equal(question.scheme_scope, 'part');
      if (marks) assert.equal(question.marks, marks);
      await (await reveal(page, '[data-filter="paper"]')).selectOption(question.paper_id);
      await assertResultCount(page, results(questions, item => item.paper_id === question.paper_id));
      const card = await findCard(page, id);
      assert((await card.locator('.qcard__ref').innerText()).includes(` · ${label}`));
      const toggle = card.locator('[data-open]');
      if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
      await loaded(card.locator('.question-selected-part img').first());
      if (resource) {
        const caption = card.locator('[data-question-resources] figcaption').filter({hasText: resource}).first();
        await loaded(caption.locator('..').locator('img'));
      }
      if (id.endsWith('_Q7E')) {
        const context = card.locator('[data-question-resources]');
        const caseSource = context.getByRole('link', {name: 'Open the official source for Section C case study'});
        const tableSource = context.getByRole('link', {name: 'Open the official source for Table 3'});
        assert.equal(await caseSource.getAttribute('href'), june2024Source + '#page=27');
        assert.equal(await tableSource.getAttribute('href'), june2024Source + '#page=16');
        assert.equal(await tableSource.locator('..').locator('img').count(), 0);
        assert(await card.evaluate(element => {
          const context = element.querySelector('[data-question-resources]');
          const prompt = element.querySelector('.question-selected-part');
          return Boolean(context.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING);
        }), 'the case and table link appear before the question');
      }
      await card.locator('[data-scheme]').click();
      const scheme = card.locator('.ms img').first();
      await loaded(scheme);
      assert.equal(await card.locator('[data-markpick]').getAttribute('data-max'), String(question.marks));
      if (id.endsWith('_Q5A')) {
        await card.locator('[data-answer]').fill('53 pairs');
        await pickMark(page, 2, card);
        await card.getByText('Saved 2/2', {exact: true}).first().waitFor();
      }
      await card.locator('[data-scheme]').click();
    }

    // Export an exact case-dependent question so a missing case cannot pass unnoticed.
    await (await reveal(page, '[data-filter="paper"]')).selectOption(paper1);
    const evaluation = await findCard(page, paper1 + '_Q7E');
    await evaluation.locator('[data-select]').check();
    await page.locator('[data-export-test="selection"]').click();
    await checkExport(page);

    await page.goto(base + practice('timed_test'));
    await allTopics(page);
    await page.locator('[data-start-test]').waitFor();
    assert(await page.locator('.testlist li').count() > 0, 'Build a Test has Business questions');
    for (const width of [390, 1440]) {
      await page.setViewportSize({width, height: 1000});
      await page.waitForFunction(w => document.documentElement.scrollWidth <= w, width);
    }
    assert.deepEqual(errors, []);
    console.log(`${papers.length} Business papers / ${questions.length} units. Paper pages, filters, exact questions and schemes, case resources, marking, PDF export and test builder: PASS`);
  } finally {
    await context?.close();
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
