#!/usr/bin/env python3
"""Verify built AQA GCSE English Language 8700 packs, record coverage and identities, and (with
--activate) package their crops as lazy lossless catalogues and list them in the live pack index.

Usage: finalize.py --research DIR [--activate]
Published identities are immutable: a changed mark meaning needs a new question id.
Rights: assumption carried from the Geography import (owner's 16 November 2026 AQA permission note,
recorded as board-wide); the owner should confirm it covers GCSE English Language.
"""
import argparse
import base64
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def read(path):
    return json.loads(path.read_text())


def write(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text((json.dumps(value, separators=(',', ':')) if compact else json.dumps(value, ensure_ascii=False, indent=2)) + '\n')


def package(pack_path, pid):
    names = sorted(set(re.findall(r'assets/gcseenglang/' + pid + r'/([A-Za-z0-9_]+\.webp)', pack_path.read_text())))
    assets = {}
    for name in names:
        data = (REPO / 'assets/gcseenglang' / pid / name).read_bytes()
        assert len(data) > 200, (pid, name)
        assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
    write(REPO / 'data/gcseenglang-assets' / f'{pid}.json', {'format': 'lossless-webp-catalogue-v1', 'paper_id': pid, 'assets': assets}, compact=True)
    return len(assets)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--research', type=Path, required=True)
    ap.add_argument('--activate', action='store_true')
    a = ap.parse_args()
    research = a.research.resolve()
    target = REPO / 'data/imports/gcseenglang'
    registry_path = target / 'identities.json'
    previous = read(registry_path)['units'] if registry_path.exists() else {}
    identities, packs, queue, excluded = {}, [], [], []
    groups, difficulty, sections = defaultdict(Counter), Counter(), Counter()
    inv = read(target / 'inventory' / '8700-inventory.json')
    for paper in inv['papers']:
        pid = paper['paper_id']
        pack_path = REPO / 'data/packs/gcseenglang' / f'{pid}.json'
        cand_path, review_path = research / 'candidates' / f'{pid}.json', research / 'reviews' / f'{pid}.json'
        if not (pack_path.exists() and review_path.exists() and cand_path.exists()):
            queue.append({'paper_id': pid, 'reason': 'awaiting model review' if cand_path.exists() else 'awaiting extraction'})
            continue
        cand, review, pack = read(cand_path), read(review_path), read(pack_path)
        assert review['source_sha256'] == cand['source_sha256'] == paper['documents']['question_paper']['sha256'], pid
        assert cand['total_marks'] == paper['max_marks'] and not cand['exceptions'], pid
        [runtime] = pack['papers']
        ex = runtime.get('excluded_questions', [])
        published = {u.get('part_label') or u['question_number'] for u in pack['questions']}
        assert published | {e['question_number'] for e in ex} == {u['label'] for u in cand['units']}, pid
        assert sum(u['marks'] for u in pack['questions']) + sum(e['marks'] for e in ex) == cand['printed_tariff_sum'] == paper['max_marks'], pid
        for e in ex:
            excluded.append({'paper_id': pid, **e})
        key = f"GCSE 8700 · {'Official samples' if paper['is_sample'] else 'Exams'} · Paper {paper['assessment_paper']}"
        g = groups[key]
        g.update(booklets=1, source_questions=5, scored_units=len(pack['questions']), excluded_questions=len(ex),
                 marks_available=paper['max_marks'], published_marks=sum(u['marks'] for u in pack['questions']),
                 with_examiner_report=int(bool(runtime.get('examiner_report_url'))))
        for u in pack['questions']:
            qid = u['question_id']
            ident = {'parent_question_id': u['parent_question_id'], 'source_sha256': u['provenance']['question_source_sha256'],
                     'original_parts': u['provenance']['original_parts'], 'marks': u['marks']}
            assert qid not in identities and (qid not in previous or previous[qid] == ident), f'Identity changed: {qid}'
            assert u['provenance']['reviewer_type'] == 'model'
            identities[qid] = ident
            difficulty[u['difficulty']] += 1
            for s in u['primary_spec_points']:
                sections[s] += 1
        write(target / 'reviews' / f'{pid}.json', review)
        if a.activate:
            g.update(image_assets=package(pack_path, pid))
            packs.append({'file': f'gcseenglang/{pid}.json', 'subject_id': runtime['subject_id']})
    assert previous.keys() <= identities.keys(), 'Published identities removed'
    if a.activate:
        index_path = REPO / 'data/packs/index.json'
        other = [x for x in read(index_path)['packs'] if not x['file'].startswith('gcseenglang/')]
        write(index_path, {'packs': other + sorted(packs, key=lambda x: x['file'])})
    spec = read(REPO / 'data/specs/AQA_GCSE_ENGLANG_8700.json')
    ids = [p['id'] for s in spec['sections'] for t in s['topics'] for p in t['points']]
    write(registry_path, {'format': 'gcseenglang-assessment-identity-v1', 'units': identities})
    coverage = {'checked_at': '2026-11-22', 'reviewer_type': 'model', 'subject_id': 'AQA_GCSE_ENGLANG_8700',
                'status': ('complete_for_public_sources' if a.activate else 'built_not_published') if not queue else 'partial', 'published': bool(a.activate),
                'rights_basis': 'ASSUMPTION for the owner to confirm: the owner confirmed on 16 November 2026 that their AQA permission covers republishing AQA papers and mark schemes (recorded as board-wide, naming A-level Geography 7037/7036); AQA GCSE English Language 8700 is treated as covered.',
                'groups': {k: dict(v) for k, v in sorted(groups.items())}, 'totals': dict(sum(groups.values(), Counter())),
                'difficulty': dict(difficulty), 'units_per_leaf': {i: sections.get(i, 0) for i in ids},
                'leaves_without_primary_units': [i for i in ids if not sections.get(i)],
                'excluded_copyright_removed': excluded, 'queued_public_booklets': queue,
                'not_publicly_available': inv.get('not_public', []),
                'not_used': 'June 2026 papers are not listed by AQA. Modified (MQP) papers repeat the same questions. Secure or teacher-only routes were not used. No 8700 papers before November 2020 are public. Spoken language is non-exam assessment and is not a written question.',
                'series_notes': 'The files AQA lists as November 2020 and November 2021 print a June 2020 / June 2021 exam date on their covers and schemes (the cancelled summer series): AQA\'s own listing label is kept.',
                'unit_basis': 'One scored unit per printed question. The 2026 sample Paper 1 Question 1 is four one-mark multiple choice parts, each its own unit with the stem attached.'}
    write(target / 'coverage.json', coverage)
    print(json.dumps({k: coverage[k] for k in ('status', 'totals', 'difficulty', 'leaves_without_primary_units')}, indent=1), len(queue), 'queued', len(excluded), 'excluded')


if __name__ == '__main__':
    main()
