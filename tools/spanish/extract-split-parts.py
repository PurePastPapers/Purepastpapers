#!/usr/bin/env python3
"""Render exact Paper 1 split parts into a private review workspace."""
import argparse
import collections
import hashlib
import json
import re
import sys
from pathlib import Path

import fitz


def lines(page):
    result = []
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            text = ''.join(span['text'] for span in line['spans']).strip()
            if text:
                result.append((text, fitz.Rect(line['bbox'])))
    return sorted(result, key=lambda row: (row[1].y0, row[1].x0))


def question_marker(reference, page_lines):
    candidates = []
    for text, rect in page_lines:
        normalized = text.replace(' ', '')
        if not (29 < rect.x0 < 66 and re.fullmatch(r'0[1-9]\.\d{1,2}', normalized)):
            continue
        tail = next((digit for digit, following in page_lines if re.fullmatch(r'\d', digit)
                     and rect.x1 < following.x0 < min(rect.x1 + 12, 145)
                     and abs(following.y0 - rect.y0) < 1), '')
        if tail and (normalized + tail == reference or normalized != reference):
            normalized += tail
        if normalized == reference:
            candidates.append(rect)
    assert len(candidates) == 1, (reference, len(candidates))
    return candidates[0]


def next_prompt_y(page_lines, marker):
    return min((rect.y0 for text, rect in page_lines if 29 < rect.x0 < 66 and rect.y0 > marker.y0 + 1
                and re.fullmatch(r'[01]\d(?:\.\d{1,2})?', text.replace(' ', ''))), default=775)


def qp_region(part, page):
    page_lines = lines(page)
    marker = question_marker(part['reference'], page_lines)
    next_y = next_prompt_y(page_lines, marker)
    tariffs = [(rect, int(found[1])) for text, rect in page_lines
               if marker.y0 - 1 <= rect.y0 < next_y and (found := re.search(r'\[(\d+) marks?\]', text))]
    assert len(tariffs) == 1, (part['reference'], len(tariffs))
    tariff, marks = tariffs[0]
    min_x = min(rect.x0 for _, rect in page_lines if rect.y0 >= marker.y0 - 1
                and rect.y1 <= tariff.y1 + 1 and rect.x0 > 25)
    bbox = [min_x - 3, marker.y0 - 2, min(page.rect.width - 31, max(540, tariff.x1 + 2)), tariff.y1 + 2]
    return bbox, marks


def horizontal_rules(page):
    rules = collections.Counter()
    for drawing in page.get_drawings():
        rect = drawing['rect']
        if rect.height < 0.8 and rect.width > 16:
            rules[round(rect.y0, 1)] += rect.width
    return sorted(y for y, width in rules.items() if width > 190)


def ms_regions(reference, page):
    page_lines = lines(page)
    ids = [(text, rect) for text, rect in page_lines if 35 < rect.x0 < 112 and 75 < rect.y0 < 787
           and re.fullmatch(r'0\d\.\d{1,2}', text)]
    positions = [rect for text, rect in ids if text == reference]
    assert len(positions) == 1, (reference, len(positions))
    marker = positions[0]
    above = max((rect.y0 for _, rect in ids if rect.y0 < marker.y0), default=68)
    below = min((rect.y0 for _, rect in ids if rect.y0 > marker.y0), default=790)
    rule_y = horizontal_rules(page)
    start = max((y for y in rule_y if above < y <= marker.y0), default=-1)
    end = min((y for y in rule_y if marker.y1 < y < below), default=-1)
    assert 68 <= start < end <= 790, (reference, start, end)
    previous = max((y for y in rule_y if above < y < start - 0.5), default=-1)
    result = []
    header = [r for t, r in page_lines if t in {'Qu', 'Question'} and 40 < r.x0 < 100 and r.y0 < marker.y0]
    if header:
        last_header = header[-1].y0
        if 0 < previous < last_header < start:
            start = previous
        elif last_header < above and (header_top := max((y for y in rule_y if 68 < y < last_header), default=0)):
            header_end = min((y for y in rule_y if last_header < y < above), default=0)
            if header_end:
                result.append([40, header_top - 1, 558, header_end + 1])
    result.append([40, start - 1, 558, end + 1])
    found = re.findall(r'\b0\d\.\d{1,2}\b', '\n'.join(page.get_text(clip=fitz.Rect(*box)) for box in result))
    assert found == [reference], (reference, found)
    return result


def normalize(page, boxes):
    assert page.rotation == 0 and page.cropbox == page.mediabox
    return [{ 'page': page.number + 1,
              'bbox': [b[0] / page.rect.width, b[1] / page.rect.height,
                       b[2] / page.rect.width, b[3] / page.rect.height]} for b in boxes]


def open_document(assets, record):
    path = assets / record['name']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == record['sha256']
    return path, fitz.open(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-map', type=Path, required=True)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(args.repo / 'tools/physics'))
    from render import SourceRenderer

    results = {}
    for paper in json.loads(args.source_map.read_text()):
        series = paper['series']
        if series == 'JUN24':
            continue
        a, qp = open_document(args.assets, paper['question_paper'])
        b, ms = open_document(args.assets, paper['mark_scheme'])
        qp_render, ms_render = SourceRenderer(a), SourceRenderer(b)
        destination = args.output / series
        destination.mkdir(parents=True, exist_ok=True)
        units, exceptions = [], []
        for question in paper['questions']:
            for part in question['parts']:
                ref = part['reference']
                try:
                    question_page, scheme_page = qp[part['question_page'] - 1], ms[part['scheme_page'] - 1]
                    question_box, marks = qp_region(part, question_page)
                    question_regions = normalize(question_page, [question_box])
                    if series == 'SPECIMEN' and ref == '09.11':
                        # Full table continues on the next page with its conversion grid.
                        mark_scheme_regions = (
                            normalize(scheme_page, [[40, 84, 568, 786]])
                            + normalize(ms[17], [[40, 84, 568, 580]])
                            + normalize(ms[15], [[40, 84, 568, 430]])
                        )
                    else:
                        mark_scheme_regions = normalize(scheme_page, ms_regions(ref, scheme_page))
                    qp_render.render(question_regions, destination / f'{ref}.webp')
                    ms_render.render(mark_scheme_regions, destination / f'{ref}_scheme.webp')
                    units.append({'reference': ref, 'marks': marks, 'question_regions': question_regions,
                                  'scheme_regions': mark_scheme_regions})
                except (AssertionError, ValueError) as error:
                    exceptions.append({'reference': ref, 'reason': str(error)})
        results[series] = {'split_parts': units, 'exceptions': exceptions}
    (args.output / 'parts-candidate.json').write_text(json.dumps(results, indent=2) + '\n')


if __name__ == '__main__':
    main()
