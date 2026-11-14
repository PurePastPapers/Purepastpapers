# PPP — PurePastPapers.com

Phase 1 of the four-phase PRD (v2.1): official past papers, topic and crossover filtering,
difficulty selection, customisable practice, user accounts and the Data Hub. Phases 2–4 are
wired in behind feature flags and show as "Coming soon".

Plain HTML5, CSS3 and vanilla JavaScript modules. No build step and no dependencies.
PPP stands for PurePastPapers.com. Shared branding lives in `js/config/app.config.js`.

**Start here for future agents:** [Curriculum and question tagging](docs/curriculum-and-question-tagging.md), with links to the Phase 1 and import plans.

See the [latest browser audit](docs/browser-audit-2026-11-14.md) for verified behavior, regression commands and remaining gaps.

## Run it

ES modules do not load from `file://`, so serve the folder:

```bash
npm start
```

Then open http://localhost:5173. Any static host works for deployment (GitHub Pages, Netlify, Vercel).

Browse questions without an account; sample questions are labelled demo content. Create a free account to retain progress in this browser.

| Command | What it does |
| --- | --- |
| `npm start` | Local static server (`tools/serve.mjs`) |
| `npm test` | Engine tests: learned-topics gate, crossover, test builder, analytics, shipped data |
| `npm run validate` | Checks everything in `/data` against the schemas (exit code 1 on errors) |
| `npm run seed` | Rebuilds `/data` from `tools/seed` (keeps files you have edited by hand; `-- --force` overwrites) |

## What Phase 1 includes

| PRD | Feature | Where |
| --- | --- | --- |
| 2 | 38 subjects mapped to board and specification, with spec trees (1,113 spec points) | `data/subjects.json`, `data/specs/` |
| 3 | Four UI sections kept apart, one shared question pool with `source_type` tags | `js/config/phases.js`, `js/data/content-repository.js` |
| 4.1 | Topic and crossover filtering: a question is offered only if every primary and crossover spec point is learned | `js/engine/filter-engine.js` |
| 4.2 | Difficulty: Easy, Medium, Hard, Extra hard, Mixed | `js/config/app.config.js`, `js/engine/test-builder.js` |
| 4.3 | Timed tests and individual questions (STEM); untimed question picker with set texts, marks and optional stopwatch (humanities) | `js/ui/views/practice.js`, `js/ui/views/session.js` |
| 4.4 | Accounts and the Data Hub: question tracking, RAG topic mastery, paper and test history with grade trends | `js/data/api.js`, `js/ui/views/hub.js` |
| 8 | Question, paper and user_progress schemas | `js/data/schema.js`, `js/data/api.js` |

Marking in Phase 1 is self-marking against the mark scheme. Typed answers are stored with
each session, ready for AI marking in Phase 4.

## Content: what ships, and what you need to add

- **Official paper catalogue (886 papers).** Every exam series for each subject, generated
  from the specification's paper structure, with a link to the exam board's past-paper
  page. PDFs are not hosted: papers are the boards' copyright. A student opens the paper
  on the board's site, sits it here against the clock and logs the mark.
- **Demo questions (249, in 40 demo papers).** Written for this build so the filtering
  engine, tests and Data Hub can be tried. They are flagged `"is_sample": true`, always
  labelled "Demo content" in the UI, and are not from any exam paper. Set
  `CONTENT.showSampleContent = false` in `js/config/app.config.js` to hide them all.
- **Real question extracts: not included.** Add them as content packs (below).

### Adding real papers and questions

A content pack is a JSON file using the PRD schemas:

```json
{
  "pack_id": "9ph0-2024",
  "papers": [{ "paper_id": "EDX_9PH0_2024_JUNE_P1", "subject_id": "EDX_ALEVEL_PHYS_9PH0", "full_paper_pdf_url": "assets/pdfs/9PH0_2024_P1.pdf" }],
  "questions": [{ "question_id": "EDX_9PH0_2024_JUNE_P1_Q07", "subject_id": "EDX_ALEVEL_PHYS_9PH0", "paper_id": "EDX_9PH0_2024_JUNE_P1", "source_type": "real_past_paper", "...": "..." }]
}
```

1. Save it in `data/packs/` and list it in `data/packs/index.json`: `{ "packs": [{ "file": "9ph0-2024.json" }] }`.
2. Records merge by id. A paper entry with an existing `paper_id` only needs the fields it
   changes (for example the PDF paths), and a question that names a `paper_id` is added
   to that paper automatically.
3. Run `npm run validate`.

**Content Studio** (Account → Open the Content Studio) has a form for adding questions, a
database check, and import/export of a pack kept in the browser for trying things out.

Spec point ids follow the PRD: `EDX_PHYS_M2_2.2` (point), `EDX_MATH_PURE_TRIG` (topic).
A topic id used as a tag means "the whole topic": it is satisfied only when every spec
point in that topic is learned.

## Specification filters and question parts

Practice supports exact specification points and inclusive ranges (for example 2.1–2.5),
any/every point matching, primary/crossover scope, exam year, series, tier, paper,
difficulty, marks, attempt status, text/spec-code search, demo visibility and sorting.
Results are paginated in groups of 30. Topic selection and learned-topic filtering are
separate; timed tests still respect the learned-topic gate.

Specification codes are strings, not decimal numbers. Ranges and specification sorting
use stored tree order, or an optional `point_order` containing every leaf ID exactly once.
Use `point_order` for a verified syllabus sequence when the display tree is grouped by
paper. Existing trees are provisional until checked against their official specification.

An imported part can have its own `question_id`, `parent_question_id`, `part_label`,
marks and spec tags. Optional `context.shared_stem_html` supplies required information;
`context.full_question_html` / `full_question_image_url` provide collapsed context.
Only the selected part is assessed. Dependency references are validated, and a dependent
part must include its required earlier information in the visible shared stem.
Existing combined demo questions remain unchanged; they have not been automatically split.

See [Question imports and specification filtering](docs/question-import-and-filtering-plan.md)
for the bulk-import proposal, model, evidence limits and rollout acceptance checks.

## Preparing for later phases

Everything is gated by `FEATURES` in `js/config/phases.js`. To switch a phase on, add its
content as a pack and set `enabled: true`.

| Phase | Flag | What already exists | What is left to do |
| --- | --- | --- | --- |
| 2: AI questions and AI past papers | `aiPastPapers`, `aiQuestionPool` | `/ai-papers` route and list view, source selector (Official / AI / Both), pool merging, Data Hub filters | Generate and review the content (`source_type`: `ai_past_paper`, `ai_spec_question`) |
| 3: AI predicted papers | `predictedPapers` | `/predicted` route and list view, paper detail, history type | Build the predicted papers (`paper_type`: `predicted_paper`) |
| 4: AI marking | `aiMarking` | Marking provider interface, stored typed answers, placeholder provider | Implement `aiMarkProvider.mark()` in `js/engine/marking.js` |

Enabling Phase 2 with a test pack was checked during the build: the section appears in the
navigation, stays separate from official papers, and its questions join the practice pool.

## Accounts and storage

`js/data/api.js` is the only module the UI uses for user data. It talks to an adapter:

- `js/data/adapters/local-adapter.js` (default) keeps accounts and progress in the browser's
  localStorage. Passwords are stored as salted PBKDF2 hashes. Accounts exist only in that
  browser on that device and do not sync; Account → Export/Import moves data between devices.
- To sync across devices, write an adapter with the same methods (Supabase, Firebase or
  your own API) and change the one `adapter` line in `api.js`. No UI code changes.

Content is read through `js/data/content-repository.js`, the equivalent seam for moving the
question database server-side.

## Project map

```
index.html
css/        base.css (tokens, light/dark) · paper.css (index-card frame and parts) · pages.css (page layouts) · components.css · views.css
fonts/      Young Serif, Nunito, Caveat (SIL Open Font Licence 1.1)
designs/    to-be-used/: approved designs with AI features, not built yet (see its README)
js/
  main.js   router and start-up
  config/   app.config.js (names, difficulty, RAG, grade bands) · phases.js (roadmap, flags, nav)
  core/     dom.js (templating, sanitiser) · utils.js · bus.js · sha256.js
  data/     api.js · content-repository.js · sessions.js · schema.js · demo.js · adapters/
  engine/   spec-index.js · filter-engine.js · test-builder.js · analytics.js · marking.js   (pure, tested)
  ui/       shell.js · ui.js · spec-tree.js · question-view.js · charts.js · student.js · views/
data/       subjects.json · specs/ · papers/ · questions/ · packs/
tools/      serve.mjs · validate-data.mjs · seed/ (sources for /data)
tests/      engine.test.mjs
assets/     pdfs/ · papers/ · ms/   (your files)
```

## Design

The look follows the designs the owner approved in November 2026: tilted, ruled index cards
held on with plain masking tape, on a squared-paper background. Headings are Young Serif,
body text Nunito and the handwritten notes Caveat (all three self-hosted in `fonts/`).

- **Light or dark mode** is set in Account and in the menu. Dark mode uses warm browns with
  cream text and mutes the subject colours; there is no neon.
- **Subject colours** come from a fixed set of swatches (`js/ui/subject-colours.js`), saved
  in the student's preferences. Pages about one subject tint the background with its colour.
- **Target grades.** Each subject can have a target grade. Papers are rated against it:
  above target is *Exceeding target*, at target *Secure*, one grade below *Developing* and
  two or more below *Needs work* (`targetBand` in `js/engine/analytics.js`).
- **Designs with AI features** are in `designs/to-be-used/`. They are not final: if the owner
  or someone working with them asks for something different, follow that instead.

## Decisions

Reviewed by the project owner in November 2026.

- **Grades are indicative for now.** `GRADE_SCHEMES` in `app.config.js` uses fixed percentage
  bands. A paper record can carry real boundaries in `grade_boundaries`. Whenever past papers
  are sourced (by an AI agent or by hand), also find that paper's official grade boundaries
  and add them to `grade_boundaries`.
- **Catalogue details come from each specification's paper structure** (marks, durations,
  series). Keep this approach, and check durations and marks against the board as each real
  paper is added. The catalogue runs to June 2025 (and November 2024); raise `LAST_SUMMER` /
  `LAST_NOVEMBER` in `tools/seed/subjects.mjs` as papers are released.
- **Level 3 subjects** have no generated catalogue yet, and the two new OCR Advanced Nationals
  (IT, Applied Science) have placeholder topic trees and no questions. Add their real papers,
  topic trees and questions at the same time as the real GCSE papers.
- **Demo content is temporary.** Remove the demo papers and questions (`"is_sample": true`)
  when real papers and questions are added.
- **Real and AI content are tagged.** From Phase 2 onwards every question and paper must
  carry a tag showing whether it is real or AI-written (`source_type` / `paper_type`:
  `real_past_paper` vs `ai_past_paper`, `ai_spec_question`, `predicted_paper`), and the UI
  should show that tag.
- **Extra hard questions arrive with the AI questions in Phase 2.** They are AI-written stretch
  questions in the MadAsMaths style, tagged `"difficulty": "extra_hard"`.

## Notes for AI agents working on this repo

- The PRD is the source of truth for scope. Build one phase at a time; a later phase starts
  only when the previous one is running.
- Keep engine modules pure (no DOM, no storage) and covered by `npm test`.
- UI code reads data only through `js/data/api.js` and `js/data/content-repository.js`.
- Views build markup with the `html` tagged template in `core/dom.js`, which escapes every
  interpolated value. Question and mark-scheme HTML always goes through `sanitizeHtml`.
- Never label demo or AI content as an official past paper.
