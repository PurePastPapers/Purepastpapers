# Pearson GCSE (9-1) History 1HI0 question bank: handover

Notes for the GCSE History import (`EDX_GCSE_HIST_1HI0`), three options only. The pipeline is the A-level
History one (`docs/HISTORY-HANDOVER.md`, `tools/history/`) adapted in `tools/gcsehistory/`, with the
unit-per-printed-part handling of the GCSE Computer Science bank (`docs/GCSE-COMPUTER-SCIENCE-HANDOVER.md`).
`tools/history/` was not edited.

## Scope (owner, 21 November 2026) and decisions

Checked against Pearson's specification (Issue 6, June 2024, Appendix 1 codes, pages 61 to 63), not against the
earlier unverified tree in the repo:

1. **Paper 1 option 10**: Crime and punishment in Britain, c1000-present, with Whitechapel, c1870-c1900
   (paper code 1HI0/10). One PDF holds both: Section A is Whitechapel, Section B is the thematic study.
2. **Paper 2 booklet B1**: Anglo-Saxon and Norman England, c1060-88 (1HI0/B1). Paper 2 is two booklets, P (period
   study P1 to P5) and B (British depth study B1 to B4), and Pearson publishes one PDF per booklet, so B1 is its
   own file and **no period-study question is in any imported file**. Nothing needed excluding inside a file.
   Booklets P1 to P5 and B2 to B4 are excluded by scope and not downloaded.
3. **Paper 3 option 31**: Weimar and Nazi Germany, 1918-39 (1HI0/31).

**Vikings and a local-history site study (Verulamium) are not Edexcel 1HI0 options.** The specification lists
Paper 1 options 10 to 13, Paper 2 B1 to B4 with P1 to P5, and Paper 3 options 30 to 33. This is a scoping decision,
not a gap; no content was written for them.

## Status

**Live (models, not teachers).** 14 public booklets, 84 scored units (parts with their own tariff), tags and
difficulty model-reviewed (`reviewer_type: model`). Every booklet reconciles to its option maximum, counting one
part per choice group. Nothing is excluded for copyright (no public booklet in scope had removed material).

| Option | Booklets | Units | Marks (one part per choice group) | Marks if every unit counted |
| --- | --- | --- | --- | --- |
| 10 (Paper 1, with Whitechapel) | 5 | 36 | 260 (5 x 52) | 360 |
| B1 (Paper 2 booklet B) | 4 | 17 | 128 (4 x 32) | 192 |
| 31 (Paper 3) | 5 | 31 | 260 (5 x 52) | 272 |
| Total | 14 | 84 | 648 | 824 |

Units per series: June 2018 13 (10, 31), June 2019 17, June 2023 17, June 2024 17, June 2025 20. Difficulty: 21 easy,
40 medium, 23 hard. `data/imports/gcsehistory/coverage.json` holds the full counts.

### Not publicly available (never filled in)

Listed with probe evidence in `data/imports/gcsehistory/inventory/1hi0-inventory.json` (`not_public`):

- **June 2018 booklet B1**: no question paper, scheme or report found. Pearson's 2018 Paper 1 and Paper 3 files exist;
  B1 was probed for every date from 1 April to 31 December in both folder cases and both name styles.
- **June 2022, all three booklets**: nothing found, even after a 1 April to 31 December probe. Reason unknown.
- **June 2020 and 2021**: GCSE exams were not held; nothing exists. (The records say "June" only because ids need a
  series.)
- **June 2026**: not public yet at 21 November 2026.

## Specification

`tools/gcsehistory/build_spec.py` builds `data/specs/EDX_GCSE_HIST_1HI0.json` from Pearson's specification,
Issue 6 (June 2024). The file is `https://qualifications.pearson.com/content/dam/pdf/GCSE/History/2016/specification-and-sample-assessments/gcse-9-1-history-specification.pdf`,
SHA256 `a5d760fd3856bf16cc724ca33794d7b57b0e1c5d41c9d792a3001629c0fe9c09`; the builder refuses any other file.

- 95 leaves, each one official content bullet, wording verbatim (machine-read from a three-column table; wrapped
  headings are stripped), with its printed page: option 10 has 33 (four periods of 5, 6, 6 and 6, then Whitechapel
  10: five strand-1 content bullets and five strand-2 source-skills bullets), B1 has 27 (9, 8, 10), option 31 has 35
  (10, 7, 10, 8). Pearson numbers strands but not bullets, so a code is `option.topic.strand.bullet`
  (`10.2.3.1`, `B1.1.4.2`, `31.3.2.1`).
- The earlier tree had one id per period or key topic. Those 12 ids (`EDX_GCSE_HIST_CRIME_10.1` to `10.5`,
  `NORMAN_B1.1` to `B1.3`, `GERMANY_31.1` to `31.4`) migrate to all their bullets through `legacy_ids` and
  `js/config/spec-id-migrations.js`. 22 ids of options outside the scope (Medicine, Cold War, Elizabeth, Russia,
  USA, American West) were dropped and are listed in `scope.dropped_legacy_ids`; they had no real questions.
- Demo questions: `EDX_1HI0_DEMO_P123_Q01` to `Q05` (Medicine, Cold War, Elizabeth) were removed; `Q06` (retagged to
  `GERMANY_31.2.4.1`, crossover `31.2.3.2`) and `Q07` (`GERMANY_31.4.2.1`) were kept and the demo paper now totals 16.
  The catalogue stub papers (`EDX_1HI0_2025_JUNE_P1` and so on, with empty `question_ids`) were left as they are.
- `npm run seed` would regenerate the old seed tree only if the generated files were unmodified; they are not.

## Sources

`tools/gcsehistory/discover.py` probes Pearson's script-driven exam-materials listing by file name (HEAD only,
nothing under `/secure/`). Findings that differ from A level:

- One PDF per booklet code, named `1HI0_10_que_YYYYMMDD.pdf` (2018 to 2019, folder `exam-materials`) and
  `1hi0-10-que-YYYYMMDD.pdf` (2023 on, folder `Exam-materials`, but some reports sit in the lower-case folder). The
  folder name's **case matters** (the other case returns a 302), so both are probed.
- Paper 2 files are `B1` (and `P1`..`P5`); the question paper holds one booklet.
- Question papers carry the Sources or Sources/Interpretations booklet after the answer pages (options 10, 31).
- Mark schemes and reports are dated results day (22 August 2018 and 2019, 24 August 2023, 22 August 2024, 21 August 2025).

`tools/gcsehistory/inventory.py` fetches each public PDF into the private cache and records SHA256, size, the
server's `Last-Modified` and the printed duration. Specimen papers are not used.

## Extraction

`extract.py` makes one scored unit per printed part with its own tariff. The tariff is at the **top** of the part
(after the question text), not after the answer lines as in A level, and an undivided question has only
`(Total for Question n = m marks)`.

- Units: `1`, `2(a)`, `2(b)`, `3`, `4`, `5`, `6` (option 10); `1`, `2`, `3(a)` to `3(d)` (option 31, 2025 has
  `2(a)`/`2(b)`); `1(a)`, `1(b)`, `1(c)(i)`, `1(c)(ii)` (B1, to 2024) and `1(a)`, `1(b)`, `2`, `3`, `4` (B1 2025).
  Pearson changed Paper 1 and booklet B in 2025 (two 2-mark describe parts, B1 Q2 to Q4).
- Questions 5, 6 and 3(d) have 16 marks plus 4 SPaG marks. The unit is 20 marks (SPaG included, shown in
  `provenance.spag_marks`); the SPaG rubric printed above the question is inside its crop.
- A crop runs from the part's first line (including a "Study Source A below" source printed in the paper for
  Paper 3 Q1) to its last printed line. Answer lines, boxes' dots, tariff totals and page furniture are excluded; an
  answer table's open box is extended 85 pt below its last prompt (2(b), Paper 3 Q1).
- **Sources and interpretations** are unscored context: each item of the booklet (`Source A`, `Interpretation 2`) the
  part's wording names is rendered once per paper (`CTX_Source_A.webp`, pictures included) and attached as
  `context.figures` (label, `source: "insert"`). The site shows them before the part, labelled unscored.
- Reconciliation: each printed `Total for Question n` must equal that question's units (one per choice group) and each
  booklet its maximum (52, 32, 52). Choice groups (EITHER/OR): 5/6; 1(c)(i)/(ii) or 3/4 in B1; 2(a)/(b) in Paper 3 2025.
- Page geometry: pages are CropBox-relative (the 2018 Paper 3 PDF has a 28 pt inset). The margins carry the printed
  "DO NOT WRITE IN THIS AREA" watermark; words outside x 45 to width-75 are ignored and crops start at x 66.

## Mark schemes

`schemes.py`: each part has one table opened by a "Question" header row with its label. Everything to the next header
is its scheme (target, levels of response or marking instructions, indicative content, and the "Marks for SPaG" table
for 5/6 and 3(d)). Labels print as `2 (a)`, `1 (c) (i)`, and, in the 2025 Paper 3 scheme, `2a`; the page title above the next
table is trimmed. 14 of 14 booklets resolve every unit.

## Review

Model review only (no teacher review). `tools/gcsehistory/reviews.py` compiles line sheets; sheets in
`data/imports/gcsehistory/reviews/` (compiled JSON). Rules used:

- one primary leaf per unit, occasional prerequisites (stored as crossover tags);
- Whitechapel source questions: 2(a) tags the source-skills leaf `10.5.2.3` and 2(b) `10.5.2.4`, with the
  topic leaf as prerequisite (so a learner filtering on the topic sees them only with crossover on);
- Paper 3 has no source-skill leaves, so its source and interpretation questions tag the content they examine;
- difficulty: describe parts and Paper 3 Q1/3(b) easy; 12-mark explain, 4-mark comparison, source utility and
  follow-up medium; 16 and 20-mark judgements and 3(d) hard. No Extra hard.
- Every unit was tagged and read against its question and scheme by the same model that tagged it, so there was no
  independent spot check. Treat tags as provisional.

47 of the 95 leaves have no primary unit yet (see `leaves_without_primary_units`). Past papers do not test every
bullet; most are narrow content bullets (for example 10.5.2.1, B1.2.1.1, 31.4.4.2).

## Rights

The owner recorded Pearson permission, taken here to cover Pearson's GCSE History papers and mark schemes.
This is an assumption: the owner has not separately confirmed GCSE History. 198 lossless crops are packaged as lazy
catalogues in `data/gcsehistory-assets/` (13 MB); `assets/gcsehistory/` is git-ignored.

## Checks

`npm test` (346 pass), `npm run validate` (0 errors), `tests/gcsehistory-spec.test.mjs`,
`tests/gcsehistory-bank.test.mjs`, and against `PORT=5791 node tools/serve.mjs` (port 5173 was occupied by another
process): `AUDIT_URL=http://localhost:5791 NODE_PATH=$(npm root -g) node tools/browser-gcsehistory-bank.cjs`,
`tools/browser-history-bank.cjs` (A level still passes) and `tools/browser-gcsecs-bank.cjs`.
Looked at rendered crops: Whitechapel 2(a) with its scheme and Source B picture, 2(b) answer table, SPaG question,
Paper 3 Q1 with its source and painting, a multi-page question, 3(d) and a source/interpretation context, the
last question's scheme with the SPaG table.

## Reproduce

```sh
R=../gcsehistory-research   # spec.pdf, sources/, candidates/, review-src/, reviews/
python3 tools/gcsehistory/build_spec.py $R/spec.pdf
python3 tools/gcsehistory/discover.py --output $R/discovered.json --years 2018 2019 2022 2023 2024 2025 2026
python3 tools/gcsehistory/inventory.py $R/discovered.json --cache $R/sources --out data/imports/gcsehistory/inventory
INV=data/imports/gcsehistory/inventory/1hi0-inventory.json
python3 tools/gcsehistory/extract.py $INV --sources $R/sources --output $R/candidates
python3 tools/gcsehistory/reviews.py prepare $R      # review-in/ packets
# one line per unit in $R/review-src/<PAPER>.txt, then
python3 tools/gcsehistory/reviews.py compile $R
python3 tools/gcsehistory/build.py --research $R
python3 tools/gcsehistory/finalize.py --research $R --activate
```

## Known gaps

- Model review only; tags and difficulty need a teacher's check.
- 47 of 95 leaves untouched by any real unit; June 2018 B1 and all of 2022 not publicly found; June 2026 not out yet.
- Examiners' reports are linked, not shown.
- Part-display tools in `tools/parts/` were not run; units are one crop per printed part with attached sources.
- Paper 2's period-study booklets are out of scope, so a learner sitting Paper 2 gets only half of it here.
