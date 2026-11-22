#!/usr/bin/env python3
"""Replay checksum-verified Pearson GCSE Physics whole-question scheme boundaries."""

import argparse
import base64
from concurrent.futures import ProcessPoolExecutor
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from apply_display_reviews import ROOT, ReviewedRenderer, resolve_source


def apply_paper(job):
    root, sources, paper_id, reviews = job
    pack_path = root / 'data/packs/gcsephys' / f'{paper_id}.json'
    catalogue_path = root / 'data/gcsephys-assets' / pack_path.name
    pack = json.loads(pack_path.read_text())
    catalogue = json.loads(catalogue_path.read_text())
    count_before = len(catalogue['assets'])
    questions = pack['questions']
    source, offset = resolve_source(sources, paper_id, questions[0]['provenance'], 'scheme', 'ms')
    if source is None:
        raise ValueError(f'No checksum-matched scheme PDF for {paper_id}')
    renderer = ReviewedRenderer(str(source))
    with TemporaryDirectory() as directory:
        for record, entry in reviews.items():
            part = entry.get('scheme_scope') == 'part'
            key = 'question_id' if part else 'parent_question_id'
            targets = [q for q in questions if q[key] == record]
            if not targets or any(q['provenance']['scheme_source_sha256'] != entry['scheme_source_sha256'] for q in targets):
                raise ValueError(f'Question or scheme revision changed for {record}')
            name = f'{record.removeprefix(paper_id + "_")}_scheme.webp'
            if not part and name not in catalogue['assets']:
                raise ValueError(f'Missing whole-question scheme asset {name} in {paper_id}')
            regions = entry['scheme_regions']
            source_regions = [{**region, 'page': region['page'] + offset} for region in regions]
            output = Path(directory) / name
            renderer.render(source_regions, output)
            data = output.read_bytes()
            catalogue['assets'][name] = {'sha256': hashlib.sha256(data).hexdigest(),
                                         'base64': base64.b64encode(data).decode('ascii')}
            page_pixels = [list(renderer.page(region['page'] - 1).size) for region in source_regions]
            for q in targets:
                if part:
                    whole = f'Q{int(q["question_number"]):02}_scheme.webp'
                    if whole not in catalogue['assets']:
                        raise ValueError(f'Missing full scheme fallback {whole} in {paper_id}')
                    q['context']['full_scheme_image_url'] = f'assets/gcsephys/{paper_id}/{whole}'
                    q['content']['mark_scheme_image_url'] = f'assets/gcsephys/{paper_id}/{name}'
                    q['scheme_scope'] = 'part'
                    q['provenance']['part_scheme_regions'] = regions
                    q['provenance']['part_scheme_region_page_pixels'] = page_pixels
                    q['provenance']['part_scheme_check'] = 'verified'
                    q['provenance']['part_scheme_review'] = entry['review']
                else:
                    q['provenance']['scheme_regions'] = regions
                    q['provenance']['scheme_region_page_pixels'] = page_pixels
                    q['provenance']['full_scheme_review'] = entry['review']
    catalogue_path.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(',', ':')) + '\n')
    pack_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
    paper = pack['papers'][0]
    group = f"{paper['qualification_code']} {paper['tier']}"
    group += ' official samples' if paper.get('is_official_sample') else ' exams'
    return group, len(reviews), len(catalogue['assets']) - count_before


def apply_reviews(sources, root=ROOT, paper_ids=None, workers=1):
    path = root / 'data/imports/gcsephys/scheme-display-overrides.json'
    reviews = json.loads(path.read_text())
    by_paper = {}
    for parent, review in reviews.items():
        paper_id = parent.rsplit('_Q', 1)[0]
        if paper_ids is None or paper_id in paper_ids:
            by_paper.setdefault(paper_id, {})[parent] = review
    jobs = [(root, sources, paper_id, records) for paper_id, records in by_paper.items()]
    count = 0
    coverage_path = path.parent / 'coverage.json'
    coverage = json.loads(coverage_path.read_text())
    with ProcessPoolExecutor(max_workers=workers) as executor:
        for group, reviewed, additional_assets in executor.map(apply_paper, jobs):
            count += reviewed
            coverage['groups'][group]['image_assets'] += additional_assets
            coverage['totals']['image_assets'] += additional_assets
    coverage_path.write_text(json.dumps(coverage, ensure_ascii=False, indent=2) + '\n')
    return count


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', required=True, type=Path)
    parser.add_argument('--root', default=ROOT, type=Path)
    parser.add_argument('--paper', action='append')
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    print(f'Applied {apply_reviews(args.sources, args.root, args.paper, args.workers)} GCSE Physics scheme reviews')
