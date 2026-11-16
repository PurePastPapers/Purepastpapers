#!/usr/bin/env python3
"""Activate reviewed Physics packs, package their crops and record exact coverage.

Unlike the Maths release (all-or-nothing), Physics is published in checked batches.
A booklet is active only when its candidate, model review and built pack reconcile;
every other public booklet is listed in coverage.json's queue with its reason, so a
partial checkpoint can never read as complete. Published identities are immutable.
"""
import argparse, base64, hashlib, json, re
from collections import Counter, defaultdict, deque
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def write(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text((json.dumps(value, separators=(',', ':')) if compact else json.dumps(value, ensure_ascii=False, indent=2)) + '\n')


def public(value):
    if isinstance(value, list):
        return [public(v) for v in value]
    if isinstance(value, dict):
        return {k: public(v) for k, v in value.items() if k not in ('source_file', 'local_path', 'cache_path')}
    return value


def package(repo, pack_path, paper):
    text = pack_path.read_text()
    names = sorted(set(re.findall(r'assets/physics/' + paper + r'/([A-Za-z0-9_]+\.webp)', text)))
    assets = {}
    for name in names:
        data = (repo / 'assets/physics' / paper / name).read_bytes()
        assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
    write(repo / 'data/physics-assets' / f'{paper}.json', {'format': 'lossless-webp-catalogue-v1', 'paper_id': paper, 'assets': assets}, compact=True)
    return len(assets)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--research', type=Path, required=True)
    p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    a = p.parse_args()
    repo, research = a.repo.resolve(), a.research.resolve()
    target = repo / 'data/imports/physics'
    registry_path = target / 'identities.json'
    previous = read(registry_path)['units'] if registry_path.exists() else {}
    identities, packs, groups, queue, not_public = {}, [], defaultdict(Counter), [], []
    difficulty, years = Counter(), Counter()
    manifest_path = research / 'sources' / 'source-page-provenance.json'
    derived = {(r['paper_id'], r['kind']): r for r in read(manifest_path)['records']} if manifest_path.exists() else {}
    samples = []
    for name in ['9ph0-inventory', '8ph0-inventory', '9ph0-samples-inventory', '8ph0-samples-inventory']:
        inventory = read(target / 'inventory' / f'{name}.json')
        not_public += [x['paper_id'] for x in inventory.get('unavailable', [])]
        for paper in inventory['papers']:
            pid = paper['paper_id']
            pack_path = repo / 'data/packs/physics' / f'{pid}.json'
            cand_path, review_path = research / 'candidates' / f'{pid}.json', research / 'reviews' / f'{pid}.json'
            if not (pack_path.exists() and review_path.exists() and cand_path.exists()):
                queue.append({'paper_id': pid, 'reason': 'awaiting model review' if cand_path.exists() else 'awaiting extraction'})
                assert not pack_path.exists() or pid not in previous, pid
                continue
            candidate, review, pack = read(cand_path), read(review_path), read(pack_path)
            original = paper['documents']['question_paper']['sha256']
            if paper.get('is_sample'):
                # A sample is a recorded page range of the official collation.
                record = derived[(pid, 'question_paper')]
                assert record['original_source_sha256'] == original and record['cache_sha256'] == candidate['source_sha256'], pid
                original = candidate['source_sha256']
                samples.append(pid)
            assert review['source_sha256'] == candidate['source_sha256'] == original, pid
            assert sum(q['marks'] for q in pack['questions']) == paper['max_marks'] == candidate['total_marks'], pid
            group = groups[('AS' if paper['is_as'] else 'A-Level') + (' official samples' if paper.get('is_sample') else ' exams')]
            group.update(booklets=1, source_questions=len(candidate['questions']), scored_units=len(pack['questions']), marks=paper['max_marks'])
            by_parent = defaultdict(list)
            for unit in pack['questions']:
                by_parent[unit['question_number']].append(unit)
            for q in candidate['questions']:
                pending = defaultdict(deque)
                for i, part in enumerate(q['parts']):
                    pending[part['part_label']].append(i)
                group.update(original_tariffs=len(q['parts']))
                for unit in by_parent[q['number']]:
                    indices = [pending[l].popleft() for l in unit['provenance']['original_parts']]
                    assert indices == unit['provenance']['original_tariff_indices'], unit['question_id']
                    assert sum(q['parts'][i]['marks'] for i in indices) == unit['marks']
                    assert not paper['is_as'] or unit['introduced_year'] == 12
                    identity = {'parent_question_id': unit['parent_question_id'], 'source_sha256': candidate['source_sha256'],
                                'original_tariff_indices': indices, 'marks': unit['marks']}
                    qid = unit['question_id']
                    assert qid not in identities and (qid not in previous or previous[qid] == identity), f'Identity changed: {qid}'
                    identities[qid] = identity
                    difficulty[unit['difficulty']] += 1; years[unit['introduced_year']] += 1
                assert not any(pending.values()), f'Omitted tariffs: {pid} Q{q["number"]}'
            write(target / 'reviews' / f'{pid}.json', public(review))
            n = package(repo, pack_path, pid)
            group.update(image_assets=n)
            packs.append({'file': f'physics/{pid}.json', 'subject_id': 'EDX_ALEVEL_PHYS_9PH0'})
    assert previous.keys() <= identities.keys(), 'Published Physics identities removed'
    index_path = repo / 'data/packs/index.json'
    other = [x for x in read(index_path)['packs'] if not x['file'].startswith('physics/')]
    write(index_path, {'packs': other + sorted(packs, key=lambda x: x['file'])})
    write(registry_path, {'format': 'physics-assessment-identity-v1', 'units': identities})
    totals = dict(sum(groups.values(), Counter()))
    coverage = {'checked_at': '2026-11-15', 'reviewer_type': 'model', 'subject_id': 'EDX_ALEVEL_PHYS_9PH0',
                'status': 'complete' if not queue else 'partial',
                'groups': {k: dict(v) for k, v in groups.items()}, 'totals': totals,
                'difficulty': dict(difficulty), 'introduced_year': {str(k): v for k, v in years.items()},
                'queued_public_booklets': queue, 'not_publicly_available': not_public,
                'official_samples': sorted(samples),
                'source_question_count_basis': 'Source-scoped original question numbers per booklet.'}
    write(target / 'coverage.json', coverage)
    print(json.dumps({k: coverage[k] for k in ('status', 'groups', 'totals')}, indent=1), len(queue), 'queued')


if __name__ == '__main__':
    main()
