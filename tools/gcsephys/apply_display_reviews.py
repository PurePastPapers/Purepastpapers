#!/usr/bin/env python3
"""Replay source-checked GCSE Physics display reviews after refining part crops."""

import argparse
from collections import Counter
import io
import json
from pathlib import Path
import sys

from PIL import Image

from render import SourceRenderer

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools' / 'maths'))
sys.path.insert(0, str(ROOT / 'tools' / 'assets'))
from apply_part_display_overrides import apply_overrides
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


def apply_reviews(sources, root=ROOT):
    imports = root / 'data/imports/gcsephys'
    packs = root / 'data/packs/gcsephys'
    catalogues = root / 'data/gcsephys-assets'
    reviewed = json.loads((imports / 'part-display-overrides.json').read_text())
    selected = {qid.rsplit('_Q', 1)[0] for qid in reviewed}
    count, _ = apply_overrides(sources, ReviewedRenderer, root, require_sources=True, slug='gcsephys')
    image_counts = Counter()
    for path in sorted(packs.glob('*.json')):
        pack = json.loads(path.read_text())
        if path.stem in selected:
            for question in pack['questions']:
                entry = reviewed.get(question['question_id'], {})
                if 'context_regions' not in entry:
                    continue
                provenance = question['provenance']
                for key in ('context_includes_stem_image', 'context_rows_from_full',
                            'context_siblings_removed', 'context_recut_from_full',
                            'context_from_linked_part', 'context_named_parts'):
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
        paper = pack['papers'][0]
        group = f"{paper['qualification_code']} {paper['tier']}"
        group += ' official samples' if paper.get('is_official_sample') else ' exams'
        catalogue = json.loads((catalogues / path.name).read_text())
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
    print(f'Applied {apply_reviews(args.sources, args.root)} GCSE Physics display reviews')
