#!/usr/bin/env python3
"""Rebuild reviewed Physics part displays from checksum-matched question papers."""

import argparse
import base64
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

from render import SourceRenderer

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/assets'))
from compact import colourful, compact, coverage_group, photo


def source_for(directory, paper_id, digest, kind, original_hash=None, original_offset=0):
    kind_name = 'question_paper' if kind == 'QP' else 'mark_scheme'
    for name in (f'{digest}.pdf', f'{paper_id}-{kind}.pdf', f'{paper_id}__{kind_name}.pdf', f'{original_hash}.pdf'):
        path = directory / name
        if not path.is_file():
            continue
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual == digest:
            return path, 0
        if actual == original_hash:
            return path, original_offset
    raise ValueError(f'{paper_id}: cannot find {kind_name} source PDF with SHA256 {digest}')


def apply_reviews(root, sources):
    reviews = json.loads((root / 'data/imports/physics/context-reviews.json').read_text())
    for paper_id, review in reviews.items():
        digest = review['source_sha256']
        source, source_offset = source_for(sources, paper_id, digest, 'QP',
                                           review.get('original_source_sha256'), review.get('source_page_offset', 0))
        renderer = SourceRenderer(source)
        scheme_renderer = None
        scheme_digest = review.get('scheme_source_sha256')
        if scheme_digest:
            scheme_source, _ = source_for(sources, paper_id, scheme_digest, 'MS')
            scheme_renderer = SourceRenderer(scheme_source)
        pack_path = root / 'data/packs/physics' / f'{paper_id}.json'
        catalogue_path = root / 'data/physics-assets' / f'{paper_id}.json'
        pack = json.loads(pack_path.read_text())
        catalogue_text = catalogue_path.read_text()
        catalogue = json.loads(catalogue_text)
        assets = catalogue['assets']
        questions = {question['question_id']: question for question in pack['questions']}
        old_stems = set()

        with TemporaryDirectory() as output:
            def render(name, regions, source_renderer=renderer, offset=source_offset):
                output_path = Path(output) / name
                source_renderer.render([{**region, 'page': region['page'] + offset} for region in regions], output_path)
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
                if source_offset and (provenance['original_question_source_sha256'] != review['original_source_sha256']
                                      or provenance['question_page_offset'] != source_offset):
                    raise ValueError(f'{question_id}: sample source layout changed since review')
                context = question.setdefault('context', {})
                old_stem = context.get('stem_image_url')
                if old_stem:
                    old_stems.add(old_stem.rsplit('/', 1)[-1])

                if 'context_regions' in correction:
                    name = f'{question_id.removeprefix(paper_id + "_")}_context.webp'
                    context['stem_image_url'] = render(name, correction['context_regions'])
                    provenance['context_regions'] = correction['context_regions']
                    provenance['context_reasons'] = [correction['reason']]
                    for field in ('context_includes_stem_image', 'context_regions_refined', 'context_siblings_removed',
                                  'context_siblings_cut_by_pixels', 'context_recut_from_full', 'context_bridge_text'):
                        provenance.pop(field, None)
                if 'source_regions' in correction:
                    name = question['content']['question_image_url'].rsplit('/', 1)[-1]
                    render(name, correction['source_regions'])
                    provenance['source_regions'] = correction['source_regions']
                if 'part_scheme_regions' in correction:
                    if provenance['scheme_source_sha256'] != scheme_digest:
                        raise ValueError(f'{question_id}: mark scheme source changed since review')
                    full_scheme = context.get('full_scheme_image_url') or question['content']['mark_scheme_image_url']
                    context['full_scheme_image_url'] = full_scheme
                    name = f'{question_id.removeprefix(paper_id + "_")}_scheme.webp'
                    question['content']['mark_scheme_image_url'] = render(name, correction['part_scheme_regions'], scheme_renderer, 0)
                    question['scheme_scope'] = 'part'
                    question['scheme_question_number'] = f"{question['question_number']}{question['part_label']}"
                    provenance['part_scheme_regions'] = correction['part_scheme_regions']
                    provenance['part_scheme_check'] = 'verified'
                removed = set(correction.get('remove_dependencies', []))
                if removed:
                    kept = [dependency for dependency in question.get('depends_on_question_ids', []) if dependency not in removed]
                    if kept:
                        question['depends_on_question_ids'] = kept
                    else:
                        question.pop('depends_on_question_ids', None)
                    detected = {dependency: reason for dependency, reason in (provenance.get('dependency_detected') or {}).items()
                                if dependency not in removed}
                    if detected:
                        provenance['dependency_detected'] = detected
                    else:
                        provenance.pop('dependency_detected', None)
                        provenance.pop('dependency_detected_on', None)
                    if provenance.get('context_from_linked_part') in removed:
                        provenance.pop('context_from_linked_part')
                if 'depends_on' in correction:
                    dependency_id = correction['depends_on']
                    dependency = questions[dependency_id]
                    ordered = list(questions)
                    if ordered.index(dependency_id) >= ordered.index(question_id) or dependency['parent_question_id'] != question['parent_question_id']:
                        raise ValueError(f'{question_id}: invalid reviewed dependency {dependency_id}')
                    question['depends_on_question_ids'] = list(dict.fromkeys([*question.get('depends_on_question_ids', []), dependency_id]))
                provenance['part_display_review'] = correction['reason']
                provenance['part_display_review_source'] = digest

        pack_text = json.dumps(pack, ensure_ascii=False, indent=2) + '\n'
        references = set(re.findall(rf'assets/physics/{paper_id}/([A-Za-z0-9_]+\.webp)', pack_text))
        for name in old_stems - references:
            assets.pop(name, None)
        pack_path.write_text(pack_text)
        newline = '\n' if catalogue_text.endswith('\n') else ''
        catalogue_path.write_text(json.dumps(catalogue, separators=(',', ':')) + newline)
        print(f'{paper_id}: applied {len(review["questions"])} part reviews')

    index = json.loads((root / 'data/packs/index.json').read_text())
    asset_counts = Counter()
    for entry in index['packs']:
        if entry.get('enabled') is False or not entry['file'].startswith('physics/'):
            continue
        pack_path = root / 'data/packs' / entry['file']
        pack = json.loads(pack_path.read_text())
        paper_id = pack['papers'][0]['paper_id']
        catalogue = json.loads((root / 'data/physics-assets' / f'{paper_id}.json').read_text())
        asset_counts[coverage_group('physics', paper_id, {pack_path: pack})] += len(catalogue['assets'])
    coverage_path = root / 'data/imports/physics/coverage.json'
    coverage = json.loads(coverage_path.read_text())
    coverage['totals']['image_assets'] = sum(asset_counts.values())
    for group, info in coverage['groups'].items():
        info['image_assets'] = asset_counts[group]
    coverage_path.write_text(json.dumps(coverage, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    apply_reviews(args.root, args.sources)
