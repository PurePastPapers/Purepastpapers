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

Implemented on PR #6:
- Email/password registration and login, confirmation callback, password recovery, profile/password updates.
- Cloud progress load/save; guest-progress staging and restoration without replacing existing cloud progress.
- Legacy browser-only login and JSON export/import.
- Account deletion client flow and authenticated `delete-account` Edge Function.

Verified:
- Supabase migration and RLS are applied (details below).
- The deletion function is ACTIVE with JWT verification enabled.
- Resend reports the domain verified and sending enabled.
- A final independent review of PR head `6e8f2cda27daa0a67831a160c39f240578b77d7d` found no blocking defect in auth, callback recovery, sync, RLS usage, or deletion.
- 47 focused tests passed on 2026-11-17. No application code changed after those tests; later branch changes were docs and a non-conflicting sync with main.

User-reported, not independently inspected through the connected tools:
- Supabase Site URL and redirect URLs were saved.
- Email provider, signups, and email confirmation are enabled (a dashboard screenshot showed the provider and toggles enabled).
- Custom SMTP was saved using `no-reply@purepastpapers.com`; the prior SMTP key was replaced with a fresh restricted sending key.
- Supabase SMTP delivery has not yet been proven by receiving an Auth confirmation or password-reset email.

Not yet end-to-end tested in production:
- Signup and confirmation, login, password recovery, guest-progress restoration, cross-device sync, export/import, real two-user RLS isolation, and account deletion.
- Production paper browsing after the account change.

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
- PR #6: https://github.com/PurePastPapers/Purepastpapers/pull/6
- Feature branch: `codex/supabase-account-sync-2026-11-16`.
- Main SHA used for branch sync: `25db8b895e7b311178e9f7749f3b9f9f23a13355`.
- A two-parent sync commit `e1fb3c83bf29c039c833be846cf60d4afa004ed1` brought main into the feature branch. Comparing the 16 PR paths against 300 changed main paths since the merge base showed no overlap.
- PR head before this handoff update: `6e8f2cda27daa0a67831a160c39f240578b77d7d`; PR was open, non-draft, and mergeable with 16 changed files.
- No GitHub status rows or PR workflow runs were returned for the head. The connector could not read branch-protection settings (403), so do not claim required checks passed; no CI checks were reported.
- Code review: final independent review at `6e8f2cda...` found no blocker. Earlier review fixes are in `a587fd5ccd46aedefb0815fda59a6cb4377cb46a` and `fb9ce73f65bec771b3770a857bb444b825d3249d`.
- The PR description's original setup checklist is stale and should be refreshed before merge.

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
- Exact focused test command:
  ```sh
  node --test tests/guest-access.test.mjs tests/inline-marking.test.mjs tests/content-years.test.mjs tests/curriculum-map.test.mjs tests/spec-filtering.test.mjs tests/target-grades.test.mjs tests/question-parts.test.mjs tests/progress-failure-check.mjs tests/recovery-session-check.mjs tests/recovery-callback-check.mjs
  ```
  Result: 47 passed, 0 failed. These ran from a temporary partial checkout `/tmp/ppp-check`; the current workspace does not contain the full repository checkout.
- Supabase schema/RLS/grants/migration checks passed; cross-user INSERT was denied; security advisor had no lints.
- Edge Function metadata confirms ACTIVE and JWT verification.
- Resend domain verification/sending status confirmed.
- Live paper smoke check on 2026-11-17: June 2025 AS Pure Mathematics 01 loaded with 22 questions and 100 marks.
- Independent code review found no blocking defect.

Not completed:
- No CI runs/status checks were available at the latest PR head. Branch-protection required-check settings could not be read with the connector.
- Full repository `npm test`/validation was not available in the partial checkout.
- Actual Auth emails and signup/login/recovery/sync/deletion flows have not been exercised.
- Real two-user SELECT/UPDATE RLS and production paper regression checks remain.

## 8. Known problems and risks

- SMTP and Auth URLs/providers are user-reported; the connector cannot inspect those settings. Verify by actual confirmation and reset email delivery.
- The live auth end-to-end tests require a mailbox controlled by the user and confirmation-link interaction. Do not request mailbox passwords or Supabase/Resend secrets.
- Real two-user RLS read/update isolation needs two registered test accounts; use disposable accounts only.
- Account deletion has not been exercised with a real signed-in test account.
- Last-save-wins snapshot writes may overwrite concurrent edits made simultaneously on two devices.
- No CI/status checks were reported; branch protection could not be queried.

## 9. Exact next steps

1. Refresh PR #6 head and status. Review was completed at `6e8f2cda...`; focused tests passed; there are no reported CI checks. Refresh the PR description so completed Supabase setup is no longer listed as outstanding.
2. Merge PR #6 only while it remains open and mergeable at the reviewed head. The code is reviewed and focused checks passed; merging is needed to exercise the production callback and Auth flows.
3. Confirm GitHub Pages publishes the merge commit, then smoke-test the live signup/login/account UI and existing exam-paper flow.
4. Ask the user to create one disposable test account using an inbox they control, click the confirmation link, and report when signed in. Never ask for their password or email-provider secret.
5. Test reset email, guest-progress restore, login on a second device, export/import, and two-user row isolation. Test deletion only on a disposable account.
6. Update this handoff with the merge SHA, Pages deployment result, test results, exact remaining blockers, and commit it.

## 10. Completion criteria

Do not mark complete until:
- Auth Site URL, redirect allow-list, email provider, signups and confirmation are saved and verified.
- Supabase Auth confirmation and password-reset messages reach the user through Resend SMTP.
- Migration is recorded; table, grants and owner-scoped RLS are verified; cross-user reads/writes are denied using real accounts.
- `delete-account` is deployed with JWT verification and deletion succeeds for a disposable test account.
- PR #6 is reviewed and merged after available code checks; GitHub Pages publishes the merge.
- Production signup, confirmation, login, reset, guest-progress preservation, cross-device sync and backup flows pass.
- Existing exam-paper functionality remains available.
- The final handoff records exact tested commits/deployment and separates verified facts from user reports.
