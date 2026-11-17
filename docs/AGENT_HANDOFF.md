# Agent handoff: Supabase accounts and progress sync

Last updated: 2026-11-17 (Europe/London)

## Start here

At the beginning of every agent session, read this file and `docs/supabase-setup.md` before changing code or Supabase settings. Update and commit this handoff after each significant milestone and before context or usage limits.

Never put passwords, SMTP credentials, Supabase secret keys, access tokens, or other secrets in this document, GitHub, logs, or chat.

## 1. Project overview

PurePastPapers is a static vanilla-JavaScript exam-paper and practice-question site published through GitHub Pages at https://purepastpapers.com. PR #6 adds Supabase email/password accounts and cross-device progress snapshots stored as one JSON row per user in an RLS-protected table.

- GitHub: `PurePastPapers/Purepastpapers`
- Supabase project: `spjlnvjdstxdajcsljvq`; URL: `https://spjlnvjdstxdajcsljvq.supabase.co`
- Resend verified domain: `purepastpapers.com`
- Production site: https://purepastpapers.com
- Browser code uses only the public publishable key in `js/config/supabase.config.js`. No secret key belongs in the site.

## 2. Current implementation status

Implemented and merged:
- PR #6 adds Supabase email/password registration/login, confirmation callback, recovery, profile/password updates, cloud progress, guest-progress recovery, legacy browser login, JSON backup import/export, and account deletion.
- PR #13 clarifies signup sync messaging for configured cloud accounts, legacy accounts, and local-only mode.

Verified:
- PR #6 is merged as `2840caa82752a4fc1d6e499455a3073b2f8e4f93`; PR #13 is merged as `18ceb5e3c6b6f99433a892ae523ccbd460bc1b27`.
- GitHub Pages deployment for PR #6 succeeded (run 81, `44199928570`); deployment for PR #13 succeeded (run 82, `44201030653`, build/deploy/report jobs all successful).
- A fresh production tab shows the signup message “After you confirm your email, your progress syncs across your devices.” The login page shows the forgot-password and legacy-account links; the password-reset page renders.
- Production paper browse still works: the A-Level Edexcel Mathematics archive lists 60 papers; June 2025 AS Pure Mathematics 01 opened with 22 questions and 100 marks.
- Supabase migration, owner-scoped RLS, grants, and authenticated deletion function are deployed and verified below.
- Resend reports the domain verified and sending enabled.

User-reported (not independently inspectable through connected settings tools):
- Supabase Site URL and redirect allow-list saved.
- Email provider, signups, and email confirmation enabled.
- Custom SMTP saved with `no-reply@purepastpapers.com`, and the previous SMTP key replaced by a domain-restricted key.

Still unverified end-to-end:
- Supabase confirmation/reset email delivery, successful account signup/confirmation/login, guest progress restoration, cross-device sync, backup import/export, real two-user RLS reads/updates, and account deletion. These require at least one user-controlled inbox and disposable test accounts.

## 3. Supabase setup

Project ref: `spjlnvjdstxdajcsljvq`, status ACTIVE_HEALTHY.

Migration:
- Checked-in file: `supabase/migrations/20261116180000_user_progress.sql`.
- Applied using the authenticated Supabase connector with migration name `20261116180000_user_progress`; result was success.
- Supabase migration history records version `20261117230836`.
- `public.user_progress` exists with columns `user_id uuid` (primary key and cascading FK to `auth.users.id`), `progress jsonb` (default `{}`), and `updated_at timestamptz` (default `now()`). It currently has zero rows.
- RLS is enabled. Three policies scope SELECT, INSERT, and UPDATE to `auth.uid() = user_id`; UPDATE uses both `USING` and `WITH CHECK`. Authenticated has SELECT/INSERT/UPDATE grants; anon has no grants and there is no client DELETE policy.
- A rollback-only authenticated-role test confirmed cross-user INSERT is rejected. No row was written.
- A follow-up attempt to seed two synthetic UUID rows for SELECT/UPDATE testing stopped at the FK to `auth.users` because those fake users do not exist; no database changes were made. Real two-account SELECT/UPDATE isolation still requires registered test accounts.
- Security advisor returned no lints after migration.

Edge Function:
- Source: `supabase/functions/delete-account/index.ts`; config: `supabase/config.toml` sets `verify_jwt = true`.
- Deployed from the reviewed repository source with JWT verification on.
- Supabase reports ACTIVE, version 1, `verify_jwt=true`; deployment id `3cb83be2-1727-4636-8f99-83995987fc65`.
- Source blob SHA: `617372bd82a24e2a7af805ab5e23f0b36a81a53f`; artifact SHA: `545cd89ecf90a71147afc6c40bcc4667e35db7764a3ce7ec47ccf058cba91932`.
- Function uses `withSupabase({ auth: 'user' })` and deletes the identity from the authenticated user's claims. It accepts only POST/OPTIONS and validates origins. Do not disable JWT verification.

Auth URLs/settings:
- Desired Site URL: `https://purepastpapers.com`.
- Required redirect allow-list:
  - `https://purepastpapers.com/auth-callback.html`
  - `https://www.purepastpapers.com/auth-callback.html`
  - `http://localhost:5173/auth-callback.html`
  - `http://127.0.0.1:5173/auth-callback.html`
- The connected Supabase tools do not expose Auth URL/provider/SMTP configuration. Treat the above dashboard settings as user-reported until live auth-email tests pass.
- Google/Apple OAuth are not part of PR #6 and are not configured by this change.

Operations performed:
- Read-only discovery: `list_projects`, `get_project`, `list_tables`, `list_migrations`, `list_edge_functions`.
- Applied only the checked-in migration after verifying the table/migration did not exist.
- Verified schema, policies, grants, migration history, function deployment metadata, and security advisor.
- No CLI commands were run.

## 4. Resend integration

Verified via the connected Resend tool on 2026-11-17:
- `purepastpapers.com` is verified, sending enabled, region `eu-west-1`.

User-reported:
- Supabase custom SMTP is saved with sender `no-reply@purepastpapers.com`.
- The old SMTP key was replaced by a fresh domain-restricted sending key and entered directly in Supabase.
- Do not request or record the key.
- Delivery from Supabase Auth is untested. To prove it, complete production signup and password recovery using an inbox the user controls.

## 5. GitHub status

- Repository: `PurePastPapers/Purepastpapers`.
- PR #6: https://github.com/PurePastPapers/Purepastpapers/pull/6; merged squash commit `2840caa82752a4fc1d6e499455a3073b2f8e4f93`.
- PR #13: https://github.com/PurePastPapers/Purepastpapers/pull/13; merged squash commit `18ceb5e3c6b6f99433a892ae523ccbd460bc1b27`.
- Latest application/deployment SHA (PR #13 merge): `18ceb5e3c6b6f99433a892ae523ccbd460bc1b27`. The handoff was subsequently refreshed in docs-only commit `5b7a8053bc46626e7c8f5b2dff76e6ed875ca0eb`.
- PR #6 feature branch: `codex/supabase-account-sync-2026-11-16`; final branch head before squash was `c95378aef9736401b85ff2a32226f7a9e87ba8a6`. It contained the main sync commit `e1fb3c83bf29c039c833be846cf60d4afa004ed1`.
- PR #13 branch: `codex/account-sync-copy-2026-11-17`; head `400b557cecb5bf3a2dbedc049c0cfca356e73bad).
- PR #6 code review found no blocking issue. PR #13 review found no blocking issue; the changed auth view passed Node syntax validation.
- No application CI/test workflow or PR status checks were reported. GitHub Pages deployment did run for both main commits and succeeded. Main has no required status checks configured (branch API response).
- PR #6 earlier reviews fixed issues in `a587fd5ccd46aedefb0815fda59a6cb4377cb46a` and `fb9ce73f65bec771b3770a857bb444b825d3249d`.

## 6. Files and architecture

- `js/config/supabase.config.js` — public project URL and publishable key.
- `js/data/adapters/supabase-adapter.js` — lazy Supabase JS import, Auth, cloud progress, guest snapshot recovery and deletion invocation.
- `js/data/api.js` — app-facing auth and progress API.
- `js/main.js` — app routing and account/auth lifecycle integration.
- `js/core/links.js` — login, signup, callback and recovery URLs.
- `js/ui/views/auth.js` — signup, login and legacy-login forms.
- `js/ui/views/recovery.js` — password-reset completion.
- `js/ui/views/account.js` — profile, password, backup import/export and deletion controls.
- `auth-callback.html`, `js/auth-callback.js` — auth callback page.
- `supabase/migrations/20261116180000_user_progress.sql` — progress schema, grants and RLS.
- `supabase/functions/delete-account/index.ts` — authenticated account deletion.
- `supabase/config.toml` — project ref and function JWT config.
- `docs/supabase-setup.md` — setup guide.
- `docs/AGENT_HANDOFF.md` — this continuity record.

The app has no bundler. Supabase JS is loaded from esm.sh on first cloud-account use. Local development uses `npm start` at `http://localhost:5173`; no npm install is needed for the site.

## 7. Testing

Completed:
- Node v24.22.1 syntax checks passed:
  `node --check js/data/adapters/supabase-adapter.js`
  `node --check js/data/api.js`
- Focused automated test command:
  ```sh
  node --test tests/guest-access.test.mjs tests/inline-marking.test.mjs tests/content-years.test.mjs tests/curriculum-map.test.mjs tests/spec-filtering.test.mjs tests/target-grades.test.mjs tests/question-parts.test.mjs tests/progress-failure-check.mjs tests/recovery-session-check.mjs tests/recovery-callback-check.mjs
  ```
  Result on 2026-11-17: 47 passed, 0 failed. Ran from temporary partial checkout `/tmp/ppp-check`; this workspace has no complete repository checkout.
- Follow-up auth view content passed `node --check /tmp/ppp-auth-view.js`; the temporary file was created from the updated branch's `js/ui/views/auth.js`.
- Supabase migration/table/RLS/grant checks passed. A rollback-only cross-user INSERT attempt was denied. Security advisor returned no lints.
- `delete-account` is ACTIVE with JWT verification enabled.
- Resend domain status verified.
- Production UI check after Pages deployments: signup, login, and password-reset pages render; the fresh signup page indicates cross-device sync after confirmation.
- Production exam-paper smoke check: Mathematics archive loaded 60 papers; June 2025 AS Pure Mathematics 01 opened with 22 questions / 100 marks.
- Independent reviews of PR #6 and PR #13 found no blocking defects.

Not completed:
- The full repository `npm test` and `npm run validate` scripts were not run; no full checkout exists in this workspace. `package.json` defines `test` as `node --test "tests/**/*.test.mjs"` and `validate` as `node tools/validate-data.mjs`.
- No application CI workflow or PR test checks are configured/reported; only the GitHub Pages builds ran.
- Auth emails and full signup/recovery/progress/account-deletion flows have not been exercised. UI presence is not proof of email delivery.
- Real two-user SELECT/UPDATE RLS isolation remains to be checked after creating disposable accounts.
- Paper browse is verified, but paper scoring/save under an account is not yet checked.

## 8. Known problems and risks

- Site URL, redirect allow-list, provider and custom SMTP settings are user-reported. The Supabase connector cannot read these Auth settings; verify them through actual confirmation/reset email delivery.
- The signup/authentication and recovery screens render in production. No real mailbox was used, so the SMTP delivery path remains untested.
- Do not ask the user for mailbox passwords, account passwords, SMTP credentials, or Supabase keys. The user must control the signup inbox and click the confirmation link.
- The rollback-only attempt to test SELECT/UPDATE with synthetic UUIDs stopped at the `auth.users` foreign key because those UUIDs were not real users; no changes were made. Real two-user isolation still needs disposable accounts.
- Account deletion has not been exercised with a real signed-in disposable account.
- The old browser tab initially showed cached pre-deployment copy; a fresh tab loaded the new signup message. If the user's existing tab shows old wording, close/reopen the site or refresh it.
- Progress snapshots are last-save-wins if the same account is edited simultaneously on two devices.

## 9. Exact next steps

1. Ask the user to complete one test signup with an inbox they control at https://purepastpapers.com/#/signup. They should enter their password only in the site, never in chat.
2. Have them click the confirmation email on the same device/browser used to stage any guest progress. Confirm the callback finishes and that progress appears after sign-in.
3. Test login, request a password-reset email from the login page, open the link, set a new password, then log in with it.
4. Sign into the same account on a second device, make one progress change, and confirm it appears on the other device. Test JSON export/import.
5. Create a second disposable test account and verify it cannot read/update the first user's row. Test account deletion only on a disposable account.
6. Record the user's email-delivery and auth-flow results here; do not record the email address or any credentials. Continue with a production paper-score/save regression check.

## 10. Completion criteria

Do not mark the integration complete until all are true:
- The Supabase Auth Site URL, exact redirect allow-list, Email provider, signups and confirmation setting are saved and verified.
- Supabase Auth confirmation and password-reset emails reach the user through Resend SMTP.
- The migration is recorded; table, grants and owner-scoped RLS are verified; cross-user reads/writes are denied using real accounts.
- `delete-account` is ACTIVE with JWT verification and deletion succeeds for a disposable signed-in account.
- PR #6 and PR #13 are merged; the corresponding GitHub Pages deployments succeeded.
- Production signup, confirmation, login, reset, guest-progress preservation, cross-device sync, backup import/export and paper-score persistence pass.
- Existing exam-paper browsing remains available.
- This handoff records the exact deployment/test SHAs and distinguishes verified facts from user reports.
