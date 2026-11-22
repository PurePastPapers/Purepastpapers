// Browser stand-in for the supabase-js subset the site calls, served in place of
// esm.sh during local QA only. It speaks to the same /auth/v1, /rest/v1 and
// /functions/v1 paths, which the QA network module routes to the local stack.
const storageKey = (url) => `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

class Query {
  constructor(client, table) {
    this.client = client; this.table = table; this.params = new URLSearchParams();
    this.method = 'GET'; this.body = undefined; this.prefer = []; this.mode = 'many';
  }
  select(columns = '*') { this.params.set('select', columns.replace(/\s+/g, '')); if (this.method !== 'GET') this.prefer.push('return=representation'); return this; }
  eq(column, value) { this.params.append(column, `eq.${value}`); return this; }
  neq(column, value) { this.params.append(column, `neq.${value}`); return this; }
  order(column, { ascending = true } = {}) { this.params.set('order', `${column}.${ascending ? 'asc' : 'desc'}`); return this; }
  limit(count) { this.params.set('limit', String(count)); return this; }
  range(from, to) { this.params.set('offset', String(from)); this.params.set('limit', String(to - from + 1)); return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  single() { this.mode = 'single'; return this; }
  insert(values) { this.method = 'POST'; this.body = values; return this; }
  update(values) { this.method = 'PATCH'; this.body = values; return this; }
  delete() { this.method = 'DELETE'; return this; }
  upsert(values, { onConflict, ignoreDuplicates = false } = {}) {
    this.method = 'POST'; this.body = values;
    if (onConflict) this.params.set('on_conflict', onConflict);
    this.prefer.push(ignoreDuplicates ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates');
    return this;
  }
  async run() {
    const response = await this.client.fetch(`/rest/v1/${this.table}?${this.params}`, {
      method: this.method, body: this.body === undefined ? undefined : JSON.stringify(this.body),
      headers: this.prefer.length ? { Prefer: this.prefer.join(',') } : {},
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return { data: null, error: { ...payload, message: payload?.message || 'Request failed' }, status: response.status };
    let data = payload;
    if (this.mode !== 'many' && Array.isArray(data)) {
      if (data.length > 1 || (this.mode === 'single' && !data.length)) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
      data = data[0] ?? null;
    }
    return { data, error: null, status: response.status };
  }
  then(resolve, reject) { return this.run().then(resolve, reject); }
}

export function createClient(url, key) {
  const listeners = new Set();
  const read = () => { try { return JSON.parse(localStorage.getItem(storageKey(url)) || 'null'); } catch { return null; } };
  const write = (session) => { if (session) localStorage.setItem(storageKey(url), JSON.stringify(session)); else localStorage.removeItem(storageKey(url)); };
  const emit = (event, session) => { for (const listener of listeners) setTimeout(() => listener(event, session), 0); };
  const client = {
    async fetch(path, init = {}) {
      const session = read();
      return fetch(new URL(path, url), { ...init, headers: { apikey: key, Authorization: `Bearer ${session?.access_token || key}`, 'Content-Type': 'application/json', ...init.headers } });
    },
    auth: {
      async getSession() { return { data: { session: read() }, error: null }; },
      async getUser() {
        const response = await client.fetch('/auth/v1/user');
        const user = await response.json().catch(() => null);
        return response.ok ? { data: { user }, error: null } : { data: { user: null }, error: { message: user?.msg || 'Invalid JWT', status: response.status } };
      },
      async signInWithPassword({ email, password }) {
        const response = await fetch(new URL('/auth/v1/token?grant_type=password', url), { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return { data: { user: null, session: null }, error: { message: body.msg || body.error_description || 'Invalid login credentials', status: response.status, code: body.code } };
        write(body); emit('SIGNED_IN', body);
        return { data: { user: body.user, session: body }, error: null };
      },
      async signOut() { write(null); emit('SIGNED_OUT', null); return { error: null }; },
      onAuthStateChange(callback) {
        listeners.add(callback);
        setTimeout(() => callback('INITIAL_SESSION', read()), 0);
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
      },
      async signUp() { return { data: null, error: { message: 'Sign-up is not available in the local QA stack.' } }; },
      async verifyOtp() { return { data: null, error: { message: 'Not available in the local QA stack.' } }; },
      async resend() { return { data: null, error: null }; },
      async resetPasswordForEmail() { return { data: null, error: null }; },
      async updateUser() { return { data: null, error: { message: 'Not available in the local QA stack.' } }; },
    },
    from: (table) => new Query(client, table),
    async rpc(name, args = {}) {
      const response = await client.fetch(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
      const body = await response.json().catch(() => null);
      return response.ok ? { data: body, error: null } : { data: null, error: { ...body, message: body?.message || 'Request failed' } };
    },
    functions: {
      async invoke(name, { method = 'POST', body } = {}) {
        const response = await client.fetch(`/functions/v1/${name}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
        const data = await response.json().catch(() => null);
        return response.ok ? { data, error: null } : { data: null, error: { message: data?.error || 'Function failed', context: response } };
      },
    },
  };
  return client;
}
