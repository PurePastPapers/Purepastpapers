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
  if (recoveryLink) {
    status.textContent = 'This reset link has expired';
    detail.textContent = 'Password reset links work once and expire after an hour. Ask for a new one from the login page.';
    returnLink.hidden = true;
    actions.innerHTML = `<a class="primary" href="${site.href}#/forgot-password">Send me a new reset link</a>`;
    return;
  }
  // Usually the account is already confirmed, so go straight to log in. The log in page
  // explains the old link, and offers a new code if the email still isn't confirmed.
  status.textContent = 'Taking you to log in…';
  detail.textContent = 'That email link has already been used.';
  location.replace(`${site.href}#/login?linkused=1`);
}

try {
  const result = await supabaseAdapter.completeAuthRedirect();
  const requested = new URLSearchParams(location.search).get('next');
  const next = result.recovery ? '/reset-password' : localRoute(requested || result.nextRoute || '/subjects?welcome=1');
  const destination = new URL('./', location.href);
  destination.hash = `#${next}`;
  destination.search = '';
  location.replace(destination.href);
} catch (error) {
  if (linkError || /invalid|expired/i.test(error.message || '')) showUsedLink();
  else {
    status.textContent = 'We couldn’t finish that link';
    detail.textContent = error.message || 'Return to the site and try again.';
    returnLink.href = 'https://purepastpapers.com/#/login';
  }
}
