// Account: profile, password, appearance, and control over your own data
// (export, import, reset, delete).

import { APP, LIMITS } from '../../config/app.config.js';
import { $, download, html, on, readFileText, setHtml } from '../../core/dom.js';
import { fmtDate, plural } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { icon } from '../icons.js';
import { getThemePreference, setThemePreference } from '../theme.js';
import { banner, confirmDialog, pageHead, toast } from '../ui.js';
import { roadmap } from './landing.js';

export async function mount(element, context) {
  context.setTitle('Account');
  const user = api.currentUser();
  const progress = api.getProgress();
  const backend = api.backendInfo();
  const theme = getThemePreference();

  setHtml(
    element,
    html`${pageHead({
        title: 'Account',
        sub: `Signed in as ${user.email}. Member since ${fmtDate(user.created_at)}.`,
        actions: html`<button type="button" class="btn" data-logout>${icon('logout')} Log out</button>`,
      })}
      <div class="grid grid--2">
        <div class="stack">
          ${user.is_demo ? banner(html`<strong>Demo account.</strong> Anything you change here only affects the demo profile in this browser.`, { type: 'demo' }) : ''}
          <section class="card">
            <h2 class="card__title">Profile</h2>
            <form class="stack" data-profile style="margin-top:14px" novalidate>
              <label class="field"><span class="field__label">Name</span><input class="input" name="display_name" value="${user.display_name}" maxlength="40" required /></label>
              <label class="field"><span class="field__label">Email</span><input class="input" type="email" name="email" value="${user.email}" autocomplete="email" required /></label>
              <p class="form-error" role="alert" data-profile-error hidden></p>
              <div><button type="submit" class="btn btn--primary">Save profile</button></div>
            </form>
          </section>
          <section class="card">
            <h2 class="card__title">Password</h2>
            <form class="stack" data-password style="margin-top:14px" novalidate>
              <label class="field"><span class="field__label">Current password</span><input class="input" type="password" name="current" autocomplete="current-password" required /></label>
              <label class="field">
                <span class="field__label">New password</span>
                <input class="input" type="password" name="next" autocomplete="new-password" required />
                <span class="field__hint">At least ${LIMITS.minPasswordLength} characters.</span>
              </label>
              <p class="form-error" role="alert" data-password-error hidden></p>
              <div><button type="submit" class="btn">Change password</button></div>
            </form>
          </section>
          <section class="card">
            <h2 class="card__title">Appearance</h2>
            <div class="seg" role="radiogroup" aria-label="Theme" style="margin-top:14px">
              ${[['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(
                ([value, label]) => html`<button type="button" class="seg__opt" role="radio" aria-checked="${theme === value}" data-theme-choice="${value}">${label}</button>`,
              )}
            </div>
          </section>
        </div>
        <div class="stack">
          <section class="card">
            <h2 class="card__title">Your data</h2>
            <p class="muted" style="margin:8px 0 14px">
              Stored in: <strong>${backend.label}</strong>.
              ${backend.syncsAcrossDevices
                ? 'Your progress syncs across your devices.'
                : 'Your progress stays on this device and does not sync yet. Export a copy to back it up or move it to another device.'}
            </p>
            <ul class="facts">
              <li><span>Subjects</span><strong>${progress.enrolled_subjects.length}</strong></li>
              <li><span>Spec points learned</span><strong>${progress.learned_spec_points.length}</strong></li>
              <li><span>Question attempts</span><strong>${progress.question_attempts.length}</strong></li>
              <li><span>Papers and tests</span><strong>${progress.paper_attempts.length}</strong></li>
            </ul>
            <div class="row" style="margin-top:16px">
              <button type="button" class="btn" data-export>${icon('download')} Export my data</button>
              <label class="btn">${icon('upload')} Import data<input type="file" accept="application/json,.json" data-import hidden /></label>
            </div>
            <div class="card__foot">
              <p class="small muted" style="margin-bottom:10px">These cannot be undone. Export a copy first if you might want it back.</p>
              <div class="row">
                <button type="button" class="btn" data-reset>Reset my progress</button>
                <button type="button" class="btn btn--danger" data-delete>Delete account</button>
              </div>
            </div>
          </section>
          <section class="card">
            <h2 class="card__title">Roadmap</h2>
            ${roadmap()}
          </section>
          <section class="card">
            <h2 class="card__title">For the site owner</h2>
            <p class="muted" style="margin:8px 0 14px">Check the question and paper database, and prepare new content to add.</p>
            <a class="btn" href="#/studio">${icon('database')} Open the Content Studio</a>
            <p class="small muted" style="margin-top:12px">${APP.name} version ${APP.version}</p>
          </section>
        </div>
      </div>`,
  );

  const showError = (selector, message) => {
    const line = $(selector, element);
    line.textContent = message || '';
    line.hidden = !message;
  };

  on(element, 'submit', '[data-profile]', async (event, form) => {
    event.preventDefault();
    showError('[data-profile-error]', '');
    try {
      await api.updateProfile(Object.fromEntries(new FormData(form)));
      toast('Profile saved.', { type: 'success' });
    } catch (error) {
      showError('[data-profile-error]', error.message);
    }
  });

  on(element, 'submit', '[data-password]', async (event, form) => {
    event.preventDefault();
    showError('[data-password-error]', '');
    const { current, next } = Object.fromEntries(new FormData(form));
    try {
      await api.changePassword(current, next);
      form.reset();
      toast('Password changed.', { type: 'success' });
    } catch (error) {
      showError('[data-password-error]', error.message);
    }
  });

  on(element, 'click', '[data-theme-choice]', (event, button) => {
    setThemePreference(button.dataset.themeChoice);
    for (const option of element.querySelectorAll('[data-theme-choice]')) option.setAttribute('aria-checked', String(option === button));
  });

  on(element, 'click', '[data-export]', () => {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`${APP.storageNamespace}-progress-${stamp}.json`, JSON.stringify(api.exportData(), null, 2));
    toast('Your data has been downloaded.', { type: 'success' });
  });

  on(element, 'change', '[data-import]', async (event, input) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await readFileText(file));
      const incoming = data?.progress ?? data;
      const confirmed = await confirmDialog({
        title: 'Replace your progress with this file?',
        message: `The file holds ${plural(incoming?.question_attempts?.length ?? 0, 'question attempt')} and ${plural(incoming?.paper_attempts?.length ?? 0, 'paper or test', 'papers and tests')}. Your current progress in this account will be replaced.`,
        confirmLabel: 'Replace my progress',
      });
      if (!confirmed) return;
      await api.importData(data);
      toast('Progress imported.', { type: 'success' });
      context.refresh();
    } catch (error) {
      toast(error instanceof SyntaxError ? 'That file is not valid JSON.' : error.message, { type: 'error' });
    }
  });

  on(element, 'click', '[data-reset]', async () => {
    const confirmed = await confirmDialog({
      title: 'Reset your progress?',
      message: 'Your subjects, learned topics, attempts and history will be cleared. Your account stays.',
      confirmLabel: 'Reset progress',
      danger: true,
    });
    if (!confirmed) return;
    await api.resetProgress();
    toast('Progress reset.');
    context.refresh();
  });

  on(element, 'click', '[data-delete]', async () => {
    const confirmed = await confirmDialog({
      title: 'Delete your account?',
      message: 'Your account and all of its progress will be removed from this browser. This cannot be undone.',
      confirmLabel: 'Delete account',
      danger: true,
    });
    if (confirmed) await api.deleteAccount();
  });

  on(element, 'click', '[data-logout]', () => api.signOut());
}
