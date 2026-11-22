#!/usr/bin/env python3
"""Package lossless Biology crop bytes into per-booklet lazy asset catalogues.

Browsers fetch data/biology-assets/<PAPER>.json only when a question from that
booklet is shown (js/data/source-images.js). Bytes are never recompressed; each
asset keeps its SHA256. The crop cache assets/biology/ is not committed.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'assets'))
from package_catalogue import package_catalogue

root = Path(__file__).resolve().parents[2]
index = json.loads((root / 'data/packs/index.json').read_text())
for entry in index['packs']:
    if not entry['file'].startswith('biology/'):
        continue
    pack_path = root / 'data/packs' / entry['file']
    paper = json.loads(pack_path.read_text())['papers'][0]['paper_id']
    count = package_catalogue(root, pack_path, 'biology', paper)
    target = root / 'data/biology-assets' / f'{paper}.json'
    print(paper, count, target.stat().st_size, flush=True)
