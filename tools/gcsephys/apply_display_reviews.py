#!/usr/bin/env python3
"""Replay source-checked GCSE Physics display reviews after refining part crops."""

import argparse
import base64
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

from PIL import Image

from render import SourceRenderer

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools' / 'maths'))
sys.path.insert(0, str(ROOT / 'tools' / 'assets'))
from apply_part_display_overrides import apply_overrides, resolve_source
from compact import colourful, compact, photo


class ReviewedRenderer(SourceRenderer):
    def render(self, regions, output):
        super().render(regions, output)
        with Image.open(io.BytesIO(output.read_bytes())) as image:
            rgb = image.convert('RGB')
        if not colourful(rgb) and not photo(rgb):
            data = compact(rgb)
            if data and len(data) < output.stat().st_size:
                output.write_bytes(data)


def apply_full_question_review(renderer, offset, pack, question, entry, catalogue):
    regions = entry['full_question_regions']
    source_regions = [{**region, 'page': region['page'] + offset} for region in regions]
    name = question['context']['full_question_image_url'].rsplit('/', 1)[-1]
    with TemporaryDirectory() as directory:
        output = Path(directory) / name
        renderer.render(source_regions, output)
        data = output.read_bytes()
    catalogue['assets'][name] = {'sha256': hashlib.sha256(data).hexdigest(),
                                 'base64': base64.b64encode(data).decode('ascii')}
    for sibling in pack['questions']:
        if sibling['parent_question_id'] == question['parent_question_id']:
            sibling['provenance']['full_question_regions'] = regions


def apply_reviews(sources, root=ROOT, paper_ids=None, require_sources=False):
    imports = root / 'data/imports/gcsephys'
    packs = root / 'data/packs/gcsephys'
    catalogues = root / 'data/gcsephys-assets'
    reviewed = json.loads((imports / 'part-display-overrides.json').read_text())
    selected = {qid.rsplit('_Q', 1)[0] for qid in reviewed}
    count, missing = apply_overrides(sources, ReviewedRenderer, root, paper_ids=paper_ids,
                                     require_sources=require_sources, slug='gcsephys')
    if paper_ids is not None:
        selected &= set(paper_ids)
    selected -= set(missing)
    image_counts = Counter()
    for path in sorted(packs.glob('*.json')):
        pack = json.loads(path.read_text())
        catalogue_path = catalogues / path.name
        catalogue = json.loads(catalogue_path.read_text())
        if path.stem in selected:
            touched_full = False
            renderer = None
            for question in pack['questions']:
                entry = reviewed.get(question['question_id'], {})
                if not entry:
                    continue
                provenance = question['provenance']
                if 'reviewed_dependencies' in entry:
                    required = entry['reviewed_dependencies']
                    provenance['reviewed_dependencies'] = required
                    if required:
                        question['depends_on_question_ids'] = required
                    else:
                        question.pop('depends_on_question_ids', None)
                if renderer is None and ('source_regions' in entry or 'full_question_regions' in entry):
                    source, offset = resolve_source(sources, path.stem, provenance, 'question', 'qp')
                    renderer = ReviewedRenderer(str(source))
                if 'full_question_regions' in entry:
                    apply_full_question_review(renderer, offset, pack, question, entry, catalogue)
                    touched_full = True
                if 'source_regions' in entry:
                    provenance.pop('own_rows_from_full', None)
                    provenance['source_region_page_pixels'] = [list(renderer.page(region['page'] + offset - 1).size)
                                                               for region in entry['source_regions']]
                if 'context_regions' not in entry:
                    continue
                for key in ('context_includes_stem_image', 'context_rows_from_full',
                            'context_siblings_removed', 'context_recut_from_full',
                            'context_from_linked_part', 'context_named_parts', 'context_named_by'):
                    provenance.pop(key, None)
                if entry['context_regions']:
                    provenance['context_basis'] = 'shared_stem'
                    provenance['context_reasons'] = ['reviewed printed context']
                elif question.get('depends_on_question_ids'):
                    provenance['context_basis'] = 'grouped_dependency'
                    provenance['context_reasons'] = ['reviewed required answer from an earlier part']
                else:
                    provenance['context_basis'] = 'independent'
                    provenance.pop('context_reasons', None)
            path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
            if touched_full:
                catalogue_path.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(',', ':')) + '\n')
        paper = pack['papers'][0]
        group = f"{paper['qualification_code']} {paper['tier']}"
        group += ' official samples' if paper.get('is_official_sample') else ' exams'
        image_counts[group] += len(catalogue['assets'])
    coverage_path = imports / 'coverage.json'
    coverage = json.loads(coverage_path.read_text())
    for group, amount in image_counts.items():
        coverage['groups'][group]['image_assets'] = amount
    coverage['totals']['image_assets'] = sum(image_counts.values())
    coverage_path.write_text(json.dumps(coverage, ensure_ascii=False, indent=2) + '\n')
    return count


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', required=True, type=Path)
    parser.add_argument('--root', default=ROOT, type=Path)
    args = parser.parse_args()
    print(f'Applied {apply_reviews(args.sources, args.root, require_sources=True)} GCSE Physics display reviews')
