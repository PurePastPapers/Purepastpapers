#!/usr/bin/env python3
"""Model review sheets for the English Literature route units: draft, then compile.

Usage:
  reviews.py draft DIR     write DIR/review-src/<PAPER>.txt drafts from the candidates
  reviews.py compile DIR   check the sheets and write DIR/reviews/<PAPER>.json

One line per route question (lines starting with # are comments):

    Q | codes [; related codes] | e/m/h | summary | difficulty basis [| excluded: reason]

Codes are the spec leaf codes (A.1 Othello, A.2 critical reading, B.1 A Streetcar Named
Desire, P.1/P.2 Science and Society texts, PD.n Poems of the Decade poems, PD.U unseen
poetry, R.n The Romantics poems). The draft names the set poem each poetry question
names; a named poem that is not on the current prescribed list cannot be tagged and is
drafted as excluded (removed from the prescribed list), which the reviewer confirms.
Drafts are a starting point: the reviewer (a model, reviewer_type "model") reads every
question and edits the sheet before compiling. Difficulty: A-level questions are hard
(extended essays at A-level demand, AO-weighted grids up to 40 marks); AS questions are
medium (the same task types at AS demand).
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SPEC = REPO / 'data/specs/EDX_ALEVEL_ENGLIT_9ET0.json'
DIFF = {'e': 'easy', 'm': 'medium', 'h': 'hard'}


def flat(text):
    return re.sub(r'[^a-z0-9]+', '', text.lower().replace('‘', "'").replace('’', "'").replace('ё', 'e'))


def leaves():
    spec = json.loads(SPEC.read_text())
    return {p['code']: p for s in spec['sections'] for t in s['topics'] for p in t['points']}


def poem_code(text, prefix, codes):
    """Leaf code of the set poem a question names, or None."""
    f = flat(text)
    best = None
    for code, leaf in codes.items():
        if not code.startswith(prefix + '.') or code.endswith('.U'):
            continue
        title = leaf['title'].rsplit(' (', 1)[0]
        options = [title] + ([title.split(': ', 1)[1]] if title.startswith('Songs of') else [])
        for option in options:
            if flat(option) in f and (best is None or len(flat(option)) > best[1]):
                best = (code, len(flat(option)), option == title)
    if best and not best[2]:   # matched only "Holy Thursday"-style tail: must be unique
        tail = [c for c, l in codes.items() if c.startswith(prefix + '.') and flat(l['title'].rsplit(' (', 1)[0].split(': ')[-1]) in f]
        if len(tail) != 1:
            return None
    return best[0] if best else None


def task_sentence(text):
    one = ' '.join(text.split())
    one = re.sub(r'^\d{1,2} ', '', one)
    one = re.split(r' \(Total for', one)[0].replace(' from Poems of the Decade: An Anthology of the Forward Books of Poetry 2002–2011', '')
    sentences = re.split(r'(?:(?<=[.!?])|(?<=[.!?]’))\s+(?=[A-Z‘])', one)
    for s in sentences:
        if re.match(r'^(In the light of this comment, )?(Explore|Compare|Discuss)', s, re.I):
            s = re.sub(r'^In the light of this comment, e', 'E', s)
            return s.rstrip('.')
    return sentences[0].rstrip('.')


def draft(research):
    codes = leaves()
    out = research / 'review-src'
    out.mkdir(parents=True, exist_ok=True)
    for path in sorted((research / 'candidates').glob('*.json')):
        cand = json.loads(path.read_text())
        is_as = '_8ET0_' in path.stem
        lines = [f'# {path.stem} model review draft (reviewer_type model). Q | codes [; related] | e/m/h | summary | basis [| excluded: reason]']
        for q in cand['questions']:
            if not q['route']:
                continue
            task = task_sentence(q['text'])
            diff = 'm' if is_as else 'h'
            basis = (f"AS {q['marks']}-mark essay: AS-level demand" if is_as else
                     f"A-level {q['marks']}-mark extended essay assessed by a levels grid")
            excluded = ''
            if q['route'] == 'A':
                tags, summary = 'A.1; A.2', f'{task} (with critical reading)'
                basis += '; AO5 critical reading is assessed (Critical Anthology as related content)'
            elif q['route'] == 'B':
                tags, summary = 'B.1', task
                if is_as:
                    basis += '; responds to a critical view'
            elif q['route'] == 'P':
                tags, summary = 'P.1, P.2', f'Science and Society: {task}'
                basis += '; comparative, two texts'
            elif q['route'] == 'PD':
                code = poem_code(' '.join(q.get('named_poems') or []) if not is_as else q['text'], 'PD', codes)
                if is_as:
                    tags, summary = code or '', f'Poems of the Decade: {task}'
                    basis += '; comparison with a poem of the student’s choice'
                else:
                    tags = f'{code}, PD.U' if code else ''
                    summary = f"Unseen poem {q.get('unseen')} with {(q.get('named_poems') or ['an anthology poem'])[0]}: {task}"
                    basis += '; unseen poem comparison'
                if not code:
                    excluded = ' | excluded: the named poem is not on the current Poems of the Decade prescribed list'
            elif q['route'] == 'R':
                code = poem_code(q['text'], 'R', codes)
                tags, summary = code or '', f'The Romantics: {task}'
                basis += '; one named poem and one other'
                if not code:
                    excluded = ' | excluded: the named poem is not on the current English Romantic Verse prescribed list'
            lines.append(f"{q['number']} | {tags} | {diff} | {summary} | {basis}{excluded}")
        if len(lines) > 1:
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
                  'tagging_basis': 'Pearson 9ET0 Issue 11 / 8ET0 Issue 8 set texts and prescribed poems (owner route)',
                  'units': [units[q['number']] for q in cand['questions'] if q['route']]}
        target = research / 'reviews' / f'{sheet.stem}.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(review, ensure_ascii=False, indent=1) + '\n')
        print(sheet.stem, len(units), 'reviewed', sum('excluded' in u for u in units.values()) or '')


if __name__ == '__main__':
    {'draft': draft, 'compile': compile_sheets}[sys.argv[1]](Path(sys.argv[2]))
