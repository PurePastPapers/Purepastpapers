# GCSE Biology 1BI0 and Combined Science 1SC0 (biology) question banks: handover

Notes for the Pearson Edexcel GCSE (9–1) Biology import (`EDX_GCSE_BIOL_1BI0`) and the
biology papers of GCSE (9–1) Combined Science (`EDX_GCSE_COMBSCI_1SC0`, papers 1BF, 1BH,
2BF, 2BH). The pipeline is the GCSE Maths one (`docs/GCSE-MATHS-HANDOVER.md`, `tools/gcsemaths`)
with the A level Biology part display (`docs/PART-DISPLAY.md`). Code is in `tools/gcsebio`.

## Status (17 November 2026)

**Active: all 48 public booklets** (November 2020 to June 2025), 384 source questions,
1,986 scored units, 3,840 marks, 6,655 image assets. Every unit's tariff matches the
paper's printed tariff, and every booklet adds up to its printed total. Tags and difficulty
are **model-reviewed** (`reviewer_type: model`), not teacher-reviewed.

| Group | Booklets | Source questions | Scored units | Marks |
| --- | ---: | ---: | ---: | ---: |
| 1BI0 Foundation (1F, 2F) | 12 | 120 | 663 | 1,200 |
| 1BI0 Higher (1H, 2H) | 12 | 120 | 576 | 1,200 |
| 1SC0 Foundation (1BF, 2BF) | 12 | 72 | 406 | 720 |
| 1SC0 Higher (1BH, 2BH) | 12 | 72 | 341 | 720 |

Difficulty: 888 easy, 892 medium, 206 hard. Exact figures are in
`data/imports/gcsebio/coverage.json`.

**Not public on Pearson** (`not_publicly_available` in coverage): June 2018 and June 2019
(question papers and mark schemes withdrawn from the public site), and June 2026 (not
released yet). Combined Science chemistry and physics papers are out of scope for this import.

## Tiers

Foundation and Higher are kept apart, as for Maths: each paper and unit has
`tier: "Foundation" | "Higher"`. The practice page already filters by **Tier** under *More*.
A tier choice when **adding a subject** is a UI change waiting on William's approval of
mock-ups (GCSE Maths thread); it has not been touched.

## Specification

`tools/gcsebio/build_spec.py` builds both trees from Pearson's specification PDFs
(1BI0 Issue 4, SHA256 `d43eeb70…aad`, content pages 14–36; 1SC0 Issue 6, SHA256
`0ededb98…83c`, biology content pages 17–36). It refuses any other file.

- `EDX_GCSE_BIOL_1BI0.json`: 165 statements `EDX_GCSE_BIOL_OFF_<code>`. 21 are Higher
  only (printed bold), and 53 are separate-Biology only (the `B` codes, e.g. `3.9B`).
- `EDX_GCSE_COMBSCI_1SC0.json`: only the biology section is replaced, with 112 statements
  `EDX_GCSE_COMBSCI_BIO_<code>` (8 Higher only), using the same codes as 1BI0. The chemistry
  and physics sections are left unchanged.
- Earlier unverified points are kept as `legacy_ids`. `js/config/spec-id-migrations.js` is
  regenerated with `tools/write_spec_migrations.py` (366 legacy ids), so saved ticks keep
  their meaning. The hidden demo questions in `data/questions/` were retagged. The build is
  idempotent: it reads old leaves from the existing `legacy_ids`.
- The build, the review compiler and `tests/gcsebio-bank.test.mjs` refuse a Higher-only tag
  on a Foundation unit and a `B` code on a 1SC0 unit.

Textbook contents pages have not arrived; tags use the official specification only.

## Pipeline (rerun order)

Research files live outside the repo, by default in `../gcsebio-research` (set
`GCSEBIO_RESEARCH` to change it): `sources/` (PDFs named `<paper>__<kind>.pdf`),
`parts-sources/` (SHA-named links used by `refine.py`), `candidates/`, `texts/`,
`mine/` (compact model review sheets) and `reviews/`. The compiled reviews are committed in
`data/imports/gcsebio/reviews/`.

```
python3 tools/gcsebio/discover.py --output <research>/discovery/1bi0.json   # HEAD-probes Pearson
python3 tools/gcsebio/fetch.py <research>/sources <research>/discovery/*.json
python3 tools/gcsebio/inventory.py <research>/discovery/*.json --out data/imports/gcsebio/inventory --cache <research>/sources
python3 tools/gcsebio/build_spec.py                       # spec trees + legacy ids
python3 tools/write_spec_migrations.py
python3 tools/gcsebio/extract.py <research>/sources --output <research>/candidates --ocr-dir <research>/ocr
python3 tools/gcsebio/cache_texts.py                      # part texts for the review kit
python3 tools/gcsebio/kit.py todo <paper>                 # lists parts with no reusable tags
python3 tools/gcsebio/kit.py compile <paper>              # mine/<paper>.txt -> reviews/<paper>.json
python3 tools/gcsebio/build.py data/imports/gcsebio/inventory/1bi0-inventory.json \
  --sources <research>/sources --candidates <research>/candidates --reviews <research>/reviews
python3 tools/gcsebio/build.py data/imports/gcsebio/inventory/1sc0-inventory.json …
python3 tools/gcsebio/finalize.py --research <research>
ls data/packs/gcsebio | sed 's/.json//' | xargs -P4 -I{} python3 tools/parts/refine.py \
  --subject gcsebio --rescheme --sources <research>/parts-sources --paper {}
python3 tools/gcsebio/finalize.py --research <research>   # recount refined assets
```

`build.py` skips a pack whose `build_signature` (`gcsebio-build-v1`) matches; bump it when
build or scheme logic changes. Images go to the catalogues `data/gcsebio-assets/<PAPER>.json`;
`assets/gcsebio/` is a local build folder (ignored).

Difficulty is a model heuristic in `kit.py`: kind base (recall 0; apply, calculation,
practical 1; extended 2), +1 for 3+ marks, +1 for 5+ marks, +1 on Higher, +1 in the last
40% of the paper. 1 or less is easy, 2–3 medium, 4 or more hard. A review line can override it.

### Layout notes

- Mark-scheme tables have `Question number | Answer | Additional guidance | Mark` columns,
  and answers often carry their own "(1)" marking points. `refine.py` therefore has a
  `MARK_COLUMN` mode (on for `gcsebio`) that counts a row's marks only in the Mark column
  (right of the nearest `Mark` header minus 8pt, or 0.76 of the page width).
- The last question of a scheme stops at its "(Total for question N" line.

### Refine results

1,889 parts have a verified part-only scheme, 26 matched a reference, 71 fall back to the
full-question scheme and 4 labels were not found. One question
(`EDX_1BI0_2022_JUNE_1F_Q07`) keeps its build crops. No crop is missing its text.

## Checks

- `npm test`: all pass except the known failure already on main
  ("a part is held back until the earlier part it builds on is learnt too").
- `npm run validate`: 0 errors.
- `node tools/browser-gcsebio-bank.cjs` against `npm start` checks both subjects: unit
  counts, tier filter counts, part crops and part schemes load, no console errors, and page
  width at 320, 390, 768 and 1440px. Known item: at 320px the long subject chip
  ("GCSE Biology (Triple / Separate Science)") runs 12–16px past the edge. It comes from the
  existing subject names and CSS, so fixing it is a UI change for approval; the check reports it.
