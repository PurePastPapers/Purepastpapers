#!/usr/bin/env python3
"""Build the Edexcel Biology A (Salters-Nuffield) 9BN0/8BN0 source inventory.

Evidence method: Pearson's public past-paper search endpoint (the same
`services/pearson/algolia/GET.servlet` the public past-papers page calls),
filtered to the Biology A 2015 specification code. No authenticated or gated
path is used; any record flagged `gating` or any `/secure/` URL is recorded as
restricted and never downloaded.

Usage:
  python3 tools/biology/inventory.py fetch  --out RESEARCH/catalogue/bioa-records.json
  python3 tools/biology/inventory.py build  --records RESEARCH/catalogue/bioa-records.json \
      --cache RESEARCH/sources --repo .
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

HOST = 'https://qualifications.pearson.com'
SEARCH = HOST + '/services/pearson/algolia/GET.servlet?'
SPEC_CATEGORY = 'Pearson-UK:Specification-Code/al15-biology-a'
CATALOGUE_SOURCE = HOST + '/en/support/support-topics/exams/past-papers.html'
EVIDENCE = ('Pearson public past-paper search endpoint (as called by the public past-papers page), '
            'filtered to specification code al15-biology-a; no authenticated access or access bypass')
FILE_RE = re.compile(r'(?P<qual>[89]bn0)[-_](?P<comp>0[1-3])[-_](?P<kind>que|rms|msc|ms|pef)[-_](?P<date>\d{8})', re.I)
KINDS = {'que': 'question_paper', 'rms': 'mark_scheme', 'msc': 'mark_scheme', 'ms': 'mark_scheme', 'pef': 'examiner_report'}
# Component titles, marks and durations as printed on the question-paper covers
# (checked on every downloaded cover; see verify_covers()).
ASSESSMENT = {'9BN0': (100, 120), '8BN0': (80, 90)}
TITLES = {
    '9BN0': {'01': 'The Natural Environment and Species Survival',
             '02': 'Energy, Exercise and Coordination',
             '03': 'General and Practical Applications in Biology'},
    '8BN0': {'01': 'Lifestyle, Transport, Genes and Health',
             '02': 'Development, Plants and the Environment'},
}


def today():
    return datetime.date.today().isoformat()


def fetch(out):
    params = [('fq', f'category:"{SPEC_CATEGORY}"')]
    url = SEARCH + urllib.parse.urlencode(params)
    body = subprocess.run(['curl', '-sS', '--fail', '--max-time', '120', url],
                          capture_output=True, text=True, check=True).stdout
    records = json.loads(body)['searchResults']['algoliaRecords']
    pathlib.Path(out).parent.mkdir(parents=True, exist_ok=True)
    json.dump({'fetched_at': today(), 'query_url': url, 'records': records},
              open(out, 'w'), indent=1)
    print(f'{len(records)} records -> {out}')


def categories(record, prefix):
    return [c.split('/', 1)[1] for c in record.get('category', []) if c.startswith(f'Pearson-UK:{prefix}/')]


def series_of(label):
    """'June-2016' -> (2016, 'June'); also parses article titles."""
    m = re.search(r'(June|October|November|Autumn)[- ](20\d\d)', label or '', re.I)
    if not m:
        return None
    return int(m.group(2)), m.group(1).capitalize()


def classify(records):
    exam, articles, samples, other = [], [], [], []
    for r in records:
        url = r.get('url', '')
        name = url.rsplit('/', 1)[-1]
        types = categories(r, 'Document-Type')
        if 'Scientific-article' in types:
            articles.append(r)
            continue
        if set(types) & {'Sample-assessment-material', 'Specimen-paper-and-mark-scheme', 'Specification'}:
            samples.append(r)
            continue
        m = FILE_RE.search(name)
        if m and name.lower().endswith('.pdf') and set(types) & {'Question-paper', 'Mark-scheme', 'Examiner-report'}:
            exam.append((r, m))
            continue
        other.append(r)
    return exam, articles, samples, other


def document(record, kind_note=None):
    doc = {
        'url': HOST + urllib.parse.quote(record['url'], safe='/:()_-.'),
        'title': record.get('title', '').strip(),
        'catalogue_object_id': record.get('objectID'),
        'catalogue_document_types': categories(record, 'Document-Type'),
        'catalogue_series': categories(record, 'Exam-Series'),
        'catalogue_gating_flag': bool(record.get('gating')),
        'catalogue_date': record.get('date'),
        'catalogue_source': CATALOGUE_SOURCE,
    }
    if kind_note:
        doc['catalogue_note'] = kind_note
    secure = '/secure/' in record['url'] or record.get('gating')
    doc['availability'] = 'restricted' if secure else 'pending_download'
    return doc


def download(doc, cache, name):
    target = cache / name
    if doc['availability'] == 'restricted':
        return doc
    if not target.exists() or target.read_bytes()[:4] != b'%PDF':
        tmp = target.with_suffix('.part')
        r = subprocess.run(['curl', '-sS', '-L', '--fail', '--max-time', '300', '-o', str(tmp), doc['url']],
                           capture_output=True, text=True)
        if r.returncode != 0:
            doc['availability'] = 'not_found'
            doc['download_error'] = r.stderr.strip()[:200]
            return doc
        tmp.replace(target)
    data = target.read_bytes()
    if data[:4] != b'%PDF':
        doc['availability'] = 'not_pdf'
        return doc
    doc.update(availability='verified_public_pdf', verified_at=today(), bytes=len(data),
               sha256=hashlib.sha256(data).hexdigest(), cache_name=name)
    return doc


def pdf_text(path, last_page=2):
    return subprocess.run(['pdftotext', '-l', str(last_page), '-raw', str(path), '-'],
                          capture_output=True, text=True).stdout


def verify_covers(papers, cache):
    """Record cover-page evidence for marks, duration, title and scheme series."""
    months = {'June': ('Summer', 'June'), 'October': ('Autumn', 'October'), 'November': ('Autumn', 'November', 'October')}
    for pid, paper in papers.items():
        qp = paper['documents'].get('question_paper', {})
        if qp.get('availability') == 'verified_public_pdf':
            text = ' '.join(pdf_text(cache / qp['cache_name'], 1).split())
            marks = re.search(r'total mark for this paper is (\d+)', text, re.I)
            title_ok = paper['component_title'].lower().replace(' ', '') in text.lower().replace(' ', '')
            paper['cover_evidence'] = {
                'total_marks_printed': int(marks.group(1)) if marks else None,
                'time_printed': (re.search(r'Time:? ?([0-9a-z ]+?(?:hours?|minutes))', text) or [None, None])[1],
                'component_title_matches': title_ok,
            }
            if marks and int(marks.group(1)) != paper['max_marks']:
                raise SystemExit(f'{pid}: cover marks {marks.group(1)} != {paper["max_marks"]}')
        ms = paper['documents'].get('mark_scheme', {})
        if ms.get('availability') == 'verified_public_pdf':
            text = ' '.join(pdf_text(cache / ms['cache_name'], 3).split())
            code = re.search(r'Publications Code:? ?([0-9A-Z_]+)', text)
            series_words = months.get(paper['series'], (paper['series'],))
            ok = str(paper['year']) in text and any(w in text for w in series_words)
            ms['cover_check'] = {'publications_code': code.group(1) if code else None,
                                 'series_and_year_printed': ok}


def build(records_path, cache, repo):
    snap = json.load(open(records_path))
    exam, articles, samples, other = classify(snap['records'])
    cache.mkdir(parents=True, exist_ok=True)
    papers = {}
    exceptions = []
    for record, m in exam:
        qual = m.group('qual').upper()
        comp = m.group('comp')
        kind = KINDS[m.group('kind').lower()]
        cat_series = categories(record, 'Exam-Series')
        parsed = series_of(cat_series[0] if cat_series else record.get('title'))
        if not parsed:
            exceptions.append({'record': record['url'], 'note': 'No exam series in catalogue record'})
            continue
        year, series = parsed
        pid = f'EDX_{qual}_{year}_{series.upper()}_{comp}'
        note = None
        types = categories(record, 'Document-Type')
        expected_type = {'question_paper': 'Question-paper', 'mark_scheme': 'Mark-scheme',
                         'examiner_report': 'Examiner-report'}[kind]
        if expected_type not in types:
            note = f'Catalogue files this under {types}; filename code identifies it as {kind}'
        file_date = m.group('date')
        if not file_date.startswith(str(year)) and kind != 'examiner_report':
            note = (note + '; ' if note else '') + (
                f'Filename date {file_date} differs from catalogue series {series} {year}; verify cover page')
        paper = papers.setdefault(pid, {
            'paper_id': pid, 'qualification_code': qual, 'is_as': qual == '8BN0',
            'year': year, 'series': series, 'series_catalogue_label': f'{series}-{year}',
            'component': comp, 'assessment_paper': str(int(comp)),
            'component_title': TITLES[qual][comp], 'variant': 'standard',
            'max_marks': ASSESSMENT[qual][0], 'duration_minutes': ASSESSMENT[qual][1], 'documents': {},
            'processing_status': 'inventory_only'})
        if kind in paper['documents']:
            exceptions.append({'paper_id': pid, 'note': f'Duplicate {kind}: {record["url"]}'})
            continue
        paper['documents'][kind] = document(record, note)
    # Scientific articles attach to their Paper 3 sitting.
    article_rows = []
    for record in articles:
        parsed = series_of(record.get('title'))
        doc = document(record)
        if not parsed:
            exceptions.append({'record': record['url'], 'note': 'Article without series'})
            continue
        year, series = parsed
        if series == 'Autumn' and year == 2021:
            series = 'November'  # Pearson's exam-series label for the 2021 autumn sitting
        article_rows.append((year, series, doc))
    for year, series, doc in article_rows:
        pid = f'EDX_9BN0_{year}_{series.upper()}_03'
        if pid not in papers:
            exceptions.append({'paper_id': pid, 'note': f'Article with no matching Paper 3: {doc["url"]}'})
            continue
        docs = papers[pid]['documents']
        docs.setdefault('_articles', []).append(doc)
    # Downloads: articles first, then the primary article is the first verified copy.
    article_jobs = [(d, f'{pid}__pre_release_article_{i}.pdf')
                    for pid, p in papers.items() for i, d in enumerate(p['documents'].get('_articles', []))]
    with ThreadPoolExecutor(6) as pool:
        list(pool.map(lambda job: download(job[0], cache, job[1]), article_jobs))
    for paper in papers.values():
        found = paper['documents'].pop('_articles', None)
        if found:
            found.sort(key=lambda d: d['availability'] != 'verified_public_pdf')
            paper['documents']['pre_release_article'] = found[0]
            if len(found) > 1:
                same = len({d.get('sha256') for d in found}) == 1
                paper['documents']['pre_release_article_alternates'] = [
                    dict(d, note='Identical bytes to primary' if same else 'Separate catalogue copy; primary used')
                    for d in found[1:]]
    jobs = []
    for pid, paper in papers.items():
        for kind, doc in paper['documents'].items():
            if kind.startswith('pre_release_article'):
                continue
            jobs.append((doc, f'{pid}__{kind}.pdf'))
    with ThreadPoolExecutor(6) as pool:
        list(pool.map(lambda job: download(job[0], cache, job[1]), jobs))
    for pid, paper in papers.items():
        for kind in ('question_paper', 'mark_scheme', 'examiner_report'):
            if kind not in paper['documents']:
                paper['documents'][kind] = {'availability': 'not_listed_in_public_catalogue', 'url': None}
        if paper['component'] == '03' and paper['qualification_code'] == '9BN0' and \
                'pre_release_article' not in paper['documents']:
            paper['documents']['pre_release_article'] = {'availability': 'not_listed_in_public_catalogue', 'url': None}
    verify_covers(papers, cache)
    out_dir = repo / 'data/imports/biology/inventory'
    out_dir.mkdir(parents=True, exist_ok=True)
    order = {'June': 6, 'October': 10, 'November': 11}
    for qual in ('9BN0', '8BN0'):
        rows = sorted((p for p in papers.values() if p['qualification_code'] == qual),
                      key=lambda p: (p['year'], order.get(p['series'], 0), p['component']))
        json.dump({
            'qualification': f'Pearson Edexcel {"A level" if qual == "9BN0" else "AS"} Biology A (Salters-Nuffield) {qual}',
            'checked_at': today(), 'evidence_method': EVIDENCE,
            'catalogue_query': snap['query_url'], 'catalogue_fetched_at': snap['fetched_at'],
            'first_certification_year': 2017 if qual == '9BN0' else 2016,
            'papers': rows,
            'exceptions': [e for e in exceptions if qual in json.dumps(e)],
        }, open(out_dir / f'{qual.lower()}-inventory.json', 'w'), indent=1)
        print(qual, len(rows), 'papers')
    supporting = []
    for record in samples + other:
        supporting.append({'title': record.get('title', '').strip(), 'url': HOST + record['url'],
                           'document_types': categories(record, 'Document-Type'),
                           'catalogue_object_id': record.get('objectID'),
                           'gating': bool(record.get('gating'))})
    json.dump({'checked_at': today(), 'records': sorted(supporting, key=lambda r: r['url'])},
              open(out_dir / 'catalogue-other-records.json', 'w'), indent=1)
    print('exceptions', len(exceptions))
    for e in exceptions:
        print(' ', e)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    f = sub.add_parser('fetch')
    f.add_argument('--out', required=True)
    b = sub.add_parser('build')
    b.add_argument('--records', required=True)
    b.add_argument('--cache', required=True)
    b.add_argument('--repo', default='.')
    a = ap.parse_args()
    if a.cmd == 'fetch':
        fetch(a.out)
    else:
        build(a.records, pathlib.Path(a.cache), pathlib.Path(a.repo))


if __name__ == '__main__':
    main()
