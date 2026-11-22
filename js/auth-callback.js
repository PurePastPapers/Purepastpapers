import { supabaseAdapter } from './data/adapters/supabase-adapter.js';

const status = document.querySelector('#status');
const detail = document.querySelector('#detail');
const returnLink = document.querySelector('#return');
const actions = document.querySelector('#actions');

// Supabase reports a used or expired link in the URL (e.g. #error_code=otp_expired). Read it
// before Supabase Auth loads, because Auth clears the fragment.
const linkParams = new URLSearchParams(`${location.search.slice(1)}&${location.hash.replace(/^#/, '')}`);
const linkError = linkParams.get('error_code') || linkParams.get('error');
const recoveryLink = linkParams.get('type') === 'recovery';

function localRoute(value) {
  const candidate = String(value || '');
  return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/';
}

function showUsedLink() {
  const site = new URL('./', location.href);
  const resetLink = `<a class="primary" href="${site.href}#/forgot-password">Send me a new reset link</a>`;
  if (recoveryLink) {
    status.textContent = 'This reset link has expired';
    detail.textContent = 'Password reset links work once and expire after an hour. Ask for a new one from the login page.';
    returnLink.hidden = true;
    actions.innerHTML = resetLink;
    return;
  }
  // Supabase can omit the link type on errors, including expired recovery links.
  status.textContent = 'This email link has expired or been used';
  detail.textContent = 'Log in if you’ve already confirmed your email, or request a new link to reset your password.';
  returnLink.href = `${site.href}#/login?linkused=1`;
  returnLink.textContent = 'Back to log in';
  actions.innerHTML = resetLink;
}

if (linkError) {
  showUsedLink();
} else {
  try {
    const result = await supabaseAdapter.completeAuthRedirect();
    const requested = new URLSearchParams(location.search).get('next');
    const next = result.recovery ? '/reset-password' : localRoute(requested || result.nextRoute || '/subjects?welcome=1');
    const destination = new URL('./', location.href);
    destination.hash = `#${next}`;
    destination.search = '';
    location.replace(destination.href);
  } catch (error) {
    if (/invalid|expired/i.test(error.message || '')) showUsedLink();
    else {
      status.textContent = 'We couldn’t finish that link';
      detail.textContent = error.message || 'Return to the site and try again.';
      returnLink.href = new URL('./#/login', location.href).href;
    }
  }
}
