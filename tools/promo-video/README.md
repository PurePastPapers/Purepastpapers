# Promo video

A 3 min 43 s, 1920x1080, 60 fps explainer for PurePastPapers (v3, a draft for review; the
landing page still shows the earlier 80 s cut in `assets/promo/`).

**The idea:** most students re-read because it needs no setup. Testing yourself works better but
costs effort to set up: finding questions, knowing what you have covered, checking your answer, deciding
what is next. PurePastPapers removes that friction and keeps the difficulty inside the recall.

It uses the site's own design language: cream squared paper, tilted ruled index cards,
masking tape, ink outlines with offset shadows, Young Serif, Nunito and Caveat (loaded
from `/fonts`), and the triple-P mark from `js/ui/logo.js`. Not part of the published site:
`tools/` is listed in `.assetsignore`.

## Pacing

72 BPM, and every scene is timed in beats from a bar line. `PROMO.audit()` (run `node audit.cjs`)
simulates a viewer reading each scene's text in order at about 180 words a minute and prints how much
time is left over before the camera moves on. Scene lengths in `promo.js` (`LEN`) were set from it, so
re-run it after changing any copy. The sources card is a reference and is not audited.

## Storyboard

| Scene | Bars | On screen | Source tag |
| --- | --- | --- | --- |
| 1 Why re-read? | 6 | 84% re-read; testing recalled 61% a week later vs 40%; the better method has more setup | Karpicke et al., 2009; Roediger & Karpicke, 2006; Dunlosky et al., 2013 |
| 2 The idea | 7 | A five-step path: friction around the work comes off, the difficulty of recall stays | Fogg, 2009; Bjork & Bjork, 2011 |
| 3 Friction 1: finding | 7 | A pile of papers vs ticking the spec points you have learned | Sweller et al., 1998 |
| 4 Only what you've learned | 7 | Questions pass a gate; one waits until both its spec points are learned | Bjork & Bjork, 2011 |
| 5 Friction 2: starting | 6 | No account needed; one click from the landing page to a real question | Fogg, 2009 |
| 6 Friction 3: checking | 7 | Mark scheme beside the answer, plus the examiner's report where published | Butler & Roediger, 2008 |
| 7 Friction 4: what's next | 7 | Data Hub results by spec point, one click to practise the weak one | Roediger & Karpicke, 2006 |
| 8 Teacher terminal | 6 | Coming soon: the class's taught spec points tick themselves for pupils who join | |
| 8b Teacher terminal | 6 | Coming soon: class results by spec point, set work, printable tests, track each student | |
| 9 Recap and logo | 4 | Find, start, check, decide; the logo stamps in | |
| 10 Sources | 4 | Full references and caveats | |

Screens marked "Example" use sample data and the questions are invented (no exam board material is shown).
The teacher terminal is planned and not live; the video and the sources card say so.

The research is applied here as our interpretation: the studies mostly used university students and lab
tasks, none tested this website, and Fogg's model is a design guide with little direct testing. The
figures for Roediger & Karpicke and Karpicke et al. were checked against several published summaries
that agree with each other; the original PDFs could not be opened from the build machine, so check them
against the papers before quoting them formally.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `promo.css` | The scenes. Open `http://localhost:5173/tools/promo-video/` after `npm start` for a live preview with a scrubber (plays `out/promo-audio.wav` if it exists). |
| `promo.js` | A small deterministic tween engine and the whole timeline, written in beats. `PROMO.seek(t)` draws the frame at `t` seconds; `PROMO.cues` lists the sound effects, `PROMO.music` the song structure, `PROMO.audit()` the reading check. |
| `music.py` | Synthesises the original lo-fi score and every sound effect from `out/cues.json` (numpy + scipy, no samples). |
| `render.mjs` | Captures every frame with headless Chromium (Playwright) and encodes with ffmpeg. |
| `stills.cjs`, `audit.cjs` | Check a layout (`node stills.cjs s3 12.5`) and the reading time (`node audit.cjs`). Both expect the local server. |

## Render

Needs Node 18+, Playwright with Chromium, ffmpeg, and Python 3 with numpy and scipy.

```bash
cd tools/promo-video
node render.mjs --cues-only     # writes out/cues.json from the timeline
python3 music.py                # writes out/promo-audio.wav
node render.mjs --out=explainer.mp4   # frames + out/explainer.mp4
```

`node render.mjs --fps=30 --scale=0.5 --out=preview.mp4` makes a quick low-resolution
preview. After changing only the audio, `node render.mjs --encode-only` reuses the frames.
Audio is normalised to -16 LUFS at 48 kHz in the encode.
