#!/usr/bin/env python3
"""Build reviewed, reconciled, source-rendered AQA Geography packs (A level 7037, AS 7036).

Usage: build.py --research DIR [--only PAPER ...]
  DIR holds sources/, candidates/ (extract.py) and reviews/ (reviews.py compile).

One scored unit per printed part. Unscored context is attached visibly and never
counted: the question's shared stem (AS fieldwork scenarios) and every figure the unit
cites that is not already in its own crop (insert figures, or figures printed with an
earlier part). Units that cite copyright-removed material are excluded and listed on
the paper. Optional questions form choice groups of whole options, so the booklet
still reconciles to its cover maximum. Images are lossless source pixels.

Content year: AS units are Year 12. An A-level unit is Year 12 only when every primary
leaf is content AS 7036 shares (co-teachable AS content); otherwise Year 13. This is an
AS co-teaching basis, not an AQA teaching order, and is recorded on each unit.
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
from figures import index_insert  # noqa: E402
from resolve import resolve  # noqa: E402
from reviews import ROUTES, TOPIC, leaf_id  # noqa: E402

SUBJECT = 'AQA_ALEVEL_GEOG_7037'
SIGNATURE = b'geography-build-v1'
REPO = HERE.parents[1]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def slug(name):
    return name.replace('Figure ', 'FIG').replace('Table ', 'TAB')


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
    insert_path = sources / paper['insert']['file_name'] if paper['insert'] else None
    if insert_path and sha(insert_path) != paper['insert']['sha256']:
        raise ValueError('Insert source revision mismatch')
    idx = index_insert(insert_path) if insert_path else None
    res = resolve(cand, idx)
    excluded = [u for u in cand['units'] if res[u['label']]['removed'] or res[u['label']]['text_removed']]
    ex_labels = {u['label'] for u in excluded}
    if any(r['unresolved'] for l, r in res.items() if l not in ex_labels):
        raise ValueError('Unresolved figure citations')
    reviewed = {u['label']: u for u in review['units']}
    publishable = [u for u in cand['units'] if u['label'] not in ex_labels]
    if set(reviewed) != {u['label'] for u in publishable}:
        raise ValueError('Reviews must cover exactly the publishable units')
    leaves = {p['id']: p for s in spec['sections'] for t in s['topics'] for p in t['points']}
    as_shared = set(spec['as_section_map'].values())
    schemes = scheme_regions(ms, [u['label'] for u in cand['units']])
    qr, sr = SourceRenderer(qp), SourceRenderer(ms)
    ir = SourceRenderer(insert_path) if insert_path else None
    root = REPO / 'assets/geography' / pid
    rel = lambda p: p.relative_to(REPO).as_posix()
    qual, is_as = paper['qualification_code'], paper['is_as']
    routes = ROUTES[(qual, paper['component'])]
    group_of = {n: g for g in cand['choice_groups'] for n in g}
    rendered_figs, stems_rendered, records = {}, {}, []
    for u in publishable:
        rv = reviewed[u['label']]
        q, _, part = u['label'].partition('.')
        n, k = int(q), int(part or 0)
        primary = [leaf_id(c) for c in rv['sections']]
        crossover = [leaf_id(c) for c in rv['prerequisites'] if leaf_id(c) not in primary]
        if any(t not in leaves for t in primary + crossover):
            raise ValueError(f"{u['label']}: invalid tags")
        name = f'Q{n:02}_P{k:02}'
        image, scheme_image = root / f'{name}.webp', root / f'{name}_scheme.webp'
        qr.render(u['regions'], image)
        sr.render(schemes[u['label']], scheme_image)
        context = {}
        if u.get('shared_stem'):
            stem = cand['stems'][u['shared_stem']]
            if q not in stems_rendered:
                target = root / f'Q{n:02}_stem.webp'
                qr.render(stem['regions'], target)
                stems_rendered[q] = rel(target)
            context['stem_image_url'] = stems_rendered[q]
        figs = []
        for e in res[u['label']]['figures']:
            if e['source'] in ('own', 'stem'):
                continue
            key = (e['source'], e['figure'])
            if key not in rendered_figs:
                target = root / f"{'INS' if e['source'] == 'insert' else 'QP'}_{slug(e['figure'])}.webp"
                (ir if e['source'] == 'insert' else qr).render(e['regions'], target)
                rendered_figs[key] = rel(target)
            figs.append({'label': e['figure'], 'image_url': rendered_figs[key],
                         'source': 'insert' if e['source'] == 'insert' else 'question_paper'})
        if figs:
            context['figures'] = figs
        year = 12 if is_as or all(t in as_shared and leaves[t].get('as_reference') for t in primary) else 13
        record = {
            'question_id': f'{pid}_Q{n:02}_P{k:02}', 'parent_question_id': f'{pid}_Q{n:02}',
            'source_type': 'real_past_paper', 'is_sample': False, 'paper_id': pid, 'subject_id': SUBJECT,
            'board': 'AQA', 'level': 'AS' if is_as else 'A-Level', 'subject': 'Geography', 'spec_code': qual,
            'qualification_code': qual, 'is_as': is_as, 'is_official_sample': bool(paper['is_sample']),
            'subject_category': 'Humanities / Mixed', 'year': paper['year'], 'series': paper['series'],
            'component': paper['component'], 'question_number': q, 'part_label': part and u['label'],
            'marks': u['marks'], 'estimated_minutes': max(1, round(u['marks'] * paper['duration_minutes'] / paper['max_marks'])),
            'difficulty': rv['difficulty'], 'introduced_year': year, 'section': u['section'],
            'route': routes[q], 'route_title': TOPIC[routes[q]],
            'primary_spec_points': primary, 'crossover_spec_points': crossover,
            'preview_text': rv['summary'], 'include_in_custom_pool': True, 'extended_response': u['marks'] >= 9,
            'content': {'question_html': '', 'question_image_url': rel(image), 'mark_scheme_html': '',
                        'mark_scheme_image_url': rel(scheme_image)},
            'scheme_scope': 'part', 'scheme_question_number': u['label'], 'context': context,
            'provenance': {'review_status': 'model_reviewed', 'reviewer_type': 'model',
                           'question_source_sha256': cand['source_sha256'], 'scheme_source_sha256': ms_sha,
                           'insert_source_sha256': paper['insert']['sha256'] if paper['insert'] else None,
                           'source_regions': u['regions'], 'scheme_regions': schemes[u['label']],
                           'original_parts': [u['label']], 'original_tariff_indices': [0],
                           'difficulty_basis': rv['difficulty_basis'],
                           'context_basis': 'shared stem and cited figures attached as unscored context' if context else 'independent',
                           'content_year_basis': 'AS 7036 unit' if is_as else ('all primary leaves are AS 7036 shared content' if year == 12 else 'assesses A-level-only content'),
                           'official_codes': rv['sections'], 'prerequisite_codes': rv['prerequisites'],
                           'qualification_code': qual, 'extraction_version': cand['extraction_version'],
                           **({'lead_note': rv['lead_note']} if rv.get('lead_note') else {})},
        }
        if u.get('multiple_choice_options'):
            record['multiple_choice'] = True
        if q in group_of:
            record['choice_group'] = group_of[q]
        records.append(record)
    ids_by_q = {}
    for r in records:
        ids_by_q.setdefault(r['question_number'], []).append(r['question_id'])
    groups = [[ids_by_q.get(x, []) for x in g] for g in cand['choice_groups']]
    # Reconcile: published marks + excluded marks must equal the cover maximum (one option per group).
    totals = {}
    for u in cand['units']:
        totals[u['question']] = totals.get(u['question'], 0) + u['marks']
    grouped = {x for g in cand['choice_groups'] for x in g}
    check = sum(m for x, m in totals.items() if x not in grouped) + sum(max(totals[x] for x in g) for g in cand['choice_groups'])
    if check != paper['max_marks'] or sum(r['marks'] for r in records) + sum(u['marks'] for u in excluded) != cand['printed_tariff_sum']:
        raise ValueError('Units do not reconcile to the booklet')
    kind = 'AS' if is_as else 'A-Level'
    title = f"{paper['series']} {paper['year']} · {kind} Paper {paper['assessment_paper']}: {paper['component_title']}"
    if paper['is_sample']:
        title = f"Official sample · {kind} Paper {paper['assessment_paper']}: {paper['component_title']}"
    runtime = {
        'paper_id': pid, 'paper_type': 'real_past_paper', 'subject_id': SUBJECT, 'board': 'AQA', 'level': kind,
        'subject': 'Geography', 'spec_code': qual, 'year': paper['year'], 'series': paper['series'],
        'paper_code': paper['component'], 'title': title, 'total_marks': paper['max_marks'],
        'duration_minutes': paper['duration_minutes'], 'qualification_code': qual, 'is_as': is_as,
        'question_ids': [r['question_id'] for r in records], 'choice_groups': [g for g in groups if sum(bool(x) for x in g) > 1],
        'choice_note': 'Optional sections: answer one question from each group; the paper total counts one of them.',
        'is_official_sample': bool(paper['is_sample']),
        'full_paper_pdf_url': docs['question_paper']['url'], 'full_mark_scheme_pdf_url': docs['mark_scheme']['url'],
        'official_source_url': docs['question_paper']['url'],
        'insert_pdf_url': paper['insert']['url'] if paper['insert'] else None,
        'examiner_report_url': docs.get('examiner_report', {}).get('url'),
    }
    if excluded:
        runtime['excluded_questions'] = [{'question_number': u['label'], 'marks': u['marks'],
                                          'reason': 'AQA removed third-party copyright material this part needs '
                                                    f"({', '.join(res[u['label']]['removed']) or 'source text'}) from the public paper, so it is incomplete."}
                                         for u in excluded]
    return {'pack_id': pid.lower(), 'papers': [runtime], 'questions': records}


def build_job(job):
    paper, research = job
    pid = paper['paper_id']
    review, cand = research / 'reviews' / f'{pid}.json', research / 'candidates' / f'{pid}.json'
    if not review.exists() or not cand.exists():
        return {'paper_id': pid, 'status': 'awaiting_review_or_source'}
    target = REPO / 'data/packs/geography' / f'{pid}.json'
    signature = hashlib.sha256(SIGNATURE + cand.read_bytes() + review.read_bytes() +
                               (REPO / 'data/specs' / f'{SUBJECT}.json').read_bytes()).hexdigest()
    try:
        if target.exists() and json.loads(target.read_text()).get('build_signature') == signature and (REPO / 'assets/geography' / pid).exists():
            return {'paper_id': pid, 'status': 'built', 'units': len(json.loads(target.read_text())['questions']), 'resumed': True}
        spec = json.loads((REPO / 'data/specs' / f'{SUBJECT}.json').read_text())
        pack = build_paper(paper, research, spec)
        registry = REPO / 'data/imports/geography/identities.json'
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
    papers = [p for q in ('7037', '7036') for p in json.loads((REPO / f'data/imports/geography/inventory/{q}-inventory.json').read_text())['papers']]
    jobs = [(p, research) for p in papers if not a.only or p['paper_id'] in a.only]
    status = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for result in pool.map(build_job, jobs):
            status.append(result)
            print(result, flush=True)
    write_json(REPO / 'data/imports/geography/build-status.json', status)
    print('Built', sum(s['status'] == 'built' for s in status), 'of', len(status))


if __name__ == '__main__':
    main()
