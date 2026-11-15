#!/usr/bin/env python3
"""Audit Maths crop coordinates and emit private source-pixel QA evidence.

Checks published pack geometry against extraction coordinates, every original
part/tariff endpoint, raster dimensions, and individual scheme-region ink.
Evidence is deliberately outside the application tree and contains no OCR math.
"""
import argparse
import hashlib
import json
import math
from collections import defaultdict, deque
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image, ImageChops, ImageDraw

from render import SourceRenderer


SAMPLES = {
    'EDX_9MA0_2018_JUNE_01': ['1', '6', '14'],
    'EDX_9MA0_2019_JUNE_31': ['1', '2'],
    'EDX_9MA0_2019_JUNE_32': ['3'],
    'EDX_8MA0_2018_JUNE_02': ['4'],
    'EDX_8MA0_2019_JUNE_22': ['2'],
    'EDX_9MA0_2023_JUNE_01': ['1', '15'],
    'EDX_9MA0_2023_JUNE_31': ['6'],
    'EDX_9MA0_2025_JUNE_02_MODIFIED': ['1', '12', '16'],
    'EDX_8MA0_2025_JUNE_01': ['2', '11', '12'],
    'EDX_9MA0_SAMPLE_01': ['12', '15'],
    'EDX_8MA0_SAMPLE_01': ['17'],
}


def read(path):
    return json.loads(path.read_text())


def ink_fraction(image):
    histogram = image.convert('L').histogram()
    return sum(histogram[:245]) / (image.width * image.height)


def contains(regions, page, y, x=None, tolerance=0.0007):
    return any(r['page'] == page
               and r['bbox'][1] - tolerance <= y <= r['bbox'][3] + tolerance
               and (x is None or r['bbox'][0] - tolerance <= x <= r['bbox'][2] + tolerance)
               for r in regions)


def raster_size(regions, sizes, scale=1.6):
    pieces = []
    for region in regions:
        width, height = sizes[region['page'] - 1]
        pw, ph = math.ceil(width * scale), math.ceil(height * scale)
        left, top, right, bottom = region['bbox']
        pieces.append((round(right * pw) - round(left * pw),
                       round(bottom * ph) - round(top * ph)))
    return max(p[0] for p in pieces), sum(p[1] for p in pieces) + 12 * (len(pieces) - 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    parser.add_argument('--research', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--paper', action='append', help='Limit the audit to this paper ID; repeatable.')
    parser.add_argument('--skip-scheme-raster', action='store_true')
    args = parser.parse_args()
    repo = args.repo.resolve()
    research = (args.research or repo.parent / 'math-research').resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    evidence = output / 'images'
    evidence.mkdir(exist_ok=True)
    report = {'compiler_signature': 'crop-build-v3-mediabox', 'papers': [],
              'failures': [], 'pending_builds': [], 'manual_visual_checks': []}
    image_cache = {}

    def fail(pid, question, kind, **details):
        report['failures'].append(dict(paper_id=pid, question=question, kind=kind, **details))

    def image_check(pid, number, path, regions, sizes):
        key = str(path)
        if key in image_cache:
            return
        image_cache[key] = True
        if not path.exists():
            fail(pid, number, 'missing_asset', path=path.relative_to(repo).as_posix())
            return
        try:
            with Image.open(path) as im:
                expected = raster_size(regions, sizes)
                if im.size != expected:
                    fail(pid, number, 'raster_size_mismatch', path=path.relative_to(repo).as_posix(),
                         expected=expected, actual=im.size)
                fraction = ink_fraction(im)
                if fraction < 0.0005:
                    fail(pid, number, 'blank_asset', path=path.relative_to(repo).as_posix(), ink_fraction=fraction)
        except Exception as error:
            fail(pid, number, 'unreadable_asset', path=path.relative_to(repo).as_posix(), error=str(error))

    papers = []
    for inventory in ['9ma0-inventory', '8ma0-inventory',
                      '9ma0-samples-inventory', '8ma0-samples-inventory']:
        papers.extend(read(repo / 'data/imports/maths/inventory' / (inventory + '.json'))['papers'])
    for paper in papers:
        pid = paper['paper_id']
        if args.paper and pid not in args.paper:
            continue
        is_as = pid.startswith('EDX_8')
        is_sample = bool(paper.get('is_sample'))
        candidate_dir = 'as-sam-extracted' if is_as and is_sample else ('as-extracted' if is_as else 'extracted')
        candidate_path = research / candidate_dir / (pid + '.json')
        review_path = research / 'reviews' / (pid + '.json')
        if not candidate_path.exists() or not review_path.exists():
            continue  # Restricted, unacquired or explicitly unreviewed inventory rows.
        pack_path = repo / 'data/packs/maths' / (pid + '.json')
        signature = hashlib.sha256(b'crop-build-v3-mediabox' + candidate_path.read_bytes()
                                   + review_path.read_bytes()).hexdigest()
        if not pack_path.exists() or read(pack_path).get('build_signature') != signature:
            report['pending_builds'].append(pid)
            continue
        candidate, pack = read(candidate_path), read(pack_path)
        source_dir = research / (('as-sam-sources' if is_as else 'sam-sources') if is_sample
                                 else ('as-sources' if is_as else 'sources'))
        qp, ms = [source_dir / (pid + '__' + kind + '.pdf')
                  for kind in ['question_paper', 'mark_scheme']]
        with pdfplumber.open(qp) as doc:
            qp_sizes = [(page.width, page.height) for page in doc.pages]
        with pdfplumber.open(ms) as doc:
            ms_sizes = [(page.width, page.height) for page in doc.pages]
        qp_pdf, ms_pdf = pdfium.PdfDocument(qp), pdfium.PdfDocument(ms)
        qp_renderer, ms_renderer = SourceRenderer(qp), SourceRenderer(ms, scale=0.45)
        book = dict(paper_id=pid, questions=len(candidate['questions']), units=len(pack['questions']),
                    part_endpoints=0, part_starts=0, scheme_regions=0, differing_cropbox_pages=0,
                    source_geometry_variants=[])
        variants = set()
        for kind, doc, sizes in [('question', qp_pdf, qp_sizes), ('scheme', ms_pdf, ms_sizes)]:
            for index, (width, height) in enumerate(sizes):
                page = doc[index]
                media, crop = tuple(page.get_mediabox()), tuple(page.get_cropbox())
                variants.add((kind, media, crop))
                if any(abs(a - b) > 0.01 for a, b in zip(media, crop)):
                    book['differing_cropbox_pages'] += 1
                if abs(media[2] - media[0] - width) > 0.02 or abs(media[3] - media[1] - height) > 0.02:
                    fail(pid, None, 'coordinate_space_size_mismatch', source=kind, page=index + 1,
                         mediabox=media, extraction_size=[width, height])
                page.set_cropbox(*media)
                if any(abs(a - b) > 0.02 for a, b in zip(page.get_size(), (width, height))):
                    fail(pid, None, 'pdfium_mediabox_size_mismatch', source=kind, page=index + 1)
        book['source_geometry_variants'] = [dict(source=k, mediabox=m, original_cropbox=c)
                                            for k, m, c in sorted(variants)]
        by_question = defaultdict(list)
        for unit in pack['questions']:
            by_question[str(unit['question_number'])].append(unit)
        for question in candidate['questions']:
            number = question['number']
            full_regions = question['regions']
            full_path = repo / 'assets/maths' / pid / f'Q{int(number):02}_full.webp'
            image_check(pid, number, full_path, full_regions, qp_sizes)
            for region in full_regions:
                left, top, right, bottom = region['bbox']
                if not (0 <= left < right <= 1 and 0 <= top < bottom <= 1):
                    fail(pid, number, 'out_of_bounds_question_region', region=region)
            original = defaultdict(deque)
            for part in question['parts']:
                original[part['part_label']].append(part)
                height = qp_sizes[part['page'] - 1][1]
                for edge in ['top', 'bottom']:
                    if not contains(full_regions, part['page'], part[edge] / height):
                        fail(pid, number, 'full_question_clips_tariff', part=part['part_label'], edge=edge,
                             page=part['page'], coordinate=part[edge])
            seen_schemes = set()
            sample_units = []
            endpoint_pieces = []
            for unit in by_question[number]:
                provenance = unit['provenance']
                regions, scheme_regions = provenance['source_regions'], provenance.get('scheme_regions', [])
                if not regions or not scheme_regions:
                    fail(pid, number, 'empty_regions', unit=unit['question_id'])
                    continue
                image_check(pid, number, repo / unit['content']['question_image_url'], regions, qp_sizes)
                image_check(pid, number, repo / unit['content']['mark_scheme_image_url'], scheme_regions, ms_sizes)
                for label in provenance['original_parts']:
                    if not original[label]:
                        fail(pid, number, 'duplicate_or_unknown_part', part=label, unit=unit['question_id'])
                        continue
                    part = original[label].popleft()
                    width, height = qp_sizes[part['page'] - 1]
                    for edge in ['top', 'bottom']:
                        book['part_endpoints'] += 1
                        if not contains(regions, part['page'], part[edge] / height):
                            fail(pid, number, 'unit_clips_tariff', unit=unit['question_id'], part=label,
                                 edge=edge, page=part['page'], coordinate=part[edge])
                    begin = part.get('start')
                    if begin:
                        bw, bh = qp_sizes[begin['page'] - 1]
                        book['part_starts'] += 1
                        if not contains(regions, begin['page'], begin['top'] / bh, begin['x'] / bw):
                            fail(pid, number, 'unit_clips_part_label', unit=unit['question_id'], part=label,
                                 page=begin['page'], coordinate=begin['top'])
                    if number in SAMPLES.get(pid, []):
                        page_image = qp_renderer.page(part['page'] - 1)
                        y0, y1 = [round(part[edge] / height * page_image.height) for edge in ['top', 'bottom']]
                        piece = page_image.crop((0, max(0, y0 - 50), page_image.width,
                                                 min(page_image.height, y1 + 25)))
                        draw = ImageDraw.Draw(piece)
                        draw.text((8, 4), f"{pid} Q{number} {label or 'whole'} tariff", fill='red')
                        endpoint_pieces.append(piece)
                for region in scheme_regions:
                    key = json.dumps(region, sort_keys=True)
                    if key in seen_schemes:
                        continue
                    seen_schemes.add(key)
                    book['scheme_regions'] += 1
                    l, t, r, b = region['bbox']
                    if not (0 <= l < r <= 1 and 0 <= t < b <= 1):
                        fail(pid, number, 'out_of_bounds_scheme_region', region=region)
                    elif not args.skip_scheme_raster:
                        im = ms_renderer.page(region['page'] - 1)
                        crop = im.crop((round(l * im.width), round(t * im.height),
                                        round(r * im.width), round(b * im.height)))
                        fraction = ink_fraction(crop)
                        if fraction < 0.0005:
                            fail(pid, number, 'blank_scheme_region', region=region, ink_fraction=fraction)
                if number in SAMPLES.get(pid, []):
                    target = evidence / f"{unit['question_id']}.png"
                    qp_renderer.render(regions, target)
                    with Image.open(target) as reference, Image.open(repo / unit['content']['question_image_url']) as built:
                        if reference.size != built.size or ImageChops.difference(reference.convert('RGB'), built.convert('RGB')).getbbox():
                            fail(pid, number, 'sample_pixels_differ', unit=unit['question_id'])
                    sample_units.append(target.name)
            for label, queue in original.items():
                if queue:
                    fail(pid, number, 'unassigned_source_part', part=label, occurrences=len(queue))
            if number in SAMPLES.get(pid, []):
                target = evidence / f'{pid}_Q{int(number):02}_full.png'
                qp_renderer.render(full_regions, target)
                if endpoint_pieces:
                    sheet = Image.new('RGB', (max(im.width for im in endpoint_pieces),
                                             sum(im.height for im in endpoint_pieces) + 10 * len(endpoint_pieces)), 'white')
                    y = 0
                    for im in endpoint_pieces:
                        sheet.paste(im, (0, y)); y += im.height + 10
                    sheet.save(evidence / f'{pid}_Q{int(number):02}_tariffs.png')
                report['manual_visual_checks'].append(dict(paper_id=pid, question=number,
                    full_source=target.name, units=sample_units,
                    tariffs=f'{pid}_Q{int(number):02}_tariffs.png', status='awaiting_visual_inspection'))
        report['papers'].append(book)
        print(f"{pid}: {book['part_endpoints']} tariff edges, {book['scheme_regions']} scheme regions", flush=True)
    report['totals'] = {key: sum(p[key] for p in report['papers'])
                        for key in ['questions', 'units', 'part_endpoints', 'part_starts', 'scheme_regions', 'differing_cropbox_pages']}
    report['totals'].update(papers=len(report['papers']), failures=len(report['failures']),
                            pending_builds=len(report['pending_builds']), unique_assets_checked=len(image_cache))
    (output / 'geometry-qa.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report['totals']), flush=True)
    return 1 if report['failures'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
