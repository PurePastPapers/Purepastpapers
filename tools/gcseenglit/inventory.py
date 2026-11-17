#!/usr/bin/env python3
"""Fetch the public Eduqas GCSE English Literature (C720QS) papers and write the source inventory.

Usage: inventory.py --research DIR [--checked-at DATE]

Sources are the files the Eduqas qualification page lists under "Past Papers / Mark
Schemes" (loaded from /umbraco/surface/TabSurface/GetpastpapersTab?qualificationId=38424)
and served from pastpapers.download.wjec.co.uk. The November 2020 Component 1 paper is
not listed but is public at the series' predictable name (O20/o20-5720-01.pdf); its
mark scheme is listed. Braille (-BRL) versions are not used.

Summer 2022 was the adapted series (C722): each section was a separate one-hour paper
(C722U10-A Shakespeare, -B Post-1914 prose/drama, C722U20-A Poetry Anthology, -B 19th
century prose, -C Unseen poetry), so each is its own booklet here.

Fetched files are cached privately as DIR/sources/<paper_id>__<kind>.pdf with SHA256
and size recorded; the cache is never committed.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from urllib.parse import quote

REPO = Path(__file__).resolve().parents[2]
HOST = 'https://pastpapers.download.wjec.co.uk/'
LISTING = 'https://www.eduqas.co.uk/qualifications/english-literature-gcse/#tab_pastpapers'
# (paper_id suffix, year, series, component, title, marks, minutes, qp path, ms path)
C1 = ('C1', 'Component 1: Shakespeare and Poetry', 80, 120)
C2 = ('C2', 'Component 2: Post-1914 Prose/Drama, 19th Century Prose and Unseen Poetry', 120, 150)
PAPERS = [
    (2017, 'Summer', C1, 's17-5720-01.pdf', 's17-english-literature7-ms.pdf'),
    (2017, 'Summer', C2, 's17-5720-02.pdf', 's17-english-literature8-ms.pdf'),
    (2018, 'Summer', C1, 's18-5720-01.pdf', 's18-english-literature---c720u10-1-eduqas-gcse1-ms.pdf'),
    (2018, 'Summer', C2, 's18-5720-02.pdf', 's18-english-literature---c720u20-1-eduqas-gcse1-ms.pdf'),
    (2019, 'Summer', C1, 's19-5720-01.pdf', 's19-C720U10-1 EDUQAS GCSE Eng Lit Comp 1 MS S19.pdf'),
    (2019, 'Summer', C2, 's19-5720-02.pdf', 's19-C720U20-1 EDUQAS GCSE Eng Lit Comp 2 MS S19.pdf'),
    (2020, 'Autumn', C1, 'O20/o20-5720-01.pdf', 'A20/a20-C720U10-1-ms.pdf'),
    (2020, 'Autumn', C2, 'O20/o20-5720-02.pdf', 'A20/a20-C720U20-1-ms.pdf'),
    (2021, 'Autumn', ('C1', 'Component 1: Shakespeare and Post-1914 Prose/Drama', 80, 120), 'O21/o21-5720-01.pdf', None),
    (2022, 'Summer', ('C1A', 'Component 1: Shakespeare', 40, 60), 'Z22/z22-5721-01.pdf', 'S22/s22-C722U10-A-ms.pdf'),
    (2022, 'Summer', ('C1B', 'Component 1: Post-1914 Prose/Drama', 40, 60), 'Z22/z22-5721-02.pdf', 'S22/s22-C722U10-B-ms.pdf'),
    (2022, 'Summer', ('C2A', 'Component 2: Poetry Anthology', 40, 60), 'Z22/z22-5721-03.pdf', 'S22/s22-C722U20-A-ms.pdf'),
    (2022, 'Summer', ('C2B', 'Component 2: 19th Century Prose', 40, 60), 'Z22/z22-5721-04.pdf', 'S22/s22-C722U20-B-ms.pdf'),
    (2022, 'Summer', ('C2C', 'Component 2: Unseen Poetry', 40, 60), 'Z22/z22-5721-05.pdf', 'S22/s22-C722U20-C-ms.pdf'),
    (2023, 'Summer', C1, 'S23/s23-c720u10-1.pdf', 'S23/s23-c720u10-1-ms.pdf'),
    (2023, 'Summer', C2, 'S23/s23-c720u20-1.pdf', 'S23/s23-c720u20-1-ms.pdf'),
    (2024, 'Summer', C1, 'S24/S24-C720U10-1.pdf', 'S24/S24-C720U10-1-ms.pdf'),
    (2024, 'Summer', C2, 'S24/S24-C720U20-1.pdf', 'S24/S24-C720U20-1-ms.pdf'),
    (2025, 'Summer', C1, 'S25/S25-C720U10-1.pdf', 'S25/S25-C720U10-1-ms.pdf'),
    (2025, 'Summer', C2, 'S25/S25-C720U20-1.pdf', 'S25/S25-C720U20-1-ms.pdf'),
]
UNLISTED = {'O20/o20-5720-01.pdf'}


def fetch(url, target):
    if not (target.exists() and target.read_bytes()[:4] == b'%PDF'):
        subprocess.run(['curl', '-sS', '-f', '-m', '180', '-o', str(target), url], check=True)
    data = target.read_bytes()
    if data[:4] != b'%PDF':
        raise SystemExit(f'Not a PDF: {url}')
    return hashlib.sha256(data).hexdigest(), len(data)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--research', type=Path, required=True)
    p.add_argument('--checked-at', default='2026-11-17')
    a = p.parse_args()
    cache = a.research / 'sources'
    cache.mkdir(parents=True, exist_ok=True)
    papers, unavailable = [], []
    for year, series, (comp, title, marks, minutes), qp, ms in PAPERS:
        pid = f'EDUQAS_C720QS_{year}_{series.upper()}_{comp}'
        documents = {}
        for kind, path in (('question_paper', qp), ('mark_scheme', ms)):
            if not path:
                documents[kind] = {'availability': 'not_found', 'verified_at': a.checked_at,
                                   'evidence': 'not listed on the Eduqas past papers tab; predictable names probed (HTTP 403)'}
                continue
            url = HOST + quote(path)
            d = {'availability': 'verified_public_pdf', 'verified_at': a.checked_at, 'url': url,
                 'evidence': 'name_probe_on_board_file_host' if path in UNLISTED else 'listed_on_qualification_page',
                 'file_name': f'{pid}__{kind}.pdf'}
            d['sha256'], d['bytes'] = fetch(url, cache / d['file_name'])
            documents[kind] = d
        entry = {'paper_id': pid, 'qualification_code': 'C720QS', 'is_as': False, 'is_sample': False, 'year': year,
                 'series': series, 'component': comp, 'component_title': title,
                 'variant': 'adapted_2022' if year == 2022 else 'standard', 'max_marks': marks, 'duration_minutes': minutes,
                 'documents': documents}
        if all(documents[k]['availability'] == 'verified_public_pdf' for k in documents):
            papers.append(entry)
        else:
            entry['status'] = 'not_publicly_available'
            unavailable.append(entry)
    doc = {'qualification': 'WJEC Eduqas GCSE (9-1) English Literature C720QS', 'checked_at': a.checked_at,
           'first_certification_year': 2017, 'listing': LISTING,
           'evidence_method': 'Files listed on the Eduqas qualification page past papers tab, fetched from pastpapers.download.wjec.co.uk; '
                              'one unlisted file found by its predictable series name. No secure or portal routes.',
           'notes': 'Not public: the November 2021 Component 1 mark scheme, the November 2021 Component 2 paper and scheme '
                    '(not listed), and Summer 2026 (not yet released). Summer 2022 was the adapted C722 series with one paper per section.',
           'papers': papers, 'unavailable': unavailable}
    target = REPO / 'data/imports/gcseenglit/inventory/c720qs-inventory.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
    print(len(papers), 'public booklets;', [e['paper_id'] for e in unavailable], 'not public')


if __name__ == '__main__':
    main()
