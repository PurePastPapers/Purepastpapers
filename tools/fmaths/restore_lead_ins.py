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
    name = asset_name(question).removesuffix('.webp') + '_source_lead.webp'
    target = temporary / name
    renderer.render(regions, target)
    buffer = target.read_bytes()
    assets[name] = {'sha256': hashlib.sha256(buffer).hexdigest(), 'base64': base64.b64encode(buffer).decode('ascii')}
    context['lead_in_image_url'] = f'assets/fmaths/{paper_id}/{name}'
    provenance['source_lead_in_regions'] = regions
    if plan.get('standalone_already_has_context') or covers(provenance.get('context_regions', []), regions):
        provenance['source_lead_in_in_stem'] = True
    else:
        provenance.pop('source_lead_in_in_stem', None)


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
