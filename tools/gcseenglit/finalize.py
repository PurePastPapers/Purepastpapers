#!/usr/bin/env python3
"""Verify built Eduqas GCSE English Literature (C720QS) packs, record coverage and
identities, and (with --activate) package their crops as lazy lossless catalogues and
list them in the live pack index.

Usage: finalize.py --research DIR [--activate]
Published identities are immutable: a changed mark meaning needs a new question id.
"""
import argparse
import base64
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SUBJECT = 'EDUQAS_GCSE_ENGLIT_C720QS'


def read(path):
    return json.loads(path.read_text())


def write(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text((json.dumps(value, separators=(',', ':')) if compact else json.dumps(value, ensure_ascii=False, indent=2)) + '\n')


def package(pack_path, pid):
    names = sorted(set(re.findall(r'assets/gcseenglit/' + pid + r'/([A-Za-z0-9_]+\.webp)', pack_path.read_text())))
    assets = {}
    for name in names:
        data = (REPO / 'assets/gcseenglit' / pid / name).read_bytes()
        assert len(data) > 200, (pid, name)
        assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
    write(REPO / 'data/gcseenglit-assets' / f'{pid}.json', {'format': 'lossless-webp-catalogue-v1', 'paper_id': pid, 'assets': assets}, compact=True)
    return len(assets)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--research', type=Path, required=True)
    ap.add_argument('--activate', action='store_true')
    a = ap.parse_args()
    research = a.research.resolve()
    target = REPO / 'data/imports/gcseenglit'
    registry_path = target / 'identities.json'
    previous = read(registry_path)['units'] if registry_path.exists() else {}
    identities, packs, queue, removed, out_of_route, no_units = {}, [], [], [], [], []
    groups, difficulty, leaves = defaultdict(Counter), Counter(), Counter()
    inv = read(target / 'inventory' / 'c720qs-inventory.json')
    not_public = [{'paper_id': e['paper_id'], 'missing': [k for k, d in e['documents'].items() if d['availability'] != 'verified_public_pdf']}
                  for e in inv.get('unavailable', [])]
    for paper in inv['papers']:
        pid = paper['paper_id']
        pack_path = REPO / 'data/packs/gcseenglit' / f'{pid}.json'
        cand_path, review_path = research / 'candidates' / f'{pid}.json', research / 'reviews' / f'{pid}.json'
        if not (review_path.exists() and cand_path.exists()):
            queue.append({'paper_id': pid, 'reason': 'awaiting model review' if cand_path.exists() else 'awaiting extraction'})
            continue
        cand, review = read(cand_path), read(review_path)
        assert review['source_sha256'] == cand['source_sha256'] == paper['documents']['question_paper']['sha256'], pid
        assert cand['total_marks'] == paper['max_marks'] and not cand['exceptions'], pid
        key = paper['component_title'] + (' (2022 adapted series)' if paper['variant'] == 'adapted_2022' else '')
        g = groups[key]
        reviewed = {u['number']: u for u in review['units']}
        if not pack_path.exists():
            assert all('excluded' in reviewed[q['number']] for q in cand['questions'] if q['route']), pid
            for q in cand['questions']:
                (removed if q['route'] else out_of_route).append({'paper_id': pid, 'source_number': q['number'], 'marks': q['marks'],
                                                                  'reason_type': 'removed_from_specification' if q['route'] else 'option_not_in_route',
                                                                  'reason': reviewed[q['number']]['excluded'] if q['route'] else 'not a set text'})
            no_units.append({'paper_id': pid, 'reason': 'every question is on the poetry anthology examined until 2026'})
            g.update(booklets=1, printed_questions=len(cand['questions']), scored_units=0, removed_content_questions=len(cand['questions']),
                     marks_available=paper['max_marks'], printed_tariff_marks=cand['printed_tariff_sum'], published_marks=0)
            write(target / 'reviews' / f'{pid}.json', review)
            continue
        pack = read(pack_path)
        [runtime] = pack['papers']
        ex = runtime.get('excluded_questions', [])
        published = {u['scheme_question_number'] for u in pack['questions']}
        assert published | {e['source_number'] for e in ex} == {q['number'] for q in cand['questions']}, pid
        assert sum(u['marks'] for u in pack['questions']) + sum(e['marks'] for e in ex) == cand['printed_tariff_sum'], pid
        for e in ex:
            (removed if e['reason_type'] == 'removed_from_specification' else out_of_route).append({'paper_id': pid, **e})
        g.update(booklets=1, printed_questions=len(cand['questions']), scored_units=len(pack['questions']),
                 removed_content_questions=sum(e['reason_type'] == 'removed_from_specification' for e in ex),
                 out_of_route_questions=sum(e['reason_type'] == 'option_not_in_route' for e in ex),
                 marks_available=paper['max_marks'], printed_tariff_marks=cand['printed_tariff_sum'],
                 published_marks=sum(u['marks'] for u in pack['questions']),
                 with_unscored_context=sum(bool(u['context'].get('figures')) for u in pack['questions']))
        for u in pack['questions']:
            qid = u['question_id']
            ident = {'parent_question_id': u['parent_question_id'], 'source_sha256': u['provenance']['question_source_sha256'],
                     'original_parts': u['provenance']['original_parts'], 'marks': u['marks']}
            assert qid not in identities and (qid not in previous or previous[qid] == ident), f'Identity changed: {qid}'
            assert u['provenance']['reviewer_type'] == 'model'
            identities[qid] = ident
            difficulty[u['difficulty']] += 1
            for s in u['primary_spec_points']:
                leaves[s] += 1
        write(target / 'reviews' / f'{pid}.json', review)
        if a.activate:
            g.update(image_assets=package(pack_path, pid))
            packs.append({'file': f'gcseenglit/{pid}.json', 'subject_id': runtime['subject_id']})
    assert previous.keys() <= identities.keys(), 'Published GCSE English Literature identities removed'
    if a.activate:
        index_path = REPO / 'data/packs/index.json'
        other = [x for x in read(index_path)['packs'] if not x['file'].startswith('gcseenglit/')]
        write(index_path, {'packs': other + sorted(packs, key=lambda x: x['file'])})
    ids = read(REPO / 'data/specs' / f'{SUBJECT}.json')['point_order']
    write(registry_path, {'format': 'gcseenglit-assessment-identity-v1', 'units': identities})
    coverage = {'checked_at': '2026-11-17', 'reviewer_type': 'model', 'subject_id': SUBJECT,
                'status': ('complete' if a.activate else 'built_not_published') if not queue else 'partial',
                'published': bool(a.activate),
                'environment_hosts': ['www.eduqas.co.uk', 'pastpapers.download.wjec.co.uk'],
                'rights_basis': 'Owner confirmed permission to publish Eduqas (WJEC) papers and mark schemes (decision card, 17 November 2026).',
                'groups': {k: dict(v) for k, v in sorted(groups.items())}, 'totals': dict(sum(groups.values(), Counter())),
                'difficulty': dict(difficulty),
                'units_per_leaf': {i: leaves.get(i, 0) for i in ids},
                'leaves_without_primary_units': [i for i in ids if not leaves.get(i)],
                'excluded_removed_from_specification': removed,
                'excluded_options_not_in_route': out_of_route,
                'booklets_without_route_units': no_units,
                'excluded_basis': 'Questions on set texts outside the route are extracted for reconciliation but not published. Anthology questions '
                                  'name a poem from the anthology examined until 2026; none of its poems is in the anthology examined from 2027, '
                                  'so they are left out and listed.',
                'queued_public_booklets': queue, 'not_publicly_available': not_public,
                'not_used': 'Summer 2026 papers are not yet public. The November 2021 Component 1 paper has no public mark scheme, and no '
                            'November 2021 Component 2 paper is listed. Braille (-BRL) versions are not used. Eduqas sample assessment materials '
                            'are not imported. Examiner reports are not on the public page.',
                'source_question_count_basis': 'One scored unit per printed question code (21, 22, 08, 31 ...).',
                'navigation': 'Official specification set texts, the 2027 anthology poems and unseen poetry skills (no textbook supplied).'}
    write(target / 'coverage.json', coverage)
    print(json.dumps({k: coverage[k] for k in ('status', 'totals', 'difficulty', 'leaves_without_primary_units')}, indent=1),
          len(queue), 'queued', len(removed), 'removed', len(out_of_route), 'out of route')


if __name__ == '__main__':
    main()
