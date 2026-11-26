const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const origin = process.env.AUDIT_URL || 'http://localhost:5187';
const subject = 'AQA_GCSE_ENGLANG_8700';
const papers = '/#/papers?subject=' + subject;
const paper = id => '/#/paper/' + subject + '/' + id;
const practice = mode => '/#/practice?subject=' + subject + '&mode=' + mode;

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    await page.goto(origin);
    await page.evaluate(async subjectId => {
      await (await import('/js/data/demo.js')).enterDemoAccount();
      await (await import('/js/data/api.js')).setEnrolled(subjectId, true);
    }, subject);

    await page.goto(origin + papers);
    await page.getByRole('heading', { name: 'Official samples', exact: true }).waitFor();
    const fullId = 'AQA_8700_SPEC2026_P2';
    await page.locator('a[href="' + paper(fullId).slice(1) + '"]').first().click();
    await page.locator('[data-start="timed"]').waitFor();

    await page.goto(origin + paper('AQA_8700_2022_JUNE_P1'));
    await page.getByText(/40 of 80 marks/).first().waitFor();
    assert.equal(await page.locator('[data-start="timed"]').count(), 0);
    await page.goto(origin + practice('picker'));
    await page.locator('[data-reset-filters]').waitFor();
    const writing = page.locator('[data-card="AQA_8700_2022_JUNE_P1_Q05"]');
    const reading = page.locator('[data-card="AQA_8700_2022_JUNE_P1_Q02"]');
    for (let attempt = 0; attempt < 12 && !(await writing.count()); attempt++) {
      const next = page.getByRole('navigation', { name: 'Question results pages' }).getByRole('button', { name: 'Next', exact: true });
      if (!(await next.count()) || !(await next.isEnabled())) break;
      await next.click();
    }
    await writing.waitFor();
    assert.equal(await reading.count(), 0);
    await writing.getByRole('link', { name: /both writing options and the picture/ }).waitFor();
    assert.equal(await writing.getByRole('link', { name: /official mark scheme/ }).count(), 0);
    await writing.locator('[data-scheme]').click();
    await writing.getByText(/AO5.*24 marks/).waitFor();
    await writing.getByText(/AO6.*16 marks/).waitFor();
    await writing.getByRole('link', { name: /official mark scheme/ }).waitFor();

    // Printed question, insert and scheme come from distinct URLs.
    await page.goto(origin + practice('picker'));
    const question = page.locator('[data-card="AQA_8700_SPEC2026_P2_Q04"]');
    for (let attempt = 0; attempt < 12 && !(await question.count()); attempt++) {
      const next = page.getByRole('navigation', { name: 'Question results pages' }).getByRole('button', { name: 'Next', exact: true });
      if (!(await next.count()) || !(await next.isEnabled())) break;
      await next.click();
    }
    await question.waitFor();
    assert.match(await question.getByRole('link', { name: /Source A/ }).getAttribute('href'), /#page=2$/);
    assert.match(await question.getByRole('link', { name: /Source B/ }).getAttribute('href'), /#page=3$/);
    await question.locator('[data-select]').check();
    await page.locator('[data-export-test="selection"]').click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('[name="kind"]').selectOption('question');
    await dialog.getByRole('button', { name: 'Prepare PDF' }).click();
    await dialog.locator('a[data-pdf-handoff][download]').first().waitFor({ timeout: 30000 });

    const point = 'AQA_GCSE_ENGLANG_P2READ_A.1';
    await page.evaluate(async id => (await import('/js/data/api.js')).setLearned([id], true), point);
    await page.goto(origin + practice('timed_test'));
    await page.locator('[data-start-test]').click();
    await page.locator('[data-timer]').first().waitFor();
    assert.equal(await page.locator('.ms').count(), 0);
    await page.locator('[data-finish]').first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Finish', exact: true }).click();
    await page.getByRole('heading', { name: 'Mark your answers', exact: true }).waitFor();
    await page.getByRole('link', { name: /open the official mark scheme at this question/ }).first().waitFor();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      await page.waitForFunction(limit => document.documentElement.scrollWidth <= limit, width);
    }
    console.log('GCSE English Language Papers, Practice, export, Build a Test and marking passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
