// Site-wide AS / A-Level paper-card labels, in a real browser with a fresh demo account.
// Start the site first: npm start (http://localhost:5173).
//   node tools/browser-paper-labels.cjs
// Every dual-level bank must show AS cards with the AS code and A-Level cards with the
// A-Level code; single-qualification banks show no level label.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BASE || 'http://localhost:5173';
const out = process.env.AUDIT_SCREENSHOT_DIR || '/tmp';

const DUAL = {
  EDX_ALEVEL_MATH_9MA0: ['9MA0', '8MA0'],
  EDX_ALEVEL_BIOL_9BN0: ['9BN0', '8BN0'],
  OCR_ALEVEL_CHEM_H432: ['H432', 'H032'],
  EDX_ALEVEL_PHYS_9PH0: ['9PH0', '8PH0'],
  OCR_ALEVEL_CS_H446: ['H446', 'H046'],
  AQA_ALEVEL_GEOG_7037: ['7037', '7036'],
  EDX_ALEVEL_ENGLIT_9ET0: ['9ET0', '8ET0'],
  AQA_ALEVEL_PSYCH_7182: ['7182', '7181'],
  AQA_ALEVEL_SOC_7192: ['7192', '7191'],
};
const SINGLE = ['EDX_ALEVEL_HIST_9HI0', 'AQA_ALEVEL_POL_7152', 'EDX_GCSE_MATH_1MA1'];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED)/.test(m.text())) errors.push(m.text()); });
  await page.goto(base);
  await page.evaluate(async (ids) => {
    await (await import('/js/data/demo.js')).enterDemoAccount();
    const api = await import('/js/data/api.js');
    for (const id of ids) await api.setEnrolled(id, true);
  }, [...Object.keys(DUAL), ...SINGLE]);

  const cards = async (id) => {
    await page.goto(`${base}/#/papers?subject=${id}`);
    await page.waitForSelector('[data-list] .paper-card');
    return page.locator('.paper-card__code').evaluateAll((nodes) => nodes.map((node) => ({
      level: node.querySelector('.paper-card__level')?.textContent.trim() || '',
      text: node.textContent.replace(/\s+/g, ' ').trim(),
      visible: !node.querySelector('.paper-card__level') || node.querySelector('.paper-card__level').getBoundingClientRect().width > 0,
    })));
  };

  for (const [id, [aCode, asCode]] of Object.entries(DUAL)) {
    const list = await cards(id);
    const as = list.filter((card) => card.level === 'AS');
    const a = list.filter((card) => card.level === 'A-Level');
    assert(as.length > 0 && a.length > 0, `${id}: AS ${as.length}, A-Level ${a.length}`);
    assert.equal(as.length + a.length, list.length, `${id}: every card is labelled`);
    assert(list.every((card) => card.visible), `${id}: label visible`);
    for (const card of as) assert(card.text.startsWith(`AS ${asCode}`) && !card.text.includes(aCode), `${id}: ${card.text}`);
    for (const card of a) assert(card.text.startsWith(`A-Level ${aCode}`), `${id}: ${card.text}`);
    console.log(`${id}: ${as.length} AS (${asCode}), ${a.length} A-Level (${aCode})`);
    if (id === 'EDX_ALEVEL_BIOL_9BN0' || id === 'EDX_ALEVEL_PHYS_9PH0' || id === 'EDX_ALEVEL_MATH_9MA0') {
      await page.screenshot({ path: `${out}/labels-${id}.png` });
    }
  }
  for (const id of SINGLE) {
    const list = await cards(id);
    assert(list.length && list.every((card) => card.level === ''), `${id} must not be labelled`);
    console.log(`${id}: ${list.length} cards, no level label`);
  }

  // The level filter, and widths/overflow on two dual banks.
  await page.goto(`${base}/#/papers?subject=EDX_ALEVEL_PHYS_9PH0`);
  await page.waitForSelector('[data-list] .paper-card');
  await page.locator('[data-filter="level"][data-value="AS"]').click();
  const filtered = await page.locator('.paper-card__level').allTextContents();
  assert(filtered.length && filtered.every((text) => text.trim() === 'AS'));
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of ['EDX_ALEVEL_BIOL_9BN0', 'EDX_ALEVEL_PHYS_9PH0']) {
      await page.goto(`${base}/#/papers?subject=${id}`);
      await page.waitForSelector('[data-list] .paper-card');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${id} overflows at ${width}`);
    }
    if (width === 390) await page.screenshot({ path: `${out}/labels-biology-390.png` });
  }
  // Keyboard: the level chips are reachable and operable.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${base}/#/papers?subject=EDX_ALEVEL_BIOL_9BN0`);
  await page.waitForSelector('[data-list] .paper-card');
  await page.locator('[data-filter="level"][data-value="A-Level"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert((await page.locator('.paper-card__level').allTextContents()).every((text) => text.trim() === 'A-Level'));

  assert.deepEqual(errors, []);
  console.log('PASS paper labels');
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
