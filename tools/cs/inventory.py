#!/usr/bin/env python3
"""Inventory and cache OCR's public H446 / H046 assessment materials.

Usage: inventory.py PAGE_HTML --sources DIR
  PAGE_HTML: https://www.ocr.org.uk/qualifications/as-and-a-level/computer-science-h046-h446-from-2015/assessment/
Writes data/imports/cs/inventory/{H446,H046}-inventory.json.

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
TITLES = {('H446', '01'): 'Computer systems', ('H446', '02'): 'Algorithms and programming',
          ('H046', '01'): 'Computing principles', ('H046', '02'): 'Algorithms and problem solving'}


def entries(page):
    h = open(page, encoding='utf-8', errors='replace').read()
    out, series = [], None
    for m in re.finditer(r'<h[34][^>]*>(.*?)</h[34]>|<li[^>]*>(.*?)</li>', h, re.S):
        head, li = m.groups()
        if head:
            text = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', head))).strip()
            s = re.match(r'(\d{4}) - (June|November) series', text)
            series = (int(s.group(1)), s.group(2)) if s else ('SAMPLE' if 'Sample assessment' in text else None)
            continue
        a = re.search(r'href=["\'](/Images/[^"\']+)["\']', li or '')
        if not a or series is None:
            continue
        label = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', li))).strip()
        out.append({'series': series, 'label': label, 'url': BASE + a.group(1), 'file_name': a.group(1).rsplit('/', 1)[1]})
    return out


def kind_of(e):
    lab = e['label']
    if e['series'] == 'SAMPLE':
        return 'sample_paper_and_scheme'
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


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('page', type=Path)
    ap.add_argument('--sources', type=Path, required=True)
    a = ap.parse_args()
    a.sources.mkdir(parents=True, exist_ok=True)
    booklets, skipped = {}, []
    for e in entries(a.page):
        qual = re.search(r'(H446|H046)', e['label'])
        comp = re.search(r'H[04]46/0?([12])\b', e['label'])
        kind = kind_of(e)
        if not qual or not kind or not comp or e['file_name'].endswith('.zip'):
            skipped.append(e['label'])
            continue
        q, c = qual.group(1), comp.group(1)
        key = (q, c, e['series'])
        sha, size, modified = fetch(e['url'], a.sources / e['file_name'])
        doc = {'availability': 'verified_public_pdf', 'verified_at': '2026-11-16', 'label': e['label'], 'file_name': e['file_name'],
               'url': e['url'], 'sha256': sha, 'bytes': size, 'last_modified': modified}
        booklets.setdefault(key, {})[kind] = doc
    for qual in ('H446', 'H046'):
        papers = []
        for (q, c, series), docs in sorted(booklets.items(), key=lambda kv: (kv[0][2] == 'SAMPLE', str(kv[0][2]), kv[0][1])):
            if q != qual:
                continue
            sample = series == 'SAMPLE'
            if sample:
                docs = {'question_paper': {**docs['sample_paper_and_scheme'], 'contains': 'question paper and mark scheme'},
                        'mark_scheme': {**docs['sample_paper_and_scheme'], 'contains': 'question paper and mark scheme'}}
            pid = f'OCR_{qual}_SAMPLE_0{c}' if sample else f'OCR_{qual}_{series[0]}_{series[1].upper()}_0{c}'
            marks, minutes = cover(a.sources / docs['question_paper']['file_name'])
            paper = {'paper_id': pid, 'qualification_code': qual, 'is_as': qual == 'H046', 'component': f'0{c}',
                     'component_title': TITLES[(qual, f'0{c}')], 'year': None if sample else series[0],
                     'series': 'Sample' if sample else series[1], 'is_sample': sample, 'max_marks': marks,
                     'duration_minutes': minutes, 'documents': docs}
            if sample:
                paper['sample_identity'] = 'OCR sample assessment material (question paper and mark scheme in one PDF)'
            missing = [k for k in ('question_paper', 'mark_scheme', 'examiner_report') if k not in docs and not (sample and k == 'examiner_report')]
            if missing:
                paper['unavailable'] = missing
            papers.append(paper)
        out = {'qualification': qual, 'checked_at': '2026-11-16',
               'evidence_method': "OCR's public H046/H446 assessment page (labels under each series heading); PDFs fetched from www.ocr.org.uk/Images/, checked for a PDF header and recorded with SHA-256, size and Last-Modified (OCR publishes no checksums).",
               'notes': ['Only series OCR lists publicly are used: no Teach Cambridge or other login routes.',
                         'Modified-paper ZIPs (same questions) are not used; moderators\' reports and the programming-project sample are coursework.',
                         'Each sample assessment PDF holds both the question paper and its mark scheme.'],
               'papers': papers, 'skipped_labels': sorted(set(skipped))}
        target = REPO / 'data/imports/cs/inventory' / f'{qual}-inventory.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
        print(qual, len(papers), 'booklets')
        for p in papers:
            print('  ', p['paper_id'], p['max_marks'], p['duration_minutes'], sorted(p['documents']), p.get('unavailable', ''))


if __name__ == '__main__':
    main()
