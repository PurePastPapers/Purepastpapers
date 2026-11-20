#!/usr/bin/env python3
"""Restore crops that tools/assets/compact.py washed out to light grey.

compact.py used PIL's median-cut quantize(), which represents each grey bucket by its
average. Where a crop was mostly a light graph grid, black text shared a bucket with the
grid lines and was stored at grey 160-175 (audit 2026-11-19). The original renders are in
Git history, so each affected crop is rebuilt from its own original pixels:

1. candidates: compacted crops (16 grey levels or fewer) whose darkest level is >= 80;
2. the newest earlier version of the same catalogue entry with more than 16 levels is the
   original. It must have the same size and the current crop must be a monotone mapping of
   it (each current level covers one contiguous, ordered range of original greys), which
   proves they are the same pixels;
3. the original is re-encoded with compact.grey_levels() and kept when its darkest level
   is at least 30 darker than the current one.

sha256 values are updated; asset names and counts are unchanged. Needs full Git history
(git fetch --filter=blob:none origin main). Idempotent.

    python3 tools/assets/restore-tones.py [--dry-run] [--report out.json]
"""
import base64, collections, hashlib, io, json, subprocess, sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import compact as C  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data'
DARKEST = 80     # a compacted crop whose darkest grey is at or above this is checked
GAIN = 30        # restore only when the rebuilt crop is at least this much darker
MAX_LEVELS = C.TONE_LEVELS


def git(*args):
    return subprocess.run(['git', '-C', str(ROOT), *args], check=True, capture_output=True).stdout


def grey_of(b64):
    return np.asarray(C.decode(b64).convert('L'))


def monotone(orig, cur):
    """True when every current level is one contiguous range of original greys, in order."""
    ranges = []
    for level in np.unique(cur):
        sel = orig[cur == level]
        ranges.append((int(sel.min()), int(sel.max())))
    return all(ranges[i][1] < ranges[i + 1][0] for i in range(len(ranges) - 1))


def main():
    dry = '--dry-run' in sys.argv
    report_path = sys.argv[sys.argv.index('--report') + 1] if '--report' in sys.argv else None
    history = {}
    blobs = {}
    report = collections.defaultdict(list)
    for path in sorted(DATA.glob('*-assets/*.json')):
        catalogue = json.loads(path.read_text())
        rel = str(path.relative_to(ROOT))
        changed = False
        for name, asset in catalogue['assets'].items():
            cur = grey_of(asset['base64'])
            if len(np.unique(cur)) > MAX_LEVELS or cur.min() < DARKEST:
                continue
            if rel not in history:
                history[rel] = git('log', '--format=%H', 'HEAD', '--', rel).decode().split()
            found = None
            for commit in history[rel]:
                key = (commit, rel)
                if key not in blobs:
                    try:
                        blobs[key] = json.loads(git('show', f'{commit}:{rel}'))['assets']
                    except subprocess.CalledProcessError:
                        blobs[key] = {}
                old = blobs[key].get(name)
                if not old:
                    continue
                orig = grey_of(old['base64'])
                if len(np.unique(orig)) > MAX_LEVELS:
                    found = (commit, orig)
                    break
            entry = f'{path.parent.name[:-7]}/{path.stem}/{name}'
            if not found:
                report['no_original'].append(entry)
                continue
            commit, orig = found
            if orig.shape != cur.shape or not monotone(orig, cur):
                report['different_pixels'].append(f'{entry} @ {commit[:7]}')
                continue
            rebuilt = C.grey_levels(Image.fromarray(orig, 'L'), C.levels(Image.fromarray(orig, 'L')))
            darkest = int(np.asarray(rebuilt).min())
            if cur.min() - darkest < GAIN:
                report['not_washed_out'].append(f'{entry} {int(cur.min())}->{darkest}')
                continue
            data = C.encode(rebuilt)
            report['restored'].append(f'{entry} {int(cur.min())}->{darkest} @ {commit[:7]}')
            if not dry:
                asset['base64'] = base64.b64encode(data).decode('ascii')
                asset['sha256'] = hashlib.sha256(data).hexdigest()
                changed = True
        blobs.clear()  # versions of this catalogue are no longer needed
        if changed:
            path.write_text(json.dumps(catalogue, separators=(',', ':')))
    for key, items in report.items():
        print(f'{key}: {len(items)}')
    if report_path:
        Path(report_path).write_text(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
