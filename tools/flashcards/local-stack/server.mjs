// Local QA stand-in for the hosted Supabase services that Flashcards uses.
// It is NOT a production component. It exposes a small, faithful subset of:
//   /auth/v1      password sign-in, current user, sign-out (GoTrue)
//   /rest/v1      table reads/writes with eq filters and RPC calls (PostgREST),
//                 executed as the `authenticated` or `service_role` database role
//   /functions/v1/flashcard-review   the real Edge Function source, run under Node
// against a disposable local PostgreSQL database that has the shim and migrations.
//
//   PGHOST=/tmp PGPORT=54329 PGUSER=postgres PGDATABASE=ppp_fc_qa node tools/flashcards/local-stack/server.mjs
import { execFile } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const ANON_KEY = 'local-anon-key';
export const SERVICE_KEY = 'local-service-role-key';
const SECRET = process.env.PPP_LOCAL_JWT_SECRET || randomUUID();
const ident = /^[a-z_][a-z0-9_]*$/;

if (/supabase\.(co|com)|pooler/i.test(process.env.PGHOST || '')) throw new Error('The local stack only runs against a local database.');

function psql(sql) {
  return new Promise((resolvePromise, reject) => {
    execFile('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-c', sql], { maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' } }, (error, stdout, stderr) => {
      if (!error) return resolvePromise(stdout);
      const match = /ERROR:\s+([0-9A-Z]{5}):\s+(.*)/.exec(stderr);
      reject(Object.assign(new Error(match?.[2] || stderr.trim()), { code: match?.[1] || 'XX000' }));
    });
  });
}

export const literal = (value) => value === null || value === undefined ? 'null' : `'${String(value).replace(/'/g, "''")}'`;
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
function sign(payload) {
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
function verify(token) {
  const [header, payload, signature] = String(token || '').split('.');
  if (!signature || createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url') !== signature) return null;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return claims.exp > Date.now() / 1000 ? claims : null;
}
export const passwordHash = (password) => createHash('sha256').update(`ppp-local:${password}`).digest('hex');

// Run one statement inside a transaction as the caller's database role.
async function asCaller(caller, statement) {
  const prelude = caller.role === 'service_role'
    ? 'set local role service_role;'
    : `set local role ${caller.role};select set_config('request.jwt.claims',${literal(JSON.stringify(caller.claims || {}))},true),set_config('request.jwt.claim.sub',${literal(caller.claims?.sub || '')},true);`;
  const output = await psql(`begin;${prelude}${statement};commit;`);
  const lines = output.split('\n').filter(Boolean);
  // set_config emits one line; the statement's JSON result is the final line.
  return lines.length ? JSON.parse(lines[lines.length - 1]) : null;
}

async function userRow(where) {
  const out = await psql(`select coalesce(jsonb_agg(u),'[]') from (select id,email,email_confirmed_at,encrypted_password,raw_user_meta_data,created_at from auth.users where ${where}) u`);
  return JSON.parse(out)[0] || null;
}
const publicUser = (user) => ({
  id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email,
  email_confirmed_at: user.email_confirmed_at, user_metadata: user.raw_user_meta_data || {}, app_metadata: {}, created_at: user.created_at,
});
function session(user) {
  const expiresIn = 3600;
  const claims = { sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + expiresIn };
  return { access_token: sign(claims), token_type: 'bearer', expires_in: expiresIn, expires_at: claims.exp, refresh_token: sign({ ...claims, refresh: true, exp: claims.exp + 86400 }), user: publicUser(user) };
}

function callerFor(headers) {
  const apikey = headers.apikey;
  const bearer = /^Bearer\s+(.+)$/i.exec(headers.authorization || '')?.[1];
  if (apikey === SERVICE_KEY || bearer === SERVICE_KEY) return { role: 'service_role' };
  if (apikey !== ANON_KEY && !verify(bearer)) return null;
  const claims = bearer && bearer !== ANON_KEY ? verify(bearer) : null;
  if (bearer && bearer !== ANON_KEY && !claims) return null;
  return claims ? { role: 'authenticated', claims } : { role: 'anon', claims: { role: 'anon' } };
}

function filters(params) {
  const clauses = [];
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    const column = /^([a-z_][a-z0-9_]*)(?:->>'?([a-z_]+)'?)?$/.exec(key);
    if (!column) throw Object.assign(new Error(`Unsupported filter ${key}`), { code: 'PGRST100', status: 400 });
    const target = column[2] ? `${column[1]}->>${literal(column[2])}` : column[1];
    const [op, ...rest] = raw.split('.');
    const value = rest.join('.');
    const operators = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
    if (operators[op]) clauses.push(`${target} ${operators[op]} ${literal(value)}`);
    else if (op === 'is') clauses.push(`${target} is ${value === 'null' ? 'null' : value === 'true' ? 'true' : 'false'}`);
    else throw Object.assign(new Error(`Unsupported operator ${op}`), { code: 'PGRST100', status: 400 });
  }
  return clauses.length ? ` where ${clauses.join(' and ')}` : '';
}
function columns(select) {
  if (!select || select === '*') return '*';
  const names = select.split(',').map((name) => name.trim());
  if (!names.every((name) => ident.test(name))) throw Object.assign(new Error('Unsupported select'), { code: 'PGRST100', status: 400 });
  return names.join(',');
}
function order(value) {
  if (!value) return '';
  return ` order by ${value.split(',').map((part) => {
    const [name, direction = 'asc', nulls] = part.split('.');
    if (!ident.test(name) || !['asc', 'desc'].includes(direction)) throw Object.assign(new Error('Unsupported order'), { code: 'PGRST100', status: 400 });
    return `${name} ${direction}${nulls === 'nullslast' ? ' nulls last' : nulls === 'nullsfirst' ? ' nulls first' : ''}`;
  }).join(',')}`;
}

async function table(caller, method, name, params, body, prefer) {
  if (!ident.test(name)) throw Object.assign(new Error('Unknown table'), { code: '42P01', status: 404 });
  const ret = /return=minimal/.test(prefer) ? 'minimal' : /return=representation/.test(prefer) ? 'rep' : method === 'GET' ? 'rep' : 'minimal';
  const select = columns(params.get('select'));
  const wrap = (inner) => `select coalesce(jsonb_agg(r),'[]') from (${inner}) r`;
  if (method === 'GET') {
    const limit = params.get('limit') ? ` limit ${Number.parseInt(params.get('limit'), 10)}` : '';
    const offset = params.get('offset') ? ` offset ${Number.parseInt(params.get('offset'), 10)}` : '';
    return { status: 200, body: await asCaller(caller, wrap(`select ${select} from public.${name}${filters(params)}${order(params.get('order'))}${limit}${offset}`)) };
  }
  const returning = ` returning ${ret === 'rep' ? select : '1'}`;
  let statement;
  if (method === 'POST') {
    const rows = Array.isArray(body) ? body : [body];
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    if (!keys.every((key) => ident.test(key))) throw Object.assign(new Error('Invalid column'), { code: 'PGRST204', status: 400 });
    const conflictTarget = params.get('on_conflict');
    if (conflictTarget && !conflictTarget.split(',').every((key) => ident.test(key))) throw Object.assign(new Error('Invalid conflict target'), { code: 'PGRST100', status: 400 });
    let conflict = '';
    if (/resolution=ignore-duplicates/.test(prefer)) conflict = conflictTarget ? ` on conflict (${conflictTarget}) do nothing` : ' on conflict do nothing';
    else if (/resolution=merge-duplicates/.test(prefer)) conflict = ` on conflict (${conflictTarget}) do update set ${keys.map((key) => `${key}=excluded.${key}`).join(',')}`;
    statement = `insert into public.${name}(${keys.join(',')}) select ${keys.join(',')} from jsonb_populate_recordset(null::public.${name},${literal(JSON.stringify(rows))}::jsonb)${conflict}${returning}`;
  } else if (method === 'PATCH') {
    const keys = Object.keys(body || {});
    if (!keys.length || !keys.every((key) => ident.test(key))) throw Object.assign(new Error('Invalid update'), { code: 'PGRST204', status: 400 });
    statement = `update public.${name} set (${keys.join(',')}) = (select ${keys.join(',')} from jsonb_populate_record(null::public.${name},${literal(JSON.stringify(body))}::jsonb))${filters(params)}${returning}`;
  } else if (method === 'DELETE') {
    statement = `delete from public.${name}${filters(params)}${returning}`;
  } else throw Object.assign(new Error('Method not allowed'), { status: 405 });
  const rows = await asCaller(caller, `with changed as (${statement}) select coalesce(jsonb_agg(c),'[]') from changed c`);
  return ret === 'rep' ? { status: method === 'POST' ? 201 : 200, body: rows } : { status: method === 'POST' ? 201 : 204, body: null };
}

const signatures = new Map();
async function signature(name) {
  if (!signatures.has(name)) {
    const out = await psql(`select coalesce(jsonb_agg(jsonb_build_object('args',coalesce(p.proargnames,'{}'),'types',(select coalesce(jsonb_agg(format_type(t,null) order by o),'[]') from unnest(p.proargtypes) with ordinality a(t,o)),'set',p.proretset,'defaults',p.pronargdefaults)),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=${literal(name)}`);
    signatures.set(name, JSON.parse(out));
  }
  return signatures.get(name);
}
async function rpc(caller, name, args) {
  if (!ident.test(name)) throw Object.assign(new Error('Unknown function'), { code: 'PGRST202', status: 404 });
  const supplied = Object.keys(args || {});
  const overload = (await signature(name)).find((candidate) => {
    const inputs = candidate.args.slice(0, candidate.types.length);
    return supplied.every((key) => inputs.includes(key)) && inputs.length - candidate.defaults <= supplied.length;
  });
  if (!overload) throw Object.assign(new Error(`Could not find the function public.${name}`), { code: 'PGRST202', status: 404 });
  const json = `${literal(JSON.stringify(args || {}))}::jsonb`;
  const parameters = supplied.map((key) => {
    const type = overload.types[overload.args.indexOf(key)];
    const value = type === 'jsonb' || type === 'json' ? `(${json}->${literal(key)})::${type}`
      : type.endsWith('[]') ? `(select array_agg(x) from jsonb_array_elements_text(nullif(${json}->${literal(key)},'null'::jsonb)) x)::${type}`
      : `(${json}->>${literal(key)})::${type}`;
    return `${key} => ${value}`;
  }).join(',');
  const call = `public.${name}(${parameters})`;
  return asCaller(caller, overload.set ? `select coalesce(jsonb_agg(r),'[]') from ${call} r` : `select to_jsonb(${call})`);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  return text ? JSON.parse(text) : undefined;
}

// Load the real Edge Function under a minimal Deno shim.
let reviewHandler;
async function edgeFunction(origin) {
  if (!reviewHandler) {
    globalThis.Deno = {
      env: { get: (name) => ({ SUPABASE_URL: origin, SUPABASE_ANON_KEY: ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY })[name] },
      serve: (handler) => { reviewHandler = handler; },
    };
    const root = resolve(new URL('../../..', import.meta.url).pathname);
    await import(pathToFileURL(resolve(root, 'supabase/functions/flashcard-review/index.ts')).href);
  }
  return reviewHandler;
}

export function startLocalStack({ port = Number(process.env.PPP_LOCAL_STACK_PORT || 54331) } = {}) {
  const origin = `http://127.0.0.1:${port}`;
  const server = createServer(async (request, response) => {
    const cors = {
      'Access-Control-Allow-Origin': request.headers.origin || '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer, accept-profile, content-profile',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    };
    const send = (status, body, extra = {}) => {
      response.writeHead(status, { ...cors, ...(body === null || body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra });
      response.end(body === null || body === undefined ? undefined : JSON.stringify(body));
    };
    const url = new URL(request.url, origin);
    try {
      if (request.method === 'OPTIONS' && !url.pathname.startsWith('/functions/')) return send(204, null);
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
        const { email, password } = await readBody(request);
        const user = await userRow(`lower(email)=lower(${literal(email)}) and encrypted_password=${literal(passwordHash(password))}`);
        if (!user) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' });
        if (!user.email_confirmed_at) return send(400, { error: 'invalid_grant', msg: 'Email not confirmed', code: 'email_not_confirmed' });
        return send(200, session(user));
      }
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
        const { refresh_token: token } = await readBody(request);
        const claims = verify(token);
        const user = claims?.refresh && await userRow(`id=${literal(claims.sub)}`);
        return user ? send(200, session(user)) : send(400, { error: 'invalid_grant', msg: 'Invalid Refresh Token' });
      }
      if (url.pathname === '/auth/v1/user' && request.method === 'GET') {
        const claims = verify(/^Bearer\s+(.+)$/i.exec(request.headers.authorization || '')?.[1]);
        const user = claims && await userRow(`id=${literal(claims.sub)}`);
        return user ? send(200, publicUser(user)) : send(401, { msg: 'Invalid JWT', code: 'bad_jwt' });
      }
      if (url.pathname === '/auth/v1/logout') return send(204, null);
      if (url.pathname.startsWith('/functions/v1/flashcard-review')) {
        const handler = await edgeFunction(origin);
        const body = ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.concat(await (async () => { const c = []; for await (const x of request) c.push(x); return c; })());
        const result = await handler(new Request(url, { method: request.method, headers: request.headers, body }));
        response.writeHead(result.status, Object.fromEntries(result.headers));
        return response.end(Buffer.from(await result.arrayBuffer()));
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        const caller = callerFor(request.headers);
        if (!caller) return send(401, { code: 'PGRST301', message: 'JWT invalid' });
        const rest = url.pathname.slice('/rest/v1/'.length);
        if (rest.startsWith('rpc/')) return send(200, await rpc(caller, rest.slice(4), await readBody(request)));
        const result = await table(caller, request.method, rest, url.searchParams, ['GET', 'DELETE'].includes(request.method) ? undefined : await readBody(request), request.headers.prefer || '');
        return send(result.status, result.body);
      }
      return send(404, { message: 'Not found' });
    } catch (error) {
      const status = error.status || (error.code === '42501' ? 403 : error.code === '28000' ? 401 : ['23505', '23503', '23514', '22023', '22P02', 'P0001'].includes(error.code) ? 400 : 400);
      return send(status, { code: error.code, message: error.message, details: null, hint: null });
    }
  });
  return new Promise((resolvePromise) => server.listen(port, '127.0.0.1', () => resolvePromise({ server, origin })));
}

export async function createUser({ email, password, confirmed = true, id = randomUUID() }) {
  await psql(`insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values (${literal(id)},'authenticated','authenticated',${literal(email)},${literal(passwordHash(password))},${confirmed ? 'now()' : 'null'},'{}','{}',now(),now())`);
  return id;
}
export const sql = psql;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { origin } = await startLocalStack();
  console.log(`Local Flashcards QA stack on ${origin}`);
}
