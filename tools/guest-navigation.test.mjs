// Exercise public subject links without signing in or enrolling.
// Run with Playwright and Chromium: node --test tools/guest-navigation.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* skipped below */ }
const skip = chromium ? false : 'Playwright is not installed';
const PORT = 6200 + Math.floor(Math.random() * 300);
const BASE = `http://localhost:${PORT}/`;
let server;

before(async () => {
  if (skip) return;
  server = spawn(process.execPath, [fileURLToPath(new URL('../tools/serve.mjs', import.meta.url)), String(PORT)], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
});

after(() => server?.kill());

async function guestPage(t, route) {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('ppp:welcome-seen', '1'));
  await page.goto(`${BASE}#${route}`);
  return page;
}

test('Guests can follow a subject’s full-papers link and reload the list', { skip }, async (t) => {
  const page = await guestPage(t, '/subject/EDX_ALEVEL_MATH_9MA0');
  await page.getByRole('link', { name: 'Full past papers' }).click();
  const firstPaper = page.getByRole('link', { name: 'Sit paper' }).first();
  await firstPaper.waitFor();
  await page.reload();
  await firstPaper.waitFor();
  await page.goto(`${BASE}#/subjects`);
  await page.getByRole('heading', { name: 'No subjects yet' }).waitFor();
});

test('A guest science tier follows the subject links to the matching papers', { skip }, async (t) => {
  const subject = 'EDX_GCSE_COMBSCI_1SC0';
  const page = await guestPage(t, `/subject/${subject}`);
  await page.getByRole('radio', { name: 'Foundation', exact: true }).click();
  const papersLink = page.getByRole('link', { name: 'Full past papers' });
  await page.waitForURL(`**#/subject/${subject}?tier=Foundation`);
  await page.getByText('Add the subject to save this tier.').waitFor();
  assert.equal(await papersLink.getAttribute('href'), `#/papers?subject=${subject}&tier=Foundation`);
  assert.equal(await page.getByRole('link', { name: 'Find questions' }).first().getAttribute('href'), `#/practice?subject=${subject}&mode=individual&tier=Foundation`);
  await papersLink.click();
  const codes = page.locator('.paper-card__code');
  await codes.first().waitFor();
  assert.ok((await codes.allTextContents()).every((label) => label.includes('Foundation')));
});

test('A guest can open a both-tier science paper list directly', { skip }, async (t) => {
  const page = await guestPage(t, '/papers?subject=EDX_GCSE_COMBSCI_1SC0&tier=all');
  const codes = page.locator('.paper-card__code');
  await codes.first().waitFor();
  const labels = await codes.allTextContents();
  assert.ok(labels.some(label => label.includes('Foundation')));
  assert.ok(labels.some(label => label.includes('Higher')));
});

test('Switching Combined Science disciplines keeps the chosen practice mode on reload', { skip }, async (t) => {
  const page = await guestPage(t, '/practice?subject=EDX_GCSE_COMBSCI_1SC0&tier=Foundation&mode=individual');
  const builder = page.getByRole('tab', {name: 'Build a test', exact: true});
  await builder.click();
  await page.waitForURL(url => url.hash.includes('mode=timed_test'));
  const chemistry = page.getByRole('radio', {name: 'Chemistry', exact: true});
  await chemistry.click();
  await page.locator('[data-start-test]').waitFor();
  assert.equal(await chemistry.getAttribute('aria-checked'), 'true');
  await page.reload();
  await page.locator('[data-start-test]').waitFor();
  assert.equal(await builder.getAttribute('aria-selected'), 'true');
  assert.equal(await chemistry.getAttribute('aria-checked'), 'true');
});

test('The add-subject dialog announces its title and restores focus on Escape', { skip }, async (t) => {
  const page = await guestPage(t, '/subjects?level=alevel');
  const math = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Mathematics', exact: true }) });
  const trigger = math.getByRole('button', { name: '+ Add subject' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Add Mathematics' });
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.ok(await trigger.evaluate((element) => document.activeElement === element));
});

test('Catalogue tabs and group filters support keyboard selection', { skip }, async (t) => {
  const page = await guestPage(t, '/subjects?level=alevel');
  const alevel = page.getByRole('tab', { name: 'A-Level', exact: true });
  const gcse = page.getByRole('tab', { name: 'GCSE', exact: true });
  await alevel.press('ArrowLeft');
  assert.equal(await gcse.getAttribute('aria-selected'), 'true');
  assert.equal(await alevel.getAttribute('tabindex'), '-1');
  assert.ok(await gcse.evaluate((element) => document.activeElement === element));
  const panel = page.getByRole('tabpanel', { name: 'GCSE' });
  await panel.getByRole('heading', { name: 'Combined Science (Double Award)' }).waitFor();

  const all = page.getByRole('radio', { name: 'All', exact: true });
  const stem = page.getByRole('radio', { name: 'STEM', exact: true });
  await all.press('ArrowDown');
  assert.equal(await stem.getAttribute('aria-checked'), 'true');
  assert.equal(await all.getAttribute('tabindex'), '-1');
  assert.ok(await stem.evaluate((element) => document.activeElement === element));
  assert.equal(await panel.getByRole('heading', { name: 'Geography', exact: true }).count(), 0);
});

test('Practice modes and science filters retain keyboard focus after selection', { skip }, async (t) => {
  const page = await guestPage(t, '/practice?subject=EDX_GCSE_COMBSCI_1SC0&tier=Foundation&mode=individual');
  const selectWithKey = async (from, key, to, state) => {
    await from.press(key);
    await page.waitForFunction(({id, value, state}) => {
      const active = document.activeElement;
      return active?.getAttribute(id) === value && active?.getAttribute(state) === 'true';
    }, { id: to[0], value: to[1], state });
    assert.equal(await from.getAttribute('tabindex'), '-1');
  };
  await selectWithKey(page.getByRole('tab', {name: 'Individual questions'}), 'ArrowRight',
    ['data-mode', 'timed_test'], 'aria-selected');
  await page.getByRole('tabpanel', {name: 'Build a test'}).locator('[data-start-test]').waitFor();
  await selectWithKey(page.getByRole('radio', {name: 'All three'}), 'End', ['data-practice-science', 'Physics'], 'aria-checked');
  await selectWithKey(page.getByRole('radio', {name: 'Foundation', exact: true}), 'ArrowRight',
    ['data-practice-tier', 'Higher'], 'aria-checked');
});
