# Biology A (Salters-Nuffield) 9BN0 / 8BN0 handover

Subject: `EDX_ALEVEL_BIOL_9BN0` (Pearson Edexcel A level Biology A, Salters-Nuffield,
with AS 8BN0 papers inside the same subject). Specification Issue 4, November 2018.
Reviewer type for every tag, grouping and difficulty: **model** (Claude subagents with
lead spot checks). Nothing here is teacher-verified.

## What is published

| Group | Booklets | Source questions | Scored units | Marks | Printed tariffs |
|---|---|---|---|---|---|
| A level exams 2017 to 2025 | 27 | 250 | 1,065 | 2,700 | 1,072 |
| AS exams 2016 to 2025 | 20 | 160 | 705 | 1,600 | 705 |
| A level official samples (Issue 1, Dec 2014) | 3 | 28 | 113 | 300 | 114 |
| AS official samples (Issue 1, Dec 2014) | 2 | 20 | 68 | 160 | 68 |
| **Total** | **52** | **458** | **1,951** | **4,760** | **1,959** |

- Every printed tariff is assigned to exactly one scored unit, and unit marks sum
  to each printed "(Total for Question N = M marks)" and each cover total.
- Every unit has the official mark scheme for its question (scheme scope labelled
  "full question"). Examiner reports are linked for every exam booklet except
  `EDX_8BN0_2022_JUNE_02` (not listed in Pearson's public catalogue).
- Difficulty: 665 easy, 1,054 medium, 232 hard, 0 extra hard (not used for official
  papers). Content years: A level Year 12 530, A level Year 13 648, AS (always
  Year 12) 773. 70 units are starred extended responses.
- Paper 3 pre-release scientific article: shown as unscored, collapsible context on
  the article question for 2017 to 2024 and the sample. The 2025 article is on a
  Pearson `/secure/` path, so those units show an explicit "not publicly available"
  note instead.
- The June 2018 Paper 1 official erratum (replacement graph for 1(a)) is shown as
  context on Question 1.

## Not imported, and why

- June 2026 papers (`EDX_9BN0_2026_JUNE_01..03`, `EDX_8BN0_2026_JUNE_01..02`), the 2025
  and 2026 scientific articles, and the specimen paper sets: served only from Pearson
  `/secure/` paths. Not accessed. Re-audit when Pearson makes them public.
- Modified-format ZIPs: accessibility versions of the same sittings, not distinct
  assessments (unlike the distinct 2025 Maths variant).
- Summer 2021 additional assessment materials, mock papers and training content:
  not exam sittings.
- Textbook navigation: no Biology textbook contents have been supplied. The app
  offers official-specification navigation only; textbook mode appears automatically
  once `textbooks: {contents, links}` is added to the subject in `data/subjects.json`.

## Rights

`data/imports/biology/rights.json`: the owner confirmed in this session (2026-11-15)
that the 2026-11-14 Pearson permission covers all Biology A material. Recorded as
owner confirmation, not an independent licence audit.

## Specification and IDs

- `data/specs/EDX_ALEVEL_BIOL_9BN0.json` is transcribed by `tools/biology/spec.py`
  from the public specification PDF (SHA256 recorded in the file):
  - 137 statements `EDX_BIOL_OFF_T{n}_{code}` (codes are strings: 2.10 is not 2.1);
  - 18 core practicals `EDX_BIOL_OFF_CP{n}`;
  - 28 Appendix 6 maths skills `EDX_BIOL_OFF_MS_A.x.y`.
- AS Topics 1 to 4 wording is identical to the A level (checked by the script), so
  AS questions use the same IDs.
- The 62 original seed points (`EDX_BIOL_T*`) live in a `legacy: true` section. The
  spec index registers them for lookups only (saved learning and demo records still
  resolve). They are never in the tree, ranges, coverage or tags, and are not
  converted to official coverage (owner decision).
- Year mapping `pearson-9bn0-8bn0-topic-years` in `data/curriculum/index.json`:
  Topics 1 to 4 = Year 12 and Topics 5 to 8 = Year 13, quoting the AS specification.
  Each unit's `introduced_year` is derived by the build from its reviewed tags.
  "Year 13 topics only" therefore means the unit needs Topic 5 to 8 content, never
  just "on an A level paper".

## App changes made for a second subject (shared with Maths and Physics)

- `js/data/content-repository.js`:
  - textbooks are declared per subject;
  - packs are loaded per subject (index entries may carry `subject_id`);
  - generated placeholder papers are hidden for any subject with reviewed sources.
- `js/data/source-images.js`: `assets/<slug>/...` resolves to the
  `data/<slug>-assets/` catalogue.
- `js/engine/spec-index.js`: legacy sections.
- `js/engine/textbook-index.js`: document-defined prefixes.
- `js/ui/views/practice.js`, `student.js`, `coverage-dialog.js` and
  `question-view.js`: subject metadata (`qualifications`, `content_year_source`,
  `textbook_example`) instead of 9MA0 hardcodes; article context renderer.

## Pipeline (reproduce from public sources)

Private workspace (not committed): `../biology-research/`. Everything in it is
rebuilt from public URLs and checksums.

```bash
python3 tools/biology/inventory.py fetch --out ../biology-research/catalogue/bioa-records.json
```
```bash
python3 tools/biology/inventory.py build --records ../biology-research/catalogue/bioa-records.json --cache ../biology-research/sources --repo .
```
```bash
python3 tools/biology/samples.py --supporting ../biology-research/supporting --sources ../biology-research/sources --repo .
```
```bash
python3 tools/biology/ocr.py ../biology-research/sources/EDX_9BN0_2019_JUNE_03__question_paper.pdf --output ../biology-research/ocr/EDX_9BN0_2019_JUNE_03
```
```bash
cd tools/biology && python3 extract.py ../../../biology-research/sources --output ../../../biology-research/extracted --ocr-dir ../../../biology-research/ocr && cd ../..
```
```bash
python3 tools/biology/review_packet.py --inventory data/imports/biology/inventory/9bn0-inventory.json --inventory data/imports/biology/inventory/8bn0-inventory.json --inventory data/imports/biology/inventory/samples-inventory.json --candidates ../biology-research/extracted --sources ../biology-research/sources --output ../biology-research/packets
```
```bash
python3 tools/biology/check_review.py ../biology-research/extracted/PID.json ../biology-research/reviews/PID.json
```
```bash
python3 tools/biology/build.py data/imports/biology/inventory/9bn0-inventory.json --sources ../biology-research/sources --candidates ../biology-research/extracted --reviews ../biology-research/reviews
```
Repeat the build for `8bn0-inventory.json` and `samples-inventory.json`, then:
```bash
python3 tools/biology/finalize.py --research ../biology-research
```
```bash
python3 tools/biology/package_assets.py
```
```bash
python3 tools/biology/geometry_qa.py --research ../biology-research
```

Notes:
- `supporting/` holds the two SAM collations, the AS SAM erratum and both
  specifications (URLs and SHA256 in `samples-inventory.json` and the spec file).
- Reviews are restored from `data/imports/biology/reviews/` (the public copies).
- Development tools: Python with pdfplumber, pypdfium2, Pillow and pypdf, plus
  tesseract (apt `tesseract-ocr`) for positioning only.
- The renderer is the unchanged `tools/maths/render.py` (subject-neutral), loaded by
  path. Long multi-page crops that would exceed WebP's 16,383 px limit render at a
  reduced, still lossless, scale.

## Extraction decisions worth knowing

- Crops are bounded by each page's printed content frame. That works for both page
  geometries (652x899 with trim marks; trimmed A4) and excludes the rotated
  "DO NOT WRITE" strips.
- A part's crop ends at its last printed content before the next part, not at its
  tariff. That keeps multiple-choice options, grids and answer tables; dotted answer
  lines and Total lines are dropped.
- Starred labels (`*7`, `*(c)`) mark extended responses. Labels split into two words
  are rejoined.
- `(i)` counts as the ninth letter only after `(h)` or before `(j)`. Out-of-sequence
  bracketed symbols such as `(n)` in a formula are ignored. 8BN0 June 2023 P1 Q7
  prints `(i)`, `(ii)` before `(b)` with no `(a)`; it is labelled (a)(i), (a)(ii) as
  in the scheme.
- 9BN0 June 2019 Paper 3 is an image-only scan:
  - tesseract positioning, with a thresholded second pass for the pale tariffs;
  - one checksum-bound override (`tools/biology/source_overrides.py`) supplies the
    Q5(b)(i) label and tariff positions;
  - all of its units carry `positioning: ocr_assisted_image_only_source`.
- SAM collations contain invisible off-canvas copies of facing pages, and the SAM
  mark schemes are printed sideways. Only on-canvas frames are used, and the scheme
  page extractions get a display rotation (no content change).

## Review quality and open queue

- 26 question-level review exceptions are recorded in
  `data/imports/biology/reviews/*.json`. They are mostly best-fit tags where no
  statement fits exactly (for example eDNA surveying, HPV strains), the AS SAM
  erratum, and label corrections.
- 214 units have only maths-skill primary tags (the marks are purely for the
  calculation). About 70 of them have no biology crossover tag, so they appear under
  Mathematical skills rather than a biology topic. A future pass could add biology
  context crossovers where a student genuinely needs that biology.
- Some `tag_basis`/`difficulty_basis` lines are short. The two weakest papers (9BN0
  June 2023 P2 and June 2022 P3) were rewritten by a dedicated pass.
- Guest check in the browser test is shallow: it confirms a guest has no saved
  coverage, not every guest interaction.

## Validation

- `npm test`: 80 passing, including `tests/biology-bank.test.mjs` (7 tests: counts
  from `coverage.json`, reconciliation, restricted exclusions, official-only tags,
  AS Year 12 scope, derived years, legacy lookup, identities, tariff assignment,
  article context, and asset RIFF/WEBP plus SHA256 for every catalogue).
- `npm run validate`: 0 errors.
- `python3 tools/biology/geometry_qa.py`: 1,951 units and 2,944 images, 0 failures
  (tariffs inside crops, label starts, ink present, MediaBox geometry).
- Browser (local server, isolated profiles): `tools/browser-biology-bank.cjs` PASS.
  Maths, Physics, textbooks, topic choice, coverage dialog, regression and parts
  suites also pass.
- Production: see the latest commit's deploy check in the final report. The
  purepastpapers.com HTTPS hostname issue from the Maths handover is unchanged and
  not verified fixed.

## Next actions

1. When the owner supplies Biology A textbook contents and edition evidence: add a
   textbook document and links file (see `tools/maths/textbook_contents.py` for the
   shape; use `section_prefix: "TB_BIOL"`, `book_prefix: "TB_BIOL_BOOK"`), and
   declare them under `textbooks` in `data/subjects.json`.
2. Re-audit the `/secure/` items (June 2026 papers, the 2025/2026 articles and the
   specimen sets) when they become public, using the same pipeline. New booklets get
   new IDs; never reuse a published ID.
3. Optional quality pass: biology crossover tags on the about 70 maths-only units.
