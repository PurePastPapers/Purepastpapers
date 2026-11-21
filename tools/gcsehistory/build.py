#!/usr/bin/env python3
"""Build reviewed, reconciled, source-rendered Pearson GCSE History 1HI0 packs.

Usage: build.py --research DIR [--only PAPER ...]
  DIR holds sources/, candidates/ (extract.py) and reviews/ (reviews.py compile).

One scored unit per printed part with its own tariff ("1", "2(a)", "1(c)(i)"). Optional parts keep
their choice group, so each booklet reconciles to its option maximum (10: 52, B1: 32, 31: 52): one
part per choice group. A part that names Source B or Interpretation 1 carries those items of the
Sources booklet as unscored context (context.figures, shown before the part and labelled as
unscored). A part whose booklet item had third-party material removed is excluded and recorded,
never redrawn. The scheme image is the part's own table (target, level descriptors or marking
instructions, indicative content; plus the SPaG table for 5/6 and 3(d)). Images are lossless
source pixels.
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

SUBJECT = 'EDX_GCSE_HIST_1HI0'
SIGNATURE = b'gcsehistory-build-v1'
REPO = HERE.parents[1]
TITLES = {'10': 'Paper 1: Crime and punishment in Britain, c1000–present, with Whitechapel, c1870–c1900',
          'B1': 'Paper 2, Booklet B1: Anglo-Saxon and Norman England, c1060–88',
          '31': 'Paper 3: Weimar and Nazi Germany, 1918–39'}
MAXIMUM = {'10': 52, 'B1': 32, '31': 52}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def slug(label):
    q, *rest = label.replace(')', '').split('(')
    return f'Q{int(q):02}' + ''.join(f'_{x}' for x in rest)


def ctx_name(key):
    return 'CTX_' + key.replace(' ', '_')


def build_paper(paper, research, leaves):
    pid = paper['paper_id']
    cand = json.loads((research / 'candidates' / f'{pid}.json').read_text())
    review = json.loads((research / 'reviews' / f'{pid}.json').read_text())
    docs = paper['documents']
    qp, ms = research / 'sources' / docs['question_paper']['file_name'], research / 'sources' / docs['mark_scheme']['file_name']
    if review.get('reviewer_type') != 'model':
        raise ValueError('Review must be labelled as a model review')
    if review['source_sha256'] != cand['source_sha256'] or sha(qp) != cand['source_sha256'] or cand['source_sha256'] != docs['question_paper']['sha256']:
        raise ValueError('Question source revision mismatch')
    if cand['exceptions'] or cand['total_marks'] != paper['max_marks'] or MAXIMUM[paper['component']] != paper['max_marks']:
        raise ValueError('Extraction exceptions or total mismatch')
    ms_sha = sha(ms)
    if ms_sha != docs['mark_scheme']['sha256']:
        raise ValueError('Scheme source revision mismatch')
    excluded = [u for u in cand['units'] if u.get('copyright_removed_content')]
    publishable = [u for u in cand['units'] if not u.get('copyright_removed_content')]
    reviewed = {u['label']: u for u in review['units']}
    if set(reviewed) != {u['label'] for u in publishable}:
        raise ValueError(f'Reviews must cover exactly the publishable units {[u["label"] for u in publishable]}')
    schemes = scheme_regions(ms, [u['label'] for u in publishable])
    qr, sr = SourceRenderer(qp), SourceRenderer(ms)
    root = REPO / 'assets/gcsehistory' / pid
    rel = lambda p: p.relative_to(REPO).as_posix()
    group_of = {x: g for g in cand['choice_groups'] for x in g}
    id_of = lambda label: f"{pid}_{slug(label)}" + ('' if '(' in label else '_W')
    rendered, records = {}, []
    for u in publishable:
        rv = reviewed[u['label']]
        primary, crossover = list(rv['sections']), [t for t in rv['prerequisites'] if t not in rv['sections']]
        if not primary or any(t not in leaves for t in primary + crossover):
            raise ValueError(f"{u['label']}: invalid tags")
        name = slug(u['label'])
        image, scheme_image = root / f'{name}.webp', root / f'{name}_scheme.webp'
        qr.render(u['regions'], image)
        sch = schemes[u['label']]
        sr.render(sch['regions'], scheme_image)
        figures = []
        for key in u['context']:
            if key not in rendered:
                target = root / f'{ctx_name(key)}.webp'
                qr.render(cand['context_items'][key]['regions'], target)
                rendered[key] = rel(target)
            figures.append({'label': key, 'source': 'insert', 'image_url': rendered[key]})
        levels = 'Level Mark Descriptor' in sch['text'] or 'Level' in sch['text'].split('\n')[0:30].__str__()
        record = {
            'question_id': id_of(u['label']), 'parent_question_id': f"{pid}_Q{int(u['question']):02}",
            'source_type': 'real_past_paper', 'is_sample': False, 'paper_id': pid, 'subject_id': SUBJECT,
            'board': 'Edexcel', 'level': 'GCSE', 'subject': 'History', 'spec_code': '1HI0', 'qualification_code': '1HI0',
            'option': paper['component'], 'is_as': False, 'is_official_sample': False, 'subject_category': 'Humanities (Essay)',
            'year': paper['year'], 'series': paper['series'], 'component': paper['component'],
            'question_number': u['question'], **({'part_label': u['part']} if u['part'] else {}),
            'marks': u['marks'], 'estimated_minutes': max(1, round(u['marks'] * paper['duration_minutes'] / paper['max_marks'])),
            'difficulty': rv['difficulty'], 'introduced_year': 10, 'section': u['section'],
            'primary_spec_points': primary, 'crossover_spec_points': crossover,
            'preview_text': rv['summary'], 'include_in_custom_pool': True, 'extended_response': u['marks'] >= 8,
            'content': {'question_html': '', 'question_image_url': rel(image), 'mark_scheme_html': '',
                        'mark_scheme_image_url': rel(scheme_image)},
            'scheme_scope': 'part', 'scheme_question_number': u['label'], 'context': {'figures': figures} if figures else {},
            'provenance': {'review_status': 'model_reviewed', 'reviewer_type': 'model',
                           'question_source_sha256': cand['source_sha256'], 'scheme_source_sha256': ms_sha,
                           'source_regions': u['regions'], 'scheme_regions': sch['regions'],
                           'original_parts': [u['label']], 'original_tariff_indices': [0],
                           'spag_marks': u['spag_marks'], 'mark_scheme_style': 'levels of response' if levels else 'point-based',
                           'difficulty_basis': rv['difficulty_basis'],
                           'context_basis': 'Sources booklet items attached as unscored context' if figures else 'independent',
                           'official_codes': rv.get('codes', []), 'prerequisite_codes': rv.get('prerequisite_codes', []),
                           'qualification_code': '1HI0', 'extraction_version': cand['extraction_version']},
        }
        if u['label'] in group_of:
            record['choice_group'] = group_of[u['label']]
        records.append(record)
    groups = [[id_of(x) for x in g if x not in {e['label'] for e in excluded}] for g in cand['choice_groups']]
    excluded_marks = sum(e['marks'] for e in excluded)
    ids_by_label = {u['label']: u['marks'] for u in publishable}
    grouped = {x for g in cand['choice_groups'] for x in g}
    effective = sum(m for l, m in ids_by_label.items() if l not in grouped) + \
        sum(max(ids_by_label[x] for x in g if x in ids_by_label) for g in cand['choice_groups'] if any(x in ids_by_label for x in g))
    if effective != paper['max_marks'] - excluded_marks:
        raise ValueError('Published unit marks do not reconcile to the booklet')
    title = f"{paper['series']} {paper['year']} · {TITLES[paper['component']]}"
    runtime = {
        'paper_id': pid, 'paper_type': 'real_past_paper', 'subject_id': SUBJECT, 'board': 'Edexcel', 'level': 'GCSE',
        'subject': 'History', 'spec_code': '1HI0', 'year': paper['year'], 'series': paper['series'],
        'paper_code': paper['component'], 'title': title, 'total_marks': paper['max_marks'],
        'duration_minutes': paper['duration_minutes'], 'qualification_code': '1HI0', 'is_as': False,
        'imported_options': paper['imported_options'],
        'question_ids': [r['question_id'] for r in records], 'choice_groups': [g for g in groups if len(g) > 1],
        'choice_note': 'Answer one question from each choice group; the paper total counts one of them.' if cand['choice_groups'] else '',
        'is_official_sample': False, 'full_paper_pdf_url': docs['question_paper']['url'],
        'full_mark_scheme_pdf_url': docs['mark_scheme']['url'], 'official_source_url': docs['question_paper']['url'],
        'examiner_report_url': docs.get('examiner_report', {}).get('url'),
    }
    if paper['component'] == 'B1':
        runtime['booklet_note'] = 'Paper 2 is two booklets. This is booklet B (British depth study); the period-study booklet P is not included.'
    if excluded:
        runtime['excluded_questions'] = [{'question_number': e['label'], 'marks': e['marks'],
                                          'reason': 'Pearson removed third-party copyright material from the public booklet, so the question is incomplete.'}
                                         for e in excluded]
    return {'pack_id': pid.lower(), 'papers': [runtime], 'questions': records}


def build_job(job):
    paper, research = job
    pid = paper['paper_id']
    review, cand = research / 'reviews' / f'{pid}.json', research / 'candidates' / f'{pid}.json'
    if not review.exists() or not cand.exists():
        return {'paper_id': pid, 'status': 'awaiting_review_or_source'}
    target = REPO / 'data/packs/gcsehistory' / f'{pid}.json'
    spec_path = REPO / 'data/specs' / f'{SUBJECT}.json'
    signature = hashlib.sha256(SIGNATURE + cand.read_bytes() + review.read_bytes() + spec_path.read_bytes()
                               + (HERE / 'schemes.py').read_bytes()).hexdigest()
    try:
        if target.exists() and json.loads(target.read_text()).get('build_signature') == signature and (REPO / 'assets/gcsehistory' / pid).exists():
            return {'paper_id': pid, 'status': 'built', 'units': len(json.loads(target.read_text())['questions']), 'resumed': True}
        spec = json.loads(spec_path.read_text())
        leaves = {p['id'] for s in spec['sections'] for t in s['topics'] for p in t['points']}
        pack = build_paper(paper, research, leaves)
        registry = REPO / 'data/imports/gcsehistory/identities.json'
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
    papers = json.loads((REPO / 'data/imports/gcsehistory/inventory/1hi0-inventory.json').read_text())['papers']
    jobs = [(p, research) for p in papers if not a.only or p['paper_id'] in a.only]
    status = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for result in pool.map(build_job, jobs):
            status.append(result)
            print(result, flush=True)
    write_json(REPO / 'data/imports/gcsehistory/build-status.json', status)
    print('Built', sum(s['status'] == 'built' for s in status), 'of', len(status))


if __name__ == '__main__':
    main()
