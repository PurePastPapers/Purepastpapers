// Account: profile, password, appearance, and control over your own data
// (export, import, reset, delete).

import { APP, LIMITS } from '../../config/app.config.js';
import { $, download, html, on, readFileText, setHtml } from '../../core/dom.js';
import { plural } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { getDisplayPref, getThemePreference, setDisplayPref, setThemePreference } from '../theme.js';
import { SUBJECT_SWATCHES } from '../subject-colours.js';
import { banner, confirmDialog, pageHead, toast } from '../ui.js';
import { PHASES } from '../../config/phases.js';

export async function mount(element, context) {
  context.setTitle('Account');
  const user = api.currentUser();
  const progress = api.getProgress();
  const backend = api.backendInfo();
  const theme = getThemePreference();

  const avatarColour = progress.preferences.avatarColour || 'yellow';
  const studying = progress.preferences.studyLevel || '';
  const toggle = (name, label, hint) =>
    html`<div class="setting">
      <div><p>${label}</p><p class="small muted">${hint}</p></div>
      <label class="switch"><input type="checkbox" role="switch" data-display="${name}" ${getDisplayPref(name) ? 'checked' : ''} /><span aria-hidden="true"></span><span class="sr-only">${label}</span></label>
    </div>`;
  const STATUS = { live: ['Live', 'live'], coming_soon: ['Coming later', 'soon'] };

  setHtml(
    element,
    html`${pageHead({
        title: 'Account',
        crumbs: [{ label: 'Home', href: '#/' }, { label: 'Account' }],
        sub: `signed in as ${user.email} · member since ${new Date(user.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
        actions: html`<button type="button" class="btn" data-logout>Log out</button>`,
      })}
      ${user.is_demo ? html`<div style="margin-bottom:26px">${banner(html`<strong>Demo account.</strong> You can try anything here. When you sign out, the demo goes back to how it was.`, { type: 'demo' })}</div>` : ''}
      <div class="account-grid">
        <div class="account-col">
          <section class="card ruled tilt-3">
            <i class="tape tape--l" aria-hidden="true"></i>
            <h2 class="card__title">Profile</h2>
            <form class="stack" data-profile style="margin-top:14px" novalidate>
              <div class="row">
                <span class="bigav" style="--sc:${SUBJECT_SWATCHES.find((swatch) => swatch.id === avatarColour)?.hex}" data-bigav aria-hidden="true">${user.display_name.trim().slice(0, 1).toUpperCase()}</span>
                <fieldset class="field" style="border:0;padding:0;margin:0">
                  <legend class="field__label">Picture colour</legend>
                  <div class="swatches--row" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
                    ${SUBJECT_SWATCHES.slice(0, 8).map(
                      (swatch) =>
                        html`<label class="swatch-pick" title="${swatch.label}"><input type="radio" name="avatar" value="${swatch.id}" ${swatch.id === avatarColour ? 'checked' : ''} data-avatar /><span class="swatch swatch--sm" style="--sc:${swatch.hex}"></span><span class="sr-only">${swatch.label}</span></label>`,
                    )}
                  </div>
                </fieldset>
              </div>
              <div class="grid grid--2" style="gap:14px">
                <label class="field"><span class="field__label">Name</span><input class="input" name="display_name" value="${user.display_name}" maxlength="40" required /></label>
                <label class="field"><span class="field__label">Email</span><input class="input" type="email" name="email" value="${user.email}" autocomplete="email" required /></label>
              </div>
              <div class="field">
                <span class="field__label">I’m studying</span>
                <div class="seg" role="radiogroup" aria-label="I'm studying" style="width:max-content;max-width:100%">
                  ${[['GCSE', 'GCSE'], ['A-Level', 'A-Level'], ['Level 3', 'Level 3'], ['mix', 'A mix']].map(
                    ([value, label]) => html`<button type="button" class="seg__opt" role="radio" aria-checked="${studying === value}" data-studying="${value}">${label}</button>`,
                  )}
                </div>
              </div>
              <p class="form-error" role="alert" data-profile-error hidden></p>
              <div><button type="submit" class="btn btn--primary">Save profile</button></div>
            </form>
          </section>
          <section class="card ruled tilt-2">
            <i class="tape tape--c" aria-hidden="true"></i>
            <h2 class="card__title">Password</h2>
            <form class="stack" data-password style="margin-top:14px" novalidate>
              <label class="field"><span class="field__label">Current password</span><input class="input" type="password" name="current" autocomplete="current-password" placeholder="Your current password" required /></label>
              <label class="field">
                <span class="field__label">New password</span>
                <input class="input" type="password" name="next" autocomplete="new-password" placeholder="At least ${LIMITS.minPasswordLength} characters" required />
              </label>
              <p class="form-error" role="alert" data-password-error hidden></p>
              <div><button type="submit" class="btn">Change password</button></div>
            </form>
          </section>
          <section class="card ruled tilt-4">
            <i class="tape tape--r" aria-hidden="true"></i>
            <h2 class="card__title">How the site looks</h2>
            <div class="setting">
              <div><p>Light or dark mode</p><p class="small muted">Dark mode uses warm, soft colours that are easier on your eyes in the evening.</p></div>
              <div class="seg" role="radiogroup" aria-label="Light or dark mode">
                ${[['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(
                  ([value, label]) => html`<button type="button" class="seg__opt" role="radio" aria-checked="${theme === value}" data-theme-choice="${value}">${label}</button>`,
                )}
              </div>
            </div>
            ${toggle('flat', 'Straight cards', 'Turn on to keep every card straight instead of tilted.')}
            ${toggle('large', 'Larger text', 'Makes questions and mark schemes easier to read.')}
            <div class="setting">
              <div><p>Subject colours and target grades</p><p class="small muted">Set these for each subject in My subjects.</p></div>
              <a class="btn btn--sm" href="#/subjects">Open My subjects</a>
            </div>
            <p class="small muted" style="margin-top:10px">These display settings are saved on this device.</p>
          </section>
        </div>
        <div class="account-col">
          <section class="card ruled tilt-2">
            <i class="tape tape--c" aria-hidden="true"></i>
            <h2 class="card__title">Your data</h2>
            <p class="muted small" style="margin:4px 0 14px">Everything you’ve saved so far.</p>
            <div class="glance">
              <div><b>${progress.enrolled_subjects.length}</b><span>subjects</span></div>
              <div><b>${progress.learned_spec_points.length}</b><span>spec points learned</span></div>
              <div><b>${new Set(progress.question_attempts.map((attempt) => attempt.question_id)).size}</b><span>questions answered</span></div>
              <div><b>${progress.paper_attempts.length}</b><span>papers and tests</span></div>
            </div>
            <p class="warn-note" style="margin:16px 0">
              ${backend.syncsAcrossDevices
                ? html`Saved to your account and synced across your devices. Download a copy any time if you want your own backup.`
                : html`Saved in <strong>${backend.label.toLowerCase()}</strong> on this device. It does not sync to other devices yet, so download a copy to back it up or move it.`}
            </p>
            <div class="row">
              <button type="button" class="btn btn--primary" data-export>Download my data</button>
              <label class="btn">Import from a file<input type="file" accept="application/json,.json" data-import hidden /></label>
            </div>
          </section>
          <section class="card danger-card tilt-3">
            <h2 class="card__title">Start again</h2>
            <p class="small muted" style="margin:4px 0 8px">These can’t be undone. Download your data first if you might want it back.</p>
            <div class="setting">
              <div><p>Reset my progress</p><p class="small muted">Clears subjects, ticked topics, answers and history. Your account stays.</p></div>
              <button type="button" class="btn btn--sm" data-reset>Reset progress</button>
            </div>
            <div class="setting">
              <div><p>Delete my account</p><p class="small muted">Removes your account and everything in it${backend.syncsAcrossDevices ? ', on every device' : ' from this browser'}.</p></div>
              <button type="button" class="btn btn--sm btn--danger" data-delete>Delete account</button>
            </div>
          </section>
          <section class="card ruled tilt-4">
            <i class="tape tape--r" aria-hidden="true"></i>
            <h2 class="card__title">What’s coming</h2>
            <ol class="phases">
              ${PHASES.map(
                (phase) =>
                  html`<li>
                    <span class="phases__num" data-status="${STATUS[phase.status]?.[1]}">${phase.id}</span>
                    <div><p class="phases__title">${phase.title}</p><p class="small muted">${phase.summary}</p></div>
                    <span class="badge ${phase.status === 'live' ? 'badge--live' : 'badge--soon'}">${STATUS[phase.status]?.[0] || ''}</span>
                  </li>`,
              )}
            </ol>
          </section>
          <section class="card card--soon">
            <h2 class="card__title">For the site owner</h2>
            <p class="muted small" style="margin:6px 0 14px">Check the question and paper database and prepare new content.</p>
            <div class="row"><a class="btn btn--sm" href="#/studio">Open the Content Studio</a><span class="small muted">version ${APP.version}</span></div>
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

  on(element, 'change', '[data-display]', (event, input) => setDisplayPref(input.dataset.display, input.checked));
  on(element, 'change', '[data-avatar]', async (event, input) => {
    await api.setPreference('avatarColour', input.value);
    const hex = SUBJECT_SWATCHES.find((swatch) => swatch.id === input.value)?.hex;
    $('[data-bigav]', element).style.setProperty('--sc', hex);
    document.querySelector('.topnav .avatar')?.style.setProperty('--sc', hex);
  });
  on(element, 'click', '[data-studying]', async (event, button) => {
    await api.setPreference('studyLevel', button.dataset.studying);
    for (const option of element.querySelectorAll('[data-studying]')) option.setAttribute('aria-checked', String(option === button));
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
