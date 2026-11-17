#!/usr/bin/env python3
"""Inventory and cache OCR's public Chemistry A H432 (A level) / H032 (AS) assessment materials.

Usage: inventory.py PAGE_HTML --sources DIR
  PAGE_HTML: https://www.ocr.org.uk/qualifications/as-and-a-level/chemistry-a-h032-h432-from-2015/assessment/
Writes data/imports/chem/inventory/{H432,H032}-inventory.json.
Adapted from tools/cs/inventory.py. Data sheets/booklets are series-level inserts shared by H032 and H432
and are recorded as shared documents. The practical endorsement (H432/04) is not a written exam and is excluded.

The page lists, under "YYYY - June|November series" headings, each document as a link
labelled "Question paper - Computer systems H446/01", "Mark scheme - ...", "Examiners'
report - ...", plus "Sample assessment materials" (one PDF holding the sample question
paper and its mark scheme). Modified-paper ZIPs repeat the same questions and are not
used; moderators' reports and the programming-project sample are coursework.

OCR publishes no checksums, so each PDF is fetched once into an immutable cache, checked
for a PDF header, and recorded with its SHA-256, size and the server's Last-Modified date.
Maximum marks and duration are read from each question paper's cover.
"""
import argparse
import hashlib
import html
import json
import re
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BASE = 'https://www.ocr.org.uk'
TODAY = '2026-11-17'
TITLES = {('H432', '01'): 'Periodic table, elements and physical chemistry', ('H432', '02'): 'Synthesis and analytical techniques',
          ('H432', '03'): 'Unified chemistry', ('H032', '01'): 'Breadth in chemistry', ('H032', '02'): 'Depth in chemistry'}


def entries(page):
    h = open(page, encoding='utf-8', errors='replace').read()
    out, series, section = [], None, 0
    for m in re.finditer(r'<h[34][^>]*>(.*?)</h[34]>|<li[^>]*>(.*?)</li>', h, re.S):
        head, li = m.groups()
        if head:
            text = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', head))).strip()
            if text.startswith('Question papers, mark schemes'):
                section += 1
            s = re.match(r'(\d{4}) - (June|November) series', text)
            series = (int(s.group(1)), s.group(2)) if s else ('SAMPLE' if 'Sample assessment' in text else None)
            continue
        a = re.search(r'href=["\'](/Images/[^"\']+)["\']', li or '')
        if not a or series is None:
            continue
        label = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', li))).strip()
        out.append({'series': series, 'section': section, 'label': label, 'url': BASE + a.group(1), 'file_name': a.group(1).rsplit('/', 1)[1]})
    return out


def kind_of(e):
    lab = e['label']
    if lab.startswith('Data'):
        return 'data_sheet'
    if e['series'] == 'SAMPLE' and re.search(r'Sample question paper and mark scheme', lab):
        return 'sample_paper_and_scheme'
    if lab.startswith('Question paper') and 'post exam correction' in lab:
        return 'question_paper_corrected'
    if lab.startswith('Question paper') and 'erratum' in lab:
        return 'erratum'
    for prefix, kind in (('Question paper', 'question_paper'), ('Mark scheme', 'mark_scheme'), ("Examiners' report", 'examiner_report')):
        if lab.startswith(prefix):
            return kind
    return None


def fetch(url, target):
    if not target.exists():
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=180) as r:
            data, modified = r.read(), r.headers.get('Last-Modified')
        if data[:5] != b'%PDF-':
            raise SystemExit(f'Not a PDF: {url}')
        target.write_bytes(data)
        target.with_suffix('.meta.json').write_text(json.dumps({'url': url, 'last_modified': modified}))
    data = target.read_bytes()
    assert data[:5] == b'%PDF-', target
    meta = json.loads(target.with_suffix('.meta.json').read_text())
    return hashlib.sha256(data).hexdigest(), len(data), meta.get('last_modified')


def cover(path):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        text = ' '.join((pdf.pages[i].extract_text() or '') for i in range(min(2, len(pdf.pages))))
    marks = re.search(r'total mark for this paper is (\d+)|maximum mark for this paper is (\d+)|\bTotal[^\d]{0,12}(\d{2,3})\b', text)
    hours = re.search(r'(\d) hours? (?:and )?(\d+) minutes|(\d+) hours?\b|(\d+) minutes', text)
    minutes = None
    if hours:
        if hours.group(1):
            minutes = int(hours.group(1)) * 60 + int(hours.group(2))
        elif hours.group(3):
            minutes = int(hours.group(3)) * 60
        else:
            minutes = int(hours.group(4))
    m = next((int(g) for g in (marks.groups() if marks else []) if g), None)
    return m, minutes


# Checked facts read from the rendered covers / board correction notices, keyed by paper.
OVERRIDES = {
    'OCR_H432_2022_JUNE_01': {
        'duration_minutes': 135,
        'duration_basis': 'the cover time line is not machine-readable; H432/01 is 2 hours 15 minutes in every other series and in the specification',
        'withdrawn_questions': [{'question_number': '13', 'reason': 'OCR post-exam correction (13 June 2022): "Cross out all of question 13 and do not attempt to answer it"; the paper total becomes 99.'}],
        'effective_total_marks': 99},
    'OCR_H032_2017_JUNE_01': {
        'erratum_units': ['23(c)'],
        'erratum_note': 'OCR erratum notice (26 May 2017): the units printed after the Kc answer space on page 19 are wrong; they should read dm^6 mol^-2, not dm^2 mol^-6.'}}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('page', type=Path)
    ap.add_argument('--sources', type=Path, required=True)
    a = ap.parse_args()
    a.sources.mkdir(parents=True, exist_ok=True)
    booklets, shared, series_docs, skipped = {}, {}, {}, []
    for e in entries(a.page):
        qual = 'H432' if e['section'] == 1 else 'H032'
        if e['section'] not in (1, 2) and e['series'] != 'SAMPLE':
            continue
        lab = e['label']
        if e['series'] == 'SAMPLE':
            qual = 'H032' if 'H032' in lab and 'H432' not in lab else 'H432'
        kind = kind_of(e)
        comp = re.search(r'H[04]32A?/0?([123])\b', lab)
        if e['file_name'].endswith('.zip') or 'Moderators' in lab or 'Practical endorsement' in lab:
            skipped.append(lab)
            continue
        if kind is None:
            if re.search(r'highlights|comment summary|Assessment story|hints', lab, re.I):
                skipped.append(lab)
            else:
                skipped.append(lab)
            continue
        sha, size, modified = fetch(e['url'], a.sources / e['file_name'])
        doc = {'availability': 'verified_public_pdf', 'verified_at': TODAY, 'label': lab, 'file_name': e['file_name'],
               'url': e['url'], 'sha256': sha, 'bytes': size, 'last_modified': modified}
        if kind == 'data_sheet':
            shared.setdefault((qual, e['series']), []).append(doc)
            continue
        if not comp:
            skipped.append(lab)
            continue
        booklets.setdefault((qual, comp.group(1), e['series']), {}).setdefault(kind, []).append(doc)
    for qual in ('H432', 'H032'):
        papers = []
        for (q, c, series), docs in sorted(booklets.items(), key=lambda kv: (kv[0][2] == 'SAMPLE', str(kv[0][2]), kv[0][1])):
            if q != qual:
                continue
            sample = series == 'SAMPLE'
            docs = {k: v[0] for k, v in docs.items()} | {'_all': docs}
            superseded = []
            if 'question_paper_corrected' in docs:   # a one-page correction sheet, not a full paper
                docs['erratum'] = {**docs.pop('question_paper_corrected'), 'is_post_exam_correction': True}
            if 'erratum' in docs:
                docs['erratum'] = docs['erratum']
            docs.pop('_all')
            if sample:
                docs = {'question_paper': {**docs['sample_paper_and_scheme'], 'contains': 'question paper and mark scheme'},
                        'mark_scheme': {**docs['sample_paper_and_scheme'], 'contains': 'question paper and mark scheme'}}
            pid = f'OCR_{qual}_SAMPLE_0{c}' if sample else f'OCR_{qual}_{series[0]}_{series[1].upper()}_0{c}'
            marks, minutes = cover(a.sources / docs['question_paper']['file_name'])
            paper = {'paper_id': pid, 'qualification_code': qual, 'is_as': qual == 'H032', 'component': f'0{c}',
                     'component_title': TITLES[(qual, f'0{c}')], 'year': None if sample else series[0],
                     'series': 'Sample' if sample else series[1], 'is_sample': sample, 'max_marks': marks,
                     'duration_minutes': minutes, 'documents': docs}
            sd = shared.get((qual, series)) or shared.get(('H432' if qual == 'H032' else 'H032', series))
            if sd:
                paper['data_sheet'] = sd[0]
            paper.update(OVERRIDES.get(pid, {}))
            if superseded:
                paper['superseded_documents'] = superseded
            if sample:
                paper['sample_identity'] = 'OCR sample assessment material (question paper and mark scheme in one PDF)'
            missing = [k for k in ('question_paper', 'mark_scheme', 'examiner_report') if k not in docs and not (sample and k == 'examiner_report')]
            if missing:
                paper['unavailable'] = missing
            papers.append(paper)
        out = {'qualification': qual, 'checked_at': TODAY,
               'evidence_method': "OCR's public Chemistry A H032/H432 assessment page (labels under each series heading); PDFs fetched from www.ocr.org.uk/Images/, checked for a PDF header and recorded with SHA-256, size and Last-Modified (OCR publishes no checksums).",
               'notes': ['Only series OCR lists publicly are used: no Teach Cambridge or other login routes.',
                         "Modified-paper ZIPs (same questions) are not used; moderators' reports and the practical endorsement (H432/04) are not written exam questions.",
                         'Each sample assessment PDF holds both the question paper and its mark scheme.',
                         'Data sheets/booklets are shared H032/H432 inserts recorded per paper as data_sheet.'],
               'papers': papers, 'skipped_labels': sorted(set(skipped))}
        target = REPO / 'data/imports/chem/inventory' / f'{qual}-inventory.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
        print(qual, len(papers), 'booklets')
        for p in papers:
            print('  ', p['paper_id'], p['max_marks'], p['duration_minutes'], sorted(p['documents']), p.get('unavailable', ''), 'DS' if 'data_sheet' in p else 'noDS')


if __name__ == '__main__':
    main()
