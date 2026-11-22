# Flashcards local QA stack

Runs the Flashcards SQL regression tests and browser checks against a disposable
local PostgreSQL database. Nothing here talks to the hosted Supabase project: the
browser's requests for the project URL and for supabase-js on esm.sh are routed to
`server.mjs` and `supabase-js-shim.js`. `server.mjs` implements only the subset of
GoTrue and PostgREST that the site uses, executes it as the `authenticated` or
`service_role` database role, and runs the real `flashcard-review` Edge Function
source under a small Deno shim. It is a QA tool, not a substitute for a final check
on a hosted staging project (production runs PostgreSQL 17; this was built on 16).

```sh
export PGHOST=/tmp PGPORT=54329 PGUSER=postgres          # a throwaway local cluster
export PPP_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome
export NODE_PATH=/path/to/a/node_modules/containing/playwright

node tools/flashcards/sql-tests.mjs                       # every supabase/tests/*.sql
node tools/flashcards/local-stack/run-browser-check.mjs   # check-browser.mjs
node tools/flashcards/local-stack/run-browser-check.mjs tools/flashcards/check-import-resume.mjs
node tools/flashcards/local-stack/run-browser-check.mjs tools/flashcards/check-anki-csv.mjs
node tools/flashcards/local-stack/run-browser-check.mjs tools/flashcards/check-card-editing.mjs
node tools/flashcards/local-stack/run-browser-check.mjs tools/flashcards/check-fsrs.mjs
node tools/flashcards/local-stack/run-browser-check.mjs tools/flashcards/check-catalogue.mjs
```

Each run recreates the `ppp_fc_browser` database (or a fresh `ppp_fc_*` database per
SQL file), creates `main`, `school` and `lookalike` accounts, and drops the database
afterwards. Set `PPP_FLASHCARD_QA_APKG` to choose the Anki package (default: the
modern Anki fixture).
