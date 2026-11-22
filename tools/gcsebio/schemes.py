"""Index GCSE Biology 1BI0/1SC0 mark-scheme regions (adapted from tools/gcsemaths). Formerly: GCSE Mathematics 1MA1 mark-scheme regions per question (all alternatives and notes kept).

Adapted from tools/physics/schemes.py. 1MA1 schemes are tables headed
"Question | Answer | Mark | Mark scheme | Additional guidance"; references sit in the
first column (x < 110pt), e.g. 1, 12 (a), 12(b)(ii).


Pearson Physics schemes are tables whose first column is "Question Number" with
references such as 1, 11a, 11bi, 15c(i) or 12(a)(i). General marking guidance before
the first table uses numbered paragraphs (1., 2.5) and is excluded. A question's
region runs from its first reference (or the table header just above it) to the
next question's start. Coordinates are CropBox-relative, like extract.py.
"""
import re
import sys
from pathlib import Path

import pdfplumber
from extract import CropView

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'parts'))
from pearson_scheme_bounds import bounded_scheme_regions, table_start

REF = re.compile(r'\*?Q?(\d{1,2})(?:[a-h]|\((?:[a-h]|[ivx]+)\)|[ivx]+)*')


def scheme_regions(path, question_count):
    with pdfplumber.open(path) as doc:
        views = [CropView(p) for p in doc.pages]
        words = [[w for w in v.extract_words(extra_attrs=['fontname'])
                  if w.get('upright', True) and 20 < w['x0'] < v.width - 20 and 15 < w['top'] < v.height - 20] for v in views]
        started, starts, expected = False, [], 1
        for pi, ws in enumerate(words):
            previous_row = 0
            for w in sorted(ws, key=lambda w: (w['top'], w['x0'])):
                if not started:
                    # The table header row: "Question  Answer  Mark  Mark scheme ..." on one line.
                    near = ' '.join(o['text'] for o in ws if abs(o['top'] - w['top']) < 3)
                    if w['text'] == 'Question' and w['x0'] < 130 and re.search(r'Answer.*Mark', near, re.I):
                        started = True
                    continue
                if w['x0'] > 110:
                    continue
                m = REF.fullmatch(w['text'])
                if not m or int(m.group(1)) != expected:
                    continue
                top = table_start(views[pi], ws, w['top'], previous_row)
                starts.append((pi, top, expected))
                previous_row = w['top']
                expected += 1
        if len(starts) != question_count:
            raise ValueError(f'Scheme has {len(starts)} indexed questions; expected {question_count}: {path}')
        return bounded_scheme_regions(views, words, starts, path)


if __name__ == '__main__':
    import json
    r = scheme_regions(sys.argv[1], int(sys.argv[2]))
    print(json.dumps({k: [x['page'] for x in v] for k, v in r.items()}))
