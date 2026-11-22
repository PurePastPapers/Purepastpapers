// Further Mathematics module routes, in a real browser with fresh state per run.
// Start the site first: npm start (http://localhost:5173). Screenshots go to AUDIT_SCREENSHOT_DIR or /tmp.
//   node tools/browser-further-maths.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE || 'http://localhost:5173';
const origin = new URL(base).origin;
const S = 'EDX_ALEVEL_FMATH_9FM0';
const out = process.env.AUDIT_SCREENSHOT_DIR || '/tmp';
const offlineError = /ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|EMPTY_RESPONSE)/;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  // Sandboxed hosts without internet cannot reach external fonts/services; record those apart.
  const offline = [];
  const openPage = async (options) => {
    const page = await browser.newPage(options);
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      const url = m.location().url;
      if (m.type() === 'error' && !(offlineError.test(m.text()) && /^https?:/.test(url) && new URL(url).origin !== origin)) {
        errors.push(m.text());
      }
    });
    page.on('requestfailed', (r) => {
      const url = new URL(r.url());
      if (url.origin !== origin && offlineError.test(r.failure()?.errorText || '')) offline.push(url.host);
    });
    return page;
  };
  const page = await openPage({ viewport: { width: 1280, height: 1000 } });
  const api = (fn, arg) => page.evaluate(fn, arg);
  const prefs = () => api(async (id) => (await import('/js/data/api.js')).getProgress().preferences.moduleRoutes?.[id] || null, S);
  const learned = () => api(async () => [...(await import('/js/data/api.js')).getProgress().learned_spec_points]);
  const sections = () => page.locator('[data-tree] [data-section]').evaluateAll((nodes) => nodes.map((n) => n.dataset.section));
  const chooseRoute = async (dialog, level, code) => {
    const option = dialog.locator(`input[name="route-${level}"][value="${code}"]`);
    await option.press('Space');
    assert(await option.isChecked(), `${level} ${code || 'undecided'}`);
  };

  // Fresh demo account without Further Maths, then add it through the setup dialog.
  await page.goto(base);
  await api(async () => {
    await (await import('/js/data/demo.js')).enterDemoAccount();
    const api = await import('/js/data/api.js');
    for (const id of api.getProgress().enrolled_subjects) await api.setEnrolled(id, false);
  });
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
  await chooseRoute(change, '9FM0', '3C+4C');
  await change.getByRole('button', { name: 'Save modules' }).click();
  await page.waitForSelector('[data-section="EDX_FMATH_SEC_FM1"]');
  assert.deepEqual(await sections(), ['EDX_FMATH_SEC_CP', 'EDX_FMATH_SEC_FM1', 'EDX_FMATH_SEC_FM2']);
  assert((await learned()).includes('EDX_FMATH_FS1_1.1'), 'switching route keeps learning history');
  await page.locator(`[data-module-routes="${S}"]`).first().click();
  await chooseRoute(page.locator('dialog[open]'), '9FM0', '3B+3D');
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
  await chooseRoute(both, '8FM0', '2A');
  await both.getByRole('button', { name: 'Save modules' }).click();
  await page.waitForSelector('[data-section="EDX_FMATH_SEC_AS_FP1"]');
  assert.deepEqual(await sections(), ['EDX_FMATH_SEC_CP', 'EDX_FMATH_SEC_FS1', 'EDX_FMATH_SEC_D1', 'EDX_FMATH_SEC_AS_FP1', 'EDX_FMATH_SEC_AS_FP2']);
  const enrolledCount = await api(async (id) => (await import('/js/data/api.js')).getProgress().enrolled_subjects.filter((s) => s === id).length, S);
  assert.equal(enrolledCount, 1, 'one subject record');

  // The AS level filter shows the route's Core Pure paper and two single components.
  await page.goto(`${base}/#/papers?subject=${S}`);
  await page.locator('[data-filter="level"][data-value="AS"]').click();
  const asCodes = await page.locator('.paper-card__code').evaluateAll((cards) => cards
    .filter((card) => card.closest('.paper-group')?.querySelector('h2').textContent !== 'Official samples')
    .map((card) => card.textContent.replace(/\s+/g, ' ').trim()));
  assert(asCodes.some((code) => code === 'AS 8FM0/01'));
  assert(asCodes.some((code) => code === 'AS 8FM0/21 · Paper 2 component'));
  assert(asCodes.some((code) => code === 'AS 8FM0/22 · Paper 2 component'));
  assert(asCodes.every((code) => /^AS 8FM0\/(01|21|22)( · Paper 2 component)?$/.test(code)));
  const component = page.locator('.paper-card', { hasText: 'AS 8FM0/21 · Paper 2 component' }).first();
  assert.match(await component.locator('.paper-card__meta').textContent(), /40 marks · 50 min practice/);
  await component.locator('h3 a').click();
  await page.locator('[data-start="timed"]').waitFor();
  assert.match(await page.locator('[data-start="timed"]').textContent(), /50 min practice/);
  await page.getByText(/The official AS Paper 2 lasts 1 h 40 min for both components/).waitFor();
  assert.match(await page.getByRole('link', { name: 'Question paper (PDF)' }).getAttribute('href'), /^https:\/\/qualifications\.pearson\.com\//);

  // An undecided AS route has Core Pure plus any deliberate extra modules.
  await page.goto(`${base}/#/subject/${S}`);
  await page.locator(`[data-module-routes="${S}"]`).first().click();
  const undecided = page.locator('dialog[open]');
  const asFields = undecided.locator('[data-route-level="8FM0"]');
  await chooseRoute(undecided, '8FM0', '');
  await asFields.locator('.route-extra summary').click();
  await asFields.locator('input[name="route-extra-8FM0"][value="D2"]').check();
  await undecided.getByRole('button', { name: 'Save modules' }).click();
  await page.waitForSelector('[data-section="EDX_FMATH_SEC_AS_D2"]');
  assert.deepEqual(await sections(), ['EDX_FMATH_SEC_CP', 'EDX_FMATH_SEC_FS1', 'EDX_FMATH_SEC_D1', 'EDX_FMATH_SEC_AS_D2']);
  assert.deepEqual((await prefs()).routes, { '9FM0': '3B+3D' });
  assert.deepEqual((await prefs()).extra, { '8FM0': ['D2'] });
  await page.locator(`[data-module-routes="${S}"]`).first().click();
  const restore = page.locator('dialog[open]');
  await chooseRoute(restore, '8FM0', '2A');
  await restore.locator('input[name="route-extra-8FM0"][value="D2"]').uncheck();
  await restore.getByRole('button', { name: 'Save modules' }).click();
  await page.waitForSelector('[data-section="EDX_FMATH_SEC_AS_FP1"]');

  // Choose a real imported paper for each available qualification and module. The
  // catalogue alone can exercise route controls while a bank is published in batches.
  const imported = await api(async (id) => {
    const { getBundle } = await import('/js/data/content-repository.js');
    const bundle = await getBundle(id);
    const byModule = new Map();
    for (const question of bundle.questions) {
      const paper = bundle.papersById.get(question.paper_id);
      if (question.include_in_custom_pool === false || question.is_sample || !paper?.year) continue;
      const key = `${question.qualification_code}/${question.module_id}`;
      if (!byModule.has(key)) byModule.set(key, { id: paper.paper_id, level: question.qualification_code, module: question.module_id });
    }
    return [...byModule.values()];
  }, S);
  if (process.env.REQUIRE_FULL_FMATHS === '1') assert.equal(imported.length, 18, 'all nine modules of both qualifications have questions');
  if (!imported.length) console.log('Catalogue-only check: no official Further Maths questions were available for paper and test sessions.');

  if (imported.length) {
    await page.locator(`[data-module-showall="${S}"]`).first().click();
    await page.waitForSelector('[data-section="EDX_FMATH_SEC_AS_D2"]');
    const storageState = await page.context().storageState();
    for (const item of imported) {
      const page = await openPage({ storageState, viewport: { width: 390, height: 844 } });
      await page.goto(`${base}/#/paper/${S}/${item.id}`);
      await page.locator('[data-questions] [data-open]').first().waitFor();
      if (item.module === 'CP') {
        await page.locator('[data-start="timed"]').click();
        await page.waitForURL('**/#/session/**');
        await page.locator('[data-answer]').first().waitFor();
      }
      await page.goto(`${base}/#/practice?subject=${S}`);
      const qualification = page.locator(`[data-multi="qualifications"][data-value="${item.level}"]`);
      const other = page.locator(`[data-multi="qualifications"][data-value]:not([data-value="${item.level}"])`);
      const paperFilter = page.locator('select[data-filter="paper"]');
      await page.locator('[data-mode="individual"]').waitFor();
      const covered = page.locator('input[data-covered]').first();
      if (await covered.isVisible() && await covered.isChecked()) await covered.press('Space');
      await page.locator('[data-section="fpop-more"] summary').click();
      if (await other.getAttribute('aria-pressed') === 'true') await other.click();
      if (await qualification.getAttribute('aria-pressed') !== 'true') await qualification.click();
      await paperFilter.selectOption(item.id);
      const card = page.locator('article.qcard[data-card], article.qcard[data-group]').first();
      await card.waitFor();
      const questionImage = card.locator('img[data-math-image]').first();
      await questionImage.waitFor();
      await page.waitForFunction((url) => [...document.images].some((image) => image.dataset.mathImage === url && image.naturalWidth > 0), await questionImage.getAttribute('data-math-image'));
      await card.locator('[data-scheme]').first().press('Enter');
      const schemeImage = card.locator('.is-scheme img[data-math-image]').first();
      await schemeImage.waitFor();
      await page.waitForFunction((url) => [...document.images].some((image) => image.dataset.mathImage === url && image.naturalWidth > 0), await schemeImage.getAttribute('data-math-image'));
      await page.locator('[data-mode="timed_test"]').click();
      const buildFilter = page.locator('details', { has: page.locator('summary', { hasText: 'Paper filters' }) });
      assert.equal(await buildFilter.locator(`[data-multi="qualifications"][data-value="${item.level}"]`).getAttribute('aria-pressed'), 'true');
      // The test builder has its own topic draft. Select its scoped topics even
      // if the demo account originally seeded only a subset of covered topics.
      await page.locator('[data-tree-bulk="all"]').press('Enter');
      await page.locator('[data-start-test]').click();
      await page.waitForURL('**/#/session/**');
      await page.locator('[data-answer]').first().waitFor();
      const chosen = await page.evaluate(async ({ subjectId, paperId }) => {
        const { getBundle } = await import('/js/data/content-repository.js');
        const bundle = await getBundle(subjectId);
        const session = (await import('/js/data/api.js')).getSession(location.hash.split('/').at(-1));
        return session.question_ids.map((id) => bundle.questionsById.get(id)?.paper_id === paperId);
      }, { subjectId: S, paperId: item.id });
      assert(chosen.length && chosen.every(Boolean), `${item.id}: test uses the selected qualification and paper`);
      console.log(`Verified real Further Maths flows: ${item.level} ${item.module} ${item.id}`);
      await page.close();
    }
    await page.goto(`${base}/#/subject/${S}`);
    await page.locator(`[data-module-showall="${S}"]`).first().click();
    await page.waitForSelector('[data-section="EDX_FMATH_SEC_AS_D2"]', { state: 'detached' });
  }

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

  if (offline.length) console.log('unreachable external hosts (environment):', [...new Set(offline)].join(', '));
  assert.deepEqual(errors, []);
  console.log('PASS further maths routes');
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
