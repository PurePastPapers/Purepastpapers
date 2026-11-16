"""Index full-question mark-scheme regions for Pearson Biology A (9BN0/8BN0).

Biology schemes are landscape tables headed "Question Number | Answer |
Additional guidance | Mark" with references such as 1(a), 1(b)(i), *3(c) in the
left column. A question's region runs from its first reference to the first
reference of the next question, keeping every row, alternative, note,
indicative-content block and levels grid. General marking guidance before the
first table and the publisher's back page are excluded.
"""
import re

import pdfplumber

REFERENCE = re.compile(r'\*?Q?(\d{1,2})(?:\s?\(?[a-z]{1,4}\)?)*\*?')
BACK_PAGE = re.compile(r'Registered company number|Registered Office|Pearson Education Limited\.? Registered', re.I)


def visible_words(page):
    return [w for w in page.extract_words(extra_attrs=['fontname'])
            if w.get('upright', True) and 15 < w['x0'] < w['x1'] <= page.width - 15
            and 0 <= w['top'] < w['bottom'] <= page.height - 15]


def table_started(text):
    return bool(re.search(r'Question\s*(Number|number)?\s*\n?.*Answer', text, re.S) or
                re.search(r'Question\s+Answer|Question\s+Number', text))


def merge_reference_words(words):
    """'3' + '(a)' printed as separate words in the reference column are one reference."""
    out, skip = [], False
    ordered = sorted(words, key=lambda w: (round(w['top']), w['x0']))
    for i, w in enumerate(ordered):
        if skip:
            skip = False
            continue
        nxt = ordered[i + 1] if i + 1 < len(ordered) else None
        if nxt and re.fullmatch(r'\*?\d{1,2}', w['text']) and re.match(r'^\([a-z]{1,4}\)', nxt['text']) \
                and abs(nxt['top'] - w['top']) < 3 and -1.5 <= nxt['x0'] - w['x1'] < 4.5:
            out.append({**w, 'text': w['text'] + nxt['text'], 'x1': nxt['x1']})
            skip = True
        else:
            out.append(w)
    return out


def scheme_regions(path, question_count):
    with pdfplumber.open(path) as doc:
        page_words = [merge_reference_words(visible_words(page)) for page in doc.pages]
        texts = [page.extract_text() or '' for page in doc.pages]
        first_table = next((i for i, t in enumerate(texts) if table_started(t)), None)
        if first_table is None:
            raise ValueError(f'No question table found: {path}')
        last_page = len(doc.pages) - 1
        while last_page > first_table and BACK_PAGE.search(texts[last_page]) and not table_started(texts[last_page]) \
                and len(texts[last_page].split()) < 400:
            last_page -= 1
        starts, expected = [], 1
        for pi in range(first_table, last_page + 1):
            page = doc.pages[pi]
            column = page.width * .2
            for w in sorted(page_words[pi], key=lambda w: w['top']):
                if w['x0'] > column:
                    continue
                m = REFERENCE.fullmatch(w['text'])
                if not m or int(m.group(1)) != expected:
                    continue
                # A bare number must sit on a table row (an answer follows on the
                # same line), not in prose such as "70 marks".
                if re.fullmatch(r'\*?\d{1,2}', w['text']):
                    row = [v for v in page_words[pi] if abs(v['top'] - w['top']) < 4 and v['x0'] > w['x1']]
                    if not row or any(re.fullmatch(r'marks?', v['text'], re.I) for v in row[:2]):
                        continue
                starts.append((pi, max(15, w['top'] - 8), expected))
                expected += 1
        if len(starts) != question_count:
            raise ValueError(f'Scheme has {len(starts)} indexed questions; expected {question_count}: {path}; starts={starts}')
        output = {}
        for i, (pi, top, number) in enumerate(starts):
            ep, ey = starts[i + 1][:2] if i + 1 < len(starts) else (last_page, 10000)
            regions = []
            for index in range(pi, ep + 1):
                page = doc.pages[index]
                lo = top if index == pi else 15
                hi = ey if index == ep else page.height - 15
                words = [w for w in page_words[index] if lo <= w['top'] < hi
                         and not re.fullmatch(r'\d{1,3}', w['text'])]  # page numbers alone
                shapes = [o for o in page.images + page.curves if lo <= o['top'] < hi and o['bottom'] - o['top'] > 3]
                if (not words and not shapes) or hi - lo < 10:
                    continue
                bottom = min(page.height - 15, max([w['bottom'] for w in words] + [o['bottom'] for o in shapes]) + 6)
                regions.append({'page': index + 1, 'bbox': [round(15 / page.width, 6), round(lo / page.height, 6),
                                                            round((page.width - 15) / page.width, 6), round(bottom / page.height, 6)]})
            if not regions:
                raise ValueError(f'No source regions for scheme question {number}: {path}')
            output[str(number)] = regions
        return output
