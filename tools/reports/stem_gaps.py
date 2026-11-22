#!/usr/bin/env python3
"""Rebuild the visually verified STEM examiner-report gaps from original local PDFs."""
import argparse
import hashlib
import json
import re
import shutil
import sys
import tempfile
from collections import defaultdict
from datetime import date
from pathlib import Path

MATHS_AS = 'EDX_8MA0_2020_OCTOBER_21'
BIOLOGY_P1 = 'EDX_9BN0_2021_NOVEMBER_01'
BIOLOGY_P3 = 'EDX_9BN0_2021_NOVEMBER_03'
PHYSICS_2020 = 'EDX_9PH0_2020_OCTOBER_01'
PHYSICS_2024 = 'EDX_9PH0_2024_JUNE_01'

VERIFIED_SOURCES = {
    MATHS_AS: ('maths', '0f2cd4bfff46a623985cb1a3c3f9dd03000b881caee281447810da03ce8a4a1d', 4, 5),
    BIOLOGY_P1: ('biology', '5ca0ccfe2a94696083cea2793da8cbb087c7fb8e608763d920a71bc7835d687f', 7, 30),
    BIOLOGY_P3: ('biology', '5205d415937ef2dece646e9f695a7a5769391337137e5ba721ef554164c0fc5f', 12, 33),
    PHYSICS_2020: ('physics', '9c8763c76e46f0bba40dec557c07f9eea8e4a143760b9297a386b3d9d3a9fae9', 6, 25),
    PHYSICS_2024: ('physics', '61cc3ed000a324cd8f69e9b1ade0fea9e11e9a7d0cf1100ee457a86b10f91a1c', 91, 24),
}
MATHS_AS_URL = 'https://qualifications.pearson.com/content/dam/pdf/A-Level/Mathematics/2017/Exam-materials/8MA0_-21_pef_20201217.pdf'
PARTH = r'\(\s*[a-z]+\s*\)'
BIOLOGY_P1_HEAD = re.compile(rf'^(\d{{1,2}}(?:{PARTH})+)(.+)$')
BIOLOGY_P3_HEAD = re.compile(rf'^(\d{{1,2}})(\)?(?:{PARTH})+(?: and {PARTH})?)$')
PHYSICS_HEAD = re.compile(r'^(\d{2}[a-e](?:i{1,3})?) (.+)$')
PHYSICS_2024_HEADS = (
    (4, '11 (a)'), (7, '11 (b)'), (12, '12'), (16, '13 (a)'), (19, '13 (b)'),
    (22, '14 (a)'), (24, '14 (b)'), (26, '14 (c)'), (28, '14 (d)'),
    (33, '15 (a)(i)'), (38, '15 (a)(ii)'), (41, '15 (b)(i)'), (43, '15 (b)(ii)'),
    (46, '16 (a)'), (47, '16 (b)'), (54, '16 (c)'), (58, '17 (a)'),
    (61, '17 (b)(i)'), (65, '17 (b)(ii)'), (67, '17 (c)(i-ii)'),
    (70, '18 (a)'), (74, '18 (b)(i)'), (79, '18 (b)(ii)'), (83, '18 (c)(i-ii)'),
)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=1) + '\n')


def header(line, text):
    return {**line, 'text': text, 'bold': True, 'math': False}


def body(line, text):
    return {**line, 'text': text, 'bold': False}


def normalize_short_report(pages, paper_id):
    """Promote proven left-margin short-form labels into the common Pearson grammar."""
    printed = {}
    for page in pages:
        if page['number'] < 3:
            continue
        lines = []
        for line in page['lines']:
            text = line['text']
            head = rest = display = None
            if paper_id == BIOLOGY_P1 and line['left'] == 128:
                match = BIOLOGY_P1_HEAD.fullmatch(text)
                if match:
                    display, rest = match.groups()
                    head = 'Question ' + display.replace(' ', '')
                elif text.startswith('Overall most students'):
                    lines.append(header(line, 'Paper Summary'))
            elif paper_id == BIOLOGY_P3 and line['left'] == 108:
                match = BIOLOGY_P3_HEAD.fullmatch(text)
                if match:
                    display = text
                    head = 'Question ' + match[1] + match[2].removeprefix(')')
                elif text == '5(b(i)':
                    display = text
                    head = 'Question 5(b)(i)'
                elif text == '7 (levels based question).':
                    display = text
                    head = 'Question 7'
                elif text.startswith('The 9BN0/03 Biology paper'):
                    lines.append(header(line, 'Introduction'))
            elif paper_id == PHYSICS_2020 and line['left'] == 128:
                match = PHYSICS_HEAD.fullmatch(text)
                if match:
                    display, rest = match.groups()
                    head = 'Question ' + display
                elif text.startswith('Question 15, as a whole, '):
                    head = 'Question 15'
                    display = 'Question 15, as a whole'
                    rest = text
            if head:
                lines.append(header(line, head))
                printed[head] = display
            if rest is not None:
                lines.append(body(line, rest.strip()))
            elif not head:
                lines.append(line)
        page['lines'] = lines
    return printed


def unreadable_page_links(extract):
    out = {'coverage_status': 'unreadable', 'sections': []}
    out['general'] = {'pages': [3], 'paras': []}
    out['summary'] = {'pages': [89], 'paras': []}
    for idx, (page, heading) in enumerate(PHYSICS_2024_HEADS, 1):
        normalized = heading.replace('(i-ii)', '(i) and (ii)')
        targets = extract.parse_heading('Question ' + normalized)
        assert targets
        next_page = PHYSICS_2024_HEADS[idx][0] if idx < len(PHYSICS_2024_HEADS) else 89
        out['sections'].append({
            'id': f's{idx}', 'heading': 'Question ' + heading, 'targets': targets,
            'pages': list(range(page, next_page)), 'paras': [], 'figures': [],
        })
    return out


def validate_targets(extract, paper_id, split, questions):
    by_no = defaultdict(set)
    for question in questions:
        parts = question.get('provenance', {}).get('original_parts') or ['']
        by_no[str(question['question_number'])].update(extract.norm_part(part) for part in parts)
    for section in split['sections']:
        for target in section['targets']:
            parts = by_no[target['q']]
            part = target.get('part', '')
            if part and not any(p.startswith(part) or part.startswith(p) for p in parts):
                raise ValueError(f'{paper_id}: no matching question for {target}')


def build_report(extract, repo, pdf_dir, output, paper_id):
    slug, checksum, expected_pages, expected_sections = VERIFIED_SOURCES[paper_id]
    pack = json.loads((repo / 'data' / 'packs' / slug / f'{paper_id}.json').read_text())
    paper, = pack['papers']
    pdf = pdf_dir / f'{paper_id}.pdf'
    actual_checksum = hashlib.sha256(pdf.read_bytes()).hexdigest()
    if actual_checksum != checksum:
        raise ValueError(f'{paper_id}: verified PDF checksum changed ({actual_checksum})')
    if paper_id == PHYSICS_2024:
        split = unreadable_page_links(extract)
    else:
        pages = extract.read_layout(pdf)
        if len(pages) != expected_pages or extract.garbled(pages):
            raise ValueError(f'{paper_id}: unreadable or unexpected page count')
        printed = normalize_short_report(pages, paper_id)
        split = extract.split_report(pages)
        for section in split['sections']:
            section['heading'] = printed.get(section['heading'], section['heading'])
            if paper_id == BIOLOGY_P3 and section['heading'] == '2(b)':
                # The report discusses MP4 here and separately labels 2(b)(ii), which has 3 marks.
                section['targets'] = [{'q': '2', 'part': '(b)(i)'}]
        extract.PAGE_WIDTHS.clear()
        extract.PAGE_WIDTHS.update({page['number']: page['width'] for page in pages})
        extract.crop_maths(split, pdf, slug, paper_id)
    if len(split['sections']) != expected_sections:
        raise ValueError(f"{paper_id}: expected {expected_sections} headings, got {len(split['sections'])}")
    validate_targets(extract, paper_id, split, pack['questions'])
    report = {
        'format': extract.FORMAT, 'extractor_version': extract.EXTRACTOR_VERSION,
        'paper_id': paper_id, 'subject_id': paper['subject_id'],
        'source_url': MATHS_AS_URL if paper_id == MATHS_AS else paper['examiner_report_url'],
        'source_sha256': checksum, 'source_pages': expected_pages,
        'extracted_on': date.today().isoformat(), 'review_status': 'model_reviewed',
        **split,
    }
    write_json(output / 'data' / 'reports' / slug / f'{paper_id}.json', report)
    print(f'{paper_id}: {len(split["sections"])} sections')


# Each exception was checked against the literal report heading and printed question.
PHYSICS_TARGET_FIXES = {
    'EDX_8PH0_2016_JUNE_02': {'s7': ('11', '(a)', '(b)'), 's11': ('12', '(b)', '(c)')},
    'EDX_8PH0_2017_JUNE_01': {
        's13': ('11', '(a)', '(b)'), 's20': ('14', '(a)', '(b)'), 's21': ('14', '(a)', '(b)'),
    },
    'EDX_8PH0_2020_OCTOBER_02': {'s21': ('17', '(c)(ii)')},
    'EDX_8PH0_2022_JUNE_01': {'s18': ('17', '(b)(iii)')},
    'EDX_9PH0_2021_OCTOBER_02': {'s16': ('19', '(a)(i)', '(a)(ii)'), 's20': ('20', '(a)(i)', '(a)(ii)')},
    'EDX_9PH0_2025_JUNE_01': {'s11': ('15', '(a)', '(b)')},
    'EDX_9PH0_2025_JUNE_03': {'s27': ('12', '(a)(i)', '(a)(ii)'), 's29': ('12', '(b)(i)', '(b)(ii)')},
}
MATHS_SECTION_FIXES = {
    'EDX_8MA0_2019_JUNE_01': {
        'q': '7', 'page': 6, 'prefix': '(a) There were many well drawn sketches',
        'replace_ids': ('s8',), 'new_ids': ('s8', 's8a'),
    },
    'EDX_9MA0_2020_OCTOBER_01': {
        'q': '11', 'page': 6, 'prefix': '(b) It was very common to see just the first mark',
        'replace_ids': ('s12', 's12a', 's12b'), 'new_ids': ('s12a', 's12b'),
    },
}


def verified_existing_source(repo, pdf_dir, slug, paper_id):
    path = Path('data') / 'reports' / slug / f'{paper_id}.json'
    report = json.loads((repo / path).read_text())
    pdf = pdf_dir / f'{paper_id}.pdf'
    if hashlib.sha256(pdf.read_bytes()).hexdigest() != report['source_sha256']:
        raise ValueError(f'{paper_id}: existing PDF checksum changed')
    return path, report, pdf


def repair_intro_as_maths(report):
    first = report['sections'][0]
    if first['heading'] != 'questions 9d.':
        return
    # This lower-case line is the continuation of the introduction on page 3.
    report['general']['paras'][-1]['t'] += ' ' + first['heading']
    report['general']['paras'].append({'k': 'p', 't': ' '.join(p['t'] for p in first['paras'])})
    report['sections'].pop(0)


def repair_maths(extract, repo, pdf_dir, output, paper_id, fix):
    path, report, pdf = verified_existing_source(repo, pdf_dir, 'maths', paper_id)
    pages = extract.read_layout(pdf)
    page = pages[fix['page'] - 1]
    number = fix['q']
    # A running label (a)/(b) was printed inside the first body line.
    matches = [l for l in page['lines'] if l['text'].startswith(fix['prefix'])]
    if len(matches) != 1:
        raise ValueError(f'{paper_id}: expected one verified inline heading')
    line = matches[0]
    part = line['text'][:3]
    index = page['lines'].index(line)
    page['lines'][index:index + 1] = [
        header(line, f'Question {number}{part}'),
        body(line, line['text'][3:].strip()),
    ]
    parsed = extract.split_report(pages)
    sections = [s for s in parsed['sections'] if s['targets'][0]['q'] == number]
    replacement = sections[:2] if number == '7' else sections[1:]
    if len(replacement) != len(fix['new_ids']):
        raise ValueError(f'{paper_id}: unexpected corrected section count')
    for section, new_id in zip(replacement, fix['new_ids'], strict=True):
        section['id'] = new_id
    if number == '11':
        part_a, part_b = replacement
        # The diagram on page 7 is called out by the part (a) prose.
        part_a['figures'], part_b['figures'] = part_b['figures'], []
        part_a['pages'] = sorted({*part_a['pages'], *(fig['page'] for fig in part_a['figures'])})
        # The first note on page 7 belongs to (b), but the geometry diagram below it
        # is an examiner reference for part (a), rather than a candidate script.
        for figure in part_a['figures']:
            figure['kind'] = 'examiner_diagram'
    extract.PAGE_WIDTHS.clear()
    extract.PAGE_WIDTHS.update({p['number']: p['width'] for p in pages})
    with tempfile.TemporaryDirectory() as scratch:
        root = Path(scratch)
        extract.REPO = root
        extract.crop_maths({'sections': replacement}, pdf, 'maths', paper_id)
        for crop in root.glob('data/reports/maths/img/*.webp'):
            target = output / crop.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(crop, target)
    extract.REPO = output
    targets = set(fix['replace_ids']) | set(fix['new_ids'])
    first = next(i for i, s in enumerate(report['sections']) if s['id'] in targets)
    report['sections'] = [s for s in report['sections'] if s['id'] not in targets]
    report['sections'][first:first] = replacement
    if number == '7':
        repair_intro_as_maths(report)
    write_json(output / path, report)


def repair_physics(extract, repo, pdf_dir, output, paper_id, fixes):
    path, report, _ = verified_existing_source(repo, pdf_dir, 'physics', paper_id)
    sections = {s['id']: s for s in report['sections']}
    for key, (question, *parts) in fixes.items():
        section = sections[key]
        if section['targets'][0]['q'] != question:
            raise ValueError(f'{paper_id}: {key} is not Q{question}')
        section['targets'] = [{'q': question, 'part': part} for part in parts]
        if (paper_id, key) == ('EDX_8PH0_2020_OCTOBER_02', 's21'):
            section['source_heading'] = section.get('source_heading', section['heading'])
            section['heading'] = 'Question 17(c)(ii)'
        if (paper_id, key) == ('EDX_8PH0_2022_JUNE_01', 's18'):
            section['source_heading'] = section.get('source_heading', section['heading'])
            section['heading'] = 'Q17(b)(iii)'
    pack = json.loads((repo / 'data' / 'packs' / 'physics' / f'{paper_id}.json').read_text())
    validate_targets(extract, paper_id, report, pack['questions'])
    write_json(output / path, report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf_dir', type=Path, help='directory of original PDFs named <paper_id>.pdf')
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--output', type=Path, help='write report data under this directory (defaults to repository)')
    parser.add_argument('--paper', action='append', metavar='PAPER_ID', help='rebuild only this paper ID (repeatable)')
    parser.add_argument('--existing-fixes', action='store_true', help='apply checksum-verified corrections to existing reports')
    args = parser.parse_args()
    repo = args.repo.resolve()
    output = args.output.resolve() if args.output else repo
    sys.path.insert(0, str(repo / 'tools' / 'reports'))
    import extract

    selected = [*VERIFIED_SOURCES]
    if args.existing_fixes:
        selected.extend(MATHS_SECTION_FIXES)
        selected.extend(PHYSICS_TARGET_FIXES)
    for paper_id in args.paper or selected:
        if paper_id not in selected:
            parser.error(f'no enabled correction for {paper_id}')
        extract.REPO = output
        if paper_id in VERIFIED_SOURCES:
            build_report(extract, repo, args.pdf_dir, output, paper_id)
        elif paper_id in MATHS_SECTION_FIXES:
            repair_maths(extract, repo, args.pdf_dir, output, paper_id, MATHS_SECTION_FIXES[paper_id])
        else:
            repair_physics(extract, repo, args.pdf_dir, output, paper_id, PHYSICS_TARGET_FIXES[paper_id])


if __name__ == '__main__':
    main()
