# Private study summary

The summary is available at [purepastpapers.com/study-summary/](https://purepastpapers.com/study-summary/).
From a new ChatGPT Work chat with cloud-browser access, say:

> Open https://purepastpapers.com/study-summary/ in the cloud browser and tell me how many PPP questions I answered in the last seven days. Use the 7 days filter and tell me when the data was last saved.

Use the secure browser sign-in form if prompted. PPP authorises the verified PPP account and its active session. Anyone with the URL still needs that PPP account's authenticated session. The cloud browser controls which ChatGPT tasks can use its saved session.

## Private setup and revocation

Apply `20261123200000_private_study_summary.sql` to the PPP Supabase project before enabling access. With the owner binding empty, every browser is denied. The project administrator should privately confirm the supplied address against one existing, verified account before enabling. Generate a random UUID salt offline and calculate SHA-256 over the UTF-8 bytes of `salt:lowercase-email`. Use the same salt and hex digest for both the lookup and the binding, keeping the original address and resolved UUID out of source, URLs and query text.

```sql
with candidate as (
  select id
  from auth.users
  where email_confirmed_at is not null
    and sha256(convert_to('<salt>:' || lower(email), 'UTF8')) = decode('<digest>', 'hex')
)
insert into ppp_study_private.owner_binding (user_id, email_salt, email_fingerprint)
select id, '<salt>'::uuid, decode('<digest>', 'hex')
from candidate
where (select count(*) from candidate) = 1
on conflict (singleton) do nothing
returning singleton as activated;
```

An insert returning one row activates the account. To revoke access, an administrator
deletes the single binding row. To replace a binding, verify the replacement independently,
then delete and reinsert in one transaction. An email change on the bound identity denies
access until the administrator verifies and reconfigures it. A PPP sign-out invalidates the
affected session for this feature. Existing PPP permissions are governed by the original RLS.

## Verification

Run the JavaScript tests and the SQL regression in a local Supabase-compatible PostgreSQL
database using `tools/flashcards/sql-tests.mjs supabase/tests/private_study_summary.sql`.
On the deployed site check the response cache and robots headers, an anonymous request to
the endpoint, another student's unchanged Data Hub, and the approved owner signed in via
the ChatGPT cloud browser. In a separate Work chat, repeat the prompt to check session
reuse under that account's browser settings.
