# AQA GCSE Geography 8035 question bank: handover

Notes for the AQA GCSE (9-1) Geography import (`AQA_GCSE_GEOG_8035`). The pipeline is the AQA
A-level Geography one (`docs/GEOGRAPHY-HANDOVER.md`, `tools/geography/`) copied to
`tools/gcsegeog/` and adapted stage by stage.

## Status (21 November 2026)

**Checkpoint 3 reached (specification, inventory, extraction). Nothing is published yet.**
The question bank is not built: there are no reviews, packs or crops for GCSE Geography. The
existing 8 demo questions are unchanged apart from being retagged to the new leaves.

| Stage | State |
| --- | --- |
| Specification (`tools/gcsegeog/build_spec.py`) | done: 56 verified leaves, ids migrate |
| Source inventory (`resources.py`, `fetch.py`, `inventory.py`) | done: 21 booklets, 126 files verified |
| Extraction (`extract.py`) | done: 20 of 21 booklets reconcile to the cover maximum, 0 exceptions |
| Figures, schemes, review tagging, build, finalize, tests | **not started** (see "Next") |

Rights: the owner's 16 November 2026 confirmation covers AQA material (it names A-level 7037/7036).
It is read here as covering AQA GCSE Geography; confirm that wording before publishing.

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

## Next (in order)

1. Copy and adapt from `tools/geography/`: `figures.py` and `resolve.py` (insert figures; the
   Paper 3 resource booklet is the insert), `schemes.py` (AQA mark-scheme tables), `reviews.py`
   (replace the A-level `ROUTES`/option rules with the GCSE ones: Paper 1 Section C Q3 coastal,
   Q4 rivers, Q5 glacial; Paper 2 Section C Q3 overview then Q4 food, Q5 water, Q6 energy),
   `build.py` and `finalize.py` (level GCSE, no AS, no content year, `assets/gcsegeog`,
   `data/gcsegeog-assets`).
2. `schema.js`: per-group choose count (see above). Add a test.
3. Tag the 662 units to the 56 leaves (model review, `reviewer_type: model`): about 35 lines per
   booklet. This is the large step.
4. Build, finalize, `tests/gcsegeog-bank.test.mjs`, `tools/browser-gcsegeog-bank.cjs`, activate.

## Reproduce (what exists)

```sh
R=../gcsegeog-research
curl -A "Mozilla/5.0" -o $R/page.html https://www.aqa.org.uk/subjects/geography/gcse/geography-8035/assessment-resources
curl -L -o $R/spec.pdf https://filestore.aqa.org.uk/resources/geography/specifications/AQA-8035-SP-2016.PDF
python3 tools/gcsegeog/build_spec.py $R/spec.pdf
python3 tools/gcsegeog/resources.py $R/page.html > $R/records.json
python3 tools/gcsegeog/fetch.py $R/records.json --dest $R/sources
python3 tools/gcsegeog/inventory.py $R/records.json --sources $R/sources
python3 tools/gcsegeog/extract.py data/imports/gcsegeog/inventory/8035-inventory.json --sources $R/sources --output $R/candidates
```
