# AQA GCSE Geography 8035 question bank: handover

Notes for the AQA GCSE (9-1) Geography import (`AQA_GCSE_GEOG_8035`). The pipeline is the AQA
A-level Geography one (`docs/GEOGRAPHY-HANDOVER.md`, `tools/geography/`) copied to
`tools/gcsegeog/` and adapted stage by stage.

## Status (21 November 2026)

**Built, verified locally and activated in the pack index (20 of 21 booklets).** Nothing here has been run
against production. Tags and difficulty are **model-reviewed** (`reviewer_type: model`), not teacher-reviewed.

| Group | Booklets | Questions | Printed parts | Scored units | Excluded | Marks published (every option) | Cover marks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Exams, Paper 1 | 6 | 30 | 234 | 226 | 8 | 589 | 88 each |
| Exams, Paper 2 | 5 | 30 | 199 | 193 | 6 | 547 | 88 each |
| Exams, Paper 3 | 6 | 28 | 132 | 122 | 10 | 352 | 76 (56 for Nov 2021 and Jun 2022) |
| Official samples, Papers 1, 2, 3 | 3 | 16 | 97 | 90 | 7 | 271 | 88, 88, 76 |
| **Total** | **20** | **104** | **662** | **631** | **31** | **1759** | |

Every booklet reconciles to its cover maximum counting the right number of options in each choice group
(`tests/gcsegeog-bank.test.mjs`). Difficulty: 331 easy, 225 medium, 75 hard, each with a basis (tariff, command
word, data demand, AO split); no official part is labelled hard for being long. `data/imports/gcsegeog/coverage.json`
holds the figures; `data/gcsegeog-assets/` holds 1,406 lossless crops (133 MB) as lazy catalogues.

**Rights (assumption, owner to confirm).** The owner's 16 November 2026 note (`docs/GEOGRAPHY-HANDOVER.md`) confirms AQA
permission and names A-level 7037/7036; the recorded permissions cover Pearson and AQA board-wide. GCSE 8035 was treated as
covered and the packs were activated. `coverage.json` carries `rights_basis: "ASSUMPTION ..."`. If the owner does not
agree, remove the `gcsegeog/` entries from `data/packs/index.json`.

### Not imported and excluded

- **AQA_8035_2022_JUNE_02 is not imported.** It is an adapted sitting (63 marks, 75 minutes): "Answer either Section B or
  Section C", with a further choice inside Section C. Printed parts add to 125 against 63 and the choice-group model
  (one level) cannot express it. Recorded in `coverage.json` (`not_imported`) and `NOT_IMPORTED` in `tools/gcsegeog/reviews.py`.
- **31 units excluded** because AQA removed a figure or text the unit needs ("-CR" files). Listed on each paper as
  `excluded_questions` and in `coverage.json`:
  Nov 2020 P1 1.12, 2.6, 5.6; Nov 2020 P2 3.1, 5.5; Nov 2020 P3 Q3 (resources Figure 3); Jun 2022 P3 Q3 (Figure 3);
  Jun 2023 P1 2.1, 2.3 (Figure 7); Jun 2023 P2 2.9, 3.4, 6.5; Jun 2023 P3 2.1 to 2.6 and Q3 (Figures 2 and 3);
  Jun 2024 P1 1.6, 1.7, 1.8 (Figure 4); Jun 2025 P2 2.9; Jun 2025 P3 Q3 (Figure 3); specimen P2 1.1, 2.1, 2.4, 2.5, 2.7, 3.1, 3.3.
  Paper 3 Question 3 (the 12+3 decision question) is therefore missing from 4 of the 6 exam papers.
- Not used: June 2026 papers (not listed by AQA), modified (MQP) papers (same questions), any secure route.

### How the pipeline differs from A level

- **SPaG** ("[+ 3 SPaG marks]") is folded into the part's marks by the extractor (`spag_marks` on the unit and
  `provenance.spag_marks_included`): 22 units, 66 marks.
- **Choice groups with a count.** Packs carry `choice_choose` beside `choice_groups` (Paper 1 Section C: two of three;
  Paper 2 Section C: Question 3 plus one of 4, 5, 6). `js/data/schema.js` counts the best N options of each group
  (default 1; `tests/choice-choose.test.mjs`); A-level Geography behaves as before.
- **Figures.** `tools/gcsegeog/figures.py` indexes the Paper 3 pre-release **resources booklet** (filed by AQA as PM, CM or
  INS; `inventory.py` now finds it by its cover and records `resource_booklet`), OS map **key** inserts (attached as
  "Key for Figure n" to every part that cites that OS map; rotated key pages are turned upright) and colour inserts
  (specimen Paper 1 Figure 9). The June 2024 booklet and the Paper 3 specimen resources have no text layer; their figure pages
  are listed in `NOTEXT` after being read by eye. `resolve.py` attaches the booklet figure(s) a Paper 3 question is based on to
  every part of it, and every booklet figure to the "Use evidence from the resources booklet" question, so a unit whose booklet
  figure was removed is excluded. UI caption: "from the resources booklet" (`js/ui/question-view.js`).
- **Schemes.** `schemes.py` reads AQA's "Qu | Pt | Marking guidance | Total marks" rows in paper order; levels grids and SPaG rows
  stay with their part (viewed on 2020 Nov P1 2.9 and 1.5).
- **Routes** (`ROUTES` in `reviews.py`, enforced by `compile` and the test): Paper 1 Section A hazards, B living world, C
  Q3 coasts, Q4 rivers, Q5 glacial (+ UKLAND_3.1); Paper 2 A urban, B economic world, C Q3 RES_6.1, Q4 food, Q5 water, Q6 energy;
  Paper 3 A issue evaluation (`APP_7.1.k1` primary, with physical or human leaves and skills as prerequisites), B fieldwork
  (`APP_7.2.k1`, or a skills leaf `APP_7.3.x` for pure data-skill parts). Skills leaves may be primary anywhere.
- No tiers, no AS, no content year (`introduced_year` is not set).

## Specification

`data/specs/AQA_GCSE_GEOG_8035.json` is built from AQA's specification (Version 1.1,
12 September 2023, SHA256 `4563d2e6…0b4`; other files are refused). AQA prints each section as
a "Key idea | Specification content" table; leaves are the key ideas (`<section id>.k<n>`, 49
leaves) plus 7 skills headings (3.4.1 to 3.4.7, `AQA_GCSE_GEOG_APP_7.3.<n>`), issue evaluation
(3.3.1) and fieldwork (3.3.2) as one prose leaf each. The earlier unverified ids
(`AQA_GCSE_GEOG_HAZ_1.2`, `URBAN_4.1` ...) migrate to the key ideas they covered
(`js/config/spec-id-migrations.js`); the eight demo questions were retagged by hand.
`tests/gcsegeog-spec.test.mjs` covers it. Skills and fieldwork content is prose, so those leaves
are coarse.

## Sources

`data/imports/gcsegeog/inventory/8035-inventory.json`: 21 booklets, 7 series of three papers
(November 2020, November 2021, June 2022 to June 2025) plus the three specimen papers. Every file
was fetched from AQA's cdn.sanity.io URL and checked against AQA's published SHA-1. Modified
question papers (MQP) are skipped, as for A level. Many standard files are AQA "-CR"
(copyright-removed) versions: a unit whose required figure is removed has to be excluded and
recorded. Maximum marks and times come from each cover: June 2022 Paper 2 is an adapted sitting
(63 marks, 75 minutes), November 2021 and June 2022 Paper 3 are 56 marks, 60 minutes.
Examiners' reports exist for every exam booklet; the specimen papers have none.

## Extraction (what differs from A level)

- Part labels print as `0 1 1` (no dot) and `0 1 1 0` for part 10; the fourth digit is read only
  when it continues the part sequence.
- `[+ 3 SPaG marks]` (spelling, punctuation, grammar) is printed after one tariff in Papers 1 to 3;
  its marks join that unit (`spag_marks`), so booklets reconcile to the cover maximum.
- Choice rules read from the cover: "Answer two questions in Section C" (Paper 1: pick 2 of 3 at 15
  marks) and "Answer Question 3 and one other question in Section C" (Paper 2). The extractor records
  `choice_choose` beside `choice_groups`. **`js/data/schema.js` still counts one option per group**:
  it needs an optional per-group count before Paper 1 packs validate cleanly.
- Two tariffs under one label are one unit: a multiple-choice part followed by an unlabelled follow-up
  question (2025 Paper 2, 4.3, 5.3, 6.3: marks add), and an "Either ... Or ..." pair (2025 Paper 1,
  2.10: one option's marks).
- **Not importable as is: June 2022 Paper 2** (adapted sitting, "Answer either Section B or Section C"
  with a further choice inside Section C). It does not reconcile (125 of 63) and has no clean
  choice-group representation. Record it as excluded unless a nested-choice form is added.
- 708 candidate units across the 21 booklets (662 in the 20 that reconcile). 17 units already show
  AQA's copyright-removed notice in their own crop.

## Reproduce

```sh
R=../gcsegeog-research   # sources/ candidates/ review-in/ review-src/ reviews/ (kept outside git)
curl -A "Mozilla/5.0" -o $R/page.html https://www.aqa.org.uk/subjects/geography/gcse/geography-8035/assessment-resources
curl -L -o $R/spec.pdf https://filestore.aqa.org.uk/resources/geography/specifications/AQA-8035-SP-2016.PDF
python3 tools/gcsegeog/build_spec.py $R/spec.pdf
python3 tools/gcsegeog/resources.py $R/page.html > $R/records.json
python3 tools/gcsegeog/fetch.py $R/records.json --dest $R/sources
python3 tools/gcsegeog/inventory.py $R/records.json --sources $R/sources
python3 tools/gcsegeog/extract.py data/imports/gcsegeog/inventory/8035-inventory.json --sources $R/sources --output $R/candidates
python3 tools/gcsegeog/reviews.py prepare $R     # packets in $R/review-in
# one line per unit in $R/review-src/<PAPER>.txt (label | leaf codes ; prerequisites | e/m/h | summary | basis), then:
python3 tools/gcsegeog/reviews.py compile $R
python3 tools/gcsegeog/build.py --research $R
python3 tools/gcsegeog/finalize.py --research $R --activate
npm test && npm run validate && npm start & NODE_PATH=$(npm root -g) node tools/browser-gcsegeog-bank.cjs
```

The compiled reviews (the only hand-made input) are in `data/imports/gcsegeog/reviews/`. If a re-extraction changes which
units are excluded, `compile` names the missing or extra labels; drop or add those lines.

## Checks run (21 November 2026, local)

`npm test` 347 pass (new: `tests/gcsegeog-bank.test.mjs` 6, `tests/choice-choose.test.mjs` 3); `npm run validate` 0 errors
(warnings are exactly the booklets with an excluded part); `tools/browser-gcsegeog-bank.cjs` PASS (631 units discoverable,
insert key and resources booklet figures labelled and loaded, scheme pixels, paper page, 320/390/768/1440 px, no console
errors); `tools/browser-geography-bank.cjs` and `tools/browser-gcsecs-bank.cjs` still PASS. All 1,524 crops were checked
non-blank and not heading-only strips. Crops opened by eye: multiple choice (2024 P1 1.2, 5.2), photo-choice parts (2024 P1 1.10,
2.9), OS maps with inserted key (2024 P1 3.2, 5.2; 2021 P1 3.1 rotated key), SPaG and levels-of-response parts and schemes
(2020 P1 2.9, 1.5), Paper 3 booklet figures (2021 P3 1.1, 1.3, 3.2; 2022 P3 1.1, 2.2, 2.3, 4.8; 2024 P3 2.3, Q3), last
questions of 2021 P1 and 2021 P3, specimen P3 3.3. Not opened: every other unit.

## Known gaps and uncertainties

- **Review method.** No subagents were available, so the lead (Claude) wrote all 631 tag lines directly from the question text
  and the first words of each scheme; there was no independent second reviewer and no 10 percent re-read against full schemes.
  Expect some leaf and difficulty disagreements; treat as model review.
- Leaves with no primary unit: `LIVING_2.4.k2`, `LIVING_2.4.k3` (cold environments: the cold-or-desert choice parts were tagged to
  the desert leaf or both), `APP_7.3.6`, `APP_7.3.7` (used only as prerequisites).
- Paper 3 skills in Section A are tagged `APP_7.1.k1` as primary, so data-reading parts there are not under the skills leaves.
- A part's crop can begin with the previous part's answer lines (visible on 2021 P3 1.3); the page frame under the 2024 P1 2.9
  photos is slightly clipped. Neither hides question content.
- A middle part of an OS-map question that does not name the figure (for example 2020 Nov P2 1.10) does not get the insert key.
- Booklet figures are listed in the order the question cites them (Figure 3 before 1 and 2 on 2024 P3 Q3).
- Examiners' reports are linked (17 of 20 booklets), not shown. Specimen papers have none.
- The 8 earlier demo questions stay hidden.
