#!/usr/bin/env python3
"""Build reviewed OCR 05827 packs from checksummed official PDF sources."""
import argparse
import base64
import hashlib
from io import BytesIO
import json
import math
from pathlib import Path
import re
from urllib.parse import urlparse

import fitz
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
IMPORT = ROOT / 'data/imports/sport'
SUBJECT = 'OCR_L3_SPORT_CTEC'
ASSESSMENT = 'https://www.ocr.org.uk/qualifications/cambridge-technicals/sport-and-physical-activity/assessment/'
TITLES = {
    '01': 'Body systems and the effects of physical activity',
    '03': 'Sports organisation and development',
}


def load(path):
    return json.loads(path.read_text())


def write(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    formatting = {'separators': (',', ':')} if compact else {'indent': 2}
    path.write_text(json.dumps(value, ensure_ascii=False, **formatting) + '\n')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source(cache, document):
    path = cache / Path(urlparse(document['url']).path).name
    assert digest(path.read_bytes()) == document['sha256'], path
    return fitz.open(path)


def label_key(label):
    match = re.fullmatch(r'(\d+)((?:\([a-z]+\))*)', label.strip().lower().removeprefix('q'))
    if not match:
        raise ValueError(f'Unknown printed question label {label}')
    return str(int(match[1])) + match[2]


def asset(document, regions, bounds, catalogue, name):
    crops = []
    references = []
    for page_num, x0, y0, x1, y1 in regions:
        page = document[page_num]
        width, height = page.rect.width, page.rect.height
        box = fitz.Rect(x0 * width, y0 * height, x1 * width, y1 * height)
        if page.rotation or not (bounds[0] <= page_num + 1 <= bounds[1]) or not page.rect.contains(box) or box.is_empty:
            raise ValueError(f'{name}: invalid source geometry on page {page_num + 1}: {box}')
        pix = page.get_pixmap(matrix=fitz.Matrix(1.85, 1.85), clip=box, alpha=False)
        crop = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        if ImageChops.difference(crop, Image.new('RGB', crop.size, 'white')).getbbox() is None:
            raise ValueError(f'{name}: blank source crop on page {page_num + 1}')
        crops.append(crop)
        references.append({'page': page_num + 1, 'bbox': [round(v, 6) for v in (x0, y0, x1, y1)]})
    assert crops, name
    image = Image.new('RGB', (max(c.width for c in crops), sum(c.height for c in crops) + (len(crops) - 1) * 12), 'white')
    y = 0
    for crop in crops:
        image.paste(crop, (0, y))
        y += crop.height + 12
    stream = BytesIO()
    image.save(stream, format='WEBP', lossless=True, method=4)
    data = stream.getvalue()
    catalogue[name] = {'sha256': digest(data), 'base64': base64.b64encode(data).decode()}
    return name, references


def part_id(paper_id, label):
    number = int(re.match(r'\d+', label)[0])
    part = ''.join('_' + fragment for fragment in re.findall(r'\(([a-z]+)\)', label))
    return f'{paper_id}_Q{number:02d}{part}'


def paper_id(source_row):
    sitting = f"{source_row['year']}_{source_row['series'].upper()}" if source_row['year'] else 'SAMPLE'
    return f"OCR_05827_{sitting}_U{source_row['unit']}"


def paper_record(row):
    unit = row['unit']
    sample = row['year'] is None
    title = f'Unit {unit} · {TITLES[unit]}'
    paper = {
        'subject_id': SUBJECT, 'board': 'OCR', 'level': 'Level 3', 'subject': 'Sport',
        'spec_code': '05827', 'qualification_code': '05827', 'year': row['year'],
        'series': row['series'], 'is_official_sample': sample,
        'paper_id': paper_id(row), 'paper_type': 'real_past_paper', 'paper_code': f'U{unit}',
        'official_paper_code': f'Unit {unit} · {row["printed_code"]}',
        'title': title, 'total_marks': row['total_marks'], 'duration_minutes': row['duration_minutes'],
        'full_paper_pdf_url': None if sample else row['qp']['url'],
        'full_mark_scheme_pdf_url': row['ms']['url'],
        'official_source_url': ASSESSMENT,
        'source_documents': {'question_paper': row['qp'], 'mark_scheme': row['ms']},
    }
    if row.get('report'):
        paper['source_documents']['examiner_report'] = row['report']
    return paper


def build(row, reviewed, cache, spec):
    pid = paper_id(row)
    unit = row['unit']
    assert reviewed['source_sha256'] == [row['qp']['sha256'], row['ms']['sha256']]
    documents = row['qp'], row['ms']
    paper = paper_record(row)
    identity = {key: paper[key] for key in ('subject_id', 'board', 'level', 'subject', 'spec_code',
                                         'qualification_code', 'year', 'series', 'is_official_sample')}
    catalogue = {}
    questions = []
    excluded = []
    seen = set()
    with source(cache, row['qp']) as qp, source(cache, row['ms']) as ms:
        for item in reviewed['items']:
            label = label_key(item['label'])
            marks = item['marks']
            assert label not in seen and isinstance(marks, int) and marks > 0, (pid, label)
            seen.add(label)
            number, part = re.fullmatch(r'(\d+)(.*)', label).groups()
            if item.get('exclusion'):
                excluded.append({'question_number': number, 'part_label': part, 'marks': marks,
                                 **item['exclusion']})
                continue
            question_id = part_id(pid, label)
            stem = question_id.removeprefix(f'{pid}_')
            q_file, q_regions = asset(qp, item['question_regions'], documents[0]['pages'], catalogue, f'{stem}_q.webp')
            s_file, s_regions = asset(ms, item['scheme_regions'], documents[1]['pages'], catalogue, f'{stem}_ms.webp')
            context = {}
            context_regions = []
            if item.get('context_regions'):
                c_file, context_regions = asset(qp, item['context_regions'], documents[0]['pages'], catalogue, f'{stem}_context.webp')
                context['stem_image_url'] = f'assets/sport/{pid}/{c_file}'
            tags = item['outcomes']
            assert tags and set(tags) <= spec, (pid, label, tags)
            dependencies = [part_id(pid, label_key(value)) for value in item.get('depends_on', [])]
            assert set(dependencies) <= {q['question_id'] for q in questions}, (pid, label, dependencies)
            assert item['difficulty'] in ('easy', 'medium', 'hard'), (pid, label)
            questions.append({
                **identity, 'question_id': question_id, 'parent_question_id': part_id(pid, number),
                'source_type': 'real_past_paper', 'paper_id': pid, 'component': f'U{unit}',
                'subject_category': 'Applied / Vocational', 'question_number': number, 'part_label': part,
                'marks': marks, 'estimated_minutes': max(1, math.ceil(marks * row['duration_minutes'] / row['total_marks'])),
                'difficulty': item['difficulty'], 'introduced_year': 12,
                'primary_spec_points': tags[:1], 'crossover_spec_points': tags[1:],
                'preview_text': item['preview'], 'include_in_custom_pool': True,
                'extended_response': item.get('levels', False), 'context': context,
                **({'depends_on_question_ids': dependencies} if dependencies else {}),
                'scheme_scope': item.get('scheme_scope', 'part' if part else 'whole_question'),
                'scheme_question_number': label,
                'content': {'question_html': '', 'question_image_url': f'assets/sport/{pid}/{q_file}',
                            'mark_scheme_html': '', 'mark_scheme_image_url': f'assets/sport/{pid}/{s_file}'},
                'provenance': {
                    'review_status': 'model_reviewed', 'reviewer_type': 'model',
                    'question_source_url': documents[0]['url'], 'scheme_source_url': documents[1]['url'],
                    'question_source_sha256': documents[0]['sha256'], 'scheme_source_sha256': documents[1]['sha256'],
                    'source_regions': q_regions, 'context_regions': context_regions, 'scheme_regions': s_regions,
                    'original_parts': item.get('original_parts', [label]),
                    **({'synoptic_reference': item['synoptic_reference']} if item.get('synoptic_reference') else {}),
                },
            })
    available = sum(q['marks'] for q in questions)
    assert available > 0 and available + sum(q['marks'] for q in excluded) == row['total_marks'], pid
    paper.update(available_marks=available, coverage_status='partial' if excluded else 'complete',
                 incomplete=bool(excluded), question_ids=[q['question_id'] for q in questions])
    if excluded:
        paper['excluded_questions'] = excluded
        paper['practice_coverage_note'] = f'{available} of {row["total_marks"]} marks are available in Practice.'
    if paper['is_official_sample']:
        paper['assessment_note'] = 'OCR publishes a combined specimen and mark scheme. Open it from the mark scheme link.'
    return paper, questions, catalogue


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_cache', type=Path)
    args = parser.parse_args()
    inventory = load(IMPORT / 'source-inventory.json')
    tree = load(ROOT / f'data/specs/{SUBJECT}.json')
    spec = {point['id'] for section in tree['sections'] for topic in section['topics'] for point in topic['points']}
    rows = []
    entries = []
    resources = []
    for row in inventory:
        pid = paper_id(row)
        review = IMPORT / 'reviews' / f'{pid}.json'
        status = {'paper_id': pid, 'year': row['year'], 'series': row['series'], 'unit': row['unit'],
                  'printed_marks': row['total_marks'], 'status': 'official_paper_and_scheme_only'}
        if review.exists():
            paper, questions, assets = build(row, load(review), args.source_cache, spec)
            relative = f'sport/{pid}.json'
            write(ROOT / 'data/packs' / relative, {'pack_id': pid.lower(), 'papers': [paper], 'questions': questions})
            write(ROOT / 'data/sport-assets' / f'{pid}.json', {
                'format': 'lossless-webp-catalogue-v1', 'paper_id': pid, 'assets': assets,
            }, compact=True)
            entries.append({'file': relative, 'subject_id': SUBJECT})
            status.update(status=paper['coverage_status'], scored_parts=len(questions),
                          available_marks=paper['available_marks'], image_assets=len(assets),
                          exclusions=paper.get('excluded_questions', []))
        else:
            paper = paper_record(row)
            paper.update(resources_only=True, catalogue_verified=True, question_ids=[],
                         assessment_note='Use the official paper and mark scheme links. Individual practice is unavailable for this paper.')
            if paper['is_official_sample']:
                paper['assessment_note'] = 'The official specimen and mark scheme are published together in one PDF.'
            resources.append(paper)
        rows.append(status)
    relative = 'sport/catalogue.json'
    write(ROOT / 'data/packs' / relative, {'pack_id': 'ocr_05827_catalogue', 'papers': resources, 'questions': []})
    entries.append({'file': relative, 'subject_id': SUBJECT})
    index_path = ROOT / 'data/packs/index.json'
    index = load(index_path)
    index['packs'] = [entry for entry in index['packs'] if entry.get('subject_id') != SUBJECT] + entries
    write(index_path, index)
    write(IMPORT / 'coverage.json', {'subject_id': SUBJECT, 'papers': rows, 'grading': 'raw_marks_only'})
    print(f'{len(entries) - 1} reviewed packs, {sum(r.get("scored_parts", 0) for r in rows)} scored parts')


if __name__ == '__main__':
    main()
