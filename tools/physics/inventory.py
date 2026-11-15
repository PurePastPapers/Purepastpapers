#!/usr/bin/env python3
"""Turn discovery results (+ acquisition ledger) into the 9PH0/8PH0 source inventories.

Each exam booklet gets a stable paper id, its real qualification, series, component,
official marks/duration and three explicit document records. Missing documents are
recorded as not_found with the probe evidence instead of being omitted. When an
acquisition ledger exists, verified SHA256/bytes are merged into the documents.
"""
import argparse, hashlib, json
from pathlib import Path

COMPONENT = {
    ('9PH0', '01'): ('Advanced Physics I', 90, 105),
    ('9PH0', '02'): ('Advanced Physics II', 90, 105),
    ('9PH0', '03'): ('General and Practical Principles in Physics', 120, 150),
    ('8PH0', '01'): ('Core Physics I', 80, 90),
    ('8PH0', '02'): ('Core Physics II', 80, 90),
}
SERIES = {2020: 'October', 2021: 'October'}


def paper_id(code, year, comp):
    return f'EDX_{code}_{year}_{SERIES.get(year, "June").upper()}_{comp}'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('discovery', type=Path)
    p.add_argument('--ledger', type=Path)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--cache', type=Path, help='source cache; verified files supply SHA256/bytes')
    p.add_argument('--checked-at', default='2026-11-15')
    a = p.parse_args()
    found = json.loads(a.discovery.read_text())
    ledger = json.loads(a.ledger.read_text()) if a.ledger and a.ledger.exists() else {}
    for code in ['9PH0', '8PH0']:
        papers, restricted = [], []
        for key, docs in sorted(found.items()):
            c, comp, year = key.split('_'); year = int(year)
            if c != code:
                continue
            title, marks, minutes = COMPONENT[(code, comp)]
            pid = paper_id(code, year, comp)
            documents = {}
            for kind, rec in docs.items():
                d = {'availability': 'verified_public_pdf' if rec.get('url') else 'not_found', 'verified_at': a.checked_at,
                     'evidence': rec.get('method', 'name_probe'), 'probes': rec.get('probes')}
                if rec.get('url'):
                    d['url'] = rec['url']
                    got = ledger.get(f'{pid}__{kind}', {})
                    cached = a.cache / f'{pid}__{kind}.pdf' if a.cache else None
                    if cached and cached.exists() and cached.read_bytes()[:4] == b'%PDF':
                        data = cached.read_bytes()
                        got = {'status': 'verified', 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
                    if got.get('status') == 'verified':
                        d['sha256'], d['bytes'] = got['sha256'], got['bytes']
                else:
                    d['window'] = rec.get('window')
                documents[kind] = d
            entry = {'paper_id': pid, 'qualification_code': code, 'is_as': code == '8PH0', 'year': year,
                     'series': SERIES.get(year, 'June'), 'component': comp, 'assessment_paper': str(int(comp)),
                     'component_title': title, 'variant': 'standard', 'max_marks': marks, 'duration_minutes': minutes,
                     'documents': documents}
            if documents.get('question_paper', {}).get('availability') != 'verified_public_pdf':
                entry['status'] = 'not_publicly_available'
                restricted.append(entry)
            else:
                papers.append(entry)
        inv = {'qualification': f'Pearson Edexcel {"AS" if code == "8PH0" else "A level"} Physics {code}',
               'checked_at': a.checked_at, 'first_certification_year': 2016 if code == '8PH0' else 2017,
               'evidence_method': 'HEAD probes of Pearson exam-material file names on qualifications.pearson.com '
                                  '(tools/physics/discover.py), seeded with public web-search URLs; no secure or authenticated paths',
               'papers': papers, 'unavailable': restricted}
        a.out.mkdir(parents=True, exist_ok=True)
        (a.out / f'{code.lower()}-inventory.json').write_text(json.dumps(inv, indent=1) + '\n')
        print(code, len(papers), 'public booklets;', len(restricted), 'not public')


if __name__ == '__main__':
    main()
