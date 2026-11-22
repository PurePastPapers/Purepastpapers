#!/usr/bin/env python3
"""Extract AQA Geography 7036/7037 reports using the verified source inventory.

Usage: python tools/reports/geography.py --pdf-dir DIR --output-dir DIR
Requires PyMuPDF. Download the PDFs named in the Geography inventories into DIR.
The extractor checks both the published hash and the active pack's report URL before
writing immutable-source metadata and starts every excerpt at a printed scope.
"""

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import fitz


REPO = Path(__file__).resolve().parents[2]
FORMAT = 'examiner-report-text-v1'
SUBJECT_ID = 'AQA_ALEVEL_GEOG_7037'
PART = r'0?[1-6]\.[1-6]'
PART_REF = re.compile(rf'(?<!\d)(?<!\d\.)({PART})(?!\d|\.\d)')
NUMBER = rf'(?:{PART}|0?[1-6])'
NUMBER_LIST = re.compile(
    rf'^{NUMBER}(?:\s*(?:/|,|&|and|ad|to|[–—-])\s*(?:Q\s*)?{NUMBER})*$', re.I)
END = re.compile(r'^Mark Ranges and Award of Grades|^Enhanced Results Analysis|^Get help and support', re.I)
GENERAL = re.compile(r'^(?:General(?: Introduction to the November Series)?|Synopsis and general points)$', re.I)
SUMMARY = re.compile(r'^(?:Concluding remarks|Key suggestions for improvements\b|Some suggestions for how students\b|Advice for students\b)', re.I)
SECTION = re.compile(r'^Section ([A-C])(?:\s*[–:—-]\s*.+)?$', re.I)
QWORD = re.compile(r'^(?:Questions?\s+|Q\.?\s*)', re.I)
LEGACY_OPTIONS = {
    'water and carbon': ('A', '3.1.1'),
    'coastal systems and landscapes': ('B', '3.1.3'),
    'glacial systems and landscapes': ('B', '3.1.4'),
    'hazards': ('C', '3.1.5'),
}
EXAMPLE = re.compile(r'\b(?:this (?:response|answer|student|example)|student answer|example (?:below|above)|'
                     r'response (?:below|above|shown)|shown below|below[,. )]|above[,. )])', re.I)
REF_TOKEN = rf'(?:Q(?:uestions?\s+|\.?\s*))?{PART}'
LEADING_GROUP = re.compile(rf'^(?:(?:On|In|For|Similarly,? on)\s+)?{REF_TOKEN}'
                           rf'(?:\s*(?:,|&|and|/)\s*{REF_TOKEN})+', re.I)
BULLET = re.compile(r'^(?:[•◦▪]|o(?=\s))\s*')
ANSWER_MARK = re.compile(r'^(?:Level [1-4]\s+)?\(?\d+ marks?\)?[.:]?$', re.I)
WRONG_COMPONENT = re.compile(r'\b(?:appeared|appears|was) in Paper ([12])\b', re.I)
ROUTE_CHANGE = re.compile(r'(?<=[.?!])\s+For those students studying (?:Resource Security|Changing Places|Population and Environment)\b', re.I)
EXAMPLE_ANNOTATION = re.compile(r'\b(?:this one|this\s+(?:recorded|example|specific)\s+response)\b', re.I)
# PDF pages whose scanned question prompt or continuation was visually checked.
# The editable prose can name a different question from the example on the same
# page. Keep these links independent and never infer the script from nearby text.
CANDIDATE_PAGES = {
    (2023, '1'): {
        '01.1': (6,), '01.2': (7,), '01.3': (11,), '01.4': (16, 17, 18),
        '02.2': (9,), '03.1': (5,), '04.4': (19, 20), '05.3': (10,), '05.4': (12, 13, 14),
    },
    (2023, '2'): {
        '01.1': (8,), '01.4': (22, 23, 24, 25, 26), '02.1': (7,),
        '02.3': (16,), '03.2': (10, 11), '04.3': (13, 14), '04.4': (18, 19, 20),
    },
    (2024, '1'): {
        '01.1': (6,), '01.2': (9,), '01.3': (12,), '01.4': (21, 22, 23),
        '02.1': (7,), '02.2': (8,), '02.3': (14,), '02.4': (18, 19, 20),
        '03.3': (13,), '03.4': (24, 25, 26), '04.1': (7,), '05.1': (6,),
        '05.2': (10,), '05.3': (11,), '05.4': (28, 31, 32), '05.5': (15, 16, 17), '06.4': (29, 30),
    },
    (2024, '2'): {
        '01.1': (6, 8), '01.2': (10,), '01.3': (14,), '01.4': (22, 23),
        '02.1': (9,), '02.2': (12,), '02.3': (13, 15),
        '03.3': (16,), '03.4': (19, 20), '03.5': (29, 30, 31),
        '04.5': (27, 28), '05.1': (7,), '05.4': (17, 18), '05.5': (24, 25, 26),
    },
    (2025, '1'): {
        '01.1': (5,), '01.2': (9,), '01.3': (14,), '01.4': (19, 20, 21),
        '03.1': (8,), '03.2': (10,), '03.3': (15,), '03.4': (25, 26),
        '04.2': (11,), '04.3': (16,), '04.4': (27, 28), '05.1': (6, 7),
        '05.2': (12,), '05.4': (18,), '05.5': (22, 23, 24), '06.3': (13,), '06.4': (17,),
    },
    (2025, '2'): {
        '01.1': (6, 7, 8), '01.2': (9,), '01.4': (22, 23, 24, 28, 29, 30),
        '02.1': (8,), '02.2': (11,), '02.3': (13, 16), '02.4': (25, 26, 27, 31, 32),
        '03.4': (18, 19), '03.5': (34, 35, 36, 42, 43, 44, 45, 46), '04.2': (10,),
        '04.3': (14, 15, 17), '04.4': (20,), '04.5': (37, 38, 39, 47, 48, 49), '05.5': (40, 41),
    },
}

FOOTER = re.compile(r'^(?:©|\d+ of \d+$|REPORT ON THE (?:EXAM|EXAMINATION)|AQA Education\b)', re.I)


@dataclass(frozen=True)
class Line:
    text: str
    lead: str
    font: str
    x: float
    y: float
    size: float
    page: int
    block: int

    @property
    def emphasized(self):
        return any(style in self.font for style in ('Bold', 'Medium'))


def lines_on(page):
    for block_number, block in enumerate(page.get_text('dict', flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)['blocks']):
        for row in block.get('lines', []):
            spans = [span for span in row['spans'] if span['text'].strip()]
            if not spans:
                continue
            first = spans[0]
            text = re.sub(r'\s+', ' ', ''.join(span['text'] for span in row['spans'])).strip()
            x, y = row['bbox'][:2]
            if x < 50 or y < 51 or y > page.rect.height - 60 or FOOTER.match(text):
                continue
            yield Line(text, first['text'].strip(), first['font'], x, y, first['size'], page.number + 1, block_number)


def join_text(text, continuation):
    return text + (' ' if text else '') + continuation


def section_data(heading, targets):
    return {'heading': heading, 'targets': targets, 'pages': [], 'paras': [], 'figures': []}


def add_paragraph(block, text, page_numbers, kind='p'):
    text = text.strip()
    if not text:
        return
    if kind == 'p' and BULLET.match(text):
        kind, text = 'li', BULLET.sub('', text)
    if not text:
        return
    block['paras'].append({'k': kind, 't': text})
    block['pages'] = sorted(set(block['pages']) | set(page_numbers))


def finish(sections, general, summary=None):
    result = {'sections': [{**section, 'id': f's{number}'} for number, section in enumerate(
        (section for section in sections if section['paras'] or section['figures']), 1)]}
    for name, item in [('general', general), ('summary', summary)]:
        if item and item['paras']:
            result[name] = {key: item[key] for key in ('pages', 'paras')}
    return result


def answer_targets(label):
    """Parse printed question/part lists, preserving decimal labels exactly."""
    if not NUMBER_LIST.fullmatch(label):
        return None
    targets = []
    for value in re.findall(NUMBER, label):
        question = str(int(value.split('.')[0]))
        targets.append({'q': question, 'part': value} if '.' in value else {'q': question})
    if re.search(r'\bto\b|[–—-]', label) and len(targets) == 2:
        first, last = targets
        if 'part' in first and 'part' in last and first['q'] == last['q']:
            first_label, first_index = first['part'].split('.')
            last_index = last['part'].split('.')[1]
            targets = [{'q': first['q'], 'part': f'{first_label}.{index}'}
                       for index in range(int(first_index), int(last_index) + 1)]
    return targets


def printed_heading(line, legacy_options):
    if line.x > 62:
        return None
    text = line.text
    label = line.lead if line.emphasized and line.lead != text else text
    if line.emphasized and (matched_section := SECTION.fullmatch(text)):
        return text, [{'section': matched_section[1]}], ''
    if line.emphasized and legacy_options and text.lower() in LEGACY_OPTIONS:
        section, route = LEGACY_OPTIONS[text.lower()]
        return text, [{'section': section, 'route': route}], ''
    prefixed = QWORD.match(label)
    # Plain numeric lines are print headings in AQA's June 2022 A-level Paper 2.
    # Other inline headings have a styled prefix, or start with a numeric label
    # and dash. Prose like "Q4.1 differentiated very well" is left in its scope.
    expression = QWORD.sub('', label)
    title = re.split(r'\s+[–—-]\s+', expression, maxsplit=1)
    targets = answer_targets(title[0].strip(' –—-'))
    if not targets and line.emphasized and prefixed:
        old_title = re.fullmatch(r'([1-5])\s+(?:Global Systems and Global Governance|Changing Places|'
                                 r'Contemporary Urban Environments|Population and Environment|Resource Security)',
                                 expression, re.I)
        if old_title:
            targets = [{'q': old_title[1]}]
    if not targets:
        return None
    if not line.emphasized and len(title) > 1 and not PART_REF.fullmatch(title[0]):
        return None
    rest = text[len(label):].lstrip(' –—-') if text.startswith(label) and label != text else ''
    if len(title) > 1 and not line.emphasized:
        rest = title[1]
        label = title[0]
    elif rest and all('part' not in target for target in targets):
        # Multi-style whole-question headings continue on the same line.
        label, rest = text, ''
    return label.strip(' –—-'), targets, rest


def legacy_report(document, *, legacy_options=False):
    sections, general = [], section_data('', [])
    summary = section_data('', [])
    current = general
    previous = None
    paragraph, paragraph_pages = '', set()

    def flush():
        nonlocal paragraph, paragraph_pages
        add_paragraph(current, paragraph, paragraph_pages)
        paragraph, paragraph_pages = '', set()

    for page in document:
        if page.number < 2:
            continue
        for line in sorted(lines_on(page), key=lambda line: (line.y, line.x)):
            if END.match(line.text):
                flush()
                return finish(sections, general, summary)
            if GENERAL.fullmatch(line.text):
                continue
            if line.emphasized and line.text.lower() == 'questions' and current in sections and not paragraph:
                if current['heading'].endswith('fieldwork investigation optional'):
                    current['heading'] += ' ' + line.text
                    continue
            if line.text.lower() == 'comments on individual questions':
                flush()
                continue
            if SUMMARY.match(line.text):
                flush()
                current = summary
                previous = None
                continue
            heading = printed_heading(line, legacy_options)
            if heading:
                flush()
                label, targets, rest = heading
                current = section_data(label, targets)
                sections.append(current)
                paragraph, paragraph_pages = rest, {line.page} if rest else set()
            else:
                if previous and (line.page != previous.page and paragraph.endswith(('.', '?', ':')) or
                                 line.page == previous.page and (line.y - previous.y > max(line.size, previous.size) * 2 or
                                 BULLET.match(line.text))):
                    flush()
                paragraph = join_text(paragraph, line.text)
                paragraph_pages.add(line.page)
            previous = line
    flush()
    return finish(sections, general, summary)


def modern_paragraphs(document):
    """Reflow editorial prose. Candidate answer images are never OCRed."""
    for page in document:
        if page.number < 2:
            continue
        previous = None
        paragraph = []
        for line in sorted(lines_on(page), key=lambda line: (line.y, line.x)):
            if END.match(line.text):
                if paragraph:
                    yield paragraph
                return
            if paragraph and (line.block != previous.block and line.y - previous.y > previous.size * 1.25 or
                              line.y - previous.y > previous.size * 2.5 or BULLET.match(line.text) or
                              line.size >= 13 or previous.size >= 13 or
                              'Italic' in line.font and 'Italic' not in previous.font):
                yield paragraph
                paragraph = []
            paragraph.append(line)
            previous = line
        if paragraph:
            yield paragraph


def candidate_image(page):
    return any(fitz.Rect(image['bbox']).get_area() > 18_000 for image in page.get_image_info())


def modern_report(document, year, component):
    """Use explicit printed references in reports arranged by assessment objective.

    Exact prose stays with its sole named part; group prose requires an explicit
    leading list. Unnumbered analysis is not silently assigned to the preceding part.
    Unreproduced mixed or unspecified comments remain discoverable in the full PDF.
    """
    sections, general = [], section_data('', [])
    before_question_types = True
    for lines in modern_paragraphs(document):
        first = lines[0]
        text = ' '.join(line.text for line in lines)
        if re.match(r'^4[ -]mark AO1 questions', text, re.I):
            before_question_types = False
        if first.size >= 13 or first.x > 90 or ANSWER_MARK.fullmatch(text):
            continue
        other_component = WRONG_COMPONENT.search(text)
        if other_component and other_component[1] != component:
            continue
        # AQA occasionally switches option within the same bullet without naming
        # the new question. That clause is not part of the numbered feedback.
        text = ROUTE_CHANGE.split(text, maxsplit=1)[0]
        refs = list(dict.fromkeys(PART_REF.findall(text)))
        if not refs:
            if before_question_types:
                add_paragraph(general, text, [first.page])
            continue
        if len(refs) > 1:
            prefix = LEADING_GROUP.match(BULLET.sub('', text))
            if not prefix or PART_REF.findall(prefix[0]) != refs:
                continue
        targets = [{'q': str(int(part.split('.')[0])), 'part': part} for part in refs]
        section = section_data(' / '.join(refs), targets)
        if EXAMPLE.search(text) or EXAMPLE_ANNOTATION.search(text) or 'Italic' in first.font:
            continue
        if text.endswith(('.', '?', '!', '”', '’', ')')):
            # Avoid publishing half-paragraphs split by a page or example image.
            add_paragraph(section, text, [first.page])
            sections.append(section)
    for part, pages in CANDIDATE_PAGES.get((year, component), {}).items():
        if not all(candidate_image(document[page - 1]) for page in pages):
            raise ValueError(f'{year} A-level Paper {component}: missing candidate image for {part}')
        section = section_data(part, [{'q': str(int(part.split('.')[0])), 'part': part}])
        section['pages'] = list(pages)
        section['figures'] = [{'page': page, 'count': 1} for page in pages]
        sections.append(section)
    return finish(sections, general)


def verify_report(path, source, paper):
    data = path.read_bytes()
    sha256 = hashlib.sha256(data).hexdigest()
    if sha256 != source['sha256'] or hashlib.sha1(data).hexdigest() != source['publisher_sha1']:
        raise ValueError(f'{path.name}: PDF hashes differ from the publisher inventory')
    with fitz.open(path) as document:
        cover = document[0].get_text()
        level = r'AS(?: LEVEL)?' if paper['is_as'] else r'A[- ]LEVEL'
        series = r'(?:June|Summer|August)' if paper['series'] == 'June' else paper['series']
        component = f"{paper['qualification_code']}[-/]{paper['assessment_paper']}"
        for expected in (rf'{level}\s+GEOGRAPHY', component, rf"{series}\s+{paper['year']}", r'Report on the exam'):
            if not re.search(expected, cover, re.I):
                raise ValueError(f'{path.name}: cover does not identify {paper["paper_id"]}: {expected}')
        is_modern = paper['qualification_code'] == '7037' and paper['year'] >= 2023
        report = modern_report(document, paper['year'], paper['assessment_paper']) if is_modern else legacy_report(document, legacy_options=paper['year'] == 2020)
        return {'format': FORMAT, 'subject_id': SUBJECT_ID, 'paper_id': paper['paper_id'],
                'source_url': source['url'], 'source_sha256': sha256, 'source_pages': len(document),
                'extracted_on': date.today().isoformat(), 'review_status': 'unreviewed',
                'coverage_status': 'partial' if is_modern else 'integrated', **report}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdf-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    inventories = REPO / 'data/imports/geography/inventory'
    for qualification in ('7036', '7037'):
        inventory = json.loads((inventories / f'{qualification}-inventory.json').read_text())
        for paper in inventory['papers']:
            source = paper['documents'].get('examiner_report')
            if not source:
                continue
            paper_id = paper['paper_id']
            pack = json.loads((REPO / 'data/packs/geography' / f'{paper_id}.json').read_text())
            if pack['papers'][0]['examiner_report_url'] != source['url']:
                raise ValueError(f'{paper_id}: active pack report URL differs from publisher inventory')
            report = verify_report(args.pdf_dir / source['file_name'], source, paper)
            question_numbers = {question['question_number'] for question in pack['questions']}
            printed_parts = {question['part_label'] for question in pack['questions']}
            printed_parts.update(item['question_number'] for item in pack['papers'][0].get('excluded_questions', []))
            route_scopes = {(question['section'], question['route']) for question in pack['questions']}
            for section in report['sections']:
                for target in section['targets']:
                    if target.get('q') and target['q'] not in question_numbers:
                        raise ValueError(f'{paper_id}: report heading references unknown question {target["q"]}')
                    if target.get('part') and target['part'].lstrip('0') not in printed_parts:
                        raise ValueError(f'{paper_id}: report heading references unknown part {target["part"]}')
                    if target.get('route') and (f'Section {target["section"]}', target['route']) not in route_scopes:
                        raise ValueError(f'{paper_id}: report heading references unknown route {target["route"]}')
            report_path = args.output_dir / f'{paper_id}.json'
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
            print(f'{paper_id}: {len(report["sections"])} sections, {report["source_pages"]} PDF pages')


if __name__ == '__main__':
    main()
