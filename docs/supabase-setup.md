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

   If you are deploying from an iPad without a repository terminal, Supabase's
   dashboard also supports **Edge Functions → Deploy a new function → Via Editor**.
   Create a function named `delete-account`, paste the current source from
   [the feature branch](https://github.com/PurePastPapers/Purepastpapers/blob/codex/supabase-account-sync-2026-11-16/supabase/functions/delete-account/index.ts),
   and deploy with JWT verification left enabled. The dashboard editor does not sync
   with GitHub and has no version history or rollback; the repository file remains the
   source of truth, so later code changes must be redeployed from the branch or pasted
   into the editor. See [Supabase's dashboard deployment guide](https://supabase.com/docs/guides/functions/quickstart-dashboard).
5. Configure custom SMTP in **Authentication → Emails → SMTP Settings** before opening signup
   to everyone. For Resend, create a separate API key with **Sending access** and restrict it
   to the verified `purepastpapers.com` domain. Enter these values in Supabase:
   - SMTP host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the domain-restricted Resend API key (enter it directly in Supabase; never put
     it in this repository or chat)
   - Sender email: `no-reply@purepastpapers.com`
   - Sender name: `PurePastPapers`
   Keep click/link tracking off for authentication emails if it would rewrite the Supabase
   confirmation or recovery URL; [Supabase warns](https://supabase.com/docs/guides/deployment/going-into-prod)
   some SMTP providers' link tracking can deform auth links. Supabase's built-in sender only
   reaches project team addresses and is currently limited to 2 emails per hour.
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
  from Account. The old “older browser account” login (`/legacy-login`) was removed on
  2026-11-27 because no one had such an account.
- Progress sync writes a complete JSON snapshot. If the same account is edited at the same
  time on two devices, the last saved snapshot wins.

## Local setup

Run `npm start` and use `http://localhost:5173`. The project has no bundler, so the
browser loads `supabase-js` from esm.sh when a Supabase operation is first used. No
`npm install` is needed for the site itself.

## Google sign-in

The login and sign-up pages have a "Continue with Google" button (cloud accounts only). The
site calls `supabase.auth.signInWithOAuth({ provider: 'google' })` with the existing
`auth-callback.html` as `redirectTo`, so the redirect URLs listed above are all it needs.

Setup, done once in two dashboards:

1. **Google Cloud Console → Google Auth Platform.** Create a "Web application" OAuth client.
   - Authorized JavaScript origins: `https://purepastpapers.com`, `https://www.purepastpapers.com`,
     `http://localhost:5173`.
   - Authorized redirect URI: exactly the callback shown in Supabase (Authentication → Sign In /
     Providers → Google), which is `https://spjlnvjdstxdajcsljvq.supabase.co/auth/v1/callback`.
   - Scopes: only `email`, `profile`, `openid`. Authorized domains: `purepastpapers.com` and the
     project domain `spjlnvjdstxdajcsljvq.supabase.co` (Google rejects the bare `supabase.co`).
   - While the app's publishing status is Testing, only listed test users can sign in. Publish it
     to production before announcing the button. Google may ask for a privacy policy and terms page.
2. **Supabase → Authentication → Sign In / Providers → Google.** Switch it on and paste the Client ID
   and Client Secret. The secret lives only here, never in the repo.

How it behaves:

- A first Google sign-in opens the welcome tour; a returning one opens the dashboard. A `next`
  route given on the login page is kept across the trip to Google.
- The name comes from Google (`full_name`) unless the student has set one in Account.
- Supabase links a Google sign-in to an existing password account with the same email
  (see Supabase's identity-linking docs). A Google-only account has no password; Account explains
  how to add one with "Forgot your password?".
- A cancelled or failed Google sign-in lands on `auth-callback.html` with a Google-specific message.
- Guest progress made before signing in is not carried over by a Google sign-in (the email sign-up
  flow stages it; this one does not).
