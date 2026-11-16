#!/usr/bin/env python3
"""Turn discovery results into the 9HI0 Route H source inventory, fetching each public PDF.

Each booklet gets a stable paper id, series, component, official marks/duration and
explicit document records (question paper with its enclosed extracts/sources booklet,
mark scheme, examiner report). Missing documents are recorded as not_found with the
probe evidence. Fetched files are cached privately as <paper_id>__<kind>.pdf and their
SHA256/bytes recorded; the cache is never committed.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

COMPONENT = {'1H': ('Paper 1: Breadth study with interpretations, Option 1H: Britain transformed, 1918–97', '1', 60, 135, ['1H']),
             '2H': ('Paper 2: Depth study, Option 2H.2: The USA, 1955–92: conformity and challenge', '2', 40, 90, ['2H.2']),
             '33': ('Paper 3: Themes in breadth with aspects in depth, Option 33: The witch craze in Britain, Europe and North America, c1580–c1750', '3', 60, 135, ['33'])}
SERIES = {2020: 'October', 2021: 'October'}


def fetch(url, target):
    if not (target.exists() and target.read_bytes()[:4] == b'%PDF'):
        subprocess.run(['curl', '-sS', '-f', '-m', '180', '-o', str(target), url], check=True)
    data = target.read_bytes()
    if data[:4] != b'%PDF':
        raise SystemExit(f'Not a PDF: {url}')
    return hashlib.sha256(data).hexdigest(), len(data)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('discovery', type=Path)
    p.add_argument('--cache', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--checked-at', default='2026-11-16')
    a = p.parse_args()
    a.cache.mkdir(parents=True, exist_ok=True)
    papers, restricted = [], []
    for key, docs in sorted(json.loads(a.discovery.read_text()).items()):
        _, comp, year = key.split('_'); year = int(year)
        title, paper, marks, minutes, options = COMPONENT[comp]
        pid = f'EDX_9HI0_{year}_{SERIES.get(year, "June").upper()}_{comp}'
        documents = {}
        for kind, rec in docs.items():
            d = {'availability': 'verified_public_pdf' if rec.get('url') else 'not_found', 'verified_at': a.checked_at,
                 'evidence': rec.get('method', 'name_probe'), 'probes': rec.get('probes')}
            if rec.get('url'):
                d['url'] = rec['url']
                d['sha256'], d['bytes'] = fetch(rec['url'], a.cache / f'{pid}__{kind}.pdf')
            else:
                d['window'] = rec.get('window')
            documents[kind] = d
        entry = {'paper_id': pid, 'qualification_code': '9HI0', 'is_as': False, 'year': year, 'series': SERIES.get(year, 'June'),
                 'component': comp, 'assessment_paper': paper, 'component_title': title, 'imported_options': options,
                 'variant': 'standard', 'max_marks': marks, 'duration_minutes': minutes, 'documents': documents}
        if documents.get('question_paper', {}).get('availability') == 'verified_public_pdf' and \
                documents.get('mark_scheme', {}).get('availability') == 'verified_public_pdf':
            papers.append(entry)
        else:
            entry['status'] = 'not_publicly_available'
            restricted.append(entry)
    inv = {'qualification': 'Pearson Edexcel A level History 9HI0, Route H (options 1H, 2H.2, 33)',
           'checked_at': a.checked_at, 'first_certification_year': 2017,
           'evidence_method': 'HEAD probes of Pearson exam-material file names on qualifications.pearson.com '
                              '(tools/history/discover.py), seeded with public web-search URLs; no secure or authenticated paths',
           'notes': 'Each question paper PDF encloses its Extracts/Sources Booklet after the answer pages. '
                    'The 9HI0/2H booklet also holds option 2H.1, which is out of scope and not imported.',
           'papers': papers, 'unavailable': restricted}
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / '9hi0-route-h-inventory.json').write_text(json.dumps(inv, ensure_ascii=False, indent=1) + '\n')
    print(len(papers), 'public booklets;', len(restricted), 'not public')


if __name__ == '__main__':
    main()
