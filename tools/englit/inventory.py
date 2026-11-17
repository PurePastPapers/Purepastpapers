#!/usr/bin/env python3
"""Turn discovery results into the 9ET0 / 8ET0 source inventories, fetching each public PDF.

Usage: inventory.py DISCOVERY_JSON --research DIR [--checked-at DATE]

Each booklet gets a stable paper id, series, component, official marks/duration and
explicit document records (question paper, with the enclosed Source Booklet for A-level
Paper 3; mark scheme; examiner report). Missing documents are recorded as not_found with
the probe evidence. Fetched files are cached privately in DIR/sources as
<paper_id>__<kind>.pdf with their SHA256 and size recorded; the cache is never committed.

October 2020 mark schemes are published under a different name pattern
("9ET0_01_2010-revised-ms.pdf"), found by public web search and confirmed by HEAD; they
are added from REVISED below.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BASE = 'https://qualifications.pearson.com/content/dam/pdf/A-Level/English-Literature/2015/Exam-materials/'
COMPONENT = {('9ET0', '01'): ('Drama', '1', 60, 135), ('9ET0', '02'): ('Prose', '2', 40, 75), ('9ET0', '03'): ('Poetry', '3', 60, 135),
             ('8ET0', '01'): ('Poetry and Drama', '1', 72, 120), ('8ET0', '02'): ('Prose', '2', 44, 75)}
SERIES = {2020: 'October', 2021: 'October'}
REVISED = {(code, comp, 2020): f'{code}_{comp}_2010-revised-ms.pdf' for code, comp in COMPONENT}


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
    p.add_argument('--research', type=Path, required=True)
    p.add_argument('--checked-at', default='2026-11-16')
    a = p.parse_args()
    cache = a.research / 'sources'
    cache.mkdir(parents=True, exist_ok=True)
    found = json.loads(a.discovery.read_text())
    for (code, comp, year), name in REVISED.items():
        rec = found.setdefault(f'{code}_{comp}_{year}', {})
        if not rec.get('mark_scheme', {}).get('url'):
            rec['mark_scheme'] = {'url': BASE + name, 'status': 'verified_public_pdf', 'method': 'public_search_then_head'}
    out = {q: {'papers': [], 'unavailable': []} for q in ('9ET0', '8ET0')}
    for key, docs in sorted(found.items()):
        code, comp, year = key.split('_'); year = int(year)
        if code == '9ET0' and year == 2016:
            continue  # first A-level certification is 2017
        title, paper_no, marks, minutes = COMPONENT[(code, comp)]
        series = SERIES.get(year, 'June')
        pid = f'EDX_{code}_{year}_{series.upper()}_{comp}'
        documents = {}
        for kind, rec in docs.items():
            d = {'availability': 'verified_public_pdf' if rec.get('url') else 'not_found', 'verified_at': a.checked_at,
                 'evidence': rec.get('method', 'name_probe')}
            if rec.get('probes'):
                d['probes'] = rec['probes']
            if rec.get('url'):
                d['url'] = rec['url']
                d['file_name'] = f'{pid}__{kind}.pdf'
                d['sha256'], d['bytes'] = fetch(rec['url'], cache / d['file_name'])
            elif rec.get('window'):
                d['window'] = rec['window']
            documents[kind] = d
        entry = {'paper_id': pid, 'qualification_code': code, 'is_as': code == '8ET0', 'is_sample': False, 'year': year, 'series': series,
                 'component': comp, 'assessment_paper': paper_no, 'component_title': title, 'variant': 'standard',
                 'max_marks': marks, 'duration_minutes': minutes, 'documents': documents}
        if all(documents.get(k, {}).get('availability') == 'verified_public_pdf' for k in ('question_paper', 'mark_scheme')):
            out[code]['papers'].append(entry)
        else:
            entry['status'] = 'not_publicly_available'
            out[code]['unavailable'].append(entry)
    target = REPO / 'data/imports/englit/inventory'
    target.mkdir(parents=True, exist_ok=True)
    for code, inv in out.items():
        doc = {'qualification': f"Pearson Edexcel {'AS' if code == '8ET0' else 'A level'} English Literature {code}",
               'checked_at': a.checked_at, 'first_certification_year': 2016 if code == '8ET0' else 2017,
               'evidence_method': 'HEAD probes of Pearson exam-material file names on qualifications.pearson.com (tools/englit/discover.py), '
                                  'seeded with public web-search URLs; no secure or authenticated paths',
               'notes': 'A-level Paper 3 question papers enclose the Source Booklet (unseen and anthology poems, prescribed lists) after the answer pages. '
                        'Not public: papers from the last 12 months (June 2026), and AS papers in the October 2021 series (not sat).',
               **inv}
        (target / f'{code.lower()}-inventory.json').write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
        print(code, len(inv['papers']), 'public booklets;', len(inv['unavailable']), 'not public:', [e['paper_id'] for e in inv['unavailable']])


if __name__ == '__main__':
    main()
