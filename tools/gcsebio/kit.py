"""Review kit: reuse model tags for identical printed parts, list the rest, compile sheets.

mine/<pid>.txt lines:  Q part | codes[; prereqs] | kind | summary [| e/m/h override]
kind: r recall/identify, a apply/interpret, c calculation, p practical/method, x extended/evaluate
"""
import json, os, re, sys, hashlib
from pathlib import Path
REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'tools' / 'gcsebio'))
R = Path(os.environ.get('GCSEBIO_RESEARCH', REPO.parent / 'gcsebio-research'))
KIND = {'r': 'recall or identification', 'a': 'application or data interpretation', 'c': 'calculation',
        'p': 'practical method or planning', 'x': 'extended explanation or evaluation'}
SPEC = {}
for q, sid, pre in (('1BI0', 'EDX_GCSE_BIOL_1BI0', 'EDX_GCSE_BIOL_OFF_'), ('1SC0', 'EDX_GCSE_COMBSCI_1SC0', 'EDX_GCSE_COMBSCI_BIO_')):
    d = json.load(open(REPO / 'data' / 'specs' / f'{sid}.json'))
    SPEC[q] = {p['code']: p for s in d['sections'] for t in s['topics'] for p in t['points'] if p['id'].startswith(pre)}


def part_texts(pid):
    import pdfplumber
    from sheet import part_text
    from extract import CropView
    cand = json.load(open(R / 'candidates' / f'{pid}.json'))
    out = []
    with pdfplumber.open(R / cand['source_file']) as pdf:
        views = [CropView(p) for p in pdf.pages]
        for q in cand['questions']:
            first = q['regions'][0]
            prev = (first['page'], first['bbox'][1] * views[first['page'] - 1].height)
            for p in q['parts']:
                t = part_text(views, {}, q['regions'], prev, (p['page'], p['bottom'] + 2))
                prev = (p['page'], p['bottom'] + 3)
                out.append((q['number'], p['part_label'], p['marks'], t))
    return out


def key(text, marks):
    t = re.sub(r'(Figure|Fig\.?|Table)\s*\d+', ' ', text, flags=re.I)
    toks = re.findall(r'[a-z]+', t.lower())
    return hashlib.sha1((' '.join(toks[-30:]) + f'|{marks}').encode()).hexdigest()[:16]


def plabel(tok):
    tok = tok.strip().replace('(', '').replace(')', '')
    if tok in ('-', ''): return ''
    m = re.fullmatch(r'([a-h]?)((?:i|ii|iii|iv|v|vi|vii|viii)?)', tok)
    return ''.join(f'({x})' for x in m.groups() if x)


def load_mine(pid):
    f = R / 'mine' / f'{pid}.txt'
    out = {}
    if not f.exists(): return out
    for line in f.read_text().splitlines():
        if not line.strip() or line.startswith('#'): continue
        c = [x.strip() for x in line.split('|')]
        qn, part = c[0].split(None, 1) if ' ' in c[0] else (c[0], '-')
        out[(qn, plabel(part))] = {'codes': c[1], 'kind': c[2], 'summary': c[3], 'diff': c[4] if len(c) > 4 else ''}
    return out


def memory(exclude=None):
    mem = {}
    for f in sorted((R / 'mine').glob('*.txt')):
        pid = f.stem
        if pid == exclude: continue
        cache = R / 'texts' / f'{pid}.json'
        if not cache.exists(): continue
        texts = json.load(open(cache))
        mine = load_mine(pid)
        for qn, lab, marks, t in texts:
            e = mine.get((qn, lab))
            if e: mem.setdefault(key(t, marks), e)
    return mem


def texts(pid):
    cache = R / 'texts' / f'{pid}.json'
    if not cache.exists():
        cache.parent.mkdir(exist_ok=True)
        json.dump(part_texts(pid), open(cache, 'w'))
    return [tuple(x) for x in json.load(open(cache))]


def valid(codes, qual):
    c = re.findall(r'\b\d\.\d{1,2}[Bb]?\b', codes)
    return c and all(x.upper() in SPEC[qual] for x in c)


def todo(pid, width=230):
    qual = pid.split('_')[1]
    mem, mine = memory(pid), load_mine(pid)
    for qn, lab, marks, t in texts(pid):
        if (qn, lab) in mine: continue
        e = mem.get(key(t, marks))
        if e and valid(e['codes'], qual): continue
        print(f'{qn} {lab or "-"} ({marks}) ' + t[-width:].replace(chr(10), ' '))


def difficulty(kind, marks, tier, qn, nq):
    s = {'r': 0, 'a': 1, 'c': 1, 'p': 1, 'x': 2}[kind]
    s += (marks >= 3) + (marks >= 5)
    s += tier == 'Higher'
    s += int(qn) > nq * 0.6
    return 'easy' if s <= 1 else 'medium' if s <= 3 else 'hard'


def compile(pid):
    qual, tier = pid.split('_')[1], 'Higher' if pid.endswith('H') else 'Foundation'
    mem, mine = memory(pid), load_mine(pid)
    tx = texts(pid)
    nq = len({x[0] for x in tx})
    lines, missing, reused = [], [], 0
    for qn, lab, marks, t in tx:
        e = mine.get((qn, lab))
        if not e:
            e = mem.get(key(t, marks))
            if e and not valid(e['codes'], qual): e = None
            if e: reused += 1
        if not e:
            missing.append((qn, lab)); continue
        if tier == 'Foundation' and any(SPEC[qual][x.upper()].get('tier') == 'Higher' for x in re.findall(r'\b\d\.\d{1,2}[Bb]?\b', e['codes'])):
            raise SystemExit(f'{pid} Q{qn}{lab}: Higher-only code on a Foundation unit {e["codes"]!r}')
        if not valid(e['codes'], qual):
            raise SystemExit(f'{pid} Q{qn}{lab}: invalid codes {e["codes"]!r}')
        d = {'e': 'easy', 'm': 'medium', 'h': 'hard'}.get(e['diff']) or difficulty(e['kind'], marks, tier, qn, nq)
        basis = f"{marks}-mark {KIND[e['kind']]} on the {tier} paper" + (' (later, harder question)' if int(qn) > nq * .6 else '')
        if e['diff']: basis += '; difficulty adjusted on review'
        lines.append(f"{qn} | {lab.replace('(', '').replace(')', '') or '-'} | {e['codes']} | {d[0]} | {e['summary']} | {basis}")
    if missing:
        raise SystemExit(f'{pid}: {len(missing)} parts not reviewed: {missing[:6]}')
    (R / 'review-src').mkdir(exist_ok=True)
    (R / 'review-src' / f'{pid}.txt').write_text('\n'.join(lines) + '\n')
    print(pid, len(lines), 'units', reused, 'reused')


if __name__ == '__main__':
    cmd = sys.argv[1]
    args = [a for a in sys.argv[2:] if not a.isdigit()]
    w = [int(a) for a in sys.argv[2:] if a.isdigit()]
    for pid in args:
        if cmd == 'todo': todo(pid, *(w[:1]))
        else: compile(pid)
