#!/usr/bin/env python3
"""Verify built OCR Computer Science packs, record coverage and identities, and (with
--activate) package their crops as lazy lossless catalogues and list them in the
live pack index.

Usage: finalize.py --research DIR [--activate]
Published identities are immutable: a changed mark meaning needs a new question id.
The owner confirmed OCR permission on 16 November 2026; --activate publishes the packs and
writes the lazy crop catalogues. Without it, packs are verified but kept out of the index.
"""
import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'assets'))
from package_catalogue import package_catalogue

REPO = Path(__file__).resolve().parents[2]


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def package(pack_path, pid):
    return package_catalogue(REPO, pack_path, 'cs', pid, minimum_local_bytes=200)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--research', type=Path, required=True)
    ap.add_argument('--activate', action='store_true')
    a = ap.parse_args()
    research = a.research.resolve()
    target = REPO / 'data/imports/cs'
    registry_path = target / 'identities.json'
    previous = read(registry_path)['units'] if registry_path.exists() else {}
    identities, packs, queue, excluded, parent_scope = {}, [], [], [], []
    groups, difficulty, years, sections = defaultdict(Counter), Counter(), Counter(), Counter()
    not_public = []
    for qual in ('H446', 'H046'):
        inv = read(target / 'inventory' / f'{qual}-inventory.json')
        not_public += inv.get('not_public', [])
        for paper in inv['papers']:
            pid = paper['paper_id']
            pack_path = REPO / 'data/packs/cs' / f'{pid}.json'
            cand_path, review_path = research / 'candidates' / f'{pid}.json', research / 'reviews' / f'{pid}.json'
            if not (pack_path.exists() and review_path.exists() and cand_path.exists()):
                queue.append({'paper_id': pid, 'reason': 'awaiting model review' if cand_path.exists() else 'awaiting extraction'})
                continue
            cand, review, pack = read(cand_path), read(review_path), read(pack_path)
            assert review['source_sha256'] == cand['source_sha256'] == paper['documents']['question_paper']['sha256'], pid
            assert cand['total_marks'] == paper['max_marks'] and not cand['exceptions'], pid
            [runtime] = pack['papers']
            ex = runtime.get('excluded_questions', [])
            published = {u['question_number'] + u.get('part_label', ''): u for u in pack['questions']}
            assert all(u['question_number'] + u.get('part_label', '') == u['scheme_question_number'] for u in pack['questions']), pid
            assert set(published) | {e['question_number'] for e in ex} == {u['label'] for u in cand['units']}, pid
            assert sum(u['marks'] for u in pack['questions']) + sum(e['marks'] for e in ex) == cand['total_marks'] == paper['max_marks'], pid
            for e in ex:
                excluded.append({'paper_id': pid, **e})
            key = f"{'AS H046' if paper['is_as'] else 'A-level H446'} · {'Official samples' if paper['is_sample'] else 'Exams'} · Paper {paper['component']}"
            g = groups[key]
            g.update(booklets=1, source_questions=len({u['question'] for u in cand['units']}), printed_parts=len(cand['units']),
                     scored_units=len(pack['questions']), excluded_parts=len(ex),
                     marks_available=paper['max_marks'], printed_tariff_marks=cand['total_marks'],
                     published_marks=sum(u['marks'] for u in pack['questions']),
                     with_examiner_report=int(bool(runtime.get('examiner_report_url'))))
            for u in pack['questions']:
                qid = u['question_id']
                if u['scheme_scope'] == 'parent_part':
                    parent_scope.append({'paper_id': pid, 'unit': u['scheme_question_number'], 'scheme_part': u.get('scheme_part')})
                ident = {'parent_question_id': u['parent_question_id'], 'source_sha256': u['provenance']['question_source_sha256'],
                         'original_parts': u['provenance']['original_parts'], 'marks': u['marks']}
                assert qid not in identities and (qid not in previous or previous[qid] == ident), f'Identity changed: {qid}'
                assert u['provenance']['reviewer_type'] == 'model'
                identities[qid] = ident
                difficulty[u['difficulty']] += 1
                years[u['introduced_year']] += 1
                for s in u['primary_spec_points']:
                    sections[s] += 1
            write(target / 'reviews' / f'{pid}.json', review)
            if a.activate:
                g.update(image_assets=package(pack_path, pid))
                packs.append({'file': f'cs/{pid}.json'})
    assert previous.keys() <= identities.keys(), 'Published Geography identities removed'
    if a.activate:
        index_path = REPO / 'data/packs/index.json'
        other = [x for x in read(index_path)['packs'] if not x['file'].startswith('cs/')]
        write(index_path, {'packs': other + sorted(packs, key=lambda x: x['file'])})
    spec = read(REPO / 'data/specs/OCR_ALEVEL_CS_H446.json')
    ids = spec['point_order']
    write(registry_path, {'format': 'cs-assessment-identity-v1', 'units': identities})
    coverage = {'checked_at': '2026-11-16', 'reviewer_type': 'model', 'subject_id': 'OCR_ALEVEL_CS_H446',
                'status': ('complete' if a.activate else 'built_awaiting_rights_confirmation') if not queue else 'partial',
                'published': bool(a.activate), 'rights_basis': ('Owner confirmed on 16 November 2026 that their permission covers republishing OCR Computer Science H446/H046 papers and mark schemes.'
                                 if a.activate else 'NOT CONFIRMED: built and verified but kept out of the live index until the owner confirms OCR permission.'),
                'groups': {k: dict(v) for k, v in sorted(groups.items())}, 'totals': dict(sum(groups.values(), Counter())),
                'difficulty': dict(difficulty), 'content_years': {str(k): v for k, v in sorted(years.items())},
                'units_per_leaf': {i: sections.get(i, 0) for i in ids},
                'leaves_without_primary_units': [i for i in ids if not sections.get(i)],
                'excluded_copyright_removed': excluded, 'queued_public_booklets': queue, 'not_publicly_available': not_public,
                'not_used': 'A-level June 2017-2019 and November 2020, and AS 2016-2021, are not on OCR\'s public page; Teach Cambridge and other login routes were not used. June 2026 papers are not yet listed. The programming project (components 03/04) is coursework and is not imported; modified-paper ZIPs repeat the same questions.',
                'parent_scope_schemes': parent_scope,
                'source_question_count_basis': 'One scored unit per printed OCR tariff [n] (lowest labelled part, e.g. 1(a)(i)). No optional questions.'}
    write(target / 'coverage.json', coverage)
    print(json.dumps({k: coverage[k] for k in ('status', 'totals', 'difficulty', 'content_years', 'leaves_without_primary_units')}, indent=1),
          len(queue), 'queued', len(excluded), 'excluded')


if __name__ == '__main__':
    main()
