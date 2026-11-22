#!/usr/bin/env python3
"""Activate reviewed GCSE Chemistry 1CH0 and Combined Science 1SC0 (chemistry) packs, package their crops and record exact coverage.

Adapted from tools/gcsechem/finalize.py. Both qualifications share data/packs/gcsechem;
their tiers and qualifications are counted separately. Booklets are published in checked batches.
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
    names = sorted(set(re.findall(r'assets/gcsechem/' + paper + r'/([A-Za-z0-9_]+\.webp)', text)))
    assets = {}
    cat_path = repo / 'data/gcsechem-assets' / f'{paper}.json'
    previous = read(cat_path)['assets'] if cat_path.exists() else {}
    # Part crops, contexts and part schemes of refined units are written by tools/parts/*.py
    # straight into the catalogue, under the names the build also used (Q04_U02.webp,
    # Q04_U02_context.webp). Those must come from the catalogue, never from a stale local
    # build file: re-finalizing after refine.py put the build's "everything before this
    # part" contexts back (audit 2026-11-19, docs/QUESTION-BANK-PITFALLS.md).
    refined = set()
    for unit in json.loads(text).get('questions', []):
        provenance = unit.get('provenance') or {}
        if provenance.get('part_display'):
            urls = [(unit.get('content') or {}).get('question_image_url'), (unit.get('content') or {}).get('mark_scheme_image_url')]
            urls += [(unit.get('context') or {}).get(k) for k in ('stem_image_url', 'lead_in_image_url')]
            refined |= {u.rsplit('/', 1)[1] for u in urls if u and not u.endswith(('_full.webp', '_scheme.webp')) or (u and re.search(r'_[UP]\d+_scheme\.webp$', u))}
        if provenance.get('scheme_regions_fixed'):
            full_scheme = (unit.get('context') or {}).get('full_scheme_image_url') or (unit.get('content') or {}).get('mark_scheme_image_url')
            if full_scheme:
                refined.add(full_scheme.rsplit('/', 1)[1])
    for name in names:
        local = repo / 'assets/gcsechem' / paper / name
        if name in previous and (name in refined or not local.exists()):
            assets[name] = previous[name]
            continue
        data = local.read_bytes()
        assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
    write(repo / 'data/gcsechem-assets' / f'{paper}.json', {'format': 'lossless-webp-catalogue-v1', 'paper_id': paper, 'assets': assets}, compact=True)
    return len(assets)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--research', type=Path, required=True)
    p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    a = p.parse_args()
    repo, research = a.repo.resolve(), a.research.resolve()
    target = repo / 'data/imports/gcsechem'
    registry_path = target / 'identities.json'
    previous = read(registry_path)['units'] if registry_path.exists() else {}
    identities, packs, groups, queue, not_public = {}, [], defaultdict(Counter), [], []
    difficulty, tiers = Counter(), Counter()
    manifest_path = research / 'sources' / 'source-page-provenance.json'
    derived = {(r['paper_id'], r['kind']): r for r in read(manifest_path)['records']} if manifest_path.exists() else {}
    samples = []
    for name in ['1ch0-inventory', '1sc0-inventory']:
        if not (target / 'inventory' / f'{name}.json').exists():
            continue
        inventory = read(target / 'inventory' / f'{name}.json')
        not_public += [x['paper_id'] for x in inventory.get('unavailable', [])]
        for paper in inventory['papers']:
            pid = paper['paper_id']
            pack_path = repo / 'data/packs/gcsechem' / f'{pid}.json'
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
            group = groups[paper['qualification_code'] + ' ' + paper['tier'] + (' official samples' if paper.get('is_sample') else ' exams')]
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
                    assert unit['tier'] == paper['tier']
                    identity = {'parent_question_id': unit['parent_question_id'], 'source_sha256': candidate['source_sha256'],
                                'original_tariff_indices': indices, 'marks': unit['marks']}
                    qid = unit['question_id']
                    assert qid not in identities and (qid not in previous or previous[qid] == identity), f'Identity changed: {qid}'
                    identities[qid] = identity
                    difficulty[unit['difficulty']] += 1; tiers[paper['qualification_code'] + ' ' + unit['tier']] += 1
                assert not any(pending.values()), f'Omitted tariffs: {pid} Q{q["number"]}'
            write(target / 'reviews' / f'{pid}.json', public(review))
            n = package(repo, pack_path, pid)
            group.update(image_assets=n)
            packs.append({'file': f'gcsechem/{pid}.json', 'subject_id': paper['subject_id']})
    assert previous.keys() <= identities.keys(), 'Published GCSE Chemistry identities removed'
    index_path = repo / 'data/packs/index.json'
    other = [x for x in read(index_path)['packs'] if not x['file'].startswith('gcsechem/')]
    write(index_path, {'packs': other + sorted(packs, key=lambda x: x['file'])})
    write(registry_path, {'format': 'gcsechem-assessment-identity-v1', 'units': identities})
    totals = dict(sum(groups.values(), Counter()))
    coverage = {'checked_at': '2026-11-17', 'reviewer_type': 'model', 'subject_ids': ['EDX_GCSE_CHEM_1CH0', 'EDX_GCSE_COMBSCI_1SC0'],
                'scope_note': 'Separate Chemistry 1CH0 papers 1F/1H/2F/2H and the chemistry papers 1CF/1CH/2CF/2CH of Combined Science 1SC0. Combined Science biology and physics papers are separate imports.',
                'status': 'complete' if not queue else 'partial',
                'groups': {k: dict(v) for k, v in groups.items()}, 'totals': totals,
                'difficulty': dict(difficulty), 'tiers': dict(tiers),
                'queued_public_booklets': queue, 'not_publicly_available': not_public,
                'official_samples': sorted(samples),
                'source_question_count_basis': 'Source-scoped original question numbers per booklet.'}
    write(target / 'coverage.json', coverage)
    print(json.dumps({k: coverage[k] for k in ('status', 'groups', 'totals')}, indent=1), len(queue), 'queued')


if __name__ == '__main__':
    main()
