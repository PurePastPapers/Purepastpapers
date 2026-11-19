// "Check your email": the popup shown after signing up while Supabase waits for the account
// to be confirmed. Styled like the Enlarge popup (js/ui/zoom.js). The student can type the
// 6-digit code from the email (works when the email is opened on another device, and email
// link scanners can't use it up) or press the link in the email, which this popup notices by
// itself. It offers a resend (Supabase allows one every 60 seconds) and lets the student go
// back and fix the address.

import { esc } from '../core/dom.js';
import * as api from '../data/api.js';

const RESEND_WAIT = 60;
const CODE_LENGTH = 6;

const infoIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';

/** The three sign-up steps; `current` is 1, 2 or 3 (4 = all done). */
export function signupSteps(current) {
  const names = ['Your details', 'Confirm email', 'Pick subjects'];
  return `<ol class="signup-steps" aria-label="Sign-up steps">${names
    .map((name, index) => {
      const step = index + 1;
      const state = step < current ? 'done' : step === current ? 'on' : '';
      return `<li class="${state}"${state === 'on' ? ' aria-current="step"' : ''}><b aria-hidden="true">${state === 'done' ? '✓' : step}</b><span>${name}</span></li>`;
    })
    .join('')}</ol>`;
}

/**
 * Opens the popup. `onChangeEmail` runs when the student wants to fix the address, and
 * `onClose` whenever the popup closes without the account being confirmed.
 * Returns a function that closes it.
 */
export function openVerifyEmail({ email, name = '', onChangeEmail = () => {}, onClose = () => {} }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal verify';
  dialog.setAttribute('aria-labelledby', 'verify-title');
  dialog.innerHTML = `<i class="tape tape--c verify__tape" aria-hidden="true"></i><div class="modal__box">
    <header class="modal__head"><h2 class="modal__title" id="verify-title">Check your email</h2>
      <button type="button" class="btn btn--sm" data-verify-close>Close</button></header>
    <div class="modal__body" data-verify-body>
      ${signupSteps(2)}
      <p class="verify__lead">We’ve sent a ${CODE_LENGTH}-digit code to</p><span class="verify__email">${esc(email)}</span>
      <div class="otp" role="group" aria-label="${CODE_LENGTH}-digit code" data-otp>
        ${Array.from({ length: CODE_LENGTH }, (_, index) => `${index === CODE_LENGTH / 2 ? '<i aria-hidden="true"></i>' : ''}<input class="otp__box" inputmode="numeric" autocomplete="${index === 0 ? 'one-time-code' : 'off'}" maxlength="${CODE_LENGTH}" aria-label="Digit ${index + 1}" data-otp-box />`).join('')}
      </div>
      <p class="verify__error" data-verify-error role="alert" hidden></p>
      <p class="verify__text verify__text--tight">Type the code from the email. You can open the email on your phone, it still works here.</p>
      <p class="verify__or">or</p>
      <p class="verify__text verify__text--small">Press <b>Confirm my email</b> in the email. This popup updates on its own.</p>
      <p class="verify__hint">${infoIcon}<span><b>Can’t see it?</b> It can take a minute. Check spam or junk. School emails can be slow, so a personal email is often quicker.</span></p>
    </div>
    <footer class="modal__foot" data-verify-foot>
      <button type="button" class="btn btn--ghost" data-verify-change>Wrong email? Change it</button>
      <span class="verify__resend"><span class="verify__sent" data-verify-sent hidden>✓ Sent again</span>
        <button type="button" class="btn" data-verify-resend>Resend code</button></span>
    </footer></div>`;

  let timer = null;
  let confirmed = false;
  let checking = false;
  const resendButton = dialog.querySelector('[data-verify-resend]');
  const boxes = [...dialog.querySelectorAll('[data-otp-box]')];
  const showError = (message) => {
    const line = dialog.querySelector('[data-verify-error]');
    line.textContent = message;
    line.hidden = !message;
  };

  const countdown = (seconds) => {
    clearInterval(timer);
    let left = seconds;
    const tick = () => {
      if (left <= 0) {
        clearInterval(timer);
        resendButton.disabled = false;
        resendButton.textContent = 'Resend code';
        return;
      }
      resendButton.disabled = true;
      resendButton.textContent = `Resend in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      left -= 1;
    };
    tick();
    timer = setInterval(tick, 1000);
  };

  const showConfirmed = (user) => {
    if (confirmed) return;
    confirmed = true;
    stopWatching();
    clearInterval(timer);
    const first = String(name || user?.display_name || '').trim();
    dialog.classList.add('verify--done');
    dialog.querySelector('#verify-title').textContent = 'You’re in!';
    dialog.querySelector('[data-verify-body]').innerHTML = `${signupSteps(3)}
      <p class="verify__lead">Email confirmed</p><span class="verify__email">${esc(email)}</span>
      <p class="verify__text">You’re all set${first ? `, ${esc(first)}` : ''}. Your progress now saves to your account and syncs across your devices.</p>
      <p class="verify__error" data-verify-error role="alert" hidden></p>`;
    dialog.querySelector('[data-verify-foot]').innerHTML = '<span></span><button type="button" class="btn btn--primary" data-verify-continue>Choose my subjects</button>';
    dialog.querySelector('[data-verify-continue]').focus();
  };

  const stopWatching = api.watchConfirmation(email, showConfirmed);

  const code = () => boxes.map((box) => box.value).join('');
  const checkCode = async () => {
    if (checking || confirmed || code().length < CODE_LENGTH) return;
    checking = true;
    showError('');
    boxes.forEach((box) => { box.disabled = true; });
    try {
      const user = await api.verifySignupCode(email, code());
      showConfirmed(user);
    } catch (error) {
      boxes.forEach((box) => { box.disabled = false; box.value = ''; });
      showError(error.message || 'That code didn’t work. Try again.');
      boxes[0].focus();
    } finally {
      checking = false;
    }
  };

  // Spread typed or pasted digits across the boxes, then check the code once all are filled.
  const fillFrom = (index, text) => {
    const digits = String(text).replace(/\D/g, '').slice(0, CODE_LENGTH - index).split('');
    digits.forEach((digit, offset) => { boxes[index + offset].value = digit; });
    const next = boxes[Math.min(index + digits.length, CODE_LENGTH - 1)];
    next.focus();
    checkCode();
  };
  boxes.forEach((box, index) => {
    box.addEventListener('input', () => {
      const typed = box.value;
      box.value = '';
      if (typed) fillFrom(index, typed);
    });
    box.addEventListener('paste', (event) => {
      event.preventDefault();
      fillFrom(index, event.clipboardData?.getData('text') || '');
    });
    box.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !box.value && index > 0) {
        boxes[index - 1].value = '';
        boxes[index - 1].focus();
        event.preventDefault();
      } else if (event.key === 'ArrowLeft' && index > 0) boxes[index - 1].focus();
      else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) boxes[index + 1].focus();
    });
    box.addEventListener('focus', () => box.select());
  });

  const finish = async () => {
    try {
      await api.finishConfirmedSignup();
    } catch (error) {
      showError(error.message || 'Something went wrong. Try logging in.');
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
      close();
      onClose();
      return;
    }
    if (target.closest('[data-verify-change]')) {
      close();
      onChangeEmail();
      return;
    }
    if (target.closest('[data-verify-resend]')) {
      showError('');
      resendButton.disabled = true;
      try {
        await api.resendConfirmation(email);
        api.setAwaitingConfirmation({ email, name });
        dialog.querySelector('[data-verify-sent]').hidden = false;
        countdown(RESEND_WAIT);
      } catch (error) {
        if (error.wait) countdown(error.wait);
        else resendButton.disabled = false;
        showError(error.message || 'The email could not be sent. Try again.');
      }
    }
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.querySelector('[data-verify-close]')?.click() ?? close();
  });

  document.body.append(dialog);
  dialog.showModal();
  boxes[0].focus();
  return close;
}
