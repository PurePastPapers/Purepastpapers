#!/usr/bin/env python3
"""Programmatic crop checks for built Biology packs (development only).

For every scored unit:
  * each assigned original tariff (and its part-label start) lies inside the
    unit's source regions on the right page;
  * the unit, context and scheme images exist, decode, and contain ink;
  * pdfplumber and PDFium agree on every source page size (MediaBox geometry).
Writes data/imports/biology/geometry-qa-summary.json; exits non-zero on failure.

Usage: python3 tools/biology/geometry_qa.py --research RESEARCH [--repo .]
"""
import argparse
import json
import sys
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image


def ink_fraction(path):
    image = Image.open(path).convert('L')
    image.thumbnail((400, 400))
    pixels = list(image.getdata())
    return sum(1 for v in pixels if v < 200) / max(1, len(pixels))


def inside(regions, page, top, bottom, height, slack=2.5):
    for r in regions:
        if r['page'] != page:
            continue
        y0, y1 = r['bbox'][1] * height - slack, r['bbox'][3] * height + slack
        if y0 <= top and bottom <= y1:
            return True
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--research', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    args = parser.parse_args()
    repo = args.repo.resolve()
    failures, checked_units, checked_images = [], 0, 0
    for pack_path in sorted((repo / 'data/packs/biology').glob('*.json')):
        pack = json.loads(pack_path.read_text())
        pid = pack['papers'][0]['paper_id']
        candidate = json.loads((args.research / 'extracted' / f'{pid}.json').read_text())
        qp = args.research / 'sources' / f'{pid}__question_paper.pdf'
        with pdfplumber.open(qp) as doc:
            sizes = [(p.width, p.height) for p in doc.pages]
        pdf = pdfium.PdfDocument(str(qp))
        for i, (w, h) in enumerate(sizes):
            mw, mh = pdf[i].get_mediabox()[2:] if pdf[i].get_mediabox()[0] == 0 else (None, None)
            if mw is not None and (abs(mw - w) > 1 or abs(mh - h) > 1):
                failures.append(f'{pid} page {i + 1}: MediaBox {mw}x{mh} != extraction {w}x{h}')
        by_number = {q['number']: q for q in candidate['questions']}
        seen_images = set()
        for unit in pack['questions']:
            checked_units += 1
            source = by_number[unit['question_number']]
            regions = unit['provenance']['source_regions'] or source['regions']
            for index in unit['provenance']['original_tariff_indices']:
                part = source['parts'][index]
                height = sizes[part['page'] - 1][1]
                if not inside(regions, part['page'], part['top'], part['tariff_bottom'], height):
                    failures.append(f"{unit['question_id']}: tariff {part['part_label']} ({part['marks']}) outside crop")
                start = part.get('start')
                if start and not inside(regions, start['page'], start['top'], start['top'] + 8, sizes[start['page'] - 1][1]) \
                        and len(unit['provenance']['original_parts']) == 1 and unit['provenance']['source_regions']:
                    failures.append(f"{unit['question_id']}: label {part['part_label']} start outside crop")
            urls = [unit['content']['question_image_url'], unit['content']['mark_scheme_image_url'],
                    unit['context'].get('full_question_image_url')]
            urls += (unit['context'].get('article') or {}).get('page_image_urls', [])
            if unit['context'].get('erratum_image_url'):
                urls.append(unit['context']['erratum_image_url'])
            for url in filter(None, urls):
                if url in seen_images:
                    continue
                seen_images.add(url)
                path = repo / url
                if not path.exists():
                    failures.append(f'{url}: missing')
                    continue
                checked_images += 1
                if ink_fraction(path) < 0.002:
                    failures.append(f'{url}: blank or near-blank image')
    summary = {'packs': len(list((repo / 'data/packs/biology').glob('*.json'))), 'units_checked': checked_units,
               'images_checked': checked_images, 'failures': failures,
               'checks': ['tariff inside unit crop', 'single-part label start inside crop', 'image exists and has ink',
                          'MediaBox equals extraction page size']}
    (repo / 'data/imports/biology/geometry-qa-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps({k: v for k, v in summary.items() if k != 'failures'}), 'failures:', len(failures))
    for failure in failures[:40]:
        print('  ', failure)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
