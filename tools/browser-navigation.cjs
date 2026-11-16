// Back buttons, restart/abandon and link hygiene. Isolated Chromium profile (demo account only).
// Run with the site served on localhost:5173:  node tools/browser-navigation.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const BASE = process.env.AUDIT_URL || 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const settle = () => page.waitForTimeout(400);
  const hash = () => new URL(page.url()).hash;
  const layout = () => page.locator('.app').getAttribute('data-layout');
  const sessionCount = () => page.evaluate(async () => (await import('/js/data/api.js')).getProgress().sessions.length);
  const confirm = async (label) => {
    await page.locator('dialog[open] button', { hasText: label }).click();
    await settle();
  };

  // Signed-out home-page section links land on their section from any page.
  await page.goto(`${BASE}/#/subjects`);
  await settle();
  await page.locator('.topnav__links a[data-jump="how"]').click();
  await settle();
  assert.equal(hash(), '#/?section=how');
  assert(await page.evaluate(() => document.getElementById('how').getBoundingClientRect().top < 200), 'scrolled to "How it works"');

  await page.evaluate(async () => (await import('/js/data/demo.js')).enterDemoAccount());
  await page.goto(`${BASE}/#/papers`);
  await settle();
  await page.locator('.paper-card h3 a').first().click();
  await settle();
  const paperHash = hash();
  assert.match(paperHash, /^#\/paper\//);

  // 1. Save and exit returns to the paper, and browser Back then reaches the list, not the runner.
  await page.locator('[data-start="timed"]').click();
  await settle();
  assert.equal(await layout(), 'focus');
  await page.locator('.runner__bar [data-exit]').click();
  await settle();
  assert.equal(hash(), paperHash, 'Save and exit returns to the paper');
  await page.goBack();
  await settle();
  assert.equal(hash(), '#/papers', 'browser Back from the paper goes to past papers');
  assert.notEqual(await layout(), 'focus');

  // 2. An attempt opened and left straight away is not kept.
  await page.goForward();
  await settle();
  assert.equal(await page.locator('[data-discard-open]').count(), 0, 'no leftover attempt to resume');

  // 3. Restart clears the attempt; Abandon leaves without recording anything.
  await page.locator('[data-start="untimed"]').click();
  await settle();
  await page.locator('[data-answer]').fill('working');
  await page.locator('[data-flag]').click();
  await settle();
  await page.locator('[data-restart]').click();
  await confirm('Restart');
  assert.equal(await page.locator('[data-answer]').inputValue(), '', 'Restart clears typed answers');
  assert.equal(await page.locator('[data-flag]').getAttribute('aria-pressed'), 'false', 'Restart clears flags');
  const before = await sessionCount();
  const attemptsBefore = await page.evaluate(async () => (await import('/js/data/api.js')).getProgress().question_attempts.length);
  await page.locator('[data-answer]').fill('more working');
  await page.locator('[data-abandon]').click();
  await confirm('Abandon');
  assert.equal(hash(), paperHash, 'Abandon returns to the paper');
  assert.equal(await sessionCount(), before - 1, 'Abandon deletes the session');
  assert.equal(await page.evaluate(async () => (await import('/js/data/api.js')).getProgress().question_attempts.length), attemptsBefore, 'Abandon records nothing');

  // 4. Abandon is also offered while marking.
  await page.locator('[data-start="untimed"]').click();
  await settle();
  await page.locator('[data-answer]').fill('x');
  await page.locator('.runner__bar [data-finish]').click();
  await confirm('Finish');
  assert.equal(await page.locator('.mark-head').count(), 1);
  await page.locator('[data-abandon]').click();
  await confirm('Abandon');
  assert.equal(hash(), paperHash);

  // 5. A kept unfinished attempt can be discarded from the paper page.
  await page.locator('[data-start="untimed"]').click();
  await settle();
  await page.locator('[data-answer]').fill('keep me');
  await page.waitForTimeout(500); // debounced save
  await page.locator('.runner__bar [data-exit]').click();
  await settle();
  assert.equal(await page.locator('[data-discard-open]').count(), 1);
  await page.locator('[data-discard-open]').click();
  await confirm('Discard');
  assert.equal(await page.locator('[data-start="timed"]').count(), 1, 'discarding brings back the start buttons');

  // 6. Resuming from the dashboard returns to the dashboard.
  await page.locator('[data-start="untimed"]').click();
  await settle();
  await page.locator('[data-answer]').fill('resume me');
  await page.waitForTimeout(500);
  await page.goto(`${BASE}/#/`);
  await settle();
  await page.locator('.resume a', { hasText: 'Resume' }).first().click();
  await settle();
  await page.locator('.runner__bar [data-exit]').click();
  await settle();
  assert.equal(hash(), '#/', 'exit returns to where the student came from');

  // 7. Opened directly (no history), exit falls back to the paper and replaces the runner entry.
  const sessionHash = await page.locator('.resume a', { hasText: 'Resume' }).first().getAttribute('href');
  await page.goto(`${BASE}/${sessionHash}`);
  await page.reload();
  await settle();
  await page.locator('.runner__bar [data-exit]').click();
  await settle();
  assert.equal(hash(), paperHash);

  // 8. Link hygiene on every main page: internal links resolve to a route and IDs are encoded.
  for (const route of ['/', '/papers', paperHash.slice(1), '/practice', '/subjects', '/hub', '/account']) {
    await page.goto(`${BASE}/#${route}`);
    await settle();
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')]
        .map((link) => link.getAttribute('href'))
        .filter((href) => href.startsWith('#') && !href.startsWith('#/')),
    );
    assert.deepEqual(bad, [], `in-page hash links on ${route} would break the router`);
    const external = await page.evaluate(() =>
      [...document.querySelectorAll('a[target="_blank"]')].filter((link) => !/noopener/.test(link.rel)).map((link) => link.href),
    );
    assert.deepEqual(external, [], `external links on ${route} need rel=noopener`);
  }

  assert.deepEqual(errors, []);
  console.log('navigation regression passed');
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
