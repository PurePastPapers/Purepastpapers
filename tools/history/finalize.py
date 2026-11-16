#!/usr/bin/env python3
"""Check built Pearson 9HI0 Route H History packs, package their crops, record exact
coverage and list them in the live pack index (Pearson permission confirmed by the
owner on 14 November 2026). --no-activate verifies and records coverage only.
Published identities are immutable.
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
    names = sorted(set(re.findall(r'assets/history/' + paper + r'/([A-Za-z0-9_]+\.webp)', pack_path.read_text())))
    assets = {}
    for name in names:
        data = (repo / 'assets/history' / paper / name).read_bytes()
        assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
    write(repo / 'data/history-assets' / f'{paper}.json', {'format': 'lossless-webp-catalogue-v1', 'paper_id': paper, 'assets': assets}, compact=True)
    return len(assets)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--research', type=Path, required=True)
    p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    p.add_argument('--no-activate', dest='activate', action='store_false', help='Verify and record coverage without publishing.')
    a = p.parse_args()
    repo, research = a.repo.resolve(), a.research.resolve()
    target = repo / 'data/imports/history'
    registry_path = target / 'identities.json'
    previous = read(registry_path)['units'] if registry_path.exists() else {}
    identities, packs, queue, not_public, excluded = {}, [], [], [], []
    groups, difficulty, sections = defaultdict(Counter), Counter(), Counter()
    for name in ['9hi0-route-h-inventory']:
        inventory = read(target / 'inventory' / f'{name}.json')
        not_public += [x['paper_id'] for x in inventory.get('unavailable', [])]
        for paper in inventory['papers']:
            pid = paper['paper_id']
            pack_path = repo / 'data/packs/history' / f'{pid}.json'
            cand_path, review_path = research / 'candidates' / f'{pid}.json', research / 'reviews' / f'{pid}.json'
            if not (pack_path.exists() and review_path.exists() and cand_path.exists()):
                queue.append({'paper_id': pid, 'reason': 'awaiting model review' if cand_path.exists() else 'awaiting extraction'})
                continue
            candidate, review, pack = read(cand_path), read(review_path), read(pack_path)
            assert review['source_sha256'] == candidate['source_sha256'] == paper['documents']['question_paper']['sha256'], pid
            assert candidate['total_marks'] == paper['max_marks'] and not candidate['exceptions'], pid
            [runtime] = pack['papers']
            removed = [q for q in candidate['questions'] if q.get('copyright_removed_content')]
            by_number = {u['question_number']: u for u in pack['questions']}
            assert set(by_number) == {q['number'] for q in candidate['questions']} - {q['number'] for q in removed}, pid
            for q in removed:
                excluded.append({'paper_id': pid, 'question_number': q['number'], 'marks': q['marks'],
                                 'reason': 'copyright-removed extract in the public paper'})
            key = f"Exams · {paper['imported_options'][0]}"
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
                for s in unit['primary_spec_points']:
                    sections[s] += 1
            write(target / 'reviews' / f'{pid}.json', review)
            if a.activate:
                group.update(image_assets=package(repo, pack_path, pid))
                packs.append({'file': f'history/{pid}.json', 'subject_id': 'EDX_ALEVEL_HIST_9HI0'})
    assert previous.keys() <= identities.keys(), 'Published History identities removed'
    index_path = repo / 'data/packs/index.json'
    if a.activate:
        other = [x for x in read(index_path)['packs'] if not x['file'].startswith('history/')]
        write(index_path, {'packs': other + sorted(packs, key=lambda x: x['file'])})
    spec = read(repo / 'data/specs/EDX_ALEVEL_HIST_9HI0.json')
    codes = [pt['id'] for s in spec['sections'] for t in s['topics'] for pt in t['points']]
    write(registry_path, {'format': 'history-assessment-identity-v1', 'units': identities})
    coverage = {'checked_at': '2026-11-16', 'reviewer_type': 'model', 'subject_id': 'EDX_ALEVEL_HIST_9HI0',
                'status': ('complete' if a.activate else 'verified_not_published') if not queue else 'partial',
                'published': bool(a.activate),
                'groups': {k: dict(v) for k, v in sorted(groups.items())}, 'totals': dict(sum(groups.values(), Counter())),
                'difficulty': dict(difficulty),
                'units_per_bullet': {c: sections.get(c, 0) for c in codes},
                'bullets_without_questions': [c for c in codes if not sections.get(c)],
                'excluded_copyright_removed': excluded,
                'queued_public_booklets': queue, 'not_publicly_available': not_public,
                'scope': 'Route H options 1H, 2H.2 and 33 only; option 2H.1 questions in the shared 9HI0/2H booklet are not counted.',
                'source_question_count_basis': 'One scored unit per printed 20-mark question in the imported options; optional questions keep their choice group.'}
    write(target / 'coverage.json', coverage)
    print(json.dumps({k: coverage[k] for k in ('status', 'groups', 'totals', 'difficulty', 'bullets_without_questions')}, indent=1),
          len(queue), 'queued', len(excluded), 'excluded')


if __name__ == '__main__':
    main()
