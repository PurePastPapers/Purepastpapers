#!/usr/bin/env python3
"""Build reviewed, reconciled, source-rendered AQA Sociology packs (A level 7192, AS 7191).

Usage: build.py --research DIR [--only PAPER ...]
  DIR holds sources/, candidates/ (extract.py) and reviews/ (reviews.py compile).

One scored unit per printed AQA part. Unscored context is attached visibly and never
counted: the question's shared stem (for parts), the shared items the unit uses
("Read the item and then answer..."), and the crops of earlier questions whose scenario
it continues. A unit that builds on an earlier answer records depends_on_question_ids
and shows that question. Sociology "Item" texts sit inside each question, so they are
part of the unit's own crop. Paper 2 option units outside the owner's route are listed on
the paper, so the booklet still reconciles to its printed tariffs. Images are lossless source pixels.

Content year: AS units are Year 12. An A-level unit is Year 12 only when every primary
leaf is content AS 7191 shares (co-teachable AS content); otherwise Year 13. This is an
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
sys.path.insert(0, str(HERE.parent / 'parts'))
sys.path.insert(0, str(HERE))
from render import SourceRenderer  # noqa: E402
from source_reviews import apply_scenarios, load_source_review, reviewed_dependencies  # noqa: E402
from schemes import scheme_regions  # noqa: E402
from reviews import ROUTE_TOPICS, leaf_id, route_of  # noqa: E402

SUBJECT = 'AQA_ALEVEL_SOC_7192'
SIGNATURE = b'sociology-build-v1'
REPO = HERE.parents[1]
SCENARIO_REVIEW = REPO / 'data/imports/sociology/scenario-context.json'
OPTION_TITLE = {v: k[0].upper() + k[1:] for k, v in ROUTE_TOPICS.items()}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def qname(label):
    q, _, part = label.partition('.')
    return f'Q{int(q):02}_P{int(part or 0):02}'


def nice(label):
    q, _, part = label.partition('.')
    return f'{int(q):02}' + (f'.{part}' if part else '')


def serves_text(serves):
    names = [nice(s) for s in serves]
    if len(names) == 1:
        return f'Question {names[0]}'
    return f"Questions {', '.join(names[:-1])} and {names[-1]}"


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
    scenario_review = load_source_review(SCENARIO_REVIEW, pid, cand['source_sha256'])
    scenarios = scenario_review.get('questions', {})
    source_corrections = scenario_review.get('source_regions', {})
    ms_sha = sha(ms)
    if ms_sha != docs['mark_scheme']['sha256']:
        raise ValueError('Scheme source revision mismatch')
    units = {u['label']: u for u in cand['units']}
    order = list(units)
    items = {it['id']: it for it in cand['items']}
    out_of_route = [u for u in cand['units'] if route_of(paper, u) is False]
    reviewed = {r['label']: r for r in review['units']}
    in_route = [u for u in cand['units'] if route_of(paper, u) is not False]
    if set(reviewed) != {u['label'] for u in in_route}:
        raise ValueError('Reviews must cover exactly the in-route units')
    removed = [u for u in in_route if 'excluded' in reviewed[u['label']]]
    publishable = [u for u in in_route if 'excluded' not in reviewed[u['label']]]
    pub_labels = {u['label'] for u in publishable}
    leaves = {p['id']: p for s in spec['sections'] for t in s['topics'] for p in t['points']}
    as_shared = set(spec['as_section_map'].values())
    schemes = scheme_regions(ms, order, marks={l: units[l]['marks'] for l in order})
    qr, sr = SourceRenderer(qp), SourceRenderer(ms)
    root = REPO / 'assets/sociology' / pid
    rel = lambda p: p.relative_to(REPO).as_posix()
    qual, is_as = paper['qualification_code'], paper['is_as']
    rendered, records = {}, []
    # A question that builds on other questions' answers is grouped with them (one parent,
    # numbered from the earliest), so dependencies stay within one parent group.
    grp = {u['label']: u['label'] for u in publishable}
    find = lambda x: x if grp[x] == x else find(grp[x])
    for u in publishable:
        for d in reviewed_dependencies(reviewed[u['label']].get('depends_on', []), scenarios.get(u['label'], {})):
            if d in grp:
                a, b = sorted((find(d), find(u['label'])), key=order.index)
                grp[b] = a
    parent_q = {l: int(find(l).partition('.')[0]) for l in grp}

    def put(name, regions):
        if name not in rendered:
            target = root / f'{name}.webp'
            qr.render(regions, target)
            rendered[name] = rel(target)
        return rendered[name]

    for u in publishable:
        rv = reviewed[u['label']]
        q, _, part = u['label'].partition('.')
        name = qname(u['label'])
        primary = [leaf_id(c) for c in rv['sections']]
        crossover = [leaf_id(c) for c in rv['prerequisites'] if leaf_id(c) not in primary]
        if any(t not in leaves for t in primary + crossover):
            raise ValueError(f"{u['label']}: invalid tags")
        image, scheme_image = root / f'{name}.webp', root / f'{name}_scheme.webp'
        source_regions = source_corrections.get(u['label'], u['regions'])
        qr.render(source_regions, image)
        sr.render(schemes[u['label']], scheme_image)
        context, figs, reasons = {}, [], []
        if u.get('shared_stem'):
            context['stem_image_url'] = put(f'Q{int(q):02}_stem', cand['stems'][u['shared_stem']]['regions'])
            reasons.append('shared question stem')
        for iid in rv.get('items', u.get('items', [])):
            it = items[iid]
            figs.append({'label': f'Shared information printed before Question {nice(it["serves"][0])}', 'source': 'question_paper',
                         'image_url': put(f'ITEM_{iid[4:]}', it['regions'])})
            reasons.append(f'shared item {iid}')
        reviewed_context = scenarios.get(u['label'], {})
        deps = reviewed_dependencies(rv.get('depends_on', []), reviewed_context)
        if any(d not in pub_labels for d in deps):
            raise ValueError(f"{u['label']}: depends on an unpublished unit {deps}")
        ctx_units = rv.get('context_units', u.get('context_units', []))
        for c in sorted((set(ctx_units) - reviewed_context.keys()) | set(deps), key=order.index):
            if order.index(c) >= order.index(u['label']):
                raise ValueError(f"{u['label']}: context {c} is not earlier")
            figs.append({'label': f'Question {nice(c)}' + (' (your answer to it is needed here)' if c in deps else ' (this question continues its scenario)'),
                         'source': 'question_paper', 'image_url': put(f'{qname(c)}_ctx', source_corrections.get(c, units[c]['regions']))})
            reasons.append(f'earlier question {c}' + (' answer dependency' if c in deps else ' scenario'))
        apply_scenarios(reviewed_context, context, figs, reasons, put, qname)
        if figs:
            context['figures'] = figs
        if deps:
            context['shared_stem_html'] = (f"<p>This question builds on your answer to {serves_text(deps)}, "
                                           'shown below. Answer that first.</p>')
        year = 12 if is_as or all(t in as_shared and leaves[t].get('as_reference') for t in primary) else 13
        route = route_of(paper, u)
        record = {
            'question_id': f'{pid}_{name}', 'parent_question_id': f'{pid}_Q{parent_q[u["label"]]:02}',
            'source_type': 'real_past_paper', 'is_sample': False, 'paper_id': pid, 'subject_id': SUBJECT,
            'board': 'AQA', 'level': 'AS' if is_as else 'A-Level', 'subject': 'Sociology', 'spec_code': qual,
            'qualification_code': qual, 'is_as': is_as, 'is_official_sample': bool(paper['is_sample']),
            'subject_category': 'Humanities (Essay)', 'year': paper['year'], 'series': paper['series'],
            'component': paper['component'], 'question_number': q,
            'marks': u['marks'], 'estimated_minutes': max(1, round(u['marks'] * paper['duration_minutes'] / paper['max_marks'])),
            'difficulty': rv['difficulty'], 'introduced_year': year, 'section': u['section'],
            'primary_spec_points': primary, 'crossover_spec_points': crossover,
            'preview_text': rv['summary'], 'include_in_custom_pool': True, 'extended_response': u['marks'] >= 8,
            'content': {'question_html': '', 'question_image_url': rel(image), 'mark_scheme_html': '',
                        'mark_scheme_image_url': rel(scheme_image)},
            'scheme_scope': 'part', 'scheme_question_number': u['label'], 'context': context,
            'provenance': {'review_status': 'model_reviewed', 'reviewer_type': 'model',
                           'question_source_sha256': cand['source_sha256'], 'scheme_source_sha256': ms_sha,
                           'source_regions': source_regions, 'scheme_regions': schemes[u['label']],
                           'scheme_ao_marks': schemes.get(u['label'] + '#ao'),
                           'original_parts': [u['label']], 'original_tariff_indices': [0],
                           'difficulty_basis': rv['difficulty_basis'],
                           'context_basis': ('unscored context: ' + ', '.join(reasons)) if reasons else 'independent',
                           'content_year_basis': 'AS 7191 unit' if is_as else ('all primary leaves are AS 7191 shared content' if year == 12 else 'assesses A-level-only content'),
                           'specification_version': 'AQA 7191/7192 Version 1.2 (14 October 2021)',
                           **({'scenario_context_review': reviewed_context} if reviewed_context else {}),
                           'official_codes': rv['sections'], 'prerequisite_codes': rv['prerequisites'],
                           'qualification_code': qual, 'extraction_version': cand['extraction_version'],
                           **({'lead_note': rv['lead_note']} if rv.get('lead_note') else {})},
        }
        if part or parent_q[u['label']] != int(q):
            record['part_label'] = u['label']
        if route:
            record['route'], record['route_title'] = route, OPTION_TITLE[route]
        if deps:
            record['depends_on_question_ids'] = [f'{pid}_{qname(d)}' for d in deps]
        if u.get('multiple_choice_options'):
            record['multiple_choice'] = True
        records.append(record)
    # Reconcile: every printed unit is published, excluded or out of route; the cover maximum counts one option per section.
    if (sum(r['marks'] for r in records) + sum(u['marks'] for u in removed + out_of_route)) != cand['printed_tariff_sum']:
        raise ValueError('Units do not reconcile to the booklet')
    totals = cand['question_totals']
    grouped = {x for g in cand['choice_groups'] for m in g['members'] for x in m}
    check = sum(m for x, m in totals.items() if x not in grouped) + sum(max(sum(totals[x] for x in m) for m in g['members']) for g in cand['choice_groups'])
    if check != paper['max_marks']:
        raise ValueError('Cover maximum does not reconcile')
    kind = 'AS' if is_as else 'A-Level'
    title = f"{paper['series']} {paper['year']} · {kind} Paper {paper['assessment_paper']}: {paper['component_title']}"
    if paper['is_sample']:
        title = f"Official specimen · {kind} Paper {paper['assessment_paper']}: {paper['component_title']}"
    runtime = {
        'paper_id': pid, 'paper_type': 'real_past_paper', 'subject_id': SUBJECT, 'board': 'AQA', 'level': kind,
        'subject': 'Sociology', 'spec_code': qual, 'year': paper['year'], 'series': paper['series'],
        'paper_code': paper['component'], 'title': title, 'total_marks': paper['max_marks'],
        'duration_minutes': paper['duration_minutes'], 'qualification_code': qual, 'is_as': is_as,
        'question_ids': [r['question_id'] for r in records], 'choice_groups': [],
        'is_official_sample': bool(paper['is_sample']),
        'full_paper_pdf_url': docs['question_paper']['url'], 'full_mark_scheme_pdf_url': docs['mark_scheme']['url'],
        'official_source_url': docs['question_paper']['url'],
        'examiner_report_url': (docs.get('examiner_report') or {}).get('url'),
    }
    if cand['choice_groups']:
        runtime['choice_note'] = ('Each optional section offers several topics; this bank publishes the route topics: '
                                  + ('Families and households.' if is_as else 'Families and households (Section A) and Beliefs in society (Section B).'))
    excluded = [{'question_number': u['label'], 'marks': u['marks'], 'reason_type': 'removed_from_specification',
                 'reason': reviewed[u['label']]['excluded'][0].upper() + reviewed[u['label']]['excluded'][1:] + '.'} for u in removed]
    excluded += [{'question_number': u['label'], 'marks': u['marks'], 'reason_type': 'option_not_in_route',
                  'reason': f"Optional topic {u['topic']} is not in this school's Paper 2 route."} for u in out_of_route]
    if excluded:
        runtime['excluded_questions'] = sorted(excluded, key=lambda e: order.index(e['question_number']))
    return {'pack_id': pid.lower(), 'papers': [runtime], 'questions': records}


def build_job(job):
    paper, research = job
    pid = paper['paper_id']
    review, cand = research / 'reviews' / f'{pid}.json', research / 'candidates' / f'{pid}.json'
    if not review.exists() or not cand.exists():
        return {'paper_id': pid, 'status': 'awaiting_review_or_source'}
    target = REPO / 'data/packs/sociology' / f'{pid}.json'
    signature = hashlib.sha256(SIGNATURE + cand.read_bytes() + review.read_bytes() + Path(__file__).read_bytes() + (HERE / 'schemes.py').read_bytes() +
                               SCENARIO_REVIEW.read_bytes() + (REPO / 'data/specs' / f'{SUBJECT}.json').read_bytes()).hexdigest()
    try:
        if target.exists() and json.loads(target.read_text()).get('build_signature') == signature and (REPO / 'assets/sociology' / pid).exists():
            return {'paper_id': pid, 'status': 'built', 'units': len(json.loads(target.read_text())['questions']), 'resumed': True}
        spec = json.loads((REPO / 'data/specs' / f'{SUBJECT}.json').read_text())
        pack = build_paper(paper, research, spec)
        registry = REPO / 'data/imports/sociology/identities.json'
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
    papers = [p for q in ('7192', '7191') for p in json.loads((REPO / f'data/imports/sociology/inventory/{q}-inventory.json').read_text())['papers']]
    jobs = [(p, research) for p in papers if not a.only or p['paper_id'] in a.only]
    status = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for result in pool.map(build_job, jobs):
            status.append(result)
            print(result, flush=True)
    if not a.only:
        write_json(REPO / 'data/imports/sociology/build-status.json', status)
    print('Built', sum(s['status'] == 'built' for s in status), 'of', len(status))


if __name__ == '__main__':
    main()
