// Quick look at chosen frames while designing: node stills.cjs 3.5 12 20.4 ...
// Writes out/stills/t-<time>.jpg. Expects `npm start` (or PORT) to be serving the repo.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const port = process.env.PORT || 5173;
  const times = process.argv.slice(2).map(Number);
  const dir = path.join(__dirname, 'out', 'stills');
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/tools/promo-video/index.html?render=1`);
  await page.evaluate(() => window.PROMO.ready);
  for (const t of times) {
    await page.evaluate((x) => window.PROMO.seek(x), t);
    const file = path.join(dir, `t-${t.toFixed(2)}.jpg`);
    await page.locator('#stage').screenshot({ path: file, type: 'jpeg', quality: 85 });
    console.log(file);
  }
  await browser.close();
})();
