// Phones and tablets: the bottom tab bar, touch-sized controls, no sideways scrolling, and
// the phone → free account → bigger screen funnel (js/ui/funnel.js). Needs Playwright with a
// Chromium browser; skipped where that is not installed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* skipped below */ }
const skip = chromium ? false : 'Playwright is not installed';
const PORT = 5900 + Math.floor(Math.random() * 300);
const BASE = `http://localhost:${PORT}/`;
let server;
let browser;

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const TABLET = { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true };
const LAPTOP = { viewport: { width: 1280, height: 800 } };

before(async () => {
  if (skip) return;
  server = spawn(process.execPath, [fileURLToPath(new URL('../tools/serve.mjs', import.meta.url)), String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.kill();
});

async function open(device, { demo = false } = {}) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('ppp:welcome-seen', '1'));
  if (demo) await page.evaluate(async () => (await import('/js/data/demo.js')).enterDemoAccount());
  return { page, errors, context };
}
const go = async (page, route) => {
  await page.goto(`${BASE}#${route}`);
  await page.waitForSelector('.view h1');
};
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('Tab bar: on phones and tablets, not on laptops, and hidden while sitting a paper', { skip }, async () => {
  for (const [device, visible] of [[PHONE, true], [TABLET, true], [LAPTOP, false]]) {
    const { page, errors, context } = await open(device, { demo: true });
    await go(page, '/hub');
    assert.equal(await page.locator('.tabbar').isVisible(), visible, `${device.viewport.width}px`);
    if (visible) {
      assert.deepEqual(await page.locator('.tabbar__item span').allTextContents(), ['Home', 'Papers', 'Practice', 'Data Hub']);
      assert.equal((await page.locator('.tabbar__item.is-active span').textContent()).trim(), 'Data Hub');
      for (const box of await page.locator('.tabbar__item').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height))) assert.ok(box >= 44);
    }
    assert.equal(await overflow(page), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
  const { page, context } = await open(PHONE, { demo: true });
  await go(page, '/papers');
  await page.locator('.paper-card h3 a').first().click();
  await page.locator('[data-start="untimed"]').click();
  await page.waitForFunction(() => document.querySelector('.app').dataset.layout === 'focus');
  assert.equal(await page.locator('.tabbar').isVisible(), false, 'no tab bar in the exam runner');
  await context.close();
});

test('Guests on a phone get "Sign up free" in the tab bar and one dismissible save prompt', { skip }, async () => {
  const { page, errors, context } = await open(PHONE);
  await go(page, '/');
  assert.equal((await page.locator('.tabbar__item--cta').textContent()).trim(), 'Sign up free');
  assert.equal(await page.locator('.nudge').count(), 0, 'no prompt on arrival');
  await go(page, '/subjects');
  await go(page, '/papers');
  await page.waitForSelector('.nudge');
  assert.match(await page.locator('.nudge [data-nudge-go]').getAttribute('href'), /^#\/signup\?next=%2Fpapers/);
  await page.locator('.nudge [data-nudge-close]').first().click();
  await go(page, '/subjects');
  assert.equal(await page.locator('.nudge').count(), 0, 'stays dismissed');
  assert.deepEqual(errors, []);
  await context.close();

  const laptop = await open(LAPTOP);
  for (const route of ['/subjects', '/papers', '/subjects']) await go(laptop.page, route);
  assert.equal(await laptop.page.locator('.nudge').count(), 0, 'laptops are not nagged');
  await laptop.context.close();
});

test('Sign-up on a phone: the form comes straight after the heading, with 16px fields', { skip }, async () => {
  const { page, context } = await open(PHONE);
  await go(page, '/signup');
  const formTop = await page.locator('.auth').evaluate((node) => node.getBoundingClientRect().top);
  const pitchTop = await page.locator('.auth-page__get').evaluate((node) => node.getBoundingClientRect().top);
  assert.ok(formTop < pitchTop, 'form before "What you get"');
  assert.ok(formTop < 844, 'form starts on the first screen');
  for (const size of await page.locator('.auth .input').evaluateAll((inputs) => inputs.map((input) => parseFloat(getComputedStyle(input).fontSize)))) assert.ok(size >= 16, 'no iOS zoom on focus');
  await context.close();
});

test('Signed-in phone: "Carry on on a bigger screen" on Home, and long papers offer to move', { skip }, async () => {
  const { page, errors, context } = await open(PHONE, { demo: true });
  await go(page, '/');
  assert.equal(await page.locator('[data-bigscreen]').count(), 1);
  assert.match(await page.locator('[data-bigscreen-email]').getAttribute('href'), /^mailto:/);
  await page.locator('[data-bigscreen-hide]').click();
  await go(page, '/');
  assert.equal(await page.locator('[data-bigscreen]').count(), 0, 'Hide this sticks');

  await go(page, '/papers');
  await page.locator('.paper-card h3 a').first().click();
  await page.locator('[data-start="timed"]').click();
  const dialog = page.locator('dialog[open]');
  await dialog.waitFor();
  assert.match(await dialog.locator('.modal__title').textContent(), /bigger screen/);
  assert.equal(await overflow(page), 0);
  await dialog.locator('button', { hasText: 'Sit it here' }).click();
  await page.waitForFunction(() => location.hash.startsWith('#/session/'));
  assert.deepEqual(errors, []);
  await context.close();

  const laptop = await open(LAPTOP, { demo: true });
  await go(laptop.page, '/');
  assert.equal(await laptop.page.locator('[data-bigscreen]').count(), 0, 'not shown on a laptop');
  await laptop.context.close();
});

test('Data Hub tables become labelled rows on a phone', { skip }, async () => {
  const { page, context } = await open(PHONE, { demo: true });
  await go(page, '/hub');
  const table = page.locator('.table--stack').first();
  await table.waitFor();
  assert.equal(await table.locator('thead').evaluate((node) => node.getBoundingClientRect().width < 2), true);
  assert.equal(await table.locator('tbody td[data-label="Questions"]').count() > 0, true);
  assert.equal(await overflow(page), 0);
  await context.close();
});
