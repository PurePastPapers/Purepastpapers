// Prints the reading-time audit: node audit.cjs  (expects the local server on :5173)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log('[page]', m.text()); });
  await p.goto(`http://localhost:${process.env.PORT || 5173}/tools/promo-video/index.html?render=1`);
  await p.evaluate(() => window.PROMO.ready);
  const rows = await p.evaluate(() => window.PROMO.audit());
  const total = await p.evaluate(() => window.PROMO.duration);
  console.log('scene  id    bars  secs  words  readsUntil  slack');
  for (const r of rows) console.log(String(r.scene).padEnd(6), r.id.padEnd(5), String(r.bars).padEnd(5), String(r.seconds).padEnd(5), String(r.words).padEnd(6), String(r.readsUntil).padEnd(11), (r.slack < 0 ? 'SHORT ' : r.slack < 1 ? 'tight ' : 'ok    ') + r.slack);
  console.log('total', total.toFixed(1), 's | errors:', errs);
  await b.close();
})();
