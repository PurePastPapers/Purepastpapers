#!/usr/bin/env python3
"""Build the official chemistry statement trees for 1CH0 and the chemistry part of 1SC0.

Sources (the build refuses any other revision):
  1CH0 Issue 4 (March 2024), content pages 15-44: 237 numbered statements.
  1SC0 Issue 6 (March 2024), chemistry content pages 37-57: 171 statements.

Pearson prints Higher-only content in bold; a "C" suffix (5.8C) marks a statement that
is in separate Chemistry only (all of Topics 5 and 9). Every 1SC0 chemistry statement has
the same code as its 1CH0 statement. Codes are strings (1.1, 1.10 and 1.11 are distinct).

Runtime leaves: EDX_GCSE_CHEM_OFF_<code> (1CH0) and EDX_GCSE_COMBSCI_CHEM_<code> (1SC0).
Topics keep their earlier runtime ids (EDX_GCSE_CHEM_C1..C9, EDX_GCSE_COMBSCI_C1..C8).
The earlier unverified leaves (EDX_GCSE_CHEM_C1_1.1 ...) become legacy_ids that expand
to the official statements they covered, so saved ticks keep their meaning. The 1SC0
biology and physics sections are left exactly as they are.

    python3 tools/gcsechem/build_spec.py <research>/spec
"""
import hashlib, json, re, sys
from pathlib import Path
from spec_parse import parse

ROOT = Path(__file__).resolve().parents[2]
BASE = 'https://qualifications.pearson.com/content/dam/pdf/GCSE/Science/2016/Specification/'
SOURCES = {
    '1CH0': {'file': 'gcse-chemistry-spec.pdf', 'sha': 'ece75263101c146352be0d59da9936bb76e7cf3899a7994e7746944006c32bcf',
             'pages': (15, 44), 'issue': 'Issue 4', 'issue_date': 'March 2024'},
    '1SC0': {'file': 'gcse-combinedscience-spec.pdf', 'sha': '0ededb98f1aa079e2fa0f4eb9e5b6a8dacd5eb0807aaaaf9936ac3773bd5583c',
             'pages': (37, 57), 'issue': 'Issue 6', 'issue_date': 'March 2024'},
}
TOPICS = {1: 'Key concepts in chemistry', 2: 'States of matter and mixtures', 3: 'Chemical changes',
          4: 'Extracting metals and equilibria', 5: 'Separate chemistry 1', 6: 'Groups in the periodic table',
          7: 'Rates of reaction and energy changes', 8: 'Fuels and Earth science', 9: 'Separate chemistry 2'}
# Earlier unverified runtime leaves were the spec's sub-headings; each covered the statements
# from its first code up to the next sub-heading (checked against the printed sub-headings).
HEADINGS = {'1_1.1': '1.1', '1_1.2': '1.13', '1_1.3': '1.21', '1_1.4': '1.28', '1_1.5': '1.32', '1_1.6': '1.43',
            '2_2.1': '2.1', '2_2.2': '2.5', '3_3.1': '3.1', '3_3.2': '3.22', '4_4.1': '4.1', '4_4.2': '4.13',
            '5_5.1': '5.1C', '5_5.2': '5.8C', '5_5.3': '5.19C', '5_5.4': '5.25C',
            '6_6.1': '6.1', '6_6.2': '6.6', '6_6.3': '6.14', '7_7.1': '7.1', '7_7.2': '7.9',
            '8_8.1': '8.1', '8_8.2': '8.18', '9_9.1': '9.1C', '9_9.2': '9.10C', '9_9.3': '9.35C'}
# Superscripts in the PDF text layer come out of order; these are the printed wordings.
TEXT_FIX = {
    '1.41': 'Describe the limitations of particular representations and models, to include dot and cross, ball and stick models and two- and three-dimensional representations',
    '1.43': 'Calculate: a relative formula mass given relative atomic masses b percentage by mass of an element in a compound given relative atomic masses',
    '5.8C': 'Calculate the concentration of solutions in mol dm–3 and convert concentration in g dm–3 into mol dm–3 and vice versa',
    '1.38': 'Explain the properties of fullerenes including C60 and graphene in terms of their structures and bonding',
    '1.48': 'Calculate masses of reactants and products from balanced equations, given the mass of one substance',
    '1.49': 'Calculate the concentration of solutions in g dm–3',
    '5.16C': 'Describe the molar volume, of any gas at room temperature and pressure, as the volume occupied by one mole of molecules of any gas at room temperature and pressure (The molar volume will be provided as 24 dm3 or 24000 cm3 in calculations where it is required)',
    '7.14': 'Calculate the energy change in a reaction given the energies of bonds (in kJ mol–1)',
}


def legacy_map(codes):
    order = list(codes)
    firsts = sorted(HEADINGS.items(), key=lambda kv: order.index(kv[1]))
    out = {}
    for i, (k, first) in enumerate(firsts):
        a = order.index(first)
        b = order.index(firsts[i + 1][1]) if i + 1 < len(firsts) else len(order)
        out[k] = order[a:b]
    return out


def short(text):
    t = re.split(r',? including:|:\s+a\s|, including\b| \(| – ', text)[0].strip().rstrip('.,;')
    return t if len(t) <= 96 else t[:93].rsplit(' ', 1)[0] + '…'


def point(qual, prefix, s):
    tiers = ['Higher'] if s['higher_only'] else ['Foundation', 'Higher']
    text = TEXT_FIX.get(s['code'], s['text'])
    p = {'id': prefix + s['code'], 'code': s['code'], 'title': short(text), 'full_text': text,
         'official_reference': {'reference_id': f"{qual}-{SOURCES[qual]['issue'].upper().replace(' ', '')}-{s['code']}",
                                'code': s['code'], 'topic': s['topic'], 'source_pages': [s['page']], 'tiers': tiers,
                                'papers': ['1', '2'] if s['topic'] == 1 else (['1'] if s['topic'] <= 5 else ['2']),
                                'chemistry_only': s['chemistry_only'],
                                **({'higher_extension': True} if s['higher_extension'] else {})}}
    if s['higher_only']:
        p['tier'] = 'Higher'
    return p


def official(qual, spec_dir):
    src = SOURCES[qual]
    path = spec_dir / src['file']
    if hashlib.sha256(path.read_bytes()).hexdigest() != src['sha']:
        raise SystemExit(f'{path} is not the recorded {qual} specification revision')
    return parse(str(path), src['pages'])


def source_record(qual, extra):
    src = SOURCES[qual]
    return {'url': BASE + src['file'], 'sha256': src['sha'], 'issue': src['issue'], 'issue_date': src['issue_date'],
            'content_pages': list(src['pages']), 'verified_at': '2026-11-17', **extra}


def main():
    spec_dir = Path(sys.argv[1])
    chem, comb = official('1CH0', spec_dir), official('1SC0', spec_dir)
    assert len(chem) == 237 and len(comb) == 171, (len(chem), len(comb))
    ccodes = {s['code']: s for s in chem}
    for s in comb:
        c = ccodes[s['code']]
        assert not c['chemistry_only'] and c['higher_only'] == s['higher_only'], s['code']
    assert {s['code'] for s in comb} == {c for c, s in ccodes.items() if not s['chemistry_only']}
    legacy_codes = legacy_map(ccodes)
    assert sum(len(v) for v in legacy_codes.values()) == len(chem)

    # 1CH0
    path = ROOT / 'data/specs/EDX_GCSE_CHEM_1CH0.json'
    old = json.loads(path.read_text())
    old_leaves = set(old.get('legacy_ids') or {}) or {p['id'] for sec in old['sections'] for t in sec['topics'] for p in t['points']}
    groups = [('EDX_GCSE_CHEM_SEC_KEY', 'Both papers', [1]), ('EDX_GCSE_CHEM_SEC_P1', 'Paper 1', [2, 3, 4, 5]),
              ('EDX_GCSE_CHEM_SEC_P2', 'Paper 2', [6, 7, 8, 9])]
    pre = 'EDX_GCSE_CHEM_OFF_'
    sections = [{'id': sid, 'title': title, 'topics': [
        {'id': f'EDX_GCSE_CHEM_C{n}', 'code': str(n), 'title': f'Topic {n} – {TOPICS[n]}',
         'points': [point('1CH0', pre, s) for s in chem if s['topic'] == n]} for n in nums]} for sid, title, nums in groups]
    legacy = {f'EDX_GCSE_CHEM_C{k.split("_")[0]}_{k.split("_")[1]}': [pre + c for c in v] for k, v in legacy_codes.items()}
    assert set(legacy) == old_leaves, old_leaves ^ set(legacy)
    out = {'subject_id': 'EDX_GCSE_CHEM_1CH0', 'specification_version': 'pearson-1ch0-issue4-2024-03',
           'official_source_url': BASE + SOURCES['1CH0']['file'], 'order_status': 'verified',
           'official_source': source_record('1CH0', {
               'title': 'Pearson Edexcel Level 1/Level 2 GCSE (9-1) in Chemistry (1CH0) specification', 'first_certification': 2018,
               'tiers': {'Foundation': 'Grades 1-5', 'Higher': 'Grades 4-9 (Higher-only content printed in bold)'},
               'components': {c: {'title': f"Paper {c[0]} {'Foundation' if c[1] == 'F' else 'Higher'}", 'marks': 100, 'minutes': 105,
                                  'topics': [1, 2, 3, 4, 5] if c[0] == '1' else [1, 6, 7, 8, 9]} for c in ('1F', '1H', '2F', '2H')},
               'notes': f"{len(chem)} statements; {sum(s['higher_only'] for s in chem)} Higher-only (tier \"Higher\"); "
                        f"{sum(s['chemistry_only'] for s in chem)} separate-Chemistry only (code suffix C)."}),
           'legacy_ids': legacy, 'point_order': [p['id'] for sec in sections for t in sec['topics'] for p in t['points']],
           'sections': sections}
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')

    # 1SC0: replace the chemistry section only.
    path = ROOT / 'data/specs/EDX_GCSE_COMBSCI_1SC0.json'
    spec = json.loads(path.read_text())
    csec = next(s for s in spec['sections'] if s['id'] == 'EDX_GCSE_COMBSCI_SEC_CHEM')
    is_old = lambda k: k.startswith('EDX_GCSE_COMBSCI_C') and not k.startswith('EDX_GCSE_COMBSCI_CHEM_')
    old_leaves = {k for k in (spec.get('legacy_ids') or {}) if is_old(k)} or {p['id'] for t in csec['topics'] for p in t['points']}
    pre = 'EDX_GCSE_COMBSCI_CHEM_'
    csec['title'] = 'Chemistry'
    nums = [1, 2, 3, 4, 6, 7, 8]
    csec['topics'] = [{'id': f'EDX_GCSE_COMBSCI_C{n}', 'code': f'C{n}', 'title': f'Chemistry Topic {n} – {TOPICS[n]}',
                       'points': [point('1SC0', pre, s) for s in comb if s['topic'] == n]} for n in nums]
    comb_codes = {s['code'] for s in comb}
    legacy = {}
    for k, v in legacy_codes.items():
        old_id = f'EDX_GCSE_COMBSCI_C{k.split("_")[0]}_{k.split("_")[1]}'
        if old_id in old_leaves:
            legacy[old_id] = [pre + c for c in v if c in comb_codes]
            assert legacy[old_id], old_id
    assert set(legacy) == old_leaves, old_leaves - set(legacy)
    spec['legacy_ids'] = {**{k: v for k, v in (spec.get('legacy_ids') or {}).items() if not is_old(k)}, **legacy}
    srcs = spec.setdefault('official_sources', {})
    srcs['chemistry'] = source_record('1SC0', {
        'title': 'Pearson Edexcel Level 1/Level 2 GCSE (9-1) in Combined Science (1SC0) specification, chemistry content',
        'first_certification': 2018,
        'components': {c: {'title': f"Chemistry Paper {c[0]} {'Foundation' if c[2] == 'F' else 'Higher'}", 'marks': 60, 'minutes': 70,
                           'topics': [1, 2, 3, 4] if c[0] == '1' else [1, 6, 7, 8]} for c in ('1CF', '1CH', '2CF', '2CH')},
        'notes': f"{len(comb)} chemistry statements, numbered as in 1CH0; {sum(s['higher_only'] for s in comb)} Higher-only."})
    spec['chemistry_order_status'] = 'verified'
    path.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    # Hidden demo questions move to the official leaves their old tags covered.
    for sid, legacy_map_ in (('EDX_GCSE_CHEM_1CH0', out['legacy_ids']), ('EDX_GCSE_COMBSCI_1SC0', spec['legacy_ids'])):
        qpath = ROOT / 'data/questions' / f'{sid}.json'
        data = json.loads(qpath.read_text())
        for q in (data if isinstance(data, list) else data['questions']):
            for key in ('primary_spec_points', 'crossover_spec_points'):
                q[key] = list(dict.fromkeys(x for t in q.get(key, []) for x in legacy_map_.get(t, [t])))
            q['crossover_spec_points'] = [t for t in q['crossover_spec_points'] if t not in q['primary_spec_points']]
        qpath.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print('1CH0', len(chem), '1SC0 chemistry', len(comb))


if __name__ == '__main__':
    main()
