import { supabaseAdapter } from './data/adapters/supabase-adapter.js';

const status = document.querySelector('#status');
const detail = document.querySelector('#detail');
const returnLink = document.querySelector('#return');

function localRoute(value) {
  const candidate = String(value || '');
  return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/';
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
  status.textContent = 'We couldn’t finish that link.';
  detail.textContent = error.message || 'The link may have expired. Return to the site and request a new one.';
  returnLink.href = 'https://purepastpapers.com/#/login';
}
