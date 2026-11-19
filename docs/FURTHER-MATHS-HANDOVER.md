# Further Mathematics handover (Edexcel 9FM0 / 8FM0)

Subject record: `EDX_ALEVEL_FMATH_9FM0` (one record holds both qualifications).
Last run: 2026-11-19.

## Status at a glance

| Area | State |
| --- | --- |
| Qualifications declared | A-Level 9FM0 and AS 8FM0 in `data/subjects.json` |
| Option routes | All 10 AS routes and all 10 A-Level option pairs, enforced as route cards |
| Specification | Rebuilt from the official specs: 262 points in 17 module sections |
| Module selection | Done: setup/edit dialog, subject page, papers and practice are route-scoped |
| AS/A-Level card labels | Fixed site-wide (all subjects), with unit and browser audits |
| Source inventory | Expected sources recorded; **unverified** (Pearson host blocked from the build host) |
| Imported question packs | **None.** No real 9FM0/8FM0 questions are imported yet |

The question bank is therefore **not complete**. The only Further Maths questions in the
repository are the 11 hand-written demo questions (`EDX_9FM0_DEMO_CP`), hidden from
discovery as before. The 70 A-Level paper cards are generated catalogue rows (no
questions), unchanged except for new identity metadata.

## Blocker: Pearson exam materials could not be reached

`qualifications.pearson.com` was refused by the build host's outbound proxy
(`CONNECT 403`, a policy denial; retried, not transient). The official specification
PDFs could be read as text through a separate fetch tool, which is how the spec map
was built, but no question paper, mark scheme or examiner report could be probed,
downloaded, rendered or checksummed. **Next agent: run from a host that can reach that
domain**, then follow the import steps below.

## Official structure (verified from the specifications)

- A-Level 9FM0, Issue 4 (June 2023), first assessment June 2019. Four 75-mark,
  90-minute papers: 9FM0/01 and 9FM0/02 Core Pure (mandatory) plus two optional papers.
  Option 1: 3A FP1, 3B FS1, 3C FM1, 3D D1. Option 2: 4A FP2, 4B FS2, 4C FM2, 4D D2.
  Permitted: any two Option 1 papers, or an Option 1 paper with its matching Option 2.
  Students may sit more; "the combination of papers that result in the best grade will
  be used" (total out of 300). `bestOptionPair()` implements this; the site does not
  currently compute an overall Further Maths grade.
- AS 8FM0, Issue 5 (July 2025), first assessment June 2018. Paper 1 8FM0/01 Core Pure
  (80 marks, 1 h 40) and Paper 2 (80 marks, 1 h 40) taken as exactly one route:

| Route | AS 8FM0 Paper 2 | A-Level 9FM0 pair | Modules |
| --- | --- | --- | --- |
| 1 | 2A | 3A + 4A | Further Pure 1 + Further Pure 2 |
| 2 | 2B | 3A + 3B | Further Pure 1 + Further Statistics 1 |
| 3 | 2C | 3A + 3C | Further Pure 1 + Further Mechanics 1 |
| 4 | 2D | 3A + 3D | Further Pure 1 + Decision 1 |
| 5 | 2E | 3B + 3C | Further Statistics 1 + Further Mechanics 1 |
| 6 | 2F | 3B + 3D | Further Statistics 1 + Decision 1 |
| 7 | 2G | 3B + 4B | Further Statistics 1 + Further Statistics 2 |
| 8 | 2H | 3C + 3D | Further Mechanics 1 + Decision 1 |
| 9 | 2J | 3C + 4C | Further Mechanics 1 + Further Mechanics 2 |
| 10 | 2K | 3D + 4D | Decision 1 + Decision 2 |

There is no route 2I. Codes are strings throughout (`2A`, `3A+4A`, `9FM0/3A`).

Pearson publishes AS Paper 2 as **per-module component files** (`8FM0_21`, `8FM0_22`, …
seen in public URLs), not one composite 2A–2K paper. A route is two components sat
together. The component-to-module mapping and per-component marks are not verified yet;
do not invent them, and do not present two components as two complete AS sittings.

## Specification identity (`data/specs/EDX_ALEVEL_FMATH_9FM0.json`)

Built by `python3 tools/fmaths/build_spec.py` from the transcribed official content.

- **Core Pure** (`EDX_FMATH_SEC_CP`, 54 points, ids `EDX_FMATH_CP_<code>`). AS Core Pure
  is an exact subset with identical codes and wording, so those 25 points are shared and
  list `qualifications: ['9FM0','8FM0']`; A-Level-only points list `['9FM0']`.
- **A-Level options** (`EDX_FMATH_SEC_<FP1|FS1|FM1|D1|FP2|FS2|FM2|D2>`, ids
  `EDX_FMATH_<module>_<code>`): 20, 15, 9, 18, 22, 20, 10, 20 points.
- **AS options** (`EDX_FMATH_SEC_AS_<module>`, ids `EDX_FMATH_AS_<module>_<code>`): 13,
  15, 6, 9, 4, 4, 12, 11 points. AS modules are narrower and numbered differently from
  the A-Level papers of the same name (e.g. AS FP1 topic 2 is Coordinate systems,
  A-Level FP1 topic 2 is Further calculus), so they are separate identities. No
  cross-mapping between AS and A-Level option points has been made.
- Core Pure is never merged with optional Further Pure 1/2.
- The earlier seeded tree was paraphrased and mis-numbered. Its 113 ids (103 points and
  10 renumbered topics) are kept as `legacy_ids`, mapped to the official points that
  cover their meaning, and expanded on load via `js/config/spec-id-migrations.js`
  (`python3 tools/write_spec_migrations.py`). Demo questions were retagged the same way.
- Point titles are the opening wording of each official point; long points are cut at
  a clause boundary. Spec PDF checksums are not recorded (host blocked).
- Textbook organisation: **unavailable**. No textbook contents were supplied; only the
  official specification navigation is offered.

## How module selection works

- Registry: `module_routes` on the subject (modules with their sections per
  qualification, official routes, rules). Papers carry `qualification_code`,
  `module_ids` and `official_paper_code`; questions should carry `qualification_code`
  and `module_id`.
- Engine: `js/engine/module-routes.js` (pure). `normaliseChoice` drops invalid routes;
  `scopeOf` gives visible modules/sections; `scopeSpec`, `scopeLeaves`, `paperInScope`,
  `questionInScope`; `bestOptionPair` for the best-grade rule.
- Saved as `preferences.moduleRoutes[subjectId] = {levels, routes, extra, showAll}`.
  Backwards compatible; nothing else in the progress document changes.
- UI: `js/ui/module-scope.js`. The add/edit subject dialog asks for qualification(s)
  then one route card per qualification ("Not decided yet" allowed), plus optional
  extra modules for practice that do not change the exam route. "I've covered
  everything" ticks only the chosen route's points (count updates live).
- `scopeBundle()` in `js/ui/student.js` applies the route to the topic tree, leaf
  counts, papers and the practice pool. Without a saved route only Core Pure is shown
  and a banner prompts for modules. "Show all options" is a deliberate, saved toggle.
- Changing route hides unselected modules; their ticks stay saved and reappear when the
  module is chosen again (tree and coverage dialog only add/remove visible points).

## AS/A-Level labels (site-wide)

`js/engine/paper-identity.js` reads each paper's own `level`/`qualification_code`/
`spec_code`. Used by paper cards (`papers.js`, with a Level filter), the paper header
(`paper.js`), the session header (`session.js`, which previously called AS sessions
"A-Level"), practice question cards and the paper selector. Audited and passing:
Maths, Biology, OCR Chemistry, Physics, OCR Computer Science, Geography, English
Literature, Psychology and Sociology (dual); History, Politics and GCSE banks unlabelled.

## Commands

```bash
python3 tools/fmaths/build_spec.py && python3 tools/write_spec_migrations.py
python3 tools/fmaths/inventory.py        # expected-source inventories
npm test && npm run validate
npm start                                # then, in another shell:
node tools/browser-further-maths.cjs
node tools/browser-paper-labels.cjs
```

## Source inventory and coverage

`data/imports/fmaths/inventory/9fm0-inventory.json` and `8fm0-inventory.json`.

| Qualification | Expected | Verified public | Imported | Notes |
| --- | --- | --- | --- | --- |
| A-Level 9FM0 exam papers | 70 (7 sittings × 10) | 0 | 0 | June 2019, Autumn 2020, Autumn 2021, June 2022–2025 |
| A-Level 9FM0 samples | 10 | 0 | 0 | One sample per paper expected |
| AS 8FM0 Paper 1 | 6 expected + 2 possible sittings | 0 | 0 | June 2018, 2019, 2022–2025; Autumn 2020/2021 unconfirmed |
| AS 8FM0 Paper 2 components | 48 expected + 16 possible | 0 | 0 | Components 21–28; mapping unverified |
| Examiner reports | — | 2 seen (8FM0/21, /22 June 2019, not probed) | 0 | |

Per module, imported questions: Core Pure 0, FP1 0, FS1 0, FM1 0, D1 0, FP2 0, FS2 0,
FM2 0, D2 0 (AS and A-Level alike). June 2026 materials: not checked.

AS paper cards are deliberately **not** generated until each sitting and component is
verified.

## Next actions (in order)

1. From a host that can reach `qualifications.pearson.com`, probe and download every
   9FM0/8FM0 question paper, mark scheme, examiner report and sample (adapt
   `tools/physics/discover.py`; the Maths pipeline in `tools/maths/` is the extraction
   reference but does not understand option papers). Record URL, size, SHA256, revision.
2. Verify the 8FM0 component → module mapping (21–28) and marks from the papers.
3. Build packs under `data/packs/fmaths/` with per-part crops (docs/PART-DISPLAY.md),
   `qualification_code`, `level`, `module_id`, official tags and model-review labels;
   then rerun `tools/parts/refine.py`, `drop-false-dependencies.py`, `lead-ins.py`,
   `trim-booklet-pages.py` and `python3 tools/assets/compact.py`; check site size.
4. Add AS paper records only for verified sittings; they are labelled automatically.
