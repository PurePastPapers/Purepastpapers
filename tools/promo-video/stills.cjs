// Renders chosen frames while designing. Arguments are times in seconds, or "sN" for the settled end of scene N
// (1-based, e.g. s3), or "mN" for the middle of scene N.
//   node stills.cjs s1 s2 12.5     (expects the local server: npm start, or PORT=...)
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const port = process.env.PORT || 5173;
  const dir = path.join(__dirname, 'out', 'stills');
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (m) => { if (['warning', 'error'].includes(m.type())) console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/tools/promo-video/${process.env.PAGE || 'index.html'}?render=1`);
  await page.evaluate(() => window.PROMO.ready);
  const starts = await page.evaluate(() => window.PROMO.sceneStarts);
  const total = await page.evaluate(() => window.PROMO.duration);
  for (const arg of process.argv.slice(2)) {
    let t;
    const m = /^([sm])(\d+)$/.exec(arg);
    if (m) { const i = Number(m[2]) - 1; const end = starts[i + 1] ?? total; t = m[1] === 's' ? end - 1.7 : (starts[i] + end) / 2; } else t = Number(arg);
    await page.evaluate((x) => window.PROMO.seek(x), t);
    const file = path.join(dir, `${arg}.jpg`);
    await page.locator('#stage').screenshot({ path: file, type: 'jpeg', quality: 85 });
    console.log(file, t.toFixed(1));
  }
  await browser.close();
})();
