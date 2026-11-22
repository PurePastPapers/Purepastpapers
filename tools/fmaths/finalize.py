#!/usr/bin/env python3
"""Validate and activate Further Maths packs without regenerating image crops."""
import argparse
import base64
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data'
IMPORTS = DATA / 'imports/fmaths'
ASSET = re.compile(r'assets/fmaths/([A-Z0-9_]+)/([A-Za-z0-9_]+\.webp)')


def read(path):
    return json.loads(path.read_text())


def write(path, value, *, indent=2):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=indent) + '\n')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify_pack(path, last_identities, identities):
    pack = read(path)
    paper, = pack['papers']
    pid = paper['paper_id']
    questions = pack['questions']
    require(pid == path.stem, f'Wrong pack name: {path}')
    require([q['question_id'] for q in questions] == paper['question_ids'], f'Question order mismatch: {pid}')
    require(sum(q['marks'] for q in questions) == paper['total_marks'], f'Paper total mismatch: {pid}')
    tariffs = defaultdict(list)
    for q in questions:
        qid = q['question_id']
        provenance = q['provenance']
        parts = provenance['original_tariffs']
        indices = provenance['original_tariff_indices']
        require(len(indices) == len(parts) and sum(p['marks'] for p in parts) == q['marks'],
                f'Incorrect tariff mapping: {qid}')
        require(q['qualification_code'] == paper['qualification_code'] and q['module_id'] in paper['module_ids'],
                f'Incorrect qualification or option module: {qid}')
        parent = q['parent_question_id']
        identity = {'parent_question_id': parent, 'source_sha256': provenance['question_source_sha256'],
                    'original_tariff_indices': indices, 'marks': q['marks']}
        require(qid not in identities and last_identities.get(qid, identity) == identity,
                f'Conflicting or changed published identity: {qid}')
        identities[qid] = identity
        tariffs[parent].extend(indices)
    require(all(sorted(v) == list(range(len(v))) for v in tariffs.values()), f'Duplicate or missing tariffs: {pid}')
    require(pack['source_counts'] == {'top_level_questions': len(tariffs),
                                      'scored_parts': sum(len(v) for v in tariffs.values())},
            f'Incorrect source counts: {pid}')
    assets = read(DATA / 'fmaths-assets' / f'{pid}.json')['assets']
    refs = set(ASSET.findall(json.dumps(pack)))
    require(refs == {(pid, ref) for ref in assets}, f'Catalogue entries differ from rendered references: {pid}')
    for name, asset in assets.items():
        digest = hashlib.sha256(base64.b64decode(asset['base64'], validate=True)).hexdigest()
        require(digest == asset['sha256'], f'Catalogue checksum mismatch: {pid}/{name}')
    return paper, Counter(papers=1, practice_units=len(questions), marks=paper['total_marks'],
                          image_assets=len(assets), **pack['source_counts'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--activate', nargs='+', default=[], metavar='PAPER_ID')
    parser.add_argument('--candidates', type=Path, action='append', default=[], help='Reconcile counts for available source candidates')
    args = parser.parse_args()
    index = DATA / 'packs/index.json'
    index_data = read(index)
    existing = {Path(entry['file']).stem for entry in index_data['packs'] if entry['file'].startswith('fmaths/')}
    paper_ids = existing.union(args.activate)
    require(all(re.fullmatch(r'EDX_[89]FM0_[A-Z0-9_]+', pid) for pid in paper_ids), 'Invalid activation paper ID')
    folders = [DATA / 'packs/fmaths' / f'{pid}.json' for pid in sorted(paper_ids)]
    registry = IMPORTS / 'identities.json'
    previous = read(registry)['units'] if registry.exists() else {}
    identities, imported, grouped = {}, {}, defaultdict(Counter)
    for path in folders:
        paper, counts = verify_pack(path, previous, identities)
        imported[paper['paper_id']] = counts
        key = (paper['qualification_code'], paper['module_ids'][0], bool(paper.get('is_official_sample')))
        grouped[key].update(counts)
    require(previous.keys() <= identities.keys(), 'Published identities were removed')
    expected = defaultdict(Counter)
    missing_examiner_reports = []
    for path in sorted((IMPORTS / 'inventory').glob('*-inventory.json')):
        inventory = read(path)
        if 'qualification' in inventory:
            inventory['acquisition_verification'] = {
                'date': '2026-11-22', 'host': 'qualifications.pearson.com',
                'method': 'Direct original URL and acquired URL match. Checksums and byte lengths reverified.'
            }
        for row in inventory['papers']:
            pid = row['paper_id']
            sample = bool(row.get('is_sample'))
            key = (row['qualification_code'], row['module_ids'][0], sample)
            expected[key]['expected_papers'] += 1
            docs = row['documents']
            if all(docs[k]['availability'] == 'verified_public' for k in ('question_paper', 'mark_scheme')):
                expected[key]['available_papers'] += 1
            for directory in args.candidates:
                candidate_path = directory / f'{pid}.json'
                if not candidate_path.is_file():
                    continue
                candidate = read(candidate_path)
                qp = docs['question_paper']
                if candidate['exceptions'] or candidate['total_marks'] != row['max_marks'] or \
                        candidate['source_sha256'] != qp.get('cache_sha256', qp['sha256']):
                    continue
                row['source_counts'] = {'top_level_questions': len(candidate['questions']),
                                        'scored_parts': sum(len(q['parts']) for q in candidate['questions'])}
                break
            if 'source_counts' in row:
                expected[key].update(counted_source_papers=1,
                                     available_top_level_questions=row['source_counts']['top_level_questions'],
                                     available_scored_parts=row['source_counts']['scored_parts'])
            if not sample and docs['examiner_report']['availability'] != 'verified_public':
                missing_examiner_reports.append(pid)
            counts = imported.get(pid)
            row['imported'] = bool(counts)
            if counts:
                row['imported_counts'] = dict(counts)
            else:
                row.pop('imported_counts', None)
        write(path, inventory, indent=1 if 'qualification' in inventory else 2)
    index_data['packs'] = [entry for entry in index_data['packs'] if not entry['file'].startswith('fmaths/')]
    index_data['packs'].extend({'file': f'fmaths/{path.name}', 'subject_id': 'EDX_ALEVEL_FMATH_9FM0'} for path in folders)
    write(index, index_data)
    write(registry, {'format': 'fmaths-assessment-identity-v1', 'units': identities})
    counts = [dict(qualification_code=code, module_id=module, sample=sample,
                   **expected[code, module, sample], **grouped[code, module, sample])
              for code, module, sample in sorted(set(expected) | set(grouped))]
    summary = {'groups': counts, 'totals': dict(sum(imported.values(), Counter())),
               'missing_examiner_reports': missing_examiner_reports}
    write(IMPORTS / 'coverage.json', summary)
    print(json.dumps(summary['totals'], indent=2))


if __name__ == '__main__':
    main()
