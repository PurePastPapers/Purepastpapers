#!/usr/bin/env python3
"""Render OCR 05835 Business from versioned, reviewed geometry manifests.

Raw PDFs are a private cache, never build outputs. Corrections live in reviews;
the renderer never infers boundaries or replaces reviewed coordinates.
"""
import argparse
import base64
from hashlib import sha256
from html import escape
from io import BytesIO
import json
from pathlib import Path
import re

import fitz
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data'
IMPORT = DATA / 'imports/ocrbusiness'
SUBJECT = 'OCR_L3_BUS_CTEC'
SLUG = 'ocrbusiness'
TITLES = {1: 'The business environment', 2: 'Working in business', 3: 'Business decisions'}


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False,
                               **({'separators': (',', ':')} if compact else {'indent': 2})) + '\n')


class Sources:
    def __init__(self, directory):
        self.directory = directory
        self.rows = {s['source_id']: s for s in read(IMPORT / 'sources.json')}
        self.documents = {}

    def doc(self, source_id):
        source_id = str(source_id)
        if source_id not in self.documents:
            source = self.rows[source_id]
            path = self.directory / (source_id + '.pdf')
            if not path.exists():
                path = self.directory / source['official_url'].rsplit('/', 1)[-1]
            content = path.read_bytes()
            if not content.startswith(b'%PDF-') or sha256(content).hexdigest() != source['sha256']:
                raise ValueError(f'Wrong or changed source revision: {source_id}')
            doc = fitz.open(stream=content, filetype='pdf')
            if len(doc) != source['pages']:
                raise ValueError(f'Wrong page count: {source_id}')
            self.documents[source_id] = doc
        return self.documents[source_id]


def render(sources, regions, default_source, assets, name):
    frames = []
    for region in regions:
        doc = sources.doc(region.get('source_id', default_source))
        page = doc[region['page']]
        rect = fitz.Rect(region['rect'])
        if rect.is_empty or not page.rect.contains(rect):
            raise ValueError(f'Invalid crop {name}: {region}')
        pix = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), clip=rect, alpha=False)
        frame = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        if region.get('rotate'):
            if region['rotate'] not in (90, 180, 270, -90):
                raise ValueError(f'Unsupported reviewed rotation: {name}')
            frame = frame.rotate(region['rotate'], expand=True)
        if not ImageChops.difference(frame, Image.new('RGB', frame.size, 'white')).getbbox():
            raise ValueError(f'Blank source region: {name}')
        frames.append(frame)
    if not frames:
        raise ValueError(f'Missing regions: {name}')
    canvas = Image.new('RGB', (max(f.width for f in frames), sum(f.height for f in frames) + 10 * (len(frames) - 1)), 'white')
    y = 0
    for frame in frames:
        canvas.paste(frame, (0, y))
        y += frame.height + 10
    stream = BytesIO()
    canvas.save(stream, 'WEBP', lossless=True)
    content = stream.getvalue()
    assets[name] = {'sha256': sha256(content).hexdigest(), 'base64': base64.b64encode(content).decode('ascii')}


def build(manifest, sources, valid_points):
    m = manifest
    unit = int(m['unit'])
    pid = m['paper_id']
    qp_id, ms_id = str(m['qp_source_id']), str(m['ms_source_id'])
    qp, ms = sources.rows[qp_id], sources.rows[ms_id]
    sources.doc(qp_id)
    sources.doc(ms_id)
    if any(s['unit'] != unit or s['year'] != m['year'] or s['series'] != m['series'] for s in (qp, ms)):
        raise ValueError(f'Source unit/sitting mismatch: {pid}')
    if qp.get('rejected') or ms.get('rejected'):
        raise ValueError(f'Rejected source: {pid}')
    if sum(u['marks'] for u in m['units']) + sum(u['marks'] for u in m.get('blocked', [])) != m['total_marks']:
        raise ValueError(f'Printed marks do not reconcile: {pid}')
    if len({u['label'] for u in m['units']}) != len(m['units']):
        raise ValueError(f'Duplicate printed labels: {pid}')
    assets, questions = {}, []
    prefix = f'assets/{SLUG}/{pid}'
    contexts = {}
    resources = list(m.get('assessment_resources', []))
    report = next((s for s in sources.rows.values() if s['unit'] == unit and s['year'] == m['year']
                   and s['series'] == m['series'] and s['role'] == 'examiner_report'), None)
    for key, context in m.get('contexts', {}).items():
        name = 'CONTEXT_' + re.sub('[^A-Za-z0-9_]', '_', key).upper() + '.webp'
        regions = context.get('regions', [])
        sid = str(context.get('source_id', qp_id))
        context_sources = {sid, *(str(r.get('source_id', sid)) for r in regions)}
        for context_id in context_sources:
            cs = sources.rows[context_id]
            if cs.get('rejected') or any(cs[k] != qp[k] for k in ('unit', 'year', 'series')):
                raise ValueError(f'Wrong context source: {pid} {context_id}')
            if context_id != qp_id and not any(x['url'] == cs['official_url'] for x in resources):
                resources.append({'kind': cs['role'], 'label': context['label'] + ' (official PDF)', 'url': cs['official_url']})
        figure = {'label': context['label'], 'source': 'official_assessment_material'}
        if regions:
            render(sources, regions, sid, assets, name)
            figure['image_url'] = f'{prefix}/{name}'
            figure['official_url'] = sources.rows[str(regions[0].get('source_id', sid))]['official_url'] + f'#page={regions[0]["page"] + 1}'
        elif context.get('official_url'):
            figure['official_url'] = context['official_url']
        else:
            raise ValueError(f'Context has neither source pixels nor official link: {pid} {key}')
        contexts[key] = figure
    labels = {u['label'] for u in m['units']}
    for u in m['units']:
        label = u['label']
        qid = f'{pid}_Q{label.upper()}'
        primary = u.get('primary_spec_points') or [f'OCR_L3BUS_U{unit}_TC{code}' for code in u['primary_codes']]
        crossover = u.get('crossover_spec_points', [])
        if not primary or not set(primary + crossover) <= valid_points:
            raise ValueError(f'Unknown official topics: {qid} {primary + crossover}')
        if any(dep not in labels for dep in u.get('depends_on', [])):
            raise ValueError(f'Missing prerequisite: {qid}')
        name = 'Q' + label.upper() + '.webp'
        scheme_name = 'Q' + label.upper() + '_SCHEME.webp'
        render(sources, u['regions'], qp_id, assets, name)
        render(sources, u['scheme_regions'], ms_id, assets, scheme_name)
        printed = str(u['question_number']) + u.get('part_label', '')
        note = u.get('scheme_note', '')
        scope = u.get('scheme_scope', 'part')
        if scope != 'part' and not note:
            raise ValueError(f'Unlabelled scheme fallback: {qid}')
        question = {
            'question_id': qid, 'parent_question_id': f'{pid}_Q{u["question_number"]}',
            'source_type': 'real_past_paper', 'is_sample': False,
            'is_official_sample': m['year'] is None,
            'subject_id': SUBJECT, 'paper_id': pid, 'board': 'OCR', 'level': 'Level 3',
            'subject': 'Business', 'subject_category': 'Applied / Vocational',
            'spec_code': '05835', 'qualification_code': '05835',
            'year': m['year'], 'series': m['series'], 'tier': None,
            'component': f'05835/0{unit}', 'unit': unit, 'optional_unit': unit == 3,
            'question_number': str(u['question_number']), 'part_label': u.get('part_label', ''),
            'marks': u['marks'], 'estimated_minutes': max(1, round(u['marks'] * m['duration_minutes'] / m['total_marks'])),
            'difficulty': u.get('difficulty', 'hard' if u['marks'] >= 8 else 'medium' if u['marks'] >= 3 else 'easy'),
            'include_in_custom_pool': True, 'primary_spec_points': primary, 'crossover_spec_points': crossover,
            'preview_text': ' '.join(u['text'].split())[:200], 'scheme_scope': scope,
            'scheme_question_number': printed,
            'content': {'question_html': '', 'question_image_url': f'{prefix}/{name}',
                        'mark_scheme_html': f'<p>{escape(note)}</p>' if note else '',
                        'mark_scheme_image_url': f'{prefix}/{scheme_name}'},
            'context': {'figures': [contexts[key] for key in u.get('contexts', [])]},
            'provenance': {'review_status': 'model_reviewed', 'reviewer_type': 'model',
                           'question_source_sha256': qp['sha256'], 'scheme_source_sha256': ms['sha256'],
                           'source_regions': u['regions'], 'scheme_regions': u['scheme_regions'],
                           'resource_regions': {key: m['contexts'][key].get('regions', []) for key in u.get('contexts', [])},
                           'original_parts': [printed], 'original_tariff_indices': [0],
                           'difficulty_basis': u.get('difficulty_basis', 'Command, contextual application and published tariff; model reviewed'),
                           'part_scheme_check': u.get('scheme_check', 'reference_matched'),
                           'review_manifest': f'data/imports/{SLUG}/reviews/{m["review_filename"]}'},
        }
        if u.get('section'):
            question['section'] = u['section']
        if u.get('depends_on'):
            question['depends_on_question_ids'] = [f'{pid}_Q{dep.upper()}' for dep in u['depends_on']]
        if u.get('selection_count'):
            question.update(multiple_choice=True, selection_count=u['selection_count'])
        if u.get('preparation_note'):
            question['content']['question_html'] = '<p>' + escape(u['preparation_note']) + '</p>'
        questions.append(question)
    paper = {
        'paper_id': pid, 'paper_type': 'real_past_paper', 'subject_id': SUBJECT,
        'board': 'OCR', 'level': 'Level 3', 'subject': 'Business', 'spec_code': '05835',
        'qualification_code': '05835', 'paper_code': f'U{unit}',
        'official_paper_code': f'Unit 0{unit}' + (' (optional)' if unit == 3 else ' (mandatory)'),
        'unit': unit, 'optional_unit': unit == 3, 'tier': None,
        'title': f'{m["series"]}{" " + str(m["year"]) if m["year"] else ""} · {"Optional " if unit == 3 else ""}Unit {unit}: {TITLES[unit]}',
        'year': m['year'], 'series': m['series'], 'printed_exam_date': m.get('printed_date'),
        'total_marks': m['total_marks'], 'duration_minutes': m['duration_minutes'],
        'is_sample': False, 'is_official_sample': m['year'] is None,
        'catalogue_verified': True, 'catalogue_generated': False,
        'question_ids': [q['question_id'] for q in questions],
        'full_paper_pdf_url': qp['official_url'] + (f'#page={m["qp_cover_page"] + 1}' if m.get('qp_cover_page') else ''),
        'full_mark_scheme_pdf_url': ms['official_url'] + (f'#page={m["ms_cover_page"] + 1}' if m.get('ms_cover_page') else ''),
        'official_source_url': qp['official_url'],
        'examiner_report_url': m.get('examiner_report_url') or (report['official_url'] if report else None),
        'assessment_resources': resources,
        'grade_note': 'Unit marks only. No verified unit/series grade boundaries have been imported. This is not an overall qualification result.',
    }
    if m.get('blocked'):
        paper['excluded_questions'] = m['blocked']
        paper['practice_coverage_note'] = f'Online practice covers {sum(q["marks"] for q in questions)} of {m["total_marks"]} marks. ' + ' '.join(dict.fromkeys(x['reason'] for x in m['blocked']))
    if m.get('preparation_note'):
        paper['practice_coverage_note'] = (paper.get('practice_coverage_note', '') + ' ' + m['preparation_note']).strip()
    pack = {'pack_id': pid.lower(), 'papers': [paper], 'questions': questions}
    write(DATA / 'packs' / SLUG / f'{pid}.json', pack, True)
    write(DATA / f'{SLUG}-assets' / f'{pid}.json', {'format': 'lossless-webp-catalogue-v1', 'paper_id': pid, 'assets': assets}, True)
    return {'paper_id': pid, 'unit': unit, 'year': m['year'], 'series': m['series'],
            'scored_units': len(questions), 'published_marks': sum(q['marks'] for q in questions),
            'total_marks': m['total_marks'], 'blocked': m.get('blocked', []), 'image_assets': len(assets)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--paper', help='Build one representative paper without changing the pack index')
    parser.add_argument('--activate', action='store_true')
    args = parser.parse_args()
    sources = Sources(args.sources)
    spec = read(DATA / 'specs' / f'{SUBJECT}.json')
    valid = {p['id'] for s in spec['sections'] for t in s.get('topics', []) for p in t.get('points', [])}
    coverage = []
    for path in sorted((IMPORT / 'reviews').glob('u[123]-*.json')):
        m = read(path)
        if args.paper and args.paper != m['paper_id']:
            continue
        m['review_filename'] = path.name
        coverage.append(build(m, sources, valid))
    if not coverage:
        raise ValueError('No reviewed paper manifests found')
    if args.activate:
        if args.paper:
            raise ValueError('Single-paper prototype must not replace the released index')
        path = DATA / 'packs/index.json'
        index = read(path)
        index['packs'] = [p for p in index['packs'] if p.get('subject_id') != SUBJECT]
        index['packs'].extend({'file': f'{SLUG}/{p["paper_id"]}.json', 'subject_id': SUBJECT} for p in coverage)
        write(path, index)
        write(IMPORT / 'coverage.json', coverage)
    print(json.dumps(coverage))


if __name__ == '__main__':
    main()
