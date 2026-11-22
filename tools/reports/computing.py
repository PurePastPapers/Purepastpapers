#!/usr/bin/env python3
"""Extract OCR H046/H446 examiner commentary and links to named exemplars.

Inputs are the official PDFs named by the existing inventory, identified by
their paper IDs in the local PDF directory. Requires PyMuPDF, Pillow and Poppler.
"""
import argparse
from collections import Counter
from dataclasses import dataclass
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import subprocess

import fitz
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
HEADING = re.compile(r'^Question (\d+)(.*)$')
PART = re.compile(r'\(([a-z]+)\)')
ROMAN = re.compile(r'i{1,3}|iv|vi{0,3}|ix|x')
EXEMPLAR = re.compile(r'Exemplar \d+')
OVERVIEW = re.compile(r'Paper [12] series overview')
SECTION_OVERVIEW = re.compile(r'Section ([AB]) overview')
TOC_ENTRY = re.compile(r'^\s*(Question\s+.*?)\s*\.{5,}\s*(\d+)\s*$')
CALLOUT = re.compile(r'^(Misconception|Assessment for learning|AfL)(?:\s+|$)')
INK = 0x20234E
# Section B starts at the question printed directly below the Section B title
# in each of these original H446/02 question papers.
SECTION_B_START = {
    'OCR_H446_2022_JUNE_02': 8,
    'OCR_H446_2023_JUNE_02': 9,
    'OCR_H446_2024_JUNE_02': 9,
    'OCR_H446_2025_JUNE_02': 8,
}
CODE_EXAMPLE_PAPER = 'OCR_H446_2023_JUNE_02'
ACID_PAPER = 'OCR_H446_2022_JUNE_01'
EXACT_EXEMPLAR_PAPER = 'OCR_H446_2023_JUNE_01'
# In both cases the printed question images in the report and the original
# question paper identify the full target or group omitted from the heading/TOC.
INCOMPLETE_HEADINGS = {
    ('OCR_H446_2022_JUNE_02', 'Question 4 (ii)'): 'Question 4 (a) (ii)',
    ('OCR_H446_2022_JUNE_02', 'Question 4 (iii)'): 'Question 4 (a) (iii)',
}
TOC_QUIRKS = {('OCR_H446_2023_JUNE_01', 'Question 5 (a)'): 'Question 5 (a), (b)'}


@dataclass
class Line:
    text: str
    x: float
    y: float
    right: float
    size: float
    color: int


def page_lines(page):
    """Read the selectable text layer, which excludes the printed question images."""
    lines = []
    for block in page.get_text('dict', flags=fitz.TEXTFLAGS_TEXT)['blocks']:
        for row in block['lines']:
            spans = row['spans']
            text = ''.join(span['text'] for span in spans).strip()
            left, top, right, _ = row['bbox']
            if text and (52 < top < page.rect.height - 30 or text == 'Supporting you'):
                lines.append(Line(text, left, top, right, spans[0]['size'], spans[0]['color']))
    lines.sort(key=lambda line: (round(line.y), line.x))
    return lines


def report_marker(line):
    if line.color != INK:
        return None
    if 13 <= line.size < 15 and HEADING.fullmatch(line.text):
        return 'question'
    if 11 <= line.size < 13 and EXEMPLAR.fullmatch(line.text):
        return 'exemplar'
    if line.size >= 17 and OVERVIEW.fullmatch(line.text):
        return 'overview'
    if line.size >= 17 and SECTION_OVERVIEW.fullmatch(line.text):
        return 'section'
    if line.size >= 30 and line.text == 'Supporting you':
        return 'end'
    return None


def question_targets(paper_id, heading):
    corrected = INCOMPLETE_HEADINGS.get((paper_id, heading), heading)
    match = HEADING.fullmatch(corrected)
    number = match[1]
    targets = []
    previous = []
    for piece in re.split(r'\s*(?:,|\band\b)\s*', match[2].replace('*', '').strip()):
        next_number = re.match(r'^(\d+)\s*', piece)
        if next_number:
            number = next_number[1]
            piece = piece[next_number.end():]
            previous = []
        parts = PART.findall(piece)
        if re.sub(r'\s+', '', piece) != ''.join(f'({part})' for part in parts):
            raise ValueError(f'{paper_id}: unsupported heading {heading}')
        if len(parts) == 1 and len(previous) > 1 and ROMAN.fullmatch(parts[0]):
            parts.insert(0, previous[0])
        targets.append({'q': number, 'part': ''.join(f'({part})' for part in parts)})
        previous = parts
    return targets


def reflow(lines, kind='p'):
    paragraphs = []
    previous = None
    empty_callout = False
    for line in lines:
        bullet = re.match(r'^\s*[•●▪]\s*(.*)$', line.text)
        named = CALLOUT.match(line.text)
        subheading = line.color == INK and line.size >= 11 and kind == 'p'
        start = previous is None or named or bullet or subheading or (not empty_callout and abs(line.y - previous.y) > 19)
        if start:
            if named:
                label = 'Assessment for learning' if named[1] == 'AfL' else named[1]
                rest = line.text[named.end():]
                paragraph = {'k': 'tip' if kind == 'p' else kind, 't': f'{label}: {rest}'.rstrip()}
                empty_callout = not rest
            else:
                paragraph = {'k': 'li' if bullet and kind == 'p' else kind, 't': bullet[1] if bullet else line.text}
                if subheading:
                    paragraph['k'] = 'h'
            paragraphs.append(paragraph)
        else:
            paragraph = paragraphs[-1]
            paragraph['t'] = f"{paragraph['t']} {line.text}".strip()
            empty_callout = False
        previous = line
    return [paragraph for paragraph in paragraphs if paragraph['t']]


def review_general(lines):
    """Read OCR's two-column performance summary in its printed column order."""
    left_title = next((line for line in lines if line.text == 'Candidates who did well on this paper'), None)
    right_title = next((line for line in lines if line.text == 'Candidates who did less well on this paper'), None)
    if not left_title or not right_title or abs(left_title.y - right_title.y) > 2:
        return reflow(lines)
    top = min(left_title.y, right_title.y) - 2
    bottom = next((line.y for line in lines if line.y > top and line.x < left_title.x - 3), float('inf'))
    before = [line for line in lines if line.y < top]
    left = [line for line in lines if top <= line.y < bottom and line.x < right_title.x - 3]
    right = [line for line in lines if top <= line.y < bottom and line.x >= right_title.x - 3]
    after = [line for line in lines if line.y >= bottom]
    result = reflow(before)
    for column in (left, right):
        column_paragraphs = reflow(column)
        if column_paragraphs:
            column_paragraphs[0]['k'] = 'h'
            result.extend(column_paragraphs)
    return result + reflow(after)


def with_bullets(lines):
    """Some PDF versions store the bullet and its words as separate line fragments."""
    output = []
    consumed = set()
    for index, line in enumerate(lines):
        if index in consumed:
            continue
        if line.text == '•':
            for continuation_index in range(index + 1, len(lines)):
                other = lines[continuation_index]
                if other.y - line.y > 2:
                    break
                if 0 < other.x - line.right < 24:
                    consumed.add(continuation_index)
                    line = Line(f'• {other.text}', line.x, line.y, other.right, line.size, line.color)
                    break
        output.append(line)
    return output


def announced_pages(pdf, paper_id):
    text = subprocess.run(['pdftotext', '-layout', str(pdf), '-'], check=True,
                          capture_output=True, text=True).stdout
    toc = []
    for page in text.split('\f')[1:3]:
        for line in page.splitlines():
            match = TOC_ENTRY.fullmatch(line)
            if match:
                heading, number = match.groups()
                toc.append((TOC_QUIRKS.get((paper_id, heading), heading), int(number)))
    return toc


def validate_targets(paper_id, sections, pack):
    units = pack['questions']
    candidates = {(str(unit['question_number']), unit.get('part_label') or '') for unit in units}
    for section in sections:
        for target in section['targets']:
            if target.get('section'):
                if not target['questions'] or not set(target['questions']) <= {q for q, _ in candidates}:
                    raise ValueError(f'{paper_id}: section {target["section"]} contains an unknown printed question')
                continue
            q, part = target['q'], target['part']
            if not any(q == n and (not part or not unit or unit.startswith(part) or part.startswith(unit))
                       for n, unit in candidates):
                raise ValueError(f'{paper_id}: heading {section["heading"]} has no printed unit for {q}{part}')


def section_targets(paper_id, letter, pack):
    boundary = SECTION_B_START[paper_id]
    numbers = sorted({int(unit['question_number']) for unit in pack['questions']})
    return [{'section': letter, 'questions': [str(q) for q in numbers if (q < boundary) == (letter == 'A')]}]


def regroup_acid(sections, paper_id):
    if paper_id != ACID_PAPER:
        return sections
    headings = [f'Question 2 (d) ({numeral})' for numeral in ('i', 'ii', 'iii')]
    parts = [section for section in sections if section['heading'] in headings]
    if [section['heading'] for section in parts] != headings or any(section['paras'] for section in parts[:2]):
        raise ValueError(f'{paper_id}: the shared ACID comment moved')
    # The report prints (i) and (ii) as bare question images on page 15
    # and follows (iii) with a single comment on "these questions" on page 16.
    shared = parts[-1]
    shared['heading'] = 'Question 2 (d) (i), (ii) and (iii)'
    shared['targets'] = [target for part in parts for target in part['targets']]
    return [section for section in sections if section not in parts[:2]]


def scope_grouped_exemplar(sections, paper_id):
    if paper_id != EXACT_EXEMPLAR_PAPER:
        return sections
    index = next(i for i, section in enumerate(sections) if section['heading'] == 'Question 5 (a), (b)')
    section = sections[index]
    example_paras = [para for para in section['paras'] if para['k'] == 'ex']
    if not example_paras or [figure['page'] for figure in section['figures']] != [28]:
        raise ValueError(f'{paper_id}: the question 5(b) exemplar moved')
    # The handwritten program and its comment on page 28 apply only to (b).
    example = {
        'id': section['id'] + '-example', 'heading': 'Example response for Question 5 (b)',
        'targets': [{'q': '5', 'part': '(b)'}], 'pages': [28],
        'paras': example_paras, 'figures': section['figures'],
    }
    section['pages'] = [27]
    section['paras'] = [para for para in section['paras'] if para['k'] != 'ex']
    section['figures'] = []
    return sections[:index + 1] + [example] + sections[index + 1:]


def retain_code_example(doc, sections, pack, image_dir):
    # OCR supplied the sample independently of the handwritten exemplars.
    section = next(s for s in sections if s['heading'] == 'Question 9 (f)*')
    if not {38, 39} <= set(section['pages']):
        raise ValueError(f'{CODE_EXAMPLE_PAPER}: the Section B code example moved')
    tip_index = next(i for i, para in enumerate(section['paras']) if para['k'] == 'tip')
    section_tip = {
        'k': 'p', 't': section['paras'][tip_index]['t'].removeprefix('Assessment for learning: '),
    }
    section['paras'] = section['paras'][:tip_index]
    section['pages'] = [38]
    image_name = f'{CODE_EXAMPLE_PAPER}_section_b_code.webp'
    page = doc[38]
    clip = fitz.Rect(40, 61, 562, 800)
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.65, 1.65), clip=clip)
    image = Image.frombytes('RGB', (pixmap.width, pixmap.height), pixmap.samples)
    image_dir.mkdir(parents=True, exist_ok=True)
    image.save(image_dir / image_name, format='WEBP', lossless=True)
    return {
        'id': 'section-b-code', 'heading': 'Section B assessment for learning',
        'targets': section_targets(CODE_EXAMPLE_PAPER, 'B', pack),
        'pages': [38, 39], 'figures': [],
        'paras': [section_tip, {
            'k': 'p', 't': 'OCR’s sample Python code for Section B.',
            'img': [{'src': f'cs/img/{image_name}', 'w': pixmap.width, 'h': pixmap.height}],
        }],
    }


def extract(paper, pack, pdf, extracted_on, image_dir, review_status):
    paper_id = paper['paper_id']
    source = paper['documents']['examiner_report']
    checksum = hashlib.sha256(pdf.read_bytes()).hexdigest()
    if checksum != source['sha256']:
        raise ValueError(f'{paper_id}: report PDF differs from the official inventory checksum')
    canonical = pack['papers'][0]
    if canonical['paper_id'] != paper_id or canonical['examiner_report_url'] != source['url']:
        raise ValueError(f'{paper_id}: live paper does not match the official inventory')

    general = {'pages': [], 'paras': []}
    sections = []
    section = None
    exemplar = None
    general_started = False
    found_end = False
    with fitz.open(pdf) as doc:
        series = 'Autumn' if paper['series'] == 'November' else 'Summer'
        cover = doc[0].get_text()
        component = f"{paper['qualification_code']}/{paper['component']}"
        qualification = 'AS LEVEL' if paper['is_as'] else 'A LEVEL'
        if any(token not in cover for token in (f'{component} {series} {paper["year"]} series', qualification, 'Examiners’ report')):
            raise ValueError(f'{paper_id}: wrong report cover')

        for page_number, page in enumerate(doc, 1):
            if page_number < 3:
                continue
            lines = with_bullets(page_lines(page))
            markers = [(line, kind) for line in lines if (kind := report_marker(line))]
            if not general_started and not any(kind == 'overview' for _, kind in markers):
                continue

            region = []

            def finish_region(next_top):
                if section is None:
                    if region and general_started:
                        general['pages'].append(page_number)
                        general['paras'].extend(review_general(region))
                elif exemplar is not None:
                    paras = reflow(region, 'ex')
                    # A named exemplar may span the following page. Unlike a named
                    # example, a continuation page does not increment the script count.
                    if exemplar['page'] != page_number and any(
                        x1 - x0 > 180 and y1 - y0 > 60 and y0 >= 60 and y1 <= next_top + 2
                        for image in page.get_image_info()
                        for x0, y0, x1, y1 in [image['bbox']]
                    ):
                        exemplar.setdefault('pages', [exemplar['page']]).append(page_number)
                        section['pages'].append(page_number)
                    if paras:
                        section['pages'].append(page_number)
                        section['paras'].extend(paras)
                elif region:
                    section['pages'].append(page_number)
                    section['paras'].extend(reflow(region))

            for line in lines:
                marker = report_marker(line)
                if not marker:
                    region.append(line)
                    continue
                finish_region(line.y)
                region = []
                if marker == 'end':
                    found_end = True
                    break
                if marker == 'overview':
                    general_started = True
                elif marker == 'question':
                    section = {
                        'id': f's{len(sections) + 1}', 'heading': line.text,
                        'targets': question_targets(paper_id, line.text),
                        'pages': [page_number], 'paras': [], 'figures': [],
                    }
                    sections.append(section)
                    exemplar = None
                elif marker == 'section':
                    letter = SECTION_OVERVIEW.fullmatch(line.text)[1]
                    section = {
                        'id': f'section-{letter.lower()}', 'heading': line.text,
                        'targets': section_targets(paper_id, letter, pack),
                        'pages': [page_number], 'paras': [], 'figures': [],
                    }
                    sections.append(section)
                    exemplar = None
                elif marker == 'exemplar':
                    if section is None:
                        raise ValueError(f'{paper_id}: unowned exemplar on page {page_number}')
                    exemplar = {'page': page_number, 'count': 1}
                    section['figures'].append(exemplar)
                    section['pages'].append(page_number)
            finish_region(page.rect.height - 20)
            if found_end:
                break
        source_pages = len(doc)
        if paper_id == CODE_EXAMPLE_PAPER:
            sections.append(retain_code_example(doc, sections, pack, image_dir))

    if not found_end or not general['paras']:
        raise ValueError(f'{paper_id}: missing verified overview or report end')
    toc = announced_pages(pdf, paper_id)
    heading_pages = [(s['heading'], s['pages'][0]) for s in sections if HEADING.fullmatch(s['heading'])]
    if heading_pages != toc:
        raise ValueError(f'{paper_id}: contents and body headings differ: {Counter(heading_pages) - Counter(toc)}, {Counter(toc) - Counter(heading_pages)}')
    if not sections and paper['series'] != 'November':
        raise ValueError(f'{paper_id}: unexpected general-only report')
    sections = scope_grouped_exemplar(regroup_acid(sections, paper_id), paper_id)
    for section in sections:
        if not section['paras']:
            raise ValueError(f'{paper_id}: {section["heading"]} has no commentary')
        section['pages'] = sorted(set(section['pages']))
    general['pages'] = sorted(set(general['pages']))
    validate_targets(paper_id, sections, pack)
    return {
        'format': 'examiner-report-text-v1',
        'paper_id': paper_id,
        'subject_id': canonical['subject_id'],
        'coverage_status': 'integrated' if sections else 'general_only',
        'source_url': source['url'],
        'source_sha256': checksum,
        'source_pages': source_pages,
        'extracted_on': extracted_on,
        'review_status': review_status,
        'general': general,
        'sections': sections,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdf-dir', type=Path, required=True, help='directory containing <PAPER_ID>.pdf')
    parser.add_argument('--inventory-dir', type=Path, default=ROOT / 'data/imports/cs/inventory')
    parser.add_argument('--pack-dir', type=Path, default=ROOT / 'data/packs/cs')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'data/reports/cs')
    parser.add_argument('--extracted-on', default=date.today().isoformat())
    parser.add_argument('--reviewed', action='store_true', help='record completed model visual review')
    args = parser.parse_args()
    output = {}
    review_status = 'model_reviewed' if args.reviewed else 'unreviewed'
    for qualification in ('H446', 'H046'):
        inventory_file = args.inventory_dir / f'{qualification}-inventory.json'
        for paper in json.loads(inventory_file.read_text())['papers']:
            if not paper['documents'].get('examiner_report', {}).get('url'):
                continue
            paper_id = paper['paper_id']
            pack = json.loads((args.pack_dir / f'{paper_id}.json').read_text())
            output[paper_id] = extract(
                paper, pack, args.pdf_dir / f'{paper_id}.pdf', args.extracted_on,
                args.output_dir / 'img', review_status,
            )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    for paper_id, report in output.items():
        (args.output_dir / f'{paper_id}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(f"{paper_id}: {report['source_pages']} PDF pages, {len(report['sections'])} sections")


if __name__ == '__main__':
    main()
