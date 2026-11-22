#!/usr/bin/env python3
"""Reapply source-checked GCSE Chemistry scheme regions and dependency decisions."""

import argparse
import base64
from collections import Counter
import hashlib
import io
import json
import math
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory

from PIL import Image

from render import SourceRenderer

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools' / 'assets'))
from compact import colourful, compact, photo


def read(path):
    return json.loads(path.read_text())


def write(path, value, compact_json=False):
    options = {'separators': (',', ':')} if compact_json else {'indent': 2}
    path.write_text(json.dumps(value, ensure_ascii=False, **options) + '\n')


def source(sources, paper, kind, digest, checked):
    for name in (f'{paper}__{kind}.pdf', f'{digest}.pdf'):
        path = sources / name
        if path.exists():
            if path not in checked:
                checked[path] = hashlib.sha256(path.read_bytes()).hexdigest()
            if checked[path] == digest:
                return path
    raise ValueError(f'No checksum-matched official {kind} for {paper}')


def render_asset(renderer, name, regions, directory):
    output = directory / name
    renderer.render(regions, output)
    data = output.read_bytes()
    with Image.open(io.BytesIO(data)) as image:
        rgb = image.convert('RGB')
    if not colourful(rgb) and not photo(rgb):
        candidate = compact(rgb)
        if candidate and len(candidate) < len(data):
            data = candidate
    return asset_record(data)


def asset_record(data):
    return {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}


def trim_asset(renderer, asset, previous, regions):
    count = len(regions)
    if not asset or not previous or previous[:count - 1] != regions[:-1] or len(previous) < count:
        return None
    last, new = previous[count - 1], regions[-1]
    if last['page'] != new['page'] or last['bbox'][:3] != new['bbox'][:3] or last['bbox'][3] < new['bbox'][3]:
        return None

    def height(bounds):
        amount = 12 * (len(bounds) - 1)
        for entry in bounds:
            _, points = renderer.document.get_page_size(entry['page'] - 1)
            pixels = math.ceil(points * renderer.scale)
            top, bottom = entry['bbox'][1::2]
            amount += round(pixels * bottom) - round(pixels * top)
        return amount

    with Image.open(io.BytesIO(base64.b64decode(asset['base64']))) as image:
        if abs(image.height - height(previous)) > 2:
            return None
        if previous == regions or image.height <= height(regions):
            return asset
        output = io.BytesIO()
        image.crop((0, 0, image.width, height(regions))).save(output, format='WEBP', lossless=True)
    return asset_record(output.getvalue())


def apply_question_review(unit, entry, units_by_id):
    provenance = unit['provenance']
    dependencies = entry['reviewed_dependencies']
    for dep in dependencies:
        assert units_by_id[dep]['parent_question_id'] == unit['parent_question_id'] and dep < unit['question_id']
    if dependencies:
        unit['depends_on_question_ids'] = dependencies
    else:
        unit.pop('depends_on_question_ids', None)
    for field in ('context_includes_stem_image', 'context_rows_from_full', 'context_siblings_removed',
                  'context_recut_from_full', 'context_from_linked_part', 'context_named_parts',
                  'context_regions', 'context_regions_refined', 'context_reasons'):
        provenance.pop(field, None)
    provenance.pop('dependency_detected', None)
    provenance.pop('dependency_detected_on', None)
    provenance['reviewed_dependencies'] = dependencies
    provenance['part_display_review'] = entry['reason']
    provenance['part_display_review_source'] = provenance['question_source_sha256']
    provenance['context_basis'] = 'grouped_dependency' if dependencies else 'independent'
    unit['context'].pop('stem_image_url', None)


def apply_part_scheme_review(unit, paper, name, regions):
    parent = name.rsplit('_', 1)[0]
    unit['content']['mark_scheme_image_url'] = f'assets/gcsechem/{paper}/{name}_scheme.webp'
    unit['context']['full_scheme_image_url'] = f'assets/gcsechem/{paper}/{parent}_scheme.webp'
    unit['scheme_scope'] = 'part'
    unit['scheme_question_number'] = f"{unit['question_number']}{unit['part_label']}"
    unit.pop('scheme_part', None)
    unit['provenance']['part_scheme_regions'] = regions
    unit['provenance']['part_scheme_check'] = 'verified'


def apply(root, sources, paper_ids=None):
    imports = root / 'data/imports/gcsechem'
    packs = root / 'data/packs/gcsechem'
    catalogues = root / 'data/gcsechem-assets'
    reviews = read(imports / 'display-reviews.json')
    checked = {}
    selected = set(paper_ids) if paper_ids is not None else None
    count = Counter()
    image_counts = Counter()
    with TemporaryDirectory() as tmp:
        for path in sorted(packs.glob('*.json')):
            if selected is not None and path.stem not in selected:
                continue
            pack = read(path)
            paper = pack['papers'][0]
            pid = paper['paper_id']
            catalogue_path = catalogues / path.name
            catalogue = read(catalogue_path)
            assets = catalogue['assets']
            entry = reviews.get(pid)
            if entry:
                units_by_id = {q['question_id']: q for q in pack['questions']}
                units = {qid.removeprefix(pid + '_'): unit for qid, unit in units_by_id.items()}
                for name, review in entry.get('questions', {}).items():
                    unit = units[name]
                    assert unit['provenance']['question_source_sha256'] == entry['question_sha256']
                    source(sources, pid, 'question_paper', entry['question_sha256'], checked)
                    apply_question_review(unit, review, units_by_id)
                    count['context'] += 1

                if entry.get('schemes'):
                    digest = entry['scheme_sha256']
                    renderer = SourceRenderer(source(sources, pid, 'mark_scheme', digest, checked))
                    for name, review in entry['schemes'].items():
                        regions = review['regions']
                        previous = None
                        for short_id, unit in units.items():
                            provenance = unit['provenance']
                            if short_id == name:
                                assert provenance['scheme_source_sha256'] == digest
                                apply_part_scheme_review(unit, pid, name, regions)
                            elif short_id.startswith(name + '_'):
                                assert provenance['scheme_source_sha256'] == digest
                                previous = provenance['scheme_regions']
                                provenance['scheme_regions'] = regions
                                provenance['scheme_regions_fixed'] = review['reason']
                        asset_name = f'{name}_scheme.webp'
                        trimmed = trim_asset(renderer, assets.get(asset_name), previous, regions)
                        assets[asset_name] = trimmed or render_asset(renderer, asset_name, regions, Path(tmp))
                        count['scheme'] += 1

                referenced = set(re.findall(rf'assets/gcsechem/{pid}/([A-Za-z0-9_]+\.webp)',
                                            json.dumps(pack)))
                assert referenced <= assets.keys(), (pid, referenced - assets.keys())
                catalogue['assets'] = assets = {name: assets[name] for name in sorted(referenced)}
                write(path, pack)
                write(catalogue_path, catalogue, compact_json=True)

            group = f"{paper['qualification_code']} {paper['tier']} exams"
            image_counts[group] += len(assets)

    if selected is None:
        coverage_path = imports / 'coverage.json'
        coverage = read(coverage_path)
        for group, amount in image_counts.items():
            coverage['groups'][group]['image_assets'] = amount
        coverage['totals']['image_assets'] = sum(image_counts.values())
        write(coverage_path, coverage)
    return dict(count)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--paper', action='append')
    args = parser.parse_args()
    print(apply(args.root, args.sources, paper_ids=args.paper))
