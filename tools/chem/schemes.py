#!/usr/bin/env python3
"""Locate each scored unit's official scheme in an OCR Computer Science mark scheme.

OCR schemes are ruled tables "Question | Answer | Marks | Guidance". The question
column labels a row compactly ("1ai"), as separate cells ("1", "(a)", "(i)"), or only by
the level that changed ("(b)"), often vertically centred in the row. Each ruled row is
labelled from the tokens left of the Answer column, with missing higher levels carried
from the row above; a row with no label continues the previous one (long rows break
across pages). A unit's scheme is every row carrying its own label. If OCR labels only
the parent part, the unit gets the parent's rows and the scope is recorded as 'parent'.
Pages before the first table header (general marking guidance) are not used.
"""
import re

ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']
COMPACT = re.compile(r'^(\d{1,2})([a-hj])?(i|ii|iii|iv|v|vi|vii|viii|ix|x)?$')

# These official schemes have exact ruled rows even where a label is repeated,
# shortened or blank. Bounds are top-left PDF points on the checked sources.
REVIEWED_SCHEME_ROWS = {
    '0c25dae332de1146ff930006d9a848062995861193493c9e5e79481eefd2f171': {
        '6(b)(i)': [(19, 128, 157)],
        '6(b)(ii)': [(20, 61, 520)],
    },
    'c5d6cddc615c2d962e6a9dfcefe4ad134a3eb1f2c682f2a5dbbd63b1b0a5d14b': {
        '2(a)(i)': [(8, 68, 527)],
    },
    'd168504f38cc76cfa6d04d1e8a9a1195d2db3a3a7add1fbd23540b66cde5ddb7': {
        '1(b)': [(5, 263, 525)],
        '1(c)': [(6, 61, 289)],
    },
    'fe8969d35a0a1a8ff097258ba2d98298d7738febc03404887a4999e5ccac799f': {
        '20(b)(v)': [(24, 389, 517)],
    },
}


def parse_tokens(tokens, prev):
    """tokens: label words in reading order. prev: (q, part, sub). Returns (q, part, sub) or None."""
    text = ' '.join(tokens).replace('(', ' ').replace(')', ' ').split()
    if not text:
        return None
    if len(text) == 1 and COMPACT.match(text[0]) and not text[0].isdigit():
        m = COMPACT.match(text[0])
        return (m.group(1), m.group(2), m.group(3))
    q, part, sub = prev if prev else (None, None, None)
    level = None
    for t in text:
        if t.isdigit():
            if t != q:   # a repeated question number ("1 (ii)") keeps the current part
                q, part, sub = t, None, None
            level = 'q'
        elif re.fullmatch(r'[a-z]{1,4}', t):
            next_part = chr(ord(part) + 1) if part else 'a'
            next_sub = ROMAN[ROMAN.index(sub) + 1] if sub in ROMAN[:-1] else 'i'
            repeated_part = t == part and level != 'p'
            if repeated_part:   # "(b)" printed again before its numerals
                level = 'p'
            elif t in ROMAN and part and level != 'q' and (t == next_sub or t == sub) and t != next_part:
                sub, level = t, 's'
            elif t in ROMAN and part and level == 'p':
                sub, level = t, 's'
            elif t in ROMAN and part and level == 'q' and t != next_part and t != 'a':
                sub, level = t, 's'   # "1 (ii)": question repeated, numeral continues the part
            elif len(t) == 1:
                part, sub, level = t, None, 'p'
            elif t in ROMAN:
                sub, level = t, 's'
            else:
                return None
        else:
            return None
    return (q, part, sub) if q else None


def label_of(t):
    q, p, s = t
    return q + (f'({p})' if p else '') + (f'({s})' if s else '')


def scheme_regions(path, labels, start_page=0, source_sha256=None):
    """labels: unit labels like '1(a)(i)'. Returns {label: {'regions': [...], 'scope': 'unit'|'parent'}}."""
    import pdfplumber
    rows = []   # (page_index, top, bottom, label or None)
    # Label cells: "1", "(a)", "(ii)", bare "a"/"ii" (some years print no brackets) or compact "1aii".
    LABEL = re.compile(r'^(\d{1,2}|\(?(?:[a-hj]|i|ii|iii|iv|v|vi|vii|viii|ix|x|Ii|Iii|Iv|Vi|Vii|Viii|Ix)\)?\*?|\d{1,2}[a-hj]?(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)?\*?|[()])$')
    # (one scheme prints the numeral "Iv"; a lone bracket is a label split across words. Single
    # capitals are never labels: they are answers such as "A" or "B".)
    with pdfplumber.open(path) as pdf:
        # Search from start_page (sample assessment PDFs hold the question paper first); the
        # order-aligned matching below ignores rows until question 1's labels appear.
        first = start_page
        for pi, page in enumerate(pdf.pages):
            if pi < first:
                continue
            words = page.extract_words()
            # Rules are drawn per cell, so a row boundary is a height whose segments together span the table.
            span = {}
            for e in page.edges:
                if e['orientation'] == 'h':
                    span[round(e['top'])] = span.get(round(e['top']), 0) + e['width']
            rules = []
            for y in sorted(y for y, w in span.items() if w > 0.4 * page.width):
                if not rules or y - rules[-1] > 3:   # double-drawn rules are one boundary
                    rules.append(y)
            # A page whose last row has no closing rule (a long row ending the table) still has content below
            # the last rule: close it at the lowest printed word above the footer.
            body = [w for w in words if w['top'] < page.height - 45]
            if rules and body and max(w['bottom'] for w in body) - rules[-1] > 12:
                rules.append(max(w['bottom'] for w in body) + 3)
            pairs = [(t, b) for t, b in zip(rules, rules[1:]) if b - t >= 6]
            # A label row starts with label-shaped cells ("3", "(a)", "(i)" or "1aii"); its first other
            # word marks where the answer column begins. Column widths change from page to page,
            # so the page's label zone is the leftmost such start over its label rows only (a
            # full-width guidance row beginning with a bullet does not count).
            grouped = []
            for top, bottom in pairs:
                inside = sorted([w for w in words if top < w['top'] < bottom], key=lambda w: w['x0'])
                lead = []
                for w in inside:
                    if (LABEL.match(w['text']) or w['text'] == '*') and w['text'] not in ('Question',):   # a bare '*' marks a levels-based question
                        lead.append(w)
                    else:
                        break
                first_other = next((w for w in inside if w not in lead), None)
                grouped.append((top, bottom, inside, lead, first_other))
            starts = [fo['x0'] for _, _, _, lead, fo in grouped if lead and fo is not None]
            zone = min(starts) - 1 if starts else 122
            for top, bottom, inside, lead, fo in grouped:
                if not inside:
                    continue
                tokens, prev_digit = [], None
                for w in inside:
                    if not (w['x0'] < zone and LABEL.match(w['text']) and w['text'] not in ('(', ')')):
                        continue
                    t = w['text'].rstrip('*').lower()
                    if prev_digit is not None and t.isdigit() and (abs(w['top'] - prev_digit['top']) < 3 and 0 <= w['x0'] - prev_digit['x1'] < 6
                                                                   or abs(w['x0'] - prev_digit['x0']) < 2 and 0 < w['top'] - prev_digit['top'] < 18):   # also digits stacked in a narrow column
                        tokens[-1] += t   # a two-digit question number split by kerning: "1" "8"
                    else:
                        tokens.append(t)
                    prev_digit = w if t.isdigit() else None
                rows.append({'page': pi, 'top': top, 'bottom': bottom, 'tokens': tokens, 'width': page.width, 'height': page.height})
    # Align rows to the question paper's own ordered labels. A row starts the next expected
    # label (or that label's parent, a row covering all its numerals) only when its label
    # tokens are consistent with it and include its last component; anything else continues
    # the current label. Order comes from the question paper, so guidance pages, marks and
    # stray numbers cannot start a scheme.
    keys = [tuple([l.split('(')[0]] + re.findall(r'\(([a-z]+)\)', l)) for l in labels]

    def parts(tokens):
        digits, letters, compact = [], [], []
        for t in tokens:
            t = t.strip('()*')
            m = COMPACT.match(t)
            if t.isdigit():
                if not digits and not letters and not compact:
                    digits.append(t)   # only the leftmost number is the question; later ones are marks or answers
            elif m and not t.isdigit():
                compact.append(tuple(x for x in m.groups() if x))
            elif re.fullmatch(r'[a-z]{1,4}', t):
                letters.append(t)
            else:
                return None
        return digits, letters, compact

    whole = {k[0] for k in keys if len(k) == 1}   # questions printed without parts

    def consistent(p, key):
        digits, letters, compact = p
        if any(d != key[0] for d in digits):
            return False
        # A scheme may subdivide a unit the paper prints whole ("5 (a) (i)" for unit 5(a), or
        # "4 (a)" for an unparted question 4): extra deeper labels below the key are allowed.
        extra = [l for l in letters if l not in key[1:]]
        if extra and not (len(key) == 1 and key[0] in whole or len(key) == 2 and all(l in ROMAN for l in extra)):
            return False
        if any(c[:len(key)] != key[:len(c)] for c in compact):
            return False
        last = key[-1]
        return (last in digits if len(key) == 1 else last in letters) or any(c[:len(key)] == key for c in compact)

    by_label, current, idx, matched = {}, None, 0, set()
    for r in rows:
        p = parts(r['tokens']) if r['tokens'] else None
        if p and any(p):
            digits, letters, compact = p
            full = [j for j, k in enumerate(keys) if j not in matched and consistent(p, k)
                    and (compact and any(c == k for c in compact) or digits and digits[0] == k[0] and len(k) > 1)]
            if full and abs(full[0] - idx) > 3:
                idx = full[0]   # a fully stated label re-synchronises the alignment
            if digits and not letters and not compact and idx < len(keys) and keys[idx][0] == digits[0] \
                    and (idx == 0 or keys[idx - 1][0] != digits[0]):
                current, idx = label_of(tuple(list(keys[idx]) + [None] * (3 - len(keys[idx])))), idx + 1
                matched.add(idx - 1)   # a question number alone introduces the question's first part
                by_label.setdefault(current, []).append(r)
                continue
            for j in range(idx, min(idx + 4, len(keys))):
                key = keys[j]
                # the label itself, or its part (a row covering all its numerals), never the bare question
                chain = [key] + ([key[:2]] if len(key) == 3 else [])
                hit = next((c for c in chain if consistent(p, c)), None)
                if hit:
                    current = label_of(tuple(list(hit) + [None] * (3 - len(hit))))
                    if hit == key:
                        matched.add(j)
                    idx = j + 1 if hit == key else j
                    break
        if current is None:
            continue
        by_label.setdefault(current, []).append(r)
    out = {}
    for label in labels:
        scope, rs = 'unit', by_label.get(label)
        if not rs:
            parent = label.rsplit('(', 1)[0] if '(' in label else None
            while parent and not by_label.get(parent):
                parent = parent.rsplit('(', 1)[0] if '(' in parent else None
            rs, scope = (by_label.get(parent), 'parent') if parent else (None, None)
        if not rs:   # no row of its own and no labelled parent: fall back to every row of the question
            q = label.split('(')[0]
            rs = [r for l, v in by_label.items() if l.split('(')[0] == q for r in v]
            rs = sorted({(r['page'], r['top']): r for r in rs}.values(), key=lambda r: (r['page'], r['top']))
            scope = 'question' if rs else None
        if not rs:
            continue
        regions = []
        for r in rs:
            box = [round(20 / r['width'], 6), round(max(20, r['top'] - 1) / r['height'], 6),
                   round((r['width'] - 20) / r['width'], 6), round(min(r['height'] - 20, r['bottom'] + 1) / r['height'], 6)]
            if regions and regions[-1]['page'] == r['page'] + 1 and abs(regions[-1]['bbox'][3] - box[1]) < 0.01:
                regions[-1]['bbox'][3] = box[3]   # adjacent rows on one page become one crop
            else:
                regions.append({'page': r['page'] + 1, 'bbox': box})
        out[label] = {'regions': regions, 'scope': scope}
    # The specimen table carries part (i) onto the next page. The diagonal
    # watermark and total row must not become part of the following scheme.
    if source_sha256 == 'd14d8cc9d3b7845bb002ae125ab1d7bad5615ccba4d71f6d85511c151a695404':
        out['1(i)'] = {
            'scope': 'unit',
            'regions': [
                {'page': 31, 'bbox': [0.023755, 0.868441, 0.976245, 0.895317]},
                {'page': 32, 'bbox': [0.023755, 0.102466, 0.976245, 0.228449]},
            ],
        }
        out['1(j)'] = {
            'scope': 'unit',
            'regions': [
                {'page': 32, 'bbox': [0.023755, 0.102466, 0.976245, 0.133]},
                {'page': 32, 'bbox': [0.023755, 0.225089, 0.976245, 0.272123]},
            ],
        }
    elif source_sha256 == 'c09c7670c12ca8cb40a40df9675f7d4814d8d2da5f3336db0d0f08869318cfa8':
        # The following page starts with a fresh header and part (c).
        scheme = out.get('1(b)(iii)')
        if scheme:
            scheme['regions'] = [r for r in scheme['regions'] if r['page'] == 5]
    for label, reviewed in REVIEWED_SCHEME_ROWS.get(source_sha256, {}).items():
        if label in labels:
            out[label] = {
                'scope': 'unit',
                'regions': [
                    {'page': page, 'bbox': [0.023755, round(top / 595.32, 6), 0.976245, round(bottom / 595.32, 6)]}
                    for page, top, bottom in reviewed
                ],
            }
    return out, sorted(by_label)
