# AQA GCSE Religious Studies A 8062 question bank: handover

Subject `AQA_GCSE_RS_8062`. Pipeline `tools/gcsers/` (inventory and spec done; extraction not started), shared AQA tools in `tools/aqa/`.
Template: `tools/gcsegeog/` (AQA, label `0 1 . 3`, tariff `[n marks]`, SPaG, choice groups with a choose count).

## Status (22 November 2026): foundation only. NO questions imported.

Done and pushed:
- **Source inventory** `data/imports/gcsers/inventory/8062-inventory.json`: **62 public booklets** (question paper + mark scheme, examiner report where listed), all fetched and verified against AQA's published SHA-1; SHA256 recorded.
  Paper 1 options 1 to 7 (Buddhism, Catholic Christianity, Christianity, Hinduism, Islam, Judaism, Sikhism: files `806211`..`806217`), Paper 2A (non-textual studies) and Paper 2B (textual studies, St Mark's Gospel),
  for November 2020, November 2021, June 2022 to June 2025, plus the 2026 sample set 1 (9 booklets). **One gap:** November 2021 Paper 1 Option 2 (Catholic Christianity): AQA lists no files (`not_public`).
  AQA lists no November 2022 to 2025 series and no June 2026 papers.
- **Specification** rebuilt from Version 1.3 (1 September 2025, SHA256 `88399876…b41c`) by `tools/gcsers/build_spec.py`: 48 leaves (7 religions x 4 printed sub-headings, Themes A to F, textual Themes G and H), printed codes as strings, AQA bullets verbatim, printed pages. The earlier stub covered only Christianity and Islam and "four themes" and was wrong for a 7-religion, 8-theme qualification.
  Old ids (`CHR_1.1`, `CHR_1.2`, `ISL_2.1`, `ISL_2.2`, `THEMES_A..F`) migrate via `legacy_ids`; the 6 hidden demo questions were retagged to the first migrated leaf.

## Facts the next agent must respect

- **Exam format change from June 2026** (`AQA-8061-8062-SOC v1.0`): each section becomes 1, 1, 4, 6, 12 marks (the 2-mark "give two" becomes a 1-mark short response; the 5-mark "refer to a source" becomes 6 marks with 1 mark for naming a source and 1 for applying it). All 2020 to 2025 papers use the OLD format (1, 2, 4, 5, 12). The two formats must stay labelled (do not merge tariff meaning); the 2026 samples are `is_official_sample` with an explicit sample identity, not an invented year.
- **Paper 1** is two religion options taken together in 1 h 45 min (about 50 min each): `duration_minutes` is SHARED, each booklet is 51 marks (Beliefs 27 incl. 3 SPaG on the 12-mark; Practices 24). A candidate sits two options, so options are separate pools, never one "Paper 1" total.
- **Paper 2** is 96 marks, 1 h 45 min, four themes. 2A covers Themes A to F (four chosen); 2B (textual) is Themes G and H with Christianity or Catholic Christianity in Component 1. Choice structure must be read from each cover (choice groups with a choose count, as in Geography).
- "November 2020" and "November 2021" schemes print June 2020 / June 2021 on their covers (the cancelled summer series), as for English Language: AQA's listing label is kept.
- Watch for AQA "-CR" copyright-removed files, especially Paper 2B (Gospel text) and any source printed in a question: exclude and list dependent units, never publish a part with its source missing.
- Rights: the owner's AQA permission note (16 November 2026) is recorded as board-wide; carry the same ASSUMPTION wording and ask the owner to confirm for Religious Studies.
- Topic organisation: official specification only (no textbook supplied). Tags are model reviews; do not call them teacher reviews.

## Remaining work (in order)

1. **Size/hosting decision (owner).** The site is at the 1 GB Pages budget (see `docs/GCSE-ENGLISH-LANGUAGE-HANDOVER.md`). RS would add roughly 60 booklets of crops; do not activate before this is resolved.
2. `tools/gcsers/extract.py` (adapt `tools/gcsegeog/extract.py`): labels `0 1 . 3`, tariffs `[1 mark]`..`[12 marks]` with `[SPaG 3 marks]` folded into the 12 (as Geography), multiple choice 1-mark parts, "Question n continues" pages, per-section Beliefs/Practices or per-theme sections, cover-derived choice rules.
   Reconcile each booklet to 51 / 96 marks (51 for 2026 samples). Fetch cache: `python3 tools/aqa/fetch.py records.json --dest DIR --keep '^AQA-80621[1-7]-(QP|MS|W-MS|WRE)|^AQA-80622[AB]-(QP|MS|W-MS|WRE)|^AQA-8062-(1[1-7]|2[AB])-S(QP|MS)'`.
3. Schemes (levels-of-response 12-mark grids plus point-based 4/5/6 marks), reviews (model), build, finalize (`--activate` only after step 1), tests (`tests/gcsers-bank.test.mjs`), browser script, handover update.

## Reproduce what exists

```sh
R=../gcsers-research
curl -A "Mozilla/5.0" -L -o $R/page.html https://www.aqa.org.uk/subjects/religious-studies/gcse/religious-studies-a-8062/assessment-resources
python3 tools/aqa/resources.py $R/page.html > $R/records.json
python3 tools/aqa/fetch.py $R/records.json --dest $R/sources --keep '<pattern above>'
python3 tools/gcsers/build_spec.py $R/spec.pdf        # AQA-8062-SP-2025.pdf
python3 tools/gcsers/inventory.py $R/records.json --sources $R/sources
```

Verification: `npm run validate` 0 errors, `npm test` 427 pass after the spec change.
