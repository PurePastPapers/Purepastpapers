#!/usr/bin/env python3
"""Source-coordinate extraction of AQA GCSE English Language 8700 papers.

Usage: extract.py --research DIR [--only PAPER ...]
  Reads data/imports/gcseenglang/inventory/8700-inventory.json and DIR/sources/,
  writes DIR/candidates/<PAPER>.json.

Layout (layout id below). Each question prints its number as two boxed digits ("0 1" .. "0 5")
in the left margin and one tariff "[N marks]" at its end, so one scored unit is one whole question:
Paper 1: 4, 8, 8, 20, 40 marks (Section A reading 40, Section B writing 40). Paper 2: 4, 8, 12, 16,
40. Question 5 is 24 content + 16 technical accuracy marks under one tariff. A question can have
no sub-parts, so there are no joint tariffs. The question crop runs from the first meaningful row
of its first page (so a Section heading and instruction stay with it) to the tariff row, covering
every page between (a picture prompt is drawn between text rows, so it falls inside the crop).

Sources live in the separate insert booklet: "Source A" (and "Source B" in Paper 2). A question
cites its sources by name ("Source A", "both sources", or "the source" in Paper 1). Each source's
pages are indexed so a unit can carry them as unscored context. AQA's copyright-removed ("CR") files
replace third-party text with a notice; a source or question showing that notice is flagged removed.
The mark scheme is located by the same boxed question numbers.
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

VERSION = 'aqa-8700-layout-v1'
REPO = Path(__file__).resolve().parents[2]
TARIFF = re.compile(r'\[\s*(\d{1,2})\s*marks?\s*\]')
REMOVED = re.compile(r'not (?:been )?reproduced|cannot be reproduced|third[- ]party copyright|copyright restrictions|has been removed', re.I)
HEADER = re.compile(r'^(Do not write|outside the|box|\*\d*\*?|IB/|\d{1,2}$|Turn over|Question \d continues)', re.I)
FOOTER = re.compile(r'^(IB/[A-Za-z0-9/]+|\*[A-Za-z0-9/*]+\*|Turn over ►?|Copyright|END OF)', re.I)
MARKS = {'1': [4, 8, 8, 20, 40], '2': [4, 8, 12, 16, 40]}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def rows_of(page, lo=36, hi=36, right=70):
    words = [w for w in page.extract_words() if lo < w['top'] < page.height - hi and w['x0'] < page.width - right and w.get('upright', True)]
    rows = []
    for w in sorted(words, key=lambda w: (round(w['top']), w['x0'])):
        if rows and abs(rows[-1]['top'] - w['top']) < 3:
            rows[-1]['words'].append(w)
        else:
            rows.append({'top': w['top'], 'words': [w]})
    for r in rows:
        r['words'].sort(key=lambda w: w['x0'])
        r['text'] = ' '.join(w['text'] for w in r['words'])
        r['bottom'] = max(w['bottom'] for w in r['words'])
        r['x0'] = r['words'][0]['x0']
    return rows


def label_of(row):
    """('1', None) for a boxed question number "0 1"; ('1', '3') for a printed part "0 1 . 3"."""
    ws = [w for w in row['words'] if w['x0'] < 130]
    if len(ws) >= 2 and ws[0]['text'] == '0' and re.fullmatch(r'[1-5]', ws[1]['text']) and ws[1]['x0'] - ws[0]['x1'] < 30:
        if len(ws) >= 4 and ws[2]['text'] == '.' and re.fullmatch(r'\d', ws[3]['text']):
            return ws[1]['text'], ws[3]['text']
        return ws[1]['text'], None
    return None


def frame(page):
    mx0, my0, mx1, my1 = page.mediabox
    cx0, cy0, cx1, cy1 = page.cropbox
    return cx0 - mx0, my1 - cy1, cx1 - cx0, cy1 - cy0


def region(page, pi, top, bottom, left=28, right=40):
    ox, oy, w, h = frame(page)
    fx = lambda x: round(min(1, max(0, (x - ox) / w)), 6)
    fy = lambda y: round(min(1, max(0, (y - oy) / h)), 6)
    return {'page': pi + 1, 'bbox': [fx(left), fy(max(oy + 4, top)), fx(page.width - right), fy(min(oy + h - 4, bottom))]}


def meaningful(row):
    return not HEADER.match(row['text']) and not FOOTER.match(row['text'])


def question_units(pdf, paper):
    start = 1 if 'Centre number' in (pdf.pages[0].extract_text() or '') else 0
    cover_present = bool(start)
    stream = []
    for pi in range(start, len(pdf.pages)):
        for r in rows_of(pdf.pages[pi]):
            stream.append((pi, r))
    labels = []
    for i, (pi, r) in enumerate(stream):
        lab = label_of(r)
        if lab and not r['text'].startswith(('Answer', 'You are')):
            labels.append((i, lab[0], lab[1]))
    exceptions, units, stems = [], [], {}
    numbers = []
    for _, q, _ in labels:
        if not numbers or numbers[-1] != q:
            numbers.append(q)
    for k, (i, q, part) in enumerate(labels):
        end = labels[k + 1][0] if k + 1 < len(labels) else len(stream)
        rows = stream[i:end]
        if part is None and k + 1 < len(labels) and labels[k + 1][1] == q and labels[k + 1][2]:
            # a stem row that leads a set of printed parts: its text and crop are shared, unscored context
            pi0 = rows[0][0]
            pi1 = rows[-1][0]
            first_part = stream[labels[k + 1][0]]
            regs = []
            for pi in range(pi0, first_part[0] + 1):
                page = pdf.pages[pi]
                lead = [r for pj, r in stream[:i] if pj == pi and meaningful(r)] if pi == pi0 else []
                top = min([r['top'] for r in lead] + [rows[0][1]['top']]) - 6 if pi == pi0 else 40
                bottom = first_part[1]['top'] - 4 if pi == first_part[0] else page.height - 40
                regs.append(region(page, pi, top, bottom))
            stems[q] = {'regions': regs, 'text': '\n'.join(r['text'] for _, r in rows if meaningful(r))}
            continue
        tariffs = [(j, int(m.group(1))) for j, (pi, r) in enumerate(rows) for m in TARIFF.finditer(r['text'])]
        if len(tariffs) < 1:
            exceptions.append({'type': 'tariff_count', 'question': q, 'part': part, 'found': []})
            continue
        j, marks = tariffs[0]
        if len(tariffs) > 1:
            exceptions.append({'type': 'tariff_count', 'question': q, 'part': part, 'found': [t for _, t in tariffs]})
        pi0, tpi = rows[0][0], rows[j][0]
        lead = [r for pj, r in stream[:i] if pj == pi0 and meaningful(r)] if part is None else []
        top0 = min([r['top'] for r in lead] + [rows[0][1]['top']]) - 6
        regs = []
        for pi in range(pi0, tpi + 1):
            page = pdf.pages[pi]
            top = top0 if pi == pi0 else 40
            bottom = rows[j][1]['bottom'] + 8 if pi == tpi else page.height - 40
            regs.append(region(page, pi, top, bottom))
        text = '\n'.join(r['text'] for _, r in rows[:j + 1] if meaningful(r))
        units.append({'question': q, 'label': f'{q}.{part}' if part else q, 'marks': marks, 'regions': regs, 'text': text,
                      'text_removed': bool(REMOVED.search(text)), 'pages': [pi + 1 for pi in range(pi0, tpi + 1)],
                      **({'shared_stem': q} if part else {})})
    expected = {str(n + 1) for n in range(5)}
    for q in sorted(expected - {u['question'] for u in units} - set(stems)):
        # AQA withdrew the whole question page (copyright): keep a stub so the booklet still reconciles
        units.append({'question': q, 'label': q, 'marks': MARKS[paper['assessment_paper']][int(q) - 1], 'regions': [], 'text': '',
                      'text_removed': True, 'pages': [], 'question_page_removed': True})
    units.sort(key=lambda u: (int(u['question']), u['label']))
    return units, stems, exceptions, cover_present


def cited_sources(unit, comp):
    text = unit['text']
    found = set(re.findall(r'Source ([AB])\b', text))
    if re.search(r'\bboth sources\b|\bsources\b', text, re.I) and comp == '2':
        found |= {'A', 'B'}
    if comp == '1' and unit['question'] != '5':
        found.add('A')
    if unit['question'] == '5':
        found = set()
    return sorted(found)


def index_insert(path):
    import pdfplumber
    sources, current, removed_pages = {}, None, []
    with pdfplumber.open(path) as pdf:
        cover = pdf.pages[0].extract_text() or ''
        for pi, page in enumerate(pdf.pages):
            if pi == 0:
                continue
            rows = rows_of(page, lo=30, hi=30, right=40)
            text = ' '.join(r['text'] for r in rows)
            head = next((re.match(r'Source ([AB])\b', r['text']).group(1) for r in rows[:6] if re.match(r'Source [AB]\b(?! (?:and|is|is an|are|was)\b)', r['text'])), None)
            if head:
                current = head
            elif re.search(r'There is no source material|Copyright information|Turn over for Source B', text) and len(text.split()) < 140 and not head:
                if 'Turn over for Source B' in text:
                    continue
                if 'There is no source material' in text or 'Copyright information' in text:
                    current = None
                continue
            if current is None:
                continue
            body = [r for r in rows if meaningful(r)]
            if not body and not text.strip():
                continue
            s = sources.setdefault(current, {'regions': [], 'removed': False})
            s['regions'].append(region(page, pi, 34, page.height - 34))
            if REMOVED.search(text):
                s['removed'] = True
        if REMOVED.search(cover):
            # AQA withdrew the source and its pages: the cover alone says so ("This text cannot be reproduced here")
            for letter in re.findall(r'Source ([AB]):', cover):
                if letter not in sources:
                    sources[letter] = {'regions': [], 'removed': True}
    return sources


def scheme_regions(path):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        stream = []
        for pi in range(len(pdf.pages)):
            for r in rows_of(pdf.pages[pi], lo=30, hi=30, right=30):
                stream.append((pi, r))
        labels, seen_q = [], set()
        for i, (pi, r) in enumerate(stream):
            lab = label_of(r)
            if lab and pi > 4 and lab[0] not in seen_q:
                seen_q.add(lab[0]); labels.append((i, lab[0]))
        out = {}
        for k, (i, n) in enumerate(labels):
            if n in out:
                continue
            end = labels[k + 1][0] if k + 1 < len(labels) else len(stream)
            rows = stream[i:end]
            by_page = {}
            for pi, r in rows:
                b = by_page.setdefault(pi, [r['top'], r['bottom']])
                b[0], b[1] = min(b[0], r['top']), max(b[1], r['bottom'])
            regs = []
            pages = sorted(by_page)
            for pi in range(pages[0], pages[-1] + 1):
                page = pdf.pages[pi]
                top = by_page[pi][0] - 6 if pi == pages[0] else 30
                bottom = by_page[pi][1] + 6 if pi == pages[-1] and k + 1 < len(labels) else page.height - 30
                regs.append(region(page, pi, top, bottom))
            out[n] = regs
        # Question 5 runs to the last page of the scheme (its AO5 and AO6 grids follow the indicative content).
        if '5' in out:
            last = len(pdf.pages) - 1
            while last > out['5'][-1]['page'] - 1 and 'Copyright' in (pdf.pages[last].extract_text() or '')[:300]:
                last -= 1
            page5 = out['5'][-1]['page'] - 1
            for pi in range(page5 + 1, last + 1):
                out['5'].append(region(pdf.pages[pi], pi, 30, pdf.pages[pi].height - 30))
        return out


def extract(paper, sources_dir):
    import pdfplumber
    docs = paper['documents']
    qp = sources_dir / docs['question_paper']['file_name']
    comp = paper['assessment_paper']
    with pdfplumber.open(qp) as pdf:
        units, stems, exceptions, cover_present = question_units(pdf, paper)
        page_count = len(pdf.pages)
    marks = [u['marks'] for u in units]
    per_q = {}
    for u in units:
        per_q[u['question']] = per_q.get(u['question'], 0) + u['marks']
    if [per_q.get(str(n + 1)) for n in range(5)] != MARKS[comp]:
        exceptions.append({'type': 'tariffs_differ_from_expected', 'found': per_q, 'expected': MARKS[comp]})
    for u in units:
        u['sources'] = cited_sources(u, comp)
    ins = index_insert(sources_dir / paper['insert']['file_name']) if paper.get('insert') else {}
    for u in units:
        for s in u['sources']:
            if s not in ins:
                exceptions.append({'type': 'source_not_indexed', 'question': u['question'], 'source': s})
    ms = scheme_regions(sources_dir / docs['mark_scheme']['file_name']) if 'mark_scheme' in docs else {}
    for u in units:
        u['scheme_regions'] = ms.get(u['question'])
        u['scheme_question'] = u['question']
        if not u['scheme_regions']:
            exceptions.append({'type': 'scheme_missing', 'question': u['question']})
    return {'extraction_version': VERSION, 'source_sha256': digest(qp), 'page_count': page_count, 'cover_present': cover_present,
            'printed_tariff_sum': sum(marks), 'total_marks': paper['max_marks'] or sum(MARKS[comp]),
            'sources': ins, 'stems': stems, 'units': units, 'exceptions': exceptions}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--research', type=Path, required=True)
    ap.add_argument('--only', nargs='*')
    a = ap.parse_args()
    out = a.research / 'candidates'
    out.mkdir(parents=True, exist_ok=True)
    inv = json.loads((REPO / 'data/imports/gcseenglang/inventory/8700-inventory.json').read_text())
    for paper in inv['papers']:
        if a.only and paper['paper_id'] not in a.only:
            continue
        data = extract(paper, a.research / 'sources')
        data['paper_id'] = paper['paper_id']
        (out / f"{paper['paper_id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
        print(paper['paper_id'], [(u['question'], u['marks'], ''.join(u['sources']) or '-', 'RM' if u['text_removed'] else '') for u in data['units']],
              {k: ('REMOVED' if v['removed'] else len(v['regions'])) for k, v in data['sources'].items()}, data['exceptions'] or '')


if __name__ == '__main__':
    main()
