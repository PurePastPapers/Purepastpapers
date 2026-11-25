# OCR H151 Applied Science

Checked 25 November 2026; reconciled with main `f21bab2`. Subject ID remains
`OCR_L3_APPSCI_AAQ`, prefix `OCR_L3SCI`, ID stem `OCR_AAQSCI`.

## Release status

The owner explicitly confirmed on 25 November 2026 that OCR Applied Science
republication is covered. Both verified packs are enabled on branch
`codex/ocr-h151-applied-science-bank`. Public PR, CI and production deployment
verification are in progress; this checkpoint does not yet claim a live release.

Even with OCR confirmation, third-party or withheld material stays excluded.
These are partial sample banks, not complete live papers. Their printed totals
and durations are retained; available practice marks are shown separately.
Complete-paper sitting is disabled for a partial bank. Students can use its
independent questions, custom tests, marking, review and question-only export.

## Source and qualification scope

The current specification is version 8.0 (October 2026). Its change log and
F180 mass-attenuation density unit correction (`g cm⁻³`) were checked without
rewriting historical paper pixels. No textbook sequence was supplied: topic
navigation follows the official specification.

H151 Extended Certificate comprises F180 and F181 external exams, mandatory
F182 NEA and two options from F183–F186. The school's current
[2026/27 prospectus](https://www.reachfreeschool.co.uk/sixth-form-prospectus)
was checked and confirms F183 Analytical techniques in chemistry and F185
Forensic biology as its two options. F184 Environmental studies
and F186 Medical physics remain general qualification references, outside the
school route. H051 Certificate comprises F180 and F182 only. F180 is shared
once, with both eligibility codes; F181 is H151 only. NEA samples do not enter
the scored question pool.

The public OCR assessment page listed two official samples, annotated teacher
resources, an F180 data/formulae booklet, NEA samples and the F181 January 2026
pre-release. No live question papers, matching live schemes or examiner reports
were listed. Absence from the public page is recorded as missing, not evidence
that an assessment did not take place or that secure files were accessed.

| Unit / source | Printed marks | Available marks | Blocking material |
| --- | ---: | ---: | --- |
| F180 official sample | 70 | 65 | Q11(a)(i–ii), 5 marks: separately credited Getty image; magnification also depends on original print size |
| F181 official sample | 50 | 33 | Seven source-dependent parts, 17 marks: exact Source A extract rights unconfirmed and Source B withheld |
| F181 January 2026 | — | 0 | Pre-release alone; matching paper and scheme not found publicly |
| F182–F186 | NEA | 0 | Reference assignments; excluded from scored exams |

| Series / unit | Verified PDF sources | Prepared packs | Indexed papers | Scored units |
| --- | ---: | ---: | ---: | ---: |
| Official sample F180 (including booklet and annotated reference) | 3 | 1 | 1 | 34 |
| Official sample F181 (including annotated reference) | 2 | 1 | 1 | 15 |
| January 2026 F181 pre-release control | 1 | 0 | 0 | 0 |
| F182–F186 NEA references | 5 | 0 | 0 | 0 |
| Shared specification and separate January boundaries | 2 | 0 | 0 | 0 |
| Total | 13 | 2 | 2 | 49 |

There are zero paper-only records and no verified public material queued for
extraction. Nine original parts, worth 22 marks, remain blocked. F180 has 39
printed tariff occurrences and F181 has 22; three F180 dependencies combine
six printed parts into three scored units. The 49 available scoring units
therefore cover 52 available printed parts. The sole F181 answer dependency is
linked at runtime rather than double-counted as an independent question.

F180's four source sections reconcile to Biology 20, Chemistry 20, Physics 20,
Practicals 10. F181's source sections reconcile to 27 + 23 = 50. Five independent
Section A parts supply 10 available marks; all Section B supplies 23. The public
Source B page explicitly withholds its article. The current original Science
News article differs from the adapted Source A (including wording relevant to
peer-review suitability), so it is not silently substituted. Q4's complete
levels/indicative/guidance scheme boundaries are recorded for private review;
Q4 is not attemptable without its required sources.

## Document separation and display

All page references below are 1-indexed PDF pages, not printed booklet numbers.

| Source bundle | Student booklet | Canonical scheme | Other bundled material |
| --- | --- | --- | --- |
| F180 sample, 39 pages | 1–20; scored questions end on 16; blank pages 17–19; acknowledgements 20 | 21–33 | Data booklet 34–39 |
| F181 sample, 27 pages | 1–12; last scored task ends on 11 | 13–22 | Specimen pre-release 23–27; A on 24–25; withheld B on 26 |

Student links never present these mixed bundles as question-only PDFs. Practice
uses only the reviewed question regions; schemes remain behind reveal controls.
Question exports draw permitted question/context crops, not scheme regions.
The standalone F180 booklet is linked separately and checked against the
bundled version. Annotated samples are inventory references only, never the
canonical student question or scheme.

Raw exam marks are not converted with PPP's generic Level 3 grade scale.
`grade_policy: raw_marks_only` suppresses generic grades and grade targets;
future verified series-specific boundaries must remain separate.
January 2026 raw/UMS unit boundaries are recorded separately in
`data/imports/appsci/series-boundaries.json`; they are never attached to either
sample or used as a substitute for a matching live question paper or scheme.

## Data and reproduction

| Path | Purpose |
| --- | --- |
| `data/imports/appsci/source-inventory.json` | Official URLs, checksums, identities, revisions, pages, source roles, missing/restricted records |
| `data/imports/appsci/coverage.json` | Prepared/indexed counts, marks, blockers, source controls |
| `data/imports/appsci/rights.json` | Publication decision and excluded third-party scope |
| `data/packs/appsci/` | Source-backed sample questions and paper metadata |
| `data/appsci-assets/` | Lossless WebP catalogues; no original source PDFs |
| `tools/appsci/` | Verified source-specific build coordinates and review inputs |
| `tools/browser-appsci-bank.cjs` | Isolated browser workflow checks, including preview mode |

Supply the unmodified official PDFs outside the repository. Builders verify
their SHA-256 before applying the stored page coordinates. Rebuild each paper
twice and compare catalogue hashes. Do not regenerate other subjects or run a
global seed rebuild to integrate this bank. Legacy placeholder learned ticks
expand through two keyed aliases in `js/config/spec-id-migrations.js`.

```sh
python3 tools/appsci/f181_build.py /private/sources/697860-science-in-society.pdf
python3 tools/appsci/f180-build.py /private/sources/697859-fundamentals-of-science.pdf
python3 tools/appsci/finalize.py --activate
PORT=5183 node tools/serve.mjs
AUDIT_URL=http://localhost:5183 APPSCI_PREVIEW=1 node tools/browser-appsci-bank.cjs
npm test
npm run validate
BASE=http://localhost:5183 node tools/browser-paper-labels.cjs
node --test tests/site-size.test.mjs
```

The finaliser stages disabled entries by default. `--activate` requires
`rights.json` to record owner confirmation. Preview mode may enable only these
entries within the isolated browser context to exercise the prepared bank; it
does not publish the bank.

## Remaining release requirements

1. Owner confirmation is recorded; keep third-party blocks.
2. Complete verification results below, fetch main and reconcile the keyed
   records with concurrent Applied Business work. Re-test the combined state.
3. Push the reviewed branch, open and merge the PR through the normal workflow.
4. Match passing CI and the Cloudflare production deploy to the merged SHA.
5. Verify representative sample paper, question, booklet and revealed scheme
   links on `https://purepastpapers.com`. Record evidence before calling it live.

## Verification results

Review type is **model**, not teacher review. Both sample builders produced
byte-identical pack and catalogue hashes on repeat runs. Source provenance
validation passed against the downloaded PDFs. The focused bank regressions
validate the prepared (disabled) packs directly, including source controls,
schema, image checksums and designated fixtures.

Before reconciliation, `npm test` passed 469 tests, skipped one, and failed
none. `npm run validate` reported zero errors and 67 pre-existing warnings in
other banks. The paper-label browser audit passed. Hosting limits passed:
4,522 static assets; largest asset 10,400,789 bytes, below 25 MiB.

After reconciliation with `f21bab2`, the final `npm test` run passed **473**,
skipped **1**, and failed **0** (474 total). An existing signed-in browser
fixture was made deterministic by waiting for its mocked authentication to
finish before asserting signed-in state. No authentication behavior changed.
The focused bank, grading and session regressions passed **21/21**.
`npm run validate` still reports **0 errors / 67 existing warnings** with the
prepared bank disabled; the new sample records also pass direct schema checks.
The updated size check counts **4,526 assets**, with the same largest asset.
Both packs and both catalogues were rebuilt again by the lead and remained
byte-identical. The pending-rights activation guard was checked: it rejects
activation without changing the pack index.

The Applied Science Chromium audit passed in an isolated preview: sample
grouping, paper details, learned-only gating, exact-point and crossover
filtering, question/scheme reveal, saved marks, question-only PDF export,
custom 15-minute test, timed reveal gate, marking and saved review, raw-mark
grading, and the other Level 3 Applied Business Practice route. The final
responsive sweep also checks paper lists, both sample details, individual
practice, the test builder and saved review at 320, 390 and 1440 pixels.
These are automated Chromium checks, not a claim of testing physical devices
or Safari. No production link has been verified for this unpublished branch.
The expanded mobile sweep found and fixed two real paper-detail overflows:
long resource-button labels now wrap, and the long question-list card is not
rotated at phone widths. The complete expanded browser script then passed.
