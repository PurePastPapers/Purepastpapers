# OCR IT: Data Analytics question bank

The bank uses OCR Cambridge Advanced National in IT: Data Analytics. F200 is shared by Certificate H019 and Extended Certificate H119. H019 also requires the F202 coursework. H119 requires F200, F201, F202 and two options from F203–F206. The Reach Free School prospectus lists Pearson V Level Digital Systems and Data as a separate qualification. The existing PPP subject ID and school enrolments are retained.

## Coverage on 26 November 2026

| Source | Route | Scored parts | Raw marks available | Duration |
| --- | --- | ---: | ---: | ---: |
| F200 specimen v2.0 (June 2024) | H019 and H119 | 26 | 60 of 60 | 75 min |
| F201 specimen v3.0 (November 2024) | H119 | 23 | 60 of 60 | 90 min |
| January 2026 F200 and F201 | By unit | 0 | Public sources pending | — |
| June 2026 F200 and F201 | By unit | 0 | Public sources pending | — |
| F202–F206 coursework and two annotated teacher specimens | By unit | 0 | Reference links | — |

The public assessment page listed only specimens. The January and June 2026 papers were timetabled, with expected public publication in early March and early August 2027 respectively under OCR’s publication schedule. No public live question paper, matching scheme or examiner report was verified. Specimen marks are raw. The site displays no inferred grade or UMS conversion.

- [OCR assessment page](https://www.ocr.org.uk/qualifications/alternative-academic-qualifications/it-data-analytics-level-3-h019-h119/assessment/)
- [OCR specification v6.0, October 2026](https://www.ocr.org.uk/Images/697580-specification-cambridge-advanced-national-in-it-data-analytics.pdf)
- [OCR past paper publication schedule](https://www.ocr.org.uk/qualifications/past-paper-finder/past-paper-schedule/)
- [The Reach Free School prospectus](https://www.reachfreeschool.co.uk/sixth-form-prospectus)
- [Source inventory and PDF page mapping](../data/imports/itbank/source-inventory.json)

## Rebuild and review

Download the two pinned canonical source composites into a private directory as `f200.pdf` and `f201.pdf`. The builder checks their SHA-256, cover timings, ordered printed marks and exact scheme labels before generating the packs. It splits the public PDF fallbacks at the original question-paper/mark-scheme boundary. `regions.json` records source-reviewed question, context and scheme rectangles, exact answer dependencies, and model-reviewed specification tags. OCR's source text and data graphics are rendered as source crops. Standalone answer lines are generally removed because PPP supplies an answer box. Blanks integral to a table, sequence or sentence remain inside the crop. Existing unit-wide learned ticks expand to the 43 official specification headings across both external units.

```sh
python tools/itbank/build.py /private/path/to/ocr-sources
python tools/assets/compact.py --slug itbank
node tools/itbank/catalogue.mjs
node --test tests/it-bank.test.mjs tests/site-size.test.mjs
npm run validate
npm test
```

Run `AUDIT_URL=http://localhost:5173 node tools/browser-it-bank.cjs` against `npm start` with Playwright and Chromium installed. The automated package checks cover marks, qualification eligibility, asset references and checksums across all scored parts. Representative model visual comparisons cover the two specimen tables, the data lifecycle graphic, multipart questions, multi-page schemes, and final-question boundaries.

[Paper catalogue](https://purepastpapers.com/#/papers?subject=OCR_L3_IT_AAQ) · [F200](https://purepastpapers.com/#/paper/OCR_L3_IT_AAQ/OCR_F200_SAMPLE) · [F201](https://purepastpapers.com/#/paper/OCR_L3_IT_AAQ/OCR_F201_SAMPLE)
