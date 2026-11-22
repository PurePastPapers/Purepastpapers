# PurePastPapers Flashcards beta

Open **Flashcards** between **Practice** and **Data Hub** after signing in. The example card under **My decks** is a demonstration. To study your own cards, create a deck, add a card or preview an import, then choose **Study**. On a phone, Flashcards is in the account menu. **Manage** shows a card’s saved stage and next due time after its first review.

The pilot gives confirmed `reachfree.co.uk` accounts access to published PurePastPapers decks. These releases keep the original topics, tags and suspension state. A school student can open an official deck in **Manage**, choose a topic, then use **Unsuspend topic** when they have learned it. Optional and archived cards stay suspended during bulk activation and can be activated individually.

## Import compatibility

| Source | Supported | Behaviour to expect |
| --- | --- | --- |
| Anki `.apkg` | Legacy SQLite, newer SQLite and current Zstandard packages, including the normal Basic, reverse and cloze variants. Notes, card identities, hierarchy, tags, explicit suspension, common images and audio are supported. | Scheduling always starts fresh. Preview identifies missing or unsupported media and skips unsupported custom templates and Image Occlusion. Fonts, scripts and remote assets are stripped. |
| Quizlet export | Tab between term and definition, one card per line. Paste your own exported text into the import form. | Review the rendered preview and any invalid rows before importing. |
| UTF-8 CSV | Comma, semicolon or tab delimiter, quoted fields and embedded line breaks, escaped quotes and optional headers. Select Front, Back and optionally Tags and Deck by column number. | Preview and row errors appear before commit. A deck column can use `Parent::Child` for hierarchy. |

Imports are private. A repeated Anki source card is skipped, with its existing notes and review state retained. Text import matches by content and deck path. A batch becomes visible when finalised. Re-select the same file after a connection interruption to resume, or use **Cancel an unfinished import** to remove its staged rows. The review retry keeps its original request ID, including after a refresh in the same browser tab.

The beta renders a limited HTML vocabulary and safe local diagrams or audio. It can display formatted scientific notation using supported markup such as subscript and superscript. The site has no dedicated TeX engine. Anki package expansion and per-file limits are enforced by the importer. Affected cards get a visible media placeholder when an attachment cannot be rendered.

References for the [Anki export formats](https://docs.ankiweb.net/manual/exporting), [Quizlet export flow](https://help.quizlet.com/hc/en-us/articles/360034345672-Exporting-your-sets) and [ts-fsrs](https://open-spaced-repetition.github.io/ts-fsrs/guide/quick-start).

## Release and verification

1. Apply the four `20261122*_flashcard*.sql` migrations in order to the existing Supabase project. Keep the existing account and progress migrations in place. If applying through the management API, record its migration history since it assigns timestamps at application time.
2. Deploy the authenticated `flashcard-review` Edge Function, keeping JWT verification on. Its source imports the same scheduler module used in tests. If deploying via an API file bundle, include `index.ts`, `scheduler.js` and the intact `vendor/ts-fsrs-5.2.3.mjs`, and use the relative import `./scheduler.js` in that bundle. No browser or GitHub secret is used.
3. Run `npm test`, `npm run validate` and the regression SQL files under `supabase/tests/` against a disposable Supabase database. Exercise signed-in desktop and phone-view Chromium using `tools/flashcards/check-browser.mjs`, a local Playwright install and separate disposable test accounts. Point `PPP_FLASHCARD_QA_ACCOUNTS` at a private JSON array with `role`, `email` and `password`; use roles `main`, `school` and `lookalike`. Set `PPP_FLASHCARD_QA_APKG` to the current Anki fixture. Delete disposable accounts and their content after checking the flow.
4. Merge the verified branch into `main` and confirm that the deployed static site serves the new route. Repeat the signed-out deep-link smoke check and the signed-in study check. The UI and import bundles load on demand.

The scheduler release is **ts-fsrs 5.2.3** (MIT). The algorithm version is **FSRS 6.0**. This release uses the library’s preset weights and steps, with fuzz disabled. Its test suite covers all four ratings, the New/Learning/Review/Relearning transitions, both retention bounds and UTC due boundaries. The beta uses one UTC study day per account. Deck retention changes apply to future ratings, and moving or editing a card leaves its schedule in place.

The database stores user scope, note and card identities, scheduling state and append-only review events outside the shared progress snapshot. Reviews use server time and an atomic, revision-checked write. Auth account deletion cascades to private decks, media and history. Published catalogue material resides behind entitlement checks and is separate from each student’s review state.

## Adding a catalogue release

Supply an approved Anki `.apkg` and a JSON manifest for each deck. Keep official material, media and generated staging files out of the repository. Give the curator the exam board and specification code, AS/A-level/GCSE qualification, deck type, expected card count, version, and any topic-to-spec mapping or attribution needed for the release.

```json
{
  "catalogue_id": "EDX_ALEVEL_BIOL_9BN0_ATOMIC",
  "subject_id": "EDX_ALEVEL_BIOL_9BN0",
  "qualification": "A-level 9BN0",
  "deck_type": "atomic",
  "version": "2026-11-06",
  "expected_cards": 3238,
  "sha256": "<approved package SHA-256>"
}
```

Use `node tools/flashcards/stage-catalogue.mjs manifest.json deck.apkg /private/staging/deck`. Review the output’s card, media and subdeck counts. Keep source card IDs for unchanged learning items. Assign a new identity to a substantially changed card, and omit removed cards from the next version. Run the numbered staging SQL privately with the database administration role, then run `publish.sql`. Publication validates the metadata and exact count before switching the current version. A student’s existing scheduled card keeps its own state when the same source identity is present in a new version. Removed cards leave the queue and their review history is retained.

The GCSE Triple Science links point to the authors’ original AnkiWeb downloads. Students can import a downloaded copy to **My decks**. The shared listings are for Edexcel Biology, Chemistry and Physics GCSE Paper 1 and Paper 2. [Biology](https://ankiweb.net/shared/info/377190157) · [Chemistry](https://ankiweb.net/shared/info/526813556) · [Physics](https://ankiweb.net/shared/info/642243480)

## Draft correction cards for future marking

A trusted marking service can propose a draft using this minimal contract.

| Field | Meaning |
| --- | --- |
| `attemptId`, `questionId`, `partId` | Identify the student’s saved attempt and exact marked part. Derive the owning user from authentication. |
| `subjectId`, `qualification`, `schemeVersion` | Identify the specification and version of the criteria used. |
| `criterionId`, `evidenceRef`, `confidence` | Identify one missed criterion, private marking evidence and whether review is required. |
| `front`, `back`, `tags` | Proposed editable text for a short retrieval card. |

Deduplicate on user, attempt and missed criterion. Confirm that scoring considered acceptable alternatives before producing a draft. For a 2/3 Biology response, the draft can ask for the missing criterion. For Physics, use a unit, method or misconception. For Maths, use a missing justification, an invalid step or the technique the question assessed. If the evidence or marking is uncertain, wait for a reviewed result. A student can edit, save or dismiss each draft before it enters FSRS. Store attempt evidence privately and perform future marking calls with server-side credentials.
