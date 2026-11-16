#!/usr/bin/env python3
"""Check built AQA Politics packs, record exact coverage and (only with --activate)
package their crops and list them in the live pack index.

The packs stay out of data/packs/index.json, and no source-pixel catalogue is
written, until the owner confirms the right to republish AQA material. Without
--activate this script still verifies every booklet and writes coverage.json,
identities.json and the public model reviews. Published identities are immutable.
"""
import argparse
import base64
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def write(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text((json.dumps(value, separators=(',', ':')) if compact else json.dumps(value, ensure_ascii=False, indent=2)) + '\n')


def package(repo, pack_path, paper):
    names = sorted(set(re.findall(r'assets/politics/' + paper + r'/([A-Za-z0-9_]+\.webp)', pack_path.read_text())))
    assets = {}
    for name in names:
        data = (repo / 'assets/politics' / paper / name).read_bytes()
        assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
    write(repo / 'data/politics-assets' / f'{paper}.json', {'format': 'lossless-webp-catalogue-v1', 'paper_id': paper, 'assets': assets}, compact=True)
    return len(assets)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--research', type=Path, required=True)
    p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    p.add_argument('--activate', action='store_true', help='Owner has confirmed AQA permission: publish packs and crops.')
    a = p.parse_args()
    repo, research = a.repo.resolve(), a.research.resolve()
    target = repo / 'data/imports/politics'
    registry_path = target / 'identities.json'
    previous = read(registry_path)['units'] if registry_path.exists() else {}
    identities, packs, queue, not_public, excluded = {}, [], [], [], []
    groups, difficulty, sections = defaultdict(Counter), Counter(), Counter()
    for name in ['7152-inventory', '7152-samples-inventory']:
        inventory = read(target / 'inventory' / f'{name}.json')
        not_public += [x['paper_id'] for x in inventory.get('not_public', [])]
        for paper in inventory['papers']:
            pid = paper['paper_id']
            pack_path = repo / 'data/packs/politics' / f'{pid}.json'
            cand_path, review_path = research / 'candidates' / f'{pid}.json', research / 'reviews' / f'{pid}.json'
            if not (pack_path.exists() and review_path.exists() and cand_path.exists()):
                queue.append({'paper_id': pid, 'reason': 'awaiting model review' if cand_path.exists() else 'awaiting extraction'})
                continue
            candidate, review, pack = read(cand_path), read(review_path), read(pack_path)
            assert review['source_sha256'] == candidate['source_sha256'] == paper['documents']['question_paper']['sha256'], pid
            assert candidate['total_marks'] == paper['max_marks'] and not candidate['exceptions'], pid
            [runtime] = pack['papers']
            removed = [q for q in candidate['questions'] if q.get('copyright_removed_content')]
            # A '-CR' file can still print every extract in full (e.g. the Paper 1 sample).
            assert not removed or paper.get('copyright_removed'), pid
            by_number = {u['question_number']: u for u in pack['questions']}
            assert set(by_number) == {q['number'] for q in candidate['questions']} - {q['number'] for q in removed}, pid
            for q in removed:
                excluded.append({'paper_id': pid, 'question_number': q['number'], 'marks': q['marks'],
                                 'reason': 'copyright-removed extract in the public paper'})
            key = ('Official samples' if paper.get('is_sample') else 'Exams') + f" · Paper {paper['assessment_paper']}"
            group = groups[key]
            group.update(booklets=1, source_questions=len(candidate['questions']), scored_units=len(pack['questions']),
                         marks_available=paper['max_marks'], excluded_questions=len(removed))
            for q in candidate['questions']:
                unit = by_number.get(q['number'])
                if not unit:
                    continue
                assert unit['marks'] == q['marks'] and unit['provenance']['original_tariff_indices'] == [0], unit['question_id']
                identity = {'parent_question_id': unit['parent_question_id'], 'source_sha256': candidate['source_sha256'],
                            'original_tariff_indices': [0], 'marks': unit['marks']}
                qid = unit['question_id']
                assert qid not in identities and (qid not in previous or previous[qid] == identity), f'Identity changed: {qid}'
                identities[qid] = identity
                difficulty[unit['difficulty']] += 1
                for s in unit['official_sections']:
                    sections[s] += 1
            write(target / 'reviews' / f'{pid}.json', review)
            if a.activate:
                group.update(image_assets=package(repo, pack_path, pid))
                packs.append({'file': f'politics/{pid}.json'})
    assert previous.keys() <= identities.keys(), 'Published Politics identities removed'
    index_path = repo / 'data/packs/index.json'
    if a.activate:
        other = [x for x in read(index_path)['packs'] if not x['file'].startswith('politics/')]
        write(index_path, {'packs': other + sorted(packs, key=lambda x: x['file'])})
    spec = read(repo / 'data/specs/AQA_ALEVEL_POL_7152.json')
    codes = [pt['code'] for s in spec['sections'] for t in s['topics'] for pt in t['points']]
    write(registry_path, {'format': 'politics-assessment-identity-v1', 'units': identities})
    coverage = {'checked_at': '2026-11-16', 'reviewer_type': 'model', 'subject_id': 'AQA_ALEVEL_POL_7152',
                'status': ('complete' if a.activate else 'built_awaiting_rights_confirmation') if not queue else 'partial',
                'published': bool(a.activate),
                'groups': {k: dict(v) for k, v in sorted(groups.items())}, 'totals': dict(sum(groups.values(), Counter())),
                'difficulty': dict(difficulty),
                'units_per_section': {c: sections.get(c, 0) for c in codes},
                'sections_without_questions': [c for c in codes if not sections.get(c)],
                'excluded_copyright_removed': excluded,
                'queued_public_booklets': queue, 'not_publicly_available': not_public,
                'not_used': 'June 2017-2019 papers are not on the public AQA resources page; secure or teacher-only routes were not used.',
                'source_question_count_basis': 'One scored unit per printed AQA question; optional questions keep their choice group.'}
    write(target / 'coverage.json', coverage)
    print(json.dumps({k: coverage[k] for k in ('status', 'groups', 'totals', 'difficulty', 'sections_without_questions')}, indent=1),
          len(queue), 'queued', len(excluded), 'excluded')


if __name__ == '__main__':
    main()
