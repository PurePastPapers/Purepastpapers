#!/usr/bin/env python3
"""Official Biology A sample assessment materials (Issue 1, December 2014).

Pearson publishes each qualification's SAMs as one collated PDF. This writes the
samples inventory (page ranges are 1-based PDF pages of the official collation)
and faithful page-extraction caches named like exam sources, so the same
extraction, review and build steps apply. Nothing is rewritten; the manifest keeps
the original checksum and page offsets. Specimen paper sets are on Pearson's
/secure/ path and are recorded as restricted, not imported.

Usage: python3 tools/biology/samples.py --supporting RESEARCH/supporting --sources RESEARCH/sources --repo .
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path

from pypdf import PdfReader, PdfWriter

BASE = 'https://qualifications.pearson.com/content/dam/pdf/A%20Level/biology-a/2015/specification-and-sample-assessment-materials/'
A_FILE = 'Biology-A-SAM-Collation-WEB-9781446914519.pdf'
AS_FILE = 'Biology-AS-SAM-Collation-Web-9781446914526.pdf'
AS_ERRATUM = 'Erratum-notice-AS-sample-assessment-materials.pdf'
TITLES = {
    '9BN0': {'01': 'The Natural Environment and Species Survival', '02': 'Energy, Exercise and Coordination',
             '03': 'General and Practical Applications in Biology'},
    '8BN0': {'01': 'Lifestyle, Transport, Genes and Health', '02': 'Development, Plants and the Environment'},
}
# (qualification, component, question pages, scheme pages, article pages or None)
RANGES = [
    ('9BN0', '01', (11, 46), (47, 68), None),
    ('9BN0', '02', (69, 104), (105, 126), None),
    ('9BN0', '03', (139, 164), (165, 182), (127, 138)),
    ('8BN0', '01', (11, 32), (33, 50), None),
    ('8BN0', '02', (51, 76), (77, 94), None),
]
RESTRICTED = [
    'Specimen papers and mark schemes (9BI0) - A level', 'Specimen Papers Set 2 (9BN0) - A level',
    'Specimen Papers Set 2 (9BN0) - Erratum notice', 'Specimen papers and mark schemes (8BI0) - AS level',
]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def sideways(source, index):
    """True when most visible characters on the page are rotated (a landscape
    mark-scheme table printed on a portrait page)."""
    import pdfplumber
    with pdfplumber.open(str(source)) as pdf:
        page = pdf.pages[index]
        chars = [c for c in page.chars if 0 <= c['x0'] <= page.width]
        rotated = sum(not c.get('upright', True) for c in chars)
        return len(chars) > 20 and (rotated > 100 or rotated > len(chars) * .4)


def extract_pages(source, pages, target, label, upright_landscape=False):
    reader = PdfReader(str(source))
    first, last = pages
    writer = PdfWriter()
    rotated = []
    for index in range(first - 1, last):
        page = reader.pages[index]
        if upright_landscape and sideways(source, index):
            page.rotate(90)  # display rotation only (/Rotate); content stream untouched
            rotated.append(index + 1)
        writer.add_page(page)
    extract_pages.rotated = rotated
    writer.add_metadata({'/Title': f'Private source page extraction: {label}',
                         '/Subject': f'Original official PDF pages {first}-{last}; no content rewritten'})
    with open(target, 'wb') as stream:
        writer.write(stream)
    return sha(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--supporting', type=Path, required=True)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    args = parser.parse_args()
    today = datetime.date.today().isoformat()
    papers, provenance = [], []
    for qual, comp, qp_pages, ms_pages, article_pages in RANGES:
        name = A_FILE if qual == '9BN0' else AS_FILE
        source = args.supporting / name
        original_sha = sha(source)
        pid = f'EDX_{qual}_SAMPLE_{comp}'
        docs = {}
        kinds = [('question_paper', qp_pages), ('mark_scheme', ms_pages)]
        if article_pages:
            kinds.append(('pre_release_article', article_pages))
        for kind, pages in kinds:
            cache = f'{pid}__{kind}.pdf'
            cache_sha = extract_pages(source, pages, args.sources / cache, f'{pid} {kind}', kind == 'mark_scheme')
            docs[kind] = {'url': BASE + name, 'title': f'Sample assessment materials ({"A level" if qual == "9BN0" else "AS"}), '
                                                   f'Issue 1 December 2014: Paper {int(comp)} {kind.replace("_", " ")}',
                          'availability': 'verified_public_pdf', 'verified_at': today,
                          'sha256': cache_sha, 'cache_name': cache,
                          'original_source_sha256': original_sha, 'original_source_bytes': source.stat().st_size,
                          'source_pages_inclusive': list(pages), 'page_numbering': '1-based PDF pages of the official collation'}
            if extract_pages.rotated:
                docs[kind]['display_rotation'] = {'degrees': 90, 'pages': extract_pages.rotated,
                                                  'note': 'Landscape scheme tables printed sideways; /Rotate set so they read upright.'}
            provenance.append({'paper_id': pid, 'kind': kind, 'cache_sha256': cache_sha, 'original_source_sha256': original_sha,
                               'display_rotation_pages': extract_pages.rotated,
                               'original_source_url': BASE + name, 'source_pages_inclusive': list(pages),
                               'operation': 'faithful source page extraction; no question rewriting'})
        docs['examiner_report'] = {'availability': 'not_applicable_sample', 'url': None}
        if qual == '8BN0' and comp == '01':
            docs['mark_scheme']['erratum'] = {
                'url': BASE + AS_ERRATUM, 'sha256': sha(args.supporting / AS_ERRATUM),
                'note': 'February 2016 erratum: corrected mark scheme for AS Paper 1 Question 9(b)(ii).'}
        papers.append({'paper_id': pid, 'qualification_code': qual, 'is_as': qual == '8BN0', 'is_sample': True,
                       'sample_kind': 'accredited_sample_assessment', 'issue': 'Issue 1 December 2014',
                       'year': None, 'series': 'Sample', 'component': comp, 'assessment_paper': str(int(comp)),
                       'component_title': TITLES[qual][comp], 'variant': 'standard',
                       'max_marks': 100 if qual == '9BN0' else 80, 'duration_minutes': 120 if qual == '9BN0' else 90,
                       'documents': docs, 'processing_status': 'inventory_only'})
    out = args.repo / 'data/imports/biology/inventory/samples-inventory.json'
    json.dump({'qualification': 'Pearson Edexcel Biology A (Salters-Nuffield) 9BN0/8BN0 official sample assessment materials',
               'checked_at': today, 'papers': papers,
               'restricted_not_imported': [{'title': t, 'availability': 'restricted', 'reason': 'Served only from a Pearson /secure/ path'}
                                           for t in RESTRICTED],
               'notes': ['Sample assessments are Issue 1 (December 2014), written before specification Issue 4; '
                         'they carry an explicit sample identity and no exam year.',
                         'No examiner report exists for a sample assessment.']},
              open(out, 'w'), indent=1)
    json.dump({'records': provenance}, open(args.sources / 'source-page-provenance.json', 'w'), indent=1)
    print(len(papers), 'sample papers ->', out)


if __name__ == '__main__':
    main()
