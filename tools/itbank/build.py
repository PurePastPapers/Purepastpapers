#!/usr/bin/env python3
"""Build the reviewed OCR Data Analytics specimens from pinned official composites."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import re

import fitz
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
SUBJECT = 'OCR_L3_IT_AAQ'
REGIONS = Path(__file__).with_name('regions.json')
UNITS = {
    'F200': ('Fundamentals of data analytics', '697750-fundamentals-of-data-analytics.pdf',
             '9db6f446c03b3cd38fc8981719b2fec5ba7da7f45cb41e24bf9e5792ab830257',
             'Version 2.0 (June 2024)', 75, 28, ['H019', 'H119']),
    'F201': ('Big data and machine learning', '697752-big-data-and-machine-learning.pdf',
             'b0df7272de0c93d2fc0bde4b6257b52ce083c83fe6a4616875b5587749309df1',
             'Version 3.0 (November 2024)', 90, 29, ['H119']),
}
SCALE = 2


def write_json(path, data, compact=False):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    options = {'separators': (',', ':')} if compact else {'indent': 2}
    target.write_text(json.dumps(data, ensure_ascii=False, **options) + '\n')


def question_id(paper_id, label):
    number, part = re.fullmatch(r'(\d+)(.*)', label).groups()
    return f'{paper_id}_Q{int(number):02d}' + (part.replace('(', '_').replace(')', '') or '_W')


def crop_box(region):
    page, top, bottom = region
    # The scheme uses a wider printed table than the student paper.
    left, right = (40, 565) if page > 16 else (52, 551)
    return fitz.Rect(left, top, right, bottom)


def extracted(doc, region):
    page = doc[region[0] - 1]
    return page.get_text(clip=crop_box(region))


def render(doc, regions, stem, catalogue, paper_id):
    if stem not in catalogue:
        images = []
        for region in regions:
            page = doc[region[0] - 1]
            box = crop_box(region)
            assert page.rotation == 0 and page.cropbox == page.mediabox and page.rect.contains(box)
            raster = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), clip=box, alpha=False)
            image = Image.frombytes('RGB', (raster.width, raster.height), raster.samples)
            assert ImageChops.difference(image, Image.new('RGB', image.size, 'white')).getbbox()
            images.append(image)
        canvas = Image.new('RGB', (max(image.width for image in images), sum(image.height for image in images)), 'white')
        y = 0
        for image in images:
            canvas.paste(image, (0, y))
            y += image.height
        result = io.BytesIO()
        canvas.save(result, 'WEBP', lossless=True, method=6, exact=True)
        data = result.getvalue()
        catalogue[stem] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
    return f'assets/itbank/{paper_id}/{stem}'


def source_regions(doc, regions):
    out = []
    for region in regions:
        number = region[0]
        page = doc[number - 1]
        x0, y0, x1, y1 = crop_box(region)
        out.append({'page': number, 'bbox': [round(v, 6) for v in (
            x0 / page.rect.width, y0 / page.rect.height, x1 / page.rect.width, y1 / page.rect.height)]})
    return out


def split_pdf(doc, relative, start, end):
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    with fitz.open() as split:
        split.insert_pdf(doc, from_page=start, to_page=end)
        split.save(path, garbage=4, deflate=True, no_new_id=True)


def build(source_dir, unit, rows):
    title, filename, sha, revision, minutes, page_count, eligibility = UNITS[unit]
    path = source_dir / f'{unit.lower()}.pdf'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == sha, f'{path}: unexpected source revision'
    url = f'https://www.ocr.org.uk/Images/{filename}'
    paper_id = f'OCR_{unit}_SAMPLE'
    printed_code = f'{"/".join(eligibility)} · {unit}'
    identity = {
        'paper_id': paper_id, 'subject_id': SUBJECT, 'board': 'OCR', 'level': 'Level 3',
        'subject': 'IT: Data Analytics', 'spec_code': 'H119', 'qualification_code': 'H119',
        'eligible_qualification_codes': eligibility,
        'year': None, 'series': 'Sample', 'is_as': False, 'is_official_sample': True,
    }
    questions = []
    catalogue = {}
    occupied = []
    with fitz.open(path) as doc:
        cover = ' '.join(doc[0].get_text().split())
        assert len(doc) == page_count and unit in cover and 'total mark for this paper is 60' in cover and revision in cover
        assert ('1 hour 15 minutes' if minutes == 75 else '1 hour 30 minutes') in cover
        assert 'mark scheme' in doc[16].get_text().lower() and unit in doc[16].get_text()
        printed_marks = []
        for page in doc[1:14]:
            for block in page.get_text('dict')['blocks']:
                for line in block.get('lines', []):
                    for span in line['spans']:
                        mark = re.fullmatch(r'\[(\d+)\]', span['text'].strip())
                        if mark and span['bbox'][0] > 510:
                            printed_marks.append(int(mark[1]))
        assert printed_marks == [row[1] for row in rows]
        for label, marks, own, scheme, context, point, preview, *dependency in rows:
            assert 2 <= own[0] <= 14 and (context is None or 2 <= context[0] <= 14)
            assert all(20 <= segment[0] <= page_count for segment in scheme)
            extracted_scheme = re.sub(r'\s+', '', extracted(doc, scheme[0]))
            assert extracted_scheme.startswith(f'{label}Maxmark{marks}('), (unit, label, extracted_scheme[:60])
            own_label = re.sub(r'\s+', '', extracted(doc, own))
            number = re.match(r'\d+', label).group()
            part = label[len(number):]
            printed_part = re.findall(r'\([a-z]+\)', part)
            allowed_starts = (label, part, printed_part[-1]) if printed_part else (label,)
            assert own_label.startswith(allowed_starts), (unit, label, own_label[:64])
            topic = point.split('.')[0]
            occupied.append(own)
            uid = question_id(paper_id, label)
            stem = {}
            if context:
                key = '_'.join(map(str, context))
                stem['stem_image_url'] = render(doc, [context], f'context_{key}.webp', catalogue, paper_id)
            question = {
                **identity, 'question_id': uid, 'parent_question_id': f'{paper_id}_Q{int(number):02d}',
                'source_type': 'real_past_paper', 'component': unit, 'question_number': number,
                'marks': marks, 'estimated_minutes': max(1, round(marks * minutes / 60)),
                'difficulty': 'hard' if marks >= 6 else 'easy' if marks == 1 else 'medium',
                'introduced_year': 12, 'primary_spec_points': [f'OCR_L3IT_{unit}_T{topic}_{unit}.{point}'],
                'crossover_spec_points': [], 'preview_text': preview,
                'include_in_custom_pool': True, 'extended_response': marks >= 6,
                'content': {
                    'question_html': '', 'mark_scheme_html': '',
                    'question_image_url': render(doc, [own], f'{uid}_question.webp', catalogue, paper_id),
                    'mark_scheme_image_url': render(doc, scheme, f'{uid}_scheme.webp', catalogue, paper_id),
                },
                'context': stem, 'scheme_scope': 'part', 'scheme_question_number': label,
                'provenance': {
                    'review_status': 'model_reviewed', 'reviewer_type': 'model',
                    'question_source_url': url, 'scheme_source_url': url,
                    'question_source_sha256': sha, 'scheme_source_sha256': sha, 'source_revision': revision,
                    'source_regions': source_regions(doc, [own]), 'scheme_regions': source_regions(doc, scheme),
                    'context_regions': source_regions(doc, [context] if context else []),
                    'original_parts': [label], 'part_scheme_check': 'verified', 'render_scale': SCALE,
                    'coordinate_system': 'CropBox, zero rotation, 1-indexed pages',
                },
            }
            if part:
                question['part_label'] = part
            if dependency:
                parent = question_id(paper_id, dependency[0])
                assert any(prior['question_id'] == parent for prior in questions)
                question['depends_on_question_ids'] = [parent]
            questions.append(question)
        for _, _, _, _, context, *_ in rows:
            if context:
                page, start, end = context
                assert not any(page == p and min(end, hi) > max(start, lo) for p, lo, hi in occupied)
        for previous, current in zip(occupied, occupied[1:]):
            assert (previous[0] < current[0]) or (previous[0] == current[0] and previous[2] <= current[1])
        student = f'assets/pdfs/itbank/{unit}-sample-question-paper.pdf'
        scheme = f'assets/pdfs/itbank/{unit}-sample-mark-scheme.pdf'
        split_pdf(doc, student, 0, 15)
        split_pdf(doc, scheme, 16, page_count - 1)
    assert sum(question['marks'] for question in questions) == 60
    paper = {
        **identity, 'paper_type': 'real_past_paper', 'paper_code': unit, 'official_paper_code': printed_code,
        'title': f'Official sample · {unit}: {title}', 'total_marks': 60, 'available_marks': 60,
        'duration_minutes': minutes, 'catalogue_verified': True, 'coverage_status': 'complete',
        'question_ids': [question['question_id'] for question in questions],
        'official_source_url': url, 'full_paper_pdf_url': student, 'full_mark_scheme_pdf_url': scheme,
    }
    write_json(f'data/packs/itbank/{paper_id}.json', {'pack_id': paper_id.lower(), 'papers': [paper], 'questions': questions})
    write_json(f'data/itbank-assets/{paper_id}.json', {
        'format': 'lossless-webp-catalogue-v1', 'paper_id': paper_id, 'assets': catalogue,
    }, compact=True)
    print(f'{unit}: {len(questions)} scored parts, 60 raw marks, {len(catalogue)} images')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_directory', type=Path)
    args = parser.parse_args()
    for unit, rows in json.loads(REGIONS.read_text()).items():
        build(args.source_directory, unit, rows)


if __name__ == '__main__':
    main()
