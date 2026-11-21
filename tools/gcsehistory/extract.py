#!/usr/bin/env python3
"""Source-coordinate extraction of Pearson 1HI0 question papers (booklets 10, B1 and 31).

One scored unit per printed part with its own tariff: "1", "2(a)", "2(b)", "(c)(i)" ...
Pearson prints a part's tariff right after its question text, as a bare "(8)" at the right
margin, or, for an undivided question, only in "(Total for Question 1 = 4 marks)". Papers
5/6 and 3(d) carry 4 further SPaG marks ("Total for spelling, punctuation, grammar and use of
specialist terminology = 4 marks"): they are part of that unit's tariff (16 + 4 = 20).

A unit's crop runs from its first printed line (with any "Study Source A below" material or
the SPaG rubric printed just before it) to the last printed line before the next part:
answer lines, answer-box dots, tariff totals and page furniture are never inside it.

Sources and Interpretations live in the Sources Booklet that follows the answer pages of the
same PDF ("Sources for use with Section A", "Sources/interpretations for use with Section B").
A unit that names Source B or Interpretation 1 gets those items as unscored context pixels,
one region set per item, including any picture. Choice groups (EITHER ... OR) are recorded.
Reconciliation: each printed "Total for Question n" must equal that question's units counted
one per choice group, and the paper must equal its official maximum (10: 52, B1: 32, 31: 52).
Output is a review candidate: crops are source pixels and no extracted text is displayed.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

VERSION = 'pearson-1hi0-layout-v1'
MAXIMUM = {'10': 52, 'B1': 32, '31': 52}
TOTAL_Q = re.compile(r'^\(Total for Question (\d+) = (\d+) marks?\)$')
TOTAL_SPAG = re.compile(r'^\(Total for spelling, punctuation, grammar and use of specialist terminology = (\d+) marks?\)$')
BARE = re.compile(r'^\((\d{1,2})\)$')
TOP = re.compile(r'^([1-9])\s+(?:\(([a-z])\)\s*)?(?:\(([ivx]+)\)\s*)?(\S.*)$')
SUB = re.compile(r'^\(([a-z])\)\s*(?:\(([ivx]+)\)\s*)?(\S.*)$')
SECTION = re.compile(r'^SECTION [A-C]\b')
FOOTER = re.compile(r'^(\*P\d+A\d*\*|Turn over|\d{1,2}$|\.{6,}|(\d{1,2} )?P\d{5}[A-Z]{1,2}( \d{1,2})?$|BLANK PAGE|[- ]+$|PLEASE ENSURE YOU ALSO)')
END = re.compile(r'^(TOTAL FOR (SECTION|PAPER|BOOKLET)|Indicate which question|mind, put a line|Chosen question number)', re.I)
ACKNOWLEDGEMENT = re.compile(r'^(Acknowledgements?:?$|Every effort has been made|Pearson Education Ltd\. will|Source[s]? [A-Z0-9]+( and [A-Z0-9]+)?,? (taken|from|adapted|is|are)\b|Interpretation)', re.I)
ITEM = re.compile(r'^(Source|Interpretation|Extract) ([A-Z]|\d)\s*:')
REMOVED = re.compile(r'not reproduced here|copyright restrictions|has been removed|third.party copyright', re.I)
NAMES = re.compile(r'\b(Sources?|Interpretations?) ((?:[A-Z]|\d)(?:(?:,| and|, and| or) (?:[A-Z]|\d))*)')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def frame(page):
    mx0, my0, mx1, my1 = page.mediabox
    cx0, cy0, cx1, cy1 = page.cropbox
    return cx0 - mx0, my1 - cy1, cx1 - cx0, cy1 - cy0


def lines_of(page, left=45, right=75, top=30, images=True):
    """Text rows of a page's body, plus one pseudo-row per picture, in reading order. The left
    and right margins carry the printed 'DO NOT WRITE IN THIS AREA' watermark, so they are cut."""
    ox, oy, w, h = frame(page)
    words = [x for x in page.extract_words() if left < x['x0'] < page.width - right and top < x['top'] < page.height - 30]
    rows = []
    for x in sorted(words, key=lambda x: (round(x['top']), x['x0'])):
        if rows and abs(rows[-1]['top'] - x['top']) < 3:
            rows[-1]['words'].append(x)
        else:
            rows.append({'top': x['top'], 'words': [x]})
    for r in rows:
        r['words'].sort(key=lambda x: x['x0'])
        r['text'] = re.sub(r'\s+', ' ', re.sub(r'[-]', ' ', ' '.join(x['text'] for x in r['words']))).strip()
        r['bottom'] = max(x['bottom'] for x in r['words'])
        r['x0'] = r['words'][0]['x0']
        r['kind'] = 'text'
    rows = [r for r in rows if r['text'] and not FOOTER.match(r['text'])]
    if images:
        for im in page.images:
            iw, ih = im['x1'] - im['x0'], im['bottom'] - im['top']
            if iw < 30 or ih < 30 or iw > 0.9 * w and ih > 0.9 * h or im['top'] < 40 or im['bottom'] > page.height - 30:
                continue
            if im['x1'] < left or im['x0'] > page.width - right:
                continue
            rows.append({'top': im['top'], 'bottom': im['bottom'], 'x0': im['x0'], 'text': '[picture]', 'kind': 'image', 'words': []})
    rows.sort(key=lambda r: (r['top'], r['x0']))
    return rows


def box(pdf, by_page, left=66, right=75, extend_last=0):
    regions = []
    for pi in sorted(by_page):
        page = pdf.pages[pi]
        ox, oy, w, h = frame(page)
        top, bottom = by_page[pi]
        if extend_last and pi == max(by_page):
            bottom = min(bottom + extend_last, page.height - 60)   # an answer table's open box under its last prompt
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


def booklet_items(pdf, start):
    """Source and Interpretation items of the booklet that begins at page index `start`."""
    stream = [(pi, r) for pi in range(start + 1, len(pdf.pages)) for r in lines_of(pdf.pages[pi], 15, 15, 12)]
    cut = next((i for i, (_, r) in enumerate(stream) if r['kind'] == 'text' and ACKNOWLEDGEMENT.match(r['text']) and not ITEM.match(r['text'])), len(stream))
    stream = stream[:cut]
    heads = [i for i, (_, r) in enumerate(stream) if r['kind'] == 'text' and r['x0'] < 100 and ITEM.match(r['text'])]
    out = {}
    for k, i in enumerate(heads):
        end = heads[k + 1] if k + 1 < len(heads) else len(stream)
        rows = stream[i:end]
        m = ITEM.match(rows[0][1]['text'])
        key = f'{m.group(1)} {m.group(2)}'
        out[key] = {'regions': box(pdf, span(rows), 15, 15), 'text': '\n'.join(r['text'] for _, r in rows if r['kind'] == 'text'),
                    'pages': sorted({pi + 1 for pi, _ in rows}), 'has_picture': any(r['kind'] == 'image' for _, r in rows)}
    return out


def wanted_items(text):
    """Booklet items a unit's own wording names (Sources B and C, Interpretations 1 and 2)."""
    keys = []
    for kind, names in NAMES.findall(text):
        for n in re.findall(r'[A-Z]|\d', names):
            keys.append(f"{kind.rstrip('s')} {n}")
    return list(dict.fromkeys(keys))


def extract(path, comp):
    import pdfplumber
    exceptions = []
    with pdfplumber.open(path) as pdf:
        start = next((i for i, p in enumerate(pdf.pages) if i and re.search(r'(Sources?|Interpretations?)(/Interpretations)? Booklet', p.extract_text() or '')
                      and 'Do not return' in (p.extract_text() or '')), None)
        items = booklet_items(pdf, start) if start is not None else {}
        stop = start if start is not None else len(pdf.pages)
        stream = [(pi, r) for pi in range(1, stop) for r in lines_of(pdf.pages[pi])]
        units, current, pending, section, number = [], None, [], None, None
        choice, group_id, totals = None, 0, {}

        def close():
            nonlocal current
            current = None

        for pi, row in stream:
            text = row['text']
            if row['kind'] == 'image':
                if current is not None:
                    current['rows'].append((pi, row))
                elif pending:
                    pending.append((pi, row))
                continue
            if SECTION.match(text):
                section = text[8]
                close()
                pending = []
                continue
            if END.match(text):
                close()
                continue
            if row['x0'] > 120 and re.match(r'^Answer (EITHER|ONE|Questions?|both|all|Question)\b', text):
                close()
                pending = []
                continue
            if re.match(r'^Spelling, punctuation, grammar and use of specialist terminology', text):
                close()
                pending = [(pi, row)]
                continue
            if text in ('EITHER', 'OR'):
                close()
                if text == 'EITHER':
                    group_id += 1
                choice = group_id
                continue
            t = TOTAL_Q.match(text)
            if t:
                totals[t.group(1)] = int(t.group(2))
                if current is not None and current['marks'] is None:
                    current['marks'] = int(t.group(2))
                    current['tariff_from_total'] = True
                close()
                continue
            t = TOTAL_SPAG.match(text)
            if t:
                if current is not None:
                    current['spag'] = int(t.group(1))
                continue
            m = TOP.match(text) if row['x0'] < 80 else None
            s = SUB.match(text) if (m is None and number is not None and 80 <= row['x0'] < 100) else None
            if m and (number is None or int(m.group(1)) == int(number) + 1 or int(m.group(1)) == int(number)):
                number = m.group(1)
                part = ''.join(f'({x})' for x in (m.group(2), m.group(3)) if x)
                lead = [pr for pr in pending]
                pending = []
            elif s:
                part = ''.join(f'({x})' for x in (s.group(1), s.group(2)) if x)
                lead = [pr for pr in pending]
                pending = []
            else:
                if current is not None:
                    bare = BARE.match(text)
                    if bare and current['marks'] is None and row['x0'] > 400:
                        current['marks'] = int(bare.group(1))
                    current['rows'].append((pi, row))
                elif re.match(r'^(Study|Read) ', text) or pending or re.match(r'^Spelling, punctuation', text):
                    if not (text.startswith('Answer ') or text.startswith('Complete')):
                        pending.append((pi, row))
                continue
            current = {'question': number, 'part': part, 'section': section, 'marks': None, 'spag': 0,
                       'rows': lead + [(pi, row)], 'choice': choice, 'tariff_from_total': False}
            if choice == 'EITHER':
                group_id += 1
            current['group'] = choice
            choice = None
            units.append(current)
        # A unit after OR joins the open group; recompute groups from EITHER/OR markers
        out, groups = [], {}
        for u in units:
            if u['marks'] is None:
                exceptions.append({'type': 'no_tariff', 'label': u['question'] + u['part']})
                continue
            label = f"{u['question']}{u['part']}"
            text = '\n'.join(r['text'] for _, r in u['rows'] if r['kind'] == 'text')
            marks = u['marks'] + (u['spag'] or 0)
            if u['tariff_from_total'] and u['spag']:
                marks = u['marks']          # a printed question total already includes SPaG
            entry = {'label': label, 'question': u['question'], 'part': u['part'], 'section': f"Section {u['section']}" if u['section'] else None,
                     'marks': marks, 'scored_marks': u['marks'] if not u['tariff_from_total'] else u['marks'] - (u['spag'] or 0),
                     'spag_marks': u['spag'] or 0, 'regions': box(pdf, span(u['rows']), extend_last=85 if re.search(r'Complete the table below|What I can infer', text) else 0), 'text': text, 'group': u['group'], 'context': []}
            if u['group']:
                groups.setdefault(u['group'], []).append(label)
            wanted = [k for k in wanted_items(text) if f'{k.split()[0]} {k.split()[1]}:' not in text]
            inline = bool(re.search(r'\bSource [A-Z]:', text))
            for k in wanted:
                if k in items:
                    entry['context'].append(k)
                elif not inline:
                    exceptions.append({'type': 'missing_booklet_item', 'label': label, 'item': k})
            if re.search(r'Sources? Booklet|Sources/Interpretations Booklet', text) and not entry['context'] and not inline:
                exceptions.append({'type': 'booklet_named_but_no_item', 'label': label})
            if any(REMOVED.search(items[k]['text']) for k in entry['context']):
                entry['copyright_removed_content'] = True
            out.append(entry)
        # Reconcile per question and per paper, counting one unit per choice group.
        choice_groups = [g for g in groups.values() if len(g) > 1]
        in_choice = {x for g in choice_groups for x in g}
        by_label = {u['label']: u['marks'] for u in out}

        def effective(labels):
            return sum(by_label[x] for x in labels if x not in in_choice) + sum(max(by_label[x] for x in g if x in labels) for g in choice_groups if any(x in labels for x in g))
        for q, total in totals.items():
            labels = [u['label'] for u in out if u['question'] == q]
            if labels and effective(labels) != total:
                exceptions.append({'type': 'question_total_mismatch', 'question': q, 'printed': total, 'units': effective(labels)})
        paper_total = effective([u['label'] for u in out])
        if paper_total != MAXIMUM[comp]:
            exceptions.append({'type': 'paper_marks_mismatch', 'expected': MAXIMUM[comp], 'actual': paper_total})
        return {'extraction_version': VERSION, 'source_sha256': digest(path), 'page_count': len(pdf.pages),
                'booklet_first_page': None if start is None else start + 1, 'expected_total_marks': MAXIMUM[comp], 'total_marks': paper_total,
                'choice_groups': choice_groups, 'printed_question_totals': totals, 'units': out,
                'context_items': {k: v for k, v in items.items()}, 'exceptions': exceptions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--only', nargs='*')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for paper in json.loads(args.inventory.read_text())['papers']:
        if args.only and paper['paper_id'] not in args.only:
            continue
        doc = paper['documents']['question_paper']
        path = args.sources / f"{paper['paper_id']}__question_paper.pdf"
        if digest(path) != doc['sha256']:
            raise SystemExit(f'Checksum mismatch: {path.name}')
        data = extract(path, paper['component'])
        data['paper_id'] = paper['paper_id']
        (args.output / f"{paper['paper_id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
        print(paper['paper_id'], [(u['label'], u['marks'], u['group'] or '', ','.join(u['context'])) for u in data['units']],
              data['total_marks'], '/', data['expected_total_marks'], data['exceptions'] or '')


if __name__ == '__main__':
    main()
