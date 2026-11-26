# AQA GCSE Psychology 8182 import checkpoint

26 November 2026. Starting `main` SHA `aeab12951c58b6a6492fc45ba2d9b44c6e56d271`.

## Repository baseline

- `data/papers/AQA_GCSE_PSYCH_8182.json` has six questions attached to a single original demo and 14 real-paper placeholders for the seven listed sittings. All 14 have empty `question_ids` and null paper and scheme PDF URLs. The demo's own note identifies it as original material. There are no official specimen rows at this revision.
- Preserve the existing demo IDs and the live catalogue IDs, including `AQA_8182_2020_AUTUMN_P1` and its counterparts. Use the cover to establish the displayed sitting.
- `data/specs/AQA_GCSE_PSYCH_8182.json` has all eight topic headings and coarse point IDs. Preserve existing IDs and learned progress if adding finer points under the official specification.
- The existing coordinate extraction and scheme matching in `tools/psychology/` target 7181 and 7182. Check a real 8182 question paper and scheme against their geometry before reusing those functions. Keep GCSE imports, manifests, assets and registrations scoped to 8182.

## Source candidates

The public [past-paper listing](https://www.savemyexams.com/gcse/psychology/aqa/past-papers/) links both components of June 2019, November 2020 and 2021, June 2022–2025 and the specimens. Its 2020 display says June, while the linked AQA files use the November directory and suffix. Match using printed cover and footer codes. The board lists [9 July 2027](https://www.aqa.org.uk/exams-administration/exams/whats-available-when) as the public release date for the 2026 summer series.

Thirty PDF files downloaded before the workspace disconnected. This checklist records their download status only. Digests, page counts, printed identities, revision and asset-specific rights were not persisted. Use the candidate URLs to recover the files outside Git, validate the exact role from the PDF and record those fields. The 2024 files use hashed AQA CDN URLs. Confirm roles from the printed covers. The AQA 2024 short file URL tried for Paper 1's scheme returned HTTP 404. Check the Paper 1 specimen's copyright-redacted version for missing stimulus before making its questions attemptable. As part of a fresh official inventory, check separately credited assets, inserts, modified papers, additional specimen variants and older examiner reports.

| Sitting | Component | Asset | Source | Status |
| --- | --- | --- | --- | --- |
| June 2019 | 8182/1 | Mark scheme | [PDF](https://pastpapers.co/aqa/GCSE/Psychology-8182/AQA-81821-W-MS-JUN19.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 (mirror) |
| June 2019 | 8182/1 | Question paper | [PDF](https://pastpapers.co/aqa/GCSE/Psychology-8182/AQA-81821-QP-JUN19.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 (mirror) |
| June 2019 | 8182/2 | Mark scheme | [PDF](https://pastpapers.co/aqa/GCSE/Psychology-8182/AQA-81822-W-MS-JUN19.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 (mirror) |
| June 2019 | 8182/2 | Question paper | [PDF](https://pastpapers.co/aqa/GCSE/Psychology-8182/AQA-81822-QP-JUN19.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 (mirror) |
| June 2022 | 8182/1 | Examiner report | [PDF](https://www.aqa.org.uk/files/sample-papers-and-mark-schemes.2022.june.AQA-81821-WRE-JUN22_PDF/bd90ccee12a602dc91080bde0351ab92d311a0ca.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2022 | 8182/1 | Mark scheme | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2022/june/AQA-81821-MS-JUN22.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2022 | 8182/1 | Question paper | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2022/june/AQA-81821-QP-JUN22.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2022 | 8182/2 | Examiner report | [PDF](https://www.aqa.org.uk/files/sample-papers-and-mark-schemes.2022.june.AQA-81822-WRE-JUN22_PDF/a82aa9837e2451f4cd25048e8c2fd41d0d89cd9d.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2022 | 8182/2 | Mark scheme | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2022/june/AQA-81822-MS-JUN22.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2022 | 8182/2 | Question paper | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2022/june/AQA-81822-QP-JUN22.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2023 | 8182/1 | Examiner report | [PDF](https://www.aqa.org.uk/files/sample-papers-and-mark-schemes.2023.june.AQA-81821-WRE-JUN23_PDF/322632b295165546df4a47a7f4596c7a4e8cfb68.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2023 | 8182/1 | Mark scheme | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2023/june/AQA-81821-MS-JUN23.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2023 | 8182/1 | Question paper | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2023/june/AQA-81821-QP-JUN23.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2023 | 8182/2 | Examiner report | [PDF](https://www.aqa.org.uk/files/sample-papers-and-mark-schemes.2023.june.AQA-81822-WRE-JUN23_PDF/b35fa51bd5360069618164f91b9505125610ec20.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2023 | 8182/2 | Mark scheme | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2023/june/AQA-81822-MS-JUN23.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2023 | 8182/2 | Question paper | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2023/june/AQA-81822-QP-JUN23.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2024 | 8182/1 | Examiner report | [PDF](https://www.aqa.org.uk/files/sample-papers-and-mark-schemes.2024.June.AQA-81821-WRE-JUN24_PDF/82f4388e1282f9668b6b2db300ba4c91220379aa.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2024 | 8182/1 | Question paper or mark scheme (confirm role from cover) | [PDF](https://cdn.sanity.io/files/p28bar15/green/0b3793d95b8a449f32de604795e53574226756ec.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2024 | 8182/1 | Question paper or mark scheme (confirm role from cover) | [PDF](https://cdn.sanity.io/files/p28bar15/green/5afe525ed1719ccc6ef9a8005466f1e85efb21bc.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2024 | 8182/2 | Examiner report | [PDF](https://www.aqa.org.uk/files/sample-papers-and-mark-schemes.2024.June.AQA-81822-WRE-JUN24_PDF/40ee567fc9bf4431bef859008ded62bc308ce796.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2024 | 8182/2 | Question paper or mark scheme (confirm role from cover) | [PDF](https://cdn.sanity.io/files/p28bar15/green/bc47358831781e319ea7481530db64dff43a2967.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2024 | 8182/2 | Question paper or mark scheme (confirm role from cover) | [PDF](https://cdn.sanity.io/files/p28bar15/green/f3faf781eb364c02e1fe75727f67d9ab4588ac28.pdf) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| June 2025 | 8182/1 | Examiner report | [PDF](https://www.aqa.org.uk/files/2vT3LmcUzNO62qpl9Ih6GB/7bc744c10df8c517162ef724100d399746313afe.pdf) | Candidate; download and verify |
| June 2025 | 8182/1 | Mark scheme | [PDF](https://www.aqa.org.uk/files/2vT3LmcUzNO62qpl9IgBf3/ccbce60782e216a0aff69fdf49f63623045bdde0.pdf) | Candidate; download and verify |
| June 2025 | 8182/1 | Question paper | [PDF](https://www.aqa.org.uk/files/cRIpdimsSKiybuSFvPjeBa/456f603f95c5cdb4b6915bbc07adce0b0a6f4dab.pdf) | Candidate; download and verify |
| June 2025 | 8182/2 | Examiner report | [PDF](https://www.aqa.org.uk/files/55v24uHVnfkxoQpTQvnebH/3f6fed727dbc5aaed6b0c59d3fde780cadfba602.pdf) | Candidate; download and verify |
| June 2025 | 8182/2 | Mark scheme | [PDF](https://www.aqa.org.uk/files/cRIpdimsSKiybuSFvPjuvy/2b1f3d9b1ce7f3a6f49a36297f0d61eec5c6295d.pdf) | Candidate; download and verify |
| June 2025 | 8182/2 | Question paper | [PDF](https://www.aqa.org.uk/files/2vT3LmcUzNO62qpl9Ihf2z/0f5bbf629947b47268126f114b18b8b9a3300168.pdf) | Candidate; download and verify |
| November 2020 | 8182/1 | Mark scheme | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2020/november/AQA-81821-W-MS-NOV20.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| November 2020 | 8182/1 | Question paper | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2020/november/AQA-81821-QP-NOV20.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| November 2020 | 8182/2 | Mark scheme | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2020/november/AQA-81822-W-MS-NOV20.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| November 2020 | 8182/2 | Question paper | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2020/november/AQA-81822-QP-NOV20.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| November 2021 | 8182/1 | Mark scheme | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2021/november/AQA-81821-MS-NOV21.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| November 2021 | 8182/1 | Question paper | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2021/november/AQA-81821-QP-NOV21.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| November 2021 | 8182/2 | Mark scheme | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2021/november/AQA-81822-MS-NOV21.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| November 2021 | 8182/2 | Question paper | [PDF](https://filestore.aqa.org.uk/sample-papers-and-mark-schemes/2021/november/AQA-81822-QP-NOV21.PDF) | PDF downloaded; confirm printed identity, restrictions and SHA-256 |
| Specimen | 8182/1 | Mark scheme | [PDF](https://filestore.aqa.org.uk/resources/psychology/AQA-81821-SMS.PDF) | Candidate; download and verify |
| Specimen | 8182/1 | Question paper | [PDF](https://filestore.aqa.org.uk/resources/psychology/AQA-81821-SQP-CR.PDF) | Candidate; download and verify |
| Specimen | 8182/2 | Mark scheme | [PDF](https://filestore.aqa.org.uk/resources/psychology/AQA-81822-SMS.PDF) | Candidate; download and verify |
| Specimen | 8182/2 | Question paper | [PDF](https://filestore.aqa.org.uk/resources/psychology/AQA-81822-SQP.PDF) | Candidate; download and verify |

## Work pending

There are no generated packs or crop and scheme reviews at this checkpoint. Establish matching question and scheme anchors on one component first, verify the cross-page context and final scheme boundaries, and reconcile 100 printed marks. Apply the same verification to the other component and the other available sittings. Review exact specification tagging and explicit previous-answer dependencies separately. Integrate packs by subject key using the latest base, then run data, site-size and student-flow checks before deployment. The execution environment went offline before any bank, browser or production checks could run.
