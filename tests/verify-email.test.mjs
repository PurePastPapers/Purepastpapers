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
  let progressRow = null;
  return {
    auth: {
      async getSession() { return { data: { session: window.__fakeSession }, error: null }; },
      async signUp({ email }) {
        if (email === 'taken@example.com') return { data: { user: { id: 'fake', identities: [] }, session: null }, error: null };
        if (email === 'slow@example.com') return { data: {}, error: { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 12 seconds.' } };
        return { data: { user: { id: 'u1', identities: [{}] }, session: null }, error: null };
      },
      async signInWithPassword() { return { data: {}, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } }; },
      async verifyOtp({ email, token }) {
        window.__verified = token;
        if (token !== '12345678') return { data: {}, error: { code: 'otp_expired', message: 'Token has expired or is invalid' } };
        window.__fakeSession = { user: { id: 'u1', email, email_confirmed_at: new Date().toISOString(), user_metadata: { display_name: 'Sam' } } };
        return { data: { session: window.__fakeSession }, error: null };
      },
      async resend() {
        window.__resends += 1;
        if (window.__resends > 1) return { error: { message: 'For security purposes, you can only request this after 37 seconds.' } };
        return { error: null };
      },
      onAuthStateChange(fn) { listeners.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
      async signOut() { window.__fakeSession = null; return { error: null }; },
    },
    from() {
      let write;
      const filters = new Map();
      const query = {
        select() { return query; },
        eq(key, value) { filters.set(key, value); return query; },
        async maybeSingle() { return { data: progressRow, error: null }; },
        upsert(row, { ignoreDuplicates } = {}) {
          write = () => {
            if (progressRow && ignoreDuplicates) return [];
            progressRow = row;
            return [{ user_id: row.user_id }];
          };
          return query;
        },
        insert(row) { write = () => { progressRow = row; return [{ user_id: row.user_id }]; }; return query; },
        update(changes) {
          write = () => {
            if (!progressRow || [...filters].some(([key, value]) => progressRow[key] !== value)) return [];
            progressRow = { ...progressRow, ...changes };
            return [{ user_id: progressRow.user_id }];
          };
          return query;
        },
        then(resolve) { return Promise.resolve({ data: write?.() || [], error: null }).then(resolve); },
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

async function openPage(viewport, route) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://esm.sh/**', (route) => route.fulfill({ contentType: 'application/javascript', body: FAKE_SUPABASE }));
  await page.goto(`${BASE}#${route}`);
  await page.waitForSelector('[data-form]', { state: 'attached' });
  return { page, errors };
}

async function signUp(viewport, email = 'sam@example.com', { waitForPopup = true } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://esm.sh/**', (route) => route.fulfill({ contentType: 'application/javascript', body: FAKE_SUPABASE }));
  await page.goto(`${BASE}#/signup`);
  await page.waitForSelector('[data-form]');
  await page.fill('input[name=displayName]', 'Sam');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'a-long-password-1');
  await page.locator('[data-form] button[type=submit]').click();
  if (waitForPopup) await page.waitForSelector('dialog.verify[open]');
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

test('typing the code confirms the account; a wrong code says so', { skip }, async () => {
  const { page, errors } = await signUp({ width: 1366, height: 860 });
  await page.keyboard.type('99999999');
  await page.waitForSelector('[data-verify-error]:not([hidden])');
  assert.match(await page.locator('[data-verify-error]').textContent(), /isn’t right or has expired/);
  // Pasting the whole code into the first box fills every box.
  await page.locator('[data-otp-box]').first().focus();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text', '1234 5678');
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('dialog.verify.verify--done');
  assert.equal(await page.evaluate(() => window.__verified), '12345678');
  await page.locator('[data-verify-continue]').click();
  await page.waitForFunction(() => location.hash.startsWith('#/subjects'));
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some((key) => key.endsWith(':awaiting-confirmation'))), false);
  assert.deepEqual(errors, []);
  await page.close();
});

test('closing the popup pauses the form, even after a reload, so the first email keeps working', { skip }, async () => {
  const { page, errors } = await signUp({ width: 1366, height: 860 });
  await page.locator('[data-verify-close]').click();
  await page.waitForSelector('[data-waiting]:not([hidden])');
  assert.ok(await page.locator('[data-form]').isHidden());
  await page.reload();
  await page.waitForSelector('[data-waiting]:not([hidden])');
  assert.match(await page.locator('[data-waiting]').textContent(), /sam@example\.com/);
  await page.locator('[data-wait-code]').click();
  await page.waitForSelector('dialog.verify[open]');
  await page.locator('[data-verify-close]').click();
  await page.locator('[data-wait-change]').click();
  assert.ok(await page.locator('[data-form]').isVisible());
  assert.equal(await page.inputValue('input[name=email]'), 'sam@example.com');
  assert.deepEqual(errors, []);
  await page.close();
});

test('an email that already has an account offers Log in and Reset password', { skip }, async () => {
  const { page, errors } = await signUp({ width: 1366, height: 860 }, 'taken@example.com', { waitForPopup: false });
  await page.waitForSelector('[data-notice]:not([hidden])');
  assert.match(await page.locator('[data-notice]').textContent(), /already have an account/);
  assert.equal(await page.locator('dialog.verify').count(), 0);
  await page.locator('[data-notice] button', { hasText: 'Log in' }).click();
  await page.waitForFunction(() => location.hash.startsWith('#/login'));
  await page.waitForSelector('input[name=email]');
  assert.equal(await page.inputValue('input[name=email]'), 'taken@example.com');
  assert.deepEqual(errors, []);
  await page.close();
});

test('asking for emails too fast counts down on the button instead of showing Supabase text', { skip }, async () => {
  const { page, errors } = await signUp({ width: 1366, height: 860 }, 'slow@example.com', { waitForPopup: false });
  await page.waitForSelector('[data-error]:not([hidden])');
  assert.match(await page.locator('[data-error]').textContent(), /Please wait 12 seconds/);
  assert.match(await page.locator('[data-form] button[type=submit]').textContent(), /^Try again in 0:1\d$/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('logging in before confirming offers to enter the code or send a new one', { skip }, async () => {
  const { page, errors } = await openPage({ width: 1366, height: 860 }, '/login');
  await page.fill('input[name=email]', 'sam@example.com');
  await page.fill('input[name=password]', 'a-long-password-1');
  await page.locator('[data-form] button[type=submit]').click();
  await page.waitForSelector('[data-notice]:not([hidden])');
  assert.match(await page.locator('[data-notice]').textContent(), /haven’t confirmed your email/);
  await page.locator('[data-notice] button', { hasText: 'Send a new code' }).click();
  await page.waitForSelector('dialog.verify[open]');
  assert.equal(await page.evaluate(() => window.__resends), 1);
  assert.deepEqual(errors, []);
  await page.close();
});

test('an account confirmed elsewhere does not leave the sign-up form stuck waiting for a code', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://esm.sh/**', (route) => route.fulfill({ contentType: 'application/javascript', body: FAKE_SUPABASE }));
  // This browser still remembers a sign-up from earlier.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('onspec:awaiting-confirmation', JSON.stringify({ email: 'sam@example.com', name: 'Sam', sentAt: Date.now() }));
    }
  });
  await page.goto(`${BASE}#/signup`);
  // The waiting card offers Log in for people who have already confirmed.
  await page.waitForSelector('[data-waiting]:not([hidden])');
  assert.equal(await page.locator('[data-wait-login]').count(), 1);
  // The account was then confirmed via the email link in another tab: once that confirmed
  // session loads here, the remembered sign-up is cleared.
  const cleared = await page.evaluate(async () => {
    window.__fakeSession = { user: { id: 'u1', email: 'sam@example.com', email_confirmed_at: new Date().toISOString(), user_metadata: { display_name: 'Sam' } } };
    const api = await import('/js/data/api.js');
    await api.init();
    return [api.awaitingConfirmation(), localStorage.getItem('onspec:awaiting-confirmation')];
  });
  assert.deepEqual(cleared, [null, null]);
  assert.deepEqual(errors, []);
  await page.close();
});
