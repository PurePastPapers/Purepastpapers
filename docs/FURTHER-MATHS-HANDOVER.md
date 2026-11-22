# Further Mathematics handover (Edexcel 9FM0 / 8FM0)

Subject record: `EDX_ALEVEL_FMATH_9FM0` (one record holds both qualifications).
Last source verification 22 November 2026.

## Source coverage

The direct Pearson downloads match the hashes and byte lengths in the verified
inventories under `data/imports/fmaths/inventory/`. The recorded URL is both the
original and acquired URL for each exam document. This includes all 133 exam
question papers, 133 matching mark schemes and 132 examiner reports. The only
missing report is June 2019 AS Core Pure (`EDX_8FM0_2019_JUNE_01`). The unused
June 2019 Further Mechanics 1 original (`P61181A`) is recorded in the inventory
alongside the scored replacement (`P62674A`). June 2026 materials remain restricted.

A-level has ten papers per series across June 2019, October 2020, November 2021 and
June 2022–2025. AS has Paper 1 and eight Paper 2 components per series across June
2018, June 2019, October 2020 and June 2022–2025. Pearson has no 8FM0 November 2021
sitting in the public inventory.

The official sample ZIP has ten A-level papers and eleven printed AS papers. The
AS routes reuse the same eight option sections. The sample inventory records the
printed routes and isolates nine unique AS practice components, including Core Pure.
The sample component mapping retains historical printed codes and original PDF page
ranges, including answer booklets and the corrections from Pearson's erratum.

The current activation status and imported counts are recorded in
`data/imports/fmaths/coverage.json`. Individual paper records distinguish source
questions, scored parts and practice units. The original hand-written demo remains
hidden from the official practice pool.

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

Pearson publishes exam AS Paper 2 as per-module component files. The covers give
40 marks per component. One route combines two components for 80 marks in 100
minutes. The suggested practice time for an individual component is 50 minutes.

| Component | Module | Printed routes |
| --- | --- | --- |
| 8FM0/21 | FP1 | A, B, C, D |
| 8FM0/22 | FP2 | A |
| 8FM0/23 | FS1 | B, E, F, G |
| 8FM0/24 | FS2 | G |
| 8FM0/25 | FM1 | C, E, H, J |
| 8FM0/26 | FM2 | J |
| 8FM0/27 | D1 | D, F, H, K |
| 8FM0/28 | D2 | K |

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
  a clause boundary. The handover does not include specification PDF checksums.
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

## Import and verification

Fetch each public question paper and mark scheme to `sources/<paper_id>/` as
`question_paper.pdf` and `mark_scheme.pdf`. Use `prepare_samples.py` to derive
sample source components from the verified Pearson ZIP. Use the applicable
`core_import.py`, `as_import.py` or `options.py` adapter with the shared Maths
extractor to produce review candidates. Keep the byte-verified PDFs available by
SHA-256 filename for the part-display passes.

Record a model review against every printed tariff. A single tariff can cover
multiple nested prompts. An answer dependency connects separate scored parts via
`depends_on_parts`, preserving each part's marks, crop and answer box. Compare the
extraction and every ambiguous crop with the original PDF before activating it.
The full question and full scheme remain available as fallbacks.

```bash
python3 tools/fmaths/catalogue.py
python3 tools/fmaths/build.py --sources sources --candidates candidates --reviews reviews PAPER_ID
python3 tools/parts/refine.py --subject fmaths --sources sources-by-sha --paper PAPER_ID
python3 tools/fmaths/fix_scored_regions.py --sources sources-by-sha --plan data/imports/fmaths/reviews/scored-regions.json --paper PAPER_ID
python3 tools/fmaths/restore_lead_ins.py --sources sources-by-sha --plan data/imports/fmaths/reviews/official-lead-ins.json --paper PAPER_ID
python3 tools/parts/drop-false-dependencies.py
python3 tools/parts/lead-ins.py fmaths --paper PAPER_ID
python3 tools/parts/trim-booklet-pages.py --slug fmaths --dry-run
JOBS=2 python3 tools/assets/compact.py --slug fmaths --paper PAPER_ID
python3 tools/parts/audit-part-display.py --slug fmaths --paper PAPER_ID
python3 tools/fmaths/finalize.py --candidates candidates --activate PAPER_ID
npm test && npm run validate
MEASURE_SITE_SIZE=1 node --test tests/site-size.test.mjs
```

Review dependency, lead-in, scheme tail and overlap flags using the steps in
`PART-DISPLAY.md` and `QUESTION-BANK-PITFALLS.md`. Finalization validates checksums,
marks and published IDs, then refreshes the scoped pack index and coverage. Existing
catalogues retain their reviewed crops. Pass `--rebuild` only for an intentional
rebuild. Run the Further Maths and paper-label browser scripts against the local
server and check the actual Pages artifact and live site after deployment.

For Core Pure exam rebuilds, apply the paper-specific `fix_core_crops.py` pass.
For sample rebuilds, run `fix_sample_schemes.py`, then apply the reviewed source
lead-ins. The Pearson 9FM0 sample Further Mechanics 2 scheme gives Q7(b)/(c) 3/4
while the paper gives 2/5. The June 2023 9FM0/02 Q7(b) scheme prints a subtotal of
1 beside two one-mark rows. Both records preserve the question-paper tariff and
carry a visible source note.
