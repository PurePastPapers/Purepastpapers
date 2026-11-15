#!/usr/bin/env python3
"""Build only reviewed, reconciled source-rendered Maths content packs."""
import argparse
import concurrent.futures
import hashlib
import html
import json
import re
from collections import Counter, defaultdict, deque
from pathlib import Path
import pdfplumber
from render import SourceRenderer
from schemes import scheme_regions

SUBJECT = 'EDX_ALEVEL_MATH_9MA0'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def clip(regions, start, end):
    output = []
    for region in regions:
        page, box = region['page'], list(region['bbox'])
        if start[0] <= page <= end[0]:
            if page == start[0]: box[1] = max(box[1], start[1])
            if page == end[0]: box[3] = min(box[3], end[1])
            if box[3] - box[1] > .005: output.append({'page': page, 'bbox': box})
    return output


def build_paper(paper, candidate, review, sources, asset_dir, repo, valid_ids):
    if review.get('reviewer_type') != 'model' or review.get('source_sha256') != candidate['source_sha256']:
        raise ValueError('Review identity/checksum mismatch')
    by_number = {str(q['number']): q for q in review['questions']}
    if set(by_number) != {q['number'] for q in candidate['questions']}:
        raise ValueError('Not every source question has a review')
    if candidate['total_marks'] != paper['max_marks']:
        raise ValueError('Question-paper mark total mismatch')
    if paper['documents']['question_paper']['url'].lower().endswith('.zip'):
        paper = {**paper, 'source_format': 'zip'}
    qp = sources / (paper['paper_id'] + '__question_paper.pdf')
    ms = sources / (paper['paper_id'] + '__mark_scheme.pdf')
    if hashlib.sha256(qp.read_bytes()).hexdigest() != candidate['source_sha256']:
        raise ValueError('Question source revision mismatch')
    ms_sha = hashlib.sha256(ms.read_bytes()).hexdigest()
    if ms_sha != paper['documents']['mark_scheme']['sha256']:
        manifest_path = sources/'source-page-provenance.json'
        manifest = json.loads(manifest_path.read_text())['records'] if manifest_path.exists() else []
        derivation = next((item for item in manifest if item['paper_id'] == paper['paper_id'] and item['kind'] == 'mark_scheme'), None)
        if not derivation or derivation['cache_sha256'] != ms_sha or derivation['original_source_sha256'] != paper['documents']['mark_scheme']['sha256']:
            raise ValueError('Scheme source revision mismatch')
    schemes = scheme_regions(ms, len(candidate['questions']))
    renderer, scheme_renderer = SourceRenderer(qp), SourceRenderer(ms)
    with pdfplumber.open(qp) as doc:
        sizes = [(p.width, p.height) for p in doc.pages]
    records = []
    for question in candidate['questions']:
        checked = by_number[question['number']]
        raw_parts = question['parts']
        expected = Counter(p['part_label'] for p in raw_parts)
        actual = Counter(label for unit in checked['units'] for label in unit['parts'])
        if expected != actual:
            raise ValueError(f"Q{question['number']}: reviewed part coverage mismatch")
        original = defaultdict(deque)
        for part in raw_parts: original[part['part_label']].append(part)
        # Shared source stem precedes the first marked part. Source equations are
        # always pixels; no extraction text is substituted for original wording.
        first = raw_parts[0].get('start')
        prefix = clip(question['regions'], (0, 0), (first['page'], max(0, (first['top'] - 4) / sizes[first['page']-1][1]))) if first else []
        prefix.extend(r for r in question['regions'] if r.get('shared_figure'))
        root = asset_dir / paper['paper_id']
        full_image = root / f"Q{int(question['number']):02}_full.webp"
        renderer.render(question['regions'], full_image)
        scheme_image = root / f"Q{int(question['number']):02}_scheme.webp"
        scheme_renderer.render(schemes[question['number']], scheme_image)
        stem_image = root / f"Q{int(question['number']):02}_stem.webp"
        if prefix: renderer.render(prefix, stem_image)
        def part_start(part):
            index = raw_parts.index(part)
            if index == 0:
                return (question['regions'][0]['page'], question['regions'][0]['bbox'][1])
            previous = raw_parts[index - 1]
            begin = part.get('start')
            y = previous['bottom'] + 7
            if begin and begin['page'] == previous['page']:
                y = min(y, begin['top'] - 4)
            return (previous['page'], y / sizes[previous['page'] - 1][1])
        for ui, unit in enumerate(checked['units'], 1):
            if unit.get('review_status') != 'model_reviewed' or unit.get('introduced_year') not in [12, 13]:
                raise ValueError(f"Q{question['number']}: unresolved unit/year review")
            primary, crossover = unit['primary_spec_points'], unit.get('crossover_spec_points', [])
            if not primary or any(tag not in valid_ids for tag in primary + crossover):
                raise ValueError(f"Q{question['number']}: invalid spec tags")
            chosen = [original[label].popleft() for label in unit['parts']]
            marks = sum(p['marks'] for p in chosen)
            whole = len(chosen) == len(raw_parts)
            regions = question['regions'] if whole else []
            if not whole:
                for part in chosen:
                    begin = part.get('start')
                    start = part_start(part)
                    end_y = part['bottom'] + 7
                    part_index = raw_parts.index(part)
                    if part_index + 1 < len(raw_parts):
                        next_start = raw_parts[part_index + 1].get('start')
                        if next_start and next_start['page'] == part['page']:
                            end_y = max(part['bottom'] + 1, min(end_y, next_start['top'] - 4))
                    regions.extend(clip(question['regions'], start, (part['page'], end_y/sizes[part['page']-1][1])))
            image = full_image if whole else root / f"Q{int(question['number']):02}_U{ui:02}.webp"
            if not whole: renderer.render(regions, image)
            rel = lambda path: path.relative_to(repo).as_posix()
            label = unit.get('display_part_label') or ('–'.join(unit['parts']) if len(unit['parts']) > 1 else unit['parts'][0])
            record = {
                'question_id': f"{paper['paper_id']}_Q{int(question['number']):02}_U{ui:02}",
                'parent_question_id': f"{paper['paper_id']}_Q{int(question['number']):02}",
                'source_type': 'real_past_paper', 'is_sample': False,
                'paper_id': paper['paper_id'], 'subject_id': SUBJECT, 'board': 'Edexcel',
                'level': 'AS' if paper.get('is_as') else 'A-Level', 'subject': 'Mathematics',
                'spec_code': paper['qualification_code'], 'qualification_code': paper['qualification_code'],
                'is_as': bool(paper.get('is_as')), 'is_official_sample': bool(paper.get('is_sample')), 'subject_category': 'STEM',
                'year': paper['year'], 'series': paper['series'], 'component': paper['component'],
                'question_number': question['number'], 'marks': marks, 'estimated_minutes': max(1, round(marks*1.2)),
                'difficulty': unit['difficulty'], 'introduced_year': 12 if paper.get('is_as') else unit['introduced_year'],
                'primary_spec_points': primary, 'crossover_spec_points': crossover,
                'preview_text': unit['summary'], 'include_in_custom_pool': True,
                'content': {'question_html': '', 'question_image_url': rel(image), 'mark_scheme_html': '', 'mark_scheme_image_url': rel(scheme_image)},
                'scheme_scope': 'full_question',
                'scheme_question_number': question['number'],
                'context': {'full_question_image_url': rel(full_image)} if not whole else {},
                'provenance': {'review_status': 'model_reviewed', 'reviewer_type': 'model',
                    'question_source_sha256': candidate['source_sha256'], 'scheme_source_sha256': ms_sha,
                    'original_question_source_sha256': paper['documents']['question_paper']['sha256'],
                    'original_scheme_source_sha256': paper['documents']['mark_scheme']['sha256'],
                    'question_page_offset': paper['documents']['question_paper'].get('source_pages_inclusive', [1])[0]-1,
                    'scheme_page_offset': paper['documents']['mark_scheme'].get('source_pages_inclusive', [1])[0]-1,
                    'scheme_regions': schemes[question['number']],
                    'source_regions': regions, 'original_parts': unit['parts'],
                    'original_tariff_indices': [raw_parts.index(part) for part in chosen],
                    'difficulty_basis': unit['difficulty_basis'], 'year_basis': unit.get('year_basis') or unit.get('introduced_year_basis'),
                    'context_basis': unit['context_basis'], 'qualification_code': paper['qualification_code']},
            }
            if label: record['part_label'] = label
            unit_prefix = prefix
            if not whole and (unit.get('context_basis') != 'independent' or unit.get('shared_source_parts')):
                first_chosen = min(chosen, key=lambda part: (part['page'], part['top']))
                begin = first_chosen.get('start')
                if begin:
                    boundary = part_start(first_chosen)
                    unit_prefix = clip(question['regions'], (0, 0), boundary)
                    unit_prefix.extend(r for r in question['regions'] if r.get('shared_figure') and r not in unit_prefix)
            context_image = stem_image
            if unit_prefix and unit_prefix != prefix:
                context_image = root / f"Q{int(question['number']):02}_U{ui:02}_context.webp"
                renderer.render(unit_prefix, context_image)
            if unit_prefix and not whole:
                record['context']['shared_stem_html'] = '<p>Original question information and preceding context. Only the selected unit is scored:</p><img data-math-image="'+rel(context_image)+'" alt="Shared source stem for question '+html.escape(question['number'])+'" />'
            records.append(record)
    if sum(r['marks'] for r in records) != paper['max_marks']:
        raise ValueError('Published unit marks do not reconcile to the component')
    component = paper['component']
    subject_name = {'01': 'Pure Mathematics', '02': 'Pure Mathematics' if paper['qualification_code']=='9MA0' else 'Statistics and Mechanics', '03': 'Statistics and Mechanics', '31': 'Statistics', '32': 'Mechanics', '21': 'Statistics', '22': 'Mechanics'}[component]
    title = f"{paper['series']} {paper['year']} · {'AS' if paper.get('is_as') else 'A-Level'} {subject_name} {component}"
    if paper.get('is_sample'): title = f"Official sample · {'AS' if paper.get('is_as') else 'A-Level'} {subject_name} {component}"
    if paper.get('variant', 'standard') != 'standard': title += ' · '+paper['variant'].title()
    docs = paper['documents']
    runtime_paper = {'paper_id': paper['paper_id'], 'paper_type': 'real_past_paper', 'subject_id': SUBJECT,
        'board': 'Edexcel', 'level': 'AS' if paper.get('is_as') else 'A-Level', 'subject': 'Mathematics',
        'spec_code': paper['qualification_code'], 'year': paper['year'], 'series': paper['series'],
        'paper_code': component, 'title': title, 'total_marks': paper['max_marks'],
        'duration_minutes': (75 if paper.get('is_as') else 120) if component in ['31','32','21','22'] else paper.get('duration_minutes') or paper.get('assessment_duration_minutes') or (120 if not paper.get('is_as') else 75),
        'duration_note': paper.get('duration_note') or ('Shared assessment duration for the Statistics and Mechanics booklets.' if component in ['31','32','21','22'] else None),
        'question_ids': [r['question_id'] for r in records], 'is_official_sample': bool(paper.get('is_sample')),
        'source_bundle_url': docs['question_paper']['url'] if paper.get('source_format') == 'zip' else None,
        'full_paper_pdf_url': (docs['question_paper']['url'] + ('#page='+str(docs['question_paper']['source_pages_inclusive'][0]) if docs['question_paper'].get('source_pages_inclusive') else '')) if paper.get('source_format') != 'zip' else None,
        'full_mark_scheme_pdf_url': (docs['mark_scheme']['url'] + ('#page='+str(docs['mark_scheme']['source_pages_inclusive'][0]) if docs['mark_scheme'].get('source_pages_inclusive') else '')) if paper.get('source_format') != 'zip' else None, 'official_source_url': docs['question_paper']['url'],
        'examiner_report_url': docs.get('examiner_report', {}).get('url')}
    return {'pack_id': paper['paper_id'].lower(), 'papers': [runtime_paper], 'questions': records}


def build_job(job):
    paper, candidate, review, sources, repo, valid = job
    paper_id = paper['paper_id']
    if not review.exists() or not candidate.exists():
        return {'paper_id': paper_id, 'status': 'awaiting_review_or_source'}
    target = repo/'data/packs/maths'/f'{paper_id}.json'
    signature = hashlib.sha256(b'crop-build-v3-mediabox' + candidate.read_bytes() + review.read_bytes()).hexdigest()
    try:
        if target.exists():
            existing = json.loads(target.read_text())
            if existing.get('build_signature') == signature:
                return {'paper_id': paper_id, 'status': 'built', 'units': len(existing['questions']), 'marks': sum(q['marks'] for q in existing['questions']), 'resumed': True}
        pack = build_paper(paper, json.loads(candidate.read_text()), json.loads(review.read_text()), sources, repo/'assets/maths', repo, valid)
        registry_path = repo/'data/imports/maths/identities.json'
        if registry_path.exists():
            registry = json.loads(registry_path.read_text())['units']
            for unit in pack['questions']:
                identity = {'parent_question_id': unit['parent_question_id'],
                            'source_sha256': unit['provenance']['question_source_sha256'],
                            'original_tariff_indices': unit['provenance']['original_tariff_indices'],
                            'marks': unit['marks']}
                if unit['question_id'] in registry and registry[unit['question_id']] != identity:
                    raise ValueError('Published assessment identity changed; assign a new ID: '+unit['question_id'])
        pack['build_signature'] = signature
        write_json(target, pack)
        return {'paper_id': paper_id, 'status': 'built', 'units': len(pack['questions']), 'marks': sum(q['marks'] for q in pack['questions'])}
    except Exception as e:
        return {'paper_id': paper_id, 'status': 'needs_review', 'error': str(e)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--candidates', type=Path, required=True)
    parser.add_argument('--reviews', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    args = parser.parse_args()
    repo = args.repo.resolve(); assets = repo/'assets/maths'
    spec = json.loads((repo/'data/specs'/f'{SUBJECT}.json').read_text())
    valid = {p['id'] for s in spec['sections'] for t in s['topics'] for p in t['points']}
    jobs = []
    for paper in json.loads(args.inventory.read_text())['papers']:
        candidate = args.candidates/(paper['paper_id']+'.json'); review = args.reviews/(paper['paper_id']+'.json')
        jobs.append((paper, candidate, review, args.sources, repo, valid))
    status = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for result in pool.map(build_job, jobs):
            status.append(result)
            print(result, flush=True)
    write_json(repo/'data/imports/maths'/f"{args.inventory.stem}-build-status.json", status)
    print('Built',sum(p['status']=='built' for p in status),'papers. Packs require index activation and browser verification.')


if __name__ == '__main__': main()
