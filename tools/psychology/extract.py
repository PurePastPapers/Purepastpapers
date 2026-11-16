#!/usr/bin/env python3
"""Source-coordinate extraction of public AQA Psychology question papers (7182 and 7181).

Adapted from tools/geography/extract.py. AQA prints question labels as boxed digits
("0 1", numbered through the whole paper) and, in some specimen papers, parts ("0 2 . 1").
Tariffs are "[6 marks]". Every labelled question or part is one scored unit. Its crop
runs from its own label to its own tariff; multiple-choice options printed after a
one- or two-mark tariff are kept with it.

Shared items. AQA prints unlabelled items before a run of questions ("Read the item
and then answer Questions 05 to 07.", "Read the examples in Table 1 then answer
Questions 01 and 02."). Such an item is a shared stem, not part of the first
question's crop: it is attached as unscored context to the questions it names, or, for
"the questions that follow", to the following questions of the same section/topic.

Scenario context. Many questions continue a scenario printed inside an earlier
question ("0 6 Suggest an appropriate statistical test to improve this investigation"
continues "0 5 A researcher wanted to test ..."). A unit that refers to such a
scenario ("the study", "the psychologist", a named person, a Table printed earlier)
records the earlier units it needs in `context_units` with the reasons. The lead
review checks every assignment.

Paper 3 options. "Section B ... Choose one topic from Section B." with "Topic: X"
headings. Each topic's questions form one member of that section's choice group, and
the paper maximum counts one topic per section. Output is a review candidate; crops
are source pixels, never re-typed text.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

VERSION = 'aqa-psychology-layout-v1'
TARIFF = re.compile(r'\[(\d{1,2}) marks?\]')
LABEL = re.compile(r'^(\d) (\d)(?:(?: \.)? (\d{1,2}))?(?=\s|$)')
LABEL_10 = re.compile(r'^(\d) (\d) \. (\d) (\d)(?=\s|$)')
LABEL_ONLY = re.compile(r'^\d \d(?:(?: \.)? \d( \d)?)?$')
FIGURE_REF = re.compile(r'\b(Figures?|Tables?)\s+((?:\d{1,2}[a-z]?)(?:(?:,\s*|\s+and\s+|\s*&\s*)\d{1,2}[a-z]?)*)')
RUBRIC = re.compile(r'^(Section [A-D]$|Section [A-D]\b.*|Answer (all|either|one|question|Question)\b.*|Either$|or$|OR$|'
                    r'Choose one topic\b.*|If you (choose|answer)\b.*|Question \d+ continues\b.*|Extra space.*|'
                    r'Do not write.*|outside the.*|box$|Turn over.*|Specimen material.*|Only one answer per question.*|'
                    r'For (the|each) multiple-choice.*|For each answer completely.*|CORRECT METHOD.*|If you want to change.*|'
                    r'If you wish to return.*|select as shown\.?|as shown\.?|End of (Question \d+|Section [A-D])\.?|'
                    r'Shade the circle.*|\.$|_{5,}.*|\.{5,}.*|\(?\d{2}\)?$|\*\d{2}\*$|\* \*$|\*$|'
                    r'(Relationships|Gender|Cognition and development|Schizophrenia|Eating behaviour|Stress|Aggression|'
                    r'Forensic [Pp]sychology|Addiction)( or .*)?$|'
                    r'Social influence$|Memory$|Attachment$|Psychopathology$|Approaches in [Pp]sychology$|Biopsychology$|'
                    r'Research methods$|Issues and debates in [Pp]sychology$|Clinical [Pp]sychology.*$)')
FOOTER = re.compile(r'^(IB/[A-Z]/|G/[A-Z/]*|[A-Z]{1,3}/[A-Za-z]{2,}/|[A-Za-z]{3}\d{2}718\d+|\(?[A-Z]{3}\d{2}718\d+\)?|718[12]/\d$|'
                    r'WMP/|\d{1,2}$)')
STOP = re.compile(r'^(END OF QUESTIONS|There are no questions printed|Copyright information|Additional page|Question number|'
                  r'Additional pages?\b)', re.I)
REMOVED = re.compile(r'not reproduced here|cannot be reproduced|copyright restrictions|has been removed', re.I)
TOPIC = re.compile(r'^Topic:?\s+(.+)$')
SHARED = re.compile(r'^(Read (the|this|these)\b|Use the (item|information)\b|Study (the|Table|Figure)\b)', re.I)
QUESTION_LIST = re.compile(r'answer Questions? ((?:\d{1,2}(?:\.\d)?)(?:(?:,\s*|\s+and\s+|\s+to\s+)\d{1,2}(?:\.\d)?)*)', re.I)
REFERS = re.compile(r'\b(the|this|these|that|their|her|his) (study|studies|psychologists?|researchers?|investigation|experiment|'
                    r'participants|results|item|data|questionnaire|interview|interviews|observation|observers|sample|'
                    r'report|students?|teachers?|scenario|programme|group|groups|patients?|children|therapist|'
                    r'information above|case|psychiatrist|clinic|scores)\b|\binformation above\b|\bthe above\b|'
                    r'\bin the (study|experiment|investigation)\b', re.I)
INTRODUCES = re.compile(r'^(An?|One|Two|Some|Researchers?|Psychologists?|In an?|In one|Read|The following|[A-Z][a-z]+ is|'
                        r'[A-Z][a-z]+ and [A-Z][a-z]+)\b')
ANSWER_REF = re.compile(r'\b(your answers? to|using your answers?|from your answer|use your answer|in your answer to (question )?\d|'
                        r'your (graph|sketch|hypothesis|calculation|table|bar chart|histogram|scattergram|answer above)|'
                        r'you have (identified|named|drawn|sketched|calculated|written|chosen|suggested|given|described|outlined))', re.I)


OVERRIDES_PATH = Path(__file__).resolve().parents[2] / 'data/imports/psychology/tariff-overrides.json'
OVERRIDES = json.loads(OVERRIDES_PATH.read_text())['overrides'] if OVERRIDES_PATH.exists() else {}


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
    def finish(r):
        r['words'].sort(key=lambda w: w['x0'])
        r['text'] = ' '.join(w['text'] for w in r['words']).strip()
        r['top'] = min(w['top'] for w in r['words'])
        r['bottom'] = max(w['bottom'] for w in r['words'])
        r['x0'] = r['words'][0]['x0']
    for r in rows:
        finish(r)
    # Some specimen booklets print a boxed label a few points below (or above) its first
    # text line. A row holding only a label absorbs the text row level with it.
    merged = True
    while merged:
        merged = False
        for r in rows:
            if r['x0'] < 100 and LABEL_ONLY.match(r['text']):
                near = [o for o in rows if o is not r and abs(o['top'] - r['top']) <= 6 and o['x0'] > 100
                        and not (o['x0'] < 100 and LABEL.match(o['text']))]
                if near:
                    o = min(near, key=lambda o: abs(o['top'] - r['top']))
                    r['words'] += o['words']
                    rows.remove(o)
                    finish(r)
                    merged = True
                    break
    rows.sort(key=lambda r: r['top'])
    return rows


def graphics(page):
    """Figures, tables and diagrams: not the page border box, answer lines or MC boxes."""
    out = []
    for obj in page.images + page.rects + page.curves:
        h, w = obj['bottom'] - obj['top'], obj['x1'] - obj['x0']
        if h > 0.7 * page.height or (h < 16 and w < 30) or h < 3:
            continue
        out.append((obj['top'], obj['bottom']))
    return out


def figure_refs(text):
    refs = []
    for kind, body in FIGURE_REF.findall(text):
        for n in re.findall(r'\d{1,2}[a-z]?', body):
            ref = ('Figure ' if kind.startswith('Figure') else 'Table ') + n
            if ref not in refs:
                refs.append(ref)
    return refs


def question_list(text):
    m = QUESTION_LIST.search(text)
    if not m:
        return None
    body, out = m.group(1), []
    for a, b in re.findall(r'(\d{1,2})(?:\.\d)?\s+to\s+(\d{1,2})', body):
        out += [str(n) for n in range(int(a), int(b) + 1)]
    out += [str(int(n)) for n in re.findall(r'(?<!to )\b(\d{1,2})\b(?!\s+to)', body)]
    return sorted(set(out), key=int)


def names_in(text):
    return set(re.findall(r'\b([A-Z][a-z]{2,})\b(?= (?:is|was|has|had|and|wants|believes|says|said|thinks|works|decided|noticed|'
                          r'told|explained|asked|became|often|always|feels|lives|started))', text))


def extract(path):
    import pdfplumber
    exceptions = []
    with pdfplumber.open(path) as pdf:
        cover = ' '.join((pdf.pages[i].extract_text() or '') for i in range(2))
        m = re.search(r'marks available for this paper is (\d+)|maximum mark for this paper is (\d+)', cover)
        expected = int(m.group(1) or m.group(2)) if m else None
        stream, stopped = [], False
        for pi, page in enumerate(pdf.pages[1:], start=1):
            if stopped:
                break
            for row in lines_of(page):
                if STOP.match(row['text']):
                    stopped = 'END OF QUESTIONS' in row['text'].upper()
                    break
                if not FOOTER.match(row['text']):
                    stream.append((pi, row))
        units, current, pending, section, topic, question_no = [], None, [], None, None, None
        stems, shared, optional_sections = {}, [], set()
        i = 0
        while i < len(stream):
            pi, row = stream[i]
            text = row['text']
            sec = re.match(r'^Section ([A-D])\b', text)
            if sec and row['x0'] > 150 and sec.group(1) != section:   # a repeated header does not reset the topic
                section, topic, pending = sec.group(1), None, []
            if re.match(r'^Choose one topic from Section', text):
                optional_sections.add(section)
            tm = TOPIC.match(text)
            if tm and current is None:
                topic, pending = tm.group(1).strip(), []
                i += 1
                continue
            label = LABEL.match(text) if row['x0'] < 100 else None
            if label:
                number = str(int(label.group(1) + label.group(2)))
                part = f"{number}.{label.group(3)}" if label.group(3) else number
                two = LABEL_10.match(text)   # "1 2 . 1 0": part 10 follows part 9
                if two and units and units[-1]['label'] == f"{number}.{int(two.group(3) + two.group(4)) - 1}":
                    part = f"{number}.{int(two.group(3) + two.group(4))}"
                if current is not None and current['label'] == part:
                    current['rows'].append((pi, row))   # the same label printed again (continued page)
                    i += 1
                    continue
                if current is not None and current['label'] == number and part.startswith(number + '.'):
                    stems[number] = current['rows']   # question-level stem: shared unscored context
                    current = None
                elif current is not None:
                    exceptions.append({'type': 'label_before_tariff', 'unit': current['label'], 'next': part})
                if question_no is not None and number != question_no and int(number) != int(question_no) + 1:
                    exceptions.append({'type': 'unexpected_question_number', 'found': number, 'after': question_no})
                question_no = number
                if pending:   # an unlabelled item printed before this question
                    ptext = ' '.join(r['text'] for _, r in pending)
                    if SHARED.match(pending[0][1]['text']) or QUESTION_LIST.search(ptext):
                        shared.append({'rows': pending, 'text': '\n'.join(r['text'] for _, r in pending),
                                       'first': part, 'questions': question_list(ptext), 'section': section, 'topic': topic})
                        pending = []
                current = {'question': number, 'label': part, 'section': section, 'topic': topic,
                           'rows': list(pending) + [(pi, row)]}
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
                # Multiple choice printed after the tariff: rows starting A, B, C, D (E) in order.
                ahead, j = [], i
                while j < len(stream) and stream[j][0] == pi and not (stream[j][1]['x0'] < 100 and LABEL.match(stream[j][1]['text'])) \
                        and not stream[j][1]['text'].startswith('_____') and not TOPIC.match(stream[j][1]['text']):
                    ahead.append(j)
                    j += 1
                marks_at = {}
                for j in ahead:
                    r = stream[j][1]
                    for k, letter in enumerate('ABCDE'):
                        if k not in marks_at and (r['text'].startswith(letter + ' ') or r['text'] == letter) and 75 < r['x0'] < 200 and \
                                (k == 0 or (k - 1) in marks_at):
                            marks_at[k] = j
                if current['marks'] <= 2 and len(marks_at) >= 4:
                    last_j, opt_x = marks_at[max(marks_at)], stream[marks_at[max(marks_at)]][1]['x0']
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
                    current['options'] = len(marks_at)
                units.append(current)
                current = None
                continue
            if current is not None:
                current['rows'].append((pi, row))
            elif not RUBRIC.match(text) and not tm:
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
            for pi in sorted(by_page):
                page = pdf.pages[pi]
                top, bottom = by_page[pi]
                for _ in range(2):   # include graphics centred within this unit's own lines
                    for g_top, g_bottom in graphics(page):
                        if top - 2 <= (g_top + g_bottom) / 2 <= bottom + 2:
                            top, bottom = min(top, g_top), max(bottom, g_bottom)
                out.append({'page': pi + 1, 'bbox': [round(20 / page.width, 6), round(max(36, top - 6) / page.height, 6),
                                                     round((page.width - 20) / page.width, 6), round(min(page.height - 40, bottom + 6) / page.height, 6)]})
            return out

        stem_out = {}
        for number, rows in stems.items():
            text = '\n'.join(r['text'] for _, r in rows)
            stem_out[number] = {'regions': regions(rows), 'text': text, 'figures': figure_refs(text),
                                'copyright_removed_content': bool(REMOVED.search(text))}
        out = []
        for u in units:
            text = '\n'.join(r['text'] for _, r in u['rows'])
            entry = {'question': u['question'], 'label': u['label'], 'marks': u['marks'], 'section': u['section'],
                     'topic': u['topic'], 'regions': regions(u['rows']), 'text': text, 'figures': figure_refs(text),
                     'tariff': u['tariff']}
            if u['question'] in stem_out:
                entry['shared_stem'] = u['question']
            if 'options' in u:
                entry['multiple_choice_options'] = u['options']
            if REMOVED.search(text):
                entry['copyright_removed_content'] = True
            out.append(entry)
        # Shared items: which units they serve.
        items = []
        for k, s in enumerate(shared):
            first = next(n for n, e in enumerate(out) if e['label'] == s['first'] or e['question'] == s['first'])
            if s['questions']:
                serves = [e['label'] for e in out if e['question'] in s['questions']]
                basis = 'named in the item ("answer Questions ...")'
            else:
                serves = []
                for e in out[first:]:
                    if e['section'] != s['section'] or e['topic'] != s['topic'] or \
                            (k + 1 < len(shared) and shared[k + 1]['first'] in (e['label'], e['question'])):
                        break
                    serves.append(e['label'])
                basis = '"the questions that follow": the following questions of the same section/topic'
            item = {'id': f'ITEM{k + 1}', 'regions': regions(s['rows']), 'text': s['text'], 'figures': figure_refs(s['text']),
                    'serves': serves, 'basis': basis, 'copyright_removed_content': bool(REMOVED.search(s['text']))}
            items.append(item)
            for e in out:
                if e['label'] in serves:
                    e.setdefault('items', []).append(item['id'])
        # Scenario context from earlier units of the same section/topic.
        for n, e in enumerate(out):
            own = e['text']
            reasons, needs = [], []
            peers = [p for p in out[:n] if p['section'] == e['section'] and p['topic'] == e['topic']]
            body_lines = own.split('\n')
            first_line = LABEL.sub('', body_lines[0]).strip()
            introduces = bool(INTRODUCES.match(first_line)) and len(body_lines) > 2
            for fig in e['figures']:
                if not re.search(rf'^{fig}\b', own, re.M) and not any(fig in it['figures'] for it in items if it['id'] in e.get('items', [])):
                    src = next((p for p in reversed(peers) if re.search(rf'^\s*{fig}\b', p['text'], re.M)), None)
                    if src:
                        needs.append(src['label'])
                        reasons.append(f'{fig} is printed with {src["label"]}')
            people = {nm for p in peers for nm in names_in(p['text'])}
            for nm in sorted(people):
                if re.search(rf'\b{nm}\b', own) and nm not in names_in(own):
                    src = next(p for p in reversed(peers) if nm in names_in(p['text']))
                    needs.append(src['label'])
                    reasons.append(f'refers to {nm}, introduced in {src["label"]}')
            if REFERS.search(own) and not introduces and not e.get('items') and not needs:
                src = next((p for p in reversed(peers) if INTRODUCES.match(LABEL.sub('', p['text'].split('\n')[0]).strip())
                            and len(p['text'].split('\n')) > 2), None)
                if src:
                    needs.append(src['label'])
                    reasons.append(f'continues the scenario introduced in {src["label"]} ("{REFERS.search(own).group(0)}")')
            if needs:
                e['context_units'] = sorted(set(needs), key=lambda l: [int(x) for x in l.split('.')])
                e['context_reasons'] = reasons
            if ANSWER_REF.search(own):
                e['answer_reference'] = ANSWER_REF.search(own).group(0)
        # Choice groups: one topic per optional section.
        groups, topics_by_section = [], {}
        for e in out:
            if e['section'] in optional_sections:
                topics_by_section.setdefault(e['section'], {}).setdefault(e['topic'], [])
                if e['question'] not in topics_by_section[e['section']][e['topic']]:
                    topics_by_section[e['section']][e['topic']].append(e['question'])
        for sec, tops in topics_by_section.items():
            if None in tops:
                exceptions.append({'type': 'question_without_topic', 'section': sec, 'questions': tops[None]})
            groups.append({'section': sec, 'topics': list(tops), 'members': list(tops.values())})
        fixes = OVERRIDES.get(digest(path), {})
        for e in out:
            if e['label'] in fixes:   # checked misprint: the official scheme's tariff is used
                fix = fixes[e['label']]
                assert e['marks'] == fix['printed'], (e['label'], e['marks'])
                e['printed_marks'], e['marks'], e['tariff_override'] = e['marks'], fix['scheme'], fix['note']
        totals = {}
        for e in out:
            totals[e['question']] = totals.get(e['question'], 0) + e['marks']
        grouped = {q for g in groups for mem in g['members'] for q in mem}
        effective = sum(m for q, m in totals.items() if q not in grouped)
        for g in groups:
            vals = [sum(totals[q] for q in mem) for mem in g['members']]
            if len(set(vals)) != 1:
                exceptions.append({'type': 'unequal_choice_totals', 'section': g['section'], 'totals': vals})
            effective += max(vals)
        if expected is not None and effective != expected:
            exceptions.append({'type': 'paper_marks_mismatch', 'expected': expected, 'actual': effective})
        for q in sorted(totals, key=int):
            labels = [e['label'] for e in out if e['question'] == q]
            parts = [int(l.split('.')[1]) for l in labels if '.' in l]
            if parts and parts != list(range(1, len(parts) + 1)):
                exceptions.append({'type': 'part_sequence', 'question': q, 'labels': labels})
        for e in out:
            if 'multiple_choice_options' in e and e['multiple_choice_options'] not in (4, 5):
                exceptions.append({'type': 'incomplete_options', 'unit': e['label'], 'found': e['multiple_choice_options']})
            if len(re.sub(r'\s', '', e['text'])) < 25:
                exceptions.append({'type': 'near_empty_unit', 'unit': e['label']})
        return {'extraction_version': VERSION, 'source_sha256': digest(path), 'page_count': len(pdf.pages),
                'expected_total_marks': expected, 'total_marks': effective, 'printed_tariff_sum': sum(totals.values()),
                'question_totals': totals, 'choice_groups': groups, 'stems': stem_out, 'items': items,
                'units': out, 'exceptions': exceptions}


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
              'groups', [(g['section'], g['topics']) for g in data['choice_groups']], 'items', len(data['items']),
              'ctx', sum(1 for u in data['units'] if u.get('context_units')), len(data['exceptions']), 'exceptions',
              [e['label'] for e in data['units'] if e.get('copyright_removed_content')] or '')
        for e in data['exceptions']:
            print('   ', e)


if __name__ == '__main__':
    main()
