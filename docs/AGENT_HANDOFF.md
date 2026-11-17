# Agent handoff: Supabase accounts and progress sync

Last updated: 2026-11-17 (Europe/London)

## Start here

At the beginning of every agent session, read this file and docs/supabase-setup.md before changing code or project settings. Update this file and commit it to the active feature branch after each significant milestone. If time or context is running short, commit the handoff update before starting more work.

Never put passwords, SMTP credentials, Supabase secret keys, access tokens, or other secrets in this file, in GitHub, logs, or chat.

## 1. Project overview

PurePastPapers is a static vanilla-JavaScript website for students to find exam papers and practise questions. It has no bundler and is published at https://purepastpapers.com through GitHub Pages. The objective is email/password accounts using Supabase Auth, with one JSON student-progress snapshot per user in a row-level-security-protected Postgres table.

Relevant services:
- GitHub repository: PurePastPapers/Purepastpapers
- Supabase project ref: spjlnvjdstxdajcsljvq; project URL: https://spjlnvjdstxdajcsljvq.supabase.co
- Resend sender domain: purepastpapers.com
- Production site: https://purepastpapers.com

The browser receives only the public Supabase publishable key from js/config/supabase.config.js. A Supabase secret key must stay in Supabase-managed server/function environments.

## 2. Current implementation status

Implemented on PR #6:
- Email/password signup and login, confirmation callback, password reset, profile updates and password changes.
- Cloud progress snapshot load/save; guest snapshot staging and restoration without overwriting existing cloud progress.
- Explicit legacy browser-only login and JSON export/import.
- Account deletion client flow and authenticated delete-account Edge Function.

Verified production setup on 2026-11-17:
- Supabase project is ACTIVE_HEALTHY.
- Migration supabase/migrations/20261116180000_user_progress.sql was applied using the authenticated Supabase connector. The migration history records name 20261116180000_user_progress, version 20261117230836.
- public.user_progress exists with zero rows; RLS is enabled; exactly three owner-scoped policies compare auth.uid() to user_id for SELECT, INSERT and UPDATE. authenticated has SELECT/INSERT/UPDATE grants; anon has no grants.
- A rollback-only SQL test ran as role authenticated with a synthetic JWT subject. A cross-user INSERT was denied by RLS; the transaction rolled back and no row was written. Real two-account SELECT/UPDATE isolation is still pending.
- Security and health advisors returned no lints after the migration.
- delete-account is deployed and ACTIVE at version 1 with verify_jwt=true. It uses the PR source and withSupabase({ auth: 'user' }); platform JWT verification remains enabled. Deployment id: 3cb83be2-1727-4636-8f99-83995987fc65. Source blob SHA: 617372bd82a24e2a7af805ab5e23f0b36a81a53f. Deployment artifact SHA: 545cd89ecf90a71147afc6c40bcc4667e35db7764a3ce7ec47ccf058cba91932.
- Resend connector reports purepastpapers.com verified with sending enabled in eu-west-1.
- User reports Supabase custom SMTP is saved with no-reply@purepastpapers.com and the old SMTP key was rotated/replaced. No key is stored here. Supabase-delivered mail has not been tested.
- User reports Site URL and redirect URLs are set and saved. A screenshot shows new signups, Confirm email and Email provider enabled. The Supabase connector available here does not expose Auth URL/provider settings, so treat these as user-reported until a live auth flow confirms them.
- Production signup, confirmation, login, password reset, guest restoration, cross-device sync, export/import and account deletion have not yet been end-to-end tested.

Code review previously found no P1 issue. Issues fixed in commits a587fd5ccd46aedefb0815fda59a6cb4377cb46a and fb9ce73f65bec771b3770a857bb444b825d3249d: authenticated delete identity, safe progress-load fallback, preserving guest state after failed login, and recovery flow independence from progress restoration.

## 3. Supabase setup

Verified repository configuration:
- Public URL and publishable key are in js/config/supabase.config.js. Never put a secret key in browser code.
- Migration: supabase/migrations/20261116180000_user_progress.sql.
- Table: public.user_progress(user_id uuid primary key references auth.users(id) on delete cascade, progress jsonb, updated_at timestamptz).
- RLS enabled; authenticated SELECT/INSERT/UPDATE only. All three policies scope access to auth.uid() = user_id. No delete policy or anon grant.
- Function source: supabase/functions/delete-account/index.ts. Config in supabase/config.toml has verify_jwt = true.
- Callback: auth-callback.html and js/auth-callback.js.
- Desired Site URL: https://purepastpapers.com.
- Redirect allow-list:
  - https://purepastpapers.com/auth-callback.html
  - https://www.purepastpapers.com/auth-callback.html
  - http://localhost:5173/auth-callback.html
  - http://127.0.0.1:5173/auth-callback.html

Exact Supabase operations completed:
- Read-only discovery: list_projects, get_project, list_tables, list_migrations and list_edge_functions for project spjlnvjdstxdajcsljvq. Before migration, public tables, migration history and functions were empty; user's SQL Editor screenshot also showed user_progress absent.
- Applied the existing migration with supabase_apply_migration(name="20261116180000_user_progress", project_id="spjlnvjdstxdajcsljvq", query=<contents of the checked-in migration>). Result: success=true.
- Verified with supabase_execute_sql and list_tables/list_migrations: table_exists=true, rls_enabled=true, policy_count=3, authenticated_grants=3, anon_grant_count=0, rows=0; migration version 20261117230836. Post-migration security advisor returned no lints.
- Ran a rollback-only RLS test using SET LOCAL ROLE authenticated and a synthetic request.jwt.claim.sub; cross-user insert was rejected, and no row was created.
- Deployed the checked-in delete-account/index.ts using supabase_deploy_edge_function(name="delete-account", entrypoint_path="index.ts", verify_jwt=true). Supabase reports ACTIVE version 1.
- No CLI commands were run. The connected Supabase tools can query schema and deploy functions but do not expose Auth URL/provider or custom SMTP configuration values. User reports those settings saved; do not ask for tokens/passwords in chat.

## 4. Resend integration

Verified via the connected Resend tool on 2026-11-17:
- Domain purepastpapers.com is verified.
- Sending is enabled; region eu-west-1.

User-reported (not independently inspectable in the connected tools):
- Supabase custom SMTP was saved with sender no-reply@purepastpapers.com.
- A fresh restricted sending key replaced the previously shared key and was entered directly in Supabase.
- Supabase Auth confirmation and password-reset delivery have not been tested. Do not request or record the SMTP key.

## 5. GitHub status

Verified through GitHub on 2026-11-17:
- Repository: PurePastPapers/Purepastpapers.
- PR #6: https://github.com/PurePastPapers/Purepastpapers/pull/6
- Feature branch: codex/supabase-account-sync-2026-11-16.
- Latest main before branch sync: 25db8b895e7b311178e9f7749f3b9f9f23a13355.
- The PR branch was 46 commits behind main. Comparing the PR's 16 changed paths with 300 main-changed paths since the merge base showed no path overlap.
- Created merge commit e1fb3c83bf29c039c833be846cf60d4afa004ed1 with parents feature head b407494db5a7af6d53e4ba8d8d2c67860d66d879 and main 25db8b895e7b311178e9f7749f3b9f9f23a13355; tree retained main changes plus the 16 PR files. Updated the feature ref using expected_sha=b407494... and force=false.
- After branch sync, PR #6 was open, unmerged, mergeable=true, 27 commits ahead of main, 0 behind, 16 changed files. The latest PR head at that check was e1fb3c83bf29c039c833be846cf60d4afa004ed1.
- No GitHub status rows, Actions workflow runs, or submitted PR reviews were returned for the synced head. Branch-protection endpoint access returned 403 from the GitHub connector; required-check rules could not be directly inspected. Do not claim checks passed when none ran.
- Do not merge until available checks/review are complete and the remaining live auth tests can be performed safely.

## 6. Files and architecture

Key PR files:
- js/config/supabase.config.js — public project URL and publishable key.
- js/data/adapters/supabase-adapter.js — lazy supabase-js import, Auth, cloud progress, guest snapshot restoration and deletion invocation.
- js/data/api.js — app-facing auth and progress API.
- js/main.js — app routing and account/auth lifecycle integration.
- js/core/links.js — login, signup, callback and recovery URLs.
- js/ui/views/auth.js — signup/login/legacy-login forms.
- js/ui/views/recovery.js — password reset completion.
- js/ui/views/account.js — profile, password, export/import and deletion controls.
- auth-callback.html and js/auth-callback.js — callback page.
- supabase/migrations/20261116180000_user_progress.sql — progress schema, grants and RLS.
- supabase/functions/delete-account/index.ts — authenticated account deletion.
- supabase/config.toml — project ref and function JWT config.
- docs/supabase-setup.md — setup instructions.
- docs/AGENT_HANDOFF.md — this continuity record.

The site is plain browser JavaScript with no bundler. It loads Supabase JS from esm.sh on first cloud-account use. Local development uses npm start at http://localhost:5173.

## 7. Testing

Completed/observed:
- On 2026-11-17, focused tests from a temporary partial checkout using Node v24.22.1: 47 pass, 0 fail. Node syntax checks passed for supabase-adapter.js and api.js. Functional code has not changed since this test; subsequent feature-branch changes were documentation and the main sync.
- Exact command:
  ~~~sh
  node --check js/data/adapters/supabase-adapter.js
  node --check js/data/api.js
  node --test tests/guest-access.test.mjs tests/inline-marking.test.mjs tests/content-years.test.mjs tests/curriculum-map.test.mjs tests/spec-filtering.test.mjs tests/target-grades.test.mjs tests/question-parts.test.mjs tests/progress-failure-check.mjs tests/recovery-session-check.mjs tests/recovery-callback-check.mjs
  ~~~
- Supabase table/policy/grant verification passed; rollback-only cross-user insert RLS check passed; security/health advisors returned no lints.
- delete-account deployment metadata verified ACTIVE with verify_jwt=true.
- Resend domain status verified (sending enabled).
- Live paper smoke check on 2026-11-17: June 2025 AS Pure Mathematics 01 loaded with 22 questions and 100 marks. Before publish, the live signup page said progress was only browser/device local.
- No GitHub Actions runs or status checks were returned for the synced PR head.

Not completed:
- Full repository npm test/npm run validate or complete lint/build; this environment has no full checkout / test bank.
- Auth URL and provider settings are user-reported; SMTP delivery via Supabase is untested.
- Real two-account RLS SELECT/UPDATE isolation.
- Successful signup, confirmation, login, recovery email, cross-device sync, export/import and account deletion through the app.
- Post-publish exam-paper regression check.

## 8. Known problems, blockers and risks

- Supabase database and function access is now available through the connected tools. Auth URL/provider and custom SMTP settings are not exposed by those tools; rely on user screenshots/report until a live flow confirms them.
- Supabase email delivery is untested. User reports the restricted Resend key and SMTP settings are saved; no secret is stored here.
- RLS policies and grants are verified, and a cross-user insert attempt was denied. Test cross-user reads/updates with two actual authenticated accounts after signup.
- The function is deployed with JWT verification enabled, but deletion has not been exercised using a real signed-in user token.
- The feature branch now includes current main; at last check PR #6 was mergeable but had no CI statuses/workflow runs. GitHub connector cannot read branch protection, returning 403.
- Full repository validation is unavailable in this workspace. Progress snapshots remain last-save-wins when the same account changes on multiple devices.

## 9. Exact next steps

1. At session start, read this file and docs/supabase-setup.md. Refresh PR #6 head, main head and checks.
2. Confirm the latest PR is still mergeable and review its current diff. The 2026-11-17 code review at fb9ce73 found no P1 issue; 47 focused tests passed.
3. Ask the user to use a test inbox they control for one signup/confirmation and one password-reset test. Do not request their password or SMTP/API key. Auth email delivery cannot be proven without a mailbox receiving the messages.
4. If PR #6 is merged/published, test signup, confirmation callback, login, reset, guest-progress preservation, progress sync on another device, export/import, two-user RLS isolation, and account deletion. Verify existing paper browsing.
5. Record results and deployment SHA in this handoff. Do not mark complete until live tests pass.

## 10. Completion criteria

Do not mark complete until all are true:
- Site URL, redirect list, signup availability, email confirmation and Email provider settings are saved and confirmed.
- Resend is verified, the SMTP key is restricted and saved directly in Supabase, and Supabase confirmation/reset emails are received.
- Migration is recorded and the table, grants, RLS policies are verified; cross-user reads/writes are denied.
- delete-account is deployed with JWT verification and deletion works end-to-end.
- PR #6 is reviewed against current main and all available checks pass.
- PR #6 is merged, GitHub Pages publishes, and production signup, confirmation, login, reset, guest-progress preservation, cross-device sync, RLS isolation, account deletion and existing paper flows all pass.
- The handoff records exact deployment and merge SHAs and distinguishes verified from user-reported facts.
