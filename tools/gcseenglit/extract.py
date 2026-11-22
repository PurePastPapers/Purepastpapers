#!/usr/bin/env python3
"""Source-coordinate extraction of Eduqas GCSE English Literature question papers (C720QS).

Usage: extract.py --research DIR [--only PAPER ...]
  Reads data/imports/gcseenglit/inventory/c720qs-inventory.json and DIR/sources/, writes
  DIR/candidates/<PAPER>.json.

Eduqas prints each question number as two boxed digits ("2 1", "0 8", "3 2"); the
number is kept as that two-digit code ("21"). Tariffs are printed as "[15]", "[25]",
"[40]". Layout families:
- Shakespeare (Component 1 Section A; 2022 C722U10-A): a text heading ("Macbeth"), the
  rubric, question x1 (extract question, 15 marks) and x2 (essay, 25 marks including
  5 for SPaG) on one page, and the extract on the opposite page(s). Unit x1 is the
  heading, rubric and x1 with the extract pages; unit x2 is its own question.
- Anthology poetry (Component 1 Section B; 2022 C722U20-A): questions 71 and 72 on a
  named anthology poem (printed with 71) and a second poem of the candidate's choice.
- Post-1914 prose/drama and 19th century prose (Component 2 Sections A and B; 2022
  C722U10-B and C722U20-B): one 40-mark question per text ("0 8 An Inspector Calls"),
  each followed by its extract. A unit runs from its number to the next number or
  section; the extract is part of the crop.
- Unseen poetry (Component 2 Section C; 2022 C722U20-C): 31 (one poem, 15) and 32
  (comparison with a second poem, 25). Unit 31 is the section rubric, 31 and its poem;
  unit 32 is 32 and the second poem, with the rubric and first poem as unscored context.

Reconciliation: each text's questions sum to its section's 40 marks, one text per
section is answered, and the sections sum to the cover total. The owner's route is
Macbeth, An Inspector Calls, A Christmas Carol, the anthology and unseen poetry; other
texts are extracted so the booklet reconciles and listed as out of route.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

VERSION = 'eduqas-c720-layout-v1'
REPO = Path(__file__).resolve().parents[2]
SHAKESPEARE = ['Romeo and Juliet', 'Macbeth', 'Othello', 'Much Ado About Nothing', 'Henry V', 'Twelfth Night', 'The Merchant of Venice']
ROUTE = {'Macbeth': 'SHAKES', 'An Inspector Calls': 'POST1914', 'A Christmas Carol': 'C19'}
TARIFF = re.compile(r'\[\s*(\d{1,2})\s*\]')
FOOTER = re.compile(r'^(©\s*WJEC|\d{1,2}$|Turn over\.?$|BLANK PAGE$|END OF PAPER$|PLEASE TURN OVER|JD\*)')
REMOVED = re.compile(r'not reproduced|copyright reasons|has been removed|cannot be reproduced', re.I)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def page_rows(page):
    # The rotated booklet code is printed down the right margin (x > width - 70).
    words = [w for w in page.extract_words() if 40 < w['top'] < page.height - 40 and w['x0'] < page.width - 70 and w.get('upright', True)]
    rows = []
    for w in sorted(words, key=lambda w: (round(w['top']), w['x0'])):
        if rows and abs(rows[-1]['top'] - w['top']) < 3:
            rows[-1]['words'].append(w)
        else:
            rows.append({'top': w['top'], 'words': [w]})
    out = []
    for r in rows:
        r['words'].sort(key=lambda w: w['x0'])
        r['text'] = ' '.join(w['text'] for w in r['words'])
        r['bottom'] = max(w['bottom'] for w in r['words'])
        r['x0'] = r['words'][0]['x0']
        if re.match(r'^\d{1,2}$', r['text']) and r['top'] < 80:
            continue  # page number
        out.append(r)
    return out


def label_of(row):
    """Two boxed digits at the left margin: '2 1 Read ...', '0 8 An Inspector Calls', '* 2 2'."""
    ws = [w for w in row['words'] if w['x0'] < 100]
    ws = [w for w in ws if w['text'] != '*']
    if len(ws) >= 2 and re.fullmatch(r'\*?\d', ws[0]['text']) and re.fullmatch(r'\d', ws[1]['text']) and ws[1]['x0'] - ws[0]['x1'] < 30:
        return ws[0]['text'].lstrip('*') + ws[1]['text']
    return None


def frame(page):
    mx0, my0, mx1, my1 = page.mediabox
    cx0, cy0, cx1, cy1 = page.cropbox
    return cx0 - mx0, my1 - cy1, cx1 - cx0, cy1 - cy0


def box(pdf, rows, left=40, right=40):
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
        out.append({'page': pi + 1, 'bbox': [fx(left), fy(max(oy + 4, top - 8)), fx(page.width - right), fy(min(oy + h - 4, bottom + 6))]})
    return out


def text_of(rows):
    return '\n'.join(r['text'] for _, r in rows)


def tariff(rows):
    found = [int(m.group(1)) for _, r in rows for m in TARIFF.finditer(r['text'])]
    return found


def unseen_comparison_context(pdf, rows):
    """Keep the rubric and poem in separate crops around question 31's scored task."""
    labels = [i for i, (_, row) in enumerate(rows) if label_of(row) == '31']
    if len(labels) != 1 or not labels[0]:
        raise ValueError('Cannot locate the first unseen poetry question and its rubric')
    prompt = labels[0]
    title = re.search(r'Write about the poem (.+?) by ', rows[prompt][1]['text'])
    if not title:
        raise ValueError('Cannot read the first unseen poem title from its printed prompt')
    headings = [i for i, (_, row) in enumerate(rows) if i > prompt and row['text'] == title.group(1)]
    if len(headings) != 1 or tariff(rows[prompt:headings[0]]) != [15]:
        raise ValueError('Cannot separate the first unseen poem from its scored prompt')
    return box(pdf, rows[:prompt]) + box(pdf, rows[headings[0]:])


def extract(path, paper):
    import pdfplumber
    exceptions = []
    with pdfplumber.open(path) as pdf:
        stream = []
        for pi in range(1, len(pdf.pages)):
            for r in page_rows(pdf.pages[pi]):
                if FOOTER.match(r['text']):
                    if r['text'].startswith('END OF PAPER'):
                        stream.append((pi, dict(r, end=True)))
                    continue
                stream.append((pi, r))
        cover = ' '.join(r['text'] for r in page_rows(pdf.pages[0]))
        # Mark points in the stream.
        marks = []   # (index, kind, value)
        for i, (pi, r) in enumerate(stream):
            t = r['text']
            if r.get('end'):
                marks.append((i, 'end', None)); continue
            sec = re.match(r'^SECTION ([ABC])\b', t)
            if sec:
                marks.append((i, 'section', sec.group(1))); continue
            lab = label_of(r)
            if lab and not t.startswith(('Answer', 'You are advised', 'Question', 'for example')):
                prev = stream[i - 1] if i else None
                if prev and prev[0] == pi and prev[1]['text'].startswith('*') and prev[1]['x0'] < 60 and r['top'] - prev[1]['top'] < 8:
                    marks.append((i - 1, 'label', lab)); continue   # '* essay text' printed just above the boxed number
                marks.append((i, 'label', lab)); continue
            if t in SHAKESPEARE and r['x0'] < 80:
                marks.append((i, 'shakes', t)); continue
            if t == 'Poetry' and not any(k == 'poetry' for _, k, _ in marks):
                marks.append((i, 'poetry', t))
        questions = []
        section = None
        layout = None
        for k, (i, kind, val) in enumerate(marks):
            nxt = marks[k + 1][0] if k + 1 < len(marks) else len(stream)
            if kind == 'section':
                section = val
            if kind != 'label':
                continue
            first = val[0]
            if first in '123456' and val[1] in '12' and layout != 'prose':
                # Shakespeare or Component 1 poetry pair (x1, x2), or unseen (31, 32).
                pass
            rows = stream[i:nxt]
            questions.append({'number': val, 'index': i, 'end': nxt, 'rows': rows, 'section_mark': section})
        # Assign each question its section family and text.
        comp = paper['component']
        heads = [(i, v) for i, kind, v in marks if kind == 'shakes']
        poetry_head = next((i for i, kind, _ in marks if kind == 'poetry'), None)
        out = []
        for q in questions:
            n = q['number']
            text = text_of(q['rows'])
            first_row = q['rows'][0][1]['text'] if q['rows'][0][1]['text'] != '*' else q['rows'][1][1]['text']
            title = None
            c1 = comp in ('C1', 'C1A', 'C2A')
            if c1 and n[0] == '7':
                family = 'anthology'
            elif c1:
                family = 'shakespeare'
                head = max((h for h in heads if h[0] < q['index']), default=None)
                title = head[1] if head else None
            elif n[0] == '3':
                family = 'unseen'
            else:
                family = 'prose_drama' if n[0] in '01' else 'c19_prose'
                title = re.sub(r'^\*?\s*\d \d\s*', '', q['rows'][0][1]['text']).strip() or q['rows'][1][1]['text'].strip()
            q.update(family=family, title=title, text=text)
            out.append(q)
        # Build units with regions.
        units = []
        by_num = {q['number']: q for q in out}
        for q in out:
            n, fam = q['number'], q['family']
            rows = q['rows']
            if fam == 'shakespeare' and n[1] == '1':
                head = max(h[0] for h in heads if h[0] < q['index'])
                rows = stream[head:q['index']] + rows
            if fam == 'shakespeare' and n[1] == '2':
                # rows on later pages within the block are the extract (belongs to x1)
                page0 = rows[0][0]
                extract_rows = [x for x in rows if x[0] > page0]
                rows = [x for x in rows if x[0] == page0]
                partner = by_num.get(n[0] + '1')
                if partner is None:
                    exceptions.append({'type': 'missing_partner', 'question': n})
                else:
                    partner['extract_rows'] = extract_rows
            if fam in ('anthology', 'unseen') and n[1] == '1':
                start = poetry_head if fam == 'anthology' and poetry_head is not None else None
                if fam == 'unseen':
                    start = max((i for i, kind, v in marks if kind == 'section' and v == 'C' and i < q['index']), default=None)
                    if start is None:   # 2022 C722U20-C: one-section paper headed 'Unseen Poetry', rubric on the same page
                        start = next(i for i, x in enumerate(stream) if x[0] == q['rows'][0][0])
                if start is not None:
                    rubric = [x for x in stream[start:q['index']] if not x[1]['text'].startswith(('SECTION', 'The poems you have studied', 'Unseen Poetry'))]
                    if fam == 'anthology':
                        rubric = [x for x in rubric if x[0] == q['rows'][0][0]]
                    rows = rubric + rows
            q['unit_rows'] = rows
        for q in out:
            rows = q['unit_rows'] + q.get('extract_rows', [])
            q['all_rows'] = rows
            t = tariff(q['unit_rows'])
            if len(t) != 1:
                exceptions.append({'type': 'tariff_count', 'question': q['number'], 'found': t})
            q['marks'] = t[0] if t else None
            if REMOVED.search(text_of(rows)):
                q['copyright_removed_content'] = True
        # Context for unseen 32: the first poem and the section rubric.
        for q in out:
            if q['family'] == 'unseen' and q['number'][1] == '2':
                p1 = by_num.get(q['number'][0] + '1')
                if p1 is None:
                    raise ValueError('The comparison question has no first poem')
                q['context_regions'] = unseen_comparison_context(pdf, p1['all_rows'])
        # Reconcile.
        groups = {}
        for q in out:
            key = (q['family'], q['title']) if q['family'] in ('shakespeare', 'prose_drama', 'c19_prose') else (q['family'], None)
            groups.setdefault(key, []).append(q)
        sections = {}
        for (fam, title), qs in groups.items():
            total = sum(q['marks'] or 0 for q in qs)
            if total != 40:
                exceptions.append({'type': 'text_total', 'family': fam, 'title': title, 'total': total})
            sections.setdefault(fam, set()).add(total)
        effective = sum(max(v) for v in sections.values())
        if effective != paper['max_marks']:
            exceptions.append({'type': 'paper_marks_mismatch', 'inventory': paper['max_marks'], 'actual': effective})
        result = []
        for q in out:
            route = None
            if q['family'] in ('shakespeare', 'prose_drama', 'c19_prose'):
                route = ROUTE.get(q['title'])
                if q['title'] and not any(q['title'].startswith(t) for t in ROUTE) and q['title'] not in SHAKESPEARE and not q['title']:
                    exceptions.append({'type': 'unknown_title', 'question': q['number']})
            elif q['family'] == 'anthology':
                route = 'ANTH'
            elif q['family'] == 'unseen':
                route = 'UNSEEN'
            entry = {'number': q['number'], 'marks': q['marks'], 'family': q['family'], 'title': q['title'], 'route': route,
                     'regions': box(pdf, q['unit_rows']), 'extract_regions': box(pdf, q.get('extract_rows', [])) if q.get('extract_rows') else [],
                     'text': text_of(q['all_rows'])}
            if q.get('context_regions'):
                entry['context_regions'] = q['context_regions']
            if q.get('copyright_removed_content'):
                entry['copyright_removed_content'] = True
            result.append(entry)
        return {'extraction_version': VERSION, 'source_sha256': digest(path), 'page_count': len(pdf.pages),
                'cover_text': cover[:300], 'total_marks': effective, 'printed_tariff_sum': sum(q['marks'] or 0 for q in out),
                'questions': result, 'exceptions': exceptions}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--research', type=Path, required=True)
    ap.add_argument('--only', nargs='*')
    a = ap.parse_args()
    out = a.research / 'candidates'
    out.mkdir(parents=True, exist_ok=True)
    inv = json.loads((REPO / 'data/imports/gcseenglit/inventory/c720qs-inventory.json').read_text())
    for paper in inv['papers']:
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
        print(paper['paper_id'], len(data['questions']), 'q;', route, data['total_marks'], data['exceptions'] or '',
              [q['number'] for q in data['questions'] if q.get('copyright_removed_content')] or '')


if __name__ == '__main__':
    main()
