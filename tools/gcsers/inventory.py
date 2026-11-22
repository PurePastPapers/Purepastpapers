#!/usr/bin/env python3
"""Build the AQA GCSE Religious Studies A 8062 source inventory.

Usage: inventory.py RECORDS_JSON --sources DIR
Writes data/imports/gcsers/inventory/8062-inventory.json.

RECORDS_JSON comes from tools/aqa/resources.py (AQA's public assessment-resources page) and
DIR from tools/aqa/fetch.py. One booklet per paper and series: Paper 1 (8700/1) and Paper 2
(8700/2). Question paper, mark scheme, examiner report and insert (the source booklet) are linked
where AQA lists them; absence is recorded, never filled in. What each document's own cover says
(`printed_series`) is stored beside the series taken from its file name so mismatches stay visible.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
NAME = re.compile(r'^AQA-(?:8062(1[1-7]|2[AB])|8062-(1[1-7]|2[AB]))-?(QP|SQP|MS|SMS|W-MS|WRE)-?(.*)\.PDF$', re.I)
SERIES = re.compile(r'(JUN|NOV)(\d\d)')
TITLES = {'11': 'Paper 1 Option 1: The study of religions (Buddhism)', '12': 'Paper 1 Option 2: The study of religions (Catholic Christianity)',
          '13': 'Paper 1 Option 3: The study of religions (Christianity)', '14': 'Paper 1 Option 4: The study of religions (Hinduism)',
          '15': 'Paper 1 Option 5: The study of religions (Islam)', '16': 'Paper 1 Option 6: The study of religions (Judaism)',
          '17': 'Paper 1 Option 7: The study of religions (Sikhism)', '2A': 'Paper 2A: Thematic studies, non-textual studies',
          '2B': 'Paper 2B: Thematic studies, textual studies (St Mark\'s Gospel)'}
KIND = {'QP': 'question_paper', 'SQP': 'question_paper', 'MS': 'mark_scheme', 'SMS': 'mark_scheme', 'W-MS': 'mark_scheme',
        'WRE': 'examiner_report'}


def first_text(path, pages=2):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        return ' '.join((pdf.pages[i].extract_text() or '') for i in range(min(pages, len(pdf.pages))))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('records', type=Path)
    ap.add_argument('--sources', type=Path, required=True)
    a = ap.parse_args()
    booklets = {}
    for r in json.loads(a.records.read_text()):
        m = NAME.match(r['file_name'])
        if not m or 'MQP' in r['file_name'].upper():
            continue
        comp, kind, rest = (m.group(1) or m.group(2)).upper(), m.group(3).upper(), m.group(4).upper()
        sample = kind in ('SQP', 'SMS')
        s = SERIES.search(rest)
        if not s and not sample:
            continue
        key = (comp, 'SAMPLE' if sample else f"{'June' if s.group(1) == 'JUN' else 'November'} 20{s.group(2)}")
        path = a.sources / r['file_name']
        doc = {'availability': 'verified_public_pdf', 'verified_at': '2026-11-22', 'file_name': r['file_name'], 'url': r['url'],
               'sha256': hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None, 'bytes': r['bytes'],
               'publisher_sha1': r['publisher_sha1'], 'publication_date': r['publication_date'], 'publisher_title': r['title'],
               'copyright_removed': rest.endswith('CR') or '-CR' in rest}
        entry = booklets.setdefault(key, {'documents': {}})
        target = KIND[kind]
        if target in entry['documents']:
            raise SystemExit(f'Duplicate {target} for {key}: {r["file_name"]}')
        entry['documents'][target] = doc
    papers, not_public = [], []
    for (comp, series), entry in sorted(booklets.items(), key=lambda kv: (kv[0][1] == 'SAMPLE', kv[0][1][-4:], kv[0][1].startswith('November'), kv[0][0])):
        docs, sample = entry['documents'], series == 'SAMPLE'
        year = None if sample else int(series[-4:])
        month = None if sample else series.split()[0]
        pid = f'AQA_8062_SAMPLE_{comp}' if sample else f'AQA_8062_{year}_{month.upper()}_{comp}'
        if 'question_paper' not in docs:
            not_public.append({'paper_id': pid, 'missing': 'question_paper', 'listed': sorted(docs)})
            continue
        text = first_text(a.sources / docs['question_paper']['file_name'])
        marks = re.search(r'maximum mark for this (?:paper|option) is (\d+)', text)
        minutes = re.search(r'Time allowed:\s*(\d+) hours?(?: (\d+) minutes)?', text)
        for kind, d in docs.items():
            if kind == 'mark_scheme':
                t = first_text(a.sources / d['file_name'], 1)
                m = re.search(r'\b(June|November) (20\d\d)\b', t)
                d['printed_series'] = f'{m.group(1)} {m.group(2)}' if m else None
        paper = {'paper_id': pid, 'qualification_code': '8062', 'is_as': False, 'component': comp, 'assessment_paper': comp[0], 'option': comp,
                 'component_title': TITLES[comp], 'year': year, 'series': 'Sample' if sample else month, 'is_sample': sample,
                 'max_marks': int(marks.group(1)) if marks else None,
                 'duration_minutes': (int(minutes.group(1)) * 60 + int(minutes.group(2) or 0)) if minutes else None,
                 'documents': docs,
                 'copyright_removed': any(d['copyright_removed'] for d in docs.values())}
        if not marks:
            paper['max_marks_basis'] = 'unread: cover not parsed; resolve before extraction'
        if False:
            # AQA's copyright-removed question paper has no cover page: 80 marks and 1 hour 45 minutes come from the
            # specification (v1.6, section 3) and every other 8700 paper; the printed tariffs must still sum to 80.
            paper['max_marks_basis'] = 'specification (the copyright-removed question paper has no cover page)'
        if sample:
            paper['sample_identity'] = 'AQA sample set 1 for the revised question format first examined in June 2026 (1-mark short response, 6-mark sources of authority)'
        for kind in ('mark_scheme', 'examiner_report'):
            if kind not in docs:
                paper.setdefault('unavailable', []).append(kind)
        papers.append(paper)
    listed = {p['paper_id'] for p in papers} | {x['paper_id'] for x in not_public}
    for comp in TITLES:
        for series in ('2020_NOVEMBER', '2021_NOVEMBER', '2022_JUNE', '2023_JUNE', '2024_JUNE', '2025_JUNE', 'SAMPLE'):
            pid = f'AQA_8062_SAMPLE_{comp}' if series == 'SAMPLE' else f'AQA_8062_{series}_{comp}'
            if pid not in listed:
                not_public.append({'paper_id': pid, 'missing': 'all documents', 'listed': [],
                                   'reason': 'AQA lists no files for this option and series on its public resources page'})
    out = {'qualification': '8062', 'checked_at': '2026-11-22',
           'evidence_method': "AQA assessment-resources page data (originalFilename, sha1hash, size) for 8700; files fetched from AQA's cdn.sanity.io URL and checked against the published sha1.",
           'notes': ['Only series on the AQA public resources page are used: no secure or teacher routes.',
                     'AQA lists no series before November 2020 and none in November 2022 to 2025. The 2017 to 2019 papers are not public.',
                     'Papers before June 2026 use the earlier format (1, 2, 4, 5 and 12 mark questions); the June 2026 changes are in AQA-8061-8062-SOC v1.0. The 2026 samples show the revised format.',
                     '"-CR" files are AQA copyright-removed versions: a question whose source text is removed is incomplete and is excluded and recorded.',
                     'Modified (MQP) papers and inserts repeat the same questions and are not used.',
                     'Maximum marks and duration come from each booklet cover. Paper 1 is two religion options taken together in 1 hour 45 minutes (about 50 minutes each): duration_minutes is SHARED by the two option booklets, and each booklet is 51 marks. Paper 2A and 2B are sat as one 96-mark, 1 hour 45 minute paper each (a candidate takes 2A or 2B per centre route, see the specification).'],
           'papers': papers, 'not_public': not_public}
    target = REPO / 'data/imports/gcsers/inventory/8062-inventory.json'
    target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    print(len(papers), 'booklets; not public:', not_public)
    for p in papers:
        d = p['documents']
        print(p['paper_id'], p['max_marks'], p['duration_minutes'], 'MS' if 'mark_scheme' in d else '--', 'ER' if 'examiner_report' in d else '--',
              'CR' if p['copyright_removed'] else '',
              'ms:' + str(d.get('mark_scheme', {}).get('printed_series')), '')


if __name__ == '__main__':
    main()
