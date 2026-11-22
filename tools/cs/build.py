#!/usr/bin/env python3
"""Build reviewed, reconciled, source-rendered OCR Computer Science packs (H446 and AS H046).

Usage: build.py --research DIR [--only PAPER ...]
  DIR holds sources/, candidates/ (extract.py) and reviews/ (reviews.py compile).

One scored unit per printed tariff. Unscored context is attached visibly and never
counted: the question's stem (e.g. a code listing) and the part's lead-in (e.g. a logic
diagram). The scheme crop is the unit's own rows of OCR's mark-scheme table; where OCR
prints one row for a whole part, the scope is recorded as 'parent_part'. Images are
lossless source pixels.

Content year: AS units are Year 12. An A-level unit is Year 12 only when every primary
leaf is content AS H046 shares (co-teachable AS content); otherwise Year 13. This is an AS
co-teaching basis, not an OCR teaching order, and is recorded on each unit.
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
from display import apply_display, question_regions  # noqa: E402

SUBJECT = 'OCR_ALEVEL_CS_H446'
SIGNATURE = b'cs-build-v3'
REPO = HERE.parents[1]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def slug(label):
    q, *rest = label.replace(')', '').split('(')
    return f'Q{int(q):02}' + ''.join(f'_{x}' for x in rest)


def build_paper(paper, research, spec):
    pid = paper['paper_id']
    cand = json.loads((research / 'candidates' / f'{pid}.json').read_text())
    review = json.loads((research / 'reviews' / f'{pid}.json').read_text())
    docs = paper['documents']
    qp, ms = research / 'sources' / docs['question_paper']['file_name'], research / 'sources' / docs['mark_scheme']['file_name']
    if review.get('reviewer_type') != 'model':
        raise ValueError('Review must be labelled as a model review')
    if review['source_sha256'] != cand['source_sha256'] or sha(qp) != cand['source_sha256'] or cand['source_sha256'] != docs['question_paper']['sha256']:
        raise ValueError('Question source revision mismatch')
    if cand['exceptions'] or cand['total_marks'] != paper['max_marks']:
        raise ValueError('Extraction exceptions or total mismatch')
    ms_sha = sha(ms)
    if ms_sha != docs['mark_scheme']['sha256']:
        raise ValueError('Scheme source revision mismatch')
    reviewed = {u['label']: u for u in review['units']}
    if set(reviewed) != {u['label'] for u in cand['units']}:
        raise ValueError('Reviews must cover exactly the units')
    leaves = {p['id']: p for s in spec['sections'] for t in s['topics'] for p in t['points']}
    as_shared = {v['leaf'] for v in spec['as_section_map'].values()}
    start = max(u['tariff']['page'] for u in cand['units']) if paper['is_sample'] else 0
    schemes, _ = scheme_regions(ms, [u['label'] for u in cand['units']], start_page=start)
    missing = [u['label'] for u in cand['units'] if u['label'] not in schemes]
    if missing:
        raise ValueError(f'No scheme rows for {missing}')
    qr, sr = SourceRenderer(qp), SourceRenderer(ms)
    root = REPO / 'assets/cs' / pid
    rel = lambda p: p.relative_to(REPO).as_posix()

    def render_context(asset_name, regions):
        target = root / f'{asset_name}.webp'
        qr.render(regions, target)
        return rel(target)

    qual, is_as = paper['qualification_code'], paper['is_as']
    rendered_ctx, records = {}, []
    for u in cand['units']:
        rv = reviewed[u['label']]
        primary, crossover = list(rv['sections']), [t for t in rv['prerequisites'] if t not in rv['sections']]
        if any(t not in leaves for t in primary + crossover):
            raise ValueError(f"{u['label']}: invalid tags")
        name = slug(u['label'])
        image, scheme_image = root / f'{name}.webp', root / f'{name}_scheme.webp'
        own_regions = question_regions(pid, name, u['regions'])
        qr.render(own_regions, image)
        sr.render(schemes[u['label']]['regions'], scheme_image)
        intros = []
        for key in u.get('context', []):
            if key not in rendered_ctx:
                target = root / f"CTX_{slug(key)}.webp"
                qr.render(cand['context'][key]['regions'], target)
                rendered_ctx[key] = rel(target)
            intros.append({'label': f'Question {key}' if '(' not in key else f'Part {key}', 'image_url': rendered_ctx[key]})
        year = 12 if is_as or all(t in as_shared for t in primary) else 13
        q = u['question']
        record = {
            # A whole question (no parts) is its own unit: suffix _W keeps it distinct from its parent id.
            'question_id': f"{pid}_{name}" + ('' if '(' in u['label'] else '_W'), 'parent_question_id': f'{pid}_Q{int(q):02}',
            'source_type': 'real_past_paper', 'is_sample': False, 'paper_id': pid, 'subject_id': SUBJECT,
            'board': 'OCR', 'level': 'AS' if is_as else 'A-Level', 'subject': 'Computer Science', 'spec_code': qual,
            'qualification_code': qual, 'is_as': is_as, 'is_official_sample': bool(paper['is_sample']),
            'subject_category': 'STEM', 'year': paper['year'], 'series': paper['series'], 'component': paper['component'],
            'question_number': q, **({'part_label': u['label'][len(q):]} if '(' in u['label'] else {}),   # "(a)(i)", site convention
            'marks': u['marks'], 'estimated_minutes': max(1, round(u['marks'] * paper['duration_minutes'] / paper['max_marks'])),
            'difficulty': rv['difficulty'], 'introduced_year': year,
            'primary_spec_points': primary, 'crossover_spec_points': crossover,
            'preview_text': rv['summary'], 'include_in_custom_pool': True, 'extended_response': bool(u['extended_response']),
            'content': {'question_html': '', 'question_image_url': rel(image), 'mark_scheme_html': '',
                        'mark_scheme_image_url': rel(scheme_image)},
            'scheme_scope': 'part' if schemes[u['label']]['scope'] == 'unit' else 'parent_part',
            'scheme_question_number': u['label'], 'context': {'intros': intros} if intros else {},
            'provenance': {'review_status': 'model_reviewed', 'reviewer_type': 'model',
                           'question_source_sha256': cand['source_sha256'], 'scheme_source_sha256': ms_sha,
                           'source_regions': own_regions, 'scheme_regions': schemes[u['label']]['regions'],
                           'original_parts': [u['label']], 'original_tariff_indices': [0],
                           'difficulty_basis': rv['difficulty_basis'],
                           'context_basis': 'question stem and part lead-in attached as unscored context' if intros else 'independent',
                           'content_year_basis': 'AS H046 unit' if is_as else ('all primary leaves are AS H046 shared content' if year == 12 else 'assesses A-level-only content'),
                           'official_codes': rv.get('codes', []), 'prerequisite_codes': rv.get('prerequisite_codes', []),
                           'qualification_code': qual, 'extraction_version': cand['extraction_version'],
                           **({'lead_note': rv['lead_note']} if rv.get('lead_note') else {})},
        }
        if record['scheme_scope'] == 'parent_part':
            record['scheme_part'] = u['label'].rsplit('(', 1)[0]

        apply_display(pid, record, render_context)
        records.append(record)
    if sum(r['marks'] for r in records) != paper['max_marks']:
        raise ValueError('Units do not reconcile to the booklet')
    kind = 'AS' if is_as else 'A-Level'
    title = f"{paper['series']} {paper['year']} · {kind} {qual}/{paper['component']}: {paper['component_title']}"
    if paper['is_sample']:
        title = f"Official sample · {kind} {qual}/{paper['component']}: {paper['component_title']}"
    runtime = {
        'paper_id': pid, 'paper_type': 'real_past_paper', 'subject_id': SUBJECT, 'board': 'OCR', 'level': kind,
        'subject': 'Computer Science', 'spec_code': qual, 'year': paper['year'], 'series': paper['series'],
        'paper_code': paper['component'], 'title': title, 'total_marks': paper['max_marks'],
        'duration_minutes': paper['duration_minutes'], 'qualification_code': qual, 'is_as': is_as,
        'question_ids': [r['question_id'] for r in records], 'is_official_sample': bool(paper['is_sample']),
        'full_paper_pdf_url': docs['question_paper']['url'], 'full_mark_scheme_pdf_url': docs['mark_scheme']['url'],
        'official_source_url': docs['question_paper']['url'],
        'examiner_report_url': docs.get('examiner_report', {}).get('url'),
    }
    return {'pack_id': pid.lower(), 'papers': [runtime], 'questions': records}


def build_job(job):
    paper, research = job
    pid = paper['paper_id']
    review, cand = research / 'reviews' / f'{pid}.json', research / 'candidates' / f'{pid}.json'
    if not review.exists() or not cand.exists():
        return {'paper_id': pid, 'status': 'awaiting_review_or_source'}
    target = REPO / 'data/packs/cs' / f'{pid}.json'
    signature = hashlib.sha256(SIGNATURE + cand.read_bytes() + review.read_bytes() +
                               Path(__file__).read_bytes() + (HERE / 'schemes.py').read_bytes() + (HERE / 'display.py').read_bytes() +
                               (REPO / 'data/specs' / f'{SUBJECT}.json').read_bytes()).hexdigest()
    try:
        if target.exists() and json.loads(target.read_text()).get('build_signature') == signature and (REPO / 'assets/cs' / pid).exists():
            return {'paper_id': pid, 'status': 'built', 'units': len(json.loads(target.read_text())['questions']), 'resumed': True}
        spec = json.loads((REPO / 'data/specs' / f'{SUBJECT}.json').read_text())
        pack = build_paper(paper, research, spec)
        registry = REPO / 'data/imports/cs/identities.json'
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
    papers = [p for q in ('H446', 'H046') for p in json.loads((REPO / f'data/imports/cs/inventory/{q}-inventory.json').read_text())['papers']]
    jobs = [(p, research) for p in papers if not a.only or p['paper_id'] in a.only]
    status = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for result in pool.map(build_job, jobs):
            status.append(result)
            print(result, flush=True)
    write_json(REPO / 'data/imports/cs/build-status.json', status)
    print('Built', sum(s['status'] == 'built' for s in status), 'of', len(status))


if __name__ == '__main__':
    main()
