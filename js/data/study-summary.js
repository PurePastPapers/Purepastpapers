import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config/supabase.config.js';
import { getClient } from './adapters/supabase-adapter.js';

export async function privateStudySummary({ from = null, to = null, accessOnly = false, signal } = {}) {
  const { data: { session } } = await (await getClient()).auth.getSession();
  if (!session?.access_token) return null;
  const response = await fetch(new URL('/rest/v1/rpc/private_study_summary', SUPABASE_URL), {
    method: 'POST',
    cache: 'no-store',
    redirect: 'error',
    credentials: 'omit',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_from: from, p_to: to, p_access_only: accessOnly }),
    signal,
  });
  if ([401, 403, 404].includes(response.status)) return null;
  if (response.status === 400) throw new Error('Choose a date range of up to 366 days ending today or earlier.');
  if (!response.ok) throw new Error('Could not load the study summary. Try again.');
  return response.json();
}
