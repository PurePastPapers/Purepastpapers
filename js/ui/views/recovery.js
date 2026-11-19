import { LIMITS } from '../../config/app.config.js';
import { $, html, setHtml } from '../../core/dom.js';
import * as api from '../../data/api.js';
import { links } from '../../core/links.js';
import { toast } from '../ui.js';

export async function mount(element, context) {
  const resetting = context.options.mode === 'reset';
  context.setTitle(resetting ? 'Choose a new password' : 'Reset your password');

  if (resetting && !api.isPasswordRecoverySession()) {
    setHtml(element, html`<div class="empty">
      <h1 class="empty__title">That reset link isn’t active</h1>
      <p class="empty__text">Request a new password reset link from the login page.</p>
      <a class="btn btn--primary" href="${links.forgotPassword()}">Request a reset link</a>
    </div>`);
    return;
  }

  setHtml(element, html`<div class="auth-page auth-page--login">
    <div class="auth-page__intro">
      <h1 tabindex="-1">${resetting ? 'Choose a new password' : 'Reset your password'}</h1>
      <p class="hand">${resetting ? 'then you can get back to your papers and practice' : 'we’ll email you a secure reset link'}</p>
    </div>
    <div class="card ruled auth tilt-2">
      <i class="tape tape--c" aria-hidden="true"></i>
      <h2 class="auth__title">${resetting ? 'Set a new password' : 'Check your inbox'}</h2>
      <form class="stack" data-form novalidate>
        ${resetting
          ? html`<label class="field"><span class="field__label">New password</span><input class="input" name="password" type="password" autocomplete="new-password" minlength="${LIMITS.minPasswordLength}" required /><span class="field__hint">At least ${LIMITS.minPasswordLength} characters.</span></label>
              <label class="field"><span class="field__label">Confirm password</span><input class="input" name="confirm" type="password" autocomplete="new-password" required /></label>`
          : html`<label class="field"><span class="field__label">Email</span><input class="input" name="email" type="email" autocomplete="email" inputmode="email" required value="${context.query.email || ''}" /></label>`}
        <p class="form-error" role="alert" data-error hidden></p>
        <p class="field__hint" role="status" data-status hidden></p>
        <button type="submit" class="btn btn--primary btn--lg btn--block">${resetting ? 'Save new password' : 'Send reset link'}</button>
      </form>
      <p class="muted" style="text-align:center"><a href="${links.login()}">Back to log in</a></p>
    </div>
  </div>`);

  const form = $('[data-form]', element);
  const errorLine = $('[data-error]', element);
  const statusLine = $('[data-status]', element);
  const button = $('button[type="submit"]', form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorLine.hidden = true;
    statusLine.hidden = true;
    const values = Object.fromEntries(new FormData(form));
    button.disabled = true;
    try {
      if (!resetting) {
        await api.requestPasswordReset(values.email);
        form.reset();
        statusLine.textContent = 'If that email has an account, a password reset link is on its way.';
        statusLine.hidden = false;
      } else {
        if (String(values.password).length < LIMITS.minPasswordLength) {
          throw new Error(`Choose a password with at least ${LIMITS.minPasswordLength} characters.`);
        }
        if (values.password !== values.confirm) throw new Error('Those passwords do not match.');
        await api.setNewPassword(values.password);
        toast('Your password has been updated.', { type: 'success' });
        context.navigate('/account', { replace: true });
      }
    } catch (error) {
      errorLine.textContent = error.message;
      errorLine.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
}
