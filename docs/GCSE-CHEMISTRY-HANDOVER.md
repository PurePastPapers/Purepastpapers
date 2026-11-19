# GCSE Chemistry 1CH0 and Combined Science 1SC0 (chemistry) question banks: handover

Notes for the Pearson Edexcel GCSE (9–1) Chemistry import (`EDX_GCSE_CHEM_1CH0`) and the
chemistry papers of GCSE (9–1) Combined Science (`EDX_GCSE_COMBSCI_1SC0`, papers 1CF, 1CH,
2CF, 2CH). The pipeline is the GCSE Biology one (`docs/GCSE-BIOLOGY-HANDOVER.md`,
`tools/gcsebio`), copied to `tools/gcsechem` with chemistry codes. Built on top of the
Biology branch, so both imports share the 1SC0 subject without conflicting edits.

## Status (17 November 2026)

**Active: all 48 public booklets** (November 2020 to June 2025), 384 source questions,
2,017 scored units, 3,840 marks, 6,709 image assets. Every unit's tariff matches the
paper's printed tariff, and every booklet adds up to its printed total. Tags and difficulty
are **model-reviewed** (`reviewer_type: model`), not teacher-reviewed.

| Group | Booklets | Source questions | Scored units | Marks |
| --- | ---: | ---: | ---: | ---: |
| 1CH0 Foundation (1F, 2F) | 12 | 120 | 685 | 1,200 |
| 1CH0 Higher (1H, 2H) | 12 | 120 | 568 | 1,200 |
| 1SC0 Foundation (1CF, 2CF) | 12 | 72 | 422 | 720 |
| 1SC0 Higher (1CH, 2CH) | 12 | 72 | 342 | 720 |

Difficulty: 807 easy, 919 medium, 291 hard. Exact figures are in
`data/imports/gcsechem/coverage.json`.

**Not public on Pearson** (`not_publicly_available` in coverage): June 2018 and June 2019
(question papers and mark schemes not on the public site, same as Biology), and June 2026
(not released yet). Every miss is recorded with its probe window in the inventories.

## Tiers

Foundation and Higher are kept apart: each paper and unit has `tier`.

Tier chooser (owner request 19 November 2026, implemented): 1SC0, 1BI0, 1CH0 and 1PH0 each
have `"tiers": ["Foundation", "Higher"]` and `"tier_required": true` in `data/subjects.json`
(still one registry record per qualification). Adding the subject requires Foundation or
Higher (no "Not decided yet" card); the choice is saved per subject in
`preferences.tiers[subject_id]`, so each separate science and Combined Science keep their own
tier. The subject page, Practice (individual questions and Build a test) and Past papers show a
visible **Tier** control. The saved tier sets the spec tree and learned-topic counts
(`tier: "Higher"` points are hidden at Foundation, never unticked; `higher_extension`
statements stay at Foundation), the question pool, tests and the default paper list. Both
tiers or the other tier appear only when the student switches the control (Practice: for that
tab only) or searches for "higher"/"foundation" or a paper code such as `1BH`. An account with
the subject but no tier is asked to choose before tier-filtered content; ticks and history are
kept. Logic: `js/engine/tiers.js`; tests: `tests/gcse-science-tiers.test.mjs`; browser check:
`node tools/browser-tier-picker.cjs`.

## Specification

`tools/gcsechem/build_spec.py` builds both trees from Pearson's specification PDFs
(1CH0 Issue 4, SHA256 `ece75263…bcf`, content pages 15–44; 1SC0 Issue 6, SHA256
`0ededb98…83c`, chemistry content pages 37–57). It refuses any other file.

- `EDX_GCSE_CHEM_1CH0.json`: 237 statements `EDX_GCSE_CHEM_OFF_<code>`. 26 are Higher only
  (printed bold) and 66 are separate-Chemistry only (the `C` codes, all of Topics 5 and 9).
- `EDX_GCSE_COMBSCI_1SC0.json`: only the chemistry section is replaced, with 171 statements
  `EDX_GCSE_COMBSCI_CHEM_<code>` (17 Higher only), using the same codes as 1CH0. The biology
  and physics sections are left as they are.
- The earlier placeholder leaves (`EDX_GCSE_CHEM_C1_1.1` …) were the spec's sub-headings;
  they are kept as `legacy_ids` covering every statement under that sub-heading, and
  `js/config/spec-id-migrations.js` is regenerated (411 legacy ids), so saved ticks keep
  their meaning. The hidden demo questions were retagged.
- The PDF text layer scrambles some superscripts; `TEXT_FIX` holds the printed wording of
  those statements (1.38, 1.41, 1.43, 1.48, 1.49, 5.8C, 5.16C, 7.14).
- The build, the review compiler and `tests/gcsechem-bank.test.mjs` refuse a Higher-only tag
  on a Foundation unit and a `C` code on a 1SC0 unit.

Textbook contents pages have not arrived; tags use the official specification only.

## Pipeline (rerun order)

Research files live outside the repo, by default in `../gcsechem-research` (set
`GCSECHEM_RESEARCH`): `spec/`, `discovery/`, `sources/` (PDFs named `<paper>__<kind>.pdf`),
`parts-sources/` (SHA-named links for `refine.py`), `candidates/`, `texts/`, `mine/`
(compact model review sheets), `review-src/` and `reviews/`. The compiled reviews are
committed in `data/imports/gcsechem/reviews/`.

```
python3 tools/gcsechem/discover.py --series 2024_JUNE --output <research>/discovery/2024_JUNE.json \
  [--hints <research>/discovery/hints.json]          # HEAD-probes Pearson, one series per run
python3 tools/gcsechem/fetch.py <research>/sources <research>/discovery/20*.json
python3 tools/gcsechem/inventory.py <research>/discovery/20*.json --out data/imports/gcsechem/inventory --cache <research>/sources
python3 tools/gcsechem/build_spec.py <research>/spec
python3 tools/write_spec_migrations.py
python3 tools/gcsechem/extract.py <research>/sources --output <research>/candidates --ocr-dir <research>/ocr
python3 tools/gcsechem/cache_texts.py
python3 tools/gcsechem/kit.py todo <paper>          # parts with no reusable tags
python3 tools/gcsechem/kit.py compile <paper>       # mine/<paper>.txt -> review-src/<paper>.txt
python3 tools/gcsechem/reviews.py <research>        # review-src -> reviews/*.json
python3 tools/gcsechem/build.py data/imports/gcsechem/inventory/1ch0-inventory.json \
  --sources <research>/sources --candidates <research>/candidates --reviews <research>/reviews
python3 tools/gcsechem/build.py data/imports/gcsechem/inventory/1sc0-inventory.json …
python3 tools/gcsechem/finalize.py --research <research>
ls data/packs/gcsechem | sed 's/.json//' | xargs -P4 -I{} python3 tools/parts/refine.py \
  --subject gcsechem --rescheme --sources <research>/parts-sources --paper {}
python3 tools/gcsechem/finalize.py --research <research>   # recount refined assets
```

`--hints` is a list of dates other Pearson GCSE science and maths files of the same series
were published on (taken from the Biology and Maths inventories); it only changes the order
dates are tried in. `build.py` skips a pack whose `build_signature` (`gcsechem-build-v1`)
matches; bump it when build or scheme logic changes.

### Review sheets

`mine/<paper>.txt` lines are `Q part | codes[; prereqs] | kind | summary [| e/m/h]`.
`kit.py` reuses tags for identical printed parts across papers (most 1SC0 questions are
shared with 1CH0), but only when every reused code is valid for the target qualification and
tier. A part label that the extraction read twice (a misread `*(c)` printed after `(b)`) is
written `b#2@c`: the second `(b)` tariff, displayed as `(c)`. Three November 2020 booklets
need this.

### Refine results

1,902 parts have a verified part-only scheme, 3 matched a reference, 2 include sibling rows
and 110 fall back to the full-question scheme; 18 labels were not found (all November 2020).
Some schemes print the assessment objective as "AO2 1" in the Mark column; `refine.py` now
skips a number that directly follows an `AO<n>` word so it is not counted as a tariff.

## Checks

- `npm test`: all pass except the known failure already on main
  ("a part is held back until the earlier part it builds on is learnt too").
- `npm run validate`: 0 errors.
- `node tools/browser-gcsechem-bank.cjs` against `npm start` checks both subjects: unit
  counts (all packs of the subject, so 1SC0 counts biology and chemistry), tier filter
  counts, part crops and part schemes load, no console errors, and page width at 320, 390,
  768 and 1440px. Known item: at 320px the long subject chip ("GCSE Chemistry (Triple /
  Separate Science)") runs 30px past the edge. It comes from the existing subject names and
  CSS, so fixing it is a UI change for approval; the check reports it.
  `tools/browser-gcsebio-bank.cjs` was changed the same way so it still passes with the
  chemistry packs in 1SC0.
