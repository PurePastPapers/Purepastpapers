// Log in and sign up (PRD 4.4: user accounts from Phase 1).

import { APP, LIMITS } from '../../config/app.config.js';
import { $, html, setHtml } from '../../core/dom.js';
import * as api from '../../data/api.js';
import { enterDemoAccount } from '../../data/demo.js';
import { icon } from '../icons.js';

export async function mount(element, context) {
  const signup = context.options.mode === 'signup';
  const next = context.query.next?.startsWith('/') ? context.query.next : null;
  const other = `#/${signup ? 'login' : 'signup'}${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  context.setTitle(signup ? 'Create an account' : 'Log in');
  element.classList.add('view--narrow');

  setHtml(
    element,
    html`<div class="auth card">
      <h1 class="page-head__title" tabindex="-1">${signup ? 'Create your account' : 'Welcome back'}</h1>
      <p class="muted">
        ${signup ? 'Save your subjects, the topics you have learned and every mark you earn.' : `Log in to pick up where you left off in ${APP.name}.`}
      </p>
      <form class="stack" data-form novalidate>
        ${signup
          ? html`<label class="field">
              <span class="field__label">Your name</span>
              <input class="input" name="displayName" autocomplete="given-name" maxlength="40" required />
            </label>`
          : ''}
        <label class="field">
          <span class="field__label">Email</span>
          <input class="input" type="email" name="email" autocomplete="email" inputmode="email" required />
        </label>
        <label class="field">
          <span class="field__label">Password</span>
          <input class="input" type="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required />
          ${signup ? html`<span class="field__hint">At least ${LIMITS.minPasswordLength} characters.</span>` : ''}
        </label>
        <p class="form-error" role="alert" data-error hidden></p>
        <button type="submit" class="btn btn--primary btn--lg btn--block">${signup ? 'Create account' : 'Log in'}</button>
      </form>
      <p class="muted">
        ${signup ? html`Already have an account? <a href="${other}">Log in</a>` : html`New to ${APP.name}? <a href="${other}">Create an account</a>`}
      </p>
      <div class="auth__divider"><span>or</span></div>
      <button type="button" class="btn btn--block" data-demo>${icon('play', { size: 16 })} Explore the demo account</button>
      <p class="small muted">
        Accounts are stored in this browser on this device. They keep different people's progress apart, but they do not sync to other devices yet:
        use Account → Export to move your data.
      </p>
    </div>`,
  );

  const form = $('[data-form]', element);
  const errorLine = $('[data-error]', element);
  const fail = (message) => {
    errorLine.textContent = message;
    errorLine.hidden = false;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorLine.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    const button = $('button[type="submit"]', form);
    if (signup && !String(data.displayName || '').trim()) return fail('Enter your name.');
    button.disabled = true;
    try {
      if (signup) {
        context.afterAuth(next || '/subjects?welcome=1');
        await api.signUp(data);
      } else {
        if (next) context.afterAuth(next);
        await api.signIn(data);
      }
    } catch (error) {
      context.afterAuth(null);
      button.disabled = false;
      fail(error.message);
    }
  });

  const demoButton = $('[data-demo]', element);
  demoButton.addEventListener('click', async () => {
    demoButton.disabled = true;
    try {
      await enterDemoAccount();
    } catch (error) {
      demoButton.disabled = false;
      fail(error.message);
    }
  });
}
