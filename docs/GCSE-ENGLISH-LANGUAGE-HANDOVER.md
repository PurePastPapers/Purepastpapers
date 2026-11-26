# GCSE English Language practice bank

AQA GCSE English Language 8700 contains 21 indexed papers and 85 scored questions.
Fifteen papers provide all 80 marks and six are partial. That gives 1,452 of
1,680 printed marks. Paper 1 and Paper 2 each have a complete public specimen
for exams from June 2026. The live historical papers keep their series-specific
questions and schemes. The subject uses raw marks.

| Series | Paper 1 available marks | Paper 2 available marks |
| --- | ---: | ---: |
| Official specimens for 2026 onward | 80 | 80 |
| November 2025 | 40 | 52 |
| June 2025 | 80 | 80 |
| November 2024 | 80 | 80 |
| June 2024 | 80 | 80 |
| November 2023 | 40 | Pending |
| June 2023 | 40 | 80 |
| November 2022 | 40 | 80 |
| June 2022 | 40 | 80 |
| November 2021 | 80 | 80 |
| Autumn 2020 | 80 | 80 |

The numbered question and mark-scheme links open the exact publisher PDF page.
Reading cards identify the relevant source, author and printed line range,
and link to continuous publisher-hosted extracts. Comparison cards link to
both complete extracts. Paper 1 Q5 links to the original choices and picture
as a single 40-mark question. Paper 2 Q5 also includes the printed writing
statement and task in the card. The revealed marking references distinguish
the AO5 and AO6 level grids. The downloadable question-only PDF carries
publisher links for required external resources.

The [source checkpoint](../data/imports/gcseenglang/source-checkpoint.json)
records source roles, hashes, versions, exclusions and archive leads. The
[review manifest](../data/imports/gcseenglang/reviewed-papers.json) pins the
physical PDF pages and subject-specific ranges used by the importer. The
examiner reports in the source inventory have no question-level display
mapping. The publicly redacted editions are the source of record. Older
mirror editions are unverified for publication. Summer 2026 live material,
the centre-only specimen sets and the Spoken Language endorsement are
outside this bank.

To reproduce, fetch the exact PDFs from the review manifest into a private
directory using the recorded filenames. Run the following commands from
the repository root.

```sh
python3 tools/gcseenglang/build.py /path/to/verified-pdfs
node --test tests/gcseenglang-bank.test.mjs tests/site-size.test.mjs
npm run validate
npm test
```

Run `PORT=5187 npm start` and
`node tools/browser-gcseenglang-bank.cjs` for the browser checks.

- [Paper 1 specimen](/#/paper/AQA_GCSE_ENGLANG_8700/AQA_8700_SPEC2026_P1)
- [Paper 2 specimen](/#/paper/AQA_GCSE_ENGLANG_8700/AQA_8700_SPEC2026_P2)
- [Question picker](/#/practice?subject=AQA_GCSE_ENGLANG_8700&mode=picker)
- [Build a Test](/#/practice?subject=AQA_GCSE_ENGLANG_8700&mode=timed_test)
