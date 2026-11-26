"""Original lo-fi score and sound effects for the PurePastPapers promo.

Everything is synthesised here (no samples), so the audio is free to use.
Reads out/cues.json (written by `node render.mjs --cues-only`) and writes
out/promo-audio.wav (48 kHz stereo). Deterministic: fixed random seed.

Music: 96 BPM, swung 8ths, Dm9 | G13 | Cmaj9 | A7b9 loop, so the drop at
12.5 s and the logo stamp at 62.5 s both land on Cmaj9.
"""
import json
import os
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
meta = json.load(open(os.path.join(OUT, "cues.json")))
DUR = float(meta["duration"])
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
N = int(DUR * SR)
rng = np.random.default_rng(20261126)

DROP_BAR = 5  # 12.5 s, "Pulling it out beats putting it in."
STAMP_BAR = 25  # 62.5 s, logo stamp
SWING = 0.6  # off-beat 8ths land at 60% of the beat


def bus():
    return np.zeros((N, 2))


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def t_of(n):
    return np.arange(n) / SR


def add(buf, start, sig, gain=1.0, pan=0.0):
    """Mix a mono or stereo signal into buf at time `start` (s). pan -1..1."""
    i = int(round(start * SR))
    if i >= N:
        return
    if sig.ndim == 1:
        l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
        sig = np.stack([sig * l, sig * r], axis=1) * np.sqrt(2)
    if i < 0:
        sig, i = sig[-i:], 0
    end = min(N, i + len(sig))
    buf[i:end] += sig[: end - i] * gain


def filt(sig, kind, freq, order=2):
    sos = butter(order, freq, btype=kind, fs=SR, output="sos")
    return sosfilt(sos, sig, axis=0)


def env_adr(n, attack, release_at, release):
    t = t_of(n)
    e = np.minimum(1.0, t / max(attack, 1e-4))
    rel = np.clip(1 - (t - release_at) / release, 0, 1)
    return e * np.where(t > release_at, rel, 1.0)


def make_ir(seconds=1.6, decay=0.45, bright=5000):
    n = int(seconds * SR)
    t = t_of(n)
    ir = rng.standard_normal((n, 2)) * np.exp(-t / decay)[:, None]
    ir = filt(ir, "lowpass", bright)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


IR = make_ir()


def reverb(buf, wet=0.25):
    out = np.zeros_like(buf)
    for ch in range(2):
        out[:, ch] = fftconvolve(buf[:, ch], IR[:, ch])[: len(buf)]
    return buf + out * wet


# ───────────────────────────── instruments ─────────────────────────────


def epiano(freq, dur, vel=1.0):
    """Soft Rhodes-ish FM tone with a little tine and tremolo."""
    n = int((dur + 1.2) * SR)
    t = t_of(n)
    wow = 1 + 0.0018 * np.sin(2 * np.pi * 0.55 * t)  # tape wow
    index = 1.7 * np.exp(-t / 0.3) * vel + 0.45
    phase = 2 * np.pi * freq * np.cumsum(wow) / SR
    body = np.sin(phase + index * np.sin(phase))
    tine = 0.08 * np.sin(phase * 7.02) * np.exp(-t / 0.06)
    amp = np.exp(-t / 2.2) * env_adr(n, 0.004, dur, 0.9)
    trem = 1 + 0.1 * np.sin(2 * np.pi * 4.3 * t)
    return (body + tine) * amp * trem * vel


def bass_note(freq, dur, vel=1.0):
    n = int((dur + 0.3) * SR)
    t = t_of(n)
    sig = np.sin(2 * np.pi * freq * t) + 0.45 * np.sin(4 * np.pi * freq * t) + 0.2 * np.sin(6 * np.pi * freq * t)
    sig = np.tanh(1.6 * sig) / 1.2
    return sig * env_adr(n, 0.008, dur, 0.12) * np.exp(-t / 1.6) * vel


def bell(freq, dur=0.9, vel=1.0):
    n = int((dur + 0.5) * SR)
    t = t_of(n)
    sig = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2.01 * t) * np.exp(-t / 0.25) + 0.12 * np.sin(2 * np.pi * freq * 3.98 * t) * np.exp(-t / 0.08)
    return sig * np.exp(-t / 0.55) * np.minimum(1, t / 0.002) * vel


def kick(vel=1.0):
    n = int(0.45 * SR)
    t = t_of(n)
    f = 48 + 95 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
    click = filt(rng.standard_normal(n), "highpass", 2500) * np.exp(-t / 0.004) * 0.25
    return np.tanh(1.4 * (body + click)) * vel


def snare(vel=1.0):
    n = int(0.4 * SR)
    t = t_of(n)
    noise = filt(rng.standard_normal(n), "bandpass", [900, 6500]) * np.exp(-t / 0.11)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05) * 0.7
    return (noise * 0.9 + tone) * vel


def hat(vel=1.0, open_=False):
    n = int((0.35 if open_ else 0.08) * SR)
    t = t_of(n)
    noise = filt(rng.standard_normal(n), "highpass", 7500)
    return noise * np.exp(-t / (0.12 if open_ else 0.022)) * vel


# ───────────────────────────── the score ─────────────────────────────

CHORDS = {  # (bass midi, voicing midi)
    "Dm9": (38, [53, 57, 60, 64]),
    "G13": (43, [53, 57, 59, 64]),
    "Cmaj9": (36, [52, 55, 59, 62]),
    "A7b9": (45, [55, 58, 61, 64]),
    "Fmaj9": (41, [57, 60, 64, 67]),
}
LOOP = ["Dm9", "G13", "Cmaj9", "A7b9"]
TOTAL_BARS = int(round(DUR / BAR))


def chord_for(bar):
    if bar == STAMP_BAR:
        return "Cmaj9"
    if bar == STAMP_BAR + 1:
        return "Fmaj9"
    if bar >= STAMP_BAR + 2:
        return "Cmaj9"
    return LOOP[(bar + 1) % 4]


def swung(beat_pos):
    whole = np.floor(beat_pos)
    frac = beat_pos - whole
    return (whole + (SWING if abs(frac - 0.5) < 1e-6 else frac)) * BEAT


keys, bass, drums, melody, pre, fx = bus(), bus(), bus(), bus(), bus(), bus()

for bar in range(TOTAL_BARS):
    t0 = bar * BAR
    name = chord_for(bar)
    root, voicing = CHORDS[name]
    ending = bar >= STAMP_BAR
    groove = DROP_BAR <= bar < STAMP_BAR

    # keys: a strum on 1 and a softer push on the "and" of 3
    hits = [(0.0, 2.2 if not ending else 3.9, 0.9)]
    if not ending:
        hits.append((2.5, 1.3, 0.55))
    for pos, length, vel in hits:
        for k, m in enumerate(voicing):
            jitter = rng.uniform(0, 0.012)
            note = epiano(mtof(m), length * BEAT, vel * rng.uniform(0.85, 1.0))
            add(keys, t0 + swung(pos) + k * 0.018 + jitter, note, 0.24, pan=-0.35 + 0.23 * k)

    # bass
    if bar >= 3:
        pattern = [(0, 1.6, 1.0), (2.5, 0.7, 0.75), (3.5, 0.4, 0.6)] if groove else [(0, 3.6, 0.9)]
        for i, (pos, length, vel) in enumerate(pattern):
            m = root + (7 if i == 2 else 0)
            add(bass, t0 + swung(pos), bass_note(mtof(m), length * BEAT, vel), 0.26)

    # drums
    if groove and bar != STAMP_BAR - 1:
        kicks = [0, 2.5] if bar % 2 == 0 else [0, 1.5, 2.5]
        for pos in kicks:
            add(drums, t0 + swung(pos), kick(1.0 if pos == 0 else 0.75), 0.34)
        for pos in (1, 3):
            add(drums, t0 + pos * BEAT + 0.012, snare(0.9), 0.42, pan=0.05)
    if bar >= 3 and bar < STAMP_BAR and bar != STAMP_BAR - 1:
        for i in range(8):
            pos = i / 2
            vel = (0.7 if i % 2 == 0 else 0.45) * rng.uniform(0.8, 1.1) * (0.6 if not groove else 1.0)
            add(drums, t0 + swung(pos), hat(vel, open_=(i == 7 and bar % 4 == 3)), 0.3, pan=0.3)
    if bar == STAMP_BAR - 1:  # a breath before the stamp: half a bar of groove, then silence
        add(drums, t0, kick(1.0), 0.34)
        add(drums, t0 + BEAT + 0.012, snare(0.9), 0.42)
        for i in range(4):
            add(drums, t0 + swung(i / 2), hat(0.6), 0.3, pan=0.3)

# riser into the drop and a sub hit on it
rise_len = 1.9
n = int(rise_len * SR)
tt = t_of(n)
riser = rng.standard_normal(n)
riser = filt(riser, "bandpass", [400, 6000]) * (tt / rise_len) ** 2.2
add(pre, DROP_BAR * BAR - rise_len, riser, 0.12)
add(drums, DROP_BAR * BAR, kick(1.2), 0.42)

# melody: a little pentatonic hook, twice
HOOK = [(0, 76), (0.5, 79), (1.0, 81), (2.0, 79), (2.5, 76), (3.5, 74), (4.0, 76), (6.0, 72), (6.5, 74), (7.0, 76)]
for start_bar in (9, 17):
    for rep in range(2):
        for pos, m in HOOK:
            at = (start_bar + rep * 2) * BAR + swung(pos % 4) + (pos // 4) * BAR
            add(melody, at, bell(mtof(m), 0.8, 0.8), 0.1, pan=0.2)
            add(melody, at + 0.75 * BEAT, bell(mtof(m), 0.8, 0.8), 0.025, pan=-0.5)  # echo

# the ending chord: a stamp-sized hit
for k, m in enumerate([48, 52, 55, 59, 62, 67]):
    add(keys, STAMP_BAR * BAR + k * 0.012, epiano(mtof(m), 3.5 * BEAT, 1.0), 0.15, pan=-0.4 + 0.16 * k)

# vinyl: hiss + crackle across the whole track
hiss = filt(rng.standard_normal((N, 2)), "bandpass", [1500, 9000]) * 0.006
crackle = np.zeros((N, 2))
pops = rng.random((N, 2)) < (7 / SR)
crackle[pops] = rng.uniform(-1, 1, pops.sum()) * 0.25
crackle = filt(crackle, "highpass", 1200)

# music bus: warm it up, open the filter from the intro into the drop
music = keys * 1.0 + bass + drums + melody
music = reverb(music, 0.18)
lp_closed = filt(music, "lowpass", 1800)
lp_open = filt(music, "lowpass", 12000)
t_all = t_of(N)
open_amt = np.clip((t_all - 0.5) / (DROP_BAR * BAR - 0.5), 0, 1) ** 1.6
close_amt = np.clip((t_all - (STAMP_BAR + 1) * BAR) / (DUR - (STAMP_BAR + 1) * BAR), 0, 1)
mix_open = np.clip(open_amt - close_amt * 0.8, 0, 1)[:, None]
music = lp_closed * (1 - mix_open) + lp_open * mix_open
music += pre + hiss + crackle
fade_in = np.clip(t_all / 0.6, 0, 1)
fade_out = np.clip((DUR - t_all) / 4.0, 0, 1) ** 1.5
music *= (fade_in * fade_out)[:, None]

# ───────────────────────────── sound effects ─────────────────────────────
PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96]  # C major pentatonic from C5


def noise(n):
    return rng.standard_normal(n)


def sfx_whoosh(dur, idx):
    n = int(dur * SR)
    u = np.linspace(0, 1, n)
    shape = np.sin(np.pi * u) ** 1.6
    low = filt(noise(n), "bandpass", [250, 1400])
    high = filt(noise(n), "bandpass", [1400, 5000])
    sig = (low * (1 - shape * 0.5) + high * shape) * shape
    pan = (u * 2 - 1) * (1 if idx % 2 else -1) * 0.8
    st = np.stack([sig * np.sqrt((1 - pan) / 2), sig * np.sqrt((1 + pan) / 2)], axis=1) * np.sqrt(2)
    return st, 0.16


def sfx_thud(soft=False):
    n = int(0.22 * SR)
    t = t_of(n)
    body = np.sin(2 * np.pi * (85 + 40 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.07)
    paper = filt(noise(n), "lowpass", 2200) * np.exp(-t / 0.035)
    return body * 0.9 + paper * 0.5, (0.22 if soft else 0.42)


def sfx_tape():
    n = int(0.16 * SR)
    t = t_of(n)
    grit = (rng.random(n) < 0.08).astype(float) * rng.uniform(0.5, 1, n)
    grit = filt(grit, "lowpass", 900) * 6
    sig = filt(noise(n), "bandpass", [1800, 7000]) * (0.4 + grit) * np.exp(-t / 0.05) * np.minimum(1, t / 0.006)
    return sig, 0.2


def sfx_swipe(dur):
    n = int((dur + 0.05) * SR)
    u = np.linspace(0, 1, n)
    shape = np.sin(np.pi * np.clip(u * 1.1, 0, 1)) ** 0.8
    sig = filt(noise(n), "bandpass", [2200, 5200]) * shape
    squeak = np.sin(2 * np.pi * (1700 + 300 * u) * t_of(n)) * shape * 0.08
    return sig + squeak, 0.14


def sfx_scribble(dur):
    n = int(dur * SR)
    t = t_of(n)
    strokes = np.zeros(n)
    pos = 0.0
    while pos < dur:
        length = rng.uniform(0.05, 0.11)
        a, b = int(pos * SR), int(min(dur, pos + length) * SR)
        if b > a:
            strokes[a:b] = np.sin(np.linspace(0, np.pi, b - a)) * rng.uniform(0.6, 1)
        pos += length + rng.uniform(0.0, 0.03)
    sig = filt(noise(n), "bandpass", [2500, 8000]) * strokes
    sig *= np.minimum(1, (dur - t) / 0.04).clip(0, 1)
    return sig, 0.12


def sfx_pop(note):
    m = PENTA[(note if isinstance(note, int) else 3) % len(PENTA)]
    f = mtof(m)
    n = int(0.22 * SR)
    t = t_of(n)
    sweep = f * (0.72 + 0.28 * (1 - np.exp(-t / 0.012)))
    sig = np.sin(2 * np.pi * np.cumsum(sweep) / SR) * np.exp(-t / 0.07) * np.minimum(1, t / 0.002)
    return sig, 0.16


def sfx_tick():
    n = int(0.03 * SR)
    t = t_of(n)
    return np.sin(2 * np.pi * 2300 * t) * np.exp(-t / 0.004), 0.06


def sfx_rise(dur):
    n = int((dur + 0.3) * SR)
    t = t_of(n)
    u = np.clip(t / dur, 0, 1)
    f = mtof(67) * 2 ** (u * 1.4)
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.3 + 0.7 * u) * np.exp(-np.maximum(0, t - dur) / 0.08)
    return sig * np.minimum(1, t / 0.02), 0.05


def sfx_click():
    n = int(0.06 * SR)
    t = t_of(n)
    sig = (np.sin(2 * np.pi * 1300 * t) + 0.5 * np.sin(2 * np.pi * 3100 * t)) * np.exp(-t / 0.006) + np.sin(2 * np.pi * 140 * t) * np.exp(-t / 0.02) * 0.6
    return sig, 0.28


def sfx_flip():
    n = int(0.45 * SR)
    u = np.linspace(0, 1, n)
    shape = np.sin(np.pi * u) ** 2
    sig = filt(noise(n), "bandpass", [600, 4000]) * shape
    flap = np.zeros(n)
    k = int(0.38 * SR)
    flap[k:] = filt(noise(n - k), "lowpass", 3000) * np.exp(-t_of(n - k) / 0.02)
    return sig * 0.7 + flap, 0.22


def sfx_chime(note):
    f = mtof(PENTA[min((note or 0) + 2, 5)])  # capped at C6 so it never gets shrill
    return bell(f, 0.6, 1.0), 0.12


def sfx_buzz():
    n = int(0.24 * SR)
    t = t_of(n)
    sig = np.sign(np.sin(2 * np.pi * 150 * t)) + np.sign(np.sin(2 * np.pi * 158 * t))
    sig = filt(sig, "lowpass", 900) * np.exp(-t / 0.09) * np.minimum(1, t / 0.004)
    return sig, 0.08


def sfx_slide():
    n = int(0.32 * SR)
    u = np.linspace(0, 1, n)
    return filt(noise(n), "bandpass", [700, 3200]) * np.sin(np.pi * u) ** 1.5, 0.08


def sfx_drop():
    n = int(0.5 * SR)
    t = t_of(n)
    f = 700 * np.exp(-t / 0.25) + 160
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3) * np.minimum(1, t / 0.01)
    return sig, 0.07


def sfx_crash(k):
    n = int(0.3 * SR)
    t = t_of(n)
    f = [196, 175, 220, 165, 233][k % 5]
    wood = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.06) + 0.4 * np.sin(2 * np.pi * f * 2.7 * t) * np.exp(-t / 0.02)
    clack = filt(noise(n), "bandpass", [800, 3500]) * np.exp(-t / 0.02)
    return wood + clack * 0.6, 0.2


def sfx_flick(k):
    n = int(0.07 * SR)
    t = t_of(n)
    lo, hi = 2000 + 120 * (k % 5), 6000
    return filt(noise(n), "bandpass", [lo, hi]) * np.exp(-t / 0.014), 0.14


def sfx_stamp():
    n = int(1.2 * SR)
    t = t_of(n)
    boom = np.sin(2 * np.pi * (52 + 60 * np.exp(-t / 0.03)) * t) * np.exp(-t / 0.35)
    thwack = filt(noise(n), "lowpass", 2500) * np.exp(-t / 0.05)
    return np.tanh(1.5 * (boom + thwack * 0.6)), 0.5


for i, c in enumerate(meta["cues"]):
    kind, at = c["type"], c["t"]
    if kind == "whoosh":
        sig, g = sfx_whoosh(c.get("dur", 0.8), i)
    elif kind == "thud":
        sig, g = sfx_thud(bool(c.get("soft")))
    elif kind == "tape":
        sig, g = sfx_tape()
    elif kind == "swipe":
        sig, g = sfx_swipe(c.get("dur", 0.3))
    elif kind == "scribble":
        sig, g = sfx_scribble(c.get("dur", 0.5))
    elif kind == "pop":
        sig, g = sfx_pop(c.get("note"))
    elif kind == "tick":
        sig, g = sfx_tick()
    elif kind == "rise":
        sig, g = sfx_rise(c.get("dur", 0.8))
    elif kind == "click":
        sig, g = sfx_click()
    elif kind == "flip":
        sig, g = sfx_flip()
    elif kind == "chime":
        sig, g = sfx_chime(c.get("note"))
    elif kind == "buzz":
        sig, g = sfx_buzz()
    elif kind == "slide":
        sig, g = sfx_slide()
    elif kind == "drop":
        sig, g = sfx_drop()
    elif kind == "crash":
        sig, g = sfx_crash(c.get("k", 0))
    elif kind == "flick":
        sig, g = sfx_flick(c.get("k", 0))
    elif kind == "stamp":
        sig, g = sfx_stamp()
    else:
        print("unknown cue", kind, file=sys.stderr)
        continue
    pan = 0.0 if sig.ndim > 1 else float(rng.uniform(-0.25, 0.25))
    add(fx, at, sig, g, pan=pan)

fx_bus = reverb(fx * 1.0, 0.12)
mix = music * 0.75 + fx_bus * 1.3
mix = np.tanh(mix * 1.15) / 1.15  # gentle soft clip
mix /= np.max(np.abs(mix)) / 0.89
wavfile.write(os.path.join(OUT, "promo-audio.wav"), SR, (mix * 32767).astype(np.int16))
print(f"wrote out/promo-audio.wav  {DUR:.2f}s  peak {np.max(np.abs(mix)):.2f}")

if os.environ.get("STEMS"):
    for name, sig in (("stem-music", music * 0.75), ("stem-fx", fx_bus * 1.3)):
        wavfile.write(os.path.join(OUT, f"{name}.wav"), SR, (np.clip(sig, -1, 1) * 32767).astype(np.int16))
