# OCR 05835 Cambridge Technical Extended Certificate in Business

This is a working release record for subject `OCR_L3_BUS_CTEC`, qualification
number 601/7699/4. The import started from main `eb707fec148e59e88c99e81abcbf1d754b697828`
on 25 November 2026, in the isolated branch `codex/ocr-05835-business-bank`.

## Qualification and source scope

OCR's Extended Certificate combination table lists mandatory externally assessed
Units 1 and 2, mandatory internally assessed Unit 4, and two optional 60-GLH units
from 3, 5, 8, 11, 16, 17, 19, 20 and 21. Only Unit 3 is externally assessed among
those options. The other options and Unit 4 are coursework references, never
scored exam items. Units 9, 10 and 15 and the Level 2 suite are outside this bank.

The public assessment page was read in the browser. It lists January 2021 and
January/June 2022–2025: 27 unit sittings, plus three official samples. June 2021
is not listed. January 2026/2027 pre-releases have no matching publicly listed
question paper/scheme and do not create attemptable papers. Modified-paper ZIPs
are accessibility variants, not additional canonical sittings.

`data/imports/ocrbusiness/sources.json` records 106 downloaded source PDFs:
publisher URLs, exact revisions, SHA-256, page counts, printed covers and roles.
The raw PDF cache is private and not committed. Ordinary HTTP requests returned
403/1010; browser downloads worked. The current assessment page is
https://www.ocr.org.uk/qualifications/cambridge-technicals/business/assessment/.
The older `business-level-3-2016-suite` URL returned a 404 in the browser.

## Source matching decisions

- June 2025 Unit 1 question-paper links 752991 and 758296 are byte-identical.
  752991 is canonical. The series is June, while its printed exam date is
  Tuesday 13 May 2025.
- The insert listed as 752992 is byte-identical to the actual June 2024 insert
  727262 and prints Tuesday 14 May 2024. It is rejected for June 2025. All 24
  pages of the 2025 question paper were inspected: the cover claims an embedded
  pre-release, but no research brief is present. Questions 21–25 require learner
  research, and their 20 marks remain blocked until the correct brief is supplied.
  Section C is the independent Peterdale Hospital/T-wing case, not the Section B
  research. Its survey tables and Q30 cash-flow tables remain separate contexts.

## Specification, history and grading

The official Unit → learning outcome → teaching-content tree contains 74 current
leaves: Unit 1 has 27, Unit 2 has 22 and optional Unit 3 has 25. The source PDFs,
version, source pages and complete teaching content are recorded. No textbook
edition or teaching-year sequence has been invented. Internal units remain
official references rather than exam leaves.

The old coarse point IDs have lookup-only legacy sections and semantic
`legacy_ids` migrations, preserving old saved attempts and learned ticks. The
official `point_order` contains only current leaves.

The Business registry uses `ocr_ctec_unit`. It has target labels D/M/P but no
generic percentage thresholds. Until exact unit-and-series boundaries are
verified, attempts display marks and percentage only. An individual unit does
not award D* or imply an overall qualification result. Other Level 3 subjects
retain their existing scheme.

## Build and verification

Reviewed manifests under `data/imports/ocrbusiness/reviews/` are reproducible
build inputs. The renderer checks source revisions and uses those exact crop,
scheme, context and rotation coordinates; it never regenerates inferred offsets.
Whole-question fallbacks are explicitly labelled. Reviews are model reviews,
not teacher reviews.

```sh
python tools/ocrbusiness/verify_sources.py --sources /path/to/private/sources
python tools/ocrbusiness/spec.py --help
python tools/ocrbusiness/migrate_spec.py
python tools/ocrbusiness/build.py --sources /path/to/private/sources --activate
python tools/assets/compact.py --slug ocrbusiness
npm test
npm run validate
node --test tests/site-size.test.mjs
# Run server and browser script within the same execution environment:
PORT=5183 npm start
node tools/browser-ocrbusiness-bank.cjs
```

## Release status

Import and browser verification are in progress. This checkpoint is not a claim
that all 30 paper manifests are reviewed or that production has changed. Final
counts, remaining source exclusions, test results, PR/SHA and Cloudflare
deployment evidence will be written here before completion.
