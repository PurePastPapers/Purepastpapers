#!/usr/bin/env python3
"""Turn discovery results (+ acquired cache) into the GCSE Mathematics 1MA1 source inventory.

Each booklet gets a stable paper id (EDX_1MA1_<year>_<SERIES>_<1F..3H>), its tier,
series, paper number, official marks/duration and explicit document records. Missing
documents are recorded as not_found with the probe evidence instead of being omitted.
"""
import argparse, hashlib, json
from pathlib import Path

PAPERS = {'1': 'Paper 1 (Non-Calculator)', '2': 'Paper 2 (Calculator)', '3': 'Paper 3 (Calculator)'}
TIERS = {'F': 'Foundation', 'H': 'Higher'}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('discovery', type=Path, nargs='+', help='discovery JSON files (one per series is fine)')
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--cache', type=Path, help='source cache; verified files supply SHA256/bytes')
    p.add_argument('--checked-at', default='2026-11-17')
    a = p.parse_args()
    found = {}
    for f in a.discovery:
        found.update(json.loads(f.read_text()))
    papers, restricted = [], []
    order = lambda k: (int(k.split('_')[2]), k.split('_')[3] != 'JUNE', k.split('_')[1][1], k.split('_')[1][0])
    for key in sorted(found, key=order):
        docs = found[key]
        _, comp, year, series = key.split('_'); year = int(year)
        pid = f'EDX_1MA1_{year}_{series}_{comp}'
        documents = {}
        for kind, rec in docs.items():
            d = {'availability': 'verified_public_pdf' if rec.get('url') else 'not_found', 'verified_at': a.checked_at,
                 'evidence': rec.get('method', 'name_probe'), 'probes': rec.get('probes')}
            if rec.get('url'):
                d['url'] = rec['url']
                cached = a.cache / f'{pid}__{kind}.pdf' if a.cache else None
                if cached and cached.exists() and cached.read_bytes()[:4] == b'%PDF':
                    data = cached.read_bytes()
                    d['sha256'], d['bytes'] = hashlib.sha256(data).hexdigest(), len(data)
            else:
                d['window'] = rec.get('window')
            documents[kind] = d
        entry = {'paper_id': pid, 'qualification_code': '1MA1', 'year': year, 'series': series.title(),
                 'component': comp, 'assessment_paper': comp[0], 'tier': TIERS[comp[1]],
                 'component_title': f'{PAPERS[comp[0]]} ({TIERS[comp[1]]})', 'calculator': comp[0] != '1',
                 'variant': 'standard', 'max_marks': 80, 'duration_minutes': 90, 'documents': documents}
        qp, ms = documents.get('question_paper', {}), documents.get('mark_scheme', {})
        if qp.get('availability') != 'verified_public_pdf' or ms.get('availability') != 'verified_public_pdf':
            entry['status'] = 'not_publicly_available'
            entry['missing'] = [k for k, d in (('question_paper', qp), ('mark_scheme', ms)) if d.get('availability') != 'verified_public_pdf']
            restricted.append(entry)
        else:
            papers.append(entry)
    inv = {'qualification': 'Pearson Edexcel Level 1/Level 2 GCSE (9-1) in Mathematics 1MA1',
           'checked_at': a.checked_at, 'first_certification_year': 2017,
           'series_note': 'May/June and November series. Summer 2020 and 2021 exams were not sat; November 2020 and 2021 were.',
           'evidence_method': 'HEAD probes of Pearson exam-material file names on qualifications.pearson.com '
                              '(tools/gcsemaths/discover.py); no secure or authenticated paths',
           'papers': papers, 'unavailable': restricted}
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / '1ma1-inventory.json').write_text(json.dumps(inv, indent=1) + '\n')
    print(len(papers), 'public booklets;', len(restricted), 'not public')


if __name__ == '__main__':
    main()
