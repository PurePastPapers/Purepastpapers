#!/usr/bin/env python3
"""Source-coordinate extraction of Pearson 9HI0 Route H question papers (1H, 2H.2, 33).

Each 20-mark essay or source/extract question is one assessable unit. A question's
region runs from the first printed line after the previous question's tariff (section
rubric, EITHER/OR and option headings skipped) to its own tariff: "(20)" or
"(Total for Question n = 20 marks)". The question paper PDF encloses its Extracts or
Sources Booklet after the answer pages; a source/extract question also gets that
booklet's block for it ("Sources for use with Question n", "Extracts for use with
Section C", "Source for use with Section A") as context pixels.

The 9HI0/2H booklet prints options 2H.1 and 2H.2 side by side; only 2H.2 questions are
kept. Reconciliation: the imported option's maximum (1H 60, 2H.2 40, 33 60) must equal
the compulsory tariffs plus one tariff per choice group. Output is a review candidate:
crops are source pixels and no extracted text is displayed.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

VERSION = 'pearson-9hi0-route-h-layout-v3-cropbox'
MAXIMUM = {'1H': 60, '2H': 40, '33': 60}
KEEP_OPTION = {'2H': 'Option 2H.2'}
TOTAL = re.compile(r'\(Total for Question (\d+) = (\d+) marks\)')
BARE = re.compile(r'^\((\d{1,2})\)$')
RUBRIC = re.compile(r'^(SECTION [A-C]$|Answer (EITHER|ONE|Question|the question)|Choose EITHER|EITHER$|OR$|You must start|'
                    r'TOTAL FOR (SECTION|PAPER)|Indicate which question|mind, put a line|Chosen question number)', re.I)
FOOTER = re.compile(r'^(\*P\d+A\d*\*|Turn over|\d{1,2}$|\.{8,}|(\d{1,2} )?P\d{5}[A-Z]{1,2}( \d{1,2})?$|BLANK PAGE|[\uf000-\uf8ff ]+$)')
ACKNOWLEDGEMENT = re.compile(r'^(Acknowledgements?:?$|Every effort has been made|(Source|Extract)s? \d+( and \d+)? (from|adapted from|taken from):)')
REMOVED = re.compile(r'not reproduced here|copyright restrictions|has been removed', re.I)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def lines_of(page, left=45, right=75, top=30):
    # Answer pages print 'DO NOT WRITE IN THIS AREA' in both margins; the booklet does not.
    words = [w for w in page.extract_words() if left < w['x0'] < page.width - right and top < w['top'] < page.height - 30]
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
        r['x1'] = max(w['x1'] for w in r['words'])
    return [r for r in rows if not FOOTER.match(r['text'])]


def frame(page):
    """CropBox origin and size in pdfplumber's top-left coordinates: the renderer crops
    the CropBox view, so region fractions must be CropBox-relative."""
    mx0, my0, mx1, my1 = page.mediabox
    cx0, cy0, cx1, cy1 = page.cropbox
    return cx0 - mx0, my1 - cy1, cx1 - cx0, cy1 - cy0


def box(pdf, by_page, left=40, right=75):
    regions = []
    for pi in sorted(by_page):
        page = pdf.pages[pi]
        ox, oy, w, h = frame(page)
        top, bottom = by_page[pi]
        fx = lambda x: round(min(1, max(0, (x - ox) / w)), 6)
        fy = lambda y: round(min(1, max(0, (y - oy) / h)), 6)
        regions.append({'page': pi + 1, 'bbox': [fx(left), fy(max(oy + 4, top - 6)), fx(page.width - right), fy(min(oy + h - 4, bottom + 6))]})
    return regions


def span(rows):
    by_page = {}
    for pi, row in rows:
        b = by_page.setdefault(pi, [row['top'], row['bottom']])
        b[0], b[1] = min(b[0], row['top']), max(b[1], row['bottom'])
    return by_page


def booklet_blocks(pdf, start):
    """Booklet context blocks keyed by question number or section letter."""
    stream = [(pi, r) for pi in range(start + 1, len(pdf.pages)) for r in lines_of(pdf.pages[pi], 15, 15, 12)]
    cut = next((i for i, (_, r) in enumerate(stream) if ACKNOWLEDGEMENT.match(r['text'])), len(stream))
    stream = stream[:cut]
    heads = []
    for i, (_, r) in enumerate(stream):
        m = re.match(r'^(?:Sources?|Extracts?) for use with (Question (\d+)|Section ([A-C]))', r['text'])
        if m:
            heads.append((i, m.group(2) or m.group(3)))
    out = {}
    for k, (i, key) in enumerate(heads):
        end = heads[k + 1][0] if k + 1 < len(heads) else len(stream)
        rows = stream[i:end]
        # An option heading printed just before the next block belongs to that block.
        while rows and rows[-1][1]['text'].startswith('Option '):
            rows = rows[:-1]
        out[key] = {'regions': box(pdf, span(rows), 15, 15), 'text': '\n'.join(r['text'] for _, r in rows)}
    return out


def extract(path, comp):
    import pdfplumber
    exceptions = []
    with pdfplumber.open(path) as pdf:
        start = next(i for i, p in enumerate(pdf.pages) if i and 'Booklet' in (p.extract_text() or '')
                     and 'Do not return' in (p.extract_text() or ''))
        blocks = booklet_blocks(pdf, start)
        stream = [(pi, r) for pi in range(1, start) for r in lines_of(pdf.pages[pi])]
        questions, current, pending, section, option, group_key = [], None, [], None, None, None
        groups = {}
        for pi, row in stream:
            text = row['text']
            sec = re.match(r'^SECTION ([A-C])$', text)
            if sec:
                section, pending = sec.group(1), []
                continue
            if text.startswith('Option '):
                option, pending = text, []
                continue
            m = re.match(r'^(\d) (\S.*)$', text)
            if m and row['x0'] < 90 and current is None and section and \
                    not any(q['number'] == m.group(1) for q in questions):
                current = {'number': m.group(1), 'section': section, 'option': option,
                           'rows': list(pending) + [(pi, row)], 'marks': None}
                pending = []
                questions.append(current)
                continue
            if current is not None:
                t = TOTAL.search(text) or BARE.match(text)
                if t:
                    current['marks'] = int(t.groups()[-1])
                    if t.re is TOTAL and t.group(1) != current['number']:
                        exceptions.append({'type': 'total_label_mismatch', 'question': current['number']})
                    current['rows'].append((pi, row))
                    current = None
                    continue
                if 'Indicate which question' in text or text.startswith('Chosen question'):
                    exceptions.append({'type': 'no_tariff', 'question': current['number']})
                    current = None
                    continue
                current['rows'].append((pi, row))
            elif not RUBRIC.match(text) and section and not re.match(r'^(\d+ )?\.+$', text):
                if re.match(r'^(Study|Read) ', text) or pending:
                    pending.append((pi, row))
        keep = KEEP_OPTION.get(comp)
        out = []
        for q in questions:
            if keep and not (q['option'] or '').startswith(keep):
                continue
            if q['marks'] is None:
                exceptions.append({'type': 'no_tariff', 'question': q['number']})
                continue
            text = '\n'.join(r['text'] for _, r in q['rows'])
            entry = {'number': q['number'], 'marks': q['marks'], 'section': f"Section {q['section']}",
                     'option': (q['option'] or '').split(':')[0].replace('Option ', '') or comp,
                     'regions': box(pdf, span(q['rows'])), 'text': text,
                     'parts': [{'part_label': '', 'marks': q['marks']}]}
            block = blocks.get(q['number']) or (blocks.get(q['section']) if re.search(r'\b(Sources?|Extracts?)\b', text) else None)
            if re.search(r'\b(Sources?|Extracts?)\b.*\bBooklet\b|\bExtracts? 1\b|\bthe source\b|\bSources? \d', text):
                if not block:
                    exceptions.append({'type': 'missing_booklet_context', 'question': q['number']})
                else:
                    entry['context_regions'] = block['regions']
                    entry['context_text'] = block['text']
                    if REMOVED.search(block['text']):
                        entry['copyright_removed_content'] = True
            out.append(entry)
        groups = {}
        for q in out:
            groups.setdefault(q['section'], []).append(q['number'])
        choice = [g for g in groups.values() if len(g) > 1]
        in_choice = {n for g in choice for n in g}
        marks = {q['number']: q['marks'] for q in out}
        effective = sum(m for n, m in marks.items() if n not in in_choice) + sum(max(marks[n] for n in g) for g in choice)
        if effective != MAXIMUM[comp]:
            exceptions.append({'type': 'paper_marks_mismatch', 'expected': MAXIMUM[comp], 'actual': effective})
        return {'extraction_version': VERSION, 'source_sha256': digest(path), 'page_count': len(pdf.pages),
                'booklet_first_page': start + 1, 'expected_total_marks': MAXIMUM[comp], 'total_marks': effective,
                'choice_groups': choice, 'questions': out, 'exceptions': exceptions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for paper in json.loads(args.inventory.read_text())['papers']:
        doc = paper['documents']['question_paper']
        path = args.sources / f"{paper['paper_id']}__question_paper.pdf"
        if digest(path) != doc['sha256']:
            raise SystemExit(f'Checksum mismatch: {path.name}')
        data = extract(path, paper['component'])
        data['paper_id'] = paper['paper_id']
        (args.output / f"{paper['paper_id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
        print(paper['paper_id'], [(q['number'], q['section'][-1], q['marks'], 'ctx' if q.get('context_regions') else '') for q in data['questions']],
              data['total_marks'], '/', data['expected_total_marks'], data['choice_groups'], data['exceptions'] or '',
              [q['number'] for q in data['questions'] if q.get('copyright_removed_content')] or '')


if __name__ == '__main__':
    main()
