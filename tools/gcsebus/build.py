"""Build the reviewed Pearson Edexcel GCSE Business 1BS0 question bank."""
import argparse
import base64
from collections import Counter
from hashlib import sha256
from html import escape
from io import BytesIO
import json
from pathlib import Path
import re
from urllib.request import urlretrieve

import fitz
from PIL import Image, ImageChops

from questions import extract
from schemes import collect_scheme


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data'
IMPORT = DATA / 'imports/gcsebus'
SUBJECT = 'EDX_GCSE_BUS_1BS0'
PREFIX = 'EDX_GCSE_BUS_'
COMPONENTS = {1: 'Investigating small business', 2: 'Building a business'}
SERIES = {'June': 'June', 'November': 'Autumn'}
SLUG = 'gcsebus'


def read(path):
    return json.loads(path.read_text())


def write(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    options = {'separators': (',', ':')} if compact else {'indent': 2}
    path.write_text(json.dumps(value, ensure_ascii=False, **options) + '\n')


def path_for(source, directory):
    name = source['official_url'].rsplit('/', 1)[-1]
    path = directory / (name if source['title'] != 'Sample Assessment Materials' else 'sam.pdf')
    if not path.exists():
        urlretrieve(source['official_url'], path)
    actual = sha256(path.read_bytes()).hexdigest()
    if actual != source['sha256']:
        raise ValueError(f'Source revision changed for {name}: {actual}')
    return path


def source_papers(sources):
    lookup = {}
    for row in sources:
        if row['availability'] != 'public_pdf':
            continue
        match = re.fullmatch(
            r'(Question paper(?: and source booklet)?|Mark scheme|Examiner report) - Paper 0?([12]) - (June|November) (\d+)',
            row['title'], re.IGNORECASE,
        )
        if match:
            kind, component, month, year = match.groups()
            key = (int(year), month.title(), int(component))
            lookup.setdefault(key, {})[kind.lower().split(' and ')[0]] = row
    for (year, month, component), docs in sorted(lookup.items()):
        qp = docs['question paper']
        ms = docs['mark scheme']
        offset = qp.get('source_booklet_cover_pdf_page')
        pid = f'EDX_1BS0_{year}_{SERIES[month].upper()}_P{component}'
        yield pid, year, SERIES[month], component, docs, range(3, ms['pages']), offset
    sample = next(row for row in sources if row['title'] == 'Sample Assessment Materials')
    for component, start, end, offset in [(1, 34, 48, 31), (2, 72, 86, 69)]:
        yield (
            f'EDX_1BS0_SAM_P{component}', None, 'Official sample', component,
            {'question paper': sample, 'mark scheme': sample},
            range(start, end), offset,
        )


def render_asset(document, regions, masked, assets, filename):
    frames = []
    for region in regions:
        page = document[region['page']]
        rect = fitz.Rect(region['rect'])
        pixels = page.get_pixmap(matrix=fitz.Matrix(1.55, 1.55), clip=rect, alpha=False)
        frame = Image.frombytes('RGB', (pixels.width, pixels.height), pixels.samples)
        for mask in masked.get(str(region['page']), []):
            covered = rect & fitz.Rect(mask)
            if not covered.is_empty:
                left, top, right, bottom = [round(value * 1.55) for value in covered]
                frame.paste('white', (left - pixels.x, top - pixels.y, right - pixels.x, bottom - pixels.y))
        if not ImageChops.difference(frame, Image.new('RGB', frame.size, 'white')).getbbox():
            raise ValueError(f'Blank crop for {filename} on page {page.number + 1}')
        frames.append(frame)
    if not frames:
        raise ValueError(f'Missing crop for {filename}')
    height = sum(frame.height for frame in frames) + 12 * (len(frames) - 1)
    canvas = Image.new('RGB', (max(frame.width for frame in frames), height), 'white')
    y = 0
    for frame in frames:
        canvas.paste(frame, (0, y))
        y += frame.height + 12
    with BytesIO() as stream:
        canvas.save(stream, format='WEBP', lossless=True)
        content = stream.getvalue()
    assets[filename] = {'sha256': sha256(content).hexdigest(), 'base64': base64.b64encode(content).decode('ascii')}


def part_label(label):
    return f'{label[0]}({label[1]})' + (f'({label[2:]})' if len(label) > 2 else '')


def preview(unit):
    plain = ' '.join(unit['text'].split())
    plain = re.sub(r'^\s*\d?\s*\([a-z]\)\s*', '', plain)
    return plain[:179].rstrip() + ('…' if len(plain) > 179 else '')


def scheme_for(ms_document, pages, units, notes):
    marks = {unit['label']: unit['marks'] for unit in units}
    for label, children in notes.get('scheme_subparts', {}).items():
        parent_marks = marks.pop(label)
        if parent_marks != sum(children.values()):
            raise ValueError(f'Scheme subparts do not reconcile for {label}')
        marks.update(children)
    marks.update(notes.get('scheme_tariff_errata', {}))
    exact = collect_scheme(ms_document, pages, marks)
    for label, children in notes.get('scheme_subparts', {}).items():
        exact[label] = {'regions': [region for child in children for region in exact[child]['regions']], 'rubric': False}
    return exact


def build_paper(paper_info, candidates, sources, reviews, corrections, valid_points):
    pid, year, series, component, docs, scheme_pages, booklet_page = paper_info
    official_sample = year is None
    qp, ms = docs['question paper'], docs['mark scheme']
    qp_path = path_for(qp, sources)
    ms_path = path_for(ms, sources)
    candidate = candidates[qp['sha256'] + f':0{component}']
    notes = corrections.get(pid, {})
    review = reviews[pid]
    if (candidate['sha256'] != qp['sha256'] or candidate['minutes'] != qp.get('duration_minutes', 105)
            or candidate['log'] != qp.get('qp_log_code', candidate['log'])):
        raise ValueError(f'Question source revision, log or timing mismatch for {pid}')
    units = candidate['units']
    totals = Counter()
    for unit in units:
        totals[unit['section']] += unit['marks']
    if totals != {'A': 35, 'B': 30, 'C': 25} or {u['label'] for u in units} != set(review):
        raise ValueError(f'{pid} printed tariffs or reviewed tags do not reconcile: {totals}')

    qp_url, ms_url = qp['official_url'], ms['official_url']
    if official_sample:
        qp_url += '#page=' + str(candidate['sourceCoverPage'] + 1)
        ms_url += '#page=' + str(scheme_pages.start + 1)
    assets, records, excluded = {}, [], []
    rendered_resources = {}
    resource_notes = notes.get('resources', {})
    masks = notes.get('masks', {})
    for key, decision in resource_notes.items():
        if decision.get('mask_images'):
            for image in candidate['resources'][key].get('images', []):
                masks.setdefault(str(image['page']), []).append(image['rect'])
    path_prefix = f'assets/{SLUG}/{pid}'
    with fitz.open(qp_path) as qp_document, fitz.open(ms_path) as ms_document:
        exact_schemes = scheme_for(ms_document, scheme_pages, units, notes)
        for unit in units:
            label = unit['label']
            marks = unit['marks']
            printed = part_label(label)
            annotation = notes.get('units', {}).get(label, {})
            if reason := annotation.get('excluded'):
                excluded.append({'question_number': printed, 'marks': marks, 'reason': reason})
                continue
            tag = review[label]
            primary = [PREFIX + key for key in tag['spec']]
            crossover = [PREFIX + key for key in tag.get('crossovers', [])]
            if not primary or not set(primary + crossover) <= valid_points or set(primary) & set(crossover):
                raise ValueError(f'Invalid reviewed Business spec tags for {pid} {label}: {tag}')
            figures = []
            resource_keys = list(dict.fromkeys(unit['resources'] + annotation.get('resources', [])))
            regions = {}
            for key in resource_keys:
                resource = candidate['resources'][key]
                decision = resource_notes.get(key, {})
                origin = 'resource_booklet' if resource['regions'][0]['page'] in candidate['sourceBookletPages'] else 'question_paper'
                source_url = qp['official_url'] + f'#page={resource["regions"][0]["page"] + 1}'
                resource_regions = decision.get('regions', resource['regions'])
                if decision.get('link_only'):
                    figures.append({'label': resource['label'], 'source': origin, 'official_url': source_url})
                    continue
                regions[key] = resource_regions
                if key not in rendered_resources:
                    filename = f'RESOURCE_{len(rendered_resources) + 1:02}.webp'
                    render_asset(qp_document, resource_regions, masks, assets, filename)
                    rendered_resources[key] = {'image_url': f'{path_prefix}/{filename}', 'label': resource['label'],
                                               'source': origin}
                    if decision.get('show_source'):
                        rendered_resources[key]['official_url'] = source_url
                if rendered_resources[key] not in figures:
                    figures.append(rendered_resources[key])
            scheme = exact_schemes[label]
            question_filename = f'Q{label.upper()}.webp'
            scheme_filename = f'Q{label.upper()}_SCHEME.webp'
            render_asset(qp_document, unit['regions'], masks, assets, question_filename)
            render_asset(ms_document, scheme['regions'], {}, assets, scheme_filename)
            difficulty = 'hard' if marks >= 9 else 'medium' if marks >= 3 else 'easy'
            note = annotation.get('scheme_note', '')
            record = {
                'question_id': f'{pid}_Q{label.upper()}', 'parent_question_id': f'{pid}_Q{label[0]}',
                'source_type': 'real_past_paper', 'is_sample': False, 'paper_id': pid, 'subject_id': SUBJECT,
                'board': 'Edexcel', 'level': 'GCSE', 'subject': 'Business', 'subject_category': 'Humanities / Mixed',
                'spec_code': '1BS0', 'qualification_code': '1BS0', 'is_official_sample': official_sample,
                'year': year, 'series': series, 'component': f'1BS0/0{component}',
                'question_number': label[0], 'part_label': printed[1:], 'section': f'Section {unit["section"]}',
                'marks': marks, 'estimated_minutes': max(1, round(marks * candidate['minutes'] / 90)),
                'difficulty': difficulty, 'include_in_custom_pool': True, 'extended_response': scheme['rubric'],
                'primary_spec_points': primary, 'crossover_spec_points': crossover,
                'preview_text': preview(unit), 'scheme_scope': 'part', 'scheme_question_number': printed,
                'content': {'question_html': '', 'question_image_url': f'{path_prefix}/{question_filename}',
                            'mark_scheme_html': f'<p>{escape(note)}</p>' if note else '',
                            'mark_scheme_image_url': f'{path_prefix}/{scheme_filename}'},
                'context': {'figures': figures} if figures else {},
                'provenance': {
                    'review_status': 'model_reviewed', 'reviewer_type': 'model',
                    'question_source_sha256': qp['sha256'], 'scheme_source_sha256': ms['sha256'],
                    'source_regions': unit['regions'], 'scheme_regions': scheme['regions'],
                    'resource_regions': regions,
                    **({'masked_source_regions': masks} if masks and figures else {}),
                    'original_parts': [printed], 'original_tariff_indices': [0],
                    **({'official_clarification': unit['clarification']} if unit.get('clarification') else {}),
                    'difficulty_basis': 'Published tariff and extended-response rubric',
                },
            }
            if unit.get('unitText'):
                record['answer_unit'] = unit['unitText']
            if unit.get('selectCount'):
                record['multiple_choice'] = True
                record['selection_count'] = unit['selectCount']
            records.append(record)

    paper = {
        'paper_id': pid, 'paper_type': 'real_past_paper', 'subject_id': SUBJECT,
        'board': 'Edexcel', 'level': 'GCSE', 'subject': 'Business', 'spec_code': '1BS0',
        'qualification_code': '1BS0', 'paper_code': f'P{component}', 'official_paper_code': f'1BS0/0{component}', 'tier': None,
        'title': f'{series}{f" {year}" if year else ""} Paper {component}: {COMPONENTS[component]}',
        'total_marks': 90, 'year': year, 'series': series, 'duration_minutes': candidate['minutes'],
        'is_sample': False, 'is_official_sample': official_sample, 'catalogue_verified': True, 'catalogue_generated': False,
        'question_ids': [record['question_id'] for record in records],
        'full_paper_pdf_url': qp_url, 'full_mark_scheme_pdf_url': ms_url, 'official_source_url': qp_url,
        'examiner_report_url': docs.get('examiner report', {}).get('official_url'),
    }
    if booklet_page:
        paper['resource_booklet_pdf_url'] = qp['official_url'] + f'#page={booklet_page}'
        paper['assessment_resources'] = [{
            'kind': 'source_booklet', 'label': 'Official source booklet (PDF)',
            'url': paper['resource_booklet_pdf_url'],
        }]
    available_marks = sum(record['marks'] for record in records)
    if excluded:
        paper['excluded_questions'] = excluded
        omitted = ', '.join(f"Q{unit['question_number']}" for unit in excluded)
        paper['practice_coverage_note'] = (
            f'Online practice covers {available_marks} of the 90 marks. '
            f'Use the official question paper and its resources for {omitted}.'
        )
    if available_marks + sum(unit['marks'] for unit in excluded) != 90:
        raise ValueError(f'Published and excluded marks do not reconcile for {pid}')

    pack = {'pack_id': pid.lower(), 'papers': [paper], 'questions': records}
    catalogue = {'format': 'lossless-webp-catalogue-v1', 'paper_id': pid, 'assets': assets}
    write(DATA / 'packs' / SLUG / f'{pid}.json', pack, compact=True)
    write(DATA / f'{SLUG}-assets' / f'{pid}.json', catalogue, compact=True)
    return {'paper_id': pid, 'scored_units': len(records), 'published_marks': available_marks,
            'image_assets': len(assets), 'excluded': excluded}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--candidates', type=Path, help='Reuse an extracted geometry manifest')
    args = parser.parse_args()
    args.sources.mkdir(parents=True, exist_ok=True)
    sources = read(IMPORT / 'sources.json')
    papers = list(source_papers(sources))
    if args.candidates:
        geometry = read(args.candidates)
    else:
        paths = dict.fromkeys(path_for(paper[4]['question paper'], args.sources) for paper in papers)
        geometry = [candidate for path in paths for candidate in extract(path)]
    candidates = {candidate['sha256'] + ':' + candidate['component']: candidate for candidate in geometry}
    spec = read(DATA / 'specs' / f'{SUBJECT}.json')
    valid_points = {point['id'] for section in spec['sections'] for topic in section['topics'] for point in topic['points']}
    reviews = read(IMPORT / 'reviews.json')
    corrections = read(IMPORT / 'corrections.json')
    coverage = [build_paper(paper, candidates, args.sources, reviews, corrections, valid_points)
                for paper in papers]
    pack_index_path = DATA / 'packs/index.json'
    index = read(pack_index_path)
    index['packs'] = [entry for entry in index['packs'] if entry.get('subject_id') != SUBJECT]
    index['packs'].extend({'file': f'{SLUG}/{paper["paper_id"]}.json', 'subject_id': SUBJECT} for paper in coverage)
    write(pack_index_path, index)
    write(IMPORT / 'coverage.json', coverage)
    print(f'{len(coverage)} papers, {sum(paper["scored_units"] for paper in coverage)} scored units')


if __name__ == '__main__':
    main()
