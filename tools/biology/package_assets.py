#!/usr/bin/env python3
"""Package lossless Biology crop bytes into per-booklet lazy asset catalogues.

Browsers fetch data/biology-assets/<PAPER>.json only when a question from that
booklet is shown (js/data/source-images.js). Bytes are never recompressed; each
asset keeps its SHA256. The crop cache assets/biology/ is not committed.
"""
import base64
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[2]
index = json.loads((root / 'data/packs/index.json').read_text())
for entry in index['packs']:
    if not entry['file'].startswith('biology/'):
        continue
    text = (root / 'data/packs' / entry['file']).read_text()
    paper = json.loads(text)['papers'][0]['paper_id']
    names = set(re.findall(r'assets/biology/' + paper + r'/([A-Za-z0-9_]+\.webp)', text))
    assets = {}
    for name in sorted(names):
        data = (root / 'assets/biology' / paper / name).read_bytes()
        assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
    target = root / 'data/biology-assets' / f'{paper}.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({'format': 'lossless-webp-catalogue-v1', 'paper_id': paper, 'assets': assets},
                                 separators=(',', ':')) + '\n')
    print(paper, len(assets), target.stat().st_size, flush=True)
