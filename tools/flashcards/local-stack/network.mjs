// Playwright network bridge for tools/flashcards/check-browser.mjs
// (PPP_FLASHCARD_QA_NETWORK_MODULE). It serves the local supabase-js stand-in for
// the esm.sh import and sends every request for the configured project URL to the
// local stack, so a browser run never reaches the hosted project.
import { readFile } from 'node:fs/promises';
import { SUPABASE_URL } from '../../../js/config/supabase.config.js';

const stack = process.env.PPP_LOCAL_STACK_ORIGIN || 'http://127.0.0.1:54331';
const shim = await readFile(new URL('./supabase-js-shim.js', import.meta.url));
const project = new URL(SUPABASE_URL).origin;

export async function request(req) {
  const target = new URL(req.url());
  const headers = { ...(await req.allHeaders()) };
  delete headers.host;
  const body = req.postDataBuffer();
  return fetch(`${stack}${target.pathname}${target.search}`, { method: req.method(), headers, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : body });
}

export async function install(context) {
  await context.route('https://esm.sh/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: shim, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await context.route(`${project}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': req.headers().origin || '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' } });
    }
    const response = await request(req);
    const headers = Object.fromEntries(response.headers);
    headers['access-control-allow-origin'] = req.headers().origin || '*';
    await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
  });
}
