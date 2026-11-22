#!/usr/bin/env python3
"""Build reviewed, reconciled, source-rendered Pearson English Literature packs (A level
9ET0, AS 8ET0).

Usage: build.py --research DIR [--only PAPER ...]
  DIR holds sources/, candidates/ (extract.py) and reviews/ (reviews.py compile).

One scored unit per printed essay question on the owner's route texts (Othello, A
Streetcar Named Desire, Science and Society, Poems of the Decade, The Romantics). Each
pair of route questions ("EITHER ... OR") is a choice group, so a booklet reconciles to
its cover total by counting one question per section. Questions on other texts are
listed as option_not_in_route; a question naming a poem no longer on the prescribed list
is listed as removed_from_specification. Unscored context, shown visibly and never
counted: the prose theme's text list or the poetry collection's prescribed-text heading,
and for A-level Paper 3 Section A the Source Booklet pages printing the unseen poem and
the named anthology poem. The scheme image is the question's own indicative content
followed by the levels grid(s) Pearson prints for it. Images are lossless source pixels.

Content year: AS units are Year 12. An A-level unit is Year 12 only when every primary
leaf is a set text AS 8ET0 shares (co-teachable content); otherwise Year 13.
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
from extract import romantics_rubric  # noqa: E402

SUBJECT = 'EDX_ALEVEL_ENGLIT_9ET0'
SIGNATURE = b'englit-build-v1'
REPO = HERE.parents[1]
ROUTE_TITLE = {'A': 'Othello', 'B': 'A Streetcar Named Desire', 'P': 'Science and Society',
               'PD': 'Poems of the Decade', 'R': 'The Romantics'}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def other_text(heading):
    lines = [l for l in heading.splitlines() if l.strip() and l.strip() not in ('Texts', 'Prescribed text', 'Prescribed texts')]
    return lines[0] if lines else 'another text'


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
    questions = {q['number']: q for q in cand['questions']}
    order = list(questions)
    reviewed = {u['number']: u for u in review['units']}
    route = [q for q in cand['questions'] if q['route']]
    if set(reviewed) != {q['number'] for q in route}:
        raise ValueError('Reviews must cover exactly the route questions')
    removed = [q for q in route if 'excluded' in reviewed[q['number']] or q.get('copyright_removed_content')]
    publishable = [q for q in route if q not in removed]
    leaves = {p['id']: p for s in spec['sections'] for t in s['topics'] for p in t['points']}
    as_shared = set(spec['as_section_map'].values())
    schemes = scheme_regions(ms, [q['number'] for q in publishable])
    qr, sr = SourceRenderer(qp), SourceRenderer(ms)
    root = REPO / 'assets/englit' / pid
    rel = lambda p: p.relative_to(REPO).as_posix()
    qual, is_as = paper['qualification_code'], paper['is_as']
    rendered, records = {}, []
    rubric_regions = None

    def put(name, regions):
        if name not in rendered:
            target = root / f'{name}.webp'
            qr.render(regions, target)
            rendered[name] = rel(target)
        return rendered[name]

    for q in publishable:
        rv = reviewed[q['number']]
        n = int(q['number'])
        primary, crossover = list(rv['spec_ids']), [x for x in rv['related_spec_ids'] if x not in rv['spec_ids']]
        if not primary or any(t not in leaves for t in primary + crossover):
            raise ValueError(f"Q{n}: invalid tags")
        image, scheme_image = root / f'Q{n:02}_U01.webp', root / f'Q{n:02}_U01_scheme.webp'
        qr.render(q['regions'], image)
        scheme = schemes[q['number']]
        sr.render(scheme['indicative'] + scheme['grid'], scheme_image)
        context, reasons = {}, []
        if q['route'] in ('P', 'R') and q['heading_regions']:
            context['stem_image_url'] = put(f"HEAD_{q['route']}", q['heading_regions'])
            reasons.append('set-text heading printed above the question')
        if q['route'] == 'R':
            if rubric_regions is None:
                import pdfplumber
                with pdfplumber.open(qp) as pdf:
                    rubric_regions = romantics_rubric(pdf, q['heading_regions'][0]['page'])
            context['figures'] = [{'label': 'Official choice and prescribed poem instructions',
                                   'source': 'question_paper',
                                   'image_url': put('HEAD_R_instructions', rubric_regions)}]
            reasons.append('printed choice and prescribed poem instructions')
        if q.get('context_regions'):
            pages = q['context_pages']
            label = f"Source Booklet page{'s' if len(pages) > 1 else ''} {', '.join(map(str, pages))}: the unseen poem and {', '.join(q['named_poems'])}"
            context['figures'] = [{'label': label, 'source': 'question_paper', 'image_url': put(f'Q{n:02}_booklet', q['context_regions'])}]
            reasons.append('Source Booklet poems')
        year = 12 if is_as or all(t in as_shared for t in primary) else 13
        record = {
            'question_id': f'{pid}_Q{n:02}_U01', 'parent_question_id': f'{pid}_Q{n:02}',
            'source_type': 'real_past_paper', 'is_sample': False, 'paper_id': pid, 'subject_id': SUBJECT,
            'board': 'Edexcel', 'level': 'AS' if is_as else 'A-Level', 'subject': 'English Literature', 'spec_code': qual,
            'qualification_code': qual, 'is_as': is_as, 'is_official_sample': bool(paper['is_sample']),
            'subject_category': 'Humanities (Essay)', 'year': paper['year'], 'series': paper['series'],
            'component': paper['component'], 'question_number': q['number'], 'marks': q['marks'],
            'estimated_minutes': max(1, round(q['marks'] * paper['duration_minutes'] / paper['max_marks'])),
            'difficulty': rv['difficulty'], 'introduced_year': year, 'section': f"Section {q['section']}",
            'route': q['route'], 'route_title': ROUTE_TITLE[q['route']],
            'primary_spec_points': primary, 'crossover_spec_points': crossover,
            'preview_text': rv['summary'], 'include_in_custom_pool': True, 'extended_response': True,
            'content': {'question_html': '', 'question_image_url': rel(image), 'mark_scheme_html': '',
                        'mark_scheme_image_url': rel(scheme_image)},
            'scheme_scope': 'full_question', 'scheme_question_number': q['number'], 'context': context,
            'provenance': {'review_status': 'model_reviewed', 'reviewer_type': 'model',
                           'question_source_sha256': cand['source_sha256'], 'scheme_source_sha256': ms_sha,
                           'source_regions': q['regions'], 'scheme_regions': scheme['indicative'] + scheme['grid'],
                           'scheme_indicative_regions': scheme['indicative'], 'scheme_grid_regions': scheme['grid'],
                           'booklet_regions': q.get('context_regions', []), 'original_parts': [q['number']],
                           **({'rubric_regions': rubric_regions} if q['route'] == 'R' else {}),
                           'original_tariff_indices': [0], 'difficulty_basis': rv['difficulty_basis'],
                           'context_basis': ('unscored context: ' + ', '.join(reasons)) if reasons else 'independent',
                           'content_year_basis': 'AS 8ET0 unit' if is_as else ('every primary leaf is an AS 8ET0 set text' if year == 12 else 'assesses A-level-only content'),
                           'specification_version': 'Pearson 9ET0 Issue 11 (August 2025); 8ET0 Issue 8 (September 2023)',
                           'official_codes': rv['codes'], 'related_codes': rv['related_codes'],
                           'qualification_code': qual, 'extraction_version': cand['extraction_version']},
        }
        records.append(record)
    by_number = {r['question_number']: r for r in records}
    groups = [[by_number[x]['question_id'] for x in g['members'] if x in by_number] for g in cand['route_groups']]
    groups = [g for g in groups if g]
    # Reconcile: every printed question is published, removed or out of route; the cover total counts one per section.
    out_of_route = [q for q in cand['questions'] if not q['route']]
    if sum(r['marks'] for r in records) + sum(q['marks'] for q in removed + out_of_route) != cand['printed_tariff_sum']:
        raise ValueError('Units do not reconcile to the booklet')
    idmap = {r['question_id']: r for r in records}
    effective = sum(max(idmap[x]['marks'] for x in g) for g in groups)
    sections_published = {idmap[g[0]]['section'] for g in groups}
    if effective != paper['max_marks'] or len(sections_published) != len({q['section'] for q in cand['questions']}):
        raise ValueError(f'Published choice groups give {effective}, cover total {paper["max_marks"]}')
    for r in records:
        r['choice_group'] = next(g for g in groups if r['question_id'] in g)
    kind = 'AS' if is_as else 'A-Level'
    title = f"{paper['series']} {paper['year']} · {kind} Paper {paper['assessment_paper']}: {paper['component_title']}"
    runtime = {
        'paper_id': pid, 'paper_type': 'real_past_paper', 'subject_id': SUBJECT, 'board': 'Edexcel', 'level': kind,
        'subject': 'English Literature', 'spec_code': qual, 'year': paper['year'], 'series': paper['series'],
        'paper_code': paper['component'], 'title': title, 'total_marks': paper['max_marks'],
        'duration_minutes': paper['duration_minutes'], 'qualification_code': qual, 'is_as': is_as,
        'question_ids': [r['question_id'] for r in records], 'choice_groups': [g for g in groups if len(g) > 1],
        'choice_note': 'Answer one question on your studied text in each section; the paper total counts one of each pair. '
                       'This bank publishes the questions on your route texts.',
        'is_official_sample': bool(paper['is_sample']),
        'full_paper_pdf_url': docs['question_paper']['url'], 'full_mark_scheme_pdf_url': docs['mark_scheme']['url'],
        'official_source_url': docs['question_paper']['url'],
        'examiner_report_url': (docs.get('examiner_report') or {}).get('url'),
    }
    excluded = [{'question_number': q['number'], 'marks': q['marks'], 'reason_type': 'removed_from_specification',
                 'reason': (reviewed[q['number']].get('excluded') or 'Pearson removed the poem from the public booklet')[0].upper()
                 + (reviewed[q['number']].get('excluded') or 'Pearson removed the poem from the public booklet')[1:] + '.'} for q in removed]
    excluded += [{'question_number': q['number'], 'marks': q['marks'], 'reason_type': 'option_not_in_route',
                  'reason': f"{other_text(q['heading'])} is not one of this school's set texts."} for q in out_of_route]
    if excluded:
        runtime['excluded_questions'] = sorted(excluded, key=lambda e: order.index(e['question_number']))
    return {'pack_id': pid.lower(), 'papers': [runtime], 'questions': records}


def build_job(job):
    paper, research = job
    pid = paper['paper_id']
    review, cand = research / 'reviews' / f'{pid}.json', research / 'candidates' / f'{pid}.json'
    if not review.exists() or not cand.exists():
        return {'paper_id': pid, 'status': 'awaiting_review_or_source'}
    target = REPO / 'data/packs/englit' / f'{pid}.json'
    signature = hashlib.sha256(SIGNATURE + cand.read_bytes() + review.read_bytes() + Path(__file__).read_bytes() +
                               (HERE / 'extract.py').read_bytes() + (HERE / 'schemes.py').read_bytes() +
                               (REPO / 'data/specs' / f'{SUBJECT}.json').read_bytes()).hexdigest()
    try:
        if target.exists() and json.loads(target.read_text()).get('build_signature') == signature and (REPO / 'assets/englit' / pid).exists():
            return {'paper_id': pid, 'status': 'built', 'units': len(json.loads(target.read_text())['questions']), 'resumed': True}
        spec = json.loads((REPO / 'data/specs' / f'{SUBJECT}.json').read_text())
        pack = build_paper(paper, research, spec)
        registry = REPO / 'data/imports/englit/identities.json'
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
    papers = [p for q in ('9et0', '8et0') for p in json.loads((REPO / f'data/imports/englit/inventory/{q}-inventory.json').read_text())['papers']]
    jobs = [(p, research) for p in papers if not a.only or p['paper_id'] in a.only]
    status = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for result in pool.map(build_job, jobs):
            status.append(result)
            print(result, flush=True)
    if not a.only:
        write_json(REPO / 'data/imports/englit/build-status.json', status)
    print('Built', sum(s['status'] == 'built' for s in status), 'of', len(status))


if __name__ == '__main__':
    main()
