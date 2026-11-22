#!/usr/bin/env python3
"""Restore reviewed unscored statements between tasks from the source PDFs."""
import argparse
import base64
import hashlib
import json
import re
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/maths'))
from render import SourceRenderer


def asset_name(question):
    return question['content']['question_image_url'].rsplit('/', 1)[-1]


def covers(stem_regions, lead_regions):
    return all(any(r['page'] == lead['page'] and r['bbox'][0] <= lead['bbox'][0] + .004
                   and r['bbox'][1] <= lead['bbox'][1] + .004 and r['bbox'][2] >= lead['bbox'][2] - .004
                   and r['bbox'][3] >= lead['bbox'][3] - .004 for r in stem_regions) for lead in lead_regions)


def without_lead(stem_regions, lead_regions, clear_overlap=False):
    remaining = stem_regions
    for lead in lead_regions:
        lx, lt, rx, lb = lead['bbox']
        current = []
        for region in remaining:
            x0, top, x1, bottom = region['bbox']
            intersects = (region['page'] == lead['page'] and top < lb and bottom > lt
                          and min(x1, rx) - max(x0, lx) >= min(x1 - x0, rx - lx) * .7)
            if not intersects:
                current.append(region)
                continue
            if clear_overlap and top >= lt - .035 and bottom <= lb + .035:
                continue
            if lt - top > .005:
                current.append({**region, 'bbox': [x0, top, x1, lt]})
            if bottom - lb > .005:
                current.append({**region, 'bbox': [x0, lb, x1, bottom]})
        remaining = current
    return remaining


def store_crop(renderer, regions, assets, target):
    renderer.render(regions, target)
    buffer = target.read_bytes()
    assets[target.name] = {'sha256': hashlib.sha256(buffer).hexdigest(),
                           'base64': base64.b64encode(buffer).decode('ascii')}


def add_lead_in(question, plan, renderer, assets, paper_id, temporary):
    provenance = question['provenance']
    if plan['question_source_sha256'] != provenance['question_source_sha256']:
        raise ValueError(f"{question['question_id']}: reviewed source revision changed")
    regions = plan['regions']
    if not regions or any(len(r['bbox']) != 4 or not (0 <= r['bbox'][0] < r['bbox'][2] <= 1
                                                      and 0 <= r['bbox'][1] < r['bbox'][3] <= 1)
                          for r in regions):
        raise ValueError(f"{question['question_id']}: unsupported lead-in source regions")
    start = provenance['source_regions'][0]
    if any((r['page'], r['bbox'][3]) > (start['page'], start['bbox'][1] + .007) for r in regions):
        raise ValueError(f"{question['question_id']}: lead-in reaches into its scored part")
    context = question.setdefault('context', {})
    stem_name = asset_name(question).removesuffix('.webp')
    name = stem_name + '_source_lead.webp'
    store_crop(renderer, regions, assets, temporary / name)
    context['lead_in_image_url'] = f'assets/fmaths/{paper_id}/{name}'
    provenance['source_lead_in_regions'] = regions
    clear_overlap = plan.get('clear_overlapping_context', False)
    if not clear_overlap and (plan.get('standalone_already_has_context') or covers(provenance.get('context_regions', []), regions)):
        provenance['source_lead_in_in_stem'] = True
    else:
        provenance.pop('source_lead_in_in_stem', None)
        old_stem = provenance.get('context_regions', [])
        if context.get('stem_image_url') and not provenance.get('context_includes_stem_image'):
            stem = without_lead(old_stem, regions, clear_overlap)
            if stem != old_stem:
                provenance['context_regions'] = stem
                context.pop('stem_image_url')
                if stem:
                    name = stem_name + '_source_stem.webp'
                    store_crop(renderer, stem, assets, temporary / name)
                    context['stem_image_url'] = f'assets/fmaths/{paper_id}/{name}'


def apply(paper_id, plans, sources, temporary):
    pack_path = ROOT / 'data/packs/fmaths' / f'{paper_id}.json'
    catalogue_path = ROOT / 'data/fmaths-assets' / f'{paper_id}.json'
    pack = json.loads(pack_path.read_text())
    catalogue = json.loads(catalogue_path.read_text())
    questions = {q['question_id']: q for q in pack['questions']}
    digest = plans[0]['question_source_sha256']
    source_path = sources / f'{digest}.pdf'
    if hashlib.sha256(source_path.read_bytes()).hexdigest() != digest:
        raise ValueError(f'{paper_id}: source PDF differs from reviewed layout')
    renderer = SourceRenderer(source_path)
    for plan in plans:
        add_lead_in(questions[plan['question_id']], plan, renderer, catalogue['assets'], paper_id, temporary)
    content = json.dumps(pack, ensure_ascii=False, indent=2) + '\n'
    names = set(re.findall(r'assets/fmaths/' + paper_id + r'/([A-Za-z0-9_]+\.webp)', content))
    catalogue['assets'] = {name: catalogue['assets'][name] for name in sorted(names)}
    pack_path.write_text(content)
    catalogue_path.write_text(json.dumps(catalogue, separators=(',', ':')) + '\n')
    print(paper_id, len(plans), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--plan', type=Path, action='append', required=True)
    parser.add_argument('--paper', action='append')
    args = parser.parse_args()
    grouped = defaultdict(dict)
    for path in args.plan:
        manifest = json.loads(path.read_text())
        if manifest['format'] != 'fmaths-scoped-lead-ins-v1':
            raise ValueError(f'{path}: unknown lead-in plan format')
        for paper_id, paper in manifest['papers'].items():
            if args.paper and paper_id not in args.paper:
                continue
            for question_id, plan in paper['questions'].items():
                if question_id.rsplit('_Q', 1)[0] != paper_id:
                    raise ValueError(f'{question_id}: lead-in associated with wrong paper')
                grouped[paper_id][question_id] = {**plan, 'question_id': question_id,
                                                   'question_source_sha256': paper['question_source_sha256']}
    with tempfile.TemporaryDirectory(prefix='fmaths-lead-ins-') as directory:
        for paper_id, plans in grouped.items():
            apply(paper_id, list(plans.values()), args.sources, Path(directory))


if __name__ == '__main__':
    main()
