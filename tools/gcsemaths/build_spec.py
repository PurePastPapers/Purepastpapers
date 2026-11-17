#!/usr/bin/env python3
"""Build data/specs/EDX_GCSE_MATH_1MA1.json from Pearson's official 1MA1 specification.

Source: Pearson Edexcel Level 1/Level 2 GCSE (9-1) in Mathematics (1MA1),
Issue 2, June 2015 (the build refuses any other revision). The specification
lists the content twice: Foundation tier (printed pages 5-11) and Higher tier
(printed pages 12-20); Higher-only content is in bold. Codes N1-N16, A1-A25,
R1-R16, G1-G25, P1-P9 and S1-S6 are the runtime leaves (EDX_GCSE_MATH_<code>).

* A statement absent from the Foundation list is Higher-only (tier "Higher").
* A statement in both lists keeps both printed wordings; where the Higher
  wording is longer it is marked higher_extension (the extra text is Higher-only).
* Sections reuse the earlier runtime topic ids (EDX_GCSE_MATH_NUM ...). The
  earlier unverified leaves (EDX_GCSE_MATH_NUM_1.1 ...) become legacy_ids that
  expand to official statements, so saved learned ticks keep their meaning.

    python3 tools/gcsemaths/build_spec.py ../gcse-maths-research/spec/spec.pdf
"""
import hashlib, json, re, sys
from pathlib import Path
import pdfplumber

SHA = 'c30745f274663c5f910e3706ea836c6f7e95e0a00ff38eac860622232ed84f8b'
URL = 'https://qualifications.pearson.com/content/dam/pdf/GCSE/mathematics/2015/specification-and-sample-assesment/gcse-maths-2015-specification.pdf'
ROOT = Path(__file__).resolve().parents[2]
FOUNDATION_PAGES, HIGHER_PAGES = range(17, 24), range(24, 33)  # 1-based PDF pages

SECTIONS = [
    ('EDX_GCSE_MATH_NUM', '1', 'Number', [
        ('Structure and calculation', 'N', 1, 9), ('Fractions, decimals and percentages', 'N', 10, 12),
        ('Measures and accuracy', 'N', 13, 16)]),
    ('EDX_GCSE_MATH_ALG', '2', 'Algebra', [
        ('Notation, vocabulary and manipulation', 'A', 1, 7), ('Graphs', 'A', 8, 16),
        ('Solving equations and inequalities', 'A', 17, 22), ('Sequences', 'A', 23, 25)]),
    ('EDX_GCSE_MATH_RATIO', '3', 'Ratio, proportion and rates of change', [
        ('Ratio, proportion and rates of change', 'R', 1, 16)]),
    ('EDX_GCSE_MATH_GEOM', '4', 'Geometry and measures', [
        ('Properties and constructions', 'G', 1, 13), ('Mensuration and calculation', 'G', 14, 23),
        ('Vectors', 'G', 24, 25)]),
    ('EDX_GCSE_MATH_PROB', '5', 'Probability', [('Probability', 'P', 1, 9)]),
    ('EDX_GCSE_MATH_STAT', '6', 'Statistics', [('Statistics', 'S', 1, 6)]),
]

HEADINGS = {g[0] for _, _, _, gs in SECTIONS for g in gs} | {'Foundation tier knowledge, skills and', 'Higher tier knowledge, skills and', 'understanding'}

# Short navigation titles (editorial); the printed wording is kept in official_reference.
TITLES = {
    'N1': 'Ordering numbers; inequality symbols', 'N2': 'Four operations and place value',
    'N3': 'Inverse operations and order of operations', 'N4': 'Primes, factors, multiples, HCF and LCM',
    'N5': 'Systematic listing', 'N6': 'Powers and roots', 'N7': 'Calculating with roots and indices',
    'N8': 'Exact calculation with fractions, π and surds', 'N9': 'Standard form',
    'N10': 'Fractions and decimals, including recurring decimals', 'N11': 'Fractions in ratio problems',
    'N12': 'Fractions and percentages as operators', 'N13': 'Standard units and compound measures',
    'N14': 'Estimation and checking', 'N15': 'Rounding and error intervals', 'N16': 'Limits of accuracy and bounds',
    'A1': 'Algebraic notation', 'A2': 'Substitution into formulae', 'A3': 'Expressions, equations, formulae and identities',
    'A4': 'Simplifying, expanding and factorising', 'A5': 'Using and rearranging formulae',
    'A6': 'Identities and algebraic proof', 'A7': 'Functions, inverse and composite functions',
    'A8': 'Coordinates in four quadrants', 'A9': 'Straight-line graphs and y = mx + c',
    'A10': 'Gradients and intercepts', 'A11': 'Roots and turning points of quadratics',
    'A12': 'Graphs of standard functions', 'A13': 'Translations and reflections of graphs',
    'A14': 'Real-life graphs', 'A15': 'Gradients and areas under graphs',
    'A16': 'Equation of a circle and tangents', 'A17': 'Linear equations',
    'A18': 'Quadratic equations', 'A19': 'Simultaneous equations', 'A20': 'Iteration',
    'A21': 'Forming and solving equations', 'A22': 'Linear and quadratic inequalities',
    'A23': 'Generating sequences', 'A24': 'Recognising and using sequences', 'A25': 'nth term of sequences',
    'R1': 'Converting units and measures', 'R2': 'Scale factors, diagrams and maps',
    'R3': 'One quantity as a fraction of another', 'R4': 'Ratio notation and simplifying',
    'R5': 'Sharing in a ratio', 'R6': 'Ratio as a fraction or linear function',
    'R7': 'Proportion as equality of ratios', 'R8': 'Relating ratios to fractions',
    'R9': 'Percentages and percentage change', 'R10': 'Direct and inverse proportion',
    'R11': 'Compound units: speed, rates, density and pressure', 'R12': 'Comparing lengths, areas and volumes using ratio',
    'R13': 'Proportion and inverse proportion graphically', 'R14': 'Gradient of a graph as a rate of change',
    'R15': 'Instantaneous and average rates of change', 'R16': 'Growth, decay and compound interest',
    'G1': 'Geometric terms and notation', 'G2': 'Constructions and loci', 'G3': 'Angle facts and polygons',
    'G4': 'Properties of quadrilaterals and triangles', 'G5': 'Congruence criteria for triangles',
    'G6': 'Geometric reasoning and simple proofs', 'G7': 'Transformations and similar shapes',
    'G8': 'Combinations of transformations', 'G9': 'Circle definitions and properties',
    'G10': 'Circle theorems', 'G11': 'Geometry on coordinate axes', 'G12': 'Properties of 3D shapes',
    'G13': 'Plans and elevations', 'G14': 'Standard units of measure', 'G15': 'Measuring, scale drawings and bearings',
    'G16': 'Area of 2D shapes and volume of prisms', 'G17': 'Circles, surface area and volume of solids',
    'G18': 'Arcs and sectors', 'G19': 'Congruence and similarity: lengths, areas and volumes',
    'G20': "Pythagoras' theorem and trigonometry", 'G21': 'Exact trigonometric values',
    'G22': 'Sine rule and cosine rule', 'G23': 'Area of a triangle using ½ab sin C',
    'G24': 'Translations as vectors', 'G25': 'Vector arithmetic and proofs',
    'P1': 'Frequency of outcomes and frequency trees', 'P2': 'Randomness, fairness and expected outcomes',
    'P3': 'Relative frequency and the probability scale', 'P4': 'Exhaustive and mutually exclusive outcomes',
    'P5': 'Samples tending towards theoretical probability', 'P6': 'Sets, Venn diagrams and tree diagrams',
    'P7': 'Sample spaces and theoretical probability', 'P8': 'Independent and dependent combined events',
    'P9': 'Conditional probability', 'S1': 'Sampling and populations',
    'S2': 'Tables, charts and diagrams', 'S3': 'Histograms and cumulative frequency',
    'S4': 'Averages, spread and box plots', 'S5': 'Applying statistics to a population',
    'S6': 'Scatter graphs and correlation',
}

# Earlier unverified runtime leaves -> official statements (editorial mapping by topic).
LEGACY = {
    'NUM_1.1': ['N1', 'N2', 'N3'], 'NUM_1.2': ['N10', 'N12'], 'NUM_1.3': ['N4', 'N5'],
    'NUM_1.4': ['N6', 'N7'], 'NUM_1.5': ['N9'], 'NUM_1.6': ['N14', 'N15', 'N16'], 'NUM_1.7': ['N8', 'N10'],
    'NUM_1.8': ['N7'], 'ALG_2.1': ['A1', 'A3', 'A4'], 'ALG_2.2': ['A2', 'A5'], 'ALG_2.3': ['A17', 'A21', 'A22'],
    'ALG_2.4': ['A23', 'A24', 'A25'], 'ALG_2.5': ['A9', 'A10'], 'ALG_2.6': ['A4', 'A11', 'A18'],
    'ALG_2.7': ['A19'], 'ALG_2.8': ['A12', 'A14'], 'ALG_2.9': ['A11', 'A18'], 'ALG_2.10': ['A4'],
    'ALG_2.11': ['A7'], 'ALG_2.12': ['A13', 'A15', 'A16'], 'ALG_2.13': ['A20'], 'ALG_2.14': ['A6'],
    'RATIO_3.1': ['R4', 'R5', 'R6', 'R8'], 'RATIO_3.2': ['R7', 'R10', 'R13'], 'RATIO_3.3': ['R9'],
    'RATIO_3.4': ['R11', 'N13'], 'RATIO_3.5': ['R1', 'R2'], 'RATIO_3.6': ['R16'],
    'GEOM_4.1': ['G1', 'G3'], 'GEOM_4.2': ['G4', 'G5', 'G6', 'G19'], 'GEOM_4.3': ['G16', 'G17', 'G18'],
    'GEOM_4.4': ['G12', 'G16', 'G17'], 'GEOM_4.5': ['G7', 'G8', 'G24'], 'GEOM_4.6': ['G2', 'G15'],
    'GEOM_4.7': ['G20'], 'GEOM_4.8': ['G20', 'G21'], 'GEOM_4.9': ['G25'], 'GEOM_4.10': ['G10'],
    'GEOM_4.11': ['G22', 'G23'], 'GEOM_4.12': ['G20'],
    'PROB_5.1': ['P1', 'P2', 'P3', 'P4', 'P5'], 'PROB_5.2': ['P6', 'P7'], 'PROB_5.3': ['P8'], 'PROB_5.4': ['P9'],
    'STAT_6.1': ['S1'], 'STAT_6.2': ['S4'], 'STAT_6.3': ['S2', 'S3'], 'STAT_6.4': ['S6'],
    'STAT_6.5': ['S3', 'S4'], 'STAT_6.6': ['S3'],
}


def statements(pdf, pages):
    """Printed statement text by code, with its PDF page and printed page."""
    out, cur = {}, None
    for n in pages:
        page = pdf.pages[n - 1]
        text = page.extract_text() or ''
        printed = re.search(r'^(\d{1,2})\s*$', text, re.M)
        for line in text.splitlines():
            if re.search(r'Pearson Edexcel Level|Specification – Issue|What students need to learn|^\d{1,2}$', line):
                continue
            m = re.match(r'^([NARGPS])(\d{1,2}) (.*)', line)
            if m:
                cur = m.group(1) + m.group(2)
                if cur in out:  # Foundation pages end with the start of the Higher list.
                    cur = None; continue
                out[cur] = {'text': m.group(3), 'pdf_page': n, 'printed_page': int(printed.group(1)) if printed else None}
            elif re.match(r'^\d\. ', line) or line.strip() in HEADINGS:
                cur = None
            elif cur:
                out[cur]['text'] += ' ' + line
    for v in out.values():
        v['text'] = re.sub(r'\s+', ' ', v['text']).strip()
    return out


def main():
    src = Path(sys.argv[1])
    if hashlib.sha256(src.read_bytes()).hexdigest() != SHA:
        raise SystemExit('Not the verified Issue 2 specification PDF')
    with pdfplumber.open(src) as pdf:
        foundation = statements(pdf, FOUNDATION_PAGES)
        higher = statements(pdf, HIGHER_PAGES)
    assert len(higher) == 97 and set(foundation) < set(higher), (len(higher), set(foundation) - set(higher))
    sections, order = [], []
    for sec_id, num, title, groups in SECTIONS:
        topics = []
        for gi, (gtitle, letter, a, b) in enumerate(groups, 1):
            points = []
            for k in range(a, b + 1):
                code = f'{letter}{k}'
                h = higher[code]; f = foundation.get(code)
                ref = {'reference_id': f'1MA1-ISSUE2-{code}', 'code': code, 'content_heading': f'{num}. {title}',
                       'subheading': gtitle if len(groups) > 1 else None,
                       'higher_text': h['text'], 'foundation_text': f['text'] if f else None,
                       'source_pages': sorted({h['pdf_page']} | ({f['pdf_page']} if f else set())),
                       'tiers': ['Foundation', 'Higher'] if f else ['Higher']}
                point = {'id': f'EDX_GCSE_MATH_{code}', 'code': code, 'title': TITLES[code], 'official_reference': ref}
                if not f:
                    point['tier'] = 'Higher'
                elif len(h['text']) > len(f['text']) + 3:
                    point['higher_extension'] = True
                points.append(point); order.append(point['id'])
            topics.append({'id': f'{sec_id}_G{gi}', 'code': f'{letter}{a}–{letter}{b}', 'title': gtitle, 'kind': 'group', 'points': points})
        sections.append({'id': sec_id, 'code': num, 'title': title, 'topics': topics})
    spec = {
        'subject_id': 'EDX_GCSE_MATH_1MA1', 'specification_version': 'pearson-1ma1-issue2-2015-06',
        'official_source_url': URL, 'order_status': 'verified',
        'official_source': {'title': 'Pearson Edexcel Level 1/Level 2 GCSE (9-1) in Mathematics (1MA1) specification',
            'issue': 'Issue 2', 'issue_date': 'June 2015', 'first_certification': 2017, 'url': URL, 'sha256': SHA,
            'verified_at': '2026-11-17',
            'tiers': {'Foundation': 'Grades 1-5; content on printed pages 5-11', 'Higher': 'Grades 4-9; content on printed pages 12-20 (Higher-only content in bold)'},
            'components': {c: {'title': t, 'marks': 80, 'minutes': 90, 'calculator': c[0] != '1'}
                           for c, t in [('1F', 'Paper 1 (Non-Calculator) Foundation'), ('2F', 'Paper 2 (Calculator) Foundation'),
                                        ('3F', 'Paper 3 (Calculator) Foundation'), ('1H', 'Paper 1 (Non-Calculator) Higher'),
                                        ('2H', 'Paper 2 (Calculator) Higher'), ('3H', 'Paper 3 (Calculator) Higher')]},
            'notes': 'Codes are strings. 86 statements are in both tiers; 11 are Higher-only (tier "Higher"). All content is assessed across all three papers of a tier.'},
        'legacy_ids': {f'EDX_GCSE_MATH_{k}': [f'EDX_GCSE_MATH_{c}' for c in v] for k, v in LEGACY.items()},
        'point_order': order, 'sections': sections,
    }
    target = ROOT / 'data/specs/EDX_GCSE_MATH_1MA1.json'
    target.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    print(len(order), 'statements;', sum(1 for s in sections for t in s['topics'] for p in t['points'] if p.get('tier')), 'Higher-only')


if __name__ == '__main__':
    main()
