#!/usr/bin/env python3
"""Locate official tracked MP3 files within their official continuous recording."""
import concurrent.futures
import hashlib
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

import numpy as np
from scipy.signal import correlate

RATE = 2205


def decoded(blob):
    args = ['ffmpeg', '-v', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-']
    return np.frombuffer(subprocess.check_output(args, input=blob), dtype=np.float32)


def checksum(path, expected):
    data = path.read_bytes()
    assert hashlib.sha256(data).hexdigest() == expected
    return data


def offset(full, tracked):
    # Avoid encoder padding and ensure the entire search window fits the long file.
    width = min(2 * RATE, len(tracked) // 2)
    candidates = range(RATE // 5, len(tracked) - width - RATE // 8, width // 3)
    anchor = max(candidates, key=lambda i: np.dot(tracked[i:i+width], tracked[i:i+width]))
    clip = tracked[anchor:anchor+width]
    scores = correlate(full, clip, mode='valid', method='fft')
    index = int(scores.argmax())
    same = full[index:index+width]
    match = float(scores[index] / np.sqrt(np.dot(clip, clip) * np.dot(same, same)))
    return (index - anchor) / RATE, match


def align(series, manifest, assets, survey):
    belong = [d for d in manifest if d['name'].upper().startswith('AQA-76921-') and series in d['name'].upper()]
    archive = next(d for d in belong if 'TRACKED' in d['name'].upper() and d['name'].lower().endswith('.zip'))
    continuous = next(d for d in belong if d['name'].lower().endswith('.mp3'))
    archive_path = assets / archive['name']
    checksum(archive_path, archive['sha256'])
    mp3_path = assets / continuous['name']
    full = decoded(checksum(mp3_path, continuous['sha256']))
    cues = {int(track) for q in survey['questions'].values() if (tracks := q['tracks']) for track in tracks}
    positions = {}
    with zipfile.ZipFile(archive_path) as z:
        tracks = {int(m[1]): name for name in z.namelist() if (m := re.search(r'(\d+)\.mp3$', name, re.I))}
        assert max(tracks) == max(cues), (series, max(tracks), max(cues))
        assert set(tracks) == set(range(1, max(tracks) + 1))
        starting = {q['tracks'][0] for q in survey['questions'].values() if q['tracks']}
        for track in sorted(cues):
            blob = z.read(tracks[track])
            if track not in starting:
                continue
            start, match = offset(full, decoded(blob))
            assert match > 0.80, (series, track, start, match)
            positions[track] = (start, match)
    ranges = []
    for number, q in survey['questions'].items():
        if not q['tracks']:
            continue
        first, last = q['tracks']
        start, match = positions[first]
        end = positions[last + 1][0] if last + 1 in positions else None
        assert (end if end is not None else len(full) / RATE) > start
        ranges.append({'question': int(number), 'tracks': [first, last], 'from_seconds': round(start, 3),
                       'to_seconds': round(end, 3) if end is not None else None, 'first_track_match': round(match, 4)})
    return series, {'source_audio': continuous['url'], 'audio_sha256': continuous['sha256'],
                    'source_track_archive': archive['url'], 'track_archive_sha256': archive['sha256'],
                    'alignment': ranges}


def main(source, survey_path):
    manifest = json.loads((source / 'official-manifest.json').read_text())
    assets = source / 'assets'
    survey = json.loads(survey_path.read_text())
    series = ('NOV21', 'JUN22', 'JUN23', 'JUN24', 'JUN25')
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        tasks = [pool.submit(align, s, manifest, assets, survey[s]) for s in series]
        result = dict(task.result() for task in tasks)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
