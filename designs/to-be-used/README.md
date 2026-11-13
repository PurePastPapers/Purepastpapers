# AI feature designs: to be used

> **These designs are not final.** They show how each page could look once the AI
> features (Phases 2 to 4 in the PRD) are switched on. They are kept here so the
> work is ready when those phases start. **If the owner or anyone working on the
> project says something different from what is shown here, follow what they say,
> not these files.**

None of this folder is loaded by the website. The live site uses the same
index-card design without the AI parts, and the AI sections stay behind the
`FEATURES` flags in `js/config/phases.js`.

## What is in each folder

Each folder matches one area of the site. `mockups/` holds the approved
screenshots of the "with AI features" state, and `source/` holds the HTML and CSS
they were drawn from. Open a source file in a browser with `?ai=1` (and `&dim=1`
for dark mode where supported) to see the AI version. The source files are
static mockups with sample data, not working code.

| Folder | Page | Source and views |
| --- | --- | --- |
| `0-dashboard` | Dashboard with the Coming later AI features | `dashboard.html?v=d&ai=1` |
| `1-past-papers` | Past papers with the AI past papers and AI predicted papers shelves | `papers.html?ai=1` |
| `2-practice` | Practice, individual questions, test runner, marking, results, question picker | `practice.html`, `individual.html`, `runner.html`, `picker.html` with `?ai=1` |
| `3-data-hub` | Data Hub: "Official and AI combined" view, INCL. AI tags | `hub.html?s=overview\|questions\|topics-all\|topics\|papers\|empty&ai=1` |
| `4-my-subjects` | My subjects, Add a subject (AI toggle), topics learned | `subjects.html?s=list\|setup\|subject\|empty&ai=1` |
| `5-account` | Sign up and Account with AI settings | `account.html?s=signup\|account&ai=1` (`&dim=1` for dark) |
| `6-paper-and-test-session` | One paper, sitting a paper, finishing, marking and results with AI marking | `paper.html?s=paper\|whole\|log\|ready\|sit\|pdf\|finish\|markwhole\|result&ai=1` |
| `7-studio` | Content Studio: AI questions, AI papers, content packs, database check | `studio.html?s=home\|add\|paper\|pack\|check&ai=1` |
| `8-coming-soon-ai` | AI marking once it is live | `soon.html?s=live` (`&dim=1` for dark) |

## Conventions shown in these designs

- AI-made papers and questions sit on their own dashed "shelf" and carry an
  **AI MADE** stamp, so they are never mixed up with official papers.
- Where the Data Hub mixes official and AI results, scores that include AI
  questions get an **INCL. AI** tag.
- Dark mode uses warm browns, cream text and muted subject colours. No neon.

Again: these are working designs, not a final specification. Check with the owner
before building from them, and follow their instructions where they differ.
