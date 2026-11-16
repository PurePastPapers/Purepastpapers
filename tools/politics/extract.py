#!/usr/bin/env python3
"""Source-coordinate extraction of public AQA A-level Politics (7152) question papers.

AQA prints question numbers as two boxed digits ("0 1"), tariffs as "[9 marks]", and
optional questions as "Either 0 5 ... or 0 6 ..." within a section. Each question is
one assessable unit. Its region runs from the first printed line after the previous
question's tariff (skipping section headings and Either/or rubric) to its own tariff,
so a Section B question keeps the extracts printed above it.

Reconciliation: the paper maximum (77) must equal the compulsory tariffs plus one
tariff per choice group. Copyright-removed extracts ("not reproduced here") are
flagged on the question so the build can exclude it rather than publish an
incomplete question. Output is a review candidate, never question text for display:
crops are source pixels.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

VERSION = 'aqa-7152-layout-v1'
TARIFF = re.compile(r'\[(\d{1,2}) marks?\]')
RUBRIC = re.compile(r'^(Section [A-D]\b|Answer (all|questions?|either|one|the question)|Either$|or$|In your answer you should draw on|from across the whole range|study in Politics\.?$)', re.I)
FOOTER = re.compile(r'^(IB/[A-Z]/|Turn over|_{10,}|END OF QUESTIONS|\d{1,2}$|\*\s*\*$|[0-9a-z]*7152/\d$)')
REMOVED = re.compile(r'not reproduced here|copyright restrictions|has been removed', re.I)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def lines_of(page):
    words = [w for w in page.extract_words(keep_blank_chars=False, use_text_flow=False)
             if 20 < w['x0'] < page.width - 20 and 25 < w['top'] < page.height - 25]
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


def extract(path, fallback_maximum=None):
    import pdfplumber
    exceptions = []
    with pdfplumber.open(path) as pdf:
        cover = pdf.pages[0].extract_text() or ''
        maximum = re.search(r'maximum mark for this paper is (\d+)', cover)
        expected = int(maximum.group(1)) if maximum else fallback_maximum
        pages = []
        for pi, page in enumerate(pdf.pages[1:], start=1):
            rows = lines_of(page)
            text = ' '.join(r['text'] for r in rows)
            cut = next((i for i, r in enumerate(rows) if r['text'].startswith('Copyright information')
                        or r['text'].startswith('END OF QUESTIONS') or r['text'].startswith('There are no questions printed')), None)
            if cut is not None:
                rows = rows[:cut]
            rows = [r for r in rows if not FOOTER.match(r['text'])]
            pages.append({'index': pi, 'page': page, 'rows': rows, 'blank': 'BLANK PAGE' in text.upper() and len(rows) < 3})
        # Walk every printed line in reading order.
        stream = [(p['index'], r) for p in pages if not p['blank'] for r in p['rows']]
        questions, current, pending, section, group, groups = [], None, [], None, None, []
        for pi, row in stream:
            m = re.match(r'^(\d) (\d)\b', row['text'])
            single = re.match(r'^\*?(\d{1,2}) \S', row['text'])   # specimen papers print "1", not "0 1"
            if m and row['x0'] < 80 or (single and row['x0'] < 70 and int(single.group(1)) == len(questions) + 1):
                number = int(m.group(1) + m.group(2)) if m else int(single.group(1))
                if number != len(questions) + 1:
                    exceptions.append({'type': 'unexpected_question_number', 'found': number, 'expected': len(questions) + 1})
                start = pending[0] if pending else (pi, row)
                current = {'number': str(number), 'section': section, 'start': start, 'rows': list(pending) + [(pi, row)],
                           'tariff': None}
                pending = []
                if group is not None:
                    group.append(current['number'])
                questions.append(current)
                continue
            if row['text'].startswith('Section '):
                section = row['text']
                group = None
            if re.match(r'^Either$', row['text'].strip(), re.I) or \
                    re.match(r'^Answer (either|one question|the question set on one)', row['text'].strip(), re.I):
                if group is None or group:
                    group = []
                    groups.append(group)
            t = TARIFF.search(row['text'])
            if t and current is not None and current['tariff'] is None and row['x0'] > 300:
                current['tariff'] = {'marks': int(t.group(1)), 'page': pi + 1, 'top': row['top'], 'bottom': row['bottom']}
                current['rows'].append((pi, row))
                current = None
                continue
            if current is not None:
                current['rows'].append((pi, row))
            elif not RUBRIC.match(row['text'].strip()):
                pending.append((pi, row))
        out = []
        for q in questions:
            if not q['tariff']:
                exceptions.append({'type': 'no_tariff', 'question': q['number']})
                continue
            regions, by_page = [], {}
            for pi, row in q['rows']:
                box = by_page.setdefault(pi, [row['top'], row['bottom']])
                box[0], box[1] = min(box[0], row['top']), max(box[1], row['bottom'])
            for pi in sorted(by_page):
                page = pdf.pages[pi]
                top, bottom = by_page[pi]
                # Keep figures or tables printed between the text lines on this page.
                for obj in page.images + page.rects + page.curves:
                    if top - 2 <= obj['top'] and obj['bottom'] <= bottom + 2 and obj['bottom'] - obj['top'] > 20:
                        bottom = max(bottom, obj['bottom'])
                regions.append({'page': pi + 1, 'bbox': [round(20 / page.width, 6), round(max(25, top - 6) / page.height, 6),
                                                         round((page.width - 20) / page.width, 6), round(min(page.height - 25, bottom + 6) / page.height, 6)]})
            text = '\n'.join(r['text'] for _, r in q['rows'])
            entry = {'number': q['number'], 'marks': q['tariff']['marks'], 'section': q['section'], 'regions': regions,
                     'text': text, 'parts': [{'part_label': '', **q['tariff']}]}
            if REMOVED.search(text):
                entry['copyright_removed_content'] = True
            out.append(entry)
        choice = [g for g in groups if len(g) > 1]
        in_choice = {n for g in choice for n in g}
        by_number = {q['number']: q for q in out}
        effective = sum(q['marks'] for q in out if q['number'] not in in_choice) + \
            sum(max(by_number[n]['marks'] for n in g) for g in choice)
        for g in choice:
            if len({by_number[n]['marks'] for n in g}) != 1:
                exceptions.append({'type': 'unequal_choice_tariffs', 'group': g})
        if expected is not None and effective != expected:
            exceptions.append({'type': 'paper_marks_mismatch', 'expected': expected, 'actual': effective})
        return {'extraction_version': VERSION, 'source_sha256': digest(path), 'source_file': str(path),
                'page_count': len(pdf.pages), 'expected_total_marks': expected, 'total_marks': effective,
                'printed_tariff_sum': sum(q['marks'] for q in out), 'choice_groups': choice,
                'questions': out, 'exceptions': exceptions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for paper in json.loads(args.inventory.read_text())['papers']:
        doc = paper['documents']['question_paper']
        path = args.sources / doc['file_name']
        if digest(path) != doc['sha256']:
            raise SystemExit(f'Checksum mismatch: {path.name}')
        data = extract(path, paper['max_marks'])
        data['paper_id'] = paper['paper_id']
        data['source_file'] = doc['file_name']
        (args.output / f"{paper['paper_id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
        print(paper['paper_id'], len(data['questions']), 'questions', data['total_marks'], '/', data['expected_total_marks'],
              'choice', data['choice_groups'], len(data['exceptions']), 'exceptions',
              [q['number'] for q in data['questions'] if q.get('copyright_removed_content')] or '')


if __name__ == '__main__':
    main()
