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

## Practice bank

The owner confirmed reproduction permission for the AQA 7692 written question papers and schemes on 23 November 2026. Official audio, transcripts, separate reading inserts, credited or uncertain stimuli, and examiner reports link to AQA. Examiner reports retain full-paper scope. Speaking remains a resource-based partner practice activity.

| Coverage | Booklets | Scored units | Official total per attempt |
| --- | ---: | ---: | ---: |
| Paper 1 · autumn 2020–21, June 2022–25, specimen set 1 | 7 | 305 | 100 |
| Paper 2 · autumn 2020–21, June 2022–25, specimen set 1 | 7 | 224 | 80 |

Paper 1 records scoped prompts and schemes, separates unscored stems, and retains links to the official page where licensed display ends. Printed summaries carry independent content and language marks. Translation records identify their direction and retain the source conversion instructions. A printable selection that requires a recording points the student to the official audio and stays unavailable as a self-contained question PDF. Required PDF stimuli and quoted prompts are emitted as labelled links.

All 28 listening tasks use bounded official audio. For the specimen the cue groups follow the official tracked archive and continuous recording. Autumn 2020 uses the spoken section announcements in the official recording and their order in the transcript.

Paper 2 permits two essays from distinct works with a maximum of one film. Each booklet has 420 valid 80-mark pairs. The shared AO3/AO4 rubric stays visible during marking alongside the exact essay guidance or its official PDF page. The June 2022 Q05.1, June 2024 Q08.1, and June 2025 Q02.1 prompts open on the official page because they quote prescribed works. The builder lists the 52 indicative schemes sourced by page link for the same reason. Custom sets can include any eligible essays and are labelled as question sets.

### Rebuild and verify the bank

Use a cache with the checked-in `official-sources.json` at `official-manifest.json` and the checksum-matched original files under `assets/`. Keep this cache and both staging directories outside the published tree. Run the following from the repository root.

```sh
python3 tools/spanish/build-paper-one.py \
  --source-cache "$spanish_cache" --source-map data/imports/spanish/paper-one-resources.json \
  --repo "$PWD" --stage "$spanish_p1"
python3 tools/spanish/check-paper2.py \
  "$spanish_cache/assets" data/imports/spanish/official-sources.json /tmp/ppp-7692-p2-proof.json
python3 tools/spanish/build-paper2.py \
  "$PWD" "$spanish_cache/assets" /tmp/ppp-7692-p2-proof.json "$spanish_p2"
python3 tools/spanish/finalize.py --paper-one "$spanish_p1" --paper-two "$spanish_p2"
python3 tools/assets/compact.py --slug spanish
python3 tools/spanish/finalize.py --verify
npm run validate
npm test
```
