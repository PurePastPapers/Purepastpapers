#!/usr/bin/env python3
"""Source-coordinate extraction of public AQA GCSE Geography 8035 question papers.

AQA prints part labels as boxed digits ("0 1 . 2") and tariffs as "[6 marks]". Each
labelled part is one independently answerable scored unit. Its region runs from the
first printed line after the previous tariff (section rubric, topic headings, answer
lines and "Extra space" skipped) to its own tariff, so a part keeps the figure
introduction ("Figure 2 shows ...") and any inline figure printed above it. AS
multiple-choice options are printed after the "[1 mark]" tariff and are kept with
their part.

Choice groups come from the cover instructions ("Answer either Question 2 or
Question 3 or Question 4"). Reconciliation: the cover maximum must equal the
compulsory tariffs plus, for each choice group, one option's total (every option in a
group must carry the same total). Figures named in a part ("Figure 1a and Figure 1b
are in the insert") are recorded for the build, which attaches the insert figure or
excludes the part if AQA removed that figure. Output is a review candidate; crops are
source pixels, never re-typed text.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

VERSION = 'aqa-gcsegeog-layout-v1'
TARIFF = re.compile(r'\[(\d{1,2}) marks?\]')
LABEL = re.compile(r'^(\d) (\d)(?:(?: \.)? (\d))?(?: (\d))?(?=\s|$)')   # GCSE: "0 1 1", "0 1 1 0" (part 10); the 4th digit is read only when it continues the sequence
LABEL2 = re.compile(r'^(\d) (\d) \. (1\d)(?=\s|$)(?:(Z)Z)?')   # specimen Paper 2 prints part 10 as "0 2 . 10" (group 4 never matches)
SPAG = re.compile(r'^\[\+\s*(\d)\s*SPaG marks?\]$', re.I)
OPTION = re.compile(r'^[A-D]\s+\S')
FIGURE_REF = re.compile(r'\b(Figures?|Tables?)\s+((?:\d{1,2}[a-z]?)(?:(?:,\s*|\s+and\s+|\s*&\s*)\d{1,2}[a-z]?)*)')
RUBRIC = re.compile(r'^(Section [A-D]$|Section [A-D]\b.*|Answer (all|either|one|question|Question)\b.*|Either$|or$|OR$|'
                    r'If you (choose|answer)\b.*|Question \d+ continues\b.*|Question \d+\s+[A-Z].*|Extra space.*|'
                    r'Do not write.*|outside the.*|box$|Turn over.*|Specimen material.*|Only one answer per question.*|'
                    r'For the multiple-choice.*|CORRECT METHOD.*|If you want to change.*|If you wish to return.*|'
                    r'select as shown\.?|End of (Question \d+|Section [A-D])\.?|Shade the circle.*|\.$|optional question you have.*|_{5,}.*|\.{5,}.*|\(?\d{2}\)?$|\* \*$|\*$)')
FOOTER = re.compile(r'^(IB/[A-Z]/|G/[A-Z/]*|[A-Z]{1,3}/[A-Za-z]{2,}/|[a-z]{3}\d{2}7\d{4,}|\(?[A-Z]{3}\d{2}703\d+\)?|703[67]/\d$)')
STOP = re.compile(r'^(END OF QUESTIONS|There are no questions printed|Copyright information|Additional page|Question number|'
                  r'Additional pages?\b)', re.I)
REMOVED = re.compile(r'not reproduced here|cannot be reproduced|copyright restrictions|has been removed', re.I)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def lines_of(page):
    words = [w for w in page.extract_words(keep_blank_chars=False, use_text_flow=False)
             if 20 < w['x0'] < 536 and 40 < w['top'] < page.height - 45]
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
    """Figures, tables and diagrams: not the page border box, answer lines or MC circles."""
    out = []
    for obj in page.images + page.rects + page.curves:
        h, w = obj['bottom'] - obj['top'], obj['x1'] - obj['x0']
        if h > 0.7 * page.height or (h < 16 and w < 30) or h < 3:
            continue
        out.append((obj['top'], obj['bottom']))
    return out


def gcse_choice_rules(cover_text):
    """GCSE covers: Answer two questions in Section C, or Answer Question 3 and one other question in Section C."""
    rules = []
    for m in re.finditer(r'Answer (two|one|2|1) questions? in Section ([A-D])', cover_text):
        rules.append({'section': 'Section ' + m.group(2), 'choose': 2 if m.group(1) in ('two', '2') else 1, 'compulsory': []})
    for m in re.finditer(r'Answer Question (\d+) and (?:any )?one other question in Section ([A-D])', cover_text):
        rules.append({'section': 'Section ' + m.group(2), 'choose': 1, 'compulsory': [m.group(1)]})
    return rules


def choice_groups(cover_text):
    groups = []
    for m in re.finditer(r'(?:Answer|and) (?:either )?((?:Question \d+(?:,| or)?\s*)+)', cover_text):
        nums = re.findall(r'Question (\d+)', m.group(1))
        if len(nums) > 1 and nums not in groups:
            groups.append(nums)
    return groups


def figure_refs(text):
    refs = []
    for kind, body in FIGURE_REF.findall(text):
        for n in re.findall(r'\d{1,2}[a-z]?', body):
            ref = ('Figure ' if kind.startswith('Figure') else 'Table ') + n
            if ref not in refs:
                refs.append(ref)
    return refs


HEADING = re.compile(r'^(Figure|Table)s? (\d{1,2}[a-z]?)(?:\s|$|\s*[-\u2013:])')
VERB = re.compile(r'\b(shows?|is|are|represents?|gives|contains|provides|was|were)\b')


def figure_bands(page, rows):
    """Inline figures/tables: band from a short heading row through its box or graphics."""
    bands = []
    objs = [o for o in page.images + page.rects + page.curves
            if 3 < o['bottom'] - o['top'] < 0.7 * page.height]
    for r in rows:
        m = HEADING.match(r['text'])
        if not m or len(r['text'].split()) > 14 or VERB.search(r['text']):
            continue
        side_by_side = re.fullmatch(r'((Figure|Table) \d{1,2}[a-z]?\s*){2,}', r['text'])
        names = re.findall(r'(?:Figure|Table) \d{1,2}[a-z]?', r['text']) if side_by_side else [f'{m.group(1)} {m.group(2)}']
        boxes = [o for o in objs if o['top'] <= r['top'] + 2 and o['bottom'] >= r['bottom'] + 20
                 and o['x1'] - o['x0'] > 150 and o['bottom'] - o['top'] > 40]
        if boxes:   # the smallest frame enclosing the heading
            box = min(boxes, key=lambda o: (o['bottom'] - o['top']) * (o['x1'] - o['x0']))
            top, bottom = box['top'], box['bottom']
        else:
            top = bottom = r['bottom']
            changed = True
            while changed:
                changed = False
                for o in objs:
                    if bottom - 2 <= o['top'] <= bottom + 40 and o['bottom'] > bottom:
                        bottom, changed = o['bottom'], True
            top = r['top']
        for name in names:   # side-by-side figures share one band
            bands.append({'name': name, 'top': min(top, r['top']), 'bottom': max(bottom, r['bottom']),
                          'graphic': bottom > r['bottom'] + 10})
    return bands


def extract(path):
    import pdfplumber
    exceptions = []
    with pdfplumber.open(path) as pdf:
        cover = ' '.join((pdf.pages[i].extract_text() or '') for i in range(2))
        m = re.search(r'marks available for this paper is (\d+)|maximum mark for this paper is (\d+)', cover)
        expected = int(m.group(1) or m.group(2)) if m else None
        groups = choice_groups(cover)
        rules = gcse_choice_rules(cover)
        uses_insert = bool(re.search(r'in the insert|colour insert', ' '.join((p.extract_text() or '') for p in pdf.pages)))
        stream, stopped, inline = [], False, {}
        for pi, page in enumerate(pdf.pages[1:], start=1):
            if stopped:
                break
            rows = []
            for row in lines_of(page):
                if STOP.match(row['text']):
                    stopped = 'END OF QUESTIONS' in row['text'].upper()
                    break
                if not FOOTER.match(row['text']):
                    rows.append(row)
            if any(re.match(r'Time allowed', r['text']) for r in rows):
                for r in rows:
                    r['cover'] = True
            bands = figure_bands(page, rows)
            for k, b in enumerate(bands):
                if not b['graphic']:
                    # A chart drawn as vector lines has no image or box: run the band to the next figure heading, the next
                    # part label or the page foot, so a part that cites the figure later gets the whole chart (not its title).
                    stops = [x['top'] - 4 for x in bands if x['top'] > b['top'] + 4]
                    stops += [r['top'] - 2 for r in rows if r['x0'] < 75 and LABEL.match(r['text']) and r['top'] > b['top'] + 2]
                    b['bottom'] = max(b['bottom'], min(stops + [page.height - 45]))
            for b in bands:   # a figure never extends over the next part's label
                labels = [r['top'] for r in rows if r['x0'] < 75 and LABEL.match(r['text']) and r['top'] > b['top'] + 2]
                if labels and min(labels) < b['bottom']:
                    b['bottom'] = min(labels) - 2
            for b in bands:
                fig = inline.setdefault(b['name'], {'regions': [], 'removed': False})
                fig['regions'].append({'page': pi + 1, 'bbox': [round(20 / page.width, 6), round(max(36, b['top'] - 6) / page.height, 6),
                                                               round((page.width - 20) / page.width, 6), round(min(page.height - 40, b['bottom'] + 6) / page.height, 6)]})
            for row in rows:
                structural = (row['x0'] < 75 and LABEL.match(row['text'])) or (TARIFF.search(row['text']) and row['words'][-1]['x0'] > 380)
                owner = None if structural else next((b['name'] for b in bands if b['top'] - 1 <= row['top'] and row['bottom'] <= b['bottom'] + 1), None)
                row['figure'] = owner
                stream.append((pi, row))
        for name, fig in inline.items():
            text = ' '.join(r['text'] for pi, r in stream if r.get('figure') == name)
            fig['removed'] = bool(REMOVED.search(text))
        units, current, pending, section, question_no = [], None, [], None, None
        last_q, last_part, last_label = None, 0, None
        stems = {}
        i = 0

        def prune(rows):
            """Drop figure rows the unit does not cite: they belong to an earlier part."""
            own = ' '.join(r['text'] for _, r in rows if not r.get('figure'))
            cited = set(figure_refs(own))
            return [(p, r) for p, r in rows if not r.get('figure') or r['figure'] in cited]

        while i < len(stream):
            pi, row = stream[i]
            text = row['text']
            if re.match(r'^Section [A-D]\b', text):
                section = text[:9]
            sp = SPAG.match(text)
            if sp:   # "[+ 3 SPaG marks]" follows the tariff of the part it belongs to: its marks join that unit
                if units and units[-1]['label'] == last_label:
                    units[-1]['marks'] += int(sp.group(1))
                    units[-1]['spag_marks'] = int(sp.group(1))
                    units[-1]['rows'].append((pi, row))
                i += 1
                continue
            label = (LABEL2.match(text) or LABEL.match(text)) if row['x0'] < 75 else None
            if label:
                number = str(int(label.group(1) + label.group(2)))
                digit = label.group(3)
                if digit and label.group(4) is not None and number == last_q and int(digit + label.group(4)) == last_part + 1:
                    digit = digit + label.group(4)   # "0 1 1 0": part 10 (a lone trailing digit is otherwise question text)
                part = f"{number}.{digit}" if digit else number
                if digit:
                    last_q, last_part = number, int(digit)
                if current is not None and current['label'] == part:
                    current['rows'].append((pi, row))   # the same label printed again (continued page)
                    i += 1
                    continue
                if current is not None and current['label'] == number and part.startswith(number + '.'):
                    stems[number] = prune(current['rows'])   # question-level stem: shared unscored context
                    pending, current = [], None
                elif current is not None:
                    exceptions.append({'type': 'label_before_tariff', 'unit': current['label'], 'next': part})
                if question_no is not None and number != question_no and int(number) != int(question_no) + 1:
                    exceptions.append({'type': 'unexpected_question_number', 'found': number, 'after': question_no})
                question_no = number
                # The cover (the page with "Time allowed") is never part of a question. Paper 3 prints question 1 at the foot
                # of the cover: keep only its lead-in lines there; drop cover rows that reached the first label of a later page.
                pending = [(p, r) for p, r in pending if not r.get('cover') or (p == pi and (r.get('figure') or row['top'] - r['top'] < 90))]
                current = {'question': number, 'label': part, 'section': section, 'rows': list(pending) + [(pi, row)]}
                pending = []
                i += 1
                t = TARIFF.search(text)
                if not (t and row['words'][-1]['x0'] > 380):
                    continue
            else:
                t = TARIFF.search(text) if row['words'][-1]['x0'] > 380 else None
            if t and current is not None:
                if not label:
                    current['rows'].append((pi, row))
                    i += 1
                current['marks'] = int(t.group(1))
                current['tariff'] = {'page': pi + 1, 'top': row['top'], 'bottom': row['bottom']}
                # AS multiple choice: options A-D follow the "[1 mark]" tariff on the same page.
                # Look ahead first: it is multiple choice only if rows starting A, B, C and D
                # (at option indentation) follow before the next label or answer lines.
                ahead, j = [], i
                while j < len(stream) and stream[j][0] == pi and not (stream[j][1]['x0'] < 75 and LABEL.match(stream[j][1]['text'])) \
                        and not stream[j][1]['text'].startswith('_____'):
                    ahead.append(j)
                    j += 1
                marks_at = {}
                for j in ahead:
                    r = stream[j][1]
                    for k, letter in enumerate('ABCD'):
                        if k not in marks_at and (r['text'].startswith(letter + ' ') or r['text'] == letter) and 95 < r['x0'] < 160 and \
                                (k == 0 or (k - 1) in marks_at):
                            marks_at[k] = j
                if current['marks'] == 1 and len(marks_at) == 4:
                    last_j, opt_x = marks_at[3], stream[marks_at[3]][1]['x0']
                    for j in ahead[ahead.index(last_j) + 1:]:
                        r = stream[j][1]
                        if r['x0'] > opt_x + 10 and r['top'] - stream[last_j][1]['bottom'] < 16:
                            last_j = j
                        else:
                            break
                    for j in range(i, last_j + 1):
                        if not RUBRIC.match(stream[j][1]['text']):
                            current['rows'].append(stream[j])
                    i = last_j + 1
                    current['options'] = 4
                current['rows'] = prune(current['rows'])
                units.append(current)
                last_label = current['label']
                current = None
                continue
            if t and current is None and units and pending and units[-1]['label'] == last_label:
                # A follow-on question printed under the same label with its own tariff (after a multiple-choice part; or an Or alternative) (2025 Paper 2, 0 4 . 3:
                # a multiple-choice part, then "What percentage ... [1 mark]"): one unit, the marks add.
                u = units[-1]
                alternative = bool(re.match(r'^(Or\b|Either\b)', ' '.join(r['text'] for _, r in pending)))
                if u.get('options') or alternative:
                    u['rows'] = prune(u['rows'] + pending + [(pi, row)])
                    if alternative:
                        # "Either (hot deserts) ... [9 marks] / Or (cold environments) ... [9 marks]": answer one, so the marks do not add
                        u['alternative_tariffs'] = u.get('alternative_tariffs', 0) + 1
                    else:
                        u['marks'] += int(t.group(1))
                        u['tariff'] = {'page': pi + 1, 'top': row['top'], 'bottom': row['bottom']}
                        u['followup_tariffs'] = u.get('followup_tariffs', 0) + 1
                    pending = []
                    i += 1
                    continue
            if current is not None:
                current['rows'].append((pi, row))
            elif row.get('figure') or (not RUBRIC.match(text) and (
                    not re.fullmatch(r'[A-Z][a-z]+( [a-z]+)*( and [a-z]+)*( [a-z]+)*', text) or len(text.split()) > 6)):
                pending.append((pi, row))
            i += 1
        if current is not None:
            exceptions.append({'type': 'no_tariff', 'unit': current['label']})

        def regions(rows):
            by_page = {}
            for pi, row in rows:
                box = by_page.setdefault(pi, [row['top'], row['bottom']])
                box[0], box[1] = min(box[0], row['top']), max(box[1], row['bottom'])
            out = []
            last_page = max(by_page)
            for pi in sorted(by_page):
                page = pdf.pages[pi]
                top, bottom = by_page[pi]
                for _ in range(2):   # include graphics centred within this unit's own lines
                    for g_top, g_bottom in graphics(page):
                        if top - 2 <= (g_top + g_bottom) / 2 <= bottom + 2:
                            top, bottom = min(top, g_top), max(bottom, g_bottom)
                if pi != last_page:
                    # The unit goes on to the next page, so photographs printed under its last text row (a caption
                    # such as "Figure 12 - hot desert" sits above its picture) still belong to it: 2024 Paper 1 Q2.9.
                    for _ in range(3):
                        for g_top, g_bottom in graphics(page):
                            if bottom - 2 <= g_top <= bottom + 40 and g_bottom > bottom and g_bottom < page.height - 40:
                                bottom = g_bottom
                out.append({'page': pi + 1, 'bbox': [round(20 / page.width, 6), round(max(36, top - 6) / page.height, 6),
                                                     round((page.width - 20) / page.width, 6), round(min(page.height - 40, bottom + 6) / page.height, 6)]})
            return out

        stem_out = {}
        for number, rows in stems.items():
            text = '\n'.join(r['text'] for _, r in rows)
            stem_out[number] = {'regions': regions(rows), 'text': text, 'figures': figure_refs(text),
                                'figures_printed': sorted({r['figure'] for _, r in rows if r.get('figure')}),
                                'copyright_removed_content': bool(REMOVED.search(text))}
        out = []
        for u in units:
            text = '\n'.join(r['text'] for _, r in u['rows'])
            entry = {'question': u['question'], 'label': u['label'], 'marks': u['marks'], 'section': u['section'],
                     'regions': regions(u['rows']), 'text': text, 'figures': figure_refs(text),
                     'figures_printed': sorted({r['figure'] for _, r in u['rows'] if r.get('figure')}),
                     'tariff': u['tariff']}
            if u.get('spag_marks'):
                entry['spag_marks'] = u['spag_marks']
            if u.get('followup_tariffs'):
                entry['followup_tariffs'] = u['followup_tariffs']
            if u.get('alternative_tariffs'):
                entry['alternative_tariffs'] = u['alternative_tariffs']
            if u['question'] in stem_out:
                entry['shared_stem'] = u['question']
            if 'options' in u:
                entry['multiple_choice_options'] = u['options']
            if REMOVED.search(text):
                entry['copyright_removed_content'] = True
            out.append(entry)
        totals = {}
        for e in out:
            totals[e['question']] = totals.get(e['question'], 0) + e['marks']
        choose = [1] * len(groups)
        sections_of = {}
        for e in out:
            sections_of.setdefault(e['question'], e['section'])
        for rule in rules:   # GCSE: the optional questions are those of the named section, minus any named compulsory one
            members = [n for n in sorted(totals, key=int) if sections_of.get(n) == rule['section'] and n not in rule['compulsory']]
            if len(members) > 1 and members not in groups:
                groups.append(members)
                choose.append(rule['choose'])
        grouped = {n for g in groups for n in g}
        effective = sum(m for n, m in totals.items() if n not in grouped)
        for g, k in zip(groups, choose):
            vals = {totals.get(n) for n in g}
            if None in vals or len(vals) != 1:
                exceptions.append({'type': 'unequal_or_missing_choice_totals', 'group': g, 'totals': [totals.get(n) for n in g]})
            effective += k * max(v for v in vals if v is not None) if vals - {None} else 0
        if expected is not None and effective != expected:
            exceptions.append({'type': 'paper_marks_mismatch', 'expected': expected, 'actual': effective})
        for n in sorted(totals, key=int):
            labels = [e['label'] for e in out if e['question'] == n]
            parts = [int(l.split('.')[1]) for l in labels if '.' in l]
            if parts and parts != list(range(1, len(parts) + 1)):
                exceptions.append({'type': 'part_sequence', 'question': n, 'labels': labels})
        for e in out:
            if 'multiple_choice_options' in e and e['multiple_choice_options'] != 4:
                exceptions.append({'type': 'incomplete_options', 'unit': e['label'], 'found': e['multiple_choice_options']})
        return {'extraction_version': VERSION, 'source_sha256': digest(path), 'page_count': len(pdf.pages),
                'expected_total_marks': expected, 'total_marks': effective, 'printed_tariff_sum': sum(totals.values()),
                'question_totals': totals, 'choice_groups': groups, 'choice_choose': choose, 'uses_insert': uses_insert, 'stems': stem_out,
                'inline_figures': inline, 'units': out, 'exceptions': exceptions}


def prev_floor(unit, pi):
    return 40


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
        path = args.sources / doc['file_name']
        if digest(path) != doc['sha256']:
            raise SystemExit(f'Checksum mismatch: {path.name}')
        data = extract(path)
        data['paper_id'] = paper['paper_id']
        data['source_file'] = doc['file_name']
        (args.output / f"{paper['paper_id']}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
        print(paper['paper_id'], len(data['units']), 'units', data['total_marks'], '/', data['expected_total_marks'],
              'groups', data['choice_groups'], len(data['exceptions']), 'exceptions',
              [e['label'] for e in data['units'] if e.get('copyright_removed_content')] or '')
        for e in data['exceptions']:
            print('   ', e)


if __name__ == '__main__':
    main()
