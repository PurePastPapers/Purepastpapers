# Pearson Edexcel GCSE Business 1BS0 question bank

The bank uses the existing `EDX_GCSE_BUS_1BS0` subject ID and the original 14 catalogue paper IDs. The six demo records retain their sample flags and saved-attempt lookups. The two official specimens use distinct IDs and the official-sample flag.

## Sources and coverage

[Source inventory](../data/imports/gcsebus/sources.json) records the Pearson catalogue status, official URLs, PDF checksums, cover logs and source booklet pages. [Coverage by component](../data/imports/gcsebus/coverage.json) records the exact practice omissions and available marks. [Reviewed specification mappings](../data/imports/gcsebus/reviews.json) retain the existing topic IDs and add two Appendix 2 quantitative skills. The mappings received model review.

| Series | Time | Paper 1 practice units | Paper 2 practice units |
| --- | ---: | ---: | ---: |
| June 2019 | 90 min | 27 | 24 |
| Autumn 2020 | 90 min | 27 | 26 |
| Autumn 2021 | 90 min | 26 | 26 |
| June 2022 | 90 min | 26 | 26 |
| June 2023 | 105 min | 25 | 24 |
| June 2024 | 105 min | 26 | 26 |
| June 2025 | 105 min | 26 | 24 |
| Official sample | 105 min | 28 | 27 |
| **Total** | | **211** | **203** |

The 14 live and two specimen papers reconcile to 434 printed units and 90 marks per paper. June 2026 is listed as secure by Pearson for both components. The revised-format 2021 teaching mocks reuse the 2021 live question set, and the revised-format 2022 mock assets are restricted. Accessibility-modified versions of live sittings and the full official reports are reached through the publisher's catalogue or PDF links.

## Question resources and marking

- Pearson permission for the question bank is recorded in [Maths rights](../data/imports/maths/rights.json) and described as board-wide in the [GCSE Geography handover](GCSE-GEOGRAPHY-HANDOVER.md). Separately credited illustrations are omitted where the case text supplies the examined facts. Case-source links give access to the full publisher pages. A part that requires separately credited numerical data remains accessible through the official paper and booklet. Twenty such parts are absent from Practice and its exports.
- The case studies, tables and figures are unscored resources. Shared resources do not group scored parts. Both alternatives of a Justify item appear in one question. Multiple-choice items use self-marking, with every printed option and selection instruction retained.
- June 2025 Paper 2 Q1(b) uses the wording on Pearson notice E78782A. Specimen Paper 2 Q5(a) is scored out of the single mark on the question paper, with a note explaining the scheme's printed discrepancy. June 2024 Paper 1 Q3(b) displays the Pearson scheme and flags the unrelated percentage printed in its row.
- June 2024 Paper 1 Q5(a) and Q5(b) share Table 2 and keep independent schemes. Q6(c) includes both choices and its 9-mark rubric. Q7(e) shows the Section C case, links the supplementary regional data and includes all indicative content and levels from the scheme.
- Indicative grade boundaries use the platform default. No component boundary has been imported. Examiner reports are linked from the verified paper records.

## Rebuild and verify

Run from the repository root with Python dependencies `PyMuPDF`, `Pillow` and `numpy`. The source cache is local and each document is checked against the stored SHA-256 before use. Physical PDF page offsets are one-based in the source inventory and zero-based in the extraction regions.

```sh
python3 tools/gcsebus/build.py --sources /tmp/ppp-business-sources
python3 tools/assets/compact.py --slug gcsebus
npm test
npm run validate
node --test tests/site-size.test.mjs
npm start
```

In a separate shell, run `node tools/browser-gcsebus-bank.cjs` with Playwright available. `AUDIT_URL` selects a deployed site or local server. [Source adjustments](../data/imports/gcsebus/corrections.json) are build inputs so the masks, linked-only resources and marking exceptions survive regeneration. The only shared pack-index edits are the Business entries.
