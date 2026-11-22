// Wait until a page has had no backend requests in flight for a short quiet period.
// (Playwright's waitForLoadState('networkidle') only covers the initial page load.)
export function trackBackend(page, matcher = /supabase\.co\/(rest|auth|functions)\//) {
  const inflight = new Set();
  page.on('request', (request) => { if (matcher.test(request.url())) inflight.add(request); });
  const done = (request) => inflight.delete(request);
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return async function settle(quietMs = 250, timeoutMs = 30_000) {
    const end = Date.now() + timeoutMs;
    let quietSince = inflight.size ? 0 : Date.now();
    while (Date.now() < end) {
      await page.waitForTimeout(50);
      if (inflight.size) quietSince = 0;
      else if (!quietSince) quietSince = Date.now();
      else if (Date.now() - quietSince >= quietMs) return;
    }
    throw new Error(`Backend requests still in flight after ${timeoutMs} ms`);
  };
}
