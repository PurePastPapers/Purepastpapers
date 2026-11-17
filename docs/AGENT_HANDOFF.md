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
- Auth URL settings and email confirmation have not been confirmed in the dashboard.
- Custom SMTP has not been confirmed configured in Supabase.
- The Edge Function has not been confirmed deployed.
- End-to-end signup, confirmation, login, password reset, cross-device sync and deletion have not been verified on production.

Independent static review found and fixed several issues: the deletion function now reads the normalized authenticated user ID, startup falls back safely when progress cannot load, failed login preserves the prior guest snapshot, and password recovery both bypasses progress loading on callback and remains independent of progress restore (commits a587fd5ccd46aedefb0815fda59a6cb4377cb46a and fb9ce73f65bec771b3770a857bb444b825d3249d). The final independent review at fb9ce73 found no P1 issue and confirmed its P2 recovery finding is resolved. These are code-level checks only and do not establish that the live Supabase project works.

## 3. Supabase setup

Verified repository configuration:
- Project ref: spjlnvjdstxdajcsljvq.
- Public URL and publishable key are already present in js/config/supabase.config.js. Do not copy credentials into this document.
- Migration file: supabase/migrations/20261116180000_user_progress.sql.
- The migration creates public.user_progress with user_id as the auth.users foreign key and primary key, progress JSONB and updated_at.
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

Dashboard state is unknown/unverified. In the prior agent session the shared Supabase browser was signed out. The user is on iPad and cannot use Desktop Take Over. Guide them through the Supabase dashboard on iPad or provide exact click-by-click steps; do not depend on the shared desktop session.

Required dashboard work:
1. Authentication → URL Configuration: set Site URL and the four exact redirect URLs above.
2. Authentication → Providers → Email: verify the provider is enabled and email confirmation remains enabled.
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

User-reported status (2026-11-17; not independently checked in Resend or Names.co.uk):
- Resend domain purepastpapers.com is verified.
- DNS provider is Names.co.uk.
- DKIM, SPF-related CNAME records and DMARC are configured.
- A test email was successfully delivered.
- Desired From address is no-reply@purepastpapers.com.

Still outstanding/unverified:
- Supabase custom SMTP has not been confirmed configured. docs/supabase-setup.md was expanded in commit 7efde9949e12ff6f681109407385650093711a64 with Resend values: smtp.resend.com:465, username resend, a domain-restricted Sending-access API key as password, and sender no-reply@purepastpapers.com (PurePastPapers).
- SMTP host, port, username, password and sender identity must be entered in Supabase Authentication → Emails → SMTP Settings. Do not request or store the password in chat or GitHub.
- Confirm the sender address is authorized by the verified domain and send signup-confirmation and password-reset test emails after configuring SMTP.
- Supabase built-in mail sender is not suitable for public signup; setup notes warn it is restricted to project team addresses and 2 emails/hour.

On iPad, have the user open Supabase Dashboard → project → Authentication → Emails → SMTP Settings. They can enter Resend's SMTP connection values directly there. Ask them to report only whether settings saved and whether a test email arrived; never ask for SMTP credentials.

## 5. GitHub status

Verified through GitHub on 2026-11-17:
- Repository: PurePastPapers/Purepastpapers.
- Active feature branch: codex/supabase-account-sync-2026-11-16.
- Pull request: #6, https://github.com/PurePastPapers/Purepastpapers/pull/6.
- Latest branch head before this handoff refresh: 9f35c5394106a7430b8b887e87e4a5ba925b5b4a (19 commits, 16 changed files). It contains the final reviewed code at fb9ce73f65bec771b3770a857bb444b825d3249d plus handoff updates. This update adds a documentation-only commit.
- Current main head: 07d072319b534db5f1cc63bdd652377cd9fbc108. Comparing current main with the branch head reports 19 commits ahead and 42 behind, merge base 516243dcefa8e0a9be4e26ed6209703c3322947f.
- PR metadata records base SHA c3530261bb9a8673f7d7b07daee2e098b788c091, which is stale relative to current main. The GitHub connector reports mergeable=false; a direct GitHub REST PR response reports mergeable=true / mergeable_state=clean against the recorded base SHA. Treat mergeability as unresolved until refreshed against current main.
- All 16 PR-changed paths were individually compared between merge base 516243d and current main 07d072; none changed on main since that merge base. This supports a clean path-level integration but does not replace a refreshed GitHub merge check.
- Latest commit status query returned no status entries; GitHub Actions workflow-run query returned no PR workflow runs. Main reports branch protection disabled and no required checks.
- Significant feature commits (in order): initial implementation 14e237bffade89ecc34c08cc8b810d345506742f; JWT configuration ee6869d4bbc868960e3f7e09907447f7da8a8008; Resend setup documentation 7efde9949e12ff6f681109407385650093711a64; handoff/progress update 2b6a43b0d9a4975f6a45df06573b0746bd0c4b39; deletion identity fix ff2db8fd0b9dcf9c88914a681ab3b0cbfabdccbd; startup progress-read fallback b241c263d97eac6f2a406341aef962b97b78cba0; failed-login guest-state preservation bd07f2b364229c5c67c02593a7419b543d828524; iPad dashboard function-deployment instructions 7618b03d241da8101c4c3f26df930b34191de416; first recovery gate fix a587fd5ccd46aedefb0815fda59a6cb4377cb46a; prior handoff checkpoint d210828966b07b16633e8982ae3b7690ea97ea58; recovery-callback fix fb9ce73f65bec771b3770a857bb444b825d3249d; previous handoff refresh 9f35c5394106a7430b8b887e87e4a5ba925b5b4a.
- Initial handoff commit: 67aec1cdd0c1c80e4cbc760f7e4070000590c1b4. Use GitHub branch history to identify this refresh's commit SHA.
- Do not merge or publish until Supabase setup, full available checks, review, and end-to-end tests are complete.

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
- PR #6 head, changed-file list, current main SHA, commit status and workflow runs were refreshed through GitHub on 2026-11-17.
- The migration was statically inspected: RLS is enabled; authenticated select/insert/update policies bind user_id to auth.uid(); no delete policy is granted; deleting an auth user cascades the progress row. This is source inspection, not an executed database test.
- The function source was reviewed. JWT verification remains enabled, and the handler resolves the authenticated user through the normalized userClaims.id field.
- Final independent static review of code head fb9ce73 found no P1. It confirmed the P2 recovery callback finding was closed by skipping pending-signup restoration on recovery links.
- Live production smoke check at https://purepastpapers.com on 2026-11-17 tested only existing public behavior: guest Mathematics selection, the practice page (1,110 matching questions) and June 2025 AS Pure Mathematics 01 (22 questions, 100 marks). PR #6 is not deployed, so this does not test Supabase auth or sync.
- The user reports that Resend domain verification and a test email succeeded. This was not independently verified in Resend.
- In the temporary partial checkout at /tmp/ppp-check, Node v24.22.1 syntax checks passed for the latest js/data/adapters/supabase-adapter.js and js/data/api.js.
- Focused tests passed: 47 pass, 0 fail. Tests include existing data-independent repository tests and temporary uncommitted failure-injection checks for failed-login guest progress preservation, progress restoration failure, a password recovery marker surviving progress-read failure, and a mocked recovery callback skipping pending signup/progress reads. Exact command, run from /tmp/ppp-check:
  ~~~sh
  node --check js/data/adapters/supabase-adapter.js
  node --check js/data/api.js
  node --test tests/guest-access.test.mjs tests/inline-marking.test.mjs tests/content-years.test.mjs tests/curriculum-map.test.mjs tests/spec-filtering.test.mjs tests/target-grades.test.mjs tests/question-parts.test.mjs tests/progress-failure-check.mjs tests/recovery-session-check.mjs tests/recovery-callback-check.mjs
  ~~~
  The three failure-injection scripts are temporary files and are not part of the PR.
- Earlier nine changed JavaScript modules passed node syntax checks in a temporary copy during the previous session; the latest API and adapter edits were separately checked above.

Not completed:
- The agent workspace does not contain a full repository checkout or the large /data test bank. npm test and npm run validate have not been run; no full build/lint suite has completed. Node v24.22.1 and npm 11.9.0 are available, but no Deno or psql executable.
- One earlier syntax-check attempt referenced js/ui/views/recovery.js, which was not present in the partial temporary mirror; it failed with a missing-file error, not a source syntax error. That file was unchanged by the latest recovery fix.
- Migration execution and an actual two-user RLS denial test.
- Dashboard URL/provider/email-confirmation verification; SMTP send/receive from Supabase.
- Edge Function deployment and authenticated account-deletion test.
- Production signup, confirmation, login, password reset, sync across two devices, guest-progress restoration, export/import, deletion, and post-deployment paper-flow regression testing.

## 8. Known problems, blockers and risks

- Supabase dashboard configuration, migration execution and function deployment remain unconfirmed. The user is on iPad and cannot use Desktop Take Over; guide them through dashboard screens or use the documented editor path.
- The user must enter SMTP credentials directly into Supabase. Never request or store the Resend API key in chat, repository, or handoff.
- Resend domain verification does not itself configure Supabase custom SMTP.
- The feature code head is 42 commits behind main. GitHub's mergeability indicators disagree, and the PR's reported base SHA is stale. All 16 PR paths were verified unchanged on current main since the merge base; still refresh GitHub's mergeability against latest main before integration.
- Full repository validation cannot run from this partial workspace; the large /data test bank is absent.
- End-to-end production verification has not established that account creation or sync is ready for students.
- Progress sync writes complete snapshots; simultaneous edits on two devices are last-save-wins.
- Guest restoration requires the original browser's staged local snapshot to remain available, or logging in from that browser after confirming on another device.
- Supabase Dashboard's Edge Function editor does not sync with GitHub and has no version history or rollback. Keep the branch source of truth and redeploy if the function changes.

## 9. Exact next steps

1. At session start, read this file and docs/supabase-setup.md. Refresh PR #6, feature head, main head, checks and changed paths.
2. Guide the user on iPad to Supabase project → Authentication → URL Configuration. Set Site URL to https://purepastpapers.com and allow:
   - https://purepastpapers.com/auth-callback.html
   - https://www.purepastpapers.com/auth-callback.html
   - http://localhost:5173/auth-callback.html
   - http://127.0.0.1:5173/auth-callback.html
3. In Authentication → Providers → Email, verify Email is enabled and confirmation is on.
4. In Authentication → Emails → SMTP Settings, have the user enter Resend SMTP values directly: host smtp.resend.com, port 465, username resend, a restricted Sending-access Resend API key as password, sender no-reply@purepastpapers.com, sender name PurePastPapers. Do not ask them to share the key. Confirm settings saved and an auth email reaches the inbox.
5. Apply supabase/migrations/20261116180000_user_progress.sql in SQL Editor and confirm success.
6. Deploy delete-account from the current branch. The user has no repository terminal on iPad; docs/supabase-setup.md includes the Dashboard → Edge Functions → Deploy a new function → Via Editor steps and current source link. Keep JWT verification enabled.
7. Re-review the complete PR at its latest head against main; resolve any findings. Run all checks available in a full checkout if one becomes available, plus a cross-user RLS test using two test accounts and no real student data.
8. Test signup and confirmation, login, password reset, guest progress preservation, progress sync on a second device, export/import, and account deletion against the configured project.
9. Check existing exam-paper functionality for regressions. Confirm the latest PR branch can be integrated with current main safely.
10. Only after prerequisites and tests pass, merge PR #6, verify GitHub Pages publishes it, and repeat the auth/sync/paper flows at https://purepastpapers.com.
11. Update and commit this handoff after every significant milestone, including exact commands, outcomes, errors and SHAs. If work is interrupted, leave the next specific action here.

## 10. Completion criteria

Do not mark complete until all are true:
- Supabase Site URL, exact redirects, Email provider and email-confirmation settings are confirmed.
- Resend custom SMTP is configured in Supabase and signup-confirmation/reset email delivery is verified.
- The migration is applied and cross-user RLS denial is verified with separate test accounts.
- delete-account is deployed and account deletion is tested end-to-end.
- The latest PR diff is reviewed against current main; all available checks pass and no blocker remains.
- PR #6 is merged and GitHub Pages has published the change.
- Live production tests confirm signup, confirmation, login, password reset, guest-progress preservation, cross-device sync, own-row isolation, account deletion, and unaffected exam-paper functionality.
- This file records exact verified results, user-reported facts, relevant commit/deployment SHAs and outstanding limitations.
