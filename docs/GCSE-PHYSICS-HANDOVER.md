# GCSE Physics 1PH0 and Combined Science 1SC0 (physics) question banks: handover

Notes for the Pearson Edexcel GCSE (9–1) Physics import (`EDX_GCSE_PHYS_1PH0`) and the
physics papers of GCSE (9–1) Combined Science (`EDX_GCSE_COMBSCI_1SC0`, papers 1PF, 1PH,
2PF, 2PH). The pipeline is the GCSE Chemistry one (`docs/GCSE-CHEMISTRY-HANDOVER.md`,
`tools/gcsechem`), copied to `tools/gcsephys` with physics codes. Built on top of the
Chemistry branch (itself on Biology), so all three imports share the 1SC0 subject without
conflicting edits.

## Status (17 November 2026)

**Active: all 48 public booklets** (November 2020 to June 2025), 384 source questions,
1,895 scored units, 3,840 marks, 6,358 image assets. Every unit's tariff matches the
paper's printed tariff, and every booklet adds up to its printed total. Tags and difficulty
are **model-reviewed** (`reviewer_type: model`), not teacher-reviewed.

| Group | Booklets | Source questions | Scored units | Marks |
| --- | ---: | ---: | ---: | ---: |
| 1PH0 Foundation (1F, 2F) | 12 | 120 | 618 | 1,200 |
| 1PH0 Higher (1H, 2H) | 12 | 120 | 567 | 1,200 |
| 1SC0 Foundation (1PF, 2PF) | 12 | 72 | 367 | 720 |
| 1SC0 Higher (1PH, 2PH) | 12 | 72 | 343 | 720 |

Difficulty: 656 easy, 1,065 medium, 174 hard. Exact figures are in
`data/imports/gcsephys/coverage.json`.

**Not public on Pearson** (`not_publicly_available` in coverage): June 2018 and June 2019
(not on the public site, same as Biology and Chemistry), and June 2026 (not released yet).
Every miss is recorded with its probe window in the inventories.

## Tiers

Foundation and Higher are kept apart: each paper and unit has `tier`. The practice page
already filters by **Tier** under *More*. A tier choice when **adding a subject** is a UI
change waiting on William's approval of mock-ups (GCSE Maths thread); it has not been touched.

## Specification

`tools/gcsephys/build_spec.py` builds both trees from Pearson's specification PDFs
(1PH0 Issue 4, March 2024, SHA256 `d0d1c176…41d9`, content pages 15–50; 1SC0 Issue 6,
SHA256 `0ededb98…583c`, physics content pages 58–84). It refuses any other file.

- `EDX_GCSE_PHYS_1PH0.json`: 296 statements `EDX_GCSE_PHYS_OFF_<code>`. 42 are Higher only
  (printed bold) and 91 are separate-Physics only (the `P` codes, including all of Topics 7
  and 11). Three statements (2.23, 2.31, 4.10) are mixed: a Higher sentence in bold inside a
  common statement (`higher_extension`); they stay available to Foundation.
- `EDX_GCSE_COMBSCI_1SC0.json`: only the physics section is replaced, with 205 statements
  `EDX_GCSE_COMBSCI_PHYS_<code>` (22 Higher only), using the same codes as 1PH0. The biology
  and chemistry sections are left as they are.
- Bold detection ignores the maths-skill references (`1a`, `3c`, …) and equation symbols in
  the right-hand column, which are bold on every row.
- The earlier placeholder leaves were the spec's sub-headings; they are kept as `legacy_ids`
  (the `LEGACY` map in `build_spec.py`), and `js/config/spec-id-migrations.js` is
  regenerated (480 legacy ids), so saved ticks keep their meaning. For 1SC0, a code whose
  separate-science sub-heading does not exist joins the last sub-heading of its topic. The
  hidden demo questions were retagged.
- The PDF text layer scrambles the equations; `tools/gcsephys/textfix.py` holds the printed
  wording of those 34 statements.
- The build, the review compiler and `tests/gcsephys-bank.test.mjs` refuse a Higher-only tag
  on a Foundation unit and a `P` code on a 1SC0 unit.

Textbook contents pages have not arrived; tags use the official specification only.

## Discovery quirks

- The November 2021 Paper 2 question papers are dated 2 December 2021, and the June 2024
  1PH0 1F and 1SC0 1PF/1PH question papers 2 July 2024. `discover.py` probes November
  question papers from 20 October to 10 December and June ones from 8 May to 10 July.
- Shared Foundation/Higher mark schemes print both references ("8c(i)(F) 2(ai)(H)");
  `schemes.py` keeps only the reference for the scheme's own tier. It also skips the
  command-word ("Strand / Element") guidance pages and starts a table on an
  "Answer … Mark" header where the "Question" header is artwork.

## Pipeline (rerun order)

Research files live outside the repo, by default in `../gcsephys-research` (set
`GCSEPHYS_RESEARCH`), laid out as for Chemistry. The compiled reviews are committed in
`data/imports/gcsephys/reviews/`.

```
python3 tools/gcsephys/discover.py --series 2024_JUNE --output <research>/discovery/2024_JUNE.json \
  [--hints <research>/discovery-hints.json]
python3 tools/gcsephys/fetch.py <research>/sources <research>/discovery/20*.json
python3 tools/gcsephys/inventory.py <research>/discovery/20*.json --out data/imports/gcsephys/inventory --cache <research>/sources
python3 tools/gcsephys/build_spec.py <research>/spec
python3 tools/write_spec_migrations.py
python3 tools/gcsephys/extract.py <research>/sources --output <research>/candidates --ocr-dir <research>/ocr
python3 tools/gcsephys/cache_texts.py
python3 tools/gcsephys/kit.py todo <paper>
python3 tools/gcsephys/kit.py compile <paper>
python3 tools/gcsephys/reviews.py <research>
python3 tools/gcsephys/build.py data/imports/gcsephys/inventory/1ph0-inventory.json \
  --sources <research>/sources --candidates <research>/candidates --reviews <research>/reviews
python3 tools/gcsephys/build.py data/imports/gcsephys/inventory/1sc0-inventory.json …
python3 tools/gcsephys/finalize.py --research <research>
ls data/packs/gcsephys | sed 's/.json//' | xargs -P4 -I{} python3 tools/parts/refine.py \
  --subject gcsephys --rescheme --sources <research>/parts-sources --paper {}
python3 tools/gcsephys/finalize.py --research <research>   # recount refined assets
```

`finalize.py` must run before `refine.py` (refine reads `data/gcsephys-assets/`). The build
signature is `gcsephys-build-v1`.

### Review sheets

Same format as Chemistry. `kit.py` reuse keys strip the mirrored "DO NOT WRITE IN THIS
AREA" margin text and the page barcodes, which the 2024 booklets otherwise leak into the
part text. A repeated extracted label is written `b#2@c`; `kit.py` now keeps the tags of the
first and second occurrence apart (November 2020 1F and 1H need this).

### Refine results

1,546 parts have a verified part-only scheme, 209 matched a reference, 45 include sibling
rows and 95 fall back to the full-question scheme (labelled as such); 39 labels were not
found. Physics schemes print each part in its own table with the reference stacked or
unbracketed ("1" over "(b)(ii)", "2bii", "5 (b)iii"). `refine.py` now reads those forms;
before that 410 parts fell back. The change only adds matches, and every added part scheme
still has to agree with the Mark column or a reference. Biology and Chemistry packs were not
re-refined in this branch. The remaining fallbacks are mostly 2022 1H and November 2021 2H,
where one table carries two alternative versions of a part.

## Checks

- `npm test`: all pass except the known failure already on main
  ("a part is held back until the earlier part it builds on is learnt too").
  `tests/part-display.test.mjs` now includes `gcsephys`.
- `npm run validate`: 0 errors.
- `node tools/browser-gcsephys-bank.cjs` against `npm start`: unit counts (all packs of the
  subject, so 1SC0 counts biology, chemistry and physics), tier filter counts, part crops and
  part schemes load, no console errors, page width at 320, 390, 768 and 1440px. Known item:
  at 320px the long subject chip runs 11px (1PH0) / 16px (1SC0) past the edge; fixing it is
  a UI change for approval. The Biology and Chemistry browser checks also still pass.
