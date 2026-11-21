#!/usr/bin/env python3
"""Verify built Pearson GCSE History 1HI0 packs, record coverage and identities, and (with
--activate) package their crops as lazy lossless catalogues and list them in the live pack index.

Usage: finalize.py --research DIR [--activate]
Published identities are immutable: a changed mark meaning needs a new question id.
Pearson permission is recorded by the owner and is assumed to cover Pearson's GCSE History papers and
mark schemes (the owner's 21 November 2026 decision); --activate publishes the packs and writes
the lazy crop catalogues. Without it, packs are verified but kept out of the index.
"""
import argparse
import base64
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OPTION_NAME = {'10': 'Paper 1 (option 10)', 'B1': 'Paper 2 (booklet B1)', '31': 'Paper 3 (option 31)'}


def read(path):
    return json.loads(path.read_text())


def write(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text((json.dumps(value, separators=(',', ':')) if compact else json.dumps(value, ensure_ascii=False, indent=2)) + '\n')


def package(pack_path, pid):
    names = sorted(set(re.findall(r'assets/gcsehistory/' + pid + r'/([A-Za-z0-9_]+\.webp)', pack_path.read_text())))
    assets = {}
    for name in names:
        data = (REPO / 'assets/gcsehistory' / pid / name).read_bytes()
        assert len(data) > 200, (pid, name)
        assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
    write(REPO / 'data/gcsehistory-assets' / f'{pid}.json', {'format': 'lossless-webp-catalogue-v1', 'paper_id': pid, 'assets': assets}, compact=True)
    return len(assets)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--research', type=Path, required=True)
    ap.add_argument('--activate', action='store_true')
    a = ap.parse_args()
    research = a.research.resolve()
    target = REPO / 'data/imports/gcsehistory'
    registry_path = target / 'identities.json'
    previous = read(registry_path)['units'] if registry_path.exists() else {}
    inv = read(target / 'inventory' / '1hi0-inventory.json')
    identities, packs, queue, excluded = {}, [], [], []
    groups, difficulty, sections = defaultdict(Counter), Counter(), Counter()
    per_series = defaultdict(Counter)
    for paper in inv['papers']:
        pid = paper['paper_id']
        pack_path = REPO / 'data/packs/gcsehistory' / f'{pid}.json'
        cand_path, review_path = research / 'candidates' / f'{pid}.json', research / 'reviews' / f'{pid}.json'
        if not (pack_path.exists() and review_path.exists() and cand_path.exists()):
            queue.append({'paper_id': pid, 'reason': 'awaiting model review' if cand_path.exists() else 'awaiting extraction'})
            continue
        cand, review, pack = read(cand_path), read(review_path), read(pack_path)
        assert review['source_sha256'] == cand['source_sha256'] == paper['documents']['question_paper']['sha256'], pid
        assert cand['total_marks'] == paper['max_marks'] and not cand['exceptions'], pid
        [runtime] = pack['papers']
        ex = runtime.get('excluded_questions', [])
        published = {u['question_number'] + u.get('part_label', ''): u for u in pack['questions']}
        assert all(u['question_number'] + u.get('part_label', '') == u['scheme_question_number'] for u in pack['questions']), pid
        assert set(published) | {e['question_number'] for e in ex} == {u['label'] for u in cand['units']}, pid
        grouped = {x for g in cand['choice_groups'] for x in g}
        eff = lambda items: sum(m for l, m in items.items() if l not in grouped) + sum(max(items[x] for x in g if x in items) for g in cand['choice_groups'] if any(x in items for x in g))
        assert eff({l: u['marks'] for l, u in published.items()}) + sum(e['marks'] for e in ex if e['question_number'] not in grouped) <= paper['max_marks'] or ex, pid
        if not ex:
            assert eff({l: u['marks'] for l, u in published.items()}) == paper['max_marks'] == cand['total_marks'], pid
        for e in ex:
            excluded.append({'paper_id': pid, **e})
        key = OPTION_NAME[paper['component']]
        g = groups[key]
        g.update(booklets=1, printed_units=len(cand['units']), scored_units=len(pack['questions']), excluded_units=len(ex),
                 marks_available=paper['max_marks'], published_marks_counting_one_per_choice_group=eff({l: u['marks'] for l, u in published.items()}),
                 published_marks_all_units=sum(u['marks'] for u in pack['questions']),
                 with_examiner_report=int(bool(runtime.get('examiner_report_url'))))
        per_series[f"{paper['series']} {paper['year']}"].update({OPTION_NAME[paper['component']]: len(pack['questions'])})
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
            packs.append({'file': f'gcsehistory/{pid}.json'})
    assert previous.keys() <= identities.keys(), 'Published History identities removed'
    if a.activate:
        index_path = REPO / 'data/packs/index.json'
        other = [x for x in read(index_path)['packs'] if not x['file'].startswith('gcsehistory/')]
        write(index_path, {'packs': other + sorted(packs, key=lambda x: x['file'])})
    spec = read(REPO / 'data/specs/EDX_GCSE_HIST_1HI0.json')
    ids = spec['point_order']
    totals = Counter()
    for g in groups.values():
        totals.update(g)
    coverage = {'checked_at': '2026-11-21', 'reviewer_type': 'model', 'subject_id': 'EDX_GCSE_HIST_1HI0',
                'status': ('complete' if a.activate else 'built_awaiting_activation') if not queue else 'partial',
                'published': bool(a.activate),
                'rights_basis': 'Assumed: the owner recorded Pearson permission, which covers Pearson papers and mark schemes; this import states that assumption and the owner has not separately confirmed GCSE History.',
                'groups': {k: dict(v) for k, v in sorted(groups.items())}, 'totals': dict(totals),
                'units_per_series': {k: dict(v) for k, v in sorted(per_series.items())},
                'difficulty': dict(difficulty), 'units_per_leaf': {i: sections.get(i, 0) for i in ids},
                'leaves_without_primary_units': [i for i in ids if not sections.get(i)],
                'excluded_copyright_removed': excluded, 'queued_public_booklets': queue,
                'not_publicly_available': inv.get('not_public', []),
                'excluded_by_scope': ['Paper 1 options 11, 12, 13', 'Paper 2 period-study booklets P1 to P5 (the other booklet of every Paper 2 combination)',
                                      'Paper 2 British depth studies B2, B3, B4', 'Paper 3 options 30, 32, 33',
                                      'Vikings and a local-history site study (Verulamium): not Edexcel 1HI0 options'],
                'source_question_count_basis': 'One scored unit per printed part with its own tariff; 5/6, 1(c)(i)/(ii) are choice groups counted once towards the booklet maximum; 5, 6 and 3(d) include 4 SPaG marks.'}
    write(target / 'coverage.json', coverage)
    write(registry_path, {'format': 'gcsehistory-assessment-identity-v1', 'units': identities})
    print(json.dumps({k: coverage[k] for k in ('status', 'totals', 'difficulty', 'leaves_without_primary_units')}, indent=1),
          len(queue), 'queued', len(excluded), 'excluded')


if __name__ == '__main__':
    main()
