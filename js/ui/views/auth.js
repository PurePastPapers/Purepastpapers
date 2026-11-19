// Log in and sign up (PRD 4.4: user accounts from Phase 1).

import { LIMITS } from '../../config/app.config.js';
import { $, esc, html, raw, setHtml } from '../../core/dom.js';
import * as api from '../../data/api.js';
import { getSubjects } from '../../data/content-repository.js';
import { icon } from '../icons.js';
import { links } from '../../core/links.js';
import { openVerifyEmail, signupSteps } from '../verify-email.js';

export async function mount(element, context) {
  const signup = context.options.mode === 'signup';
  const legacy = context.options.mode === 'legacy';
  const next = context.query.next?.startsWith('/') ? context.query.next : null;
  const other = signup ? links.login(next) : legacy ? links.login(next) : links.signup(next);
  context.setTitle(signup ? 'Create an account' : legacy ? 'Log in to this browser' : 'Log in');
  const subjects = signup ? await getSubjects() : [];
  const names = [...new Set(subjects.map((subject) => subject.subject.replace(/\s*\(.*\)$/, '')))];
  const backend = api.backendInfo();

  const formCard = html`<div class="card ruled auth tilt-2">
      <i class="tape tape--c" aria-hidden="true"></i>
      <h2 class="auth__title">${signup ? 'Create your account' : legacy ? 'Log in to this browser' : 'Log in'}</h2>
      ${signup ? raw(`<div data-steps>${signupSteps(1)}</div>`) : html`<p class="muted small">${legacy ? 'Open an older account saved only in this browser.' : 'Pick up where you left off.'}</p>`}
      ${!signup && !legacy && context.query.newcode ? html`<p class="auth-notice"><span>${raw(INFO)}</span><span><b>Need a new code?</b>Log in with your email and password. If your email isn’t confirmed yet, we’ll offer to send a new code.</span></p>` : ''}
      ${signup ? html`<div data-waiting hidden></div>` : ''}
      <form class="stack" data-form novalidate>
        ${signup
          ? html`<label class="field">
              <span class="field__label">Your first name</span>
              <input class="input" name="displayName" autocomplete="given-name" maxlength="40" required />
            </label>`
          : ''}
        <label class="field">
          <span class="field__label">Email</span>
          <input class="input" type="email" name="email" autocomplete="email" inputmode="email" required value="${context.query.email || ''}" />
          ${signup ? html`<span class="field__hint">Use an email you can open now. We send a 6-digit code to it.</span>` : ''}
        </label>
        <label class="field">
          <span class="field__label">Password</span>
          <span class="password">
            <input class="input" type="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required data-password />
            <button type="button" class="linkbtn small" data-show aria-pressed="false">Show</button>
          </span>
          ${signup
            ? html`<span class="segbar segbar--strength" aria-hidden="true" data-strength><i></i><i></i><i></i><i></i></span>
                <span class="field__hint" data-strength-text>At least ${LIMITS.minPasswordLength} characters.</span>`
            : ''}
        </label>
        <p class="form-error" role="alert" data-error hidden></p>
        <div data-notice hidden></div>
        <p class="field__hint" role="status" data-status hidden></p>
        <button type="submit" class="btn btn--primary btn--lg btn--block">${signup ? 'Create account' : 'Log in'}</button>
      </form>
      <p class="muted" style="text-align:center">
        ${signup ? html`Already have an account? <a href="${other}">Log in</a>` : legacy ? html`Back to <a href="${links.login(next)}">cloud account login</a>` : html`New here? <a href="${other}">Create a free account</a>`}
      </p>
      ${!signup && !legacy && backend.cloudConfigured ? html`<p class="muted small" style="text-align:center"><a href="${links.forgotPassword()}">Forgot your password?</a></p>
        <p class="muted small" style="text-align:center">Have an older browser-only account? <a href="${links.legacyLogin()}">Log in to it to export your progress</a>.</p>` : ''}
      ${legacy ? html`<p class="muted small" style="text-align:center">After logging in, download your progress, log out, then import it into your cloud account.</p>` : ''}
      <p class="hand auth__note">
        ${signup
          ? backend.cloudConfigured
            ? 'You can still browse papers and practise without an account. An account saves your progress.'
            : 'Cloud account sync is not configured yet; progress stays in this browser.'
          : legacy
            ? 'This older account stays in this browser. Export its progress to move it to a cloud account.'
            : backend.syncsAcrossDevices
              ? 'Your account progress syncs across your devices.'
              : 'This browser-only account does not sync across devices.'}
      </p>
    </div>`;

  setHtml(
    element,
    html`<div class="auth-page ${signup ? '' : 'auth-page--login'}">
      <div class="auth-page__intro">
        <h1 tabindex="-1">${signup ? 'Make your free account' : legacy ? 'Your earlier account' : 'Welcome back'}</h1>
        <p class="hand">${signup ? 'so everything you practise is saved in one place' : legacy ? 'saved on this device before account sync was added' : 'your papers, practice and Data Hub are where you left them'}</p>
        ${signup
          ? html`<div class="card ruled tilt-1 auth-page__get">
                <i class="tape tape--l" aria-hidden="true"></i><i class="tape tape--r" aria-hidden="true"></i>
                <h2 class="card__title">What you get</h2>
                <ol class="steps">
                  <li><i>1</i><div><h3>Your subjects, your colours</h3><p>Pick GCSE, A-Level or Level 3 subjects and set a target grade for each.</p></div></li>
                  <li><i>2</i><div><h3>Questions only on what you’ve learned</h3><p>Tick off topics as you cover them in class. Practice skips the rest.</p></div></li>
                  <li><i>3</i><div><h3>Every mark in the Data Hub</h3><p>See your papers rated against your target, and which topics need work.</p></div></li>
                </ol>
              </div>
              <p class="row row--tight" style="margin-top:28px">
                ${names.slice(0, 7).map((name) => html`<span class="tag">${name}</span>`)}
                ${names.length > 7 ? html`<span class="tag">+ ${names.length - 7} more</span>` : ''}
              </p>`
          : ''}
      </div>
      ${formCard}
    </div>`,
  );

  element.addEventListener('click', (event) => {
    const show = event.target.closest('[data-show]');
    if (show) {
      const input = $('[data-password]', element);
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      show.textContent = visible ? 'Hide' : 'Show';
      show.setAttribute('aria-pressed', String(visible));
    }
  });
  if (signup) {
    $('[data-password]', element).addEventListener('input', (event) => {
      const value = event.target.value;
      const score = value.length === 0 ? 0 : value.length < LIMITS.minPasswordLength ? 1 : 2 + (value.length >= 12 ? 1 : 0) + (/[^A-Za-z]/.test(value) && /[A-Za-z]/.test(value) ? 1 : 0);
      [...$('[data-strength]', element).children].forEach((bar, index) => bar.toggleAttribute('data-on', index < score));
      $('[data-strength-text]', element).textContent =
        value.length && value.length < LIMITS.minPasswordLength ? `At least ${LIMITS.minPasswordLength} characters. ${LIMITS.minPasswordLength - value.length} to go.` : value.length ? `At least ${LIMITS.minPasswordLength} characters. Good so far.` : `At least ${LIMITS.minPasswordLength} characters.`;
    });
  }

  let closeVerify = null;
  let waitTimer = null;
  const form = $('[data-form]', element);
  const errorLine = $('[data-error]', element);
  const notice = $('[data-notice]', element);
  const button = $('button[type="submit"]', form);
  const buttonLabel = button.textContent;
  const emailInput = $('input[name="email"]', form);
  const fail = (message) => {
    errorLine.textContent = message;
    errorLine.hidden = false;
  };
  const clearMessages = () => {
    errorLine.hidden = true;
    notice.hidden = true;
    notice.innerHTML = '';
    emailInput.classList.remove('input--bad');
  };
  /** A warning box with buttons: [label, handler, primary?]. */
  const showNotice = (title, text, actions) => {
    notice.className = 'auth-notice auth-notice--warn';
    notice.innerHTML = `<span>${INFO}</span><div><b>${esc(title)}</b>${esc(text)}<div class="auth-notice__actions">${actions
      .map(([label, , primary], index) => `<button type="button" class="btn ${primary ? 'btn--primary' : ''}" data-action="${index}">${esc(label)}</button>`)
      .join('')}</div></div>`;
    notice.querySelectorAll('[data-action]').forEach((actionButton) => {
      actionButton.addEventListener('click', () => actions[Number(actionButton.dataset.action)][1](actionButton));
    });
    notice.hidden = false;
  };
  /** Supabase only allows one email a minute: count down on the main button instead of erroring. */
  const waitOnButton = (seconds) => {
    clearInterval(waitTimer);
    let left = seconds;
    const tick = () => {
      if (left <= 0) {
        clearInterval(waitTimer);
        button.disabled = false;
        button.textContent = buttonLabel;
        return;
      }
      button.disabled = true;
      button.textContent = `Try again in 0:${String(left).padStart(2, '0')}`;
      left -= 1;
    };
    tick();
    waitTimer = setInterval(tick, 1000);
  };

  const openCode = (email, name = '') => {
    closeVerify?.();
    closeVerify = openVerifyEmail({
      email,
      name,
      onChangeEmail: () => {
        api.setAwaitingConfirmation(null);
        if (signup) showForm();
        else {
          emailInput.focus();
          emailInput.select();
        }
      },
      onClose: () => { if (signup) showWaiting(); },
    });
  };

  // Sign-up: once an email has gone out, pause the form. Pressing Create account again would
  // send a new email, and that cancels the code and link in the first one.
  const waiting = $('[data-waiting]', element);
  const steps = $('[data-steps]', element);
  function showForm() {
    if (!waiting) return;
    waiting.hidden = true;
    form.hidden = false;
    steps.innerHTML = signupSteps(1);
    clearMessages();
    emailInput.focus();
    emailInput.select();
  }
  function showWaiting() {
    const pending = api.awaitingConfirmation();
    if (!waiting || !pending) return showForm();
    const sent = new Date(pending.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    steps.innerHTML = signupSteps(2);
    form.hidden = true;
    waiting.hidden = false;
    waiting.innerHTML = `<div class="auth-notice"><span>${INFO}</span><div><b>Waiting for you to confirm your email</b>We sent a code to <b class="auth-notice__inline">${esc(pending.email)}</b> at ${esc(sent)}. Pressing Create account again would cancel that code, so we’ve paused it.
      <div class="auth-notice__actions"><button type="button" class="btn btn--primary" data-wait-code>Enter the code</button><button type="button" class="btn" data-wait-resend>Resend code</button><button type="button" class="btn btn--ghost" data-wait-change>Use a different email</button></div>
      <p class="form-error" role="alert" data-wait-error hidden></p></div></div>
      <p class="hand auth__note">Only the newest code works. If an email link says it has already been used, just log in.</p>`;
    $('[data-wait-code]', waiting).addEventListener('click', () => openCode(pending.email, pending.name));
    $('[data-wait-change]', waiting).addEventListener('click', () => {
      api.setAwaitingConfirmation(null);
      emailInput.value = pending.email;
      showForm();
    });
    $('[data-wait-resend]', waiting).addEventListener('click', async (event) => {
      const resend = event.currentTarget;
      const line = $('[data-wait-error]', waiting);
      line.hidden = true;
      resend.disabled = true;
      try {
        await api.resendConfirmation(pending.email);
        api.setAwaitingConfirmation({ email: pending.email, name: pending.name });
        openCode(pending.email, pending.name);
      } catch (error) {
        line.textContent = error.message;
        line.hidden = false;
      } finally {
        resend.disabled = false;
      }
    });
  }
  if (signup && api.awaitingConfirmation()) showWaiting();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessages();
    const data = Object.fromEntries(new FormData(form));
    const email = String(data.email || '').trim();
    if (signup && !String(data.displayName || '').trim()) return fail('Enter your name.');
    button.disabled = true;
    try {
      if (signup) {
        const destination = next || '/subjects?welcome=1';
        context.afterAuth(destination);
        await api.signUp({ ...data, redirectTo: destination });
        if (!api.isSignedIn()) {
          button.disabled = false;
          const name = String(data.displayName || '').trim();
          api.setAwaitingConfirmation({ email, name });
          openCode(email, name);
          return;
        }
      } else {
        if (next) context.afterAuth(next);
        if (legacy) await api.signInLegacy(data);
        else await api.signIn(data);
      }
    } catch (error) {
      context.afterAuth(null);
      button.disabled = false;
      if (error.code === 'account_exists') {
        emailInput.classList.add('input--bad');
        showNotice('You already have an account with this email', 'Log in instead. If you’ve forgotten the password, we can email you a reset link.', [
          ['Log in', () => context.navigate(links.login(next, { email }).slice(1)), true],
          ['Reset my password', () => context.navigate(links.forgotPassword(email).slice(1))],
        ]);
      } else if (error.code === 'email_not_confirmed') {
        showNotice('You haven’t confirmed your email yet', `Your account is made, it just needs the code we emailed to ${email}.`, [
          ['Enter the code', () => openCode(email), true],
          ['Send a new code', async (actionButton) => {
            actionButton.disabled = true;
            try {
              await api.resendConfirmation(email);
              openCode(email);
            } catch (resendError) {
              fail(resendError.message);
            } finally {
              actionButton.disabled = false;
            }
          }],
        ]);
      } else if (error.code === 'rate_limited' && error.wait) {
        fail(error.message);
        waitOnButton(error.wait);
      } else {
        fail(error.message);
      }
    }
  });

  return () => {
    clearInterval(waitTimer);
    closeVerify?.();
  };
}

const INFO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
