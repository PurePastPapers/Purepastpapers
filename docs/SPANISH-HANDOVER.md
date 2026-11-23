# AQA A-level Spanish 7692

The Papers catalogue has official links for 14 written booklets and five speaking resource sets. The links and SHA-256 hashes are recorded in [official-sources.json](../data/imports/spanish/official-sources.json). Paper routes keep their historical IDs. The 2018 and 2019 routes identify the missing official public sources and retain previous attempt history. The demo retains its separate identity.

| Series | Paper 1 | Paper 2 | Paper 3 |
| --- | --- | --- | --- |
| June 2018 | Official public source unavailable | Official public source unavailable | Official public source unavailable |
| June 2019 | Official public source unavailable | Official public source unavailable | Official public source unavailable |
| Autumn 2020 | Paper, insert, audio, transcript, scheme | 7692/2R paper and scheme | No public speaking resources located |
| Autumn 2021 | Paper, insert, audio, tracks, transcript, scheme | Paper and scheme | No public speaking resources located |
| June 2022–2024 | Paper, insert, audio, tracks, transcript, scheme, report | Paper, scheme, report | Stimulus cards, marking rubric, report |
| June 2025 | Paper, insert, audio, tracks, transcript, scheme, report | Paper and scheme | Marking rubric and report only |
| Specimen set 1 | Paper, audio, tracks, transcript, scheme | Paper and scheme | 12 specimen cards and marking rubric |
| June 2026 | Scheduled for 9 July 2027 | Scheduled for 9 July 2027 | See AQA release schedule |

The source manifest covers the 99 unmodified 7692 resources listed by AQA, including teacher guidance and specimen commentary. Published links use AQA’s current asset URLs. Audio and inserts are available when sitting Paper 1 from source. The transcript link appears at the marking step. Speaking counts once under `7692/3T/3V`. The test comprises a conversation about a stimulus card and a discussion of the student’s individual research project. The resource view links the rubric for partner practice.

## Source checks

- The autumn 2020 Paper 1 booklet retains its original May date and June footer. Autumn 2021 Paper 1 and Paper 2 retain June footers. The assignment uses AQA’s series listing and the printed component and paired mark scheme.
- The June 2024 Paper 1 mark scheme uses the listed asset `AQA-7692-1-Final-MS-Jun24-v2.0.pdf`. Its cover reads Version 1.0 Final. The separate reading insert contains Q6 on page 2 and Q7 on page 3. Q1 uses tracks 02–11 and matches 8.052–118.396 seconds in the official untracked recording.
- AQA currently lists specimen Card I from its 2025 revision alongside Cards A–H and J–L. It remains part of Specimen set 1.
- AQA’s public acknowledgement booklets credit third-party imagery in the live speaking cards, and the specimen Card I carries stock-image credits. The catalogue links those official PDFs. Separate rights for rehosting listening files and third-party material must be verified before reproducing them in Practice.

Run `python3 tools/spanish/build_catalogue.py` using the checked-in manifest to regenerate the paper rows. Run `node --test tests/spanish-catalogue.test.mjs` for series, source, specimen and resource-gating checks.

[AQA assessment resources](https://www.aqa.org.uk/subjects/spanish/a-level/spanish-7692/assessment-resources) · [Specification](https://www.aqa.org.uk/subjects/spanish/a-level/spanish-7692/specification/scheme-of-assessment) · [Release schedule](https://www.aqa.org.uk/exams-administration/exams/whats-available-when) · [Copyright policy](https://www.aqa.org.uk/about-us/who-we-are/our-standards/copyright-and-intellectual-property-policy)
