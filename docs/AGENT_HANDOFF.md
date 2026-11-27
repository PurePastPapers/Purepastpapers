# Agent handoff: Supabase accounts and progress sync

Last updated: 2026-11-22 (Europe/London)

## Start here

At the beginning of every agent session, read this file and `docs/supabase-setup.md` before changing code or Supabase settings. Update and commit this handoff after each significant milestone and before context or usage limits.

Never put passwords, SMTP credentials, Supabase secret keys, access tokens, or other secrets in this document, GitHub, logs, or chat.

## Private study summary

- The browser-only study summary at `/study-summary/` reads projected progress from
  the new `private_study_summary` RPC through the existing signed-in Supabase session.
  It renders independently of the usual progress and handwriting sync. The Data Hub
  reveals its link only after the authenticated RPC confirms access.
- The migration installs an empty owner binding. The operator runbook in
  `docs/private-study-summary.md` describes activation, revocation and verification.
  No custom ChatGPT app or new student role is part of this release.

## Printable practice tests and handwritten answers

- Practice exports keep a versioned reference-only snapshot in the student's custom tests. Paper attempts use stable IDs and a frozen selection, with completion and score saved separately. Account progress writes use a compare-and-swap on `user_progress.updated_at` to preserve offline test commits from another device.
- New question-paper exports pin checksums for the prompt, context and scheme crops. Reopening a test preserves its numbers and marks if a crop is revised at the same URL. Missing or restricted required materials block a question-paper export and list the affected references. Scheme-only export can still use verified extracts or official source links.
- Keep the PDF module version query in sync when changing PDF imports or exports. A Practice tab can hold an older module in memory while fetching the exporter for the first time.
- Retakes open a distinct attempt in Exported tests. Overall-only results omit per-question analytics for that attempt, and revisiting detailed marking restores previously entered part marks.
- Guest exported tests and paper results are retained in the current browser tab. Practice handwriting is stored in owner-scoped IndexedDB. A signed-in account syncs each bounded answer separately through the handwriting RPCs. Conflicting edits remain available until the student chooses a version.
- Migration `20261122120000_ink_responses.sql` was applied to the production Supabase project. The rollback-only test in `supabase/tests/ink_responses_isolation.sql` passed in local PostgreSQL with synthetic auth identities. Production metadata confirms RLS and an owner read policy on each handwriting table.
- User deletion cascades handwriting records in Supabase. The Account backup includes handwriting, and deleting an individual attempt removes its associated handwriting. Verification on physical Apple Pencil hardware remains separate from browser pointer tests.

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
- PR #6 merged as `2840caa82752a4fc1d6e499455a3073b2f8e4f93`; PR #13 merged as `18ceb5e3c6b6f99433a892ae523ccbd460bc1b27`.
- GitHub Pages deployments succeeded for PR #6 (run 81, `44199928570`) and PR #13 (run 82, `44201030653`).
- Supabase project is ACTIVE_HEALTHY; the user_progress migration/table/RLS and delete-account function remain deployed and verified below.
- Public Supabase Auth settings endpoint returned HTTP 200 on 2026-11-17: email provider enabled (`external.email=true`), new signups allowed (`disable_signup=false`), email confirmation required (`mailer_autoconfirm=false`). Google and Apple are disabled; they are optional and not needed for email/password accounts.
- Resend reports `purepastpapers.com` verified with sending enabled, click tracking off.
- Production pages were refreshed in Chromium on 2026-11-17: signup shows that progress syncs after confirmation; login and password reset forms render. No signup or reset form was submitted.
- Production exam-paper browse still works: A-Level Edexcel Mathematics lists 60 papers; June 2025 AS Pure Mathematics 01 opened with 22 questions and 100 marks.

User-reported, not independently inspectable through connected settings tools:
- Site URL is `https://purepastpapers.com` and the four redirect URLs in section 3 were saved.
- Supabase custom SMTP was saved with sender `no-reply@purepastpapers.com`; previous SMTP key was replaced by a domain-restricted key.

Still unverified end-to-end:
- SMTP delivery from Supabase Auth, signup/confirmation/login, password reset, guest-progress restoration, sync on another device, backup import/export, two-user SELECT/UPDATE isolation, account deletion, and paper-score persistence.
- `auth.users` count and `user_progress` row count were both zero at the last read-only check. A user-controlled inbox and disposable accounts are needed for end-to-end testing.

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
- A read-only SQL recheck on 2026-11-17 confirmed RLS enabled (not forced), three authenticated-only policies scoped to `auth.uid() = user_id` for SELECT/INSERT/UPDATE, no anon SELECT/INSERT grant, authenticated SELECT/INSERT/UPDATE grants, no authenticated DELETE grant, and zero progress rows.
- `auth.users` count was 0 at the last check.
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
- The Supabase connector does not expose dashboard Site URL, redirect allow-list, or SMTP settings. Public `GET /auth/v1/settings` verified email provider enabled, signups allowed, and confirmation required; the endpoint does not return Site URL or redirect allow-list. Those values remain user-reported until live auth flows pass.
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
- Latest application/deployment SHA (PR #13 merge): `18ceb5e3c6b6f99433a892ae523ccbd460bc1b27`. The predecessor handoff was refreshed in docs-only commit `4d98be9d4956a4692320d17bc73d28e91766c27`; this session adds a documentation-only update.
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
- `js/ui/views/auth.js` — signup and login forms.
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

Completed on latest main application commit `18ceb5e3c6b6f99433a892ae523ccbd460bc1b27` (checkout head before this handoff refresh was `4d98be9d4956a4692320d17bc73d28e91766c27`):
- Focused regression command:
  ```sh
  node --test tests/guest-access.test.mjs tests/inline-marking.test.mjs tests/content-years.test.mjs tests/curriculum-map.test.mjs tests/spec-filtering.test.mjs tests/target-grades.test.mjs tests/question-parts.test.mjs tests/progress-failure-check.test.mjs tests/recovery-session-check.test.mjs tests/recovery-callback-check.test.mjs
  ```
  Result: 44 passed, 0 failed.
- Node v24.22.1 syntax checks passed:
  ```sh
  node --check js/data/adapters/supabase-adapter.js && node --check js/data/api.js && node --check js/ui/views/auth.js && node --check js/auth-callback.js && node --check js/ui/views/recovery.js && node --check js/ui/views/account.js
  ```
- Supabase schema/RLS/grants/migration/function/security checks and production page/paper checks passed as recorded in sections 2 and 3.
- Independent reviews of PR #6 and PR #13 found no blocking defects.

Attempted but incomplete because the local checkout was intentionally sparse:
- `npm test` exited 1 because sparse checkout omitted required `data/packs/index.json`, `data/imports/...`, and `data/specs/...`; Playwright layout tests also lacked the Playwright-managed Chromium executable. This is not a full-suite result or a confirmed application failure.
- `npm run validate` exited 1 because `data/subjects.json` was omitted.
- Temporary checkout commands:
  ```sh
  git clone --filter=blob:none --no-checkout --depth 1 --sparse https://github.com/PurePastPapers/Purepastpapers.git /tmp/ppp-final-check
  git sparse-checkout set --no-cone '/package.json' '/tests/' '/tools/' '/js/' '/supabase/'
  git checkout -f main
  ```
- GitHub reported no status checks for the application commit; the Pages deployment for PR #13 succeeded.

## 8. Known problems and risks

- The Supabase connector cannot read dashboard Site URL, redirect allow-list or SMTP fields. Email provider, signup and confirmation flags were verified using the public Auth settings endpoint; Site URL and the redirect list remain user-reported until a confirmation callback succeeds.
- Supabase Auth confirmation/reset delivery is untested because no inbox was submitted. Production UI rendering and public Auth settings do not prove delivery.
- Do not ask the user for mailbox passwords, account passwords, SMTP credentials, confirmation tokens or Supabase keys. The user must control the inbox and click the confirmation link.
- The rollback-only SELECT/UPDATE probe with synthetic UUIDs stopped at the `auth.users` foreign key; no changes were made. Real two-user isolation needs disposable accounts.
- Account deletion has not been exercised with a real signed-in disposable account.
- The old browser tab initially showed cached pre-deployment copy; after reload, the latest signup copy appeared. If a student's tab shows old wording, refresh it.
- Progress snapshots are last-save-wins if the same account is edited simultaneously on two devices.

## 9. Exact next steps

1. The user opens `https://purepastpapers.com/#/signup` on the iPad and creates one account with an inbox they control. They enter the password only on the site and share no credentials or email address in chat.
2. Check inbox/spam and click the confirmation link in the same browser/device used to stage any guest progress. Report only whether the email arrived and the callback succeeded. If not, capture the non-sensitive error text.
3. After confirmation, test login and password reset from the live site. The user enters any password only into the site.
4. Sign into the same account on a second device/browser, make one progress change on each device in turn, and confirm sync; verify JSON export/import and guest-progress restoration.
5. Create a second disposable account for real two-user RLS tests. Verify it cannot read/update the first user's progress. Test account deletion only with a disposable signed-in account.
6. Check a saved paper score with the test account, record pass/fail outcomes and cleanup status here, and never record email addresses, passwords, tokens or keys.

## 10. Completion criteria

Do not mark the integration complete until all are true:
- The public Auth settings endpoint shows email enabled, signups allowed and confirmation required; the Site URL and exact redirect allow-list are confirmed in Supabase dashboard or by successful production callback tests.
- Supabase Auth confirmation and password-reset emails reach the user through the configured Resend SMTP.
- The migration is recorded; table, grants and owner-scoped RLS are verified; cross-user reads/writes are denied using real accounts.
- `delete-account` is ACTIVE with JWT verification and deletion succeeds for a disposable signed-in account.
- PR #6 and PR #13 are merged; the corresponding GitHub Pages deployments succeeded.
- Production signup, confirmation, login, reset, guest-progress preservation, cross-device sync, backup import/export and paper-score persistence pass.
- Existing exam-paper browsing remains available.
- This handoff records the exact deployment/test SHAs and distinguishes verified facts from user reports.
