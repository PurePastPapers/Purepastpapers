# Eduqas GCSE Drama C690QS import checkpoint

Baseline `aeab12951c58b6a6492fc45ba2d9b44c6e56d271`. At this baseline, the qualification has a registry/spec entry and a demo seed. This checkpoint adds source tracking only. It adds no scored parts or production coverage.

Component 3 is Interpreting Theatre (C690U30-1). The written paper allows 90 minutes and totals 60 marks for one complete 45-mark Section A text route and one 15-mark Section B response. Components 1 and 2 are practical NEA. Keep A690QS and the WJEC Wales qualification separate.

## Download inventory

All rows except the November 2021 scheme fallback returned bytes beginning with the PDF signature during initial local downloads. The executor disconnected before rendered title-page, page count, SHA-256, revisions, scheme boundaries and individual question verification could be recorded. Verify those on the next download. The 2019 scheme is a mirror of the board document. The original board URL tried for the November 2021 scheme did not return a usable PDF. Its separately located mirror shows the board's qualification, component and November 2021 marking scheme in search indexing and still requires byte and printed-identity checks.

| Sitting | Question paper | Mark scheme |
| --- | --- | --- |
| Summer 2018 | [WJEC](https://pastpapers.download.wjec.co.uk/s18-5690-03.pdf) | [WJEC](https://pastpapers.download.wjec.co.uk/s18-drama5-ms.pdf) |
| Summer 2019 | [WJEC](https://pastpapers.download.wjec.co.uk/s19-5690-03.pdf) | [Revision World](https://revisionworld.com/sites/revisionworld.com/files/imce/s19-C690U30-1-ms.pdf) |
| Autumn 2020 | [WJEC](https://pastpapers.download.wjec.co.uk/O20/o20-5690-03.pdf) | [WJEC](https://pastpapers.download.wjec.co.uk/A20/a20-C690U30-1-ms.pdf) |
| Autumn 2021 | [WJEC](https://pastpapers.download.wjec.co.uk/O21/o21-5690-03.pdf) | [Mirror candidate](https://assets.yesgenie.com/papers/official-board-assets/eduqas/gcse-drama-eduqas/wjec-eduqas-gcse-drama-2021-november-component-3-interpreting-theatre-c690u30-1/mark-scheme-pdf-4a81acfb6f7c.pdf) |
| Summer 2022 | [WJEC](https://pastpapers.download.wjec.co.uk/Z22/z22-5690-03.pdf) | [WJEC](https://pastpapers.download.wjec.co.uk/S22/s22-C690U30-1-ms.pdf) |
| Summer 2023 | [WJEC](https://pastpapers.download.wjec.co.uk/S23/s23-c690u30-1.pdf) | [WJEC](https://pastpapers.download.wjec.co.uk/S23/s23-c690u30-1-ms.pdf) |
| Summer 2024 | [WJEC](https://pastpapers.download.wjec.co.uk/S24/S24-C690U30-1.pdf) | [WJEC](https://pastpapers.download.wjec.co.uk/S24/S24-C690U30-1-ms.pdf) |
| Summer 2025 | [WJEC](https://pastpapers.download.wjec.co.uk/S25/S25-C690U30-1.pdf) | [WJEC](https://pastpapers.download.wjec.co.uk/S25/S25-C690U30-1-ms.pdf) |
| Official SAM (historic set-text routes) | [Combined Eduqas PDF](https://www.eduqas.co.uk/media/jemll2kw/eduqas-gcse-drama-sams.pdf) | Scheme in same PDF |
| Additional exemplar (2024 set texts, revised layout, v2 December 2025) | [Combined Eduqas PDF](https://www.eduqas.co.uk/media/km1bdoud/eduqas-gcse-drama-aems-e.pdf) | Scheme in same PDF |
| Summer 2026 | No public paper verified | No public scheme verified |

## Continuation status

The November 2021 mirror was downloaded and its first page identifies the board's Autumn 2021 C690U30-1 marking scheme. All ten question and scheme layouts were parsed. Each Section A route reconciles to 45 marks and each paper has two separate 15-mark Section B alternatives. The June 2025 generator ran successfully in a scoped build and produced 58 scored units and 109 images. No validation or production run was completed.

The in-progress source code is in the worktree at `/workspace/scratch/e60a118d77d5/drama/tools/gcsedrama/`. The worktree uses Git metadata under `/dev/shm/ppp-c690-repo`. If a restart clears that metadata, create a new sparse worktree from this branch and transfer the importer, source manifest and intended edits from the scratch files. Source URL retrieval is in `/workspace/scratch/e60a118d77d5/download.py`, with completed URL output in `sources/download.log` under the same scratch directory. The source cache under `/dev/shm/ppp-c690-source` can be rebuilt from those URLs and the manifest. The existing sparse worktree omitted unrelated packs/assets because full checkout attempts exhausted the available resources.

Identified scheme irregularities:

- June 2018 Caucasian Chalk Circle 2.2(i): the question and award rule both give 3, while the question reprinted inside the scheme gives 2. June 2018 Tempest 1.3(i) prints a malformed closing bracket around its 2-mark tariff.
- June 2024 Refugee Boy and I Love You, Mum task 1(ii): both printed scheme rows are labelled (iii), but the prompt and tariff match (ii).
- June 2025 live review 9.1: the printed task and levels rubric concern performance skills. The indicative content's introductory sentence refers to vocal skills.
- The December 2025 exemplar spans three extract pages for Refugee Boy and The IT. Other supplied extracts in that exemplar and the June 2025 reformat span two pages.

The workspace disconnected after the ten-paper build was started. Re-run it from the continued worktree and check the output before committing. Only the planning and inventory checkpoints are present on GitHub.

## Next import pass

- Start with summer 2025. The matching 2025 examiner report says this was the first session with the set extract printed on the question paper. Verify printed passage boundaries, continuation pages and attributed text for each option. Keep third-party extracts linked to official pages unless asset-specific republication rights are documented. Check each older sitting's extract references and candidate-text requirements from its own instructions.
- Capture page coordinates per scored unit and mark-scheme rubric. Retain a whole-play route and both separately labelled live-review choices, with the student's own production and the same-play restriction. Test the 45 + 15 selection and counting each valid option once. Record withheld or unconfirmed material explicitly.
- Reconcile reports from the official qualification materials. The [2024 report](https://www.eduqas.co.uk/media/0zxn3ilj/eduqas-gcse-drama-final-report-s24.pdf) and the [2025 report](https://www.eduqas.co.uk/media/504amxks/eduqas-gcse-drama-report-s25-e.pdf) were located during discovery. The [official qualification page](https://www.eduqas.co.uk/qualifications/drama-gcse/) lists the sample/exemplar and current communications.
- Retain this branch and use the current base for integration. A full worktree alongside the existing shared checkouts exceeded the workspace filesystem. Use a separately provisioned checkout or sufficient temporary disk for a full build. Run the fixture, full suite, data and site-size validation, desktop/mobile smoke and release verification from the attached brief. Raw PDF caches belong outside Git.
