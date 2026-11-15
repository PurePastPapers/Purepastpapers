#!/usr/bin/env python3
"""Package lossless crop bytes into per-booklet static asset catalogues.

Browsers request a booklet catalogue only when its first question is opened.
The public repository contains these catalogues, not duplicate crop caches.
"""
import base64
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[2]
index = json.loads((root/'data/packs/index.json').read_text())
for entry in index['packs']:
    if not entry['file'].startswith('maths/'):
        continue
    pack_path = root/'data/packs'/entry['file']
    text = pack_path.read_text()
    pack = json.loads(text)
    paper = pack['papers'][0]['paper_id']
    names = set(re.findall(r'assets/maths/'+paper+r'/([A-Za-z0-9_]+\.webp)', text))
    assets = {}
    for name in sorted(names):
        data = (root/'assets/maths'/paper/name).read_bytes()
        assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
    target = root/'data/maths-assets'/f'{paper}.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps({'format': 'lossless-webp-catalogue-v1', 'paper_id': paper, 'assets': assets}, separators=(',', ':'))+'\n')
    print(paper, len(assets), target.stat().st_size, flush=True)
