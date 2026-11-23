#!/usr/bin/env python3
"""Verify public AQA 7692/2 writing pairs and record exact option and scheme pages."""

import argparse
from collections import defaultdict
from hashlib import sha256
from itertools import combinations
import json
from pathlib import Path
import re
from subprocess import check_output
import unicodedata


WORKS = (
    ('CASA_BERNARDA_ALBA', 'La casa de Bernarda Alba'),
    ('CRONICA_MUERTE_ANUNCIADA', 'Crónica de una muerte anunciada'),
    ('AGUA_PARA_CHOCOLATE', 'Como agua para chocolate'),
    ('REQUIEM_CAMPESINO', 'Réquiem por un campesino español'),
    ('SOMBRA_DEL_VIENTO', 'La sombra del viento'),
    ('CASA_DE_LOS_ESPIRITUS', 'La casa de los espíritus'),
    ('RIMAS', 'Rimas'),
    ('BICICLETAS_PARA_EL_VERANO', 'Las bicicletas son para el verano'),
    ('OTRO_ARBOL_DE_GUERNICA', 'El otro árbol de Guernica'),
    ('CORONEL_NO_TIENE_QUIEN_LE_ESCRIBA', 'El coronel no tiene quien le escriba'),
    ('LABERINTO_DEL_FAUNO', 'El laberinto del fauno'),
    ('OCHO_APELLIDOS_VASCOS', 'Ocho apellidos vascos'),
    ('MARIA_LLENA_ERES_DE_GRACIA', 'María, llena eres de gracia'),
    ('VOLVER', 'Volver'),
    ('ABEL', 'Abel'),
    ('LAS_13_ROSAS', 'Las 13 rosas'),
)
ESSAY = re.compile(r'^\s*(\d)\s+(\d)\s+\.\s*([12])\s+(.+)')
SAMPLE_ESSAY = re.compile(r'^Question (\d)(\d)\.([12])\s*$')
WORK = re.compile(r'^\s*(\d)\s+(\d)\s{2,}([^\d.].+)')
TARIFF = re.compile(r'^\s*\[40 marks?\]\s*$')
STRUCTURE = re.compile(r'^(?:\d+|or|either|turn over.*|(?:ib/h/|marks scheme|mark scheme –|section [ab]|end of questions|copyright|do not write|there are no questions).*)$', re.I)
PAIR_STEMS = {
    'AQA_7692_2020_AUTUMN_P2': ('QP-NOV20', 'W-MS-NOV20', '7692/2R', 'NOVEMBER 2020'),
    'AQA_7692_2021_AUTUMN_P2': ('QP-NOV21', 'MS-NOV21', '7692/2', 'JUNE 2021'),
    **{f'AQA_7692_{year}_JUNE_P2': (f'QP-JUN{year % 100}', f'MS-JUN{year % 100}', '7692/2', f'JUNE {year}')
       for year in range(2022, 2026)},
    'AQA_7692_SAMPLE_1_P2': ('SQP', 'SMS', '7692/2', 'SPECIMEN'),
}


def pdf_pages(path):
    return check_output(['pdftotext', '-layout', str(path), '-'], text=True).split('\f')[:-1]


def norm(text):
    return ''.join(char.casefold() for char in unicodedata.normalize('NFC', text) if char.isalnum())


def parse(pages, is_scheme=False, specimen=False):
    units = {}
    work = None
    active = None
    for page_no, page in enumerate(pages[1:], 2):
        for raw in page.splitlines():
            line = raw.strip()
            if not line:
                continue
            match = ESSAY.fullmatch(raw.rstrip())
            sample = SAMPLE_ESSAY.fullmatch(line) if specimen and is_scheme else None
            heading = WORK.fullmatch(raw.rstrip())
            if match or sample:
                groups = (match or sample).groups()
                number = int(''.join(groups[:2]))
                label = f'{number:02}.{groups[2]}'
                if label in units or not 1 <= number <= len(WORKS):
                    raise ValueError(f'Duplicate or unexpected essay {label} on page {page_no}')
                if match and (work is None or work[0] != number):
                    raise ValueError(f'Work header does not match {label} on page {page_no}: {work}')
                active = {'prompt': [groups[3]] if match else [], 'pages': {page_no},
                          'marked': False, 'content': [], 'title_pending': bool(sample)}
                units[label] = active
            elif heading and 1 <= int(''.join(heading.groups()[:2])) <= len(WORKS):
                number = int(''.join(heading.groups()[:2]))
                work = (number, line)
                expected = WORKS[number - 1][1]
                if not norm(heading.group(3)).startswith(norm(expected)):
                    raise ValueError(f'Unexpected work title on page {page_no}: {line}')
                active = None
            elif line.lower() in ('end of questions', 'aqa.org.uk'):
                active = None
            elif STRUCTURE.fullmatch(line) or not active:
                continue
            elif TARIFF.fullmatch(line):
                active['marked'] = True
            elif active['title_pending']:
                number = int(label.split('.')[0])
                if not norm(line).startswith(norm(WORKS[number - 1][1])):
                    raise ValueError(f'Unexpected specimen scheme work title: {line}')
                active['title_pending'] = False
            elif not active['marked']:
                active['prompt'].append(line)
                active['pages'].add(page_no)
            elif is_scheme:
                active['content'].append(line)
                active['pages'].add(page_no)
    expected = [f'{number:02}.{part}' for number in range(1, len(WORKS) + 1) for part in (1, 2)]
    if list(units) != expected:
        raise ValueError(f'Unexpected printed option menu: {list(units)}')
    if any(not unit['marked'] or not unit['prompt'] or (is_scheme and not unit['content']) for unit in units.values()):
        raise ValueError('A printed essay is missing its stem, tariff or indicative content.')
    return units


def document(path, pdf, resources):
    source = resources[path.name.upper()]
    return {'filename': path.name, 'url': source['url'],
            'sha256': sha256(path.read_bytes()).hexdigest(), 'pdf_pages': len(pdf)}


def check_pairs(directory, resources):
    evidence = {}
    for paper_id, (paper_stem, scheme_stem, code, printed_series) in PAIR_STEMS.items():
        question_path = directory / f'AQA-76922-{paper_stem}.PDF'
        scheme_path = directory / f'AQA-76922-{scheme_stem}.PDF'
        qp = pdf_pages(question_path)
        ms = pdf_pages(scheme_path)
        if not re.search(rf'{re.escape(code)}\b', qp[0]) or not re.search(r'(?im)\b2 hours\b', qp[0]):
            raise ValueError(f'{paper_id}: wrong question paper identity')
        if not re.search(r'(?im)maximum mark .*80', ' '.join(qp[0].split())) or 'approximately 300 words' not in qp[0]:
            raise ValueError(f'{paper_id}: wrong maximum or suggested length')
        if not re.search(rf'{re.escape(code)}\b', ms[0]) or printed_series not in ms[0].upper():
            raise ValueError(f'{paper_id}: wrong scheme identity')
        rubric = [i for i, page in enumerate(ms, 1) if re.search(r'^\s*AO[34]\s*$', page, re.M)]
        if rubric != [4, 5]:
            raise ValueError(f'{paper_id}: unsupported rubric pages {rubric}')
        questions = parse(qp)
        schemes = parse(ms, is_scheme=True, specimen=paper_stem == 'SQP')
        options = []
        differences = []
        for label, question in questions.items():
            scheme = schemes[label]
            if norm(' '.join(question['prompt'])) != norm(' '.join(scheme['prompt'])):
                differences.append((label, ' '.join(question['prompt']), ' '.join(scheme['prompt'])))
            number = int(label.split('.')[0])
            slug, title = WORKS[number - 1]
            options.append({'label': label, 'marks': 40,
                            'work': {'id': f'AQA_SPAN_WORK_{slug}', 'title': title, 'type': 'text' if number <= 10 else 'film'},
                            'question_pages': sorted(question['pages']), 'scheme_pages': sorted(scheme['pages'])})
        counts = defaultdict(int)
        for first, second in combinations(options, 2):
            a, b = first['work'], second['work']
            if a['id'] == b['id']:
                counts['same_work_rejected'] += 1
            elif a['type'] == b['type'] == 'film':
                counts['two_films_rejected'] += 1
            else:
                assert first['marks'] + second['marks'] == 80
                counts['two_texts_valid' if a['type'] == b['type'] else 'text_and_film_valid'] += 1
        evidence[paper_id] = {'printed_code': code, 'scheme_printed_series': printed_series,
                              'question_paper': document(question_path, qp, resources),
                              'mark_scheme': document(scheme_path, ms, resources), 'rubric_pages': rubric,
                              'option_pair_counts': counts, 'options': options}
        print(paper_id, len(options), dict(counts), f'{len(differences)} scheme wording discrepancies')
        for difference in differences:
            print('  ', *difference, sep='\n      ')
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('assets', type=Path)
    parser.add_argument('metadata', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    resources = {source['name'].upper(): source for source in json.loads(args.metadata.read_text())}
    evidence = check_pairs(args.assets, resources)
    args.output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
