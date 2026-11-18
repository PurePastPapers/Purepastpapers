// "Check your email": the popup shown after signing up while Supabase waits for the
// confirmation link. Styled like the Enlarge popup (js/ui/zoom.js). It offers a resend
// (Supabase allows one every 60 seconds), lets the student go back and fix the address,
// and turns into "You're in!" by itself once the link is opened in this browser.

import { esc } from '../core/dom.js';
import * as api from '../data/api.js';

const RESEND_WAIT = 60;

const envelope = (done) => `<svg class="verify__art" width="96" height="74" viewBox="0 0 96 74" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
  <rect x="6" y="14" width="76" height="52" rx="4" fill="var(--surface-2)"/><path d="M6 18l38 28 38-28"/><path d="M6 62l28-22M82 62L54 40"/>
  ${done ? '<circle cx="78" cy="16" r="13" fill="var(--surface)"/><path d="M72 16l4.5 4.5L85 12"/>' : '<path d="M86 6l4-4M90 14h5M78 4l2-4"/>'}</svg>`;

const infoIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';

/**
 * Opens the popup. `onChangeEmail` runs when the student wants to fix the address.
 * Returns a function that closes it.
 */
export function openVerifyEmail({ email, name = '', onChangeEmail = () => {} }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal verify';
  dialog.setAttribute('aria-labelledby', 'verify-title');
  dialog.innerHTML = `<i class="tape tape--c verify__tape" aria-hidden="true"></i><div class="modal__box">
    <header class="modal__head"><h2 class="modal__title" id="verify-title">Check your email</h2>
      <button type="button" class="btn btn--sm" data-verify-close>Close</button></header>
    <div class="modal__body" data-verify-body>
      ${envelope(false)}
      <p class="verify__lead">We’ve sent a link to</p><span class="verify__email">${esc(email)}</span>
      <p class="verify__text">Open the email and press <b>Confirm my email</b> to finish creating your account. This popup will update on its own once you have.</p>
      <p class="verify__hint">${infoIcon}<span><b>Can’t see it?</b> It can take a minute to arrive. Check your spam or junk folder too.</span></p>
      <p class="verify__error" data-verify-error role="alert" hidden></p>
    </div>
    <footer class="modal__foot" data-verify-foot>
      <button type="button" class="btn btn--ghost" data-verify-change>Wrong email? Change it</button>
      <span class="verify__resend"><span class="verify__sent" data-verify-sent hidden>✓ Sent again</span>
        <button type="button" class="btn" data-verify-resend>Resend email</button></span>
    </footer></div>`;

  let timer = null;
  let confirmed = false;
  const resendButton = dialog.querySelector('[data-verify-resend]');
  const errorLine = dialog.querySelector('[data-verify-error]');

  const countdown = (seconds) => {
    clearInterval(timer);
    let left = seconds;
    const tick = () => {
      if (left <= 0) {
        clearInterval(timer);
        resendButton.disabled = false;
        resendButton.textContent = 'Resend email';
        return;
      }
      resendButton.disabled = true;
      resendButton.textContent = `Resend in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      left -= 1;
    };
    tick();
    timer = setInterval(tick, 1000);
  };

  const stopWatching = api.watchConfirmation(email, (user) => {
    confirmed = true;
    clearInterval(timer);
    const first = String(name || user?.display_name || '').trim();
    dialog.classList.add('verify--done');
    dialog.querySelector('#verify-title').textContent = 'You’re in!';
    dialog.querySelector('[data-verify-body]').innerHTML = `${envelope(true)}
      <p class="verify__lead">Email confirmed</p><span class="verify__email">${esc(email)}</span>
      <p class="verify__text">You’re all set${first ? `, ${esc(first)}` : ''}. Your progress now saves to your account and syncs across your devices.</p>
      <p class="verify__error" data-verify-error role="alert" hidden></p>`;
    dialog.querySelector('[data-verify-foot]').innerHTML = '<span></span><button type="button" class="btn btn--primary" data-verify-continue>Choose my subjects</button>';
    dialog.querySelector('[data-verify-continue]').focus();
  });

  const finish = async () => {
    try {
      await api.finishConfirmedSignup();
    } catch (error) {
      const line = dialog.querySelector('[data-verify-error]');
      line.textContent = error.message || 'Something went wrong. Try logging in.';
      line.hidden = false;
      return false;
    }
    return true;
  };

  const close = () => {
    stopWatching();
    clearInterval(timer);
    if (dialog.open) dialog.close();
    dialog.remove();
  };

  dialog.addEventListener('click', async (event) => {
    const target = event.target;
    if (target.closest('[data-verify-continue]')) {
      target.closest('button').disabled = true;
      if (await finish()) close();
      else target.closest('button').disabled = false;
      return;
    }
    if (target === dialog || target.closest('[data-verify-close]')) {
      if (confirmed) { await finish(); close(); return; }
      return close();
    }
    if (target.closest('[data-verify-change]')) {
      close();
      onChangeEmail();
      return;
    }
    if (target.closest('[data-verify-resend]')) {
      errorLine.hidden = true;
      resendButton.disabled = true;
      try {
        await api.resendConfirmation(email);
        dialog.querySelector('[data-verify-sent]').hidden = false;
        countdown(RESEND_WAIT);
      } catch (error) {
        const wait = Number(/(\d+)\s*seconds?/.exec(error.message || '')?.[1]);
        if (wait) {
          countdown(wait);
          errorLine.textContent = `You can send another email in ${wait} seconds.`;
        } else {
          resendButton.disabled = false;
          errorLine.textContent = error.message || 'The email could not be sent. Try again.';
        }
        errorLine.hidden = false;
      }
    }
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.querySelector('[data-verify-close]')?.click() ?? close();
  });

  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector('[data-verify-close]').focus();
  return close;
}
