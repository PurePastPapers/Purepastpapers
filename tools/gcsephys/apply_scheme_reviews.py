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
    questions = pack['questions']
    source, offset = resolve_source(sources, paper_id, questions[0]['provenance'], 'scheme', 'ms')
    if source is None:
        raise ValueError(f'No checksum-matched scheme PDF for {paper_id}')
    renderer = ReviewedRenderer(str(source))
    with TemporaryDirectory() as directory:
        for parent, entry in reviews.items():
            siblings = [q for q in questions if q['parent_question_id'] == parent]
            if not siblings or any(q['provenance']['scheme_source_sha256'] != entry['scheme_source_sha256'] for q in siblings):
                raise ValueError(f'Question or scheme revision changed for {parent}')
            name = f'Q{int(siblings[0]["question_number"]):02}_scheme.webp'
            if name not in catalogue['assets']:
                raise ValueError(f'Missing whole-question scheme asset {name} in {paper_id}')
            regions = entry['scheme_regions']
            source_regions = [{**region, 'page': region['page'] + offset} for region in regions]
            output = Path(directory) / name
            renderer.render(source_regions, output)
            data = output.read_bytes()
            catalogue['assets'][name] = {'sha256': hashlib.sha256(data).hexdigest(),
                                         'base64': base64.b64encode(data).decode('ascii')}
            page_pixels = [list(renderer.page(region['page'] - 1).size) for region in source_regions]
            for q in siblings:
                q['provenance']['scheme_regions'] = regions
                q['provenance']['scheme_region_page_pixels'] = page_pixels
                q['provenance']['full_scheme_review'] = entry['review']
    catalogue_path.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(',', ':')) + '\n')
    pack_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
    return paper_id, len(reviews)


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
    with ProcessPoolExecutor(max_workers=workers) as executor:
        for _, reviewed in executor.map(apply_paper, jobs):
            count += reviewed
    return count


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', required=True, type=Path)
    parser.add_argument('--root', default=ROOT, type=Path)
    parser.add_argument('--paper', action='append')
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    print(f'Applied {apply_reviews(args.sources, args.root, args.paper, args.workers)} GCSE Physics full-scheme reviews')
