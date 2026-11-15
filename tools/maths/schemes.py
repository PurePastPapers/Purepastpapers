"""Index full-question scheme regions; preserve all marking notes and alternatives."""
import re
import pdfplumber

REFERENCE = re.compile(r'Q?(\d{1,2})\.?(?:[a-h]|\([a-zivx]+\))*')
PART = re.compile(r'\([a-hivx]+\)')


def visible_words(page):
    # Some publisher SAMs retain invisible adjacent-page text outside the MediaBox.
    return [w for w in page.extract_words(extra_attrs=['fontname'])
            if w.get('upright', True) and 25 < w['x0'] < page.width - 25
            and 0 <= w['top'] < page.height - 20]


def scheme_starts(page, words):
    """Return only question-column references or explicit publisher headings."""
    headers, candidates = [], []
    for header in words:
        if header['text'].lower().rstrip('.') not in ['question', 'qu']:
            continue
        row = sorted((w for w in words if abs(w['top'] - header['top']) < 5), key=lambda w: w['x0'])
        row_text = ' '.join(w['text'] for w in row)
        # E.g. a centred 'Question 10' before its general marking notes, or
        # 'Question 10 (ii) Scheme Marks AOs'. Reject references inside prose.
        caption = re.fullmatch(r'Question\s+(\d{1,2})(?:\s+\([a-zivx]+\))?(?:\s+Scheme\s+Marks\s+AO.?s)?', row_text, re.I)
        if caption:
            candidates.append((header['top'], int(caption.group(1))))
        nearby = [w['text'].lower() for w in words if abs(w['top'] - header['top']) < 20]
        if 'scheme' in nearby and 'marks' in nearby:
            headers.append(header)
    for word in words:
        if word['x0'] >= min(160, page.width * .28):
            continue
        match = REFERENCE.fullmatch(word['text'])
        if not match:
            continue
        header = next((h for h in reversed(headers)
                       if h['top'] - 2 <= word['top'] < h['top'] + 150
                       and h['x0'] - 15 <= word['x0'] < h['x0'] + 80), None)
        explicit_part = '(' in word['text'] or bool(re.fullmatch(r'\d+[a-h]', word['text'])) or any(
            PART.fullmatch(v['text']) and abs(v['top'] - word['top']) < 5
            and 0 <= v['x0'] - word['x1'] < 22 for v in words)
        if header is not None or (explicit_part and 'Bold' in word['fontname'] and word['top'] < 480):
            candidates.append((header['top'] if header is not None else word['top'], int(match.group(1))))
    return sorted(set(candidates))


def scheme_regions(path, question_count):
    with pdfplumber.open(path) as doc:
        starts = []
        expected = 1
        for pi, page in enumerate(doc.pages):
            for top, number in scheme_starts(page, visible_words(page)):
                if number == expected:
                    starts.append((pi, max(15, top - 8), expected))
                    expected += 1
        if len(starts) != question_count:
            raise ValueError(f'Scheme has {len(starts)} indexed questions; expected {question_count}: {path}; starts={starts}')
        output = {}
        for i, (pi, top, number) in enumerate(starts):
            ep, ey, _ = starts[i + 1] if i + 1 < len(starts) else (len(doc.pages) - 1, 10000, 0)
            regions = []
            for index in range(pi, ep + 1):
                page = doc.pages[index]
                lo = top if index == pi else 20
                hi = ey if index == ep else page.height - 25
                words = [w for w in visible_words(page) if lo <= w['top'] < hi]
                if not words or hi - lo < 10:
                    continue
                bottom = min(page.height - 20, max(w['bottom'] for w in words) + 6)
                regions.append({'page': index + 1, 'bbox': [25/page.width, lo/page.height, (page.width-25)/page.width, bottom/page.height]})
            output[str(number)] = regions
        return output
