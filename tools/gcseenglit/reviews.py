#!/usr/bin/env python3
"""Model review sheets for the Eduqas GCSE English Literature route units: draft, then compile.

Usage:
  reviews.py draft DIR     write DIR/review-src/<PAPER>.txt drafts from the candidates
  reviews.py compile DIR   check the sheets and write DIR/reviews/<PAPER>.json

One line per route question (lines starting with # are comments):

    Q | codes [; related codes] | e/m/h | summary | difficulty basis [| excluded: reason]

Codes are spec leaf codes: A.2 Macbeth, A.1 An Inspector Calls, B.1 A Christmas Carol,
C.1 / C.2 unseen poetry, P.n the 2027 anthology poems. Anthology questions in the public
papers name a poem from the anthology examined until 2026 (no poem carries over), so the
draft marks them excluded; the reviewer confirms. Drafts are a starting point: the
reviewer (a model, reviewer_type "model") reads every question and edits the sheet.
Difficulty: the 15-mark extract and single-unseen-poem questions are medium; the 25-mark
essays and comparisons and the 40-mark source-based essays are hard.
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SPEC = REPO / 'data/specs/EDUQAS_GCSE_ENGLIT_C720QS.json'
DIFF = {'e': 'easy', 'm': 'medium', 'h': 'hard'}


def leaves():
    spec = json.loads(SPEC.read_text())
    return {p['code']: p for s in spec['sections'] for t in s['topics'] for p in t['points']}


def one(text):
    return ' '.join(text.split())


def task(q):
    t = one(q['text'])
    t = re.sub(r'\*?5 of this question’s marks.*', '', t)
    t = re.sub(r'\[\s*\d+\s*\]', '', t)
    if q['route'] == 'SHAKES' and q['number'].endswith('1'):
        m = re.search(r'following question:?\s*(.+?)(?: Refer closely| Fife:| Enter |$)', t)
        return (m.group(1) if m else t[:160]).strip()
    if q['route'] in ('POST1914', 'C19'):
        m = re.search(r'(Write about .+?|How does .+?\?|.+? is a (?:play|novel|novella) .+?\.)(?= In your response| You should| •|$)', t)
        return (m.group(1) if m else t[:160]).strip()
    if q['route'] == 'UNSEEN':
        m = re.search(r'((?:Write about the poem|Now compare) .+?\.)', t)
        return (m.group(1) if m else t[:160]).strip()
    m = re.match(r'^\*?\s*\d \d\s*(.+?)(?:$)', t)
    return (m.group(1) if m else t)[:200].strip()


def draft(research):
    out = research / 'review-src'
    out.mkdir(parents=True, exist_ok=True)
    for path in sorted((research / 'candidates').glob('*.json')):
        cand = json.loads(path.read_text())
        lines = [f'# {path.stem} model review draft (reviewer_type model). Q | codes [; related] | e/m/h | summary | basis [| excluded: reason]']
        for q in cand['questions']:
            r, n = q['route'], q['number']
            if not r:
                continue
            s, excluded = task(q), ''
            if r == 'SHAKES' and n.endswith('1'):
                line = f"{n} | A.2 | m | Macbeth extract: {s} | 15-mark extract question: close analysis of a printed passage"
            elif r == 'SHAKES':
                line = f"{n} | A.2 | h | Macbeth: {s} | 25-mark essay on the whole play from memory (20 + 5 SPaG)"
            elif r == 'POST1914':
                line = f"{n} | A.1 | h | An Inspector Calls: {s} | 40-mark essay using an extract and the whole play (35 + 5 SPaG)"
            elif r == 'C19':
                line = f"{n} | B.1 | h | A Christmas Carol: {s} | 40-mark essay using an extract and the whole novel, with context (AO3)"
            elif r == 'UNSEEN' and n.endswith('1'):
                line = f"{n} | C.1 | m | Unseen poetry: {s} | 15-mark response to one unseen poem"
            elif r == 'UNSEEN':
                line = f"{n} | C.2; C.1 | h | Unseen poetry comparison: {s} | 25-mark comparison of two unseen poems"
            elif r == 'ANTH':
                poem = re.search(r'Read the poem(?: below)?,? (.+?),? by ', one(q['text']))
                line = (f"{n} | | h | Poetry anthology: {s[:120]} | anthology question"
                        f" | excluded: names {poem.group(1) if poem else 'a poem'} from the anthology examined until 2026; no poem carries over to the 2027 anthology")
            lines.append(line)
        (out / f'{path.stem}.txt').write_text('\n'.join(lines) + '\n')
        print(path.stem, len(lines) - 1, 'drafted')


def compile_sheets(research):
    codes = leaves()
    for sheet in sorted((research / 'review-src').glob('*.txt')):
        cand = json.loads((research / 'candidates' / f'{sheet.stem}.json').read_text())
        route = {q['number'] for q in cand['questions'] if q['route']}
        units = {}
        for n, raw in enumerate(sheet.read_text().splitlines(), 1):
            line = raw.strip()
            if not line or line.startswith('#'):
                continue
            cells = [c.strip() for c in line.split('|')]
            if len(cells) not in (5, 6):
                raise SystemExit(f'{sheet.name}:{n}: expected 5 or 6 fields')
            q, tags, diff, summary, basis = cells[:5]
            excluded = cells[5].removeprefix('excluded:').strip() if len(cells) == 6 else None
            main, _, rel = tags.partition(';')
            primary = [c.strip() for c in main.split(',') if c.strip()]
            related = [c.strip() for c in rel.split(',') if c.strip()]
            if q in units or q not in route:
                raise SystemExit(f'{sheet.name}:{n}: Q{q} duplicated or not a route question')
            if not excluded and (not primary or any(c not in codes for c in primary + related)):
                raise SystemExit(f'{sheet.name}:{n}: unknown or missing codes {primary + related}')
            if diff not in DIFF or not summary or not basis:
                raise SystemExit(f'{sheet.name}:{n}: difficulty, summary and basis are required')
            unit = {'number': q, 'codes': primary, 'related_codes': related, 'spec_ids': [codes[c]['id'] for c in primary],
                    'related_spec_ids': [codes[c]['id'] for c in related], 'difficulty': DIFF[diff], 'summary': summary,
                    'difficulty_basis': basis, 'review_status': 'model_reviewed'}
            if excluded:
                unit['excluded'] = excluded
            units[q] = unit
        if set(units) != route:
            raise SystemExit(f'{sheet.name}: reviewed {sorted(units)} but route questions are {sorted(route)}')
        review = {'paper_id': sheet.stem, 'reviewer_type': 'model', 'review_status': 'model_reviewed',
                  'source_sha256': cand['source_sha256'],
                  'tagging_basis': 'Eduqas C720QS Version 4 prescribed texts and the 2027 Poetry Anthology (owner route)',
                  'units': [units[q['number']] for q in cand['questions'] if q['route']]}
        target = research / 'reviews' / f'{sheet.stem}.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(review, ensure_ascii=False, indent=1) + '\n')
        print(sheet.stem, len(units), 'reviewed', sum('excluded' in u for u in units.values()) or '')


if __name__ == '__main__':
    {'draft': draft, 'compile': compile_sheets}[sys.argv[1]](Path(sys.argv[2]))
