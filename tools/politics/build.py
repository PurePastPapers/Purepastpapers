#!/usr/bin/env python3
"""Build reviewed, reconciled source-rendered AQA A-level Politics (7152) packs.

One scored unit per printed question (AQA tariffs are whole questions). Reviews tag
official specification section codes (e.g. 3.1.2.3), mapped to AQA_POL_3.1.2.3.
Optional questions keep their choice group, so the booklet still reconciles to its
printed maximum: compulsory tariffs plus one tariff per choice group. Questions whose
source was copyright-removed by AQA are excluded and recorded, never published
incomplete. Question and scheme images are source pixels; the scheme image is the
section's levels-of-response grid followed by the question's indicative content.
"""
import argparse
import concurrent.futures
import hashlib
import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / 'physics'))  # render.py only; schemes is ours
from render import SourceRenderer  # noqa: E402
from schemes import scheme_regions  # noqa: E402

SUBJECT = 'AQA_ALEVEL_POL_7152'
SIGNATURE = b'politics-build-v1'
TITLES = {'01': 'Paper 1: Government and politics of the UK',
          '02': 'Paper 2: Government and politics of the USA and comparative politics',
          '03': 'Paper 3: Political ideas'}
sid = lambda code: f'AQA_POL_{code}'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def effective_marks(records, groups):
    grouped = {n for g in groups for n in g}
    marks = {r['question_number']: r['marks'] for r in records}
    return sum(m for n, m in marks.items() if n not in grouped) + \
        sum(max(marks[n] for n in g if n in marks) for g in groups if any(n in marks for n in g))


def build_paper(paper, candidate, review, sources, asset_dir, repo, valid_ids):
    if review.get('reviewer_type') != 'model' or review.get('source_sha256') != candidate['source_sha256']:
        raise ValueError('Review identity/checksum mismatch')
    if candidate['exceptions'] or candidate['total_marks'] != paper['max_marks']:
        raise ValueError('Question-paper mark total mismatch or unresolved extraction exceptions')
    docs = paper['documents']
    qp, ms = sources / docs['question_paper']['file_name'], sources / docs['mark_scheme']['file_name']
    if sha(qp) != candidate['source_sha256'] or candidate['source_sha256'] != docs['question_paper']['sha256']:
        raise ValueError('Question source revision mismatch')
    ms_sha = sha(ms)
    if ms_sha != docs['mark_scheme']['sha256']:
        raise ValueError('Scheme source revision mismatch')
    reviewed = {str(q['number']): q for q in review['questions']}
    excluded = [q['number'] for q in candidate['questions'] if q.get('copyright_removed_content')]
    publishable = [q for q in candidate['questions'] if q['number'] not in excluded]
    if set(reviewed) != {q['number'] for q in publishable}:
        raise ValueError(f'Reviews must cover exactly the publishable questions {[q["number"] for q in publishable]}')
    schemes = scheme_regions(ms, [q['number'] for q in publishable])
    renderer, scheme_renderer = SourceRenderer(qp), SourceRenderer(ms)
    root = asset_dir / paper['paper_id']
    rel = lambda path: path.relative_to(repo).as_posix()
    group_of = {n: g for g in candidate['choice_groups'] for n in g}
    records = []
    for question in publishable:
        unit = reviewed[question['number']]
        if unit.get('review_status') != 'model_reviewed':
            raise ValueError(f"Q{question['number']}: unresolved review")
        primary = [sid(c) for c in unit['sections']]
        crossover = [sid(c) for c in unit.get('prerequisites', []) if sid(c) not in primary]
        if not primary or any(tag not in valid_ids for tag in primary + crossover):
            raise ValueError(f"Q{question['number']}: invalid section tags {primary + crossover}")
        [part] = question['parts']
        n = int(question['number'])
        image, scheme_image = root / f'Q{n:02}_full.webp', root / f'Q{n:02}_scheme.webp'
        renderer.render(question['regions'], image)
        scheme = schemes[question['number']]
        scheme_renderer.render(scheme['levels'] + scheme['indicative'], scheme_image)
        record = {
            'question_id': f"{paper['paper_id']}_Q{n:02}_U01",
            'parent_question_id': f"{paper['paper_id']}_Q{n:02}",
            'source_type': 'real_past_paper', 'is_sample': False,
            'paper_id': paper['paper_id'], 'subject_id': SUBJECT, 'board': 'AQA', 'level': 'A-Level',
            'subject': 'Government & Politics', 'spec_code': '7152', 'qualification_code': '7152',
            'is_as': False, 'is_official_sample': bool(paper.get('is_sample')), 'subject_category': 'Humanities (Essay)',
            'year': paper['year'], 'series': paper['series'], 'component': paper['component'],
            'question_number': question['number'], 'marks': part['marks'],
            'estimated_minutes': max(1, round(part['marks'] * paper['duration_minutes'] / paper['max_marks'])),
            'difficulty': unit['difficulty'], 'section': question['section'],
            'official_sections': list(unit['sections']),
            'primary_spec_points': primary, 'crossover_spec_points': crossover,
            'preview_text': unit['summary'], 'include_in_custom_pool': True,
            'content': {'question_html': '', 'question_image_url': rel(image), 'mark_scheme_html': '',
                        'mark_scheme_image_url': rel(scheme_image)},
            'scheme_scope': 'full_question', 'scheme_question_number': question['number'], 'context': {},
            'provenance': {'review_status': 'model_reviewed', 'reviewer_type': 'model',
                           'question_source_sha256': candidate['source_sha256'], 'scheme_source_sha256': ms_sha,
                           'original_question_source_sha256': docs['question_paper']['sha256'],
                           'original_scheme_source_sha256': docs['mark_scheme']['sha256'],
                           'question_page_offset': 0, 'scheme_page_offset': 0,
                           'scheme_regions': scheme['levels'] + scheme['indicative'],
                           'scheme_levels_regions': scheme['levels'], 'scheme_indicative_regions': scheme['indicative'],
                           'source_regions': question['regions'], 'original_parts': [''], 'original_tariff_indices': [0],
                           'difficulty_basis': unit['difficulty_basis'], 'context_basis': 'independent',
                           'official_sections': list(unit['sections']), 'prerequisite_sections': list(unit.get('prerequisites', [])),
                           'qualification_code': '7152'},
        }
        if question['number'] in group_of:
            record['choice_group'] = group_of[question['number']]
        records.append(record)
    groups = [[f"{paper['paper_id']}_Q{int(x):02}_U01" for x in g if x not in excluded] for g in candidate['choice_groups']]
    excluded_marks = sum(q['marks'] for q in candidate['questions'] if q['number'] in excluded)
    if effective_marks(records, candidate['choice_groups']) != paper['max_marks'] - excluded_marks:
        raise ValueError('Published unit marks do not reconcile to the component')
    title = f"{paper['series']} {paper['year']} · A-Level {TITLES[paper['component']]}"
    if paper.get('is_sample'):
        title = f"Official sample · A-Level {TITLES[paper['component']]}"
    runtime_paper = {
        'paper_id': paper['paper_id'], 'paper_type': 'real_past_paper', 'subject_id': SUBJECT, 'board': 'AQA',
        'level': 'A-Level', 'subject': 'Government & Politics', 'spec_code': '7152', 'year': paper['year'],
        'series': paper['series'], 'paper_code': paper['component'], 'title': title, 'total_marks': paper['max_marks'],
        'duration_minutes': paper['duration_minutes'], 'qualification_code': '7152', 'is_as': False,
        'question_ids': [r['question_id'] for r in records], 'choice_groups': [g for g in groups if len(g) > 1],
        'choice_note': 'Answer one question from each choice group; the paper total counts one of them.',
        'is_official_sample': bool(paper.get('is_sample')),
        'full_paper_pdf_url': docs['question_paper']['url'], 'full_mark_scheme_pdf_url': docs['mark_scheme']['url'],
        'official_source_url': docs['question_paper']['url'],
        'examiner_report_url': docs.get('examiner_report', {}).get('url'),
    }
    if excluded:
        runtime_paper['excluded_questions'] = [{'question_number': x, 'marks': next(q['marks'] for q in candidate['questions'] if q['number'] == x),
                                                'reason': 'AQA removed third-party copyright material from the public paper, so the question is incomplete.'}
                                               for x in excluded]
    return {'pack_id': paper['paper_id'].lower(), 'papers': [runtime_paper], 'questions': records}


def build_job(job):
    paper, candidate, review, sources, repo, valid = job
    pid = paper['paper_id']
    if not review.exists() or not candidate.exists():
        return {'paper_id': pid, 'status': 'awaiting_review_or_source'}
    target = repo / 'data/packs/politics' / f'{pid}.json'
    signature = hashlib.sha256(SIGNATURE + candidate.read_bytes() + review.read_bytes()).hexdigest()
    try:
        if target.exists() and json.loads(target.read_text()).get('build_signature') == signature \
                and (repo / 'assets/politics' / pid).exists():
            existing = json.loads(target.read_text())
            return {'paper_id': pid, 'status': 'built', 'units': len(existing['questions']), 'resumed': True}
        pack = build_paper(paper, json.loads(candidate.read_text()), json.loads(review.read_text()), sources,
                           repo / 'assets/politics', repo, valid)
        registry_path = repo / 'data/imports/politics/identities.json'
        if registry_path.exists():
            registry = json.loads(registry_path.read_text())['units']
            for unit in pack['questions']:
                identity = {'parent_question_id': unit['parent_question_id'], 'source_sha256': unit['provenance']['question_source_sha256'],
                            'original_tariff_indices': [0], 'marks': unit['marks']}
                if unit['question_id'] in registry and registry[unit['question_id']] != identity:
                    raise ValueError('Published assessment identity changed; assign a new ID: ' + unit['question_id'])
        pack['build_signature'] = signature
        write_json(target, pack)
        return {'paper_id': pid, 'status': 'built', 'units': len(pack['questions'])}
    except Exception as e:
        return {'paper_id': pid, 'status': 'needs_review', 'error': f'{type(e).__name__}: {e}'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--candidates', type=Path, required=True)
    parser.add_argument('--reviews', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--only', nargs='*')
    args = parser.parse_args()
    repo = args.repo.resolve()
    spec = json.loads((repo / 'data/specs' / f'{SUBJECT}.json').read_text())
    valid = {p['id'] for s in spec['sections'] for t in s['topics'] for p in t['points']}
    only = set(args.only or [])
    jobs = [(p, args.candidates / f"{p['paper_id']}.json", args.reviews / f"{p['paper_id']}.json", args.sources, repo, valid)
            for p in json.loads(args.inventory.read_text())['papers'] if not only or p['paper_id'] in only]
    status = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for result in pool.map(build_job, jobs):
            status.append(result)
            print(result, flush=True)
    write_json(repo / 'data/imports/politics' / f'{args.inventory.stem}-build-status.json', status)
    print('Built', sum(p['status'] == 'built' for p in status), 'papers.')


if __name__ == '__main__':
    main()
