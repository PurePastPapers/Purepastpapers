#!/usr/bin/env python3
"""Flag scored-part regions that miss their printed label, tariff or a crop boundary."""
import argparse
import json
from collections import Counter
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]


def read(path):
    return json.loads(path.read_text())


def page_heights(path):
    with fitz.open(path) as document:
        return {i: page.mediabox.width if page.rotation in (90, 270) else page.mediabox.height
                for i, page in enumerate(document, 1)}


def contains(regions, layout, heights, *, tolerance=1):
    if not layout:
        return False
    page = layout['page']
    height = heights[page]
    return any(region['page'] == page and region['bbox'][1] * height <= layout['top'] + tolerance
               and region['bbox'][3] * height >= layout.get('bottom', layout['top']) - tolerance
               for region in regions)


def inspect(pack, candidate, heights):
    original = {question['number']: question['parts'] for question in candidate['questions']}
    issues = []
    for record in pack['questions']:
        provenance = record['provenance']
        parts = original[record['question_number']]
        indices = provenance['original_tariff_indices']
        own = provenance['source_regions']
        context = provenance.get('context_regions', [])
        flags = []
        if provenance['question_source_sha256'] != candidate['source_sha256']:
            flags.append('question_source_revision')
        if sum(parts[i]['marks'] for i in indices) != record['marks']:
            flags.append('tariff_value')
        if any(not contains(own, parts[i], heights) for i in indices):
            flags.append('own_tariff_missing')
        if any(not contains(own, parts[i].get('start'), heights) for i in indices if parts[i].get('start')):
            flags.append('own_label_start_missing')
        if any(contains(own, part, heights, tolerance=0) for i, part in enumerate(parts) if i not in indices):
            flags.append('adjacent_tariff_in_own_crop')
        if any(contains(context, part, heights, tolerance=0) for part in parts):
            flags.append('tariff_in_context')
        if len(parts) > 1 and record['scheme_scope'] != 'part':
            flags.append('scheme_fallback')
        if flags:
            issues.append({'question_id': record['question_id'], 'flags': flags})
    return issues


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidates', type=Path, required=True)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('paper_ids', nargs='+')
    args = parser.parse_args()
    issues = {}
    for pid in args.paper_ids:
        pack = read(ROOT / 'data/packs/fmaths' / f'{pid}.json')
        candidate = read(args.candidates / f'{pid}.json')
        heights = page_heights(args.sources / pid / 'question_paper.pdf')
        found = inspect(pack, candidate, heights)
        if found:
            issues[pid] = found
    args.report.write_text(json.dumps(issues, indent=2) + '\n')
    print(dict(Counter(flag for paper in issues.values() for row in paper for flag in row['flags'])))


if __name__ == '__main__':
    main()
