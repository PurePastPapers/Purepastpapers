"""Index Physics mark-scheme regions per question (all alternatives and notes kept).

Pearson Physics schemes are tables whose first column is "Question Number" with
references such as 1, 11a, 11bi, 15c(i) or 12(a)(i). General marking guidance before
the first table uses numbered paragraphs (1., 2.5) and is excluded. A question's
region runs from its first reference (or the table header just above it) to the
next question's start. Coordinates are CropBox-relative, like extract.py.
"""
import re
import pdfplumber
from extract import CropView

REF = re.compile(r'\*?Q?(\d{1,2})(?:[a-h]|\((?:[a-h]|[ivx]+)\)|[ivx]+)*')


def scheme_regions(path, question_count):
    with pdfplumber.open(path) as doc:
        views = [CropView(p) for p in doc.pages]
        words = [[w for w in v.extract_words(extra_attrs=['fontname'])
                  if w.get('upright', True) and 20 < w['x0'] < v.width - 20 and 15 < w['top'] < v.height - 20] for v in views]
        started, starts, expected = False, [], 1
        for pi, ws in enumerate(words):
            for w in sorted(ws, key=lambda w: (w['top'], w['x0'])):
                if not started:
                    near = ' '.join(o['text'] for o in ws if -2 < o['top'] - w['top'] < 20)
                    if w['text'] == 'Question' and w['x0'] < 130 and re.search(r'Number|Answer', near, re.I):
                        started = True
                    continue
                if w['x0'] > 125:
                    continue
                m = REF.fullmatch(w['text'])
                if not m or int(m.group(1)) != expected:
                    continue
                top = w['top']
                header = [o for o in ws if o['text'] == 'Question' and o['x0'] < 130 and 0 < top - o['top'] < 40]
                if header: top = min(o['top'] for o in header)
                starts.append((pi, max(15, top - 6), expected)); expected += 1
        if len(starts) != question_count:
            raise ValueError(f'Scheme has {len(starts)} indexed questions; expected {question_count}: {path}')
        out = {}
        for i, (pi, top, number) in enumerate(starts):
            ep, ey, _ = starts[i + 1] if i + 1 < len(starts) else (len(views) - 1, 10000, 0)
            regions = []
            for index in range(pi, ep + 1):
                v = views[index]
                lo = top if index == pi else 20
                hi = ey if index == ep else v.height - 25
                inside = [w for w in words[index] if lo <= w['top'] < hi]
                pictures = [o for o in v.images if lo <= o['top'] < hi]
                if (not inside and not pictures) or hi - lo < 10:
                    continue
                bottom = min(v.height - 20, max([w['bottom'] for w in inside] + [o['bottom'] for o in pictures]) + 6)
                regions.append({'page': index + 1, 'bbox': [20 / v.width, lo / v.height, (v.width - 20) / v.width, bottom / v.height]})
            if not regions:
                raise ValueError(f'No scheme region for question {number}: {path}')
            out[str(number)] = regions
        return out


if __name__ == '__main__':
    import sys, json
    r = scheme_regions(sys.argv[1], int(sys.argv[2]))
    print(json.dumps({k: [x['page'] for x in v] for k, v in r.items()}))
