#!/usr/bin/env python3
"""Geography model review: write work packets and compile reviewers' line sheets.

  reviews.py prepare RESEARCH   -> RESEARCH/review-in/<PAPER>.md and spec-leaves.md
  reviews.py compile RESEARCH [GLOB] -> RESEARCH/reviews/<PAPER>.json

One line per publishable unit in RESEARCH/review-src/<PAPER>.txt (# starts a comment):

    label | primary codes [; prerequisite codes] | e/m/h | summary | difficulty basis [| FLAG: reason]

Codes are A-level 7037 specification codes (3.1.3.2, 3.4.2.4) or AS3.4 (AS fieldwork,
7036 Paper 2 only). Rules checked here, not left to the reviewer:
- every primary code is in the unit's own route (its question's optional topic, plus
  the skills checklist 3.4.x; AS Paper 2 Section B also AS3.4), so options never mix;
- AS units use only content AS 7036 shares (as_section_map) or AS3.4;
- prerequisites (crossover, synoptic links) may be any valid code;
- units excluded for copyright-removed material are not reviewed.
A FLAG column marks a line for lead review; compile refuses unresolved flags unless the
lead has replaced FLAG with LEAD: decision.
"""
import glob
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DIFF = {'e': 'easy', 'm': 'medium', 'h': 'hard'}
CODE = re.compile(r'AS3\.4|3\.[1-4](?:\.\d){1,3}')
ROUTES = {('7037', '01'): {'1': '3.1.1', '2': '3.1.2', '3': '3.1.3', '4': '3.1.4', '5': '3.1.5', '6': '3.1.6'},
          ('7037', '02'): {'1': '3.2.1', '2': '3.2.2', '3': '3.2.3', '4': '3.2.4', '5': '3.2.5'},
          ('7036', '01'): {'1': '3.1.1', '2': '3.1.3', '3': '3.1.4', '4': '3.1.5', '5': '3.2.3'},
          ('7036', '02'): {'1': '3.2.2', '2': 'AS3.4', '3': 'AS3.4', '4': 'AS3.4'}}
TOPIC = {'3.1.1': 'Water and carbon cycles', '3.1.2': 'Hot desert systems and landscapes', '3.1.3': 'Coastal systems and landscapes',
         '3.1.4': 'Glacial systems and landscapes', '3.1.5': 'Hazards', '3.1.6': 'Ecosystems under stress',
         '3.2.1': 'Global systems and global governance', '3.2.2': 'Changing places', '3.2.3': 'Contemporary urban environments',
         '3.2.4': 'Population and the environment', '3.2.5': 'Resource security', 'AS3.4': 'AS fieldwork enquiry and skills'}


def leaf_id(code):
    return 'AQA_GEOG_AS_3.4' if code == 'AS3.4' else f'AQA_GEOG_{code}'


def spec():
    return json.loads((REPO / 'data/specs/AQA_ALEVEL_GEOG_7037.json').read_text())


def papers():
    out = {}
    for q in ('7037', '7036'):
        for p in json.loads((REPO / f'data/imports/geography/inventory/{q}-inventory.json').read_text())['papers']:
            out[p['paper_id']] = p
    return out


def excluded_labels(research, paper):
    sys.path.insert(0, str(Path(__file__).parent))
    from figures import index_insert
    from resolve import resolve
    cand = json.loads((research / 'candidates' / f"{paper['paper_id']}.json").read_text())
    idx = index_insert(research / 'sources' / paper['insert']['file_name']) if paper['insert'] else None
    res = resolve(cand, idx)
    return cand, res, {l for l, r in res.items() if r['removed'] or r['text_removed']}


def allowed(paper, unit):
    route = ROUTES[(paper['qualification_code'], paper['component'])][unit['question']]
    return route


def code_ok(code, route, as_codes, is_as):
    if code == 'AS3.4':
        return route == 'AS3.4'
    if is_as and leaf_id(code) not in as_codes:
        return False
    return code.startswith(route + '.') or code.startswith('3.4.')


def prepare(research):
    sp = spec()
    lines = ['# AQA Geography 7037 specification leaves (code | title | route)', '']
    for s in sp['sections']:
        for t in s['topics']:
            lines.append(f"## {t['code']} {t['title']} ({t.get('route', '')})")
            for p in t['points']:
                code = 'AS3.4' if p['id'] == 'AQA_GEOG_AS_3.4' else p['code']
                as_note = f" [AS {p['as_reference']['section']}]" if p.get('as_reference') else ''
                lines.append(f"- {code} | {p['title']}{as_note}: {' '.join(p['content'])[:700]}")
            lines.append('')
    (research / 'review-in').mkdir(parents=True, exist_ok=True)
    (research / 'review-in' / 'spec-leaves.md').write_text('\n'.join(lines))
    import pdfplumber
    from schemes import scheme_regions
    for pid, paper in papers().items():
        cand, res, excluded = excluded_labels(research, paper)
        ms_path = research / 'sources' / paper['documents']['mark_scheme']['file_name']
        regions = scheme_regions(ms_path, [u['label'] for u in cand['units']])
        scheme_text = {}
        with pdfplumber.open(ms_path) as ms:
            for label, regs in regions.items():
                parts = []
                for r in regs:
                    page = ms.pages[r['page'] - 1]
                    l, t, rr, b = r['bbox']
                    parts.append(page.crop((l * page.width, t * page.height, rr * page.width, b * page.height)).extract_text() or '')
                scheme_text[label] = re.sub(r'\s+', ' ', ' '.join(parts))[:900]
        is_as = paper['is_as']
        out = [f"# {pid} · {'AS 7036' if is_as else 'A-level 7037'} Paper {paper['assessment_paper']}: {paper['component_title']}",
               f"# {paper['series']} {paper['year'] or ''} · {paper['max_marks']} marks", '']
        for number, stem in cand.get('stems', {}).items():
            out.append(f"## Shared stem for question {number} (context, not scored)\n{stem['text']}\n")
        for u in cand['units']:
            route = allowed(paper, u)
            if u['label'] in excluded:
                out.append(f"## {u['label']} EXCLUDED (copyright-removed source) - do not review\n")
                continue
            figs = ', '.join(f"{e['figure']} ({e['source']})" for e in res[u['label']]['figures']) or 'none'
            out.append(f"## {u['label']} · {u['marks']} marks · route {route} {TOPIC[route]} · figures: {figs}")
            out.append(u['text'])
            out.append(f"[Official scheme excerpt] {scheme_text.get(u['label'], '')}")
            out.append('')
        (research / 'review-in' / f'{pid}.md').write_text('\n'.join(out))
        print(pid, len(cand['units']) - len(excluded), 'to review,', len(excluded), 'excluded')


def compile_sheet(sheet, paper, cand, excluded, valid, as_codes):
    out = {}
    units = {u['label']: u for u in cand['units']}
    for n, raw in enumerate(sheet.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        cells = [c.strip() for c in line.split('|')]
        if len(cells) not in (5, 6):
            raise ValueError(f'{sheet.name}:{n}: expected 5 or 6 fields, got {len(cells)}')
        label, tags, diff, summary, basis = cells[:5]
        note = cells[5] if len(cells) == 6 else ''
        if note.startswith('FLAG'):
            raise ValueError(f'{sheet.name}:{n}: unresolved lead-review flag: {note}')
        unit = units.get(label)
        if unit is None or label in excluded:
            raise ValueError(f'{sheet.name}:{n}: {label} is not a publishable unit')
        main, _, pre = tags.partition(';')
        primary, prereq = CODE.findall(main), CODE.findall(pre)
        route = allowed(paper, unit)
        if not primary or any(leaf_id(c) not in valid for c in primary + prereq):
            raise ValueError(f'{sheet.name}:{n}: unknown or missing codes in "{tags}"')
        bad = [c for c in primary if not code_ok(c, route, as_codes, paper['is_as'])]
        if bad:
            raise ValueError(f'{sheet.name}:{n}: {label} primary {bad} outside route {route}')
        if paper['is_as'] and any(leaf_id(c) not in as_codes for c in prereq):
            raise ValueError(f'{sheet.name}:{n}: AS prerequisite outside AS content')
        if diff not in DIFF or not summary or not basis:
            raise ValueError(f'{sheet.name}:{n}: difficulty must be e/m/h with summary and basis')
        if label in out:
            raise ValueError(f'{sheet.name}:{n}: {label} reviewed twice')
        out[label] = {'label': label, 'sections': primary, 'prerequisites': [c for c in prereq if c not in primary],
                      'difficulty': DIFF[diff], 'summary': summary, 'difficulty_basis': basis,
                      'review_status': 'model_reviewed', **({'lead_note': note} if note else {})}
    publishable = [u['label'] for u in cand['units'] if u['label'] not in excluded]
    if set(out) != set(publishable):
        raise ValueError(f'{sheet.name}: missing {sorted(set(publishable) - set(out))}, extra {sorted(set(out) - set(publishable))}')
    return [out[l] for l in publishable]


def compile_all(research, pattern='*.txt'):
    sp = spec()
    valid = {p['id'] for s in sp['sections'] for t in s['topics'] for p in t['points']}
    as_codes = set(sp['as_section_map'].values())
    allp = papers()
    for sheet in sorted((research / 'review-src').glob(pattern)):
        paper = allp[sheet.stem]
        cand, _, excluded = excluded_labels(research, paper)
        review = {'paper_id': sheet.stem, 'reviewer_type': 'model', 'review_status': 'model_reviewed',
                  'source_sha256': cand['source_sha256'],
                  'tagging_basis': 'AQA 7037 specification codes; AS units mapped to the matching A-level leaf',
                  'units': compile_sheet(sheet, paper, cand, excluded, valid, as_codes)}
        target = research / 'reviews' / f'{sheet.stem}.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(review, ensure_ascii=False, indent=1) + '\n')
        print(sheet.stem, len(review['units']), 'units reviewed')


if __name__ == '__main__':
    research = Path(sys.argv[2])
    if sys.argv[1] == 'prepare':
        prepare(research)
    else:
        compile_all(research, sys.argv[3] if len(sys.argv) > 3 else '*.txt')
