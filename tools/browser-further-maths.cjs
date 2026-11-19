// Further Mathematics module routes, in a real browser with fresh state per run.
// Start the site first: npm start (http://localhost:5173). Screenshots go to AUDIT_SCREENSHOT_DIR or /tmp.
//   node tools/browser-further-maths.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE || 'http://localhost:5173';
const S = 'EDX_ALEVEL_FMATH_9FM0';
const out = process.env.AUDIT_SCREENSHOT_DIR || '/tmp';

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // Sandboxed hosts without internet cannot reach external fonts/services; record those apart.
  const offline = [];
  page.on('requestfailed', (r) => { if (/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/.test(r.failure()?.errorText || '')) offline.push(new URL(r.url()).host); });
  const api = (fn, arg) => page.evaluate(fn, arg);
  const prefs = () => api(async (id) => (await import('/js/data/api.js')).getProgress().preferences.moduleRoutes?.[id] || null, S);
  const learned = () => api(async () => [...(await import('/js/data/api.js')).getProgress().learned_spec_points]);
  const sections = () => page.locator('[data-tree] [data-section]').evaluateAll((nodes) => nodes.map((n) => n.dataset.section));

  // Fresh demo account without Further Maths, then add it through the setup dialog.
  await page.goto(base);
  await api(async (id) => { await (await import('/js/data/demo.js')).enterDemoAccount(); await (await import('/js/data/api.js')).setEnrolled(id, false); }, S);
  await page.goto(`${base}/#/subjects`);
  await page.waitForTimeout(1200);
  await page.locator('[data-search]').fill('Further');
  await page.waitForTimeout(300);
  await page.locator(`[data-enrol="${S}"]`).first().click();
  const dialog = page.locator('dialog[open]');
  await dialog.waitFor();
  // Only official routes can be picked: ten cards plus "Not decided yet" per level.
  assert.equal(await dialog.locator('input[name="route-9FM0"]').count(), 11);
  assert.equal(await dialog.locator('input[name="route-8FM0"]').count(), 11);
  assert(await dialog.locator('[data-route-level="9FM0"]').isHidden());
  await dialog.locator('input[name="route-level"][value="9FM0"]').check();
  assert(await dialog.locator('[data-route-level="9FM0"]').isVisible());
  await dialog.locator('.tier-pick', { hasText: '9FM0/3B + 9FM0/3D' }).click();
  const summary = await dialog.locator('[data-route-summary]').textContent();
  assert.match(summary, /A-Level: 9FM0\/3B \+ 9FM0\/3D \(FS1 \+ D1\)/);
  const allCount = Number(await dialog.locator('[data-all-count]').textContent());
  assert.equal(allCount, 54 + 15 + 18, 'A-Level Core Pure + FS1 + D1 points');
  await dialog.locator('input[name="learned"][value="skip"]').check({ force: true });
  await dialog.locator('.modal__box').screenshot({ path: `${out}/fm-setup-dialog.png` });
  await dialog.getByRole('button', { name: 'Add Further Mathematics' }).click();
  await page.waitForTimeout(800);
  assert.deepEqual(await prefs(), { levels: ['9FM0'], routes: { '9FM0': '3B+3D' }, extra: {}, showAll: false });

  // Subject page: Core Pure plus the chosen modules only.
  await page.goto(`${base}/#/subject/${S}`);
  await page.waitForSelector('[data-tree] [data-section]');
  assert.deepEqual(await sections(), ['EDX_FMATH_SEC_CP', 'EDX_FMATH_SEC_FS1', 'EDX_FMATH_SEC_D1']);
  // Tick a Further Statistics point, then switch to Mechanics: the tick is hidden, not lost.
  await page.waitForTimeout(800);
  await page.locator('details[data-section="EDX_FMATH_SEC_FS1"] > summary .tree__section-caret').click();
  await page.locator('[data-topic="EDX_FMATH_FS1_DRV"] > summary .tree__caret').click();
  await page.locator('[data-point="EDX_FMATH_FS1_1.1"]').waitFor({ state: 'visible' });
  await page.locator('[data-point="EDX_FMATH_FS1_1.1"]').check();
  await page.waitForTimeout(400);
  assert((await learned()).includes('EDX_FMATH_FS1_1.1'));
  await page.locator(`[data-module-routes="${S}"]`).first().click();
  const change = page.locator('dialog[open]');
  await change.locator('.tier-pick', { hasText: '9FM0/3C + 9FM0/4C' }).click();
  await change.getByRole('button', { name: 'Save modules' }).click();
  await page.waitForSelector('[data-section="EDX_FMATH_SEC_FM1"]');
  assert.deepEqual(await sections(), ['EDX_FMATH_SEC_CP', 'EDX_FMATH_SEC_FM1', 'EDX_FMATH_SEC_FM2']);
  assert((await learned()).includes('EDX_FMATH_FS1_1.1'), 'switching route keeps learning history');
  await page.locator(`[data-module-routes="${S}"]`).first().click();
  await page.locator('dialog[open] .tier-pick', { hasText: '9FM0/3B + 9FM0/3D' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Save modules' }).click();
  await page.waitForSelector('[data-section="EDX_FMATH_SEC_FS1"]');
  assert.equal(await page.locator('[data-point="EDX_FMATH_FS1_1.1"]').evaluate((box) => box.checked), true, 'the tick returns with its module');
  await page.screenshot({ path: `${out}/fm-subject-tree.png` });

  // Past papers: only Core Pure, FS1 and D1 by default, each labelled A-Level 9FM0/<paper>.
  await page.goto(`${base}/#/papers?subject=${S}`);
  await page.waitForSelector('[data-list] .paper-card');
  const codes = await page.locator('.paper-card__code').allTextContents();
  assert(codes.length > 0 && codes.every((text) => /^A-Level 9FM0\/(01|02|3B|3D)$/.test(text.replace(/\s+/g, ' ').trim())), codes.slice(0, 6).join(' | '));
  await page.screenshot({ path: `${out}/fm-papers-route.png` });
  await page.locator(`[data-module-showall="${S}"]`).first().click();
  await page.waitForTimeout(800);
  const allCodes = await page.locator('.paper-card__code').allTextContents();
  assert(allCodes.some((text) => text.includes('9FM0/3C')), 'All options reveals the other modules');
  assert.equal((await prefs()).showAll, true);
  await page.locator(`[data-module-showall="${S}"]`).first().click();
  await page.waitForTimeout(800);
  assert(!(await page.locator('.paper-card__code').allTextContents()).some((text) => text.includes('9FM0/3C')));

  // Both qualifications in the one subject, with independent routes.
  await page.goto(`${base}/#/subject/${S}`);
  await page.waitForSelector('[data-tree] [data-section]');
  await page.locator(`[data-module-routes="${S}"]`).first().click();
  const both = page.locator('dialog[open]');
  await both.locator('input[name="route-level"][value="8FM0"]').check();
  await both.locator('[data-route-level="8FM0"] .tier-pick', { hasText: '8FM0/2A' }).click();
  await both.getByRole('button', { name: 'Save modules' }).click();
  await page.waitForSelector('[data-section="EDX_FMATH_SEC_AS_FP1"]');
  assert.deepEqual(await sections(), ['EDX_FMATH_SEC_CP', 'EDX_FMATH_SEC_FS1', 'EDX_FMATH_SEC_D1', 'EDX_FMATH_SEC_AS_FP1', 'EDX_FMATH_SEC_AS_FP2']);
  const enrolledCount = await api(async (id) => (await import('/js/data/api.js')).getProgress().enrolled_subjects.filter((s) => s === id).length, S);
  assert.equal(enrolledCount, 1, 'one subject record');

  // Practice pool respects the route; widths have no horizontal overflow.
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [`/#/subject/${S}`, `/#/papers?subject=${S}`, `/#/practice?subject=${S}`]) {
      await page.goto(base + route);
      await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${route} overflows at ${width}`);
    }
    if (width === 390) await page.screenshot({ path: `${out}/fm-practice-390.png`, fullPage: false });
  }

  // Keyboard: the route cards are reachable radios and Escape cancels without saving.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${base}/#/subject/${S}`);
  await page.waitForSelector('[data-tree] [data-section]');
  const before = await prefs();
  await page.locator(`[data-module-routes="${S}"]`).first().focus();
  await page.keyboard.press('Enter');
  await page.locator('dialog[open]').waitFor();
  await page.locator('dialog[open] input[name="route-9FM0"]').first().focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  assert.deepEqual(await prefs(), before, 'Escape leaves the saved route unchanged');

  const real = errors.filter((text) => !/net::ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/.test(text));
  if (offline.length) console.log('unreachable external hosts (environment):', [...new Set(offline)].join(', '));
  assert.deepEqual(real, []);
  console.log('PASS further maths routes');
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
