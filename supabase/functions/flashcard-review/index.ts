import { createCard, rateCard, SCHEDULER_VERSION } from '../../../js/flashcards/scheduler.js';

const origins = new Set([
  'https://purepastpapers.com',
  'https://www.purepastpapers.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ReviewRequest = {
  cardId: string;
  requestId: string;
  revision: number;
  grade: number;
};

function keys(variable: string) {
  return JSON.parse(Deno.env.get(variable) || '{}');
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') || '';
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: 'Origin not allowed.' }, 403);
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply({ error: 'Sign in again to save this review.' }, 401);

  let action: ReviewRequest;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const decoder = new TextDecoder();
    let body = '';
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) {
        await reader.cancel();
        return reply({ error: 'Review request is too large.' }, 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    action = JSON.parse(body + decoder.decode());
    if (!uuid.test(action?.cardId) || !uuid.test(action?.requestId) ||
      !Number.isSafeInteger(action?.revision) || action.revision < 0 ||
      ![1, 2, 3, 4].includes(action?.grade)) throw new Error();
  } catch {
    return reply({ error: 'Check the card and rating, then try again.' }, 400);
  }

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY') || keys('SUPABASE_PUBLISHABLE_KEYS').default;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || keys('SUPABASE_SECRET_KEYS').default;
    if (!url || !serviceKey || !publicKey) throw new Error('Missing database configuration');
    const auth = await fetch(`${url}/auth/v1/user`, { headers: { authorization, apikey: publicKey } });
    if (auth.status === 401 || auth.status === 403) return reply({ error: 'Sign in again to save this review.' }, 401);
    if (!auth.ok) throw new Error('Authentication service unavailable');
    const user = await auth.json();
    if (!uuid.test(user.id)) return reply({ error: 'Sign in again to save this review.' }, 401);

    const serviceHeaders = new Headers({ apikey: serviceKey, 'Content-Type': 'application/json' });
    if (!serviceKey.startsWith('sb_secret_')) serviceHeaders.set('Authorization', `Bearer ${serviceKey}`);
    async function rpc(name: string, parameters: Record<string, unknown>) {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify(parameters),
      });
      if (!response.ok) throw new Error('Database operation failed');
      return response.json();
    }

    const identity = { p_user_id: user.id, p_card_id: action.cardId, p_request_id: action.requestId };
    const prepared = await rpc('flashcard_prepare_review', {
      ...identity,
      p_expected_revision: action.revision,
      p_grade: action.grade,
    });
    if (prepared.status !== 'ready') return reply(prepared);
    const { card } = rateCard(prepared.state ?? createCard(prepared.reviewed_at), action.grade, prepared.reviewed_at, prepared.retention / 100);
    const saved = await rpc('flashcard_commit_review', {
      ...identity,
      p_expected_revision: action.revision,
      p_expected_deck_id: prepared.deck_id,
      p_grade: action.grade,
      p_reviewed_at: prepared.reviewed_at,
      p_scheduler: SCHEDULER_VERSION,
      p_settings: { retention: prepared.retention },
      p_state: card,
    });
    return reply(saved);
  } catch {
    return reply({ error: 'The review could not be confirmed. Retry to check whether it was saved.' }, 503);
  }
});
