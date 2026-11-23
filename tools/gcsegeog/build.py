#!/usr/bin/env python3
"""Build reviewed, reconciled, source-rendered AQA GCSE Geography 8035 packs.

Usage: build.py --research DIR [--only PAPER ...]
  DIR holds sources/, candidates/ (extract.py) and reviews/ (reviews.py compile).

One scored unit per printed part (SPaG marks are folded into the part they belong to). Unscored
context is attached visibly and never counted: the question's shared stem and every figure the unit
cites that is not already in its own crop (Paper 3 resources booklet figures, OS map keys and colour
inserts, or figures printed with an earlier part). Units that cite copyright-removed material are
excluded and listed on the paper. Optional questions form choice groups of whole options with a
choose count (Paper 1 Section C: two of three; Paper 2 Section C: Question 3 plus one of 4, 5, 6), so
the booklet still reconciles to its cover maximum. Images are lossless source pixels.

GCSE Geography has no tiers, no AS and no reviewed content year, so none is recorded.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'physics'))
sys.path.insert(0, str(HERE))
from render import SourceRenderer  # noqa: E402
from schemes import scheme_regions  # noqa: E402
from resolve import resolve, paper_index  # noqa: E402
from reviews import route_of, leaf_id, papers as importable_papers  # noqa: E402

SUBJECT = 'AQA_GCSE_GEOG_8035'
SIGNATURE = b'gcsegeog-build-v1'
REPO = HERE.parents[1]
NUMBER = {1: 'one', 2: 'two', 3: 'three'}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def slug(name):
    return re.sub(r'[^A-Za-z0-9]+', '_', name.replace('Figure ', 'FIG').replace('Table ', 'TAB')).strip('_')


def part_id(paper_id, label):
    question, _, part = label.partition('.')
    return f'{paper_id}_Q{int(question):02}_P{int(part or 0):02}'


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
    idx, roles, resource_docs = paper_index(paper, sources)
    for d in resource_docs:
        if sha(sources / d['file_name']) != d['sha256']:
            raise ValueError(f"Resource source revision mismatch: {d['file_name']}")
    res = resolve(cand, idx, roles)
    excluded = [u for u in cand['units'] if res[u['label']]['removed'] or res[u['label']]['text_removed']]
    ex_labels = {u['label'] for u in excluded}
    if any(r['unresolved'] for l, r in res.items() if l not in ex_labels):
        raise ValueError('Unresolved figure citations')
    reviewed = {u['label']: u for u in review['units']}
    publishable = [u for u in cand['units'] if u['label'] not in ex_labels]
    if set(reviewed) != {u['label'] for u in publishable}:
        raise ValueError('Reviews must cover exactly the publishable units')
    leaves = {p['id']: p for s in spec['sections'] for t in s['topics'] for p in t['points']}
    schemes = scheme_regions(ms, [u['label'] for u in cand['units']])
    qr, sr = SourceRenderer(qp), SourceRenderer(ms)
    rr = {d['file_name']: SourceRenderer(sources / d['file_name']) for d in resource_docs}
    root = REPO / 'assets/gcsegeog' / pid
    rel = lambda p: p.relative_to(REPO).as_posix()
    qual = paper['qualification_code']
    member = lambda x: x if isinstance(x, list) else [x]   # an option is one question or a list of them
    group_of = {n: g for g in cand['choice_groups'] for x in g for n in member(x)}
    rendered_figs, stems_rendered, records = {}, {}, []
    for u in publishable:
        rv = reviewed[u['label']]
        q, _, part = u['label'].partition('.')
        n, k = int(q), int(part or 0)
        route = route_of(paper, u)
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
                target = root / f"{ {'insert': 'INS', 'resource_booklet': 'RES'}.get(e['source'], 'QP') }_{slug(e['figure'])}.webp"
                (rr[e['file']] if e['file'] else qr).render(e['regions'], target)
                if any(r.get('rotate') for r in e['regions']):
                    from PIL import Image
                    turned = Image.open(target).convert('RGB').rotate(-90, expand=True)   # sideways landscape page, read clockwise
                    turned.save(target, lossless=True)
                rendered_figs[key] = rel(target)
            figs.append({'label': e['figure'], 'image_url': rendered_figs[key],
                         'source': e['source'] if e['source'] in ('insert', 'resource_booklet') else 'question_paper'})
        if figs:
            context['figures'] = figs
        record = {
            'question_id': part_id(pid, u['label']), 'parent_question_id': f'{pid}_Q{n:02}',
            'source_type': 'real_past_paper', 'is_sample': False, 'paper_id': pid, 'subject_id': SUBJECT,
            'board': 'AQA', 'level': 'GCSE', 'subject': 'Geography', 'spec_code': qual,
            'qualification_code': qual, 'is_as': False, 'is_official_sample': bool(paper['is_sample']),
            'subject_category': 'Humanities / Mixed', 'year': paper['year'], 'series': paper['series'],
            'component': paper['component'], 'question_number': q, **({'part_label': u['label']} if part else {}),
            'marks': u['marks'], 'estimated_minutes': max(1, round(u['marks'] * paper['duration_minutes'] / paper['max_marks'])),
            'difficulty': rv['difficulty'], 'section': u['section'],
            'route': route[0], 'route_title': route[2],
            'primary_spec_points': primary, 'crossover_spec_points': crossover,
            'preview_text': rv['summary'], 'include_in_custom_pool': True, 'extended_response': u['marks'] >= 6,
            'content': {'question_html': '', 'question_image_url': rel(image), 'mark_scheme_html': '',
                        'mark_scheme_image_url': rel(scheme_image)},
            'scheme_scope': 'part', 'scheme_question_number': u['label'], 'context': context,
            'provenance': {'review_status': 'model_reviewed', 'reviewer_type': 'model',
                           'question_source_sha256': cand['source_sha256'], 'scheme_source_sha256': ms_sha,
                           'resource_source_sha256': {d['file_name']: d['sha256'] for d in resource_docs},
                           'source_regions': u['regions'], 'scheme_regions': schemes[u['label']],
                           'original_parts': [u['label']], 'original_tariff_indices': [0],
                           'difficulty_basis': rv['difficulty_basis'],
                           'context_basis': 'shared stem and cited figures attached as unscored context' if context else 'independent',
                           'official_codes': rv['sections'], 'prerequisite_codes': rv['prerequisites'],
                           'qualification_code': qual, 'extraction_version': cand['extraction_version'],
                           **({'spag_marks_included': u['spag_marks']} if u.get('spag_marks') else {}),
                           **({'lead_note': rv['lead_note']} if rv.get('lead_note') else {})},
        }
        dependencies = [part_id(pid, label) for label in res[u['label']].get('dependencies', [])]
        if dependencies:
            record['depends_on_question_ids'] = dependencies
            record['provenance']['reviewed_dependencies'] = dependencies
            if not context:
                record['provenance']['context_basis'] = 'grouped_dependency'
        if u.get('multiple_choice_options'):
            record['multiple_choice'] = True
        if u.get('spag_marks'):
            record['spag_marks'] = u['spag_marks']
        if q in group_of:
            record['choice_group'] = group_of[q]
        records.append(record)
    ids_by_q = {}
    for r in records:
        ids_by_q.setdefault(r['question_number'], []).append(r['question_id'])
    pairs = [([[i for n in member(x) for i in ids_by_q.get(n, [])] for x in g], c)
             for g, c in zip(cand['choice_groups'], cand['choice_choose'])]
    # Reconcile: published marks + excluded marks must equal the cover maximum (choose-N options per group).
    totals = {}
    for u in cand['units']:
        totals[u['question']] = totals.get(u['question'], 0) + u['marks']
    grouped = {n for g in cand['choice_groups'] for x in g for n in member(x)}
    check = sum(m for x, m in totals.items() if x not in grouped)
    for g, c in zip(cand['choice_groups'], cand['choice_choose']):
        check += sum(sorted((sum(totals[n] for n in member(x)) for x in g), reverse=True)[:c])
    if check != paper['max_marks'] or sum(r['marks'] for r in records) + sum(u['marks'] for u in excluded) != cand['printed_tariff_sum']:
        raise ValueError('Units do not reconcile to the booklet')
    title = f"{paper['series']} {paper['year']} · Paper {paper['assessment_paper']}: {paper['component_title']}"
    if paper['is_sample']:
        title = f"Official sample · Paper {paper['assessment_paper']}: {paper['component_title']}"
    live = [(g, c) for g, c in pairs if sum(bool(x) for x in g) > 1]
    notes = []
    sec_of = {u['question']: u['section'] for u in cand['units']}
    for g, c in zip(cand['choice_groups'], cand['choice_choose']):
        if any(isinstance(x, list) for x in g):   # adapted 2022 Paper 2: whole sections, or Question 3 plus one other
            sections = list(dict.fromkeys(sec_of[member(x)[0]] for x in g))
            parts = []
            for sec in sections:
                opts = [member(x) for x in g if sec_of[member(x)[0]] == sec]
                if len(opts) == 1:
                    parts.append(f"{sec} (Question {', '.join(opts[0])})")
                else:
                    parts.append(f"{sec} (Question {opts[0][0]} and one of Questions {', '.join(o[1] for o in opts)})")
            notes.append('Answer either ' + ' or '.join(parts))
            continue
        compulsory = sorted({x for x, sec in sec_of.items() if sec == sec_of[g[0]]} - set(g), key=int)
        lead = f"{sec_of[g[0]]}: answer " + (f"Question {' and '.join(compulsory)} and " if compulsory else '')
        notes.append(f"{lead}{NUMBER.get(c, c)} of Questions {', '.join(g)}")
    runtime = {
        'paper_id': pid, 'paper_type': 'real_past_paper', 'subject_id': SUBJECT, 'board': 'AQA', 'level': 'GCSE',
        'subject': 'Geography', 'spec_code': qual, 'year': paper['year'], 'series': paper['series'],
        'paper_code': paper['component'], 'title': title, 'total_marks': paper['max_marks'],
        'duration_minutes': paper['duration_minutes'], 'qualification_code': qual, 'is_as': False,
        'question_ids': [r['question_id'] for r in records],
        'choice_groups': [g for g, _ in live], 'choice_choose': [c for _, c in live],
        'choice_note': ('Optional questions. ' + '; '.join(notes) + '. The paper total counts only the options a candidate answers.') if live else '',
        'is_official_sample': bool(paper['is_sample']),
        'full_paper_pdf_url': docs['question_paper']['url'], 'full_mark_scheme_pdf_url': docs['mark_scheme']['url'],
        'official_source_url': docs['question_paper']['url'],
        'insert_pdf_url': paper['insert']['url'] if paper['insert'] else None,
        'resource_booklet_pdf_url': paper['resource_booklet']['url'] if paper['resource_booklet'] else None,
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
    target = REPO / 'data/packs/gcsegeog' / f'{pid}.json'
    signature = hashlib.sha256(SIGNATURE + cand.read_bytes() + review.read_bytes() +
                               (REPO / 'data/specs' / f'{SUBJECT}.json').read_bytes() +
                               (REPO / 'data/imports/gcsegeog/inventory/8035-inventory.json').read_bytes() +
                               b''.join((HERE / f).read_bytes() for f in ('build.py', 'figures.py', 'resolve.py', 'schemes.py', 'reviews.py'))).hexdigest()
    try:
        if target.exists() and json.loads(target.read_text()).get('build_signature') == signature and (REPO / 'assets/gcsegeog' / pid).exists():
            return {'paper_id': pid, 'status': 'built', 'units': len(json.loads(target.read_text())['questions']), 'resumed': True}
        spec = json.loads((REPO / 'data/specs' / f'{SUBJECT}.json').read_text())
        pack = build_paper(paper, research, spec)
        registry = REPO / 'data/imports/gcsegeog/identities.json'
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
        import traceback
        return {'paper_id': pid, 'status': 'needs_review', 'error': f'{type(e).__name__}: {e}', 'trace': traceback.format_exc()[-600:]}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--research', type=Path, required=True)
    ap.add_argument('--only', nargs='*')
    a = ap.parse_args()
    research = a.research.resolve()
    jobs = [(p, research) for p in importable_papers().values() if not a.only or p['paper_id'] in a.only]
    status = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for result in pool.map(build_job, jobs):
            status.append(result)
            print(result, flush=True)
    write_json(REPO / 'data/imports/gcsegeog/build-status.json', [{k: v for k, v in s.items() if k != 'trace'} for s in status])
    print('Built', sum(s['status'] == 'built' for s in status), 'of', len(status))


if __name__ == '__main__':
    main()
