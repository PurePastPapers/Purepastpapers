"""Keep a Pearson science scheme crop within the indexed question's printed total."""

from collections import defaultdict
import re


PRINTED_TOTAL = re.compile(r'^\(?\s*(?:total\s+(?:marks\s+)?for\s+question\s+(\d+)\b|question\s+(\d+)\s*=)', re.I)


def words_on_line(items, anchor):
    return sorted((word for word in items if abs(word['top'] - anchor['top']) < 3),
                  key=lambda word: word['x0'])


def table_start(view, words, top, previous_row):
    headers = []
    for word in words:
        if word['text'] not in {'Question', 'Questio'} or word['x0'] >= 130:
            continue
        if not max(previous_row, top - 80) < word['top'] < top:
            continue
        title = ' '.join(part['text'] for part in words_on_line(words, word))
        if re.search(r'\b(?:Answer|Indicative content)\b.*\bMark\b', title, re.I):
            headers.append(word['top'])
    if not headers:
        return max(15, top - 6)
    start = max(headers)
    bars = [word['top'] for word in words if word['text'] == 'Paper:' and max(previous_row, start - 25) < word['top'] < start]
    if bars:
        return max(15, max(bars) - 6)
    # The heading's text box can sit over a subtotal on the same page.
    # Prefer the visible table rule when the PDF exposes it as a thin rectangle.
    rules = []
    for rule in view.rects:
        colour = rule.get('non_stroking_color')
        if colour is None:
            continue
        darkest = max(colour) if isinstance(colour, (list, tuple)) else colour
        if darkest < .45 and rule['x1'] - rule['x0'] > 120 and rule['bottom'] - rule['top'] <= 2:
            if max(previous_row, start - 6) < rule['top'] <= start + 1:
                rules.append(rule['top'])
    return max(15, min(rules) if rules else start - 4)


def descriptor_headings(words):
    for page, items in enumerate(words):
        for anchor in items:
            if anchor['text'].lower() != 'descriptor':
                continue
            line = {word['text'].lower() for word in words_on_line(items, anchor)}
            if {'level', 'mark'} <= line:
                yield page, anchor['top']


def printed_totals(words):
    totals = defaultdict(list)
    for page, items in enumerate(words):
        for anchor in items:
            if anchor['text'].lower().lstrip('(') not in {'total', 'question'}:
                continue
            line = words_on_line(items, anchor)
            match = PRINTED_TOTAL.match(' '.join(word['text'] for word in line if word['x0'] >= anchor['x0']))
            if match:
                totals[int(match[1] or match[2])].append((page, max(word['bottom'] for word in line) + 4))
    return totals


def bounded_scheme_regions(views, words, starts, source):
    totals = printed_totals(words)
    descriptors = list(descriptor_headings(words))
    out = {}
    for index, (page, top, question) in enumerate(starts):
        next_start = starts[index + 1][:2] if index + 1 < len(starts) else None
        matching_total = next((end for end in sorted(totals[question])
                               if end > (page, top) and (next_start is None or end <= next_start)), None)
        guidance = [position for position in descriptors if matching_total and position > matching_total
                    and (next_start is None or position < next_start)]
        if guidance:
            # Pearson sometimes prints the total before the level descriptors.
            final_page = guidance[-1][0]
            end_page, end_y = next_start or (final_page, views[final_page].height - 20)
        else:
            end_page, end_y = matching_total or next_start or (page, views[page].height - 20)
        regions = []
        for current in range(page, end_page + 1):
            view = views[current]
            lo = top if current == page else 20
            hi = end_y if current == end_page else view.height - 25
            objects = [item for item in [*words[current], *view.images] if lo <= item['top'] < hi]
            if not objects or hi - lo < 10:
                continue
            bottom = min(hi, view.height - 20, max(item['bottom'] for item in objects) + 6)
            regions.append({'page': current + 1, 'bbox': [20 / view.width, lo / view.height,
                                                          (view.width - 20) / view.width, bottom / view.height]})
        if not regions:
            raise ValueError(f'No scheme region for question {question}: {source}')
        out[str(question)] = regions
    return out
