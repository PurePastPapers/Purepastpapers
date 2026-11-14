// Isolated Chromium profile: never runs against an existing student account.
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
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto((process.env.AUDIT_URL || 'http://localhost:5173'));
  await p.evaluate(async () => {
    await (await import('/js/data/demo.js')).enterDemoAccount()
  });
  const route = async r => {
    await p.goto((process.env.AUDIT_URL || 'http://localhost:5173') + '/#' + r);
    await p.waitForTimeout(150)
  };
  await route('/practice?subject=EDX_ALEVEL_MATH_9MA0');
  await p.locator('[data-reset-filters]').click();
  await p.locator('[data-toggle-tree]').click();
  await p.locator('.tree__topic summary').first().click();
  await p.locator('[data-multi="difficulties"][data-value="easy"]').click();
  assert(await p.locator('.tree__topic').first().getAttribute('open') !== null, 'topic stayed open');
  await p.locator('[data-multi="difficulties"][data-value="medium"]').click();
  assert.equal(await p.locator('.qlist .qcard').count(), 13);
  assert(await p.evaluate(async () => {
    const qs = await (await fetch('/data/questions/EDX_ALEVEL_MATH_9MA0.json')).json();
    return [...document.querySelectorAll('.qlist [data-open]')].every(el => ['easy', 'medium']
      .includes(qs.find(q => q.question_id === el.dataset.open).difficulty))
  }));
  console.log('easy+medium:13, topic disclosures preserved');
  const ids = () => p.locator('.qlist [data-open]').evaluateAll(es => es.map(e => e.dataset.open));
  const before = await ids();
  await p.locator('[data-sort]').selectOption('shuffle');
  const shuffled = await ids();
  assert.deepEqual([...shuffled].sort(), [...before].sort());
  const first = p.locator('[data-open]').first();
  const id = await first.getAttribute('data-open');
  await first.click();
  await p.locator(`[data-answer="${id}"]`).fill('unsaved regression answer');
  await p.locator(`[data-scheme="${id}"]`).click();
  await p.locator(`[data-mark="${id}"]`).selectOption('0');
  await p.locator('[data-select]').first().check();
  const secondId = shuffled.find(candidate => candidate !== id);
  await p.locator(`[data-open="${secondId}"]`).click();
  const scrollBefore = await p.evaluate(() => {
    window.scrollTo(0, 800);
    return scrollY;
  });
  await p.evaluate(() => {
    const select = document.querySelector('[data-sort]');
    select.focus({preventScroll: true});
    select.value = 'marks_asc';
    select.dispatchEvent(new Event('change', {bubbles: true}));
  });
  assert.equal(await p.evaluate(() => scrollY), scrollBefore);
  assert.equal(await p.locator('[data-answer]').count(), 2);
  assert.equal(await p.locator(`[data-answer="${id}"]`).inputValue(), 'unsaved regression answer');
  console.log('scroll, multiple expanded questions and unsaved answer preserved while sorting');

  const progress = await p.evaluate(async () => JSON.stringify((await import('/js/data/api.js'))
    .getProgress()));
  await p.locator('[data-reset-filters]').click();
  assert.equal(await p.locator(`[data-answer="${id}"]`).inputValue(), 'unsaved regression answer');
  assert.equal(await p.locator(`[data-mark="${id}"]`).inputValue(), '0');
  assert(await p.locator(`[data-select="${id}"]`).isChecked());
  assert.equal(await p.locator('[data-sort]').inputValue(), 'newest');
  assert.equal(await p.evaluate(async () => JSON.stringify((await import('/js/data/api.js'))
  .getProgress())), progress);
  await p.reload();
  await p.waitForSelector('[data-reset-filters]');
  assert.equal(await p.locator(`[data-answer="${id}"]`).inputValue(), 'unsaved regression answer');
  console.log('reset preserved progress, set, open question/scheme and drafts across reload');
  await p.locator('[data-filter="markStatus"]').selectOption('unmarked');
  const uid = await p.locator('[data-open]').first().getAttribute('data-open');
  await p.locator(`[data-open="${uid}"]`).click();
  await p.locator(`[data-scheme="${uid}"]`).click();
  await p.locator(`[data-mark="${uid}"]`).selectOption('0');
  await p.locator(`[data-save-mark="${uid}"]`).click();
  await p.locator('[data-mark-confirmation]:visible').waitFor();
  assert(await p.locator(`[data-open="${uid}"]`).count());
  await p.waitForTimeout(1400);
  assert.equal(await p.locator(`[data-open="${uid}"]`).count(), 0);
  await p.locator('[data-filter="markStatus"]').selectOption('lost');
  assert(await p.locator(`[data-open="${uid}"]`).count());
  await p.locator(`[data-mark="${uid}"]`).selectOption('1');
  await p.locator(`[data-save-mark="${uid}"]`).click();
  await p.waitForTimeout(1300);
  await p.reload();
  await p.waitForSelector('[data-reset-filters]');
  assert(await p.locator(`[data-open="${uid}"]`).count());
  await p.locator(`[data-undo="${uid}"]`).click();
  console.log('zero, saved confirmation before removal, lost-mark filter, edit/reload/undo passed');
  const contrast = await p.evaluate(async () => {
    const {
      SUBJECT_SWATCHES
    } = await import('/js/ui/subject-colours.js');
    const cases = [];
    const lum = c => {
      const a = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <=
        .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return a[0] * .2126 + a[1] * .7152 + a[2] * .0722
    };
    const el = document.querySelector('[data-reset-filters]');
    for (const theme of ['light', 'dark'])
      for (const sw of SUBJECT_SWATCHES) {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.setProperty('--page-sc', sw.hex);
        await new Promise(r => setTimeout(r, 160));
        const s = getComputedStyle(el);
        cases.push({
          theme,
          swatch: sw.id,
          background: s.backgroundColor,
          color: s.color,
          ratio: (Math.max(lum(s.color), lum(s.backgroundColor)) + .05) / (Math.min(lum(s
            .color), lum(s.backgroundColor)) + .05),
          height: el.getBoundingClientRect().height
        })
      }
    return cases
  });
  assert(contrast.every(c => c.ratio >= 4.5 && c.height >= 44));
  console.log('reset contrast:', Math.min(...contrast.map(c => c.ratio)), 'across', contrast.length,
    'theme/swatch cases');
  assert.deepEqual(errors, []);
  await b.close()
})().catch(e => {
  console.error(e);
  process.exit(1)
});
