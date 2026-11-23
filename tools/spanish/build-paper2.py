#!/usr/bin/env python3
"""Build a local-only Spanish writing preview from verified AQA PDFs."""

import argparse
from base64 import b64encode
from collections import defaultdict
from hashlib import sha256
from html import escape
from importlib import import_module
import json
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory

import fitz

proof = import_module('check-paper2')
SUBJECT = 'AQA_ALEVEL_SPAN_7692'
FOOTER = re.compile(r'^(?:\d+|ib/h/.*|turn over.*|mark scheme\b.*|section [ab]\b.*|either|or|end of questions|copyright.*|do not write.*|there are no questions.*|answer in the spaces provided)$', re.I)
WORD_MARK = re.compile(r'^\[40 marks?\]$')
ROW_ESSAY = re.compile(r'^(\d) (\d) \. ([12]) (.+)$')
ROW_SPECIMEN = re.compile(r'^Question (\d)(\d)\.([12])$')
ROW_WORK = re.compile(r'^(\d) (\d) (\D.+)$')

# AQA's paper/scheme permission does not establish rights to a line from a
# prescribed work. These prompts or indicative schemes are linked by PDF page.
# The assessment criteria themselves have no work-specific quoted passages.
LINKED_PROMPTS = {
    'AQA_7692_2022_JUNE_P2': {'05.1'},
    'AQA_7692_2024_JUNE_P2': {'08.1'},
    'AQA_7692_2025_JUNE_P2': {'02.1'},
}
LINKED_SCHEMES = {
    'AQA_7692_2020_AUTUMN_P2': {'01.1', '01.2', '04.1', '06.2', '08.1', '08.2', '10.1', '10.2'},
    'AQA_7692_2021_AUTUMN_P2': {'01.2', '02.1', '07.1', '07.2', '09.1', '10.2', '12.2'},
    'AQA_7692_2022_JUNE_P2': {'02.1', '02.2', '05.1', '07.1', '07.2', '08.2', '12.1', '15.2', '16.2'},
    'AQA_7692_2023_JUNE_P2': {'01.1', '02.1', '03.1', '07.1', '09.1', '11.1', '12.1', '14.1'},
    'AQA_7692_2024_JUNE_P2': {'04.2', '07.1', '07.2', '08.1', '10.1', '10.2', '12.2', '13.2', '14.2'},
    'AQA_7692_2025_JUNE_P2': {'02.1', '04.1', '04.2', '05.1', '07.1', '07.2', '09.2'},
    'AQA_7692_SAMPLE_1_P2': {'05.2', '09.1', '10.1', '10.2'},
}


def rows(page):
    if page.rotation or tuple(page.cropbox) != tuple(page.mediabox):
        raise ValueError(f'Unsupported page geometry on page {page.number + 1}')
    groups = []
    ordered = sorted(page.get_text('words'), key=lambda item: ((item[1] + item[3]) / 2, item[0]))
    for word in ordered:
        centre = (word[1] + word[3]) / 2
        if not groups or centre - groups[-1][0] > 4:
            groups.append((centre, []))
        groups[-1][1].append(word)
    for _, words in groups:
        words.sort(key=lambda item: item[0])
        yield (' '.join(w[4] for w in words),
               (min(w[0] for w in words), min(w[1] for w in words), max(w[2] for w in words), max(w[3] for w in words)))


def geometry(document, is_scheme, sample):
    units = {}
    active = None
    for page_no, page in enumerate(document, 1):
        if page_no < (6 if is_scheme else 2):
            continue
        for text, rect in rows(page):
            match = (ROW_SPECIMEN if sample and is_scheme else ROW_ESSAY).match(text)
            work = ROW_WORK.match(text)
            if match:
                label = ''.join(match.groups()[:2]) + '.' + match[3]
                if label in units:
                    raise ValueError(f'Repeated crop label {label}')
                active = {'blocks': defaultdict(list), 'text': [match[4]] if match.lastindex == 4 else [],
                          'marked': False, 'title_pending': sample and is_scheme, 'body': []}
                units[label] = active
                active['blocks'][page_no].append(rect)
            elif work or text.lower() in ('end of questions', 'aqa.org.uk'):
                active = None
            elif active is None or FOOTER.match(text):
                continue
            elif WORD_MARK.match(text):
                active['marked'] = True
                active['blocks'][page_no].append(rect)
                if not is_scheme:
                    active = None
            elif active['title_pending']:
                active['title_pending'] = False
                active['blocks'][page_no].append(rect)
            elif not active['marked']:
                active['text'].append(text)
                active['blocks'][page_no].append(rect)
            else:
                active['body'].append(text)
                active['blocks'][page_no].append(rect)
    return units


def region(page_no, page, rects, margin=4):
    x0 = max(0, min(rect[0] for rect in rects) - margin)
    y0 = max(0, min(rect[1] for rect in rects) - margin)
    x1 = min(page.rect.width, max(rect[2] for rect in rects) + margin)
    y1 = min(page.rect.height, max(rect[3] for rect in rects) + margin)
    return {'page': page_no, 'bbox': [round(x0 / page.rect.width, 6), round(y0 / page.rect.height, 6),
                                    round(x1 / page.rect.width, 6), round(y1 / page.rect.height, 6)]}


def crop_regions(document, unit):
    # Keep consistent horizontal alignment across continuations, including the
    # printed boxes which sit just to the left of the first number's text bounds.
    result = []
    for page_no, rects in unit['blocks'].items():
        page = document[page_no - 1]
        crop = region(page_no, page, rects)
        crop['bbox'][0] = min(crop['bbox'][0], 0.055)
        crop['bbox'][2] = max(crop['bbox'][2], 0.95)
        result.append(crop)
    return result


def rubric_regions(document, pages):
    result = []
    for page_no in pages:
        page = document[page_no - 1]
        rects = [rect for text, rect in rows(page) if not FOOTER.match(text)]
        result.append(region(page_no, page, rects, margin=15))
    return result


def document_asset(renderer, regions, name, paper_id, temp, assets):
    path = temp / name
    size = renderer.render(regions, path)
    data = path.read_bytes()
    assets[name] = {'sha256': sha256(data).hexdigest(), 'base64': b64encode(data).decode(),
                    'width': size['width'], 'height': size['height']}
    return f'assets/spanish/{paper_id}/{name}'


def json_file(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')


def assemble(paper_id, summary, directory, output, renderer_type):
    question_doc = summary['question_paper']
    scheme_doc = summary['mark_scheme']
    qp = directory / question_doc['filename']
    ms = directory / scheme_doc['filename']
    for path, spec in ((qp, question_doc), (ms, scheme_doc)):
        if sha256(path.read_bytes()).hexdigest() != spec['sha256']:
            raise ValueError(f'{path.name}: changed source')
    official_sample = paper_id == 'AQA_7692_SAMPLE_1_P2'
    year = None if official_sample else int(paper_id.split('_')[2])
    series = 'Sample set 1' if official_sample else paper_id.split('_')[3].title()
    title = 'Sample set 1 Paper 2: Writing' if official_sample else f'{series} {year} Paper 2: Writing'
    common = dict(paper_id=paper_id, subject_id=SUBJECT, board='AQA', level='A-Level', subject='Spanish', spec_code='7692',
                  qualification_code='7692', year=year, series=series, is_as=False, is_official_sample=official_sample)
    assets, records = {}, []
    expected_qp = proof.parse(proof.pdf_pages(qp))
    expected_ms = proof.parse(proof.pdf_pages(ms), is_scheme=True, specimen=official_sample)
    with TemporaryDirectory() as temp_name, fitz.open(qp) as question_pdf, fitz.open(ms) as scheme_pdf:
        temp = Path(temp_name)
        question_renderer, scheme_renderer = renderer_type(qp), renderer_type(ms)
        question_geometry = geometry(question_pdf, False, official_sample)
        scheme_geometry = geometry(scheme_pdf, True, official_sample)
        levels = rubric_regions(scheme_pdf, summary['rubric_pages'])
        levels_image = document_asset(scheme_renderer, levels, 'Assessment_criteria.webp', paper_id, temp, assets)
        for option in summary['options']:
            label = option['label']
            q_layout = question_geometry[label]
            ms_layout = scheme_geometry[label]
            for layout, expected, assert_content in ((q_layout, expected_qp[label], False), (ms_layout, expected_ms[label], True)):
                if layout['marked'] is False or set(layout['blocks']) != expected['pages']:
                    raise ValueError(f'{paper_id} {label}: boundary pages changed {list(layout["blocks"])} vs {sorted(expected["pages"])}')
                if proof.norm(' '.join(layout['text'])) != proof.norm(' '.join(expected['prompt'])):
                    raise ValueError(f'{paper_id} {label}: incompatible prompt layout {layout["text"]!r} vs {expected["prompt"]!r}')
                if assert_content and proof.norm(' '.join(layout['body'])) != proof.norm(' '.join(expected['content'])):
                    raise ValueError(f'{paper_id} {label}: incompatible marking rows {layout["body"][:4]!r} vs {expected["content"][:4]!r}')
            key = label.replace('.', '_')
            q_regions = crop_regions(question_pdf, q_layout)
            ms_regions = crop_regions(scheme_pdf, ms_layout)
            linked_prompt = label in LINKED_PROMPTS.get(paper_id, ())
            linked_scheme = label in LINKED_SCHEMES.get(paper_id, ())
            image = None if linked_prompt else document_asset(question_renderer, q_regions, f'Q{key}.webp', paper_id, temp, assets)
            scheme_image = None if linked_scheme else document_asset(scheme_renderer, ms_regions, f'Q{key}_scheme.webp', paper_id, temp, assets)
            work = option['work']
            qp_url = f'{question_doc["url"]}#page={option["question_pages"][0]}'
            ms_url = f'{scheme_doc["url"]}#page={option["scheme_pages"][0]}'
            context = {'full_question_pdf_url': qp_url, 'full_scheme_pdf_url': ms_url}
            if linked_prompt:
                context['official_resources'] = [{'kind': 'question_pdf', 'label': f'Read essay {label} in the official question paper (PDF)', 'url': qp_url}]
            if linked_scheme:
                context['official_scheme_required'] = True
            scheme_note = 'Use the official PDF for indicative content for this essay.' if linked_scheme else 'The official indicative content follows the assessment criteria.'
            records.append({
                **common, 'question_id': f'{paper_id}_Q{key}', 'source_type': 'real_past_paper', 'section': 'A' if work['type'] == 'text' else 'B',
                'subject_category': 'Languages', 'question_number': label, 'marks': 40, 'estimated_minutes': 60, 'difficulty': 'hard',
                'work': work, 'primary_spec_points': [work['id']], 'crossover_spec_points': [], 'include_in_custom_pool': True,
                'preview_text': f'{work["title"]} · Essay {label}',
                'content': {
                    'question_html': f'<p><b>{escape(work["title"])}</b></p><p>Answer in Spanish. Aim for about 300 words. Work without consulting a dictionary, text or film.</p><p><small>Source: AQA and its licensors.</small></p>',
                    'question_image_url': image,
                    'mark_scheme_html': f'<p>AO3 and AO4 are each marked out of 20. {scheme_note}</p><p><small>Source: AQA and its licensors.</small></p><img data-math-image="{levels_image}" alt="AQA assessment criteria for AO3 and AO4">',
                    'mark_scheme_image_url': scheme_image,
                },
                'scheme_scope': 'full_question', 'scheme_question_number': label,
                'context': context,
                'provenance': {
                    'review_status': 'source_verified', 'reviewer_type': 'model',
                    'qualification_code': '7692', 'question_source_sha256': question_doc['sha256'], 'scheme_source_sha256': scheme_doc['sha256'],
                    'question_source_url': qp_url, 'scheme_source_url': ms_url,
                    'source_regions': q_regions, 'scheme_regions': levels + ms_regions, 'scheme_levels_regions': levels,
                    'scheme_indicative_regions': ms_regions,
                    'credit': f'AQA and its licensors. {title}.',
                },
            })
    ids = [question['question_id'] for question in records]
    paper = {
        **common, 'title': title, 'paper_type': 'real_past_paper', 'paper_code': 'P2', 'official_paper_code': summary['printed_code'],
        'total_marks': 80, 'duration_minutes': 120, 'question_ids': ids, 'choice_groups': [ids], 'choice_choose': [2],
        'choice_rule': 'two_distinct_works', 'choice_note': 'Answer one essay on each of two different texts, or one essay on a text and one on a film.',
        'full_paper_pdf_url': question_doc['url'], 'full_mark_scheme_pdf_url': scheme_doc['url'], 'official_source_url': question_doc['url'],
    }
    json_file(output / 'data' / 'packs' / 'spanish' / f'{paper_id}.json', {'papers': [paper], 'questions': records})
    json_file(output / 'data' / 'spanish-assets' / f'{paper_id}.json',
              {'format': 'lossless-webp-catalogue-v1', 'paper_id': paper_id, 'assets': assets})
    print(paper_id, len(records), 'essays;', len(assets), 'verified source crops')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('repository', type=Path)
    parser.add_argument('assets', type=Path)
    parser.add_argument('evidence', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--paper')
    args = parser.parse_args()
    sys.path.insert(0, str(args.repository.resolve() / 'tools' / 'maths'))
    from render import SourceRenderer
    collection = json.loads(args.evidence.read_text())
    selected = [args.paper] if args.paper else collection
    for paper in selected:
        assemble(paper, collection[paper], args.assets, args.output, SourceRenderer)


if __name__ == '__main__':
    main()
