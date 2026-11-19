// Supabase Auth + a row-level-security protected user_progress document.
// The app is a static site with no bundler, so supabase-js is loaded from esm.sh on demand.
import { APP, LIMITS } from '../../config/app.config.js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../../config/supabase.config.js';

const namespace = APP.storageNamespace;
const pendingKey = (email) => `${namespace}:pending-signup:${String(email || '').trim().toLowerCase()}`;
const recoverySessionKey = `${namespace}:password-recovery`;
let clientPromise;
let writeQueue = Promise.resolve();

async function getClient() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Cloud accounts are not configured yet.');
  }
  clientPromise ??= (async () => {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2?bundle');
    return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    });
  })();
  return clientPromise;
}

function publicUser(user) {
  if (!user) return null;
  return {
    user_id: user.id,
    email: user.email || '',
    display_name: String(user.user_metadata?.display_name || user.email?.split('@')[0] || 'Student'),
    created_at: user.created_at || new Date().toISOString(),
    is_demo: false,
  };
}

/**
 * Turns a Supabase Auth error into one a student can act on. The returned Error keeps
 * Supabase's code (e.g. email_not_confirmed) in `code`, and `wait` holds the seconds left
 * when an email was asked for too soon.
 */
export function friendlyAuthError(error) {
  const raw = String(error?.message || '');
  const code = error?.code || error?.error_code || '';
  const wait = Number(/(\d+)\s*seconds?/.exec(raw)?.[1]) || 0;
  const make = (message, kind = code) => Object.assign(new Error(message), { code: kind, wait, raw });
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(raw)) {
    return make('You haven’t confirmed your email yet.', 'email_not_confirmed');
  }
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered|already exists/i.test(raw)) {
    return make('You already have an account with this email.', 'account_exists');
  }
  if (code === 'over_email_send_rate_limit' || wait) {
    return make(wait ? `Please wait ${wait} seconds before asking for another email.` : 'Too many emails were sent. Wait a few minutes and try again.', 'rate_limited');
  }
  if (code === 'over_request_rate_limit' || /rate limit/i.test(raw)) {
    return make('Too many tries in a row. Wait a few minutes and try again.', 'rate_limited');
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(raw)) {
    return make('That email and password don’t match. Check them, or reset your password.', 'invalid_credentials');
  }
  if (code === 'otp_expired' || /token has expired|invalid or has expired|otp/i.test(raw)) {
    return make('That code isn’t right or has expired. Check the newest email, or send a new code.', 'bad_code');
  }
  if (code === 'weak_password') return make(raw || 'Choose a stronger password.');
  if (code === 'email_address_invalid') return make('That email address can’t be used. Check it for typos.');
  return make(raw || 'Something went wrong. Try again.');
}

function validEmail(email) {
  const address = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Enter a valid email address.');
  return address;
}

function validatePassword(password) {
  if (String(password || '').length < LIMITS.minPasswordLength) {
    throw new Error(`Choose a password with at least ${LIMITS.minPasswordLength} characters.`);
  }
}

function hasRecoverySession(userId = null) {
  try {
    const record = JSON.parse(sessionStorage.getItem(recoverySessionKey) || 'null');
    const age = Date.now() - record?.at;
    return Boolean(record && (!userId || record.userId === userId) && age >= 0 && age < 30 * 60 * 1000);
  } catch {
    return false;
  }
}

function clearRecoverySession() {
  try { sessionStorage.removeItem(recoverySessionKey); } catch {}
}

function callbackUrl() {
  // Keep the callback on the same origin so its staged signup snapshot is available.
  // Apex, www, and localhost callback URLs are each allow-listed in Supabase.
  return new URL('/auth-callback.html', location.origin).href;
}

function copyGuestPracticeDrafts(userId) {
  try {
    const prefix = `${namespace}:practice:guest:`;
    const drafts = [];
    for (const storage of [sessionStorage, localStorage]) {
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key?.startsWith(prefix)) drafts.push([storage, key, storage.getItem(key)]);
      }
    }
    for (const [storage, key, value] of drafts) {
      localStorage.setItem(`${namespace}:practice:${userId}:${key.slice(prefix.length)}`, value);
      if (storage === sessionStorage) sessionStorage.removeItem(key);
    }
  } catch {
    // Progress still syncs if this browser blocks localStorage.
  }
}

async function restorePendingSignup(email, userId) {
  const key = pendingKey(email);
  let raw;
  try { raw = localStorage.getItem(key); } catch { return null; }
  if (!raw) return null;

  let pending;
  try { pending = JSON.parse(raw); } catch { return null; }
  const guestProgress = pending?.progress || pending;

  // Never replace data that already exists in the cloud account.
  const existing = await supabaseAdapter.loadProgress(userId);
  if (!existing) {
    await supabaseAdapter.saveProgress(userId, { ...guestProgress, user_id: userId });
    copyGuestPracticeDrafts(userId);
    try { localStorage.removeItem(key); } catch {}
    return { imported: true, nextRoute: pending?.nextRoute || null };
  }

  return { imported: false, nextRoute: pending?.nextRoute || null };
}

async function applyPendingSignup(session) {
  return restorePendingSignup(session.user.email, session.user.id);
}

export const supabaseAdapter = {
  id: 'supabase',
  label: 'Your account',
  syncsAcrossDevices: true,

  async currentUser() {
    const client = await getClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error(error.message);
    return publicUser(data.session?.user || null);
  },

  async signUp({ email, password, displayName, redirectTo }) {
    const client = await getClient();
    const address = validEmail(email);
    validatePassword(password);
    const { data, error } = await client.auth.signUp({
      email: address,
      password,
      options: {
        data: { display_name: String(displayName || '').trim() },
        emailRedirectTo: callbackUrl(),
      },
    });
    if (error) throw friendlyAuthError(error);
    // With email confirmation on, Supabase answers a sign-up for an email that already has a
    // confirmed account with a stand-in user that has no identities, and sends no email.
    if (!data.session && Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
      throw friendlyAuthError({ code: 'user_already_exists' });
    }
    if (!data.session) return { pendingConfirmation: true, email: address };
    return publicUser(data.session.user);
  },

  async resendConfirmation(email) {
    const client = await getClient();
    const { error } = await client.auth.resend({
      type: 'signup',
      email: validEmail(email),
      options: { emailRedirectTo: callbackUrl() },
    });
    if (error) throw friendlyAuthError(error);
  },

  /** Confirms a new account with the code from the confirmation email. */
  async verifySignupCode(email, code) {
    const client = await getClient();
    const token = String(code || '').replace(/\D/g, '');
    if (token.length < 6) throw new Error('Enter the code from the email.');
    const { data, error } = await client.auth.verifyOtp({ email: validEmail(email), token, type: 'signup' });
    if (error) throw friendlyAuthError(error);
    if (!data.session?.user) throw new Error('That code didn’t work. Try the link in the email instead.');
    return publicUser(data.session.user);
  },

  /**
   * Calls onConfirmed(user) once this browser has a confirmed session for `email`, for example
   * after the confirmation link was opened in another tab. Returns a function that stops watching.
   */
  watchConfirmation(email, onConfirmed) {
    const address = String(email || '').trim().toLowerCase();
    let stopped = false;
    let subscription = null;
    const check = async () => {
      if (stopped) return;
      try {
        const client = await getClient();
        const { data } = await client.auth.getSession();
        const found = data.session?.user;
        if (stopped || !found || String(found.email || '').toLowerCase() !== address || !found.email_confirmed_at) return;
        stop();
        onConfirmed(publicUser(found));
      } catch {
        // Keep waiting; the next check may succeed.
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const timer = setInterval(check, 4000);
    window.addEventListener('storage', check);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    getClient().then((client) => {
      if (stopped) return;
      // Supabase tells other tabs about a new session; check outside its callback to avoid a lock.
      subscription = client.auth.onAuthStateChange((event, session) => { if (session?.user) setTimeout(check, 0); }).data.subscription;
    }).catch(() => {});
    function stop() {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('storage', check);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
      subscription?.unsubscribe();
    }
    return stop;
  },

  async signIn({ email, password }) {
    const client = await getClient();
    const { data, error } = await client.auth.signInWithPassword({ email: validEmail(email), password });
    if (error) throw friendlyAuthError(error);
    return publicUser(data.user);
  },

  async signOut() {
    const client = await getClient();
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw new Error(error.message);
    clearRecoverySession();
  },

  async updateUser(userId, patch) {
    const client = await getClient();
    const updates = {};
    if (patch.display_name != null) {
      const name = String(patch.display_name).trim();
      if (!name) throw new Error('Enter a display name.');
      updates.data = { display_name: name };
    }
    if (patch.email != null) updates.email = validEmail(patch.email);
    const { data, error } = await client.auth.updateUser(updates);
    if (error) throw new Error(error.message);
    return publicUser(data.user);
  },

  async changePassword(userId, currentPassword, newPassword) {
    const client = await getClient();
    validatePassword(newPassword);
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw new Error(sessionError.message);
    const email = sessionData.session?.user?.email;
    if (!email) throw new Error('Your session has expired. Log in again and retry.');
    const { error: verifyError } = await client.auth.signInWithPassword({ email, password: currentPassword });
    if (verifyError) throw new Error('Your current password is not correct.');
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },

  async requestPasswordReset(email) {
    const client = await getClient();
    const { error } = await client.auth.resetPasswordForEmail(validEmail(email), {
      redirectTo: callbackUrl(),
    });
    if (error) throw new Error(error.message);
  },

  hasPasswordRecoverySession(userId) {
    return hasRecoverySession(userId);
  },

  async setNewPassword(password) {
    const client = await getClient();
    validatePassword(password);
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw new Error(sessionError.message);
    const userId = data.session?.user?.id;
    if (!userId || !hasRecoverySession(userId)) {
      throw new Error('Open the password reset link from your email first.');
    }
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new Error(error.message);
    clearRecoverySession();
  },

  async deleteUser(userId, email) {
    const client = await getClient();
    const { error } = await client.functions.invoke('delete-account', { method: 'POST' });
    if (error) throw new Error(error.message || 'The account could not be deleted. Try again.');
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch (signOutError) {
      // The account is already deleted server-side; local session cleanup must not block UI logout.
      console.warn('Could not clear the deleted account session immediately:', signOutError);
    }
    clearRecoverySession();
    try { localStorage.removeItem(pendingKey(email)); } catch {}
    try {
      const prefix = `${namespace}:practice:${userId}:`;
      for (const storage of [localStorage, sessionStorage]) {
        const keys = [];
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (key?.startsWith(prefix)) keys.push(key);
        }
        for (const key of keys) storage.removeItem(key);
      }
    } catch {
      // Server-side account and progress have been deleted; browser storage may be blocked.
    }
  },

  /** Whether the signed-in account is listed in public.site_owners (checked by row-level security). */
  async isSiteOwner() {
    const client = await getClient();
    const { data, error } = await client.rpc('is_site_owner');
    if (error) throw new Error(`Could not check owner access: ${error.message}`);
    return data === true;
  },

  async loadProgress(userId) {
    const client = await getClient();
    const { data, error } = await client.from('user_progress')
      .select('progress')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`Could not load your saved progress: ${error.message}`);
    return data?.progress ?? null;
  },

  async saveProgress(userId, document) {
    const client = await getClient();
    const snapshot = structuredClone(document);
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      const { error } = await client.from('user_progress').upsert({
        user_id: userId,
        progress: snapshot,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw new Error(`Could not save your progress: ${error.message}`);
    });
    return writeQueue;
  },

  async stagePendingSignup(email, progress, nextRoute) {
    try {
      localStorage.setItem(pendingKey(email), JSON.stringify({ progress, nextRoute }));
    } catch {
      throw new Error('Your browser could not prepare progress for the confirmation link. Free up browser storage and try again.');
    }
  },

  async clearPendingSignup(email) {
    try { localStorage.removeItem(pendingKey(email)); } catch {}
  },

  async restorePendingSignup(email, userId) {
    return restorePendingSignup(email, userId);
  },

  async completeAuthRedirect() {
    // Read the fragment before loading Supabase Auth; it consumes the token hash while
    // creating the session and may clear location.hash.
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    const recovery = hashParams.get('type') === 'recovery';
    const client = await getClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error(error.message);
    if (!data.session?.user) throw new Error('This link is invalid or has expired. Return to the site and try again.');
    const pendingSignup = recovery ? null : await applyPendingSignup(data.session);
    if (recovery) {
      try { sessionStorage.setItem(recoverySessionKey, JSON.stringify({ userId: data.session.user.id, at: Date.now() })); } catch {}
    } else {
      clearRecoverySession();
    }
    return {
      user: publicUser(data.session.user),
      importedGuestProgress: Boolean(pendingSignup?.imported),
      nextRoute: pendingSignup?.nextRoute || null,
      recovery,
    };
  },
};
