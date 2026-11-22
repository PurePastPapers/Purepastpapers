#!/usr/bin/env python3
"""Render reviewed Edexcel Further Mathematics papers with the Maths pipeline."""
import argparse
import base64
import hashlib
import json
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/maths'))
from build import build_paper, write_json

SUBJECT = 'EDX_ALEVEL_FMATH_9FM0'
ASSET = re.compile(r'assets/fmaths/[A-Z0-9_]+/([A-Za-z0-9_]+\.webp)')


def read(path):
    return json.loads(path.read_text())


def allowed_points(spec, row):
    module, = row['module_ids']
    code = row['qualification_code']
    section = 'EDX_FMATH_SEC_' + ('AS_' if code == '8FM0' and module != 'CP' else '') + module
    return {p['id'] for s in spec['sections'] if s['id'] == section
            for t in s['topics'] for p in t['points'] if code in p['qualifications']}


def sample_record(row):
    code = row['component']
    module, = row['module_ids']
    title = f"Official sample · {row['level']} {row['component_title']}"
    if row.get('printed_paper_code'):
        title += f" ({row['printed_paper_code']})"
    record = {
        'paper_id': row['paper_id'], 'paper_type': 'real_past_paper', 'subject_id': SUBJECT,
        'board': 'Edexcel', 'level': row['level'], 'is_as': row['is_as'],
        'subject': 'Further Mathematics', 'spec_code': row['qualification_code'],
        'qualification_code': row['qualification_code'], 'module_ids': [module],
        'official_paper_code': row['official_paper_code'], 'paper_code': code,
        'title': title, 'series': 'Official sample', 'year': None,
        'total_marks': row['max_marks'], 'duration_minutes': row['duration_minutes'],
        'is_official_sample': True, 'source_bundle_url': row['documents']['question_paper']['url'],
        'official_source_url': row['documents']['question_paper']['url'],
    }
    for key in ('printed_paper_code', 'component_of', 'duration_note'):
        if key in row:
            record[key] = row[key]
    if row['is_as'] and module != 'CP':
        record['component_of'] = 'Paper 2'
        record['duration_note'] = ('Suggested practice time for the sampled 40-mark section is 50 minutes. '
                                   'The official printed sample route combines two sections in 1 h 40 min.')
    return record


def verify_candidate(candidate, row):
    pid = row['paper_id']
    if candidate['exceptions']:
        raise ValueError(f"{pid}: unresolved extraction exceptions: {candidate['exceptions']}")
    docs = row['documents']
    if docs['question_paper']['availability'] != 'verified_public' or docs['mark_scheme']['availability'] != 'verified_public':
        raise ValueError(f'{pid}: original question paper and mark scheme must be public')
    if candidate['source_sha256'] != docs['question_paper'].get('cache_sha256', docs['question_paper']['sha256']):
        raise ValueError(f'{pid}: unexpected question-paper revision')
    for question in candidate['questions']:
        tariffs = question['parts']
        if not tariffs or sum(part['marks'] for part in tariffs) != question['marks']:
            raise ValueError(f"{pid} Q{question['number']}: tariffs do not match the question total")


def render_paper(row, record, candidate_path, review_path, inputs, spec, rebuild):
    pid = row['paper_id']
    pack_path = ROOT / 'data/packs/fmaths' / f'{pid}.json'
    catalogue_path = ROOT / 'data/fmaths-assets' / f'{pid}.json'
    if pack_path.exists() and not rebuild:
        raise ValueError(f'{pid}: already built. Use --rebuild to replace its reviewed crops.')
    candidate, review = read(candidate_path), read(review_path)
    verify_candidate(candidate, row)
    if review.get('paper_id') != pid:
        raise ValueError(f'{pid}: wrong review identity')
    paper = {**row, 'component': row['official_paper_code'].split('/', 1)[1]}
    with tempfile.TemporaryDirectory(prefix='ppp-fmaths-') as temporary:
        work = Path(temporary)
        for kind in ('question_paper', 'mark_scheme'):
            (work / f'{pid}__{kind}.pdf').symlink_to((inputs / pid / f'{kind}.pdf').resolve(strict=True))
        if row.get('is_sample'):
            scheme = row['documents']['mark_scheme']
            write_json(work / 'source-page-provenance.json', {'records': [{
                'paper_id': pid, 'kind': 'mark_scheme', 'cache_sha256': scheme['cache_sha256'],
                'original_source_sha256': scheme['sha256'],
            }]})
        pack = build_paper(paper, candidate, review, work, work / 'assets/fmaths', work,
                           allowed_points(spec, row), runtime_paper=record)
        pack['source_counts'] = {'top_level_questions': len(candidate['questions']),
                                 'scored_parts': sum(len(q['parts']) for q in candidate['questions'])}
        assets = {}
        for name in sorted(set(ASSET.findall(json.dumps(pack)))):
            data = (work / 'assets/fmaths' / pid / name).read_bytes()
            assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode('ascii')}
        catalogue_path.parent.mkdir(parents=True, exist_ok=True)
        catalogue_path.write_text(json.dumps({'format': 'lossless-webp-catalogue-v1', 'paper_id': pid,
                                              'assets': assets}, separators=(',', ':')) + '\n')
        write_json(pack_path, pack)
    print(pid, pack['source_counts'], len(pack['questions']), 'practice units', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--candidates', type=Path, required=True)
    parser.add_argument('--reviews', type=Path, required=True)
    parser.add_argument('--sample-inventory', type=Path, action='append', default=[])
    parser.add_argument('--rebuild', action='store_true')
    parser.add_argument('paper_ids', nargs='+')
    args = parser.parse_args()
    spec = read(ROOT / f'data/specs/{SUBJECT}.json')
    runtime = {p['paper_id']: p for p in read(ROOT / f'data/papers/{SUBJECT}.json')}
    inventories = ROOT / 'data/imports/fmaths/inventory'
    paths = [inventories / f'{code}-inventory.json' for code in ('8fm0', '9fm0')]
    rows = {p['paper_id']: p for path in paths + args.sample_inventory for p in read(path)['papers']}
    for pid in args.paper_ids:
        row = rows[pid]
        record = sample_record(row) if row.get('is_sample') else runtime[pid]
        render_paper(row, record, args.candidates / f'{pid}.json', args.reviews / f'{pid}.json',
                     args.sources, spec, args.rebuild)


if __name__ == '__main__':
    main()
