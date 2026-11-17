#!/usr/bin/env python3
"""Build the AQA Sociology source inventory (A-level 7192 and AS 7191).

Usage: inventory.py RECORDS_JSON --sources DIR
Writes data/imports/sociology/inventory/{7192,7191}-inventory.json.

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
NAME = re.compile(r'^AQA-(719[12])([123])R?-(QP|SQP|MS|SMS|W-MS|INS|WRE|AC|EX)-?(.*)\.PDF$', re.I)
SERIES = re.compile(r'(JUN|NOV)(\d\d)')
TITLES = {('7192', '1'): 'Education with theory and methods', ('7192', '2'): 'Topics in sociology',
          ('7192', '3'): 'Crime and deviance with theory and methods',
          ('7191', '1'): 'Education with methods in context', ('7191', '2'): 'Research methods and topics in sociology'}
KIND = {'QP': 'question_paper', 'SQP': 'question_paper', 'MS': 'mark_scheme', 'SMS': 'mark_scheme', 'W-MS': 'mark_scheme',
        'INS': 'insert', 'WRE': 'examiner_report', 'AC': 'answers_and_commentary', 'EX': 'answers_and_commentary'}


def cover(path):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        text = ' '.join((pdf.pages[i].extract_text() or '') for i in range(min(2, len(pdf.pages))))
    marks = re.search(r'marks available for this paper is (\d+)|maximum mark for this paper is (\d+)', text)
    time = re.search(r'Time allowed:\s*(\d+) hours?(?: (?:and )?(\d+) minutes)?|Time allowed:\s*(\d+) minutes', text)
    minutes = None
    if time:
        minutes = int(time.group(3)) if time.group(3) else int(time.group(1)) * 60 + int(time.group(2) or 0)
    return (int(marks.group(1) or marks.group(2)) if marks else None), minutes, text


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
        sample = kind in ('SQP', 'SMS', 'AC', 'EX')
        if not s and not sample:
            continue
        if kind == 'EX' and rest not in ('', '2ND-SET'):
            continue   # later exemplar packs (EX-S4, EX-ADD) are not tied to one sample paper
        sample_set = 'SAMPLE2' if '2ND-SET' in rest else 'SAMPLE'
        key = (qual, comp, sample_set if sample else f"{'June' if s.group(1) == 'JUN' else 'November'} 20{s.group(2)}")
        modified = 'MQP' in rest
        path = a.sources / r['file_name']
        doc = {'availability': 'verified_public_pdf', 'verified_at': '2026-11-16', 'file_name': r['file_name'],
               'url': r['url'], 'sha256': hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None,
               'bytes': r['bytes'], 'publisher_sha1': r['publisher_sha1'], 'publication_date': r['publication_date'],
               'copyright_removed': rest.endswith('CR') or '-CR' in rest or rest == 'CR'}
        if modified:
            doc['variant'] = re.search(r'MQP\w+', rest).group(0)
        entry = booklets.setdefault(key, {'documents': {}, 'insert_variants': []})
        target = KIND[kind]
        if target == 'insert':
            entry['insert_variants'].append(doc)
        elif target == 'question_paper' and modified:
            continue   # modified question papers repeat the same questions
        else:
            if target in entry['documents'] and entry['documents'][target]['publisher_sha1'] != doc['publisher_sha1']:
                entry.setdefault('alternates', []).append(doc)   # a second listed revision (e.g. two 2nd-set schemes)
                continue
            if target in entry['documents']:
                raise SystemExit(f'Duplicate {target} for {key}: {r["file_name"]}')
            entry['documents'][target] = doc
    for qual in ('7192', '7191'):
        papers, missing = [], []
        for (q, comp, series), entry in sorted(booklets.items(), key=lambda kv: (kv[0][2].startswith('SAMPLE'), kv[0][2][-4:], kv[0][2], kv[0][1])):
            if q != qual:
                continue
            docs = entry['documents']
            sample = series.startswith('SAMPLE')
            year = None if sample else int(series[-4:])
            month = None if sample else series.split()[0]
            pid = f"AQA_{qual}_{series}_0{comp}" if sample else f"AQA_{qual}_{year}_{month.upper()}_0{comp}"
            if 'question_paper' not in docs:
                missing.append({'paper_id': pid, 'missing': 'question_paper', 'listed': sorted(docs)})
                continue
            max_marks, minutes, text = cover(a.sources / docs['question_paper']['file_name'])
            standard = [d for d in entry['insert_variants'] if 'variant' not in d]
            uses_insert = bool(re.search(r'in the insert|colour insert', text + ' '))
            paper = {'paper_id': pid, 'qualification_code': qual, 'is_as': qual == '7191', 'component': f'0{comp}',
                     'assessment_paper': comp, 'component_title': TITLES[(qual, comp)], 'year': year,
                     'series': 'Sample' if sample else month, 'is_sample': sample, 'max_marks': max_marks,
                     'duration_minutes': minutes, 'documents': docs,
                     'insert': standard[0] if standard else None, 'insert_variants': entry['insert_variants'],
                     'copyright_removed': docs['question_paper']['copyright_removed'] or any(d['copyright_removed'] for d in standard)}
            if sample:
                paper['sample_identity'] = 'AQA specimen material, ' + ('second set' if series == 'SAMPLE2' else 'first set')
                paper['sample_set'] = 2 if series == 'SAMPLE2' else 1
                if entry.get('alternates'):
                    paper['alternate_documents'] = entry['alternates']
            for kind in ('mark_scheme', 'examiner_report'):
                if kind not in docs:
                    paper.setdefault('unavailable', []).append(kind)
            papers.append(paper)
        out = {'qualification': qual, 'checked_at': '2026-11-16',
               'evidence_method': "AQA assessment-resources page data (originalFilename, sha1hash, size) for 7192 and 7191; files fetched from AQA's cdn.sanity.io asset URL and checked against the published sha1.",
               'notes': ['Only series on AQA public resources pages are used: no secure or teacher routes. June 2017-2019 and AS November 2021 are not listed publicly.',
                         '"-CR" files are AQA copyright-removed versions: a removed figure makes the dependent unit incomplete, so it is excluded and recorded.',
                         'Modified (MQP) question papers are skipped (same questions); modified inserts are listed as variants.',
                         'Maximum marks and duration come from each booklet cover (adapted sittings differ from the specification).'],
               'papers': papers, 'not_public': missing}
        target = REPO / 'data/imports/sociology/inventory' / f'{qual}-inventory.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
        print(qual, len(papers), 'booklets;', 'missing', missing)
        for p in papers:
            print(' ', p['paper_id'], p['max_marks'], p['duration_minutes'], 'MS' if 'mark_scheme' in p['documents'] else '--',
                  'ER' if 'examiner_report' in p['documents'] else '--', 'INS' if p['insert'] else ('ins-variants' if p['insert_variants'] else 'no-insert'),
                  'CR' if p['copyright_removed'] else '')


if __name__ == '__main__':
    main()
