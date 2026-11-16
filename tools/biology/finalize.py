#!/usr/bin/env python3
"""Activate reconciled Biology A packs and checkpoint review/identity/coverage metadata.

Run after build.py has built every public booklet. No source PDFs or private paths
are copied. A published assessment identity can never change under the same ID.

Usage: python3 tools/biology/finalize.py --research RESEARCH [--repo .]
"""
import argparse
import datetime
import json
from collections import Counter, defaultdict, deque
from pathlib import Path

INVENTORIES = ['9bn0-inventory', '8bn0-inventory', 'samples-inventory']


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def public(value):
    if isinstance(value, list):
        return [public(item) for item in value]
    if isinstance(value, dict):
        return {k: public(v) for k, v in value.items() if k not in ('local_path', 'source_file', 'cache_path')}
    if isinstance(value, str) and value.startswith(('/home/', '/Users/', '/private/', '/tmp/')):
        return Path(value).name
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--research', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    args = parser.parse_args()
    repo, research = args.repo.resolve(), args.research.resolve()
    target = repo / 'data/imports/biology'
    registry_path = target / 'identities.json'
    previous = read(registry_path)['units'] if registry_path.exists() else {}
    identities, entries = {}, []
    groups = defaultdict(Counter)
    difficulty, years, extended, scheme_regions = Counter(), Counter(), 0, 0
    restricted, missing_reports, articles = [], [], {'public': [], 'restricted': []}
    for name in INVENTORIES:
        inv_path = target / 'inventory' / f'{name}.json'
        inventory = read(inv_path)
        for paper in inventory['papers']:
            pid = paper['paper_id']
            pack_path = repo / 'data/packs/biology' / f'{pid}.json'
            if paper['documents']['question_paper'].get('availability') != 'verified_public_pdf':
                assert not pack_path.exists(), f'Restricted source activated: {pid}'
                restricted.append(pid)
                continue
            assert pack_path.exists(), f'Public source not built: {pid}'
            candidate = read(research / 'extracted' / f'{pid}.json')
            review = read(research / 'reviews' / f'{pid}.json')
            pack = read(pack_path)
            assert review['source_sha256'] == candidate['source_sha256'] == paper['documents']['question_paper']['sha256']
            assert review['review_status'] == 'model_reviewed' and review['reviewer_type'] == 'model'
            assert sum(q['marks'] for q in pack['questions']) == paper['max_marks'] == candidate['total_marks'], pid
            sample = bool(paper.get('is_sample'))
            group = groups[('AS' if paper['is_as'] else 'A-Level') + (' samples' if sample else ' exams')]
            group.update(booklets=1, source_questions=len(candidate['questions']),
                         scored_units=len(pack['questions']), marks=paper['max_marks'])
            by_parent = defaultdict(list)
            for unit in pack['questions']:
                by_parent[unit['question_number']].append(unit)
            source_questions = {q['number']: q for q in candidate['questions']}
            assert set(by_parent) == set(source_questions), pid
            for number, source in source_questions.items():
                queue = defaultdict(deque)
                for i, part in enumerate(source['parts']):
                    queue[part['part_label']].append(i)
                group.update(original_tariffs=len(source['parts']))
                for unit in by_parent[number]:
                    indices = [queue[label].popleft() for label in unit['provenance']['original_parts']]
                    assert indices == unit['provenance']['original_tariff_indices'], unit['question_id']
                    assert sum(source['parts'][i]['marks'] for i in indices) == unit['marks'], unit['question_id']
                    assert unit['introduced_year'] in (12, 13) and (not paper['is_as'] or unit['introduced_year'] == 12)
                    identity = {'parent_question_id': unit['parent_question_id'], 'source_sha256': candidate['source_sha256'],
                                'original_tariff_indices': indices, 'marks': unit['marks']}
                    qid = unit['question_id']
                    assert qid not in identities, qid
                    assert qid not in previous or previous[qid] == identity, f'Published assessment changed identity: {qid}'
                    identities[qid] = identity
                    difficulty[unit['difficulty']] += 1
                    years[f"{'AS' if paper['is_as'] else 'A-Level'} Year {unit['introduced_year']}"] += 1
                    extended += bool(unit.get('extended_response'))
                assert all(not items for items in queue.values()), f'Omitted tariffs: {pid} Q{number}'
            scheme_regions += sum(len(q['provenance']['scheme_regions']) for q in pack['questions'])
            report = paper['documents'].get('examiner_report', {})
            if not sample and report.get('availability') != 'verified_public_pdf':
                missing_reports.append(pid)
            article = paper['documents'].get('pre_release_article')
            if article:
                (articles['public'] if article.get('availability') == 'verified_public_pdf' else articles['restricted']).append(pid)
            paper['processing_status'] = 'published_model_reviewed'
            write(target / 'reviews' / f'{pid}.json', public(review))
            entries.append({'file': f'biology/{pid}.json', 'subject_id': 'EDX_ALEVEL_BIOL_9BN0'})
        write(inv_path, public(inventory))
    assert previous.keys() <= identities.keys(), 'Published identities removed'
    index_path = repo / 'data/packs/index.json'
    others = [item for item in read(index_path)['packs'] if not item['file'].startswith('biology/')]
    write(index_path, {'packs': others + sorted(entries, key=lambda item: item['file'])})
    write(registry_path, {'format': 'biology-assessment-identity-v1', 'units': identities})
    totals = dict(sum(groups.values(), Counter()))
    coverage = {
        'checked_at': datetime.date.today().isoformat(), 'reviewer_type': 'model',
        'review_note': 'Tags, grouping and difficulty are model-reviewed with lead spot checks; not teacher-verified.',
        'groups': {key: dict(value) for key, value in sorted(groups.items())}, 'totals': totals,
        'difficulty': dict(difficulty), 'content_years': dict(years), 'extended_response_units': extended,
        'restricted_booklets': restricted, 'missing_examiner_reports': missing_reports,
        'pre_release_articles': articles,
        'source_question_count_basis': 'Source-scoped original questions; each printed tariff is assigned to exactly one scored unit.',
        'not_imported': {
            'modified_papers': 'Pearson modified-format ZIPs are accessibility versions of the same sittings, not distinct assessments.',
            'specimen_sets': 'Specimen paper sets are on Pearson /secure/ paths (restricted).',
            'textbook_navigation': 'No Biology textbook contents supplied yet; official specification navigation only.'},
    }
    write(target / 'coverage.json', coverage)
    print(json.dumps({'totals': totals, 'difficulty': coverage['difficulty'], 'years': coverage['content_years']}, indent=1))


if __name__ == '__main__':
    main()
