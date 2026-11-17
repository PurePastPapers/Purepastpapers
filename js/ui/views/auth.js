// Log in and sign up (PRD 4.4: user accounts from Phase 1).

import { LIMITS } from '../../config/app.config.js';
import { $, html, setHtml } from '../../core/dom.js';
import * as api from '../../data/api.js';
import { getSubjects } from '../../data/content-repository.js';
import { icon } from '../icons.js';
import { links } from '../../core/links.js';

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
      <p class="muted small">${signup ? 'It takes under a minute. No card or phone number.' : legacy ? 'Open an older account saved only in this browser.' : 'Pick up where you left off.'}</p>
      <form class="stack" data-form novalidate>
        ${signup
          ? html`<label class="field">
              <span class="field__label">Your first name</span>
              <input class="input" name="displayName" autocomplete="given-name" maxlength="40" required />
            </label>`
          : ''}
        <label class="field">
          <span class="field__label">Email</span>
          <input class="input" type="email" name="email" autocomplete="email" inputmode="email" required />
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
        ${signup
          ? html`<div class="field">
              <span class="field__label">I’m studying</span>
              <div class="seg" role="radiogroup" aria-label="I'm studying" style="width:max-content;max-width:100%">
                ${[['GCSE', 'GCSE'], ['A-Level', 'A-Level'], ['Level 3', 'Level 3'], ['mix', 'A mix']].map(
                  ([value, label]) => html`<button type="button" class="seg__opt" role="radio" aria-checked="false" data-studying="${value}">${label}</button>`,
                )}
              </div>
              <span class="field__hint">Only used to show the right subjects first. You can add any subject later.</span>
            </div>`
          : ''}
        <p class="form-error" role="alert" data-error hidden></p>
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
        ${backend.syncsAcrossDevices
          ? 'Saved to your account, so it’s there on your phone and laptop too.'
          : 'Saved in this browser on this device. It doesn’t sync to other devices yet.'}
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

  let studying = null;
  element.addEventListener('click', (event) => {
    const option = event.target.closest('[data-studying]');
    if (option) {
      studying = option.dataset.studying;
      for (const other of element.querySelectorAll('[data-studying]')) other.setAttribute('aria-checked', String(other === option));
    }
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
        const destination = next || '/subjects?welcome=1';
        context.afterAuth(destination);
        if (studying) await api.setPreference('studyLevel', studying);
        await api.signUp({ ...data, redirectTo: destination });
        if (!api.isSignedIn()) {
          form.reset();
          const statusLine = $('[data-status]', element);
          statusLine.textContent = `We’ve sent a confirmation link to ${String(data.email).trim()}. Open it to finish creating your account.`;
          statusLine.hidden = false;
          button.disabled = false;
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
      fail(error.message);
    }
  });

}
