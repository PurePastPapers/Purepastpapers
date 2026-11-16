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

function hasRecoverySession(userId) {
  try {
    const record = JSON.parse(sessionStorage.getItem(recoverySessionKey) || 'null');
    return Boolean(record && record.userId === userId && Date.now() - record.at < 30 * 60 * 1000);
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
    if (error) throw new Error(error.message);
    if (!data.session) return { pendingConfirmation: true, email: address };
    return publicUser(data.session.user);
  },

  async signIn({ email, password }) {
    const client = await getClient();
    const { data, error } = await client.auth.signInWithPassword({ email: validEmail(email), password });
    if (error) throw new Error(error.message);
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
    const pendingSignup = await applyPendingSignup(data.session);
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
