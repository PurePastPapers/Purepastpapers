#!/usr/bin/env python3
"""Package lossless crop bytes into per-booklet static asset catalogues.

Browsers request a booklet catalogue only when its first question is opened.
The public repository contains these catalogues, not duplicate crop caches.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'assets'))
from package_catalogue import package_catalogue

root = Path(__file__).resolve().parents[2]
index = json.loads((root/'data/packs/index.json').read_text())
for entry in index['packs']:
    if not entry['file'].startswith('maths/'):
        continue
    pack_path = root/'data/packs'/entry['file']
    pack = json.loads(pack_path.read_text())
    paper = pack['papers'][0]['paper_id']
    count = package_catalogue(root, pack_path, 'maths', paper)
    target = root/'data/maths-assets'/f'{paper}.json'
    print(paper, count, target.stat().st_size, flush=True)
