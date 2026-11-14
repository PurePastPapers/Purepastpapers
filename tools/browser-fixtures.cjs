// Synthetic browser fixtures only;
// Never changes shipped content or real student accounts.
const {
  chromium
} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const b = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? {
        executablePath: process.env.CHROME_PATH
      } :
      {}
    )
  });
  const p = await b.newPage({
    viewport: {
      width: 1440,
      height: 1000
    }
  });
  await p.route('**/data/papers/EDX_ALEVEL_MATH_9MA0.json', async route => {
    const res = await route.fetch();
    const papers = await res.json();
    papers.forEach((q, i) => q.year = i % 2 ? 2023 : 2024);
    await route.fulfill({
      json: papers
    })
  });
  await p.goto((process.env.AUDIT_URL || 'http://localhost:5173'));
  await p.evaluate(async () => {
    await (await import('/js/data/demo.js')).enterDemoAccount()
  });
  await p.goto((process.env.AUDIT_URL || 'http://localhost:5173') +
    '/#/practice?subject=EDX_ALEVEL_MATH_9MA0');
  await p.waitForSelector('[data-reset-filters]');
  await p.locator('[data-reset-filters]').click();
  await p.locator('[data-multi="difficulties"][data-value="easy"]').click();
  await p.locator('[data-multi="difficulties"][data-value="medium"]').click();
  console.log('bands', await p.locator('[data-multi="bands"]').evaluateAll(es => es.map(e => ({
    v: e.dataset.value,
    t: e.textContent
  }))));
  await p.locator('[data-multi="bands"]').nth(1).click();
  await p.locator('[data-filter="markStatus"]').selectOption('unmarked');
  await p.getByText('More filters', {
    exact: true
  }).click();
  await p.getByText('Paper & content filters', {
    exact: true
  }).click();
  await p.locator('[data-multi="years"][data-value="2024"]').click();
  const before = await p.locator('.qlist [data-open]').evaluateAll(es => es.map(e => e.dataset.open));
  await p.locator('[data-toggle-tree]').click();
  await p.locator('.tree__topic summary').first().click();
  const points = await p.evaluate(async () => {
    const {
      specIndex,
      getBundle
    } = await import('/js/data/content-repository.js');
    const b = await getBundle('EDX_ALEVEL_MATH_9MA0');
    return [...new Set(b.questions.flatMap(q => [...specIndex.expand([...q.primary_spec_points, ...q
      .crossover_spec_points
    ])]))]
  });
  await p.evaluate(points => {
    const key = Object.keys(localStorage).find(k => k.includes(':practice:'));
    const s = JSON.parse(localStorage.getItem(key));
    s.focus = points;
    localStorage.setItem(key, JSON.stringify(s))
  }, points);
  await p.reload();
  await p.waitForSelector('[data-reset-filters]');
  const actual = await p.locator('.qlist [data-open]').evaluateAll(es => es.map(e => e.dataset.open));
  assert(actual.length > 0);
  assert.deepEqual(actual, before);
  await p.locator('[data-sort]').selectOption('marks_desc');
  assert.deepEqual((await p.locator('.qlist [data-open]').evaluateAll(es => es.map(e => e.dataset.open)))
    .sort(), [...before].sort());
  assert.equal(await p.locator('[data-multi="years"][aria-pressed="true"]').count(), 1);
  assert.equal(await p.locator('[data-multi="difficulties"][aria-pressed="true"]').count(), 2);
  assert.equal(await p.locator('[data-filter="markStatus"]').inputValue(), 'unmarked');
  console.log(
    'Synthetic dated-paper UI fixture: spec points AND easy/medium AND mark band AND 2024 AND unmarked; results',
    actual);
  await p.getByText('Custom mark range', {exact: true}).click();
  await p.locator('[data-filter="markMin"]').fill('2');
  await p.locator('[data-filter="markMin"]').dispatchEvent('change');
  await p.locator('[data-filter="markMax"]').fill('5');
  await p.locator('[data-filter="markMax"]').dispatchEvent('change');
  const ranged = await p.locator('.qlist [data-open]').evaluateAll(es => es.map(e => e.dataset.open));
  assert.deepEqual([...ranged].sort(), ['EDX_9MA0_DEMO_PURE_Q02', 'EDX_9MA0_DEMO_PURE_Q03']);
  assert.equal(await p.locator('[data-multi="years"][aria-pressed="true"]').count(), 1);
  assert.equal(await p.locator('[data-multi="difficulties"][aria-pressed="true"]').count(), 2);
  await p.locator('[data-sort]').selectOption('oldest');
  assert.deepEqual((await p.locator('.qlist [data-open]').evaluateAll(es => es.map(e => e.dataset.open))).sort(), [...ranged].sort());
  console.log('Exact 2–5 range returned two matching records and preserved spec, years, difficulty and progress');
  await p.getByText('Review selected spec points', {
    exact: true
  }).click();
  const count = await p.locator('[data-remove-focus]').count();
  await p.locator('[data-remove-focus]').first().click();
  assert.equal(await p.locator('[data-remove-focus]').count(), count - 1);
  console.log('individual spec removal passed');
  const preview = await p.evaluate(async () => {
    const {
      questionSnippet
    } = await import('/js/ui/question-view.js');
    return questionSnippet({
      content: {
        question_html: '<p>Find x<sup>2</sup> for H<sub>2</sub>O and <span class="frac"><span class="frac__n">1</span><span class="frac__d">2 + cos x</span></span></p>'
      }
    })
  });
  assert(preview.includes('x^(2)') && preview.includes('H_(2)') && preview.includes('(1)/(2 + cos x)'));
  console.log('math preview', preview);
  await b.close()
})().catch(e => {
  console.error(e);
  process.exit(1)
})
