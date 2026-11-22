#!/usr/bin/env python3
"""Extract verified 9HI0 Route H reports against the History source inventory.

Pass a directory containing official PDFs saved by paper ID or URL filename. Writes
one report per available text extraction plus an optional source audit file. This
does not write the shared report index. Requires PyMuPDF. Tesseract can distinguish
image-only Examiner Comments and Examiner Tip labels in sample-response boxes.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
from datetime import date
from pathlib import Path

import fitz

REPO = Path(__file__).resolve().parents[2]
INVENTORY = REPO / 'data/imports/history/inventory/9hi0-route-h-inventory.json'
QUESTION = re.compile(r'^Question ([1-6])\.?$|^Q([1-5]):\s', re.I)
SUMMARY = re.compile(
    r'^Paper Summary$|^Based on (their|the) performance on this paper\b|^Students are offered the following advice for the future',
    re.I,
)
SECTION = re.compile(
    r'^Sections? ([ABC])(?:\s*(?:/| and )\s*([ABC]))?'
    r'(?: (?:responses|source question(?: \(Q1 or Q2\))?|essay questions))?:?$',
    re.I,
)
SECTION_ADVICE = re.compile(
    r'^(?:To score in the higher levels for|Common issues which hindered performance in)'
    r' sections? ([ABC])(?: and ([ABC]))?(?:, candidates should| were)?:$',
    re.I,
)
STOP = re.compile(
    r'^(?:GCE History 9HI0 \w+ )?Grade boundaries\b|^Pearson Education Limited\. Registered',
    re.I,
)
BOX = re.compile(r'^Examiner(?:[’\']s)?\s+(Comments?|Tips?)$', re.I)
SHORT_BOX_EXPLANATION = re.compile(r'^(?:This|An|A) (?:\w+ ){0,5}(?:response|answer|essay)', re.I)

# Manually checked PDF page starts, including question numbers visible in the
# answer-sheet images that must not be selected. These two PDFs lack usable
# character maps, so the source audit can link to pages but emits no text.
PDF_ONLY = {
    'EDX_9HI0_2024_JUNE_1H': {'1': 5, '2': 13, '3': 19, '4': 24, '5': 33},
    'EDX_9HI0_2024_JUNE_2H': {'2': 12, '5': 35, '6': 40},
}
ROUTE_QUESTIONS = {
    '1H': {'1': 'A', '2': 'A', '3': 'B', '4': 'B', '5': 'C'},
    '2H': {'2': 'A', '5': 'B', '6': 'B'},
    '33': {'1': 'A', '2': 'B', '3': 'B', '4': 'C', '5': 'C'},
}


def clean_text(text):
    return ' '.join(text.replace('\u00ad', '').split())


def text_blocks(page):
    """Keep the PDF's paragraphs, splitting any section heading merged into one."""
    for block in page.get_text('dict', flags=0)['blocks']:
        lines = block.get('lines', [])
        pending = []
        bounds = None
        for line in lines:
            text = clean_text(''.join(span['text'] for span in line['spans']))
            if not text or line['bbox'][1] >= page.rect.height * 0.95:
                continue
            if pending and SECTION.fullmatch(text):
                yield bounds, pending
                pending = []
            if not pending:
                bounds = line['bbox']
            pending.append(text)
        if pending:
            yield bounds, pending


def image_label(page, image, known_labels):
    if not shutil.which('tesseract'):
        return None
    rect = fitz.Rect(image['bbox'])
    pixmap = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=rect, colorspace=fitz.csGRAY)
    key = hashlib.sha256(pixmap.samples).digest()
    if key not in known_labels:
        result = subprocess.run(
            ['tesseract', 'stdin', 'stdout', '--psm', '11'], input=pixmap.tobytes('png'),
            capture_output=True, check=False, env={**os.environ, 'OMP_THREAD_LIMIT': '1'},
        )
        label = result.stdout.decode(errors='replace')
        match = re.search(r'Examiner\s*(Comments?|Tips?)', label, re.I)
        known_labels[key] = 'tip' if match and match[1].lower().startswith('tip') else 'ex' if match else None
    return known_labels[key]


def label_for(text, bounds, labels):
    if BOX.fullmatch(text):
        return None
    x0, y0, _, _ = bounds
    for label, box in reversed(labels):
        left, top, right, bottom = box
        if top <= y0 and -10 <= x0 - left <= 35 and y0 - bottom <= 170:
            return label, top
        if top <= y0 and left - 90 <= x0 <= right and y0 - bottom <= 35:
            return label, top
    return None


def make_block(heading=None, targets=None):
    return {'heading': heading, 'targets': targets, 'pages': set(), 'paras': [], 'figures': [],
            'last_figure_page': None, 'last_box': None}


def finish(block):
    return {'pages': sorted(block['pages']), 'paras': block['paras'], 'figures': block['figures']}


def add_paragraph(block, lines, page, kind=None, box_top=None):
    """Keep wrap joins and the source page for example comments and tips."""
    block['pages'].add(page)
    if kind in ('ex', 'tip'):
        key = (page, kind, box_top)
        text = ' '.join(lines)
        if block['last_box'] == key:
            block['paras'][-1]['t'] += ' ' + text
        else:
            block['paras'].append({'k': kind, 't': text, 'page': page})
        block['last_box'] = key
        return
    block['last_box'] = None
    for index, line in enumerate(lines):
        bullet = re.match(r'^[•●▪\uf0b7]\s*', line)
        if bullet or index == 0:
            block['paras'].append({'k': 'li' if bullet else kind or 'p',
                                   't': line[bullet.end():] if bullet else line})
        else:
            block['paras'][-1]['t'] += ' ' + line


def split_history(doc, component, known_labels):
    expected = ROUTE_QUESTIONS[component]
    option = {'option': '2H.2'} if component == '2H' else {}
    targets = [{'q': number, 'part': '', **option} for number in expected]
    by_number = {target['q']: target for target in targets}
    seen_questions = []
    general, summary = make_block(), make_block()
    sections = []
    current = None
    in_summary = False
    for page in doc:
        page_num = page.number + 1
        if page_num <= 2:  # cover and copyright page
            continue
        blocks = list(text_blocks(page))
        images = page.get_image_info()
        scripts = [image['bbox'] for image in images if image['width'] > 0
                   and image['bbox'][2] - image['bbox'][0] > page.rect.width * 0.65
                   and image['bbox'][3] - image['bbox'][1] > 40]
        labels = []
        if seen_questions and not in_summary:
            for image in images:
                left, top, right, bottom = image['bbox']
                if 125 <= right - left <= 170 and 40 <= bottom - top <= 65:
                    kind = image_label(page, image, known_labels)
                    labels.append((kind or 'unknown', image['bbox']))
            for bounds, lines in blocks:
                match = BOX.fullmatch(' '.join(lines))
                if match:
                    kind = 'tip' if match[1].lower().startswith('tip') else 'ex'
                    labels.append((kind, bounds))
        labels.sort(key=lambda label: label[1][1])

        events = [(bounds[1], 'text', bounds, lines) for bounds, lines in blocks]
        events.extend((bounds[1], 'script', bounds, []) for bounds in scripts)
        for _, kind, bounds, lines in sorted(events, key=lambda event: event[0]):
            if kind == 'script':
                if current and current['targets'] and 'q' in current['targets'][0]:
                    if current['last_figure_page'] not in (page_num - 1, page_num):
                        current['figures'].append({'page': page_num, 'count': 1})
                    current['last_figure_page'] = page_num
                    current['pages'].add(page_num)
                continue

            first = lines[0]
            text = ' '.join(lines)
            if any(STOP.match(line) for line in lines):
                return general, summary, sections, seen_questions
            question = QUESTION.match(first)
            if question and (len(lines) == 1 or question[2]) and not in_summary:
                number = question[1] or question[2]
                seen_questions.append(number)
                current = None
                if number in by_number:
                    current = make_block(f'Question {number}', [by_number[number]])
                    sections.append(current)
                    current['pages'].add(page_num)
                    if question[2]:
                        # The October 2020 report sometimes places the printed
                        # prompt and the opening feedback in the same text block.
                        end = next((index for index, line in enumerate(lines) if line.endswith('?')), None)
                        if end is not None and lines[end + 1:]:
                            add_paragraph(current, lines[end + 1:], page_num)
                continue
            if SUMMARY.match(first):
                in_summary = True
                current = None if option else summary
                if first.lower().startswith(('based on ', 'students are offered ')):
                    continue
                lines = lines[1:]
            elif first == 'Introduction' and not seen_questions:
                current = None if option else general
                lines = lines[1:]
            elif first.lower().startswith('comments on individual questions'):
                current = None
                continue
            elif section := SECTION.fullmatch(first) or SECTION_ADVICE.fullmatch(first):
                if in_summary or (not seen_questions and current):
                    letters = list(filter(None, section.groups()))
                    section_targets = [{'section': letter, **option} for letter in letters]
                    if not current or current['targets'] != section_targets:
                        heading = 'Section ' + letters[0] if len(letters) == 1 else 'Sections ' + ' and '.join(letters)
                        current = make_block(heading, section_targets)
                        sections.append(current)
                    current['pages'].add(page_num)
                    if section.re == SECTION_ADVICE:
                        add_paragraph(current, [first], page_num, 'h')
                    lines = lines[1:]
            if not current or not lines or BOX.fullmatch(text):
                continue
            if re.fullmatch(r'(?:GCE )?History\s+9HI0\s*\w+\s*\d*', text, re.I):
                continue
            style, box_top = label_for(text, bounds, labels) or (None, None)
            if style == 'unknown':
                continue
            if style and current['targets'] and 'q' in current['targets'][0]:
                current['last_figure_page'] = None
            elif labels and current['targets'] and 'q' in current['targets'][0] and SHORT_BOX_EXPLANATION.match(first):
                # Leave unclassified box notes linked in the source rather than joining
                # their text to the report's question-level observations.
                continue
            add_paragraph(current, lines, page_num, style, box_top)
    return general, summary, sections, seen_questions


def build_paper(record, paper, pdf, known_labels):
    paper_id = record['paper_id']
    component = record['component']
    document = record['documents']['examiner_report']
    digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
    if digest != document['sha256']:
        raise ValueError(f'{paper_id}: PDF differs from the verified source digest')
    source = {'paper_id': paper_id, 'source_url': document['url'], 'source_sha256': digest}
    if paper['examiner_report_url'] != source['source_url']:
        raise ValueError(f'{paper_id}: active paper report URL differs from the inventory')
    expected = ROUTE_QUESTIONS[component]
    source.update({
        'format': 'examiner-report-text-v1', 'extractor_version': 1,
        'subject_id': paper['subject_id'], 'extracted_on': date.today().isoformat(),
        'review_status': 'unreviewed',
    })
    audit_fields = ('paper_id', 'source_url', 'source_sha256', 'source_pages')
    with fitz.open(pdf) as doc:
        source['source_pages'] = len(doc)
        audit = {key: source[key] for key in audit_fields}
        if len(doc) == 1 and re.search(r'will not publish an Examiner[’\']s Report',
                                     clean_text(doc[0].get_text()), re.I):
            return None, {**audit, 'status': 'not_published'}
        if paper_id in PDF_ONLY:
            question_pages = PDF_ONLY[paper_id]
            option = {'option': '2H.2'} if component == '2H' else {}
            sections = [
                {'id': f's{index}', 'heading': f'Question {number}',
                 'targets': [{'q': number, 'part': '', **option}],
                 'pages': [page], 'paras': [], 'figures': []}
                for index, (number, page) in enumerate(question_pages.items(), 1)
            ]
            return {**source, 'coverage_status': 'unreadable', 'sections': sections}, {
                **audit, 'status': 'unreadable', 'question_pages': question_pages}
        general, summary, blocks, seen = split_history(doc, component, known_labels)
    printed = [str(n) for n in range(1, 7 if component == '2H' else 6)]
    if seen != printed:
        raise ValueError(f'{paper_id}: expected printed questions {printed}, saw {seen}')
    sections = [
        {'id': f's{i}', 'heading': block['heading'], 'targets': block['targets'], **finish(block)}
        for i, block in enumerate(blocks, 1) if block['paras']
    ]
    question_pages = {section['targets'][0]['q']: section['pages'][0] for section in sections
                      if 'q' in section['targets'][0]}
    if list(question_pages) != list(expected):
        raise ValueError(f'{paper_id}: incomplete Route H question coverage {question_pages}')
    report = {**source, 'sections': sections}
    for name, block in (('general', general), ('summary', summary)):
        if block['paras']:
            report[name] = finish(block)
    return report, {**audit, 'status': 'integrated', 'question_pages': question_pages}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdf-dir', required=True, type=Path)
    parser.add_argument('--out', type=Path, default=REPO / 'data/reports/history')
    parser.add_argument('--audit', type=Path)
    parser.add_argument('--paper', action='append', default=[])
    args = parser.parse_args()
    inventory = json.loads(INVENTORY.read_text())['papers']
    known_labels = {}
    audit = []
    for record in inventory:
        paper_id = record['paper_id']
        if args.paper and paper_id not in args.paper:
            continue
        pack = json.loads((REPO / f'data/packs/history/{paper_id}.json').read_text())
        paper = pack['papers'][0]
        questions = {str(int(question['question_number'])): question['section'].split()[-1]
                     for question in pack['questions']}
        if questions != ROUTE_QUESTIONS[record['component']]:
            raise ValueError(f'{paper_id}: active pack does not match the Route H questions')
        if record['component'] == '2H' and any(q['option'] != '2H.2' for q in pack['questions']):
            raise ValueError(f'{paper_id}: active pack includes an unexpected option')
        url_name = record['documents']['examiner_report']['url'].rsplit('/', 1)[-1]
        pdf = args.pdf_dir / f'{paper_id}.pdf'
        if not pdf.is_file():
            pdf = args.pdf_dir / url_name
        report, record_audit = build_paper(record, paper, pdf, known_labels)
        audit.append(record_audit)
        target = args.out / f'{paper_id}.json'
        if report:
            args.out.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n')
        else:
            target.unlink(missing_ok=True)
    if args.audit:
        args.audit.write_text(json.dumps(audit, indent=2) + '\n')


if __name__ == '__main__':
    main()
