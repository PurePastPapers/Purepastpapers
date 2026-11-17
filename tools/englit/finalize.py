#!/usr/bin/env python3
"""Verify built Pearson English Literature packs (9ET0, 8ET0), record coverage and
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
SUBJECT = 'EDX_ALEVEL_ENGLIT_9ET0'


def read(path):
    return json.loads(path.read_text())


def write(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text((json.dumps(value, separators=(',', ':')) if compact else json.dumps(value, ensure_ascii=False, indent=2)) + '\n')


def package(pack_path, pid):
    names = sorted(set(re.findall(r'assets/englit/' + pid + r'/([A-Za-z0-9_]+\.webp)', pack_path.read_text())))
    assets = {}
    for name in names:
        data = (REPO / 'assets/englit' / pid / name).read_bytes()
        assert len(data) > 200, (pid, name)
        assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
    write(REPO / 'data/englit-assets' / f'{pid}.json', {'format': 'lossless-webp-catalogue-v1', 'paper_id': pid, 'assets': assets}, compact=True)
    return len(assets)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--research', type=Path, required=True)
    ap.add_argument('--activate', action='store_true')
    a = ap.parse_args()
    research = a.research.resolve()
    target = REPO / 'data/imports/englit'
    registry_path = target / 'identities.json'
    previous = read(registry_path)['units'] if registry_path.exists() else {}
    identities, packs, queue, removed, out_of_route, not_public = {}, [], [], [], [], []
    groups, difficulty, years, leaves = defaultdict(Counter), Counter(), Counter(), Counter()
    for qual in ('9et0', '8et0'):
        inv = read(target / 'inventory' / f'{qual}-inventory.json')
        not_public += [{'paper_id': e['paper_id'], 'missing': [k for k, d in e['documents'].items() if d['availability'] != 'verified_public_pdf']}
                       for e in inv.get('unavailable', [])]
        for paper in inv['papers']:
            pid = paper['paper_id']
            pack_path = REPO / 'data/packs/englit' / f'{pid}.json'
            cand_path, review_path = research / 'candidates' / f'{pid}.json', research / 'reviews' / f'{pid}.json'
            if not (pack_path.exists() and review_path.exists() and cand_path.exists()):
                queue.append({'paper_id': pid, 'reason': 'awaiting model review' if cand_path.exists() else 'awaiting extraction'})
                continue
            cand, review, pack = read(cand_path), read(review_path), read(pack_path)
            assert review['source_sha256'] == cand['source_sha256'] == paper['documents']['question_paper']['sha256'], pid
            assert cand['total_marks'] == paper['max_marks'] and not cand['exceptions'], pid
            [runtime] = pack['papers']
            ex = runtime.get('excluded_questions', [])
            published = {u['question_number'] for u in pack['questions']}
            assert published | {e['question_number'] for e in ex} == {q['number'] for q in cand['questions']}, pid
            assert sum(u['marks'] for u in pack['questions']) + sum(e['marks'] for e in ex) == cand['printed_tariff_sum'], pid
            for e in ex:
                (removed if e['reason_type'] == 'removed_from_specification' else out_of_route).append({'paper_id': pid, **e})
            key = f"{'AS 8ET0' if paper['is_as'] else 'A-level 9ET0'} · Paper {paper['assessment_paper']}: {paper['component_title']}"
            g = groups[key]
            g.update(booklets=1, printed_questions=len(cand['questions']), scored_units=len(pack['questions']),
                     removed_content_questions=sum(e['reason_type'] == 'removed_from_specification' for e in ex),
                     out_of_route_questions=sum(e['reason_type'] == 'option_not_in_route' for e in ex),
                     marks_available=paper['max_marks'], printed_tariff_marks=cand['printed_tariff_sum'],
                     published_marks=sum(u['marks'] for u in pack['questions']),
                     with_examiner_report=int(bool(runtime.get('examiner_report_url'))),
                     with_source_booklet_context=sum(bool(u['context'].get('figures')) for u in pack['questions']))
            for u in pack['questions']:
                qid = u['question_id']
                ident = {'parent_question_id': u['parent_question_id'], 'source_sha256': u['provenance']['question_source_sha256'],
                         'original_parts': u['provenance']['original_parts'], 'marks': u['marks']}
                assert qid not in identities and (qid not in previous or previous[qid] == ident), f'Identity changed: {qid}'
                assert u['provenance']['reviewer_type'] == 'model'
                identities[qid] = ident
                difficulty[u['difficulty']] += 1
                years[u['introduced_year']] += 1
                for s in u['primary_spec_points']:
                    leaves[s] += 1
            write(target / 'reviews' / f'{pid}.json', review)
            if a.activate:
                g.update(image_assets=package(pack_path, pid))
                packs.append({'file': f'englit/{pid}.json'})
    assert previous.keys() <= identities.keys(), 'Published English Literature identities removed'
    if a.activate:
        index_path = REPO / 'data/packs/index.json'
        other = [x for x in read(index_path)['packs'] if not x['file'].startswith('englit/')]
        write(index_path, {'packs': other + sorted(packs, key=lambda x: x['file'])})
    ids = read(REPO / 'data/specs' / f'{SUBJECT}.json')['point_order']
    write(registry_path, {'format': 'englit-assessment-identity-v1', 'units': identities})
    coverage = {'checked_at': '2026-11-16', 'reviewer_type': 'model', 'subject_id': SUBJECT,
                'status': ('complete' if a.activate else 'built_not_published') if not queue else 'partial',
                'published': bool(a.activate),
                'rights_basis': 'Owner confirmed Pearson permission covers republishing Pearson papers and mark schemes (recorded 14 and 16 November 2026).',
                'groups': {k: dict(v) for k, v in sorted(groups.items())}, 'totals': dict(sum(groups.values(), Counter())),
                'difficulty': dict(difficulty), 'content_years': {str(k): v for k, v in sorted(years.items())},
                'units_per_leaf': {i: leaves.get(i, 0) for i in ids},
                'leaves_without_primary_units': [i for i in ids if not leaves.get(i)],
                'excluded_removed_from_specification': removed,
                'excluded_options_not_in_route': out_of_route,
                'excluded_basis': 'Questions on set texts outside the route are extracted for reconciliation but not published. '
                                  'A question naming a poem that is no longer on the current prescribed list is left out and listed.',
                'queued_public_booklets': queue, 'not_publicly_available': not_public,
                'not_used': 'June 2026 papers are not yet public. AS 8ET0 was not sat in the October 2021 series. Pearson specimen papers '
                            '(teaching-and-learning materials, question paper and scheme in one PDF) are not imported.',
                'source_question_count_basis': 'One scored unit per printed essay question; each pair of questions on a set text is a choice group.',
                'navigation': 'Official specification set texts and prescribed poems (no textbook supplied).'}
    write(target / 'coverage.json', coverage)
    print(json.dumps({k: coverage[k] for k in ('status', 'totals', 'difficulty', 'content_years', 'leaves_without_primary_units')}, indent=1),
          len(queue), 'queued', len(removed), 'removed', len(out_of_route), 'out of route')


if __name__ == '__main__':
    main()
