#!/usr/bin/env python3
"""Restore tall inline maths and one reviewed shared lead-in in Core Pure crops.

Run after refine.py and before lead-ins.py and asset compaction. The existing
question, scheme and asset identities are unchanged. Coordinates were checked
against the original exam PDFs in MediaBox points.
"""
import argparse
import base64
import hashlib
import json
import sys
import tempfile
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/maths'))
from extract import digest
from render import SourceRenderer

TOPS = {
    'EDX_9FM0_2020_AUTUMN_P2': {'05_U03': 325.0},
    'EDX_9FM0_2021_AUTUMN_P2': {'03_U02': 163.0, '05_U02': 241.0, '07_U01': 418.0},
    'EDX_9FM0_2022_JUNE_P1': {'09_U01': 89.0, '09_U02': 139.2},
    'EDX_9FM0_2022_JUNE_P2': {'01_U02': 527.0, '05_U02': 236.0, '07_U01': 433.0,
                             '07_U02': 520.0, '09_U02': 189.0},
    'EDX_9FM0_2023_JUNE_P1': {'03_U02': 278.0, '06_U02': 357.0},
    'EDX_9FM0_2024_JUNE_P2': {'06_U02': 222.0},
    'EDX_9FM0_2025_JUNE_P2': {'01_U01': 201.0, '07_U02': 468.0, '09_U01': 130.0,
                             '09_U02': 274.0},
}
Z2_PAPER = 'EDX_9FM0_2023_JUNE_P1'
EMPTY_STEM_PAPER = 'EDX_9FM0_2022_JUNE_P1'


def asset_bytes(renderer, regions, target, assets):
    renderer.render(regions, target)
    data = target.read_bytes()
    assets[target.name] = {'sha256': hashlib.sha256(data).hexdigest(),
                           'base64': base64.b64encode(data).decode('ascii')}


def restore_z2(unit, renderer, page_height, temporary, assets):
    """Add the printed z₂ definition to (b) and (c) without adding scored text."""
    key = unit['question_id'].partition('_Q')[2]
    if key not in {'03_U02', '03_U03', '03_U04'}:
        return
    prov = unit['provenance']
    context = unit['context']
    existing = prov['context_regions']
    head = existing[0]
    page = head['page']
    if page != 6:
        raise ValueError(f"{unit['question_id']}: recheck z2 context page")
    tail = 247.0 if key == '03_U04' else 276.0
    box = [head['bbox'][0], 206.0 / page_height, head['bbox'][2], tail / page_height]
    regions = [head, {'page': page, 'bbox': box}]
    prov['context_regions'] = regions
    if key == '03_U02':
        prov['context_bridge_text'] = 'Definition of z₂ and instructions for part (b)'
    name = context['stem_image_url'].rsplit('/', 1)[1]
    asset_bytes(renderer, regions, temporary / name, assets)


def update_paper(paper_id, source, expected, temporarily):
    pack_path = ROOT / 'data/packs/fmaths' / f'{paper_id}.json'
    catalogue_path = ROOT / 'data/fmaths-assets' / f'{paper_id}.json'
    if digest(source) != expected:
        raise ValueError(f'{paper_id}: question PDF revision differs from the reviewed inventory')
    pack = json.loads(pack_path.read_text())
    catalogue = json.loads(catalogue_path.read_text())
    assets = catalogue['assets']
    renderer = SourceRenderer(source)
    with pdfplumber.open(source) as document:
        heights = {i + 1: page.height for i, page in enumerate(document.pages)}
    changed = set()
    count = 0
    previous = None
    for unit in pack['questions']:
        key = unit['question_id'].partition('_Q')[2]
        prov = unit['provenance']
        if prov['question_source_sha256'] != expected:
            raise ValueError(f"{unit['question_id']}: expected unchanged source identity")
        if key in TOPS[paper_id]:
            region = prov['source_regions'][0]
            top = TOPS[paper_id][key] / heights[region['page']]
            if abs(region['bbox'][1] - top) > .03 or top >= region['bbox'][3]:
                raise ValueError(f"{unit['question_id']}: crop layout changed")
            region['bbox'][1] = top
            changed.add(unit['question_id'])
            if previous and previous['parent_question_id'] == unit['parent_question_id']:
                tail = previous['provenance']['source_regions'][-1]
                if tail['page'] == region['page'] and tail['bbox'][3] > top:
                    # The same tall equation must not also appear at the bottom of
                    # an earlier part. The reviewed cutoff keeps its printed tariff.
                    tail['bbox'][3] = top
                    changed.add(previous['question_id'])
            count += 1
        if paper_id == Z2_PAPER:
            restore_z2(unit, renderer, heights[6], temporarily, assets)
        if paper_id == EMPTY_STEM_PAPER and unit['question_number'] == '9':
            url = unit.get('context', {}).pop('stem_image_url', None)
            if url:
                assets.pop(url.rsplit('/', 1)[-1], None)
                for field in ('context_regions', 'context_reasons', 'context_includes_stem_image'):
                    prov.pop(field, None)
        previous = unit
    for unit in pack['questions']:
        if unit['question_id'] in changed:
            name = unit['content']['question_image_url'].rsplit('/', 1)[1]
            asset_bytes(renderer, unit['provenance']['source_regions'], temporarily / name, assets)
    if count != len(TOPS[paper_id]):
        raise ValueError(f'{paper_id}: reviewed unit IDs did not all resolve')
    pack_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
    catalogue_path.write_text(json.dumps(catalogue, separators=(',', ':')))
    print(f'{paper_id}: {count} crop tops reviewed and repaired', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--paper', action='append', choices=sorted(TOPS))
    args = parser.parse_args()
    inventory = json.loads((ROOT / 'data/imports/fmaths/inventory/9fm0-inventory.json').read_text())
    checksums = {p['paper_id']: p['documents']['question_paper']['sha256'] for p in inventory['papers']}
    with tempfile.TemporaryDirectory(prefix='fmaths-crop-review-') as tmp:
        for pid in args.paper or TOPS:
            update_paper(pid, args.sources / pid / 'question_paper.pdf', checksums[pid], Path(tmp))


if __name__ == '__main__':
    main()
