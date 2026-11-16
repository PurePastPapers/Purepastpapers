#!/usr/bin/env python3
"""Psychology model review: write work packets and compile line sheets.

  reviews.py prepare RESEARCH        -> RESEARCH/review-in/<PAPER>.md
  reviews.py compile RESEARCH [ID..] -> RESEARCH/reviews/<PAPER>.json

One line per in-route unit in RESEARCH/review-src/<PAPER>.txt (# starts a comment):

    label | codes [; prerequisite codes] | e/m/h | summary | difficulty basis [| KEY: value ...]

Codes are "<section>/<bullet>" of the v1.4 specification (4.1.1/2, 4.2.3.1/9). Optional
trailing fields:
  EXCLUDE: reason   the unit needs content the v1.4 specification no longer includes
                    (owner decision 16 Nov 2026); no codes are given ("-").
  CTX: 5,6 | CTX: none   override the extractor's earlier-unit context.
  DEP: 7               the unit builds on the answer to an earlier unit (dependency gate).
  NOTE: text           lead note kept on the unit.

Rules checked here, not left to the reviewer:
- Paper 3 option units are reviewed only for the owner's route (Cognition and
  development, Schizophrenia, Forensic psychology); other options are out of route;
- a Paper 3 option unit's primary codes are its option or research methods (4.2.3.x);
  Section A units are issues and debates or research methods;
- AS 7181 units use only codes that the AS specification shares;
- every in-route unit has exactly one line. Reviewer type is always "model".
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DIFF = {'e': 'easy', 'm': 'medium', 'h': 'hard'}
CODE = re.compile(r'^4\.\d\.\d+(?:\.\d)?/\d{1,2}$')
ROUTE_TOPICS = {'cognition and development': '4.3.4', 'schizophrenia': '4.3.5', 'forensic psychology': '4.3.9'}


def leaf_id(code):
    section, bullet = code.split('/')
    return f'AQA_PSYCH_{section}_b{bullet}'


def spec():
    return json.loads((REPO / 'data/specs/AQA_ALEVEL_PSYCH_7182.json').read_text())


def papers():
    out = {}
    for q in ('7182', '7181'):
        for p in json.loads((REPO / f'data/imports/psychology/inventory/{q}-inventory.json').read_text())['papers']:
            out[p['paper_id']] = p
    return out


def route_of(paper, unit):
    """Option code for Paper 3 option units, 'A' for Paper 3 Section A, None otherwise; False = out of route."""
    if paper['qualification_code'] != '7182' or paper['component'] != '03':
        return None
    if unit['section'] == 'A':
        return 'A'
    return ROUTE_TOPICS.get((unit['topic'] or '').strip().lower(), False)


def short(text, n=420):
    text = re.sub(r'\s+', ' ', text)
    return text if len(text) <= n else text[:150] + ' … ' + text[-(n - 150):]


def prepare(research):
    import pdfplumber
    sys.path.insert(0, str(Path(__file__).parent))
    from schemes import scheme_regions
    (research / 'review-in').mkdir(parents=True, exist_ok=True)
    for pid, paper in papers().items():
        cand = json.loads((research / 'candidates' / f'{pid}.json').read_text())
        ms_path = research / 'sources' / paper['documents']['mark_scheme']['file_name']
        regions = scheme_regions(ms_path, [u['label'] for u in cand['units']])
        scheme_text = {}
        with pdfplumber.open(ms_path) as ms:
            for label in [u['label'] for u in cand['units']]:
                parts = []
                for r in regions[label]:
                    page = ms.pages[r['page'] - 1]
                    l, t, rr, b = r['bbox']
                    parts.append(page.crop((l * page.width, t * page.height, rr * page.width, b * page.height)).extract_text() or '')
                txt = re.sub(r'\s+', ' ', ' '.join(parts))
                m = re.search(r'(Possible content|Content|Credit|Marks for this question)[:\s].{0,260}', txt)
                scheme_text[label] = m.group(0) if m else txt[:260]
        out = [f"# {pid} · {'AS 7181' if paper['is_as'] else 'A-level 7182'} Paper {paper['assessment_paper']}: "
               f"{paper['component_title']} · {paper['series']} {paper['year'] or ''}", '']
        for it in cand['items']:
            out.append(f"ITEM {it['id']} serves {','.join(it['serves'])}: {short(it['text'], 300)}")
        for q, st in cand['stems'].items():
            out.append(f"STEM {q}: {short(st['text'], 300)}")
        for u in cand['units']:
            r = route_of(paper, u)
            if r is False:
                continue
            extra = []
            if u.get('context_units'):
                extra.append('ctx ' + ','.join(u['context_units']))
            if u.get('answer_reference'):
                extra.append('ANSREF "' + u['answer_reference'] + '"')
            out.append(f"## {u['label']} [{u['marks']}] {u['section']}{'/' + u['topic'] if u['topic'] else ''} {' '.join(extra)}")
            out.append(short(u['text']))
            out.append(f"  MS: {scheme_text[u['label']][:200]}")
        (research / 'review-in' / f'{pid}.md').write_text('\n'.join(out) + '\n')
        print(pid, sum(1 for u in cand['units'] if route_of(paper, u) is not False), 'units')


def compile_reviews(research, only=None):
    sp = spec()
    leaves = {p['id']: p for s in sp['sections'] for t in s['topics'] for p in t['points']}
    as_ok = set(sp['as_section_map'].values())
    (research / 'reviews').mkdir(parents=True, exist_ok=True)
    problems = []
    for pid, paper in papers().items():
        if only and pid not in only:
            continue
        src = research / 'review-src' / f'{pid}.txt'
        if not src.exists():
            continue
        cand = json.loads((research / 'candidates' / f'{pid}.json').read_text())
        units = {u['label']: u for u in cand['units']}
        in_route = [u['label'] for u in cand['units'] if route_of(paper, u) is not False]
        out, seen = [], set()
        for n, raw in enumerate(src.read_text().splitlines(), 1):
            line = raw.split('#', 1)[0].strip() if not raw.lstrip().startswith('#') else ''
            if not line:
                continue
            cols = [c.strip() for c in line.split('|')]
            label = cols[0]
            where = f'{pid}:{n} ({label})'
            if label not in units or label in seen:
                problems.append(f'{where}: unknown or repeated label')
                continue
            seen.add(label)
            u = units[label]
            r = route_of(paper, u)
            if r is False:
                problems.append(f'{where}: out-of-route option unit')
                continue
            extra = {}
            for c in cols[5:]:
                k, _, v = c.partition(':')
                extra[k.strip().upper()] = v.strip()
            rec = {'label': label, 'marks': u['marks']}
            if 'EXCLUDE' in extra:
                rec['excluded'] = extra['EXCLUDE']
                out.append(rec)
                continue
            if len(cols) < 5:
                problems.append(f'{where}: expected 5 columns')
                continue
            prim, _, pre = cols[1].partition(';')
            prim = [c.strip() for c in prim.split(',') if c.strip()]
            pre = [c.strip() for c in pre.split(',') if c.strip()]
            bad = [c for c in prim + pre if not CODE.match(c) or leaf_id(c) not in leaves]
            if bad or not prim:
                problems.append(f'{where}: bad codes {bad or "none"}')
                continue
            if r == 'A' and not all(c.startswith(('4.3.1/', '4.2.3')) for c in prim):
                problems.append(f'{where}: Section A primary must be issues and debates or research methods')
            if r not in (None, 'A') and not all(c.startswith((r + '/', '4.2.3')) for c in prim):
                problems.append(f'{where}: option primary must be {r} or research methods')
            if paper['is_as'] and not all(leaf_id(c) in as_ok for c in prim):
                problems.append(f'{where}: AS unit tagged to A-level-only content {[c for c in prim if leaf_id(c) not in as_ok]}')
            if cols[2] not in DIFF:
                problems.append(f'{where}: difficulty must be e/m/h')
                continue
            rec.update({'sections': prim, 'prerequisites': pre, 'difficulty': DIFF[cols[2]], 'summary': cols[3],
                        'difficulty_basis': cols[4]})
            if 'CTX' in extra:
                rec['context_units'] = [] if extra['CTX'].lower() == 'none' else [x.strip() for x in extra['CTX'].split(',')]
            if 'DEP' in extra:
                rec['depends_on'] = [x.strip() for x in extra['DEP'].split(',')]
            for key in ('CTX', 'DEP'):
                for x in rec.get('context_units' if key == 'CTX' else 'depends_on', []):
                    if x not in units or list(units).index(x) >= list(units).index(label):
                        problems.append(f'{where}: {key} {x} is not an earlier unit')
            if 'NOTE' in extra:
                rec['lead_note'] = extra['NOTE']
            out.append(rec)
        missing = [l for l in in_route if l not in seen]
        if missing:
            problems.append(f'{pid}: missing lines for {missing}')
        review = {'paper_id': pid, 'reviewer_type': 'model', 'review_status': 'model_reviewed',
                  'source_sha256': cand['source_sha256'], 'units': out}
        (research / 'reviews' / f'{pid}.json').write_text(json.dumps(review, ensure_ascii=False, indent=1) + '\n')
    for p in problems:
        print('PROBLEM', p)
    print(len(problems), 'problems')
    return not problems


if __name__ == '__main__':
    cmd, research = sys.argv[1], Path(sys.argv[2]).resolve()
    if cmd == 'prepare':
        prepare(research)
    else:
        sys.exit(0 if compile_reviews(research, sys.argv[3:]) else 1)
