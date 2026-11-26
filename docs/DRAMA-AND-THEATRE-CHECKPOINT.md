# Eduqas A690QS Component 3 import checkpoint

The execution workspace became unavailable during final browser and crop checks. This branch preserves seven verified image catalogues. The catalogue index has no Drama entries from this checkpoint. The question packs, build input and tests were last present in the isolated workspace and still need to be copied into a release commit.

## Resume

1. Fetch current main before integrating. The original baseline was `d3a6f7137fdb4bd8ba793c67f743f393e77d155d`.
2. Recover the prior worktree at `/workspace/scratch/66c7aae3b399/drama-bank` and private PDFs in `/workspace/scratch/66c7aae3b399/source-dram` if the prior environment is available. The scoped build was `python tools/drama/build.py ../source-dram` and the deterministic check used `--verify`. Original PDFs are kept outside Git.
3. Finish the specimen crop review. The 2027 Section C grid clipped the Section C heading and the left table edge. Use consistent horizontal bounds for the split grids. For the 2027 grids, use [73,86,63,548,651], [74,86,63,548,479], [75,86,63,548,300] for B and [83,86,63,537,628], [84,86,63,537,766] for C. Coordinates are 1-based PDF page, x0, y0, x1, y1 in points. Check the original specimen table edges. Set the 2027 numbered A and B crop left bounds at 87 points to retain the number box edges.
4. Rebuild all ten books, run `npm run validate`, `npm test` and `node --test tests/drama-bank.test.mjs tests/site-size.test.mjs`. Complete `tools/browser-drama-bank.cjs` on desktop and phone. The first usable Chromium run reached both paper listings and both full-paper selectors. Its mobile test read the previous question's resource immediately after switching to C. Wait for the link ending in `#page=51` before reading it.
5. Verify the preview and production at the merged SHA. The checkout lost access before either check.

## Coverage and decisions

- Eight live papers (June 2018, 2019 and 2022 to 2025, Autumn 2020 and 2021) and two official samples (original SAM and revised 2027 additional exemplar). The staged build contained 163 units. A full selection is both parts for one Section A text (10 + 30 marks), one Section B essay (40), and compulsory Section C (40).
- 2019, 2020 and the original SAM put pre-1956 works in A. The other historical books checked put post-1956 works in A. Revised work IDs are separate. The 2020 Section C prompt is unnumbered.
- Link the exact official required excerpt pages. Third-party play excerpts stay at the official source. Render the levels grids inline and use the page-anchored official indicative scheme links.
- June 2026 paper and scheme are withheld from the public archive. WJEC's release policy schedules them for July 2027. The examiner report is public. Components 1 and 2 are practical/non-exam assessment.
- The first data validation yielded zero errors and no Drama warnings. Targeted tests and the site-size check passed before final crop changes. The suite initially failed browser tests because its Chrome binary was missing. A subsequent run with an installed binary was interrupted by resource pressure.

## Official links

- [Qualification and source archive](https://www.eduqas.co.uk/qualifications/drama-and-theatre-asa-level/)
- [Version 13 specification](https://www.eduqas.co.uk/media/wuldiact/eduqas-a-level-drama-spec-from-2016-e-27082.pdf)
- [Original sample](https://www.eduqas.co.uk/media/na5dt51h/eduqas-a-level-drama-sams-from-2016-e.pdf)
- [2027 additional exemplar](https://www.eduqas.co.uk/media/hobf4ce3/eduqas-a-level-drama-aems-e.pdf)
- [WJEC release policy](https://www.wjec.co.uk/media/kdyfu1c1/wjec-publication-policy-updated-2024.pdf)

| Series | Question paper | Mark scheme | Section C passage PDF pages |
| --- | --- | --- | --- |
| June 2018 | [QP](https://pastpapers.download.wjec.co.uk/s18-8691-03.pdf) | [MS](https://pastpapers.download.wjec.co.uk/s18-drama---a690u30-1-eduqas-a-level-drama---c1-ms.pdf) | 6–8 |
| June 2019 | [QP](https://pastpapers.download.wjec.co.uk/s19-8691-03.pdf) | [MS](https://pastpapers.download.wjec.co.uk/s19-A690U30-1%20EDUQAS%20A%20Level%20Drama%20-%20Comp%203%20MS%20S19.pdf) | 6 and 8 |
| Autumn 2020 | [QP](https://pastpapers.download.wjec.co.uk/O20/o20-8691-03.pdf) | [MS](https://pastpapers.download.wjec.co.uk/A20/a20-A690U30-1-ms.pdf) | 6 |
| Autumn 2021 | [QP](https://pastpapers.download.wjec.co.uk/O21/o21-8691-03.pdf) | [MS](https://pastpapers.download.wjec.co.uk/A21/a21-A690U30-1-ms.pdf) | 6 and 8 |
| June 2022 | [QP and advance notice](https://pastpapers.download.wjec.co.uk/Z22/z22-a690u30-1a.pdf) | [MS](https://pastpapers.download.wjec.co.uk/S22/s22-A690U30-1-ms.pdf) | 8–9 |
| June 2023 | [QP and advance notice](https://pastpapers.download.wjec.co.uk/S23/s23-a690u30-1a.pdf) | [MS](https://pastpapers.download.wjec.co.uk/S23/s23-a690u30-1-ms.pdf) | 8 and 10 |
| June 2024 | [QP](https://pastpapers.download.wjec.co.uk/S24/S24-A690U30-1.pdf) · [Advance notice](https://pastpapers.download.wjec.co.uk/S24/S24-A690U30-1A.pdf) | [MS](https://pastpapers.download.wjec.co.uk/S24/S24-A690U30-1-ms.pdf) | 6 and 8 |
| June 2025 | [QP](https://pastpapers.download.wjec.co.uk/S25/S25-A690U30-1.pdf) · [Advance notice](https://pastpapers.download.wjec.co.uk/S25/S25-A690U30-1A.pdf) | [MS](https://pastpapers.download.wjec.co.uk/S25/S25-A690U30-1-ms.pdf) | 25–26 |
| Original SAM | One combined PDF above | PDF page 33 | 26–27 |
| 2027 exemplar | One combined PDF above | PDF page 57 | 51–52 |
