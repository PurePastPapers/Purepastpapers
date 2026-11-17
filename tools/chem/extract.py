#!/usr/bin/env python3
"""Source-coordinate extraction of public OCR Computer Science papers (H446 and AS H046).

OCR prints the question number, part "(a)" and sub-part "(i)" at the left margin and the
tariff "[n]" at the right, usually fused onto the last dotted answer line ("....[2]").
Each tariff closes one scored unit: its lowest labelled part. A question's stem (the
lines between "1" and "(a)", e.g. a pseudocode listing) and a part's lead-in (between
"(a)" and "(i)") are shared, unscored context for the parts beneath them. A unit's own
crop starts at its own label and keeps its printed lines, tables and diagrams; blank
dotted answer lines are left out, but the tariff line is kept. "(i)" is read as a
sub-part numeral or as part letter i by which sequence it continues.

Reconciliation: the sum of tariffs must equal the cover total (140 A level, 70 AS), with
question numbers consecutive and part letters/numerals in order. Output is a review
candidate; crops are source pixels, never re-typed code.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

VERSION = 'ocr-chem-layout-v1'
ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']
TARIFF = re.compile(r'\[(\d{1,2})\]$')
DOTS = re.compile(r'^[.…\s]{8,}(\[\d{1,2}\])?$')
FURNITURE = re.compile(r'^(Turn over|© OCR \d{4}|© Cambridge OCR|PLEASE DO NOT WRITE|BLANK PAGE|DO NOT WRITE IN THIS|'
                       r'Section [A-D]$|Section [A-D]\b.*answer|Oxford Cambridge and RSA)', re.I)
STOP = re.compile(r'^(END OF QUESTION PAPER|Copyright Information)', re.I)
ADDITIONAL = re.compile(r'^(ADDITIONAL ANSWER SPACE|If you need extra space|Additional answer space)', re.I)
REMOVED = re.compile(r'not reproduced|copyright restrictions|has been removed', re.I)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def lines_of(page):
    words = [w for w in page.extract_words(keep_blank_chars=False) if 58 < w['top'] < page.height - 40 and w.get('upright', True)]
    rows = []
    for w in sorted(words, key=lambda w: (round(w['top']), w['x0'])):
        if rows and abs(rows[-1]['top'] - w['top']) < 3:
            rows[-1]['words'].append(w)
        else:
            rows.append({'top': w['top'], 'words': [w]})
    for r in rows:
        r['words'].sort(key=lambda w: w['x0'])
        r['text'] = ' '.join(w['text'] for w in r['words']).strip()
        r['bottom'] = max(w['bottom'] for w in r['words'])
        r['x0'] = r['words'][0]['x0']
    return rows


def graphics(page):
    out = []
    for o in page.images + page.rects + page.curves + page.lines:
        h, w = o['bottom'] - o['top'], o['x1'] - o['x0']
        if h > 0.8 * page.height or (h < 2 and w < 40):
            continue
        out.append((o['top'], o['bottom']))
    return out


def extract(path):
    import pdfplumber
    exceptions = []
    with pdfplumber.open(path) as pdf:
        cover = ' '.join((pdf.pages[i].extract_text() or '') for i in range(2))
        m = re.search(r'total mark for this paper is (\d+)', cover)
        expected = int(m.group(1)) if m else None
        stream, stopped = [], False
        for pi, page in enumerate(pdf.pages[1:], start=1):
            if stopped:
                break
            for row in lines_of(page):
                if STOP.match(row['text']):
                    stopped = True
                    break
                if ADDITIONAL.match(row['text']):
                    continue   # "Additional answer space if required" printed inside a question page
                if FURNITURE.match(row['text']) or re.fullmatch(r'\d{1,2}', row['text']) and row['top'] < 60:
                    continue
                stream.append((pi, row))
        q = part = sub = None
        node = None   # rows being collected for the current lowest label
        stems, leads, units = {}, {}, []
        for pi, row in stream:
            words = row['words']
            # Peel left-margin labels off the start of the row: "1", "1*", "(a)", "(i)".
            labels, k, starred = [], 0, False
            lq, lp, ls = q, part, sub   # label state as each label on this row is read
            while k < len(words) and words[k]['x0'] < 115:   # label column (indented layouts reach ~96)
                t = words[k]['text']
                nq = str(int(lq) + 1) if lq else '1'
                if not labels and words[k]['x0'] < 76 and re.fullmatch(r'\d{1,2}', t) and t == lq and k + 1 < len(words) \
                        and re.fullmatch(r'\([a-z]{1,4}\)\*?', words[k + 1]['text']):
                    k += 1   # sample papers repeat the question number before each part: "18 (b)"
                    continue
                if not labels and words[k]['x0'] < 76 and re.fullmatch(r'\d{1,2}\*?', t) and t.rstrip('*') == nq \
                        and (words[k]['x0'] < 68
                             or k + 1 < len(words) and re.match(r'^[A-Z(\u2018\u201c]', words[k + 1]['text'])):
                    # A number alone counts only in the true margin; table cells and listings sit further right.   # question text, not a listing, table row or numbered answer line
                    labels.append(('q', t.rstrip('*'), t.endswith('*')))
                    lq, lp, ls = t.rstrip('*'), None, None
                elif re.fullmatch(r'\([a-z]{1,4}\)\*?', t):
                    v = t.rstrip('*')[1:-1]
                    star = t.endswith('*')
                    if v == lp and not labels:   # the current part label repeated on a continuation page
                        k += 1
                        continue
                    next_sub = ROMAN[ROMAN.index(ls) + 1] if ls in ROMAN[:-1] else 'i'
                    next_part = chr(ord(lp) + 1) if lp else 'a'
                    if v == next_sub and lp and v != next_part:
                        labels.append(('s', v, star))
                        ls = v
                    elif v == next_part:
                        labels.append(('p', v, star))
                        lp, ls = v, None
                    elif v == next_sub and lp:
                        labels.append(('s', v, star))
                        ls = v
                    else:
                        break
                else:
                    break
                k += 1
            for lab in labels:
                if node is not None and node.get('open'):
                    # A new label while the previous one has no tariff: it was a stem/lead-in.
                    target = stems if node['level'] == 'q' else leads
                    target[node['key']] = node
                    node['open'] = False
                if lab[0] == 'q':
                    q, part, sub = lab[1], None, None
                    node = {'level': 'q', 'key': q, 'rows': [], 'open': True, 'extended': lab[2]}
                elif lab[0] == 'p':
                    part, sub = lab[1], None
                    node = {'level': 'p', 'key': f'{q}({part})', 'rows': [], 'open': True, 'extended': lab[2]}
                else:
                    sub = lab[1]
                    node = {'level': 's', 'key': f'{q}({part})({sub})', 'rows': [], 'open': True, 'extended': lab[2]}
                # The asterisk belongs only to the label printed with it (OCR "(a)*"), never its siblings.
            if node is None:
                continue
            node['rows'].append((pi, row))
            last = words[-1]
            t = TARIFF.search(last['text']) or TARIFF.search(''.join(w['text'] for w in words[-3:]))   # a split "[ 5 ]"
            if t and last['x1'] > 480:
                label = f'{q}' + (f'({part})' if part else '') + (f'({sub})' if sub else '')
                units.append({'question': q, 'label': label, 'marks': int(t.group(1)), 'rows': node['rows'],
                              'extended_response': bool(node.get('extended')),
                              'tariff': {'page': pi + 1, 'top': row['top']}})
                node['open'] = False
                node = {'level': node['level'], 'key': node['key'] + '+', 'rows': [], 'open': False}
        # Regions: keep printed lines and graphics, drop blank dotted answer lines.
        def regions(rows):
            kept = [(pi, r) for pi, r in rows if not DOTS.match(r['text']) or TARIFF.search(r['text'])]
            blocks = []
            for pi, r in kept:
                if blocks and blocks[-1]['page'] == pi and r['top'] - blocks[-1]['bottom'] < 60:
                    blocks[-1]['bottom'] = max(blocks[-1]['bottom'], r['bottom'])
                else:
                    blocks.append({'page': pi, 'top': r['top'], 'bottom': r['bottom']})
            for b in blocks:
                page = pdf.pages[b['page']]
                for _ in range(2):
                    for gt, gb in graphics(page):
                        if gb > b['top'] - 2 and gt < b['bottom'] + 2:   # overlapping a kept block
                            b['top'], b['bottom'] = min(b['top'], gt), max(b['bottom'], gb)
            merged = []
            for b in blocks:   # blocks that now overlap (a table reaching the tariff line) become one
                if merged and merged[-1]['page'] == b['page'] and b['top'] <= merged[-1]['bottom'] + 8:
                    merged[-1]['bottom'] = max(merged[-1]['bottom'], b['bottom'])
                else:
                    merged.append(dict(b))
            out = []
            for b in merged:
                page = pdf.pages[b['page']]
                out.append({'page': b['page'] + 1, 'bbox': [round(25 / page.width, 6), round(max(55, b['top'] - 5) / page.height, 6),
                                                         round((page.width - 25) / page.width, 6), round(min(page.height - 35, b['bottom'] + 5) / page.height, 6)]})
            return out

        out = []
        for u in units:
            text = '\n'.join(r['text'] for _, r in u['rows'] if not DOTS.match(r['text']))
            entry = {'question': u['question'], 'label': u['label'], 'marks': u['marks'], 'regions': regions(u['rows']),
                     'text': text, 'extended_response': u['extended_response'], 'tariff': u['tariff']}
            q_, *_ = u['label'].split('(')
            ctx = []
            if q_ in stems and stems[q_]['rows']:
                ctx.append(q_)
            pk = u['label'].rsplit('(', 1)[0] if u['label'].count('(') == 2 else None
            if pk and pk in leads and leads[pk]['rows']:
                ctx.append(pk)
            if ctx:
                entry['context'] = ctx
            if REMOVED.search(text):
                entry['copyright_removed_content'] = True
            out.append(entry)
        context = {}
        for key, n in list(stems.items()) + list(leads.items()):
            if n['rows']:
                text = '\n'.join(r['text'] for _, r in n['rows'] if not DOTS.match(r['text']))
                regs = regions(n['rows'])
                height = sum(r['bbox'][3] - r['bbox'][1] for r in regs)
                if len(text.split()) <= 1 and height < 0.035:
                    continue   # only the printed label ("4", "(b)"): nothing a part needs
                context[key] = {'regions': regs, 'text': text, 'copyright_removed_content': bool(REMOVED.search(text))}
        for u in out:   # point units only at the context blocks that were kept
            if 'context' in u:
                u['context'] = [k for k in u['context'] if k in context]
                if not u['context']:
                    del u['context']
        total = sum(u['marks'] for u in out)
        if expected is not None and total != expected:
            exceptions.append({'type': 'paper_marks_mismatch', 'expected': expected, 'actual': total})
        numbers = [int(u['question']) for u in out if u['question']]
        if not numbers:
            numbers = [0]
        if sorted(set(numbers)) != list(range(1, max(numbers) + 1)):
            exceptions.append({'type': 'question_sequence', 'found': sorted(set(numbers))})
        if len({u['label'] for u in out}) != len(out):
            exceptions.append({'type': 'duplicate_label'})
        for u in out:
            if not u['regions']:
                exceptions.append({'type': 'empty_region', 'unit': u['label']})
        return {'extraction_version': VERSION, 'source_sha256': digest(path), 'page_count': len(pdf.pages),
                'expected_total_marks': expected, 'total_marks': total, 'units': out, 'context': context, 'exceptions': exceptions}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('inventory', type=Path)
    ap.add_argument('--sources', type=Path, required=True)
    ap.add_argument('--output', type=Path, required=True)
    ap.add_argument('--only', nargs='*')
    a = ap.parse_args()
    a.output.mkdir(parents=True, exist_ok=True)
    for paper in json.loads(a.inventory.read_text())['papers']:
        if a.only and paper['paper_id'] not in a.only:
            continue
        doc = paper['documents']['question_paper']
        path = a.sources / doc['file_name']
        if digest(path) != doc['sha256']:
            raise SystemExit(f'Checksum mismatch: {path.name}')
        data = extract(path)
        data['paper_id'], data['source_file'] = paper['paper_id'], doc['file_name']
        (a.output / f"{paper['paper_id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
        print(paper['paper_id'], len(data['units']), 'units', data['total_marks'], '/', data['expected_total_marks'],
              len(data['context']), 'context blocks', len(data['exceptions']), 'exceptions',
              [u['label'] for u in data['units'] if u.get('copyright_removed_content')] or '')
        for e in data['exceptions']:
            print('   ', e)


if __name__ == '__main__':
    main()
