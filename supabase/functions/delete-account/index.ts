import { withSupabase } from 'npm:@supabase/server@1';

const allowedOrigins = new Set([
  'https://purepastpapers.com',
  'https://www.purepastpapers.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

const authenticatedDelete = withSupabase({ auth: 'user' }, async (_request, context) => {
  const userId = context.userClaims?.id;
  if (!userId) return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401 });

  const { error } = await context.supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    console.error('Account deletion failed:', error.message);
    return new Response(JSON.stringify({ error: 'The account could not be deleted.' }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') || '';
  if (origin && !allowedOrigins.has(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Vary': 'Origin' },
    });
  }
  const headers = corsHeaders(origin);

  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin);

  try {
    const response = await authenticatedDelete(request);
    const responseHeaders = new Headers(response.headers);
    for (const [name, value] of Object.entries(headers)) responseHeaders.set(name, value);
    responseHeaders.set('Content-Type', 'application/json');
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    console.error('Account deletion failed:', error);
    return json({ error: 'The account could not be deleted.' }, 500, origin);
  }
});
