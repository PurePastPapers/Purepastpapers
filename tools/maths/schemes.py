"""Index full-question scheme regions; preserve all marking notes and alternatives."""
import re
import pdfplumber

REFERENCE = re.compile(r'Q?(\d{1,2})\.?(?:[a-h]|\([a-zivx]+\))*')
PART = re.compile(r'\([a-hivx]+\)')


def visible_words(page):
    # Some publisher SAMs retain invisible adjacent-page text outside the MediaBox.
    return [w for w in page.extract_words(extra_attrs=['fontname'])
            if w.get('upright', True) and 25 < w['x0'] < w['x1'] <= page.width - 25
            and 0 <= w['top'] < w['bottom'] <= page.height - 20]


def scheme_starts(page, words):
    """Return only question-column references or explicit publisher headings."""
    headers, candidates = [], []
    for header in words:
        if header['text'].lower().rstrip('.') not in ['question', 'qu', 'que', 'scheme']:
            continue
        row = sorted((w for w in words if abs(w['top'] - header['top']) < 5), key=lambda w: w['x0'])
        row_text = ' '.join(w['text'] for w in row)
        # E.g. a centred 'Question 10' before its general marking notes, or
        # 'Question 10 (ii) Scheme Marks AOs'. Reject references inside prose.
        caption = re.fullmatch(r'Question\s+(\d{1,2})(?:\s+\([a-zivx]+\))?(?:\s+Scheme\s+Marks\s+AO.?s)?', row_text, re.I)
        if caption:
            candidates.append((header['top'], int(caption.group(1))))
        nearby = [w['text'].lower() for w in row]
        if 'scheme' in nearby and any(v in nearby for v in ['mark', 'marks']):
            if header['text'].lower() == 'scheme':
                # One 2019 table omits the Question heading. Its actual references
                # are still bold and in the narrow left column, not the formulas.
                if any(w['text'].lower().rstrip('.') in ['question', 'qu', 'que'] for w in row):
                    continue
                headers.append({**header, 'x0': 40, 'x1': 100})
            else:
                headers.append(header)
    for word in words:
        if word['x0'] >= min(160, page.width * .28):
            continue
        match = REFERENCE.fullmatch(word['text'])
        if not match:
            continue
        # Alternative solutions may put bold 'Way 1', 'Way 2', etc. in the
        # question column. Their method numbers are not question references.
        if any(v['text'].lower() == 'way' and abs(v['top'] - word['top']) < 5
               and 0 <= word['x0'] - v['x1'] < 10 for v in words):
            continue
        header = next((h for h in reversed(headers)
                       if h['top'] - 2 <= word['top'] < h['top'] + 150
                       and h['x0'] - 15 <= word['x0']
                       and word['x1'] <= min(130, h['x1'] + 12)
                       and ('Bold' in word['fontname'] or word['fontname'] == h['fontname']
                            # Subset CID names do not expose the bold face name.
                            or (word['fontname'].startswith('CIDFont+') and word['x1'] < 112))), None)
        explicit_part = '(' in word['text'] or bool(re.fullmatch(r'\d+[a-h]', word['text'])) or any(
            PART.fullmatch(v['text']) and abs(v['top'] - word['top']) < 5
            and 0 <= v['x0'] - word['x1'] < 22 for v in words)
        if header is not None or (explicit_part and 'Bold' in word['fontname']
                                  and word['x1'] < 112 and word['top'] < 480):
            candidates.append((header['top'] if header is not None else word['top'], int(match.group(1))))
    return sorted(set(candidates))


def scheme_regions(path, question_count, *, question_starts=None):
    with pdfplumber.open(path) as doc:
        page_words = [visible_words(page) for page in doc.pages]
        starts = []
        if question_starts is None:
            expected = 1
            for pi, page in enumerate(doc.pages):
                for top, number in scheme_starts(page, page_words[pi]):
                    if number == expected:
                        starts.append((pi, max(15, top - 8), expected))
                        expected += 1
        else:
            starts = [(page - 1, top, number)
                      for number, (page, top) in enumerate(question_starts, 1)]
        if any(j[:2] <= i[:2] for i, j in zip(starts, starts[1:])):
            raise ValueError(f'Non-monotonic scheme question starts: {path}')
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
                words = [w for w in page_words[index] if lo <= w['top'] < hi]
                if not words or hi - lo < 10:
                    continue
                bottom = min(page.height - 20, max(w['bottom'] for w in words) + 6)
                regions.append({'page': index + 1, 'bbox': [25/page.width, lo/page.height, (page.width-25)/page.width, bottom/page.height]})
            output[str(number)] = regions
            if not regions:
                raise ValueError(f'No source regions for scheme question {number}: {path}')
        return output
