# OCR H151 Applied Science

Checked 25 November 2026; reconciled with main `f21bab2`. Subject ID remains
`OCR_L3_APPSCI_AAQ`, prefix `OCR_L3SCI`, ID stem `OCR_AAQSCI`.

## Release status

**Published and verified on 25 November 2026.** The owner confirmed OCR
Applied Science republication. [PR #65](https://github.com/PurePastPapers/Purepastpapers/pull/65)
merged as `72be554347841afb4455b7301c48bd8b50632cdb`. The matching Cloudflare
production deployment and GitHub build/deployment checks succeeded. Both
verified packs are enabled; source restrictions remain explicitly recorded.

The production Chromium audit passed, and ten served data, catalogue and code
files matched the merged source byte-for-byte. The machine-readable receipt is
[data/imports/appsci/release-evidence.json](../data/imports/appsci/release-evidence.json).

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

## Release and verification evidence

- Source inventory: 13 official OCR PDF sources, SHA-256 and page boundaries verified.
- Rebuilds: both sample packs and both image catalogues repeat byte-for-byte.
- Active full suite: **475 passed / 1 skipped / 0 failed** (476 total).
- Data validation: **0 errors / 69 warnings**. Of these, 67 predate this bank;
  two deliberately disclose that its available question marks are below the printed totals.
- Hosting limits: **4,527 static assets** including the release receipt; largest
  asset **10,400,789 bytes**, below the 25 MiB limit.
- Cloudflare preview for source head `0eba212cf3e23dd8706bf3750a9fe7002954b899`: success.
- Production merge `72be554347841afb4455b7301c48bd8b50632cdb`: Cloudflare success
  at **20:04:55 UTC**, GitHub build/deployment checks also succeeded.
- [Production Cloudflare build](https://dash.cloudflare.com/744e141b1e36314dce420ed6d18349d5/workers/services/view/purepastpapers/production/builds/67ffbc7b-5db2-4ac3-99ee-a88cc61a71af).

The active local bank and the real production site both passed the Chromium
workflow audit: sample grouping/detail, learned-only gating, exact-point and
crossover filtering, source/scheme reveal, saved marks, question-only PDF export,
custom 15-minute tests, timed reveal gates, marking and saved review, raw marks,
and the other Level 3 Applied Business route. Paper lists, both sample details,
individual practice, the test builder and review fit 320, 390 and 1440 pixels.
The live run used an isolated demo profile; no real student's progress changed.
These are automated Chromium checks, not physical-device or Safari verification.

The mobile sweep found and fixed two paper-detail overflows: resource-button
labels now wrap, and long question-list cards do not rotate at phone widths.
The existing signed-in browser fixture also waits for its mocked authentication
bootstrap before checking session state. No authentication behavior changed.

Review type throughout is **model**, not teacher review. The 49 scored units
appear as **48 practice cards** because the F181 graph-choice pair is linked;
F180 supplies 34 cards, F181 supplies 14 cards containing 15 scored units.
The one skipped existing test concerns browser image/HTML conversion in a
module worker; actual question-only PDF export passed locally and in production.

## Reproducible live links

- [Applied Science papers](https://purepastpapers.com/#/papers?subject=OCR_L3_APPSCI_AAQ)
- [F180 sample](https://purepastpapers.com/#/paper/OCR_L3_APPSCI_AAQ/OCR_F180_SAMPLE)
- [F181 sample](https://purepastpapers.com/#/paper/OCR_L3_APPSCI_AAQ/OCR_F181_SAMPLE)
- [Individual practice](https://purepastpapers.com/#/practice?subject=OCR_L3_APPSCI_AAQ&mode=individual)
- [F180 official data/formulae booklet](https://www.ocr.org.uk/Images/745348-fundamentals-of-science-data-formulae-and-relationships-booklet.pdf)

```sh
AUDIT_URL=https://purepastpapers.com node tools/browser-appsci-bank.cjs
```

Default browser mode verifies the real enabled bank. `APPSCI_PREVIEW=1` is only
for an isolated inactive-bank preview, never evidence of production activation.
