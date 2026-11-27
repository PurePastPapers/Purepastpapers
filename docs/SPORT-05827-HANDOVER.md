# OCR Level 3 Sport and Physical Activity (05827)

This bank follows the OCR Cambridge Technical Extended Certificate, QN 601/7094/3, 360 GLH. Unit 01 is a 70-mark paper lasting 90 minutes. Unit 03 is a 60-mark paper lasting 60 minutes. Unit 02 and the school's selected Units 08 and 17 are coursework. Units 04 and 21 fall outside this route. GCSE PE J587 has its own subject.

- [OCR unit and route tables](https://www.ocr.org.uk/qualifications/cambridge-technicals/sport-and-physical-activity/units/)
- [OCR public assessment index](https://www.ocr.org.uk/qualifications/cambridge-technicals/sport-and-physical-activity/assessment/)
- [Reach Free School sixth-form prospectus](https://www.reachfreeschool.co.uk/sixth-form-prospectus)

## Sources and exclusions

The inventory records the released January 2021, January and June 2022–25, and specimen pairs, with source roles, page ranges and hashes. The two specimens include the question paper and scheme in a single PDF. The site exposes that document through the mark-scheme link.

OCR's assessment index omits June 2021 and 2026 papers. Search results identified historical January 2020 Unit 01 and Unit 03 resources, but their direct OCR links now return 404 and were excluded. Historical acknowledgements document sittings before 2021 whose official paper and scheme bytes could not be verified.

The project owner confirmed permission to publish OCR-owned material for this bank. Per-item coverage lists separately credited or unresolved assets. January 2024 and June 2025 lack matching Cambridge Technicals acknowledgement booklets in the public index. Where an illustrated question required an asset with unresolved attribution, the paper's official links remain available and its online mark total reflects the available items. The Unit 03 specimen retains the printed Open Government Licence attribution for its DCMS excerpt.

- [Source and revision inventory](../data/imports/sport/source-inventory.json)
- [Paper coverage and excluded marks](../data/imports/sport/coverage.json)
- [OCR copyright acknowledgements](https://www.ocr.org.uk/qualifications/past-paper-finder/past-paper-policy/)

Examiner reports are provided as paper-level official PDF links where a matching report was verified. Report excerpts require their own verified question-level index records. Paper results use raw marks and percentages.

## Rebuilding

Fetch the official source files in the inventory to a local directory outside Git, retaining their URL filenames. The build checks the PDF hashes against the matching review. The reviewed geometry in `data/imports/sport/reviews` is the authoritative input. Scheme table extraction is an aid for review and includes logic for page continuations, shared number cells and separately laid out levels rubrics.

```sh
python tools/sport/build.py /path/to/verified-sport-pdfs
python tools/assets/compact.py --slug sport
npm test
npm run validate
node --test tests/site-size.test.mjs
node tools/browser-sport-bank.cjs
```

Install PyMuPDF and Pillow for the build. Run the browser check against a running local server or set `AUDIT_URL` for a served deployment.

The reviewed pack IDs follow `OCR_05827_<sitting>_U01` and `OCR_05827_<sitting>_U03`. Keep them stable for saved attempts. The build replaces Sport rows in the pack index by subject ID. It keeps the legacy demo IDs available to existing records. Report and rights exclusions can be updated independently of unaffected questions. A paper with excluded marks stays available for individual Practice and uses the verified subset in Build a Test.

## Browser fixtures

- June 2025 Unit 01 Q15(a) has a cardiovascular flowchart whose labels and arrows belong to the scored part.
- June 2025 Unit 03 Q2(c) has a three-page marking rubric on PDF pages 15–17. Q4(e)(ii) uses the final scored scheme row on PDF page 21.
- Unit 01 specimen Q18(b) uses the candidate's placement in Q18(a). Unit 03 June 2024 Q1(d)(ii) uses the NGB named in Q1(d)(i).
- The paper and builder never offer Units 02, 04, 08, 17 or 21 as 05827 exam components.
