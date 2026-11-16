# Supabase accounts and progress sync

The site is a static JavaScript app, so the browser uses Supabase Auth and a public
publishable key. Student progress is stored as one JSON document per user in
`public.user_progress`; row-level security lets each signed-in user access only their
own row. No Supabase secret key belongs in the website.

## One-time project setup

To apply the migration or deploy the Edge Function before the site change is merged, check
out this feature branch in your local repository first:

```sh
git fetch origin codex/supabase-account-sync-2026-11-16
git switch codex/supabase-account-sync-2026-11-16
```

1. In Supabase **Authentication → URL Configuration**, set the Site URL to
   `https://purepastpapers.com`. Add these exact redirect URLs so confirmation returns to
   the same origin and can restore staged guest progress:
   - `https://purepastpapers.com/auth-callback.html`
   - `https://www.purepastpapers.com/auth-callback.html`
   - `http://localhost:5173/auth-callback.html`
   - `http://127.0.0.1:5173/auth-callback.html`
2. Keep email confirmation enabled in **Authentication → Providers → Email**.
3. In **SQL Editor**, run the contents of
   `supabase/migrations/20261116180000_user_progress.sql`.
4. Deploy the account deletion function from the repository root:
   ```sh
   npx supabase login
   npx supabase link --project-ref spjlnvjdstxdajcsljvq
   npx supabase functions deploy delete-account --project-ref spjlnvjdstxdajcsljvq
   ```
   The function uses Supabase's injected publishable and secret key maps through
   `@supabase/server`; you do not need to paste a secret key into GitHub or the app.
5. Configure custom SMTP in **Authentication → Emails → SMTP Settings** and verify your
   sending domain before opening signup to everyone. Supabase's built-in sender only
   reaches project team addresses and is limited to 2 emails per hour.
6. Confirm the project has the email provider enabled. The website URL and publishable
   key are already set in `js/config/supabase.config.js`; both are public values.
7. After the feature branch is merged and GitHub Pages publishes it, test signup with a
   new email, confirmation, login, password reset, progress sync on another device,
   export/import, and account deletion.

## What students see

- Signup asks for an email, password, name, and study level. With email confirmation on,
  the page asks them to check their inbox; the confirmation link returns through
  `auth-callback.html`.
- New signups carry over the current browser's guest progress. If the email link is opened
  on another device, logging into the new account from the original browser can restore
  that snapshot when the cloud account has no progress yet. Existing cloud progress is
  never overwritten by the guest snapshot.
- Students can reset their password from the login page and download/import a JSON backup
  from Account. Existing browser-only accounts can still be opened from the “older
  browser account” link on the login page, then exported and imported after signing in to
  Supabase.
- Progress sync writes a complete JSON snapshot. If the same account is edited at the same
  time on two devices, the last saved snapshot wins.

## Local setup

Run `npm start` and use `http://localhost:5173`. The project has no bundler, so the
browser loads `supabase-js` from esm.sh when a Supabase operation is first used. No
`npm install` is needed for the site itself.
