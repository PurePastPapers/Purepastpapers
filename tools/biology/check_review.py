#!/usr/bin/env python3
"""Validate a Biology model review against its extraction candidate.

Usage: python3 tools/biology/check_review.py CANDIDATE.json REVIEW.json
Exit status 0 when the review can be built; otherwise prints every problem.
"""
import json
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def valid_ids():
    spec = json.loads((REPO / 'data/specs/EDX_ALEVEL_BIOL_9BN0.json').read_text())
    return {p['id'] for s in spec['sections'] if not s.get('legacy') for t in s['topics'] for p in t['points']}


def check(candidate, review):
    problems = []
    ids = valid_ids()
    if review.get('reviewer_type') != 'model':
        problems.append('reviewer_type must be "model"')
    if review.get('review_status') != 'model_reviewed':
        problems.append('review_status must be "model_reviewed"')
    if review.get('source_sha256') != candidate['source_sha256']:
        problems.append('source_sha256 does not match the candidate')
    by_number = {str(q.get('number')): q for q in review.get('questions', [])}
    expected_numbers = [q['number'] for q in candidate['questions']]
    if sorted(by_number, key=int) != expected_numbers:
        problems.append(f'question numbers {sorted(by_number)} != {expected_numbers}')
    for source in candidate['questions']:
        q = by_number.get(source['number'])
        if not q:
            continue
        want = Counter(p['part_label'] for p in source['parts'])
        got = Counter(label for unit in q.get('units', []) for label in unit.get('parts', []))
        if want != got:
            problems.append(f"Q{source['number']}: parts {dict(got)} != tariffs {dict(want)}")
        for i, unit in enumerate(q.get('units', []), 1):
            where = f"Q{source['number']} unit {i}"
            primary = unit.get('primary_spec_points') or []
            crossover = unit.get('crossover_spec_points') or []
            if not primary:
                problems.append(f'{where}: no primary_spec_points')
            bad = [t for t in primary + crossover if t not in ids]
            if bad:
                problems.append(f'{where}: unknown IDs {bad}')
            if set(primary) & set(crossover):
                problems.append(f'{where}: an ID is both primary and crossover')
            if unit.get('difficulty') not in ('easy', 'medium', 'hard'):
                problems.append(f'{where}: difficulty must be easy|medium|hard')
            for field in ('difficulty_basis', 'summary', 'tag_basis'):
                if not str(unit.get(field) or '').strip():
                    problems.append(f'{where}: missing {field}')
            if unit.get('context_basis') not in ('independent', 'shared_stem', 'grouped_dependency'):
                problems.append(f'{where}: context_basis must be independent|shared_stem|grouped_dependency')
            if unit.get('review_status') != 'model_reviewed':
                problems.append(f'{where}: review_status must be model_reviewed (record doubts in exceptions)')
            if len(unit.get('parts', [])) > 1 and unit.get('context_basis') == 'independent':
                problems.append(f'{where}: grouped parts cannot be "independent"')
    return problems


def main():
    candidate = json.loads(Path(sys.argv[1]).read_text())
    review = json.loads(Path(sys.argv[2]).read_text())
    problems = check(candidate, review)
    for problem in problems:
        print('PROBLEM:', problem)
    units = sum(len(q.get('units', [])) for q in review.get('questions', []))
    print(f"{'OK' if not problems else 'FAIL'}: {len(review.get('questions', []))} questions, {units} units")
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
