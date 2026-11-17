# Agent handoff: Supabase accounts and progress sync

Last updated: 2026-11-17 (Europe/London)

## Start here

At the beginning of every agent session, read this file and docs/supabase-setup.md before changing code or project settings. Update this file and commit it to the active feature branch after each significant milestone. If time or context is running short, commit the handoff update before starting more work.

Never put passwords, SMTP credentials, Supabase secret keys, access tokens, or other secrets in this file, in GitHub, or in chat.

## 1. Project overview

PurePastPapers is a static vanilla-JavaScript website for students to find exam papers and practise questions. It has no bundler. The current account objective is to add email/password signup and login through Supabase Auth, and sync one student progress snapshot per authenticated account through a row-level-security-protected Postgres table. The site is published at https://purepastpapers.com via GitHub Pages.

Relevant services:
- GitHub repository: PurePastPapers/Purepastpapers
- Supabase project ref: spjlnvjdstxdajcsljvq; project URL: https://spjlnvjdstxdajcsljvq.supabase.co
- Email provider: Resend, with purepastpapers.com as the sending domain
- Site: https://purepastpapers.com

The browser receives only the public Supabase publishable key from js/config/supabase.config.js. A Supabase secret key must stay in Supabase-managed server/function environments.

## 2. Current implementation status

Implemented on the feature branch:
- Email/password signup and login, email confirmation callback, password reset, profile updates and password changes.
- User progress snapshot load/save in public.user_progress.
- Guest progress staging/restoration; an existing cloud snapshot is not overwritten.
- Explicit legacy browser-only login and JSON export/import path.
- Account deletion client flow and a server-side delete-account Edge Function.
- Supabase setup notes in docs/supabase-setup.md.

Code exists, but production readiness is not verified:
- The SQL migration has not been confirmed as applied in Supabase.
- User reports the Site URL and redirect URLs were updated on 2026-11-17; the post-save values have not been independently verified. A screenshot of Authentication → Sign In / Providers on 2026-11-17 shows Allow new users to sign up, Confirm email, and the Email provider enabled. The screenshot also shows a Save changes control, so persistence is not independently verified.
- User reports Resend custom SMTP was saved in Supabase with sender no-reply@purepastpapers.com; delivery through Supabase has not been tested and was not independently checked.
- The Edge Function has not been confirmed deployed.
- End-to-end signup, confirmation, login, password reset, cross-device sync and deletion have not been verified on production.

Independent static review found and fixed several issues: the deletion function now reads the normalized authenticated user ID, startup falls back safely when progress cannot load, failed login preserves the prior guest snapshot, and password recovery both bypasses progress loading on callback and remains independent of progress restore (commits a587fd5ccd46aedefb0815fda59a6cb4377cb46a and fb9ce73f65bec771b3770a857bb444b825d3249d). The final independent review at fb9ce73 found no P1 issue and confirmed its P2 recovery finding is resolved. These are code-level checks only and do not establish that the live Supabase project works.

## 3. Supabase setup

Verified repository configuration:
- Project ref: spjlnvjdstxdajcsljvq.
- Public URL and publishable key are already present in js/config/supabase.config.js. Do not copy credentials into this document.
- Migration file: supabase/migrations/20261116180000_user_progress.sql.
- The migration creates public.user_progress with user_id as the auth.users foreign key and primary key, progress JSONB and updated_at. It uses plain CREATE TABLE and CREATE POLICY statements without IF NOT EXISTS, so do not rerun blindly; inspect current table/RLS/policy state first.
- RLS is enabled. Grants give authenticated users select/insert/update; policies compare user_id with auth.uid() for each operation. No delete policy is granted; deleting an auth user cascades the row.
- Function source: supabase/functions/delete-account/index.ts.
- Supabase CLI config: supabase/config.toml. Commit ee6869d4bbc868960e3f7e09907447f7da8a8008 sets verify_jwt = true for delete-account. The handler uses withSupabase({ auth: 'user' }) and commit ff2db8fd0b9dcf9c88914a681ab3b0cbfabdccbd reads context.userClaims.id for the authenticated user.
- Auth callback page: auth-callback.html and js/auth-callback.js.
- Desired Site URL: https://purepastpapers.com.
- Required redirect allow-list:
  - https://purepastpapers.com/auth-callback.html
  - https://www.purepastpapers.com/auth-callback.html
  - http://localhost:5173/auth-callback.html
  - http://127.0.0.1:5173/auth-callback.html

User reports updating Site URL and redirects after the screenshot showed localhost:3000 and an empty redirect list; no post-save URL screenshot is available. A 2026-11-17 screenshot shows Allow new users to sign up, Confirm email, and the Email provider enabled, with Save changes visible; treat persistence as unverified until saved. In this agent workspace, no Supabase admin connector or Management API credential is available; the Supabase CLI is not installed and no Supabase auth environment variable or CLI session was found. The public publishable key in the website cannot change Auth settings, run owner SQL, inspect migration state, or deploy functions. The user is on iPad and cannot use Desktop Take Over. Do not ask for tokens or passwords in chat; guide the user through only actions that cannot be done from the available integrations.

Required dashboard work:
1. Authentication → URL Configuration: user reports setting Site URL and the four exact redirect URLs on 2026-11-17; verify the saved values from a post-save view before treating this as confirmed.
2. Authentication → Sign In / Providers: a 2026-11-17 screenshot shows Allow new users to sign up, Confirm email, and the Email provider enabled. If these toggles were edited, tap Save changes and reopen the page to confirm the saved state.
3. SQL Editor: apply the migration file above.
4. Deploy delete-account. The documented CLI commands from the repository root are:
   ~~~sh
   git fetch origin codex/supabase-account-sync-2026-11-16
   git switch codex/supabase-account-sync-2026-11-16
   npx supabase login
   npx supabase link --project-ref spjlnvjdstxdajcsljvq
   npx supabase functions deploy delete-account --project-ref spjlnvjdstxdajcsljvq
   ~~~
   None of these commands were run in the current work session. If the user cannot use a terminal, investigate Supabase Dashboard function deployment/editor as an alternative, then verify the deployed function. Never ask the user to paste a Supabase secret key into chat.

## 4. Resend integration

User-reported status on 2026-11-17 (not independently checked in Resend or Supabase):
- purepastpapers.com is verified in Resend.
- The user reports the Supabase custom SMTP configuration was saved with sender no-reply@purepastpapers.com.
- Email delivery through Supabase has not yet been tested.
- Earlier Resend DNS and delivery details in the previous checkpoint were also user-reported.

Security action before testing auth email:
- Replace the currently saved SMTP API key with a fresh Resend API key restricted to Sending access and the purepastpapers.com domain. Do not reuse the previous key. Enter the replacement directly in Supabase and never put it in chat, GitHub, logs or this document.
- Confirm the sender address remains no-reply@purepastpapers.com and send signup-confirmation and password-reset test emails after rotation.

## 5. GitHub status

Verified through GitHub on 2026-11-17:
- Repository: PurePastPapers/Purepastpapers.
- Active feature branch: codex/supabase-account-sync-2026-11-16.
- Pull request: #6, https://github.com/PurePastPapers/Purepastpapers/pull/6.
- Latest branch head before this handoff refresh: 253836050f308c0859362c4c72c05b232eba08cc (22 commits, 16 changed files), with reviewed code at fb9ce73f65bec771b3770a857bb444b825d3249d. This refresh adds a documentation-only commit.
- Current main head: 07d072319b534db5f1cc63bdd652377cd9fbc108. Comparing current main with branch head 2538360 gives 22 commits ahead and 42 behind, with merge base 516243dcefa8e0a9be4e26ed6209703c3322947f.
- PR is open and unmerged. The latest GitHub connector reports mergeable=false. The PR base SHA c3530261bb9a8673f7d7b07daee2e098b788c091 is stale relative to current main; an earlier direct REST response returned mergeable=true/clean against that stale base. Treat mergeability as unresolved and refresh before merging.
- All 16 PR-changed paths were individually compared between merge base 516243d and current main 07d072; none changed on main since that merge base.
- At the last checked PR head e58c142, no status rows or GitHub Actions workflow runs were returned. Main reports branch protection disabled and no required checks.
- Significant implementation/review commits: initial implementation 14e237bffade89ecc34c08cc8b810d345506742f; JWT configuration ee6869d4bbc868960e3f7e09907447f7da8a8008; Resend setup documentation 7efde9949e12ff6f681109407385650093711a64; deletion identity fix ff2db8fd0b9dcf9c88914a681ab3b0cbfabdccbd; startup progress-read fallback b241c263d97eac6f2a406341aef962b97b78cba0; failed-login guest-state preservation bd07f2b364229c5c67c02593a7419b543d828524; dashboard function-deployment instructions 7618b03d241da8101c4c3f26df930b34191de416; recovery fixes a587fd5ccd46aedefb0815fda59a6cb4377cb46a and fb9ce73f65bec771b3770a857bb444b825d3249d.
- Prior handoff commits: initial 67aec1cdd0c1c80e4cbc760f7e4070000590c1b4; 2b6a43b0d9a4975f6a45df06573b0746bd0c4b39; d210828966b07b16633e8982ae3b7690ea97ea58; 9f35c5394106a7430b8b887e87e4a5ba925b5b4; 4072ba0a05f8dce946d5423562a72eae5f10f948; e58c1421908250693072dc169e593536e078ca7e; 253836050f308c0859362c4c72c05b232eba08cc.
- Do not merge or publish until remote setup, checks, review and required end-to-end tests are complete.

## 6. Files and architecture

Key files in PR #6:
- js/config/supabase.config.js — public project URL and publishable key.
- js/data/adapters/supabase-adapter.js — lazy-loads supabase-js from esm.sh; implements Auth, progress persistence, pending guest snapshot restoration, recovery-state checks and deletion invocation.
- js/data/api.js — selects/coordinates data adapters and exposes account/progress operations to views.
- js/main.js — app routing and account/auth lifecycle integration.
- js/core/links.js — route helpers including login, signup, callback and recovery routes.
- js/ui/views/auth.js — signup/login/legacy-login UI.
- js/ui/views/recovery.js — password reset completion UI.
- js/ui/views/account.js — account/profile/password/data export/import/deletion UI.
- auth-callback.html and js/auth-callback.js — standalone redirect endpoint and callback completion.
- supabase/migrations/20261116180000_user_progress.sql — progress table, grants and RLS policies.
- supabase/functions/delete-account/index.ts — authenticated account deletion.
- supabase/config.toml — project ref and function JWT setting.
- docs/supabase-setup.md — human setup, user-facing behavior and local setup.
- docs/AGENT_HANDOFF.md — this continuity record.

The app is plain browser JavaScript; there is no site-side npm install/build step for Supabase. Local development uses npm start at http://localhost:5173. The Supabase client is imported only when a cloud account operation is used.

## 7. Testing

Completed/observed:
- On 2026-11-17, reran focused tests from the temporary partial checkout at /tmp/ppp-check using Node v24.22.1. Result: 47 pass, 0 fail. Node syntax checks passed for the current supabase-adapter.js and api.js mirrors.
- Exact command, run from /tmp/ppp-check:
  ~~~sh
  node --check js/data/adapters/supabase-adapter.js
  node --check js/data/api.js
  node --test tests/guest-access.test.mjs tests/inline-marking.test.mjs tests/content-years.test.mjs tests/curriculum-map.test.mjs tests/spec-filtering.test.mjs tests/target-grades.test.mjs tests/question-parts.test.mjs tests/progress-failure-check.mjs tests/recovery-session-check.mjs tests/recovery-callback-check.mjs
  ~~~
  The three failure-injection scripts are temporary and are not part of the PR. They cover guest progress after failed login, progress restore failure and recovery callbacks that must skip progress reads.
- Independent code review at functional head fb9ce73 found no P1 issue; its recovery callback issue was fixed in that commit.
- Live production check at https://purepastpapers.com on 2026-11-17: June 2025 AS Pure Mathematics 01 loaded with 22 questions and 100 marks. The live signup page explicitly says progress is saved only in this browser and on this device, confirming PR #6 is not yet published. No signup form was submitted and no account was created.
- User reports Resend domain verification and Supabase SMTP settings saved; Supabase email delivery has not been tested.

Not completed:
- Full repository npm test / npm run validate; the workspace has no full checkout or large /data test bank. No complete build/lint run.
- Supabase Auth settings verification, safe migration-state inspection, migration application, RLS cross-user denial test, SMTP delivery, function deployment, and authenticated deletion.
- Production signup, confirmation, login, password reset, guest progress restoration, cross-device sync, export/import, deletion, and post-deploy exam-paper regression testing.

## 8. Known problems, blockers and risks

- This environment lacks authenticated Supabase admin access: no Supabase connector, CLI executable/session, or Management API credentials. GitHub access and the browser publishable key are not Supabase admin access.
- User reports SMTP was saved, but Supabase email delivery is untested. Rotate the SMTP API key before testing; use a new domain-restricted Sending-only key entered directly in Supabase.
- Auth sign-up, email confirmation and Email provider toggles are shown on in a 2026-11-17 screenshot, but the screenshot still shows Save changes; confirm persistence. Site URL/redirect values, migration state and Edge Function deployment remain unverified.
- The migration is not idempotent. It uses CREATE TABLE and CREATE POLICY without guards; inspect whether the table and all three policies already exist before applying. If partial or mismatched schema exists, stop and repair deliberately rather than rerunning.
- The feature code head was 42 commits behind main at the last comparison. PR base metadata is stale; recheck mergeability and paths.
- Full repository validation cannot run from this partial workspace.
- End-to-end tests do not establish production readiness. Progress snapshots use last-save-wins on concurrent devices.
- Supabase Dashboard's Edge Function editor does not sync with GitHub; redeploy from the branch if function code changes.

## 9. Exact next steps

1. At session start, read this file and docs/supabase-setup.md. Refresh PR #6, main head, feature head and checks.
2. If an authenticated Supabase connector/CLI becomes available, first read current Auth settings, schema/policies and function deployment status; do not rewrite already-correct settings. None was available in the 2026-11-17 workspace check.
3. Have the user rotate the Resend SMTP API key: create a fresh key with Sending access restricted to purepastpapers.com, then replace the SMTP password directly in Supabase. Never request the key in chat.
4. Verify/set Supabase Authentication → URL Configuration: Site URL https://purepastpapers.com and redirects https://purepastpapers.com/auth-callback.html, https://www.purepastpapers.com/auth-callback.html, http://localhost:5173/auth-callback.html, http://127.0.0.1:5173/auth-callback.html. The 2026-11-17 screenshot shows sign-ups, email confirmation and Email provider enabled; if edited, save and reopen to verify persistence.
5. Before applying SQL, run this read-only inspection in SQL Editor:
   ~~~sql
   select
     to_regclass('public.user_progress') is not null as table_exists,
     coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.user_progress')), false) as rls_enabled,
     coalesce((
       select jsonb_agg(jsonb_build_object('policy', policyname, 'command', cmd, 'roles', roles, 'using', qual, 'check', with_check) order by policyname)
       from pg_policies where schemaname = 'public' and tablename = 'user_progress'
     ), '[]'::jsonb) as policies,
     coalesce((
       select jsonb_agg(jsonb_build_object('grantee', grantee, 'privilege', privilege_type) order by privilege_type)
       from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'user_progress' and grantee = 'authenticated'
     ), '[]'::jsonb) as authenticated_grants;
   ~~~
   If table_exists is false, apply supabase/migrations/20261116180000_user_progress.sql. If the table exists, compare RLS/policies/grants to the migration and do not rerun it. If partial or unexpected, stop and repair safely.
6. Deploy delete-account from the current branch via CLI if authenticated CLI access becomes available; otherwise use the documented dashboard editor and leave JWT verification enabled.
7. Test Supabase confirmation and password-reset email delivery after key rotation. Then test signup, confirmation, login, password reset, guest progress, cross-device progress sync, export/import, RLS isolation with two test users, and deletion.
8. Recheck latest main/PR mergeability and all available validation; resolve any conflicts.
9. Merge only after verified prerequisites/checks, publish through GitHub Pages, then run the required production flows and confirm paper browsing still works.
10. Commit this handoff after each significant milestone with exact commands, outcomes, failures and SHAs.

## 10. Completion criteria

Do not mark complete until all are true:
- Site URL, redirects, Email provider and confirmation are verified in Supabase.
- A fresh restricted Resend key is saved and signup/reset emails are received through Supabase.
- The migration's resulting table, grants and RLS policies are verified; cross-user access is denied.
- delete-account is deployed with JWT verification and deletion works end-to-end.
- The latest PR is reviewed against current main and all available checks pass.
- PR #6 is merged, GitHub Pages publishes, and production signup, confirmation, login, reset, guest-progress preservation, cross-device sync, RLS isolation, account deletion and existing paper flows all pass.
- The handoff records the exact final commit/deployment SHAs and distinguishes verified from user-reported facts.
