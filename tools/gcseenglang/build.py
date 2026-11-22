#!/usr/bin/env python3
"""Build reviewed, source-rendered AQA GCSE English Language 8700 packs.

Usage: build.py --research DIR [--only PAPER ...]
  DIR holds sources/, candidates/ (extract.py) and reviews/ (reviews.py compile).

One scored unit per printed question (Paper 1 and Paper 2 Question 1-5; in the 2026 sample Paper 1 each
of the four one-mark multiple choice parts of Question 1 is its own unit with the shared stem attached).
Each reading question carries the pages of the source it cites ("Source A", "Source B") from the insert as
unscored context. A unit is excluded and listed when AQA removed third-party text it needs: a withdrawn
source (Questions 1, 3, 4 on Paper 1; any question citing the source on Paper 2) or a withdrawn extract
(Paper 1 Question 2). Paper 1 Question 5 keeps both tasks; if AQA removed the picture, the story option is
still complete and the unit records which option lost its picture. Images are lossless source pixels.

GCSE English Language has no tiers, no AS and no content year, so none is recorded.
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
from render import SourceRenderer  # noqa: E402

SUBJECT = 'AQA_GCSE_ENGLANG_8700'
SIGNATURE = b'gcseenglang-build-v1'
REPO = HERE.parents[1]
TITLES = {'1': 'Explorations in creative reading and writing', '2': "Writers' viewpoints and perspectives"}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def unit_id(pid, label):
    q, _, part = label.partition('.')
    return f'{pid}_Q{int(q):02}_P{int(part or 0):02}'


def exclusion(unit, comp, sources):
    """Why AQA's public files do not carry everything this unit needs, or None."""
    if unit.get('question_page_removed'):
        return 'AQA removed the whole question page (third-party copyright) from the public paper'
    removed = [s for s in unit['sources'] if sources.get(s, {}).get('removed')]
    if comp == '1' and unit['question'] == '2' and not unit['text_removed']:
        return None   # the extract is printed in the question itself
    if unit['text_removed'] and unit['question'] != '5':
        return 'AQA removed third-party text printed in this question from the public paper'
    if removed:
        return f"AQA removed Source {' and Source '.join(removed)} (third-party copyright) from the public insert"
    return None


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
    if cand['exceptions']:
        raise ValueError(f"Extraction exceptions: {cand['exceptions']}")
    ms_sha = sha(ms)
    if ms_sha != docs['mark_scheme']['sha256']:
        raise ValueError('Scheme source revision mismatch')
    ins_doc = paper['insert']
    ins_path = sources / ins_doc['file_name'] if ins_doc else None
    if ins_doc and sha(ins_path) != ins_doc['sha256']:
        raise ValueError('Insert source revision mismatch')
    comp = paper['assessment_paper']
    leaves = {p['id'] for s in spec['sections'] for t in s['topics'] for p in t['points']}
    reviewed = {u['label']: u for u in review['units']}
    excluded, publishable = [], []
    for u in cand['units']:
        reason = exclusion(u, comp, cand['sources'])
        (excluded if reason else publishable).append((u, reason))
    need = {u['label'] for u, _ in publishable}
    if not need <= set(reviewed):
        raise ValueError(f'Reviews missing for {sorted(need - set(reviewed))}')
    qr, sr = SourceRenderer(qp), SourceRenderer(ms)
    ir = SourceRenderer(ins_path) if ins_doc else None
    root = REPO / 'assets/gcseenglang' / pid
    rel = lambda p: p.relative_to(REPO).as_posix()
    qual = paper['qualification_code']
    stems_done, source_done, records = {}, {}, []
    for u, _ in publishable:
        rv = reviewed[u['label']]
        q, _, part = u['label'].partition('.')
        n, k = int(q), int(part or 0)
        primary = [i for i in rv['official_codes']]
        crossover = [f"AQA_GCSE_ENGLANG_P{comp}{'READ' if c.startswith('A') else 'WRITE'}_{c}" for c in rv['prerequisites']]
        if any(t not in leaves for t in primary + crossover):
            raise ValueError(f"{u['label']}: invalid tags")
        name = f'Q{n:02}_P{k:02}'
        image, scheme_image = root / f'{name}.webp', root / f'{name}_scheme.webp'
        qr.render(u['regions'], image)
        sr.render(u['scheme_regions'], scheme_image)
        context, figs = {}, []
        if u.get('shared_stem'):
            stem = cand['stems'][u['shared_stem']]
            if q not in stems_done:
                target = root / f'Q{n:02}_stem.webp'
                qr.render(stem['regions'], target)
                stems_done[q] = rel(target)
            context['stem_image_url'] = stems_done[q]
        for letter in u['sources']:
            s = cand['sources'].get(letter)
            if not s or s['removed'] or not s['regions']:
                continue   # Question 2 on Paper 1 keeps its printed extract; the insert is not needed
            if letter not in source_done:
                target = root / f'INS_SOURCE_{letter}.webp'
                ir.render(s['regions'], target)
                source_done[letter] = rel(target)
            figs.append({'label': f'Source {letter}', 'image_url': source_done[letter], 'source': 'insert'})
        if figs:
            context['figures'] = figs
        removed_option = bool(u['question'] == '5' and u['text_removed'])
        record = {
            'question_id': unit_id(pid, u['label']), 'parent_question_id': f'{pid}_Q{n:02}',
            'source_type': 'real_past_paper', 'is_sample': False, 'paper_id': pid, 'subject_id': SUBJECT,
            'board': 'AQA', 'level': 'GCSE', 'subject': 'English Language', 'spec_code': qual, 'tier': None,
            'qualification_code': qual, 'is_as': False, 'is_official_sample': bool(paper['is_sample']),
            'subject_category': 'Humanities (Essay)', 'year': paper['year'], 'series': paper['series'],
            'component': paper['component'], 'question_number': q, **({'part_label': u['label']} if part else {}),
            'marks': u['marks'], 'estimated_minutes': max(1, round(u['marks'] * paper['duration_minutes'] / paper['max_marks'])),
            'difficulty': rv['difficulty'], 'section': 'Section B: Writing' if n == 5 else 'Section A: Reading',
            'route': f'P{comp}', 'route_title': f'Paper {comp}: {TITLES[comp]}',
            'primary_spec_points': primary, 'crossover_spec_points': [c for c in crossover if c not in primary],
            'preview_text': rv['summary'], 'include_in_custom_pool': True, 'extended_response': u['marks'] >= 8,
            'content': {'question_html': '', 'question_image_url': rel(image), 'mark_scheme_html': '',
                        'mark_scheme_image_url': rel(scheme_image)},
            'scheme_scope': 'whole_question' if part else 'part', 'scheme_question_number': u['question'], 'context': context,
            'provenance': {'review_status': 'model_reviewed', 'reviewer_type': 'model',
                           'question_source_sha256': cand['source_sha256'], 'scheme_source_sha256': ms_sha,
                           **({'insert_source_sha256': ins_doc['sha256']} if ins_doc else {}),
                           'source_regions': u['regions'], 'scheme_regions': u['scheme_regions'],
                           'original_parts': [u['label']], 'original_tariff_indices': [0],
                           'difficulty_basis': rv['difficulty_basis'],
                           'context_basis': 'cited source pages from the insert attached as unscored context' if figs else ('shared stem attached as unscored context' if part else 'independent'),
                           'official_codes': rv['sections'], 'prerequisite_codes': rv['prerequisites'],
                           'qualification_code': qual, 'extraction_version': cand['extraction_version'],
                           **({'picture_removed_for_description_option': True} if removed_option else {})},
        }
        if part:
            record['provenance']['scheme_note'] = 'AQA prints one scheme for the whole question; it is shown here for this one-mark part'
        if u.get('shared_stem'):
            record['multiple_choice'] = True
        records.append(record)
    printed_total = sum(u['marks'] for u in cand['units'])
    if printed_total != paper['max_marks'] or sum(r['marks'] for r in records) + sum(u['marks'] for u, _ in excluded) != printed_total:
        raise ValueError('Units do not reconcile to the booklet')
    title = f"{paper['series']} {paper['year']} · Paper {comp}: {paper['component_title']}"
    if paper['is_sample']:
        title = f"Official sample · Paper {comp}: {paper['component_title']}"
    runtime = {
        'paper_id': pid, 'paper_type': 'real_past_paper', 'subject_id': SUBJECT, 'board': 'AQA', 'level': 'GCSE',
        'subject': 'English Language', 'spec_code': qual, 'year': paper['year'], 'series': paper['series'],
        'paper_code': paper['component'], 'title': title, 'total_marks': paper['max_marks'],
        'duration_minutes': paper['duration_minutes'], 'qualification_code': qual, 'is_as': False,
        'question_ids': [r['question_id'] for r in records], 'is_official_sample': bool(paper['is_sample']),
        'full_paper_pdf_url': docs['question_paper']['url'], 'full_mark_scheme_pdf_url': docs['mark_scheme']['url'],
        'official_source_url': docs['question_paper']['url'],
        'insert_pdf_url': ins_doc['url'] if ins_doc else None,
        'examiner_report_url': docs.get('examiner_report', {}).get('url'),
    }
    if excluded:
        runtime['excluded_questions'] = [{'question_number': u['label'], 'marks': u['marks'], 'reason': reason} for u, reason in excluded]
    return {'pack_id': pid.lower(), 'papers': [runtime], 'questions': records}


def build_job(job):
    paper, research = job
    pid = paper['paper_id']
    review, cand = research / 'reviews' / f'{pid}.json', research / 'candidates' / f'{pid}.json'
    if not review.exists() or not cand.exists() or 'question_paper' not in paper['documents'] or 'mark_scheme' not in paper['documents']:
        return {'paper_id': pid, 'status': 'awaiting_review_or_source'}
    target = REPO / 'data/packs/gcseenglang' / f'{pid}.json'
    signature = hashlib.sha256(SIGNATURE + cand.read_bytes() + review.read_bytes() +
                               (REPO / 'data/specs' / f'{SUBJECT}.json').read_bytes() +
                               (REPO / 'data/imports/gcseenglang/inventory/8700-inventory.json').read_bytes() +
                               b''.join((HERE / f).read_bytes() for f in ('build.py', 'extract.py', 'reviews.py'))).hexdigest()
    try:
        if target.exists() and json.loads(target.read_text()).get('build_signature') == signature and (REPO / 'assets/gcseenglang' / pid).exists():
            return {'paper_id': pid, 'status': 'built', 'units': len(json.loads(target.read_text())['questions']), 'resumed': True}
        spec = json.loads((REPO / 'data/specs' / f'{SUBJECT}.json').read_text())
        pack = build_paper(paper, research, spec)
        registry = REPO / 'data/imports/gcseenglang/identities.json'
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
    inv = json.loads((REPO / 'data/imports/gcseenglang/inventory/8700-inventory.json').read_text())
    jobs = [(p, research) for p in inv['papers'] if not a.only or p['paper_id'] in a.only]
    status = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for result in pool.map(build_job, jobs):
            status.append(result)
            print({k: v for k, v in result.items() if k != 'trace'}, flush=True)
    write_json(REPO / 'data/imports/gcseenglang/build-status.json', [{k: v for k, v in s.items() if k != 'trace'} for s in status])
    print('Built', sum(s['status'] == 'built' for s in status), 'of', len(status))


if __name__ == '__main__':
    main()
