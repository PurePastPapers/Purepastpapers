#!/usr/bin/env python3
"""Compile a reviewer's compact line sheet into the JSON review consumed by build.py.

One line per scored unit (lines starting with # are comments):

    Q | parts | statements [; prerequisite statements] | e/m/h | summary | difficulty basis [| i/s/g]

parts are the candidate's original part labels joined by "+" (written without
brackets, e.g. a, b(i)+b(ii), or "-" for an unlabelled multiple-choice tariff).
Where the printed label was misread (e.g. "*( a)" read as unlabelled, or "*(c)"
read as a second "(b)"), append "@printed" to the parts cell: "-@a", "b@c".
Statements are official chemistry statement codes as printed in the 1CH0/1SC0
specifications (1.6, 5.8C, 7.14 ...), space- or comma-separated, e.g. "6.3 6.4; 1.9".
A 1SC0 booklet may only use statements that are in the 1SC0 specification (no C codes). Context defaults to independent for a
question's first unit and shared_stem afterwards; g = grouped_dependency.
Every candidate tariff must be used exactly once (checked here and in build.py).
"""
import json, re, sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def codes(qual):
    sid = {'1CH0': 'EDX_GCSE_CHEM_1CH0', '1SC0': 'EDX_GCSE_COMBSCI_1SC0'}[qual]
    spec = json.loads((ROOT / 'data/specs' / f'{sid}.json').read_text())
    pre = {'1CH0': 'EDX_GCSE_CHEM_OFF_', '1SC0': 'EDX_GCSE_COMBSCI_CHEM_'}[qual]
    return {p['code'] for s in spec['sections'] for t in s['topics'] for p in t['points'] if p['id'].startswith(pre)}
DIFF = {'e': 'easy', 'm': 'medium', 'h': 'hard'}
CTX = {'i': 'independent', 's': 'shared_stem', 'g': 'grouped_dependency'}


def label(token):
    token = token.strip()
    if token in ('-', ''):
        return ''
    return ''.join(f'({p})' for p in re.findall(r'[a-h]|[ivx]+', token.replace('(', ' ').replace(')', ' ')))


def parse_label(token):
    # "b(ii)" / "bii" / "(b)(ii)" -> "(b)(ii)" ; letters first then roman
    token = token.strip().replace('(', '').replace(')', '')
    if token in ('-', ''):
        return ''
    m = re.fullmatch(r'([a-h]?)((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)?)', token)
    if not m:
        raise ValueError(f'Bad part label {token!r}')
    return ''.join(f'({x})' for x in m.groups() if x)


def compile_sheet(sheet, candidate, CODES):
    questions = {}
    for n, raw in enumerate(sheet.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        cells = [c.strip() for c in line.split('|')]
        if len(cells) not in (6, 7):
            raise ValueError(f'{sheet.name}:{n}: expected 6 or 7 fields, got {len(cells)}')
        q, parts, tags, diff, summary, basis = cells[:6]
        stmts, _, pre = tags.partition(';')
        nums = lambda s: [x.upper() for x in re.findall(r'\b\d\.\d{1,2}[Cc]?\b', s)]
        parts, _, printed = parts.partition('@')
        unit = {'parts': [parse_label(p) for p in parts.split('+')], 'statements': nums(stmts),
                'prerequisites': nums(pre), 'difficulty': DIFF[diff], 'summary': summary,
                'difficulty_basis': basis, 'review_status': 'model_reviewed'}
        if printed:
            unit['display_part_label'] = parse_label(printed)
        bucket = questions.setdefault(q, [])
        unit['context_basis'] = CTX[cells[6]] if len(cells) == 7 and cells[6] else ('independent' if not bucket else 'shared_stem')
        if not unit['statements'] or any(x not in CODES for x in unit['statements'] + unit['prerequisites']):
            raise ValueError(f'{sheet.name}:{n}: unknown statement code in {tags!r}')
        bucket.append(unit)
    out = []
    for q in candidate['questions']:
        units = questions.get(q['number'])
        if not units:
            raise ValueError(f'{sheet.name}: Q{q["number"]} has no review')
        expected = Counter(p['part_label'] for p in q['parts'])
        actual = Counter(l for u in units for l in u['parts'])
        if expected != actual:
            raise ValueError(f'{sheet.name}: Q{q["number"]} parts {dict(actual)} != source {dict(expected)}')
        out.append({'number': q['number'], 'units': units, 'exceptions': []})
    extra = set(questions) - {q['number'] for q in candidate['questions']}
    if extra:
        raise ValueError(f'{sheet.name}: unknown questions {extra}')
    return out


def main():
    research = Path(sys.argv[1])
    for sheet in sorted((research / 'review-src').glob(sys.argv[2] if len(sys.argv) > 2 else '*.txt')):
        pid = sheet.stem
        candidate = json.loads((research / 'candidates' / f'{pid}.json').read_text())
        review = {'paper_id': pid, 'reviewer_type': 'model', 'review_status': 'model_reviewed',
                  'source_sha256': candidate['source_sha256'],
                  'tagging_basis': 'Pearson 1CH0 Issue 4 / 1SC0 Issue 6 chemistry statement codes',
                  'questions': compile_sheet(sheet, candidate, codes(pid.split('_')[1]))}
        target = research / 'reviews' / f'{pid}.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(review, ensure_ascii=False, indent=1) + '\n')
        print(pid, sum(len(q['units']) for q in review['questions']), 'units')


if __name__ == '__main__':
    main()
