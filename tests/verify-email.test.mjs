// Browser checks for the "Check your email" popup shown after signing up. Supabase is replaced
// by a small fake (served in place of supabase-js) so no real account or email is involved.
// Needs Playwright with a Chromium browser; the test is skipped where that is not installed.
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

// A stand-in for @supabase/supabase-js: sign-up needs confirmation, and the test "opens the
// link" by setting window.__fakeSession and firing a storage event, as another tab would.
const FAKE_SUPABASE = `
const listeners = [];
window.__resends = 0;
window.__fakeSession = null;
export function createClient() {
  return {
    auth: {
      async getSession() { return { data: { session: window.__fakeSession }, error: null }; },
      async signUp() { return { data: { user: { id: 'u1' }, session: null }, error: null }; },
      async resend() {
        window.__resends += 1;
        if (window.__resends > 1) return { error: { message: 'For security purposes, you can only request this after 37 seconds.' } };
        return { error: null };
      },
      onAuthStateChange(fn) { listeners.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
      async signOut() { window.__fakeSession = null; return { error: null }; },
    },
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() { return { data: null, error: null }; },
        async upsert() { return { error: null }; },
      };
      return query;
    },
  };
}`;

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

async function signUp(viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://esm.sh/**', (route) => route.fulfill({ contentType: 'application/javascript', body: FAKE_SUPABASE }));
  await page.goto(`${BASE}#/signup`);
  await page.waitForSelector('[data-form]');
  await page.fill('input[name=displayName]', 'Sam');
  await page.fill('input[name=email]', 'sam@example.com');
  await page.fill('input[name=password]', 'a-long-password-1');
  await page.locator('[data-form] button[type=submit]').click();
  await page.waitForSelector('dialog.verify[open]');
  return { page, errors };
}

test('signing up opens the Check your email popup, and Resend counts down', { skip }, async () => {
  const { page, errors } = await signUp({ width: 1366, height: 860 });
  assert.equal(await page.locator('.verify .modal__title').textContent(), 'Check your email');
  assert.equal(await page.locator('.verify__email').textContent(), 'sam@example.com');

  await page.locator('[data-verify-resend]').click();
  await page.waitForSelector('[data-verify-sent]:not([hidden])');
  assert.match(await page.locator('[data-verify-resend]').textContent(), /^Resend in [01]:\d\d$/);
  assert.ok(await page.locator('[data-verify-resend]').isDisabled());
  assert.equal(await page.evaluate(() => window.__resends), 1);

  // "Wrong email?" closes the popup and leaves the form filled in, ready to fix.
  await page.locator('[data-verify-change]').click();
  assert.equal(await page.locator('dialog.verify').count(), 0);
  assert.equal(await page.inputValue('input[name=email]'), 'sam@example.com');
  assert.equal(await page.evaluate(() => document.activeElement?.name), 'email');
  assert.deepEqual(errors, []);
  await page.close();
});

test('the popup turns into You’re in! once the link is opened, then goes to My subjects', { skip }, async () => {
  const { page, errors } = await signUp({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.__fakeSession = { user: { id: 'u1', email: 'sam@example.com', email_confirmed_at: new Date().toISOString(), user_metadata: { display_name: 'Sam' } } };
    window.dispatchEvent(new StorageEvent('storage'));
  });
  await page.waitForSelector('dialog.verify.verify--done');
  assert.equal(await page.locator('.verify .modal__title').textContent(), 'You’re in!');
  assert.match(await page.locator('.verify__text').textContent(), /You’re all set, Sam\./);

  await page.locator('[data-verify-continue]').click();
  await page.waitForFunction(() => location.hash.startsWith('#/subjects'));
  assert.equal(await page.locator('dialog.verify').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});
