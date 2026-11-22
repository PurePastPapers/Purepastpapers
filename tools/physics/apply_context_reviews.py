#!/usr/bin/env python3
"""Rebuild reviewed Physics part displays from checksum-matched question papers."""

import argparse
import base64
import hashlib
import json
import re
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

from render import SourceRenderer

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/assets'))
from compact import colourful, compact, photo


def source_for(directory, paper_id, digest):
    for name in (f'{digest}.pdf', f'{paper_id}-QP.pdf'):
        path = directory / name
        if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == digest:
            return path
    raise ValueError(f'{paper_id}: cannot find source PDF with SHA256 {digest}')


def apply_reviews(root, sources):
    reviews = json.loads((root / 'data/imports/physics/context-reviews.json').read_text())
    for paper_id, review in reviews.items():
        digest = review['source_sha256']
        renderer = SourceRenderer(source_for(sources, paper_id, digest))
        pack_path = root / 'data/packs/physics' / f'{paper_id}.json'
        catalogue_path = root / 'data/physics-assets' / f'{paper_id}.json'
        pack = json.loads(pack_path.read_text())
        catalogue_text = catalogue_path.read_text()
        catalogue = json.loads(catalogue_text)
        assets = catalogue['assets']
        questions = {question['question_id']: question for question in pack['questions']}
        old_stems = set()

        with TemporaryDirectory() as output:
            def render(name, regions):
                output_path = Path(output) / name
                renderer.render(regions, output_path)
                data = output_path.read_bytes()
                with Image.open(output_path) as crop:
                    rgb = crop.convert('RGB')
                    if not colourful(rgb) and not photo(rgb):
                        recoded = compact(rgb)
                        if recoded and len(recoded) < len(data):
                            data = recoded
                assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode('ascii')}
                return f'assets/physics/{paper_id}/{name}'

            for question_id, correction in review['questions'].items():
                question = questions[question_id]
                provenance = question['provenance']
                if provenance['question_source_sha256'] != digest:
                    raise ValueError(f'{question_id}: question source changed since review')
                context = question.setdefault('context', {})
                old_stem = context.get('stem_image_url')
                if old_stem:
                    old_stems.add(old_stem.rsplit('/', 1)[-1])

                if 'context_regions' in correction:
                    name = f'{question_id.removeprefix(paper_id + "_")}_context.webp'
                    context['stem_image_url'] = render(name, correction['context_regions'])
                    provenance['context_regions'] = correction['context_regions']
                    for field in ('context_includes_stem_image', 'context_regions_refined', 'context_siblings_removed',
                                  'context_siblings_cut_by_pixels', 'context_recut_from_full', 'context_bridge_text'):
                        provenance.pop(field, None)
                if 'source_regions' in correction:
                    name = question['content']['question_image_url'].rsplit('/', 1)[-1]
                    render(name, correction['source_regions'])
                    provenance['source_regions'] = correction['source_regions']
                if 'depends_on' in correction:
                    dependency_id = correction['depends_on']
                    dependency = questions[dependency_id]
                    ordered = list(questions)
                    if ordered.index(dependency_id) >= ordered.index(question_id) or dependency['parent_question_id'] != question['parent_question_id']:
                        raise ValueError(f'{question_id}: invalid reviewed dependency {dependency_id}')
                    question['depends_on_question_ids'] = list(dict.fromkeys([*question.get('depends_on_question_ids', []), dependency_id]))
                provenance['context_reasons'] = [correction['reason']]
                provenance['part_display_review'] = correction['reason']
                provenance['part_display_review_source'] = digest

        pack_text = json.dumps(pack, ensure_ascii=False, indent=2) + '\n'
        references = set(re.findall(rf'assets/physics/{paper_id}/([A-Za-z0-9_]+\.webp)', pack_text))
        for name in old_stems - references:
            assets.pop(name, None)
        pack_path.write_text(pack_text)
        newline = '\n' if catalogue_text.endswith('\n') else ''
        catalogue_path.write_text(json.dumps(catalogue, separators=(',', ':')) + newline)
        print(f'{paper_id}: {len(review["questions"])} contexts reviewed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    apply_reviews(args.root, args.sources)
