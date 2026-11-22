# AQA GCSE English Language 8700 question bank: handover

Subject `AQA_GCSE_ENGLANG_8700`. Pipeline `tools/gcseenglang/` (shared fetch/page parser in `tools/aqa/`), modelled on the
GCSE Geography and A-level English Literature imports. Tags and difficulty are **model reviews**
(`reviewer_type: model`), not teacher reviews.

## Status (22 November 2026)

**Built and tested; deliberately NOT listed in `data/packs/index.json` (not live).** Reason: the site is at the 1 GB GitHub Pages
budget (`tests/site-size.test.mjs`: 997 MB before this import, 1.015 GB after, even after `tools/assets/compact.py`). The lazy image catalogues
(`data/gcseenglang-assets/`, 24 MB, git-ignored) are rebuilt by `finalize.py --activate`. **Owner decision needed:** host catalogues outside Pages
(the repo has `wrangler.jsonc`), or free space, before activating this or any further subject.

| Group | Booklets | Questions | Scored units | Excluded (copyright removed) | Marks published / available |
| --- | --- | --- | --- | --- | --- |
| Exams + samples, Papers 1 and 2 | 21 | 105 | 87 | 21 | 1468 / 1680 |

Difficulty: 19 easy, 32 medium, 36 hard (basis recorded per unit; extra hard unused). Examiner reports linked for 19 booklets (the two 2026
samples have none). Every booklet reconciles: published + excluded marks = 80.

Sources: `data/imports/gcseenglang/inventory/8700-inventory.json` (SHA256, publisher SHA-1, URL, series, cover-printed series). 21 booklets:
November 2020, November 2021, June 2022 to November 2025 and the 2026 sample set 1. All checked against AQA's published SHA-1.

## Not imported / caveats (all recorded in `coverage.json`)

- **Paper 2 November 2023**: AQA lists its mark scheme and examiner report but no question paper or insert. Not importable.
- **No 8700 papers before November 2020** are on AQA's public page (2017 to 2019 not public). June 2026 papers are not yet listed.
- **"November 2020" and "November 2021" files print June 2020 / June 2021 dates** on their covers and schemes (the cancelled summer series). AQA's listing label is kept; `printed_series` is stored.
- **21 questions excluded** because AQA removed the source text (`-CR` files): Paper 1 June 2022, November 2022 (source A and Q2 extract), June 2023 (Q5 picture only: kept, flagged), November 2023, November 2025; Paper 2 June 2023 (Source B), November 2025 (Source A). Paper 1 Q2 survives a removed insert only when its own extract is printed in the paper.
- CR question papers have no cover page: 80 marks / 105 minutes are taken from the specification (flagged `max_marks_basis`) and the tariffs still sum to 80.
- 2026 sample Paper 1 Question 1 is four 1-mark multiple choice parts: four units, shared stem as unscored context, the whole-question scheme shown for each.
- **Rights (assumption, owner to confirm):** carried over from the AQA Geography note (owner, 16 November 2026, board-wide AQA permission). Not separately confirmed for English Language.
- Spoken language is non-exam assessment: not a written question, not imported.

## Units and tags

One scored unit per printed question; each reading question carries the cited source (Source A / Source B pages from the insert) as unscored context
(`context.figures[].source = "insert"`). English Language has no topic content, so spec leaves are the question types (`data/specs/AQA_GCSE_ENGLANG_8700.json`, built from
Version 1.6 March 2026, SHA256 `5b734aae…83db3`; ids unchanged). Primary tag = the question's printed type; Q4 evaluation lists language/structure as prerequisites. No tiers, AS or content year.

## Reproduce

```sh
R=../gcseenglang-research   # kept outside git
curl -A "Mozilla/5.0" -L -o $R/page.html https://www.aqa.org.uk/subjects/english/gcse/english-8700/assessment-resources
python3 tools/aqa/resources.py $R/page.html > $R/records.json
python3 tools/aqa/fetch.py $R/records.json --dest $R/sources --keep '^AQA-8700(1|2)-(QP|MS|W-MS|INS|WRE)|^AQA-8700-[12]-S(QP|MS|INS)|^AQA-87002-S(QP|MS|INS)'
python3 tools/gcseenglang/build_spec.py $R/spec.pdf        # AQA-8700-SP-2015-v1.6.PDF
python3 tools/gcseenglang/inventory.py $R/records.json --sources $R/sources
python3 tools/gcseenglang/extract.py --research $R
python3 tools/gcseenglang/reviews.py draft $R   # then edit $R/review-src/*.txt; do not re-run draft over edited sheets
python3 tools/gcseenglang/reviews.py compile $R
python3 tools/gcseenglang/build.py --research $R
python3 tools/gcseenglang/finalize.py --research $R [--activate]   # --activate lists packs in the index: only after the size decision
python3 tools/assets/compact.py --slug gcseenglang
node --test tests/gcseenglang-bank.test.mjs
```

Raw crops go to `assets/gcseenglang/` (git-ignored). `$R/sources` must hold the fetched PDFs (symlink `sources`).

## Verification done / not done

Done: extraction exceptions 0 on all 21 booklets; build 21/21; `npm run validate` 0 errors; `npm test` 427 pass; crops inspected for a question with a picture,
a retrieval question, a two-source question, a scheme page and a full source. Not done: production browser test, the isolated-profile browser matrix
(`tools/browser-*.cjs` has no English Language script yet), phone/tablet/desktop width checks, and live deployment comparison. Packs are not live.

## Next action

1. Owner decides image hosting / site size. 2. Then `finalize.py --activate`, add `tools/browser-gcseenglang-bank.cjs` (copy `browser-gcsegeog-bank.cjs`), run it at 320/390/768/1440.
3. Optional: teacher review of difficulty; June 2026 papers when AQA lists them.
