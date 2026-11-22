#!/usr/bin/env python3
"""Plan Further Maths source crops for unlabelled text between scored parts."""
import argparse
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
FORMAT = 'fmaths-scoped-lead-ins-v1'
PAGE_FURNITURE = re.compile(
    r'DO NOT WRITE|BLANK PAGE|Turn over|Total for Question|TOTAL FOR PAPER|'
    r'Question \d+(?:\s|\()?[^A-Za-z]*continued|Sample Assessment Materials|'
    r'Pearson Edexcel|Leave blank|^\*?[A-Z]?\d{5,}[A-Z0-9]*\*?$', re.I)
ANSWER_LINE = re.compile(r'^[\s.…_·\-–]{4,}$')
SCORED_OR_LABELLED = re.compile(r'^\s*\(\s*(?:\d{1,2}|[a-h]|i{1,3}|iv)\s*\)(?:\s|$)')
GRAPHIC_CUE = re.compile(r'\b(?:figure|fig\.?|table|diagram|graph|matrix|plot|tableau|below|shown)\b', re.I)
WORDS = re.compile(r'\b[a-zA-Z]{2,}\b')

# Matching immutable MediaBox coordinates reviewed directly against printed pages.
CORE_2019 = 'EDX_8FM0_2019_JUNE_01'
MANUAL = {
    CORE_2019: ('9e968b74773ab6d6ace0602eb744b842598930ca76dc52fae003155e398295e8', {
        ('1', '(b)'): (2, (56, 156, 547, 227), 'Transformation T definition and additional conditions'),
        ('1', '(c)'): (2, (56, 156, 547, 178), 'Transformation T definition'),
        ('5', '(d)'): (10, (56, 401, 547, 422), 'Instruction referring to the required Diagram 1 insert'),
        ('6', '(b)'): (14, (56, 213, 547, 235), 'Population size of 85'),
        ('8', '(b)'): (20, (56, 230, 547, 331), 'Plane and shortest-tunnel model'),
        ('10', '(b)(ii)'): (28, (56, 258, 547, 333), 'Total and juvenile/adult data'),
        ('10', '(d)'): (28, (56, 575, 547, 612), 'New age constraint'),
    }),
    'EDX_8FM0_2024_JUNE_26': ('4c892fbb4f56fb628636f13d8bca4000a06e61a87d6f66b4e1a104b63ddfdebb', {
        ('4', '(c)'): (12, (84, 452, 545, 763), 'New lamina and Figure 4'),
    }),
    'EDX_8FM0_2024_JUNE_27': ('8bc1df4c9dacd3cac662299ed0a75c7e2a6f9d12e854102e46062eeff52d759a', {
        ('1', '(d)'): (3, (84, 310, 545, 379), 'New list of eleven numbers for bubble sort'),
    }),
    'EDX_8FM0_2020_AUTUMN_26': ('663c69b32ed9edab4d04dfa8b125e017646f498480a412dc038e028951241a4f', {
        ('1', '(c)'): (2, (85, 460, 504, 482), 'Mass added to the lamina'),
    }),
    'EDX_8FM0_2023_JUNE_25': ('6eef9795931d4c572784e1cbafbe061d82df7c213e1f3028cd816fc3dee55e2a', {
        ('4', '(b)'): (12, (85, 366, 200, 398), 'Coefficient of restitution greater than one half'),
    }),
    'EDX_9FM0_2020_AUTUMN_P4C': ('285b48fbb3e26c7f0a63c4703a7a15caff8781c0718b65a9dc56847c405166f0', {
        ('3', '(b)'): (8, (85, 211, 486, 233), 'Time for speed to decrease from 4 to 2'),
    }),
    'EDX_9FM0_2021_AUTUMN_P4C': ('726c9c9655a8b0de3f44245b461b87de0b49273697b23b538d98d8ead984de5e', {
        ('2', '(c)'): (6, (85, 232, 263, 253), 'Distance fallen at time t'),
    }),
    'EDX_9FM0_2021_AUTUMN_P4A': ('03a8c1fbb1fcaf04d6b685676a877fca4e21365fae67fbd093550361f32eec49', {
        ('7', '(c)'): (20, (85, 584, 489, 606), 'Instruction to use the results in (a) and (b)'),
    }),
    'EDX_9FM0_2019_JUNE_P4C': ('dcf4ede2e6b08d56dcb17ce4993fcec05e7c112e330d43aca7e30b865ef69f2d', {
        ('7', '(b)'): (24, (56, 160, 486, 211), 'Direction of acceleration and given speed squared'),
    }),
    'EDX_9FM0_2023_JUNE_P3C': ('0b5117be5708029f0563a8ed88059e0825719f4bd6adee7374e2a49275a0b4f1', {
        ('4', '(b)'): (12, (84, 188, 477, 255), 'Displacement, release and constant resistance model'),
        ('4', '(c)'): (12, (84, 288, 477, 355), 'Release at O, maximum speed at B and constant resistance model'),
    }),
    'EDX_9FM0_2025_JUNE_P3C': ('d3d2952464ab5d400503f499b072bd07b0389415fca9ce0d4970a22bf38715fd', {
        ('8', '(b)'): (24, (84, 609, 414, 662), 'Velocity after impact and coefficient of restitution one third'),
    }),
}


def read(path):
    return json.loads(path.read_text())


def overlaps_box(box, region, width, height):
    left, top, right, bottom = region['bbox']
    inner_w = min(right * width, box.x1) - max(left * width, box.x0)
    inner_h = min(bottom * height, box.y1) - max(top * height, box.y0)
    return inner_w >= box.width * .85 and inner_h >= box.height * .85


def covered(box, page, width, height, regions):
    return any(r['page'] == page and overlaps_box(box, r, width, height) for r in regions)


def geometry(records):
    """Return the source regions exposed for each linked group and standalone unit."""
    order = {record['question_id']: i for i, record in enumerate(records)}
    by_id = {record['question_id']: record for record in records}
    adjacency = defaultdict(set)
    for uid, record in by_id.items():
        for dep in record.get('depends_on_question_ids', ()):
            if dep in order and order[dep] < order[uid]:
                adjacency[uid].add(dep)
                adjacency[dep].add(uid)

    def own(record):
        provenance = record['provenance']
        return provenance.get('source_regions', []) + provenance.get('required_insert_regions', [])

    def context(record):
        return (record['provenance'].get('context_regions', [])
                if record.get('context', {}).get('stem_image_url') else [])

    def lead(record):
        if not record.get('context', {}).get('lead_in_image_url'):
            return []
        provenance = record['provenance']
        return (provenance.get('source_lead_in_regions') or
                (provenance.get('context_regions', [])[-1:] if provenance.get('context_bridge_text') else []))

    visibility = {}
    for uid, record in by_id.items():
        component, frontier = set(), [uid]
        while frontier:
            current = frontier.pop()
            if current in component:
                continue
            component.add(current)
            frontier.extend(adjacency[current] - component)
        first = by_id[min(component, key=order.__getitem__)]
        standalone = own(record) + context(record) + lead(record)
        linked = context(first) + [region for key in component for region in own(by_id[key]) + lead(by_id[key])]
        visibility[uid] = linked, standalone
    return visibility


def page_text(page):
    """Extract complete horizontal lines before the gap is bounded."""
    rows = []
    for block in page.get_text('dict', flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)['blocks']:
        for line in block.get('lines', ()):
            if line['dir'] != (1.0, 0.0):
                continue
            text = ' '.join(''.join(span['text'] for span in line['spans']).split())
            if text:
                rows.append((fitz.Rect(line['bbox']), text))
    return sorted(rows, key=lambda row: (round(row[0].y0, 1), row[0].x0))


def page_graphics(page):
    boxes = [fitz.Rect(drawing['rect']) for drawing in page.get_drawings()]
    boxes.extend(fitz.Rect(image['bbox']) for image in page.get_image_info())
    return [box for box in boxes if box.width < page.rect.width * .84 and box.height < page.rect.height * .55
            and max(box.width, box.height) >= 3]


def normal_box(page, box):
    return {'page': page.number + 1,
            'bbox': [round(value / dimension, 6) for value, dimension in
                     zip(box, [page.rect.width, page.rect.height] * 2)]}


def source_gap(page, rows, graphics, window, linked, standalone):
    width, height = page.rect.width, page.rect.height
    lines = [(box, text) for box, text in rows
             if box.x1 >= window.x0 and box.x0 <= window.x1
             and box.y0 >= window.y0 - 1 and box.y1 <= window.y1 + 1
             and not PAGE_FURNITURE.search(text)]
    anchors = [(box, text) for box, text in lines if not SCORED_OR_LABELLED.match(text)
               and len(WORDS.findall(text)) >= 3]
    if not anchors or any(SCORED_OR_LABELLED.match(text) for _, text in lines):
        return None
    number = page.number + 1
    missing = [box for box, _ in anchors if not covered(box, number, width, height, linked)]
    has_graphics = any(GRAPHIC_CUE.search(text) for _, text in anchors)
    first_y = min(box.y0 for box, _ in anchors)
    last_answer_line = max((box.y1 for box, text in lines
                            if ANSWER_LINE.fullmatch(text) and box.y1 < first_y), default=window.y0)
    content = [box for box, text in lines if box.y1 > last_answer_line and not ANSWER_LINE.fullmatch(text)]
    if has_graphics:
        content.extend(box for box in graphics if box.y0 >= last_answer_line and box.y1 <= window.y1
                       and box.x0 >= window.x0 and box.x1 <= window.x1)
    if not missing and not any(not covered(box, number, width, height, linked) for box in content):
        return None
    combined = fitz.Rect(content[0])
    for box in content[1:]:
        combined |= box
    # Keep padding inside the area bounded by the previous tariff and current part label.
    crop = fitz.Rect(max(window.x0, combined.x0 - 4), max(window.y0, combined.y0 - 2),
                     min(window.x1, combined.x1 + 4), min(window.y1, combined.y1 + 2))
    flags = ['printed_text_between_scored_parts']
    if has_graphics:
        flags.append('figure_or_table_context')
    existing = all(covered(box, number, width, height, standalone) for box in content)
    return normal_box(page, crop), ' '.join(text for _, text in anchors), flags, existing


def inspect(pack, candidate, pdf, paper_id, sha):
    source = {question['number']: question for question in candidate['questions']}
    visible = geometry(pack['questions'])
    manual_sha, manual = MANUAL.get(paper_id, (sha, {}))
    if manual_sha != sha:
        raise ValueError(f'{paper_id}: reviewed lead-in source changed')
    cached = {}
    result = {}
    for unit in pack['questions']:
        uid = unit['question_id']
        provenance = unit['provenance']
        if provenance['question_source_sha256'] != sha:
            raise ValueError(f'{uid}: lead-in plan requires the checksum-matched, component-local source')
        question = source[unit['question_number']]
        indices = provenance.get('original_tariff_indices', [])
        if not indices or not 0 < indices[0] < len(question['parts']):
            continue
        index = indices[0]
        previous, current = question['parts'][index - 1:index + 1]
        start = current.get('start')
        if not start:
            continue
        linked, standalone = visible[uid]
        override = manual.get((unit['question_number'], unit.get('part_label')))
        regions, texts, flags = [], [], set()
        existing = True
        if override:
            number, coords, description = override
            page = pdf[number - 1]
            page.set_cropbox(page.mediabox)
            box = fitz.Rect(coords)
            width, height = page.rect.width, page.rect.height
            region = normal_box(page, box)
            if region not in provenance.get('source_lead_in_regions', []):
                regions.append(region)
                texts.append(description)
                flags.add('visual_source_review')
                existing = covered(box, number, width, height, standalone)
        else:
            for fragment in question['regions']:
                number = fragment['page']
                if not previous['page'] <= number <= start['page']:
                    continue
                page = pdf[number - 1]
                if number not in cached:
                    page.set_cropbox(page.mediabox)
                    cached[number] = page, page_text(page), page_graphics(page)
                page, rows, graphics = cached[number]
                width, height = page.rect.width, page.rect.height
                x0, y0, x1, y1 = fragment['bbox']
                top = previous['bottom'] + 1 if number == previous['page'] else max(42, y0 * height)
                bottom = start['top'] - 1 if number == start['page'] else min(height - 70, y1 * height)
                if bottom - top < 8:
                    continue
                window = fitz.Rect(max(x0, .075) * width, top, min(x1, .925) * width, bottom)
                found = source_gap(page, rows, graphics, window, linked, standalone)
                if found:
                    region, description, warnings, also_in_standalone = found
                    regions.append(region)
                    texts.append(description)
                    flags.update(warnings)
                    existing = existing and also_in_standalone
                    if number != start['page']:
                        flags.add('earlier_page')
        if regions:
            result[uid] = {'regions': regions, 'text': ' '.join(texts), 'flags': sorted(flags),
                           'standalone_already_has_context': existing}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidates', action='append', type=Path, required=True)
    parser.add_argument('--sources', action='append', type=Path, required=True)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('paper_ids', nargs='*')
    args = parser.parse_args()
    packs = ROOT / 'data/packs/fmaths'
    paper_ids = args.paper_ids or sorted(path.stem for path in packs.glob('EDX_[89]FM0_*.json'))
    papers = {}
    for paper_id in paper_ids:
        candidate_paths = [base / f'{paper_id}.json' for base in args.candidates]
        source_paths = [base / paper_id / 'question_paper.pdf' for base in args.sources]
        candidate_path = next((path for path in candidate_paths if path.is_file()), None)
        source_path = next((path for path in source_paths if path.is_file()), None)
        if not candidate_path or not source_path:
            raise FileNotFoundError(f'{paper_id}: missing candidate or question-source PDF')
        candidate = read(candidate_path)
        sha = hashlib.sha256(source_path.read_bytes()).hexdigest()
        if sha != candidate['source_sha256']:
            raise ValueError(f'{paper_id}: candidate and question source checksums differ')
        with fitz.open(source_path) as pdf:
            questions = inspect(read(packs / f'{paper_id}.json'), candidate, pdf, paper_id, sha)
        if questions:
            papers[paper_id] = {'question_source_sha256': sha, 'questions': questions}
    args.output.write_text(json.dumps({'format': FORMAT, 'papers': papers}, indent=2, ensure_ascii=False) + '\n')
    print(f'Planned {sum(len(paper["questions"]) for paper in papers.values())} lead-ins across {len(papers)} papers')


if __name__ == '__main__':
    main()
