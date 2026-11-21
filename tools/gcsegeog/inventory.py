#!/usr/bin/env python3
"""Build the AQA GCSE Geography 8035 source inventory.

Usage: inventory.py RECORDS_JSON --sources DIR
Writes data/imports/gcsegeog/inventory/8035-inventory.json.

RECORDS_JSON comes from resources.py (AQA's public assessment-resources pages) and
DIR from fetch.py. One booklet per qualification/component/series. Its question
paper is the standard version (a copyright-removed "-CR" standard file is used, and
flagged, when that is the only standard file AQA lists). Mark schemes, examiner
reports and sample answers are linked where AQA lists them; their absence is
recorded, never filled in. Inserts are listed with every published variant, because
AQA sometimes removes a figure from the standard insert but not from a modified one.
Maximum marks and duration are read from each booklet's own cover: some sittings
(AS June 2022 Paper 2) were adapted and differ from the specification.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
NAME = re.compile(r'^AQA-(8035)([123])-(QP|SQP|MS|SMS|W-MS|INS[12]?|WRE|AC|EX|PM|SIN|CM)-?(.*)\.PDF$', re.I)
SERIES = re.compile(r'(JUN|NOV)(\d\d)')
TITLES = {('8035', '1'): 'Living with the physical environment', ('8035', '2'): 'Challenges in the human environment',
          ('8035', '3'): 'Geographical applications'}
KIND = {'QP': 'question_paper', 'SQP': 'question_paper', 'MS': 'mark_scheme', 'SMS': 'mark_scheme', 'W-MS': 'mark_scheme',
        'INS': 'insert', 'INS1': 'insert', 'INS2': 'insert', 'PM': 'pre_release', 'CM': 'pre_release', 'SIN': 'insert', 'WRE': 'examiner_report', 'AC': 'answers_and_commentary', 'EX': 'answers_and_commentary'}


def cover(path):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        text = ' '.join((pdf.pages[i].extract_text() or '') for i in range(min(2, len(pdf.pages))))
    marks = re.search(r'marks available for this paper is (\d+)|maximum mark for this paper is (\d+)', text)
    time = re.search(r'Time allowed:\s*(\d+) hours?(?: (\d+) minutes)?|Time allowed:\s*(\d+) minutes', text)
    minutes = None
    if time:
        minutes = int(time.group(3)) if time.group(3) else int(time.group(1)) * 60 + int(time.group(2) or 0)
    return (int(marks.group(1) or marks.group(2)) if marks else None), minutes, text


def resource_cover(path):
    import pdfplumber
    if not path.exists():
        return False
    with pdfplumber.open(path) as pdf:
        return bool(re.search(r'Resources for Paper 3', pdf.pages[0].extract_text() or ''))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('records', type=Path)
    ap.add_argument('--sources', type=Path, required=True)
    a = ap.parse_args()
    booklets = {}
    for r in json.loads(a.records.read_text()):
        m = NAME.match(r['file_name'])
        if not m:
            continue
        qual, comp, kind, rest = m.group(1), m.group(2), m.group(3).upper(), m.group(4).upper()
        s = SERIES.search(rest)
        sample = kind in ('SQP', 'SMS', 'AC', 'EX', 'SIN')
        if not s and not sample:
            continue
        key = (qual, comp, 'SAMPLE' if sample else f"{'June' if s.group(1) == 'JUN' else 'November'} 20{s.group(2)}")
        modified = 'MQP' in rest
        path = a.sources / r['file_name']
        doc = {'availability': 'verified_public_pdf', 'verified_at': '2026-11-21', 'file_name': r['file_name'],
               'url': r['url'], 'sha256': hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None,
               'bytes': r['bytes'], 'publisher_sha1': r['publisher_sha1'], 'publication_date': r['publication_date'],
               'copyright_removed': rest.endswith('CR') or '-CR' in rest or rest == 'CR'}
        if modified:
            doc['variant'] = re.search(r'MQP\w+', rest).group(0)
        entry = booklets.setdefault(key, {'documents': {}, 'insert_variants': []})
        target = KIND[kind]
        if target == 'insert':
            entry['insert_variants'].append(doc)
        elif target == 'pre_release':
            entry.setdefault('pre_release', []).append(doc)
        elif target == 'question_paper' and modified:
            continue   # modified question papers repeat the same questions
        else:
            if target in entry['documents']:
                raise SystemExit(f'Duplicate {target} for {key}: {r["file_name"]}')
            entry['documents'][target] = doc
    for qual in ('8035',):
        papers, missing = [], []
        for (q, comp, series), entry in sorted(booklets.items(), key=lambda kv: (kv[0][2] == 'SAMPLE', kv[0][2][-4:], kv[0][2], kv[0][1])):
            if q != qual:
                continue
            docs = entry['documents']
            sample = series == 'SAMPLE'
            year = None if sample else int(series[-4:])
            month = None if sample else series.split()[0]
            pid = f"AQA_{qual}_SAMPLE_0{comp}" if sample else f"AQA_{qual}_{year}_{month.upper()}_0{comp}"
            if 'question_paper' not in docs:
                missing.append({'paper_id': pid, 'missing': 'question_paper', 'listed': sorted(docs)})
                continue
            max_marks, minutes, text = cover(a.sources / docs['question_paper']['file_name'])
            standard = [d for d in entry['insert_variants'] if 'variant' not in d]
            # Paper 3's "resources booklet" is the pre-release booklet. AQA files it as PM, CM, or (some series, and the
            # specimen) as an insert; the first page tells which. What remains is the OS map key or colour insert.
            pre = [d for d in entry.get('pre_release', []) if 'variant' not in d]
            resource = [d for d in pre + standard if resource_cover(a.sources / d['file_name'])]
            standard = [d for d in standard if d not in resource]
            uses_insert = bool(re.search(r'in the insert|colour insert', text + ' '))
            paper = {'paper_id': pid, 'qualification_code': qual, 'is_as': False, 'component': f'0{comp}',
                     'assessment_paper': comp, 'component_title': TITLES[(qual, comp)], 'year': year,
                     'series': 'Sample' if sample else month, 'is_sample': sample, 'max_marks': max_marks,
                     'duration_minutes': minutes, 'documents': docs,
                     'insert': standard[0] if standard else None, 'resource_booklet': resource[0] if resource else None, 'insert_variants': entry['insert_variants'], 'pre_release': entry.get('pre_release', []),
                     'copyright_removed': docs['question_paper']['copyright_removed'] or any(d['copyright_removed'] for d in standard)}
            if sample:
                paper['sample_identity'] = 'AQA specimen papers for the 2016 specification (published 2015)'
            for kind in ('mark_scheme', 'examiner_report'):
                if kind not in docs:
                    paper.setdefault('unavailable', []).append(kind)
            papers.append(paper)
        out = {'qualification': qual, 'checked_at': '2026-11-21',
               'evidence_method': "AQA assessment-resources page data (originalFilename, sha1hash, size) for 8035; files fetched from AQA's cdn.sanity.io asset URL and checked against the published sha1.",
               'notes': ['Only series on AQA public resources pages are used: no secure or teacher routes.',
                         '"-CR" files are AQA copyright-removed versions: a removed figure makes the dependent unit incomplete, so it is excluded and recorded.',
                         'Modified (MQP) question papers are skipped (same questions); modified inserts are listed as variants.',
                         'Maximum marks and duration come from each booklet cover (adapted sittings differ from the specification).'],
               'papers': papers, 'not_public': missing}
        target = REPO / 'data/imports/gcsegeog/inventory' / f'{qual}-inventory.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
        print(qual, len(papers), 'booklets;', 'missing', missing)
        for p in papers:
            print(' ', p['paper_id'], p['max_marks'], p['duration_minutes'], 'MS' if 'mark_scheme' in p['documents'] else '--',
                  'ER' if 'examiner_report' in p['documents'] else '--', 'INS' if p['insert'] else ('ins-variants' if p['insert_variants'] else 'no-insert'), 'RES' if p['resource_booklet'] else '---',
                  'CR' if p['copyright_removed'] else '')


if __name__ == '__main__':
    main()
