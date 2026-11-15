#!/usr/bin/env python3
"""Activate reconciled Maths packs and checkpoint source/review/identity metadata.

Run after building all four inventories. No source PDFs or private paths are
copied. An existing assessment identity cannot be changed under a published ID.
"""
import argparse
import hashlib
import json
from collections import Counter, defaultdict, deque
from pathlib import Path


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def public(value):
    if isinstance(value, list):
        return [public(item) for item in value]
    if isinstance(value, dict):
        return {key: public(item) for key, item in value.items()
                if key not in ('local_path', 'source_file', 'cache_path')}
    if isinstance(value, str) and value.startswith(('/Users/', '/private/', '/tmp/')):
        return Path(value).name
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--research', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    args = parser.parse_args()
    repo, research = args.repo.resolve(), args.research.resolve()
    target = repo / 'data/imports/maths'
    registry_path = target / 'identities.json'
    previous = read(registry_path)['units'] if registry_path.exists() else {}
    identities, packs, groups = {}, [], defaultdict(Counter)
    manifests = ['9ma0-inventory', '8ma0-inventory',
                 '9ma0-samples-inventory', '8ma0-samples-inventory']
    for name in manifests:
        inventory = read(research / 'inventory' / (name + '.json'))
        for paper in inventory['papers']:
            pid = paper['paper_id']
            path = repo / 'data/packs/maths' / (pid + '.json')
            if paper['documents']['question_paper']['availability'] != 'verified_public_pdf':
                assert not path.exists(), f'Restricted source activated: {pid}'
                continue
            assert path.exists(), f'Public source missing: {pid}'
            is_as, sample = bool(paper.get('is_as')), bool(paper.get('is_sample'))
            candidate_dir = 'as-sam-extracted' if is_as and sample else 'as-extracted' if is_as else 'extracted'
            candidate = read(research / candidate_dir / (pid + '.json'))
            review = read(research / 'reviews' / (pid + '.json'))
            pack = read(path)
            assert review['source_sha256'] == candidate['source_sha256']
            assert review['review_status'] == 'model_reviewed'
            assert sum(q['marks'] for q in pack['questions']) == paper['max_marks'] == candidate['total_marks']
            group = groups[('AS' if is_as else 'A-Level') + (' samples' if sample else ' exams')]
            group.update(booklets=1, source_questions=len(candidate['questions']),
                         scored_units=len(pack['questions']), marks=paper['max_marks'])
            source_questions = {q['number']: q for q in candidate['questions']}
            by_parent = defaultdict(list)
            for unit in pack['questions']:
                by_parent[unit['question_number']].append(unit)
            assert set(by_parent) == set(source_questions), pid
            for number, source in source_questions.items():
                queue = defaultdict(deque)
                for i, part in enumerate(source['parts']):
                    queue[part['part_label']].append(i)
                group.update(original_tariffs=len(source['parts']))
                for unit in by_parent[number]:
                    indices = [queue[label].popleft() for label in unit['provenance']['original_parts']]
                    assert sum(source['parts'][i]['marks'] for i in indices) == unit['marks'], unit['question_id']
                    unit['provenance']['original_tariff_indices'] = indices
                    assert unit['introduced_year'] in (12, 13)
                    assert not is_as or unit['introduced_year'] == 12
                    identity = {'parent_question_id': unit['parent_question_id'],
                                'source_sha256': candidate['source_sha256'],
                                'original_tariff_indices': indices, 'marks': unit['marks']}
                    qid = unit['question_id']
                    assert qid not in identities
                    assert qid not in previous or previous[qid] == identity, f'Published assessment changed identity: {qid}'
                    identities[qid] = identity
                assert all(not items for items in queue.values()), f'Omitted tariffs: {pid} Q{number}'
            write(path, pack)
            paper['processing_status'] = 'published_model_reviewed'
            write(target / 'reviews' / (pid + '.json'), public(review))
            exceptions = research / 'reviews' / (pid + '__exceptions.json')
            if exceptions.exists():
                write(target / 'reviews' / exceptions.name, public(read(exceptions)))
            packs.append({'file': 'maths/' + path.name})
        write(target / 'inventory' / (name + '.json'), public(inventory))
    assert previous.keys() <= identities.keys(), 'Published identities removed'
    index = repo / 'data/packs/index.json'
    other = [item for item in read(index)['packs'] if not item['file'].startswith('maths/')]
    write(index, {'packs': other + sorted(packs, key=lambda item: item['file'])})
    write(registry_path, {'format': 'maths-assessment-identity-v1', 'units': identities})
    totals = dict(sum(groups.values(), Counter()))
    coverage = {'checked_at': '2026-11-15', 'reviewer_type': 'model',
                'groups': {key: dict(value) for key, value in groups.items()}, 'totals': totals,
                'restricted_2026_booklets': 7,
                'missing_examiner_reports': ['EDX_8MA0_2020_OCTOBER_21'],
                'source_question_count_basis': 'Source-scoped original question IDs; modified versions are distinct sources.'}
    write(target / 'coverage.json', coverage)
    print(json.dumps(coverage, indent=2))


if __name__ == '__main__':
    main()
