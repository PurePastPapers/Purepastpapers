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

Previous independent static review reported no known blocker after fixes to recovery-route checks, local-only signout, guest snapshot handling and local practice-draft cleanup. This was code review only; it did not establish that the live Supabase project works.

## 3. Supabase setup

Verified repository configuration:
- Project ref: spjlnvjdstxdajcsljvq.
- Public URL and publishable key are already present in js/config/supabase.config.js. Do not copy credentials into this document.
- Migration file: supabase/migrations/20261116180000_user_progress.sql.
- The migration creates public.user_progress with user_id as the auth.users foreign key and primary key, progress JSONB and updated_at.
- RLS is enabled. Grants give authenticated users select/insert/update; policies compare user_id with auth.uid() for each operation. No delete policy is granted; deleting an auth user cascades the row.
- Function source: supabase/functions/delete-account/index.ts.
- Supabase CLI config: supabase/config.toml; delete-account sets verify_jwt = false because the handler uses @supabase/server with auth: 'user' to validate the caller.
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
- Supabase custom SMTP has not been confirmed configured.
- SMTP host, port, username, password and sender identity must be entered in Supabase Authentication → Emails → SMTP Settings. Do not request or store the password in chat or GitHub.
- Confirm the sender address is authorized by the verified domain and send signup-confirmation and password-reset test emails after configuring SMTP.
- Supabase built-in mail sender is not suitable for public signup; setup notes warn it is restricted to project team addresses and 2 emails/hour.

On iPad, have the user open Supabase Dashboard → project → Authentication → Emails → SMTP Settings. They can enter Resend's SMTP connection values directly there. Ask them to report only whether settings saved and whether a test email arrived; never ask for SMTP credentials.

## 5. GitHub status

Verified on 2026-11-17 through GitHub:
- Repository: PurePastPapers/Purepastpapers.
- Active feature branch: codex/supabase-account-sync-2026-11-16.
- Pull request: #6, https://github.com/PurePastPapers/Purepastpapers/pull/6.
- PR title: Add Supabase accounts and cross-device progress sync.
- PR is open, not merged, and reported mergeable.
- Feature implementation commit: 14e237bffade89ecc34c08cc8b810d345506742f.
- PR base branch: main; base SHA observed: c3530261bb9a8673f7d7b07daee2e098b788c091.
- The last combined status query for the feature commit returned no status entries; recheck before merging.
- No source changes were made in this handoff session before this file.
- Initial handoff document commit: 67aec1cdd0c1c80e4cbc760f7e4070000590c1b4. The current handoff revision is always the latest docs/AGENT_HANDOFF.md on the feature branch; use GitHub commit history for later handoff updates.

The PR body says project setup should be completed before merge. Do not merge or publish until required Supabase setup is applied and checks are completed.

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
- The feature branch and PR metadata were fetched from GitHub.
- The public Supabase config was checked against the project URL and publishable key supplied by the user.
- The migration and Edge Function source were inspected.
- The migration's policies constrain rows to auth.uid() = user_id by static inspection.
- A prior static review found no blocker after code fixes.
- User reports a Resend test email was delivered.

Not completed:
- No local repository checkout was available in the agent workspace during the previous session; no local test/build/lint command ran.
- GitHub combined status query returned no status rows; recheck current checks.
- Migration execution and cross-user RLS denial test.
- Dashboard URL/provider/email-confirmation verification.
- Supabase SMTP send/receive tests.
- Edge Function deployment and authenticated deletion test.
- Production signup, confirmation, login, reset, sync across two devices, guest progress preservation, export/import, deletion and existing paper-flow regression tests.

## 8. Known problems, blockers and risks

- Dashboard changes require an authenticated Supabase owner session. The available shared browser was signed out, and the user cannot use Desktop Take Over from iPad.
- Resend domain verification does not by itself configure Supabase SMTP.
- The user must enter SMTP credentials directly in Supabase; do not request these in chat.
- User progress sync writes complete snapshots; simultaneous edits on two devices are last-save-wins.
- Guest progress restoration depends on the same browser retaining the staged local snapshot or the user logging in from that original browser after confirming on another device.
- No live end-to-end verification has established that account flows are ready for students.
- Recheck GitHub base/head and deployment status because the branch may have changed since this handoff was written.

## 9. Exact next steps

Priority order:
1. Read this file and docs/supabase-setup.md at session start. Confirm PR #6, branch head and main base are unchanged.
2. On the user's iPad, guide them to Supabase project → Authentication → URL Configuration, then set the Site URL and exact redirect allow-list above. Confirm email confirmation is enabled.
3. Guide the user to Authentication → Emails → SMTP Settings and have them enter Resend SMTP values directly. Do not ask for the password. Confirm saved status and successful inbox delivery.
4. Apply supabase/migrations/20261116180000_user_progress.sql in SQL Editor. Capture the success result without exposing secrets.
5. Deploy delete-account from the feature branch using the CLI commands above, or a verified dashboard alternative if terminal login is unavailable.
6. Review the complete PR diff against current main; run all checks available. Fix issues on the same feature branch and update this document after each milestone.
7. Verify RLS with two test accounts: each can access their own row; another account cannot select, insert or update the first user's row. Do not use real student data.
8. Test signup and confirmation, login, password reset, staged guest progress preservation, progress sync across devices, export/import and deletion against the configured project.
9. Check existing exam-paper flows for regressions.
10. Only when prerequisites and checks pass, merge PR #6, confirm GitHub Pages deployment, and run production smoke tests at https://purepastpapers.com.
11. Commit a final handoff update with exact outcomes, failures, SHAs, deployed URLs and any remaining limitations.

## 10. Completion criteria

Do not mark complete until all are true:
- Supabase Site URL, redirects, Email provider and confirmation setting are confirmed.
- Resend custom SMTP is configured in Supabase and confirmation/reset email delivery is tested.
- The migration is applied and RLS denial of cross-user access is verified.
- delete-account is deployed and account deletion is tested end-to-end.
- The PR diff is reviewed, all available checks pass, and no blocking issue remains.
- PR #6 is merged and GitHub Pages has published the change.
- Live production tests at https://purepastpapers.com confirm signup, confirmation, login, password reset, guest-progress preservation, cross-device sync, own-row isolation, account deletion and unaffected exam-paper functionality.
- This document records what was verified, what was only user-reported, and the final relevant commit/deployment SHAs.
