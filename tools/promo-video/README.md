# Promo video: "the science bit"

A 70-second, 1920x1080, 60 fps motion graphic explaining the learning science behind
PurePastPapers. It uses the site's own design language: cream squared paper, tilted ruled
index cards, masking tape, ink outlines with offset shadows, Young Serif, Nunito and Caveat
(loaded from `/fonts`), and the subject swatch colours.

Not part of the published site: `tools/` is listed in `.assetsignore`.

## Storyboard

Everything runs at 96 BPM. Each scene starts on a bar line (2.5 s), so the camera moves,
the animation and the music share one grid.

| Time | Chapter | Claim on screen | Source tag |
| --- | --- | --- | --- |
| 0.0 | 01 The problem | Re-reading and highlighting feel productive, mostly aren't | Dunlosky et al., 2013 |
| 7.5 | 01 The problem | 84% re-read their notes, 11% test themselves | Karpicke, Butler & Roediger, 2009 |
| 12.5 | 02 Active recall | Read 4 times: 40% recalled a week later; read once, tested 3 times: 61% | Roediger & Karpicke, 2006 |
| 22.5 | 03 Feedback | A past-paper question marked against the mark scheme | Butler & Roediger, 2008 |
| 30.0 | 04 Right difficulty | Only questions on spec points you've learned | Bjork & Bjork, 2011 |
| 37.5 | 05 Interleaving | Blocked 20% vs mixed 63% on a test a week later | Rohrer & Taylor, 2007 |
| 45.0 | 06 Spacing | Reviews spaced out by the flashcard scheduler (curve is illustrative) | Cepeda et al., 2006 |
| 52.5 | 07 Low friction | No account needed to start; B = MAP | Fogg, 2009 |
| 60.0 | Recap and logo | | |
| 65.0 | Sources | Full references | |

The figures for Roediger & Karpicke, Rohrer & Taylor and Karpicke et al. were checked
against several published summaries of each paper that agree with each other. The
original PDFs could not be opened from the build machine, so check them against the
papers before quoting them anywhere formal.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `promo.css` | The scenes. Open `http://localhost:5173/tools/promo-video/` after `npm start` for a live preview with a scrubber (plays `out/promo-audio.wav` if it exists). |
| `promo.js` | A small deterministic tween engine and the whole timeline. `PROMO.seek(t)` draws the frame at `t` seconds; `PROMO.cues` lists the sound effects. |
| `music.py` | Synthesises the original lo-fi score and every sound effect from `out/cues.json` (numpy + scipy, no samples). |
| `render.mjs` | Captures every frame with headless Chromium (Playwright) and encodes with ffmpeg. |
| `stills.cjs` | Renders chosen frames for checking a layout: `node stills.cjs 12.5 30`. |

## Render

Needs Node 18+, Playwright with Chromium, ffmpeg, and Python 3 with numpy and scipy.

```bash
cd tools/promo-video
node render.mjs --cues-only     # writes out/cues.json from the timeline
python3 music.py                # writes out/promo-audio.wav
node render.mjs                 # frames + out/purepastpapers-the-science-bit.mp4
```

`node render.mjs --fps=30 --scale=0.5 --out=preview.mp4` makes a quick low-resolution
preview. After changing only the audio, `node render.mjs --encode-only` reuses the frames.
Audio is normalised to -16 LUFS in the encode.
