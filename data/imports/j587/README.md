# OCR GCSE Physical Education J587 import checkpoint

The catalogue at `aeab12951c58b6a6492fc45ba2d9b44c6e56d271` contains 16 standard paper records and a six-question original demo. The standard paper records have empty question lists. This checkpoint verifies public source identities and records the references needed for extraction. Available official practice marks and indexed scored parts are both zero. The branch has no student-facing data changes.

[Source inventory](source-inventory.json)

| Sitting | Written papers | Source status |
| --- | ---: | --- |
| June 2025, 2024, 2023 and 2022 | 8 | OCR lists each standard paper, scheme and report. The printed covers were checked. |
| November 2021 | 2 | OCR lists both papers and schemes. The covers were checked. Written reports remain unconfirmed. |
| November 2020, June 2019 and June 2018 | 6 | Archived OCR papers and schemes have matching printed covers. Archive report listings still need PDF verification. |
| Official specimens | 2 | OCR publishes combined question-and-scheme PDFs. The two role ranges and printed question-paper revisions are recorded. |

Each standard paper and specimen is 60 marks and 60 minutes. These are the printed totals. June 2020 and June 2021 were cancelled. Several live PDFs carry stale internal document titles, and a June-series paper may have a May exam date. Use the printed cover and the matching scheme's series. November 2020 currently has no verified component-boundary source for this import, so use raw marks. For the seven other live series the manifest records the two specific OCR *notional component* rows. Specimens use raw marks.

## Source checks on resumption

Use a workspace with PyMuPDF and a PDF cache outside the checkout. Run the download and provenance check for June 2025 /01 first, then across the verified sources.

```sh
j587_cache="$(mktemp -d)"
python3 tools/j587/check_sources.py --cache-dir "$j587_cache" --paper OCR_J587_2025_JUNE_P1
python3 tools/j587/check_sources.py --cache-dir "$j587_cache" > "$j587_cache/provenance.json"
```

The checker compares printed cover identities and PDF page counts, validates the bundled specimens' scheme covers, and outputs SHA-256 and byte lengths. This execution environment became unavailable before the checker could be run against local PDFs. The references in the inventory were verified via the public PDF render service. The checkout, local byte hashes, crop and scheme geometry, tests and release gates remain outstanding.

Inspect the ZIPs for distinct modified papers. Compare each candidate with its standard sibling before adding it. If the question or assessment differs, check the applicable scheme and create a distinct variant identity. Confirm archive report covers and report-to-question mappings before linking any comments. OCR lists June 2026 for public release in early August 2027 under its normal schedule. Practical performance and Analysing and Evaluating Performance are NEA references. Keep them outside the written question pool and outside Cambridge Technical Sport.

The owner confirmed clearance for OCR-owned material. Audit the third-party flags in the inventory against the actual pages. The /01 specimen has four stock-image credits. The 2023 /01, 2019 /01 and /02, and 2018 /02 credits name specific items. The 2020 /01 credit appeared in a June acknowledgements booklet and needs comparison against the actual November paper. Keep affected assets as official source references where separate permission is absent. Exclude a scored unit when its required stimulus cannot be served. This leaves unrelated verified units eligible for practice.

## First-paper acceptance fixtures

Page numbers below are one-based PDF pages. Validate the sources against the crops and exact scheme rows during import.

| Paper | Item | Question PDF | Scheme PDF | Expected result |
| --- | --- | --- | --- | --- |
| June 2025 /01 | Q1(a), Q1(b) | 2 | 8 | Preserve the shared three-plane diagram and labels. The two part schemes are 3 and 2 marks respectively. The second part can be attempted directly from the diagram and has no scored prerequisite. |
| June 2025 /01 | Q12 | 6 | Verify the Q12 row | Keep both cardiac-output and stroke-volume units and the four options. The source uses a one-mark selected response. |
| June 2025 /01 | Q23(c) | 13 | 20–21 | Final item. Preserve the named sport prompt and the /01 six-mark levels, discriminators and indicative content. PDF page 14 carries answer space only. |
| June 2025 /02 | Q21(c) | 6 | 13 | Retain the long-jump scenario, three technique/explanation pairs and the condition for awarding associated explanation marks. This is point-marked out of six. |
| June 2025 /02 | Q22(b) | Verify the Q22(b) row | 14 | The source scheme's introductory wording says two marks, while its Marks column and listed responses indicate three. Confirm the paper tariff and preserve the published scheme guidance without silently changing it. |
| June 2025 /02 | Q23(c) | 9 | 16–17 | Final item. Keep the full levels rubric and indicative content, including both diet comparison and physical warm-up benefits. |

Reuse the verified OCR bank infrastructure and the existing J587 IDs. Tag the actual assessed points, including any cross-component content in a synoptic task, while retaining the printed paper component. Build one representative paper through Papers, Practice, Build a Test and marking before batching the remaining records. Compare printed and available marks for each paper, check geometry and scheme boundaries, rebuild the accepted assets, then run the requested full suite, site-size and desktop/phone checks on updated main before merging and deploying. This draft is the checkpoint for resuming that work.
