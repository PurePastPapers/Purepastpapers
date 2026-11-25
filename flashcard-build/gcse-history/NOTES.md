# GCSE OCR History B J411 build notes

Scope: OCR J411 routes named in the project brief: Crime and Punishment c.1250-present; Norman Conquest 1065-1087; Viking Expansion c.750-c.1050; Living under Nazi Rule 1933-1945; History Around Us at Verulamium. The repo spec defines 23 leaves.

## Draft files

- `source/exam.txt`: 92 exam knowledge cards across all 23 leaves.
- `source/background.txt`: 46 context cards across all 23 leaves.
- `source/mark.txt`: 6 exam technique prompts, including J411/21 site analysis and J411/33 response methods.
- `draft-sources.tsv`: generated stable keys, source links, and verification status. It is intentionally conservative: general historical facts remain `no` until an independent card-level reviewer confirms them. Verulamium museum-backed facts and the technique prompts have been checked against the linked source pages.

## Sources opened

- OCR J411 accredited specification: https://www.ocr.org.uk/Images/207164-specification-accredited-gcse-history-b-.pdf
- OCR J411 assessment page, with public component question papers, mark schemes, and examiner reports for J411/14, /21 and /33: https://www.ocr.org.uk/qualifications/gcse/history-b-schools-history-project-j411-from-2016/assessment/
- OCR J411/14 June 2024 mark scheme: https://www.ocr.org.uk/Images/727682-mark-scheme-crime-and-punishment-c.1250-to-present-with-the-norman-conquest-1065-1087.pdf
- OCR J411/33 June 2024 mark scheme: https://www.ocr.org.uk/Images/727690-mark-scheme-viking-expansion-c.750-c.1050-with-living-under-nazi-rule-1933-1945.pdf
- Historic England scheduled site listing: https://historicengland.org.uk/listing/the-list/list-entry/1003515
- St Albans Museums Roman Verulamium overview: https://www.stalbansmuseums.org.uk/roman-verulamium
- St Albans Museums hypocaust overview: https://www.stalbansmuseums.org.uk/node/1211

The museum dates Boudicca's attack to AD 60 or 61, describes the Basilica and Forum, the theatre, the hypocaust and town walls, and notes that the Roman town's buildings were later reused for the Norman Abbey. Its hypocaust page says the floor is *thought* to have belonged to reception and meeting rooms in a large town house built around AD 200; the site-study deck avoids treating that function as certain. No population estimate or contested chronology is included.

## Review still required

This is a draft for independent review, not a ready-to-upload deck. Check every non-Verulamium factual card against a reliable source and every technique card against OCR's published assessment materials. Remove or correct any unsupported card. Review card atomicity, source-to-point mapping and the route-specific label conventions before generating catalogue JSON.
