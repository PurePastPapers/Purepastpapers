#!/usr/bin/env python3
"""Reapply source-checked 1MA1 display corrections to the published packs and assets."""

import argparse
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parents[2]
REVIEW_PATH = 'data/imports/gcsemaths/display-reviews.json'
SCOPE_KEYS = {
    'question': ('source_regions', 'question'),
    'part_scheme': ('part_scheme_regions', 'scheme'),
    'full_scheme': ('scheme_regions', 'scheme'),
}


def read(path):
    return json.loads(path.read_text())


def hash_bytes(data):
    return hashlib.sha256(data).hexdigest()


def source_file(sources, aliases, paper, kind, expected):
    suffix = 'qp' if kind == 'question' else 'ms'
    options = [sources / f'{expected}.pdf', sources / f'{paper}-{suffix}.pdf']
    if expected in aliases:
        options.append(Path(aliases[expected]))
    for path in options:
        if path.is_file() and hash_bytes(path.read_bytes()) == expected:
            return path
    raise FileNotFoundError(f'{paper} {kind}: missing PDF with SHA256 {expected}')


def references(unit, name, scope):
    contents = unit['content']
    context = unit['context']
    if scope == 'question':
        urls = [contents.get('question_image_url')]
    elif scope == 'part_scheme':
        urls = [contents.get('mark_scheme_image_url')]
    else:
        urls = [context.get('full_scheme_image_url')]
        if unit.get('scheme_scope') != 'part':
            urls.append(contents.get('mark_scheme_image_url'))
    return any(url and url.rsplit('/', 1)[-1] == name for url in urls)


def update_unit(unit, reviewed):
    original = json.dumps(unit, sort_keys=True)
    if 'preview_text' in reviewed:
        unit['preview_text'] = reviewed['preview_text']
    if 'dependencies' in reviewed:
        reviewed_ids = reviewed['dependencies']
        if reviewed_ids:
            unit['depends_on_question_ids'] = reviewed_ids
        else:
            unit.pop('depends_on_question_ids', None)
        unit['provenance']['reviewed_dependencies'] = reviewed_ids
        unit['provenance'].pop('dependency_detected', None)
        unit['provenance'].pop('dependency_detected_on', None)
    if reviewed.get('drop_stem'):
        unit['context'].pop('stem_image_url', None)
        for field in ('context_from_linked_part', 'context_regions', 'context_reasons',
                      'context_includes_stem_image', 'context_named_parts', 'context_stem_from_parts'):
            unit['provenance'].pop(field, None)
        unit['provenance']['context_basis'] = 'independent'
    return json.dumps(unit, sort_keys=True) != original


def apply_reviews(repo, sources, paper_ids=None, aliases=None):
    """Rebuild reviewed crops from the exact official source. Returns changed and missing items."""
    repo, sources = Path(repo), Path(sources)
    manifest = repo / REVIEW_PATH
    if not manifest.exists():
        return 0, []
    spec = importlib.util.spec_from_file_location('gcsemaths_review_renderer', Path(__file__).with_name('render.py'))
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    selected = set(paper_ids) if paper_ids is not None else None
    changed, missing = 0, []
    for paper, review in read(manifest).items():
        if selected is not None and paper not in selected:
            continue
        pack_path = repo / 'data/packs/gcsemaths' / f'{paper}.json'
        catalogue_path = repo / 'data/gcsemaths-assets' / f'{paper}.json'
        pack, catalogue = read(pack_path), read(catalogue_path)
        units = {unit['question_id']: unit for unit in pack['questions']}
        assets = catalogue['assets']
        reviewed_units = review.get('units', {})
        if any(qid not in units for qid in reviewed_units):
            raise ValueError(f'{paper}: reviewed units do not match the current pack')
        hashes = {kind: review.get(f'{kind}_source_sha256') for kind in ('question', 'scheme')}
        for kind, expected in hashes.items():
            if expected and any(u['provenance'][f'{kind}_source_sha256'] != expected for u in units.values()):
                raise ValueError(f'{paper}: review is for a different {kind} PDF')
        source_by_kind = {}
        asset_changed = False
        unit_changed = sum(update_unit(units[qid], details) for qid, details in reviewed_units.items())
        with TemporaryDirectory() as temporary:
            for name, crop in review.get('assets', {}).items():
                scope = crop['scope']
                field, kind = SCOPE_KEYS[scope]
                candidates = [u for u in units.values() if references(u, name, scope)]
                if not candidates:
                    missing.append(f'{paper} {name}: missing asset reference')
                    continue
                regions = crop['regions']
                old_sha = assets.get(name, {}).get('sha256')
                if old_sha and all(u['provenance'].get(field) == regions and
                                   u['provenance'].get('display_review_assets', {}).get(name) == old_sha
                                   for u in candidates):
                    continue
                if kind not in source_by_kind:
                    try:
                        source = source_file(sources, aliases or {}, paper, kind, hashes[kind])
                    except FileNotFoundError as error:
                        missing.append(str(error))
                        source_by_kind[kind] = None
                    else:
                        source_by_kind[kind] = renderer.SourceRenderer(source)
                document = source_by_kind[kind]
                if document is None:
                    continue
                target = Path(temporary) / name
                document.render(regions, target)
                raw = target.read_bytes()
                checksum = hash_bytes(raw)
                assets[name] = {'sha256': checksum, 'base64': base64.b64encode(raw).decode()}
                for unit in candidates:
                    unit['provenance'][field] = regions
                    unit['provenance'].setdefault('display_review_assets', {})[name] = checksum
                asset_changed = True
                changed += 1
        if unit_changed or asset_changed:
            pack_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
            changed += unit_changed
        if asset_changed:
            newline = '\n' if catalogue_path.read_text().endswith('\n') else ''
            catalogue_path.write_text(json.dumps(catalogue, separators=(',', ':')) + newline)
    return changed, missing


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=ROOT)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--paper', action='append')
    args = parser.parse_args()
    count, gaps = apply_reviews(args.repo, args.sources, paper_ids=args.paper)
    print(f'{count} reviewed changes applied')
    for gap in sorted(set(gaps)):
        print(gap)
    if gaps:
        raise SystemExit(1)
