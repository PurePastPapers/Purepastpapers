#!/usr/bin/env python3
"""Source-coordinate extraction of Pearson English Literature question papers (9ET0, 8ET0).

Usage: extract.py --research DIR [--only PAPER ...]
  Reads data/imports/englit/inventory/*.json and DIR/sources/, writes DIR/candidates/.

Every printed question is one essay unit: a numbered question under its set-text heading
("Othello", "Science and Society", "The Romantics" ...), ending at "(Total for Question n
= m marks)". Each question's region runs from its number to its total. Questions are
numbered consecutively; a number out of sequence is an exception, as is a missing total.

Headings: the non-rubric lines printed since the previous question (e.g. "TRAGEDY /
Othello" or "Science and Society / Texts / Pre-1900: ... / Post-1900: ...") belong to the
next question and to its OR partner. Their region is kept, so the prose theme's text list
and the poetry collection's prescribed text can be shown as unscored context.

The A-level Paper 3 encloses a Source Booklet after the answer pages: the unseen poem and
the anthology poems a Section A question names ("on page 3 of the source booklet",
"(on pages 4-5)"). Booklet printed page n is PDF page (booklet cover + n - 1); each
referenced page must print the poem the question names, and its region (ending before
the source information) is the question's context. A referenced page that prints no poem,
or says material was removed, marks the question copyright_removed_content.

Reconciliation: one question per section is answered, so the cover total must equal the
sum over sections of the section tariff, and every question in a section has that tariff.
Route (owner's texts) is decided per heading in route_of(); other texts are extracted so
the booklet reconciles, and listed as out of route.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

VERSION = 'pearson-englit-layout-v1'
REPO = Path(__file__).resolve().parents[2]
TOTAL = re.compile(r'\(Total for Question (\d+) = (\d+) marks?\)')
RUBRIC = re.compile(r'^(SECTION [A-C]\b|Answer (EITHER|ONE|one|Question|the question)|EITHER$|OR$|You must (start|select)|Begin your answer|'
                    r'\(Begin your answer|TOTAL FOR (SECTION|PAPER)|Indicate which question|mind, put a line|put a line|Chosen question number|'
                    r'in Section B of the source booklet|Write your answer|(Shakespeare|Other Drama|Poetry|Drama|Prose)$|TRAGEDY$|COMEDY$)', re.I)
FOOTER = re.compile(r'^(\*P\d+[A-Z]*\d*\*|Turn over|\d{1,2}$|\.{8,}|(\d{1,2} )?P\d{5}[A-Z]{1,3}( \d{1,2})?$|BLANK PAGE|[- ]+$)')
REMOVED = re.compile(r'not reproduced here|copyright restrictions|has been removed|cannot be reproduced', re.I)
PAGES = re.compile(r'\bpages? (\d{1,2})(?:\s*(?:-|–|to|and)\s*(\d{1,2}))?')
SOURCE_INFO = re.compile(r'^(Source [Ii]nformation|Acknowledgements?|Every effort has been made)')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def lines_of(page, left=25, right=60, top=30, bottom=30):
    # Answer pages print 'DO NOT WRITE IN THIS AREA' in both margins.
    words = [w for w in page.extract_words(keep_blank_chars=False, use_text_flow=False)
             if left < w['x0'] < page.width - right and top < w['top'] < page.height - bottom and w.get('upright', True)]
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
    return [r for r in rows if not FOOTER.match(r['text'])]


def frame(page):
    mx0, my0, mx1, my1 = page.mediabox
    cx0, cy0, cx1, cy1 = page.cropbox
    return cx0 - mx0, my1 - cy1, cx1 - cx0, cy1 - cy0


def box(pdf, rows, left=40, right=75):
    by_page = {}
    for pi, r in rows:
        b = by_page.setdefault(pi, [r['top'], r['bottom']])
        b[0], b[1] = min(b[0], r['top']), max(b[1], r['bottom'])
    out = []
    for pi in sorted(by_page):
        page = pdf.pages[pi]
        ox, oy, w, h = frame(page)
        top, bottom = by_page[pi]
        fx = lambda x: round(min(1, max(0, (x - ox) / w)), 6)
        fy = lambda y: round(min(1, max(0, (y - oy) / h)), 6)
        out.append({'page': pi + 1, 'bbox': [fx(left), fy(max(oy + 4, top - 6)), fx(page.width - right), fy(min(oy + h - 4, bottom + 6))]})
    return out


def flat(text):
    return re.sub(r'[^a-z0-9]+', '', text.lower().replace('‘', "'").replace('’', "'"))


def route_of(paper, section, heading):
    """Route topic code for a question, or None when the text is not in the owner's route."""
    lines = [l.strip() for l in heading.splitlines()]
    comp, is_as = paper['component'], paper['is_as']
    if comp == '02':
        return 'P' if 'Science and Society' in lines else None
    if comp == '01' and not is_as:
        if section == 'A':
            return 'A' if 'Othello' in lines else None
        return 'B' if any(l.startswith('A Streetcar Named Desire') for l in lines) else None
    if comp == '01' and is_as:
        if section == 'A':
            return 'PD'
        return 'B' if any(l.startswith('A Streetcar Named Desire') for l in lines) else None
    if comp == '03':
        if section == 'A':
            return 'PD'
        return 'R' if 'The Romantics' in lines else None
    raise ValueError(f'Unknown component {comp}')


def booklet_start(pdf, texts):
    for i in range(2, len(texts)):
        t = texts[i]
        if 'Source Booklet' in t and 'Chosen question' not in t and 'Answer ONE' not in t and 'Candidate' not in t:
            nxt = texts[i + 1] if i + 1 < len(texts) else ''
            if 'SECTION A' in t + nxt or 'BLANK PAGE' in nxt:
                return i
    return None


def rubric_box(pdf, page_index, rows):
    words = [word for row in rows for word in row['words']]
    left = min(word['x0'] for word in words) - 5
    right = pdf.pages[page_index].width - max(word['x1'] for word in words) - 5
    return box(pdf, [(page_index, row) for row in rows], left=left, right=right)


def prose_rubric(pdf, page_number):
    """Keep each paper's printed Prose choice rule, including any period restriction."""
    for page_index in range(page_number - 1, 0, -1):
        rows = lines_of(pdf.pages[page_index], right=34)
        choose = next((i for i, row in enumerate(rows) if re.match(r'Answer ONE question on', row['text'], re.I)), None)
        if choose is not None:
            rule = [rows[choose]]
            next_row = rows[choose + 1:choose + 2]
            if next_row and re.match(r'(?:Begin your answer|page \d+\.)', next_row[0]['text'], re.I):
                rule.extend(next_row)
            return rubric_box(pdf, page_index, rule)
    raise ValueError(f'Prose rubric missing at or before PDF page {page_number}')


def romantics_rubric(pdf, page_number):
    """Keep the choose-one and prescribed-poem rules printed above The Romantics."""
    page_index = page_number - 1
    page = pdf.pages[page_index]
    rows = lines_of(page, right=34)
    heading = next((i for i, row in enumerate(rows) if row['text'] == 'The Romantics'), None)
    if heading is None:
        raise ValueError(f'Romantics heading missing on PDF page {page_number}')
    before = rows[max(0, heading - 9):heading]
    choose = next((i for i, row in enumerate(before) if re.match(r'Answer ONE question', row['text'], re.I)), None)
    if choose is None or not any('prescribed list' in row['text'] for row in before[choose:]):
        raise ValueError(f'Romantics rubric missing on PDF page {page_number}')
    return rubric_box(pdf, page_index, before[choose:])


def extract(path, paper):
    import pdfplumber
    exceptions = []
    with pdfplumber.open(path) as pdf:
        texts = [p.extract_text() or '' for p in pdf.pages]
        cover = re.search(r'total mark for this paper is (\d+)', ' '.join(texts[0].split()))
        cover_total = int(cover.group(1)) if cover else None
        start = booklet_start(pdf, texts) if paper['component'] == '03' else None
        last = start if start is not None else len(pdf.pages)
        stream = [(pi, r) for pi in range(1, last) for r in lines_of(pdf.pages[pi])]
        questions, current, heading, section = [], None, [], ('A' if paper['component'] == '02' else None)
        expected = 1
        for pi, row in stream:
            text = row['text']
            sec = re.match(r'^SECTION ([A-C])\b', text)
            if sec and current is None:
                section, heading = sec.group(1), []
                continue
            m = re.match(r'^(\d{1,2}) (\S.*)$', text)
            if m and current is None and row['x0'] < 90 and int(m.group(1)) == expected and section:
                current = {'number': m.group(1), 'section': section, 'rows': [(pi, row)], 'marks': None}
                if heading:
                    current['heading_rows'] = heading
                elif questions:
                    current['heading_rows'] = questions[-1]['heading_rows']
                else:
                    current['heading_rows'] = []
                heading = []
                questions.append(current)
                expected += 1
                continue
            if current is not None:
                t = TOTAL.search(text)
                if t:
                    current['marks'] = int(t.group(2))
                    if t.group(1) != current['number']:
                        exceptions.append({'type': 'total_label_mismatch', 'question': current['number']})
                    current['rows'].append((pi, row))
                    current = None
                    continue
                if 'Indicate which question' in text or text.startswith('Chosen question'):
                    exceptions.append({'type': 'no_tariff', 'question': current['number']})
                    current = None
                    continue
                current['rows'].append((pi, row))
            elif section and not RUBRIC.match(text) and not re.match(r'^(\d+ )?[.\s]+$', text):
                heading.append((pi, row))
        if current is not None:
            exceptions.append({'type': 'no_tariff', 'question': current['number']})
        booklet = {}
        if start is not None:
            for k in range(start, len(pdf.pages)):
                rows = lines_of(pdf.pages[k], 15, 15, 12, 20)
                cut = next((i for i, r in enumerate(rows) if SOURCE_INFO.match(r['text'])), len(rows))
                booklet[k - start + 1] = [(k, r) for r in rows[:cut]]
        out, sections = [], {}
        for q in questions:
            if q['marks'] is None:
                continue
            htext = '\n'.join(r['text'] for _, r in q['heading_rows'])
            text = '\n'.join(r['text'] for _, r in q['rows'])
            entry = {'number': q['number'], 'marks': q['marks'], 'section': q['section'],
                     'heading': htext, 'heading_regions': box(pdf, q['heading_rows']) if q['heading_rows'] else [],
                     'regions': box(pdf, q['rows']), 'text': text, 'route': route_of(paper, q['section'], htext)}
            sections.setdefault(q['section'], []).append(entry)
            if paper['component'] == '03' and q['section'] == 'A':
                one = ' '.join(text.split())
                refs = []
                for a, b in PAGES.findall(one):
                    refs += list(range(int(a), int(b or a) + 1))
                if start is None or not refs:
                    exceptions.append({'type': 'missing_source_booklet', 'question': q['number']})
                else:
                    poems = re.findall(r'anthology poem (.+?) by ', one)
                    unseen = re.search(r'Read the poem (.+?) by (.+?) on page', one)
                    rows = [x for n in sorted(set(refs)) for x in booklet.get(n, [])]
                    btext = '\n'.join(r['text'] for _, r in rows)
                    entry['context_regions'] = box(pdf, rows, 15, 15)
                    entry['context_pages'] = sorted(set(refs))
                    entry['unseen'] = unseen.group(1) if unseen else None
                    entry['named_poems'] = poems
                    missing = [p for p in poems + ([unseen.group(2).split()[-1]] if unseen else []) if flat(p)[:20] not in flat(btext)]
                    if REMOVED.search(btext) or any(len(booklet.get(n, [])) < 3 for n in refs) or missing:
                        entry['copyright_removed_content'] = True
                        entry['removed_basis'] = f'booklet pages {sorted(set(refs))} do not print {missing or "the poems"}'
            out.append(entry)
        effective = 0
        for letter, qs in sections.items():
            tariffs = {q['marks'] for q in qs}
            if len(tariffs) != 1:
                exceptions.append({'type': 'section_tariffs_differ', 'section': letter, 'tariffs': sorted(tariffs)})
            effective += max(tariffs)
        if cover_total is None or effective != cover_total or effective != paper['max_marks']:
            exceptions.append({'type': 'paper_marks_mismatch', 'cover': cover_total, 'inventory': paper['max_marks'], 'actual': effective})
        groups = []
        for q in out:
            if q['route'] and (not groups or groups[-1]['route'] != q['route'] or groups[-1]['section'] != q['section']):
                groups.append({'section': q['section'], 'route': q['route'], 'members': []})
            if q['route']:
                groups[-1]['members'].append(q['number'])
        return {'extraction_version': VERSION, 'source_sha256': digest(path), 'page_count': len(pdf.pages),
                'booklet_first_page': start + 1 if start is not None else None, 'cover_total': cover_total,
                'total_marks': effective, 'printed_tariff_sum': sum(q['marks'] for q in out),
                'route_groups': groups, 'questions': out, 'exceptions': exceptions}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--research', type=Path, required=True)
    ap.add_argument('--only', nargs='*')
    a = ap.parse_args()
    out = a.research / 'candidates'
    out.mkdir(parents=True, exist_ok=True)
    for inv in sorted((REPO / 'data/imports/englit/inventory').glob('*-inventory.json')):
        for paper in json.loads(inv.read_text())['papers']:
            if a.only and paper['paper_id'] not in a.only:
                continue
            doc = paper['documents']['question_paper']
            path = a.research / 'sources' / doc['file_name']
            if digest(path) != doc['sha256']:
                raise SystemExit(f'Checksum mismatch: {path.name}')
            data = extract(path, paper)
            data['paper_id'] = paper['paper_id']
            (out / f"{paper['paper_id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
            route = [(q['number'], q['route'], q['marks']) for q in data['questions'] if q['route']]
            print(paper['paper_id'], len(data['questions']), 'questions;', route, data['total_marks'], data['exceptions'] or '',
                  [q['number'] for q in data['questions'] if q.get('copyright_removed_content')] or '')


if __name__ == '__main__':
    main()
