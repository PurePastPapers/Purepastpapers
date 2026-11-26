# Promo video

An 80-second, 1920x1080, 60 fps motion graphic for PurePastPapers. It opens with why
testing yourself beats re-reading, then shows what makes the site different: questions
filtered to the exact spec point, real mark schemes, the Data Hub by spec point, and the
planned teacher terminal (shown as "Coming soon").

It uses the site's own design language: cream squared paper, tilted ruled index cards,
masking tape, ink outlines with offset shadows, Young Serif, Nunito and Caveat (loaded
from `/fonts`), and the subject swatch colours. Not part of the published site: `tools/`
is listed in `.assetsignore`.

## Storyboard

84 BPM. Each scene starts on a bar line (2.857 s), so the camera moves, the animation and
the music share one grid. The music drops when the active-recall title lands, breaks and
lifts into the teacher terminal, and the logo stamp lands on the tonic chord.

| Time | Chapter | On screen | Source tag |
| --- | --- | --- | --- |
| 0.0 | 01 The problem | Re-reading and highlighting feel productive, mostly aren't | Dunlosky et al., 2013 |
| 8.6 | 01 The problem | 84% re-read their notes, 11% test themselves | Karpicke, Butler & Roediger, 2009 |
| 14.3 | 02 Active recall | Read it 4 times: 40% recalled a week later; read once, tested 3 times: 61% | Roediger & Karpicke, 2006 |
| 22.9 | 03 Filtered to the spec | Tick the spec points you've learned; questions on anything else, including crossover topics, wait | Bjork & Bjork, 2011 |
| 34.3 | 04 Real mark schemes | A past-paper question marked against its mark scheme | Butler & Roediger, 2008 |
| 42.9 | 05 Data Hub | Results by spec point, then practise the weak one | |
| 48.6 | 06 Teacher terminal | Coming soon, for teachers: pupils who join a class get the taught spec points ticked | |
| 57.1 | 06 Teacher terminal | Whole class by spec point; set work, class results, printable tests, track each student | |
| 65.7 | | 38 subjects, 838 past papers, 1,097 spec points (`data/stats.json`), logo | |
| 74.3 | | Sources | |

Screens marked "Example" use sample data. The teacher terminal is planned and not live;
the video and the sources card both say so. If its features change, update scenes 7 and 8.

The figures for Roediger & Karpicke and Karpicke et al. were checked against several
published summaries of each paper that agree with each other. The original PDFs could
not be opened from the build machine, so check them against the papers before quoting
them anywhere formal.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `promo.css` | The scenes. Open `http://localhost:5173/tools/promo-video/` after `npm start` for a live preview with a scrubber (plays `out/promo-audio.wav` if it exists). |
| `promo.js` | A small deterministic tween engine and the whole timeline, written in beats. `PROMO.seek(t)` draws the frame at `t` seconds; `PROMO.cues` lists the sound effects and `PROMO.music` the song structure. |
| `music.py` | Synthesises the original lo-fi score and every sound effect from `out/cues.json` (numpy + scipy, no samples). |
| `render.mjs` | Captures every frame with headless Chromium (Playwright) and encodes with ffmpeg. |
| `stills.cjs` | Renders chosen frames for checking a layout: `node stills.cjs 22.9 48.6`. |

## Render

Needs Node 18+, Playwright with Chromium, ffmpeg, and Python 3 with numpy and scipy.

```bash
cd tools/promo-video
node render.mjs --cues-only     # writes out/cues.json from the timeline
python3 music.py                # writes out/promo-audio.wav
node render.mjs                 # frames + out/purepastpapers-promo.mp4
```

`node render.mjs --fps=30 --scale=0.5 --out=preview.mp4` makes a quick low-resolution
preview. After changing only the audio, `node render.mjs --encode-only` reuses the frames.
Audio is normalised to -16 LUFS at 48 kHz in the encode.
