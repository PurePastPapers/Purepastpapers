#!/usr/bin/env python3
"""Build reviewed, reconciled, source-rendered Eduqas GCSE English Literature (C720QS) packs.

Usage: build.py --research DIR [--only PAPER ...]
  DIR holds sources/, candidates/ (extract.py) and reviews/ (reviews.py compile).

One scored unit per printed question on the owner's route: Macbeth 21 (extract question,
crop includes the extract) and 22 (essay); An Inspector Calls 08 and A Christmas Carol 21
(40-mark source-based essays, crop includes the extract); unseen poetry 31 and 32 (32
shows the section rubric, 31 and the first poem as unscored context). Questions on other
texts are listed as option_not_in_route. Anthology questions name a poem from the
anthology examined until 2026 and are listed as removed_from_specification; a booklet
whose every question is removed (Summer 2022 C722U20-A) gets no pack and is listed in
coverage. The scheme image is the question's own indicative content followed by the
assessment-objectives grid(s) it is marked on. Images are lossless source pixels.
"""
import argparse
import concurrent.futures
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'physics'))
sys.path.insert(0, str(HERE))
from render import SourceRenderer  # noqa: E402
from schemes import scheme_regions  # noqa: E402

SUBJECT = 'EDUQAS_GCSE_ENGLIT_C720QS'
SIGNATURE = b'gcseenglit-build-v1'
REPO = HERE.parents[1]
ROUTE_TITLE = {'SHAKES': 'Macbeth', 'POST1914': 'An Inspector Calls', 'C19': 'A Christmas Carol', 'UNSEEN': 'Unseen poetry', 'ANTH': 'Poetry anthology'}
SECTION = {'SHAKES': 'Component 1 Section A', 'ANTH': 'Component 1 Section B', 'POST1914': 'Component 2 Section A',
           'C19': 'Component 2 Section B', 'UNSEEN': 'Component 2 Section C'}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def display_number(q):
    return f"{q['number'][0]}.{q['number'][1]}" if q['family'] in ('shakespeare', 'unseen', 'anthology') else str(int(q['number']))


def build_paper(paper, research, spec):
    pid = paper['paper_id']
    sources = research / 'sources'
    cand = json.loads((research / 'candidates' / f'{pid}.json').read_text())
    review = json.loads((research / 'reviews' / f'{pid}.json').read_text())
    docs = paper['documents']
    qp, ms = sources / docs['question_paper']['file_name'], sources / docs['mark_scheme']['file_name']
    if review.get('reviewer_type') != 'model':
        raise ValueError('Review must be labelled as a model review')
    if review['source_sha256'] != cand['source_sha256'] or sha(qp) != cand['source_sha256'] or cand['source_sha256'] != docs['question_paper']['sha256']:
        raise ValueError('Question source revision mismatch')
    if cand['exceptions'] or cand['total_marks'] != paper['max_marks']:
        raise ValueError('Extraction exceptions or total mismatch')
    ms_sha = sha(ms)
    if ms_sha != docs['mark_scheme']['sha256']:
        raise ValueError('Scheme source revision mismatch')
    order = [q['number'] for q in cand['questions']]
    reviewed = {u['number']: u for u in review['units']}
    route = [q for q in cand['questions'] if q['route']]
    if set(reviewed) != {q['number'] for q in route}:
        raise ValueError('Reviews must cover exactly the route questions')
    removed = [q for q in route if 'excluded' in reviewed[q['number']] or q.get('copyright_removed_content')]
    publishable = [q for q in route if q not in removed]
    if not publishable:
        return None
    leaves = {p['id'] for s in spec['sections'] for t in s['topics'] for p in t['points']}
    schemes = scheme_regions(ms, [(q['family'], q['number'], q['title']) for q in publishable])
    qr, sr = SourceRenderer(qp), SourceRenderer(ms)
    root = REPO / 'assets/gcseenglit' / pid
    rel = lambda p: p.relative_to(REPO).as_posix()
    records = []
    for q in publishable:
        rv = reviewed[q['number']]
        code = q['number']
        primary, crossover = list(rv['spec_ids']), [x for x in rv['related_spec_ids'] if x not in rv['spec_ids']]
        if not primary or any(t not in leaves for t in primary + crossover):
            raise ValueError(f"Q{code}: invalid tags")
        image, scheme_image = root / f'Q{code}_U01.webp', root / f'Q{code}_U01_scheme.webp'
        qr.render(q['regions'] + q['extract_regions'], image)
        scheme = schemes[code]
        sr.render(scheme['indicative'] + scheme['grid'], scheme_image)
        context, basis = {}, 'independent'
        if q.get('context_regions'):
            ctx = root / f'Q{code}_U01_context.webp'
            qr.render(q['context_regions'], ctx)
            context['figures'] = [{'label': f"Question {code[0]}.1 and the first poem (needed for the comparison)", 'source': 'question_paper',
                                   'image_url': rel(ctx)}]
            basis = 'unscored context: the section rubric, question 3.1 and the first unseen poem'
        elif q['extract_regions']:
            basis = 'the printed extract (on the opposite page in the paper) is part of the question image'
        elif q['route'] in ('POST1914', 'C19'):
            basis = 'the printed extract is part of the question image'
        dn = display_number(q)
        record = {
            'question_id': f'{pid}_Q{code}_U01', 'parent_question_id': f'{pid}_Q{code}',
            'source_type': 'real_past_paper', 'is_sample': False, 'paper_id': pid, 'subject_id': SUBJECT,
            'board': 'WJEC Eduqas', 'level': 'GCSE', 'subject': 'English Literature', 'tier': None, 'spec_code': 'C720QS',
            'qualification_code': 'C720QS', 'is_as': False, 'is_official_sample': False,
            'subject_category': 'Humanities (Essay)', 'year': paper['year'], 'series': paper['series'],
            'component': paper['component'], 'question_number': dn, 'marks': q['marks'],
            'estimated_minutes': {15: 20, 25: 40, 40: 45}.get(q['marks'], max(1, round(q['marks'] * paper['duration_minutes'] / paper['max_marks']))),
            'difficulty': rv['difficulty'], 'section': SECTION[q['route']],
            'route': q['route'], 'route_title': ROUTE_TITLE[q['route']],
            'primary_spec_points': primary, 'crossover_spec_points': crossover,
            'preview_text': rv['summary'], 'include_in_custom_pool': True, 'extended_response': True,
            'content': {'question_html': '', 'question_image_url': rel(image), 'mark_scheme_html': '',
                        'mark_scheme_image_url': rel(scheme_image)},
            'scheme_scope': 'whole_question', 'scheme_question_number': code, 'context': context,
            'provenance': {'review_status': 'model_reviewed', 'reviewer_type': 'model',
                           'question_source_sha256': cand['source_sha256'], 'scheme_source_sha256': ms_sha,
                           'source_regions': q['regions'], 'extract_regions': q['extract_regions'],
                           'scheme_regions': scheme['indicative'] + scheme['grid'],
                           'scheme_indicative_regions': scheme['indicative'], 'scheme_grid_regions': scheme['grid'],
                           'context_regions': q.get('context_regions', []), 'original_parts': [code],
                           'original_tariff_indices': [0], 'difficulty_basis': rv['difficulty_basis'],
                           'context_basis': basis,
                           'specification_version': 'Eduqas C720QS Version 4 (August 2024)',
                           'official_codes': rv['codes'], 'related_codes': rv['related_codes'],
                           'qualification_code': 'C720QS', 'extraction_version': cand['extraction_version']},
        }
        records.append(record)
    out_of_route = [q for q in cand['questions'] if not q['route']]
    if sum(r['marks'] for r in records) + sum(q['marks'] for q in removed + out_of_route) != cand['printed_tariff_sum']:
        raise ValueError('Units do not reconcile to the booklet')
    removed_marks = sum(q['marks'] for q in removed)
    if sum(r['marks'] for r in records) + removed_marks != paper['max_marks']:
        raise ValueError(f"Published {sum(r['marks'] for r in records)} + removed {removed_marks} != cover total {paper['max_marks']}")
    variant = ' (2022 adapted series)' if paper['variant'] == 'adapted_2022' else ''
    title = f"{paper['series']} {paper['year']} · {paper['component_title']}{variant}"
    runtime = {
        'paper_id': pid, 'paper_type': 'real_past_paper', 'subject_id': SUBJECT, 'board': 'WJEC Eduqas', 'level': 'GCSE',
        'subject': 'English Literature', 'spec_code': 'C720QS', 'tier': None, 'year': paper['year'], 'series': paper['series'],
        'paper_code': paper['component'], 'title': title, 'total_marks': paper['max_marks'],
        'duration_minutes': paper['duration_minutes'], 'qualification_code': 'C720QS', 'is_as': False,
        'question_ids': [r['question_id'] for r in records],
        'choice_note': 'Answer on the one text you have studied in Sections A and B (Component 2) and Section A (Component 1). '
                       'This bank publishes the questions on your set texts and the unseen poetry.',
        'is_official_sample': False,
        'full_paper_pdf_url': docs['question_paper']['url'], 'full_mark_scheme_pdf_url': docs['mark_scheme']['url'],
        'official_source_url': docs['question_paper']['url'], 'examiner_report_url': None,
    }
    excluded = [{'question_number': display_number(q), 'source_number': q['number'], 'marks': q['marks'], 'reason_type': 'removed_from_specification',
                 'reason': (reviewed[q['number']].get('excluded') or 'the board removed the source from the public paper').capitalize().rstrip('.') + '.'}
                for q in removed]
    excluded += [{'question_number': display_number(q), 'source_number': q['number'], 'marks': q['marks'], 'reason_type': 'option_not_in_route',
                  'reason': f"{q['title'] or 'This text'} is not one of this school's set texts."} for q in out_of_route]
    if excluded:
        runtime['excluded_questions'] = sorted(excluded, key=lambda e: order.index(e['source_number']))
    if removed:
        runtime['marks_note'] = (f"{removed_marks} of the {paper['max_marks']} marks are anthology questions on poems from the anthology examined "
                                 'until 2026; they are not published because no poem carries over to the 2027 anthology.')
    return {'pack_id': pid.lower(), 'papers': [runtime], 'questions': records}


def build_job(job):
    paper, research = job
    pid = paper['paper_id']
    review, cand = research / 'reviews' / f'{pid}.json', research / 'candidates' / f'{pid}.json'
    if not review.exists() or not cand.exists():
        return {'paper_id': pid, 'status': 'awaiting_review_or_source'}
    target = REPO / 'data/packs/gcseenglit' / f'{pid}.json'
    signature = hashlib.sha256(SIGNATURE + cand.read_bytes() + review.read_bytes() + Path(__file__).read_bytes() + (HERE / 'schemes.py').read_bytes() +
                               (REPO / 'data/specs' / f'{SUBJECT}.json').read_bytes()).hexdigest()
    try:
        if target.exists() and json.loads(target.read_text()).get('build_signature') == signature and (REPO / 'assets/gcseenglit' / pid).exists():
            return {'paper_id': pid, 'status': 'built', 'units': len(json.loads(target.read_text())['questions']), 'resumed': True}
        spec = json.loads((REPO / 'data/specs' / f'{SUBJECT}.json').read_text())
        pack = build_paper(paper, research, spec)
        if pack is None:
            if target.exists():
                target.unlink()
            return {'paper_id': pid, 'status': 'no_route_units', 'reason': 'every route question is on the anthology examined until 2026'}
        registry = REPO / 'data/imports/gcseenglit/identities.json'
        if registry.exists():
            known = json.loads(registry.read_text())['units']
            for u in pack['questions']:
                ident = {'parent_question_id': u['parent_question_id'], 'source_sha256': u['provenance']['question_source_sha256'],
                         'original_parts': u['provenance']['original_parts'], 'marks': u['marks']}
                if u['question_id'] in known and known[u['question_id']] != ident:
                    raise ValueError('Published identity changed; assign a new ID: ' + u['question_id'])
        pack['build_signature'] = signature
        write_json(target, pack)
        return {'paper_id': pid, 'status': 'built', 'units': len(pack['questions'])}
    except Exception as e:
        return {'paper_id': pid, 'status': 'needs_review', 'error': f'{type(e).__name__}: {e}'}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--research', type=Path, required=True)
    ap.add_argument('--only', nargs='*')
    a = ap.parse_args()
    research = a.research.resolve()
    papers = json.loads((REPO / 'data/imports/gcseenglit/inventory/c720qs-inventory.json').read_text())['papers']
    jobs = [(p, research) for p in papers if not a.only or p['paper_id'] in a.only]
    status = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for result in pool.map(build_job, jobs):
            status.append(result)
            print(result, flush=True)
    if not a.only:
        write_json(REPO / 'data/imports/gcseenglit/build-status.json', status)
    print('Built', sum(s['status'] == 'built' for s in status), 'of', len(status))


if __name__ == '__main__':
    main()
