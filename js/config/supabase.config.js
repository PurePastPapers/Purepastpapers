// Public Supabase connection values. Publishable keys are safe in browser code when the
// database is protected with row-level security. Never put a Supabase secret key here.
export const SUPABASE_URL = 'https://spjlnvjdstxdajcsljvq.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_PhvNjl0vIPebOieiK_esUQ_2ZTqzQTC';

// Keep local Node-based tooling on the local adapter; browser production uses Supabase.
export const SUPABASE_CONFIGURED =
  typeof window !== 'undefined' &&
  Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
