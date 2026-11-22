"""Package booklet renders while keeping post-processed crops paired with their pack records."""

import base64
import hashlib
import json
import re


def reviewed_urls(unit):
    provenance = unit.get('provenance') or {}
    content = unit.get('content') or {}
    context = unit.get('context') or {}
    refined = provenance.get('part_display') == 'refined'
    reviewed = provenance.get('part_display_review_source')

    if refined or reviewed or any(provenance.get(key) for key in (
        'own_rows_from_full', 'booklet_pages_trimmed', 'next_part_trimmed',
    )):
        yield content.get('question_image_url')
    if provenance.get('booklet_pages_trimmed'):
        yield context.get('full_question_image_url')
    if refined or reviewed or any(provenance.get(key) for key in (
        'context_rows_from_full', 'context_recut_from_full', 'context_siblings_cut_by_pixels',
    )):
        yield context.get('stem_image_url')
    if reviewed:
        yield from (figure.get('image_url') for figure in context.get('figures') or [])
    yield context.get('lead_in_image_url')
    if provenance.get('part_scheme_regions'):
        yield content.get('mark_scheme_image_url')
    if provenance.get('scheme_regions_fixed'):
        yield context.get('full_scheme_image_url') or content.get('mark_scheme_image_url')


def package_catalogue(repo, pack_path, slug, paper, *, minimum_local_bytes=0):
    text = pack_path.read_text()
    name_pattern = re.compile(rf'assets/{re.escape(slug)}/{re.escape(paper)}/([A-Za-z0-9_]+\.webp)')
    names = sorted(set(name_pattern.findall(text)))
    target = repo / 'data' / f'{slug}-assets' / f'{paper}.json'
    previous = json.loads(target.read_text())['assets'] if target.exists() else {}
    # Post-processors write into the catalogue under the build's names. A resumed build
    # keeps the processed pack and may leave stale renders on disk under those same names.
    reviewed = set()
    for unit in json.loads(text)['questions']:
        for url in reviewed_urls(unit):
            if url and (match := name_pattern.fullmatch(url)):
                reviewed.add(match[1])
    missing_reviewed = sorted(reviewed - previous.keys())
    if missing_reviewed:
        raise ValueError(f'{paper}: missing reviewed catalogue crops: {", ".join(missing_reviewed)}')

    assets = {}
    for name in names:
        local = repo / 'assets' / slug / paper / name
        if name in previous and (name in reviewed or not local.exists()):
            assets[name] = previous[name]
            continue
        data = local.read_bytes()
        if len(data) <= minimum_local_bytes:
            raise ValueError(f'{paper}: local crop is too small: {name}')
        assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
    target.parent.mkdir(parents=True, exist_ok=True)
    catalogue = {'format': 'lossless-webp-catalogue-v1', 'paper_id': paper, 'assets': assets}
    target.write_text(json.dumps(catalogue, separators=(',', ':')) + '\n')
    return len(assets)
