#!/usr/bin/env python3
"""Turn discovery results into the 1HI0 source inventory, fetching each public PDF.

Booklets in scope: Paper 1 option 10, Paper 2 booklet B1 and Paper 3 option 31. Each gets a stable
paper id (EDX_1HI0_<year>_<SERIES>_<10|B1|31>), official marks and explicit document records
(question paper with its enclosed Sources booklet, mark scheme, examiner report) with SHA256,
size and the server's Last-Modified date. A booklet without both a public question paper and a
public scheme is listed as not publicly available and never filled in. Fetched files are cached
privately as <paper_id>__<kind>.pdf; the cache is never committed.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

COMPONENT = {
    '10': ('Paper 1: Thematic study and historic environment, Option 10: Crime and punishment in Britain, c1000–present and Whitechapel, c1870–c1900: crime, policing and the inner city',
           '1', 52, ['10']),
    'B1': ('Paper 2, Booklet B: British depth study, Option B1: Anglo-Saxon and Norman England, c1060–88', '2', 32, ['B1']),
    '31': ('Paper 3: Modern depth study, Option 31: Weimar and Nazi Germany, 1918–39', '3', 52, ['31']),
}
SHORT = {'10': 'Paper 1 (option 10)', 'B1': 'Paper 2, Booklet B1', '31': 'Paper 3 (option 31)'}


def fetch(url, target):
    headers = target.with_suffix('.hdr')
    if not (target.exists() and target.read_bytes()[:4] == b'%PDF' and headers.exists()):
        subprocess.run(['curl', '-sS', '-f', '-m', '180', '-A', 'Mozilla/5.0', '-D', str(headers), '-o', str(target), url], check=True)
    data = target.read_bytes()
    if data[:4] != b'%PDF':
        raise SystemExit(f'Not a PDF: {url}')
    m = re.search(r'(?im)^last-modified:\s*(.+)$', headers.read_text())
    return hashlib.sha256(data).hexdigest(), len(data), m.group(1).strip() if m else None


def minutes(pdf):
    """Printed duration from the cover: 'Time: 1 hour 15 minutes'. Booklet B1 prints the time for both booklets."""
    text = subprocess.run(['pdftotext', '-f', '1', '-l', '1', str(pdf), '-'], capture_output=True, text=True).stdout
    m = re.search(r'Time:\s*(?:(\d+) hours?)?\s*(?:and\s*)?(?:(\d+) minutes?)?', text)
    if not m or not (m.group(1) or m.group(2)):
        return None
    return int(m.group(1) or 0) * 60 + int(m.group(2) or 0)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('discovery', type=Path, nargs='+')
    p.add_argument('--cache', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--checked-at', default='2026-11-21')
    a = p.parse_args()
    a.cache.mkdir(parents=True, exist_ok=True)
    found = {}
    for path in a.discovery:
        for key, docs in json.loads(path.read_text()).items():
            slot = found.setdefault(key, {})
            for kind, rec in docs.items():
                if rec.get('url') or kind not in slot:
                    slot[kind] = rec
    papers, unavailable = [], []
    for key, docs in sorted(found.items()):
        _, comp, year = key.split('_')
        year = int(year)
        title, paper, marks, options = COMPONENT[comp]
        pid = f'EDX_1HI0_{year}_JUNE_{comp}'
        documents = {}
        for kind, rec in docs.items():
            d = {'availability': 'verified_public_pdf' if rec.get('url') else 'not_found', 'verified_at': a.checked_at,
                 'evidence': rec.get('method', 'name_probe'), 'probes': rec.get('probes')}
            if rec.get('url'):
                d['url'] = rec['url']
                d['file_name'] = f'{pid}__{kind}.pdf'
                d['sha256'], d['bytes'], d['last_modified'] = fetch(rec['url'], a.cache / d['file_name'])
            else:
                d['window'] = rec.get('window')
            documents[kind] = d
        entry = {'paper_id': pid, 'qualification_code': '1HI0', 'is_as': False, 'is_sample': False, 'year': year, 'series': 'June',
                 'component': comp, 'assessment_paper': paper, 'component_title': title, 'short_title': SHORT[comp], 'imported_options': options,
                 'max_marks': marks, 'documents': documents}
        if all(documents.get(k, {}).get('availability') == 'verified_public_pdf' for k in ('question_paper', 'mark_scheme')):
            printed = minutes(a.cache / documents['question_paper']['file_name'])
            entry['printed_minutes'] = printed
            entry['duration_minutes'] = round(printed / 2) if comp == 'B1' and printed else printed
            if comp == 'B1':
                entry['duration_note'] = 'The cover prints the time for both booklets (P and B); half is used for booklet B (32 of 64 marks).'
            papers.append(entry)
        else:
            entry['status'] = 'not_publicly_available'
            unavailable.append(entry)
    inv = {'qualification': 'Pearson Edexcel GCSE (9-1) History 1HI0, options 10, B1 and 31',
           'checked_at': a.checked_at, 'first_certification_year': 2018,
           'evidence_method': 'HEAD probes of Pearson exam-material file names on qualifications.pearson.com (tools/gcsehistory/discover.py); '
                              'the exam-materials listing page is script-driven. No secure or authenticated paths.',
           'notes': 'Each question paper PDF encloses its Sources or Sources/Interpretations booklet after the answer pages (booklets 10 and 31). '
                    'Paper 2 is two booklets, B (British depth study) and P (period study); only booklet B1 is imported.',
           'papers': papers, 'not_public': unavailable}
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / '1hi0-inventory.json').write_text(json.dumps(inv, ensure_ascii=False, indent=1) + '\n')
    print(len(papers), 'public booklets;', len(unavailable), 'not public')


if __name__ == '__main__':
    main()
