#!/usr/bin/env python3
"""Extract candidate rubric rows from OCR's ruled mark scheme grids."""
from collections import OrderedDict
import re


def region(page, p, xy):
    x0, y0, x1, y1 = xy
    return [page, x0 / p.rect.width, y0 / p.rect.height, x1 / p.rect.width, y1 / p.rect.height]


def append_region(regions, clip):
    # PyMuPDF may split one continuous printed row into a stack of adjacent
    # text-height cells. Coalesce them into one bbox on the source page.
    if regions and regions[-1][0] == clip[0]:
        prior = regions[-1]
        if abs(prior[1] - clip[1]) < 0.002 and abs(prior[3] - clip[3]) < 0.002 and clip[2] <= prior[4] + 0.003:
            prior[2] = min(prior[2], clip[2])
            prior[4] = max(prior[4], clip[4])
            return
    regions.append(clip)


def parse(doc, bounds):
    items = OrderedDict()
    previous = None
    number = None
    letter = ''
    pending_rubric_regions = []
    pending_rubric_text = []
    matrix_active = False
    for page_number in range(bounds[0] - 1, bounds[1]):
        page = doc[page_number]
        for table in page.find_tables().tables:
            values = table.extract()
            if not values or not values[0]:
                continue
            first = (values[0][0] or '').strip()
            if first == 'Question' and {'Answer', 'Marks', 'Guidance'} <= set(values[0]):
                matrix_active = False
                # OCR has both 6-column tables (Question split over three
                # columns) and the older 5-column format (one subpart column).
                answer_i = values[0].index('Answer')
                marks_i = values[0].index('Marks')
                guidance_i = values[0].index('Guidance')
                qcols = answer_i
                for row, data in zip(table.rows[1:], values[1:]):
                    if len(data) != len(values[0]) or not row.cells[answer_i]:
                        continue
                    qcells = [(cell or '').strip() for cell in data[:qcols]]
                    n = qcells[0] if qcells else ''
                    part = qcells[1] if len(qcells) > 1 else ''
                    if n and re.fullmatch(r'\([a-z]\*?\)', n, re.I):
                        part, n = n, ''
                    roman = qcells[2] if len(qcells) > 2 else ''
                    answer = (data[answer_i] or '').strip()
                    marks = (data[marks_i] or '').strip()
                    guidance = (data[guidance_i] or '').strip()
                    if not (n or part or roman or answer or guidance or marks):
                        continue
                    a0, a1 = row.cells[answer_i][1::2]
                    clip = region(page_number, page, (table.bbox[0], a0, table.bbox[2], a1))
                    if not (n or part or roman):
                        if previous:
                            append_region(previous['regions'], clip)
                            if previous.get('text') is not None:
                                continuation = '\n'.join(v for v in (answer, guidance) if v)
                                if continuation:
                                    previous['text'] += '\n' + continuation
                        continue
                    if n:
                        if not re.fullmatch(r'\d{1,2}\*?', n):
                            raise ValueError(f'Unexpected OCR question number on PDF page {page_number + 1}: {qcells}')
                        number = n.rstrip('*')
                        letter = ''
                    if part.strip('()*'):
                        letter = f'({part.strip("()*")})'
                    part_roman = [v for v in re.findall(r'\(?\s*(i{1,3}|iv|v)\s*\)?', roman, re.I)]
                    if not part_roman:
                        part_roman = ['']
                    mark_values = [v.strip() for v in marks.splitlines() if v.strip()]
                    # One historic grid combines (i)/(ii) in a single cell and
                    # prints one tariff on each corresponding line.
                    if len(part_roman) > 1 and len(mark_values) == len(part_roman):
                        split_rows = list(zip(part_roman, mark_values))
                    else:
                        split_rows = [(part_roman[0], mark_values[0] if mark_values else marks)]
                    part_clips = [[clip] for _ in split_rows]
                    if len(split_rows) == 2 and 'Musculo-skeletal system' in answer:
                        # The answer cell contains the (i) cardiovascular and
                        # (ii) musculoskeletal schemes sequentially; crop the
                        # two sections separately at their printed heading.
                        heading = page.search_for('Musculo-skeletal system')
                        if not heading:
                            raise ValueError(f'Could not locate part boundary for {number}{letter} on page {page_number + 1}')
                        split_y = heading[0].y0
                        guidance_cell = row.cells[guidance_i]
                        submax = page.search_for('Submax 3 marks for each area')
                        if not guidance_cell or not submax:
                            raise ValueError('Missing the shared three-mark cap in the split rubric')
                        part_clips = [
                            [region(page_number, page, (table.bbox[0], a0, table.bbox[2], split_y))],
                            [
                                region(page_number, page, (table.bbox[0], split_y, table.bbox[2], a1)),
                                region(page_number, page, (guidance_cell[0], a0, guidance_cell[2], submax[0].y1 + 2)),
                            ],
                        ]
                    split_texts = [answer] * len(split_rows)
                    if len(split_rows) == 2 and 'Musculo-skeletal system' in answer:
                        first_section, second_section = answer.split('Musculo-skeletal system', 1)
                        split_texts = [first_section.strip(), 'Musculo-skeletal system' + second_section]
                    for part_i, (subpart_roman, mark_text) in enumerate(split_rows):
                        label = f'{number}{letter}' + (f'({subpart_roman.lower()})' if subpart_roman else '')
                        # A single OCR-omitted tariff in the 743133 Q4(b)
                        # answer cell is explicitly three one-mark examples.
                        if not re.fullmatch(r'\d{1,2}', mark_text) and label == '4(b)' and 'One mark for (regional event)' in answer:
                            mark_text = '3'
                        if not re.fullmatch(r'\d{1,2}', mark_text):
                            raise ValueError(f'Unexpected OCR answer row on PDF page {page_number + 1}: {qcells} / {marks}')
                        if label in items:
                            raise ValueError(f'Duplicate printed label {label} on PDF page {page_number + 1}')
                        previous = {'marks': int(mark_text), 'regions': part_clips[part_i],
                                    'levels': '*' in n + part + roman or bool(re.search(r'\bLevel [123] \(', guidance)),
                                    'text': '\n'.join(v for v in (answer, guidance) if v)}
                        items[label] = previous
                continue
            # Some older levels-based rubrics have Question/Answer headers
            # but no Marks column; the item number and part are in the first
            # three columns and the marks range appears in the level text.
            if first == 'Question' and 'Answer' in values[0] and 'Marks' not in values[0]:
                matrix_active = False
                answer_i = values[0].index('Answer')
                for row, data in zip(table.rows[1:], values[1:]):
                    qcells = [(cell or '').strip() for cell in data[:answer_i]]
                    n = qcells[0] if qcells else ''
                    part = qcells[1] if len(qcells) > 1 else ''
                    roman = qcells[2] if len(qcells) > 2 else ''
                    if n and re.fullmatch(r'\([a-z]\*?\)', n, re.I):
                        part, n = n, ''
                    content = '\n'.join((cell or '').strip() for cell in data[answer_i:] if cell and cell.strip())
                    if not (n or part or roman or content):
                        continue
                    clip = region(page_number, page, row.bbox)
                    if n or part or roman:
                        if n:
                            number = n.rstrip('*')
                            letter = ''
                        if part.strip('()*'):
                            letter = f'({part.strip("()*")})'
                        subpart = f'({roman.strip("()*")})' if roman.strip('()*') else ''
                        label = f'{number}{letter}{subpart}'
                        if label in items:
                            raise ValueError(f'Duplicate printed label {label} on PDF page {page_number + 1}')
                        previous = {'marks': None, 'regions': [clip], 'levels': True, 'text': content}
                        items[label] = previous
                    elif previous and previous.get('levels'):
                        previous['regions'].append(clip)
                        previous['text'] += '\n' + content
                    if previous and previous.get('levels'):
                        level3 = re.search(r'Level\s+3\s*\((\d+)\s*[-–—]\s*(\d+)\s+marks', content, re.I)
                        if level3:
                            previous['marks'] = int(level3.group(2))
                continue
            # Some older OCR tables omit the column header entirely and put
            # the entire label in the first cell, e.g. `4(c)`.
            if re.fullmatch(r'\d{1,2}\s*\([a-z]\)(?:\s*\((?:i{1,3}|iv|v)\))?', first, re.I) and len(values[0]) >= 4:
                for row, data in zip(table.rows, values):
                    label_cell = (data[0] or '').strip() if data else ''
                    if not label_cell or not row.cells[1]:
                        continue
                    m = re.fullmatch(r'(\d{1,2})\s*(\([a-z]\))(?:\s*(\((?:i{1,3}|iv|v)\)))?', label_cell, re.I)
                    if not m:
                        continue
                    answer_i = 1
                    answer = (data[answer_i] or '').strip()
                    marks = (data[2] or '').strip()
                    guidance = (data[3] or '').strip()
                    if not re.fullmatch(r'\d{1,2}', marks):
                        raise ValueError(f'Unexpected headerless OCR row on PDF page {page_number + 1}: {data}')
                    y0, y1 = row.cells[answer_i][1::2]
                    clip = region(page_number, page, (table.bbox[0], y0, table.bbox[2], y1))
                    label = m[1] + m[2].lower() + ((m[3] or '').lower() if m[3] else '')
                    if label in items:
                        raise ValueError(f'Duplicate printed label {label} on PDF page {page_number + 1}')
                    previous = {'marks': int(marks), 'regions': [clip], 'levels': '*' in label_cell or 'Level 3' in guidance,
                                'text': '\n'.join(v for v in (answer, guidance) if v)}
                    items[label] = previous
                continue
            # A related variant has a 3-column header (Question / Answer /
            # Guidance) for the descriptor rubric but no Marks column.
            if first == 'Question' and len(values[0]) == 3 and values[0][1] == 'Answer' and values[0][2] == 'Guidance':
                for row, data in zip(table.rows[1:], values[1:]):
                    label_cell = (data[0] or '').strip()
                    if not label_cell:
                        continue
                    part_match = re.fullmatch(r'\(([a-z])\*?\)', label_cell, re.I)
                    if not part_match or not number:
                        continue
                    full = '\n'.join(str(cell or '') for cell in data[1:])
                    level3 = re.search(r'Level\s+3\s*\((\d+)\s*[-–—]\s*(\d+)\s+marks', full, re.I)
                    if not level3:
                        continue
                    label = number + '(' + part_match.group(1).lower() + ')'
                    clip = region(page_number, page, row.bbox)
                    previous = {'marks': int(level3.group(2)), 'regions': [clip], 'levels': True, 'text': full}
                    if label in items:
                        raise ValueError(f'Duplicate printed label {label} on PDF page {page_number + 1}')
                    items[label] = previous
                continue
            # Older specifications sometimes label a level descriptor table
            # with only its letter, e.g. `(d*)`; the question number is carried
            # from the preceding answer table. The top tariff is the upper end
            # of its Level 3 band.
            bare_part = re.fullmatch(r'\(([a-z])\*?\)', first, re.I)
            if bare_part and number:
                full = '\n'.join(str(cell or '') for row in values for cell in row)
                level3 = re.search(r'Level\s+3\s*\((\d+)\s*[-–—]\s*(\d+)\s+marks', full, re.I)
                if level3:
                    label = number + '(' + bare_part.group(1).lower() + ')'
                    clip = region(page_number, page, table.bbox)
                    previous = {'marks': int(level3.group(2)), 'regions': [clip], 'levels': True, 'text': full}
                    if label in items:
                        raise ValueError(f'Duplicate printed label {label} on PDF page {page_number + 1}')
                    items[label] = previous
                    continue
            # Grids attached to the preceding levels-based question sometimes
            # have a nonstandard header (e.g. Foundation/Participation/Elite).
            header_text = ' '.join(str(v or '') for v in values[0])
            if previous and previous.get('levels') and any(term in header_text for term in ('Foundation', 'Participation', 'Performance', 'Elite')):
                append_region(previous['regions'], region(page_number, page, table.bbox))
                previous['text'] += '\n' + '\n'.join(' '.join(str(c or '') for c in row) for row in values[1:])
                matrix_active = True
                continue
            if matrix_active and previous and previous.get('levels'):
                append_region(previous['regions'], region(page_number, page, table.bbox))
                previous['text'] += '\n' + '\n'.join(' '.join(str(c or '') for c in row) for row in values[1:])
                continue
            # Free-standing levels rubric on the page before a question's
            # heading. Attach it to the next explicit N marks heading.
            if first.startswith('Level 3') and len(values[0]) in (2, 4):
                rubric_region = region(page_number, page, table.bbox)
                rubric_text = '\n'.join(' '.join(str(c or '') for c in row) for row in values)
                if previous and previous.get('levels') and previous['regions'] and page_number > previous['regions'][-1][0]:
                    append_region(previous['regions'], rubric_region)
                    previous['text'] += '\n' + rubric_text
                else:
                    pending_rubric_regions.append(rubric_region)
                    pending_rubric_text.append(rubric_text)
                continue
            rubric = re.match(r'(\d+)((?:\s*\([a-z]+\))*)\s*\*?', first, re.S | re.I)
            rubric_marks = re.search(r'(?:[–—-]\s*|\(\s*|\s+)(\d+)\s+marks', first, re.S | re.I)
            if rubric and rubric_marks:
                label = rubric[1] + re.sub(r'\s+', '', rubric[2])
                tariff = int(rubric_marks[1])
                existed = label in items
                previous = items.setdefault(label, {'marks': tariff, 'regions': [], 'levels': True, 'text': first})
                if previous['marks'] != tariff:
                    raise ValueError(f'Conflicting rubric marks for {label}')
                previous['regions'].extend(pending_rubric_regions)
                if pending_rubric_text:
                    previous['text'] += '\n' + '\n'.join(pending_rubric_text)
                pending_rubric_regions.clear()
                pending_rubric_text.clear()
                previous['regions'].append(region(page_number, page, table.bbox))
                body_text = '\n'.join('\n'.join(str(cell or '') for cell in row if cell) for row in values[1:])
                if body_text and (existed or body_text not in previous['text']):
                    previous['text'] += '\n' + body_text
    for label, item in items.items():
        if not isinstance(item.get('marks'), int):
            raise ValueError(f'Could not determine printed tariff for {label}')
    return items
