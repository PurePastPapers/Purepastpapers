#!/usr/bin/env python3
"""Build AQA A-level Geography 7037 flashcard sets from source/*.txt.

Run from the repo root: python3 flashcard-build/geography/build.py
Fails (exit 1) on: unknown spec id or deck, duplicate front, atomic back over 120
characters, em dash, list-like front or back, or a route leaf with no cards in a deck
that applies to it.
"""
import collections, hashlib, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SUBJECT = 'AQA_ALEVEL_GEOG_7037'
spec = json.load(open(ROOT.parents[1] / f'data/specs/{SUBJECT}.json'))

ROUTE_TOPICS = ['AQA_GEOG_WC', 'AQA_GEOG_COAST', 'AQA_GEOG_HAZ', 'AQA_GEOG_GS', 'AQA_GEOG_CP',
                'AQA_GEOG_URB', 'AQA_GEOG_FW', 'AQA_GEOG_SK']
PAPERS = {'AQA_GEOG_SEC_PHYS': ('Paper1', 'Paper 1: Physical geography'),
          'AQA_GEOG_SEC_HUM': ('Paper2', 'Paper 2: Human geography'),
          'AQA_GEOG_SEC_SKILLS': ('Skills', 'Geographical skills and fieldwork')}
MARK_PAPERS = {'MARK_P1': ('Paper1', 'Paper 1: Physical geography'),
               'MARK_P2': ('Paper2', 'Paper 2: Human geography'),
               'MARK_NEA': ('NEA', 'Paper 3: Geographical investigation (NEA)')}
SETS = {'content': ('CONTENT', 'Key content'),
        'evidence': ('EVIDENCE', 'Case studies and evidence'),
        'mark': ('MARK', 'Exam technique')}
CASE_STUDY = {'AQA_GEOG_3.1.1.6', 'AQA_GEOG_3.1.3.6', 'AQA_GEOG_3.1.5.7', 'AQA_GEOG_3.2.3.9', 'AQA_GEOG_3.2.2.4'}
SKILLS = {'AQA_GEOG_3.1.1.5', 'AQA_GEOG_3.1.3.5', 'AQA_GEOG_3.2.1.7', 'AQA_GEOG_3.2.2.3', 'AQA_GEOG_3.3.1',
          'AQA_GEOG_3.4.1', 'AQA_GEOG_3.4.2.1', 'AQA_GEOG_3.4.2.2', 'AQA_GEOG_3.4.2.3', 'AQA_GEOG_3.4.2.4',
          'AQA_GEOG_3.4.2.5'}

points = {}
for s in spec['sections']:
    for t in s['topics']:
        if t['id'] not in ROUTE_TOPICS:
            continue
        for p in t['points']:
            if p['id'] == 'AQA_GEOG_AS_3.4':
                continue
            points[p['id']] = (s, t, p)

LIST_FRONT = re.compile(r"\b(name|give|list|state|identify|outline|describe)\s+(two|three|four|five|six|several|some|the \w+ )\b|\bwhat are the (two|three|four|five|six|main)\b", re.I)
slug = lambda x: re.sub(r'[^a-z0-9]+', '-', x.lower()).strip('-')

cards, errors = [], []
for f in sorted((ROOT / 'source').glob('*.txt')):
    cur, q = None, None
    for n, line in enumerate(f.read_text(encoding='utf8').splitlines(), 1):
        where = f'{f.name}:{n}'
        if line.startswith('## '):
            parts = [x.strip() for x in line[3:].split('|')]
            if len(parts) != 2:
                errors.append(f'{where} bad heading'); cur = None; continue
            pid, st = parts
            if st not in SETS:
                errors.append(f'{where} bad deck {st}'); cur = None; continue
            if st == 'mark' and pid not in MARK_PAPERS:
                errors.append(f'{where} mark heading must be MARK_P1/MARK_P2/MARK_NEA'); cur = None; continue
            if st != 'mark' and pid not in points:
                errors.append(f'{where} unknown or off-route spec id {pid}'); cur = None; continue
            cur = (pid, st)
        elif line.startswith('Q: '):
            if q is not None:
                errors.append(f'{where} Q without A before it')
            q = line[3:].strip()
        elif line.startswith('A: '):
            if cur is None or q is None:
                errors.append(f'{where} A without heading or Q'); q = None; continue
            pid, st = cur
            cat, label = SETS[st]
            back = line[3:].strip().replace('\\n', '\n')
            if st == 'mark':
                code, ptitle = MARK_PAPERS[pid]
                c = dict(deck='mark_scheme', spec_id=None, front=q, back=back, paper=ptitle, topic='Exam technique',
                         point=None, set=st, catalogue=f'{SUBJECT}_{cat}',
                         subdeck_path=f'AQA A-level Geography 7037 – {label}::{ptitle}',
                         tags=['PPP::AQA::7037', 'PPP::Deck::mark_scheme', f'PPP::Paper::{code}',
                               'PPP::Topic::exam-technique', f'PPP::Class::{st}'])
            else:
                s, t, p = points[pid]
                code, ptitle = PAPERS[s['id']]
                c = dict(deck='atomic', spec_id=pid, front=q, back=back, paper=ptitle, topic=t['title'],
                         point=f"{p['code']} {p['title']}", set=st, catalogue=f'{SUBJECT}_{cat}',
                         subdeck_path=f"AQA A-level Geography 7037 – {label}::{ptitle}::{t['title']}::{p['code']} {p['title']}",
                         tags=[f'PPP::Spec::{pid}', 'PPP::AQA::7037', 'PPP::Deck::atomic', f'PPP::Paper::{code}',
                               f"PPP::Topic::{slug(t['title'])}", f'PPP::Class::{st}'])
            c['source'] = where
            cards.append(c)
            q = None
        elif line.strip():
            errors.append(f'{where} bad line: {line[:60]}')
    if q is not None:
        errors.append(f'{f.name}: trailing Q without A')

fr = collections.Counter(c['front'].lower() for c in cards)
errors += [f'duplicate front: {k}' for k, v in fr.items() if v > 1]
for c in cards:
    c['stable_key'] = f"ppp-geog-7037-{SETS[c['set']][0].lower()}:" + hashlib.sha256(
        f"{SETS[c['set']][0]}|{c['spec_id'] or ''}|{c['front']}".encode()).hexdigest()[:20]
    text = c['front'] + c['back']
    if '—' in text:
        errors.append(f"{c['source']} em dash: {c['front'][:60]}")
    if '$j$' in text:
        errors.append(f"{c['source']} contains $j$")
    if not c['front'] or not c['back']:
        errors.append(f"{c['source']} empty side")
    if len(c['front']) > 260:
        errors.append(f"{c['source']} long front ({len(c['front'])})")
    if c['deck'] == 'atomic':
        if len(c['back']) > 120:
            errors.append(f"{c['source']} long back ({len(c['back'])}): {c['front'][:60]}")
        if LIST_FRONT.search(c['front']):
            errors.append(f"{c['source']} list-like front: {c['front'][:80]}")
        outside = re.sub(r'\([^)]*\)', '', c['back'])
        if ';' in outside or outside.count(',') >= 3:
            errors.append(f"{c['source']} list-like back: {c['back'][:80]}")
    else:
        if not all(k in c['back'] for k in ('Model answer:', 'Marking points:', 'Common trap:')) and len(c['back']) > 120:
            errors.append(f"{c['source']} mark card is neither 3-part nor short: {c['front'][:60]}")

for st in ('content', 'evidence'):
    cov = collections.Counter(c['spec_id'] for c in cards if c['set'] == st)
    need = [p for p in points if (st == 'content' and p not in CASE_STUDY) or (st == 'evidence' and p not in SKILLS)]
    miss = [p for p in need if not cov[p]]
    if miss:
        errors.append(f'{st}: no cards for {miss}')

out = ROOT / 'out'
out.mkdir(exist_ok=True)
for st in SETS:
    json.dump([{k: v for k, v in c.items() if k != 'source'} for c in cards if c['set'] == st],
              open(out / f'{st}-set.json', 'w'), ensure_ascii=False, indent=1)
json.dump([{k: v for k, v in c.items() if k != 'source'} for c in cards], open(out / 'all-cards.json', 'w'),
          ensure_ascii=False, indent=1)

counts = collections.Counter(c['set'] for c in cards)
print('cards', dict(counts), 'total', len(cards))
print('ERRORS' if errors else 'OK', *errors[:300], sep='\n')
if len(errors) > 300:
    print(f'... and {len(errors) - 300} more')
sys.exit(1 if errors else 0)
