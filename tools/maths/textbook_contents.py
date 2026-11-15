#!/usr/bin/env python3
"""Transcribe the owner's four contents images; keep book codes namespaced.

Official references below are editorial relationships, not a claim that one
textbook subsection covers an entire official specification point.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BOOKS = [
('P1', 'Pure Year 1 / AS', 'Pure 1', 12, ['pure1', 'p1', 'pure year 1', 'pure year 12'], [
('Algebraic expressions', 1, '''Index laws|P_ALG_2.1
Expanding brackets|P_ALG_2.6
Factorising|P_ALG_2.6
Negative and fractional indices|P_ALG_2.1
Surds|P_ALG_2.2
Rationalising denominators|P_ALG_2.2'''),
('Quadratics', 18, '''Solving quadratic equations|P_ALG_2.3
Completing the square|P_ALG_2.3
Functions|P_ALG_2.3,P_ALG_2.7
Quadratic graphs|P_ALG_2.3,P_ALG_2.7
The discriminant|P_ALG_2.3
Modelling with quadratics|P_ALG_2.3,P_ALG_2.11'''),
('Equations and inequalities', 38, '''Linear simultaneous equations|P_ALG_2.4
Quadratic simultaneous equations|P_ALG_2.4
Simultaneous equations on graphs|P_ALG_2.4,P_ALG_2.7
Linear inequalities|P_ALG_2.5
Quadratic inequalities|P_ALG_2.5
Inequalities on graphs|P_ALG_2.5,P_ALG_2.7
Regions|P_ALG_2.5'''),
('Graphs and transformations', 59, '''Cubic graphs|P_ALG_2.7
Quartic graphs|P_ALG_2.7
Reciprocal graphs|P_ALG_2.7
Points of intersection|P_ALG_2.7,P_ALG_2.4
Translating graphs|P_ALG_2.9
Stretching graphs|P_ALG_2.9
Transforming functions|P_ALG_2.9'''),
('Straight line graphs', 89, '''y = mx + c|P_COORD_3.1
Equations of straight lines|P_COORD_3.1
Parallel and perpendicular lines|P_COORD_3.1
Length and area|P_COORD_3.1
Modelling with straight lines|P_COORD_3.1,P_ALG_2.11'''),
('Circles', 113, '''Midpoints and perpendicular bisectors|P_COORD_3.1,P_COORD_3.2
Equation of a circle|P_COORD_3.2
Intersections of straight lines and circles|P_COORD_3.2,P_ALG_2.4
Use tangent and chord properties|P_COORD_3.2
Circles and triangles|P_COORD_3.2'''),
('Algebraic methods', 137, '''Algebraic fractions|P_ALG_2.6
Dividing polynomials|P_ALG_2.6
The factor theorem|P_ALG_2.6
Mathematical proof|P_PROOF_1.1
Methods of proof|P_PROOF_1.1'''),
('The binomial expansion', 158, '''Pascal’s triangle|P_SEQ_4.1
Factorial notation|P_SEQ_4.1
The binomial expansion|P_SEQ_4.1
Solving binomial problems|P_SEQ_4.1
Binomial estimation|P_SEQ_4.1'''),
('Trigonometric ratios', 173, '''The cosine rule|P_TRIG_5.1
The sine rule|P_TRIG_5.1
Areas of triangles|P_TRIG_5.1
Solving triangle problems|P_TRIG_5.1
Graphs of sine, cosine and tangent|P_TRIG_5.3
Transforming trigonometric graphs|P_TRIG_5.3,P_ALG_2.9'''),
('Trigonometric identities and equations', 202, '''Angles in all four quadrants|P_TRIG_5.3
Exact values of trigonometric ratios|P_TRIG_5.3
Trigonometric identities|P_TRIG_5.5
Simple trigonometric equations|P_TRIG_5.7
Harder trigonometric equations|P_TRIG_5.7
Equations and identities|P_TRIG_5.5,P_TRIG_5.7'''),
('Vectors', 230, '''Vectors|P_VEC_10.1
Representing vectors|P_VEC_10.3
Magnitude and direction|P_VEC_10.2
Position vectors|P_VEC_10.4
Solving geometric problems|P_VEC_10.5
Modelling with vectors|P_VEC_10.5'''),
('Differentiation', 255, '''Gradients of curves|P_DIFF_7.1
Finding the derivative|P_DIFF_7.1
Differentiating xⁿ|P_DIFF_7.2
Differentiating quadratics|P_DIFF_7.2
Differentiating functions with two or more terms|P_DIFF_7.2
Gradients, tangents and normal|P_DIFF_7.3
Increasing and decreasing functions|P_DIFF_7.3
Second order derivatives|P_DIFF_7.1
Stationary points|P_DIFF_7.3
Sketching gradient functions|P_DIFF_7.1,P_DIFF_7.2
Modelling with differentiation|P_DIFF_7.3,P_ALG_2.11'''),
('Integration', 287, '''Integrating xⁿ|P_INT_8.2
Indefinite integrals|P_INT_8.1,P_INT_8.2
Finding functions|P_INT_8.1,P_INT_8.2
Definite integrals|P_INT_8.3
Areas under curves|P_INT_8.3
Areas under the x-axis|P_INT_8.3
Areas between curves and lines|P_INT_8.3'''),
('Exponentials and logarithms', 311, '''Exponential functions|P_EXP_6.1
y = eˣ|P_EXP_6.1,P_EXP_6.2
Exponential modelling|P_EXP_6.7
Logarithms|P_EXP_6.3
Laws of logarithms|P_EXP_6.4
Solving equations using logarithms|P_EXP_6.5
Working with natural logarithms|P_EXP_6.3,P_EXP_6.5
Logarithms and non-linear data|P_EXP_6.6'''),
]),
('P2', 'Pure Year 2', 'Pure 2', 13, ['pure2', 'p2', 'pure year 2', 'pure year 13'], [
('Algebraic methods', 1, '''Proof by contradiction|P_PROOF_1.2
Algebraic fractions|P_ALG_2.6
Partial fractions|P_ALG_2.10
Repeated factors|P_ALG_2.10
Algebraic division|P_ALG_2.6'''),
('Functions and graphs', 22, '''The modulus function|P_ALG_2.7
Functions and mappings|P_ALG_2.8
Composite functions|P_ALG_2.8
Inverse functions|P_ALG_2.8
y = |f(x)| and y = f(|x|)|P_ALG_2.7,P_ALG_2.9
Combining transformations|P_ALG_2.9
Solving modulus problems|P_ALG_2.7,P_ALG_2.5'''),
('Sequences and series', 59, '''Arithmetic sequences|P_SEQ_4.4
Arithmetic series|P_SEQ_4.4
Geometric sequences|P_SEQ_4.5
Geometric series|P_SEQ_4.5
Sum to infinity|P_SEQ_4.5
Sigma notation|P_SEQ_4.3
Recurrence relations|P_SEQ_4.2
Modelling with series|P_SEQ_4.6'''),
('Binomial expansion', 91, '''Expanding (1 + x)ⁿ|P_SEQ_4.1
Expanding (a + bx)ⁿ|P_SEQ_4.1
Using partial fractions|P_SEQ_4.1,P_ALG_2.10'''),
('Radians', 113, '''Radian measure|P_TRIG_5.1
Arc length|P_TRIG_5.1
Areas of sectors and segments|P_TRIG_5.1
Solving trigonometric equations|P_TRIG_5.7
Small angle approximations|P_TRIG_5.2'''),
('Trigonometric functions', 142, '''Secant, cosecant and cotangent|P_TRIG_5.4
Graphs of sec x, cosec x and cot x|P_TRIG_5.4
Using sec x, cosec x and cot x|P_TRIG_5.4
Trigonometric identities|P_TRIG_5.5
Inverse trigonometric functions|P_TRIG_5.4'''),
('Trigonometry and modelling', 166, '''Addition formulae|P_TRIG_5.6
Using the angle addition formulae|P_TRIG_5.6
Double-angle formulae|P_TRIG_5.6
Solving trigonometric equations|P_TRIG_5.7
Simplifying a cos x ± b sin x|P_TRIG_5.6
Proving trigonometric identities|P_TRIG_5.8
Modelling with trigonometric functions|P_TRIG_5.9,P_ALG_2.11'''),
('Parametric equations', 197, '''Parametric equations|P_COORD_3.3
Using trigonometric identities|P_COORD_3.3,P_TRIG_5.5
Curve sketching|P_COORD_3.3
Points of intersection|P_COORD_3.3
Modelling with parametric equations|P_COORD_3.4'''),
('Differentiation', 231, '''Differentiating sin x and cos x|P_DIFF_7.2
Differentiating exponentials and logarithms|P_DIFF_7.2
The chain rule|P_DIFF_7.4
The product rule|P_DIFF_7.4
The quotient rule|P_DIFF_7.4
Differentiating trigonometric functions|P_DIFF_7.2,P_DIFF_7.4
Parametric differentiation|P_DIFF_7.5
Implicit differentiation|P_DIFF_7.5
Using second derivatives|P_DIFF_7.1,P_DIFF_7.3
Rates of change|P_DIFF_7.4'''),
('Numerical methods', 273, '''Locating roots|P_NUM_9.1
Iteration|P_NUM_9.2
The Newton–Raphson method|P_NUM_9.3
Applications to modelling|P_NUM_9.5'''),
('Integration', 293, '''Integrating standard functions|P_INT_8.2
Integrating f(ax + b)|P_INT_8.2
Using trigonometric identities|P_INT_8.2,P_TRIG_5.5
Reverse chain rule|P_INT_8.5
Integration by substitution|P_INT_8.5
Integration by parts|P_INT_8.5
Partial fractions|P_INT_8.6
Finding areas|P_INT_8.3
The trapezium rule|P_NUM_9.4
Solving differential equations|P_INT_8.7
Modelling with differential equations|P_INT_8.8,P_DIFF_7.6
Integration as the limit of a sum|P_INT_8.4'''),
('Vectors', 337, '''3D coordinates|P_VEC_10.1,P_VEC_10.4
Vectors in 3D|P_VEC_10.1,P_VEC_10.3
Solving geometric problems|P_VEC_10.5
Application to mechanics|P_VEC_10.5'''),
]),
('A1', 'Statistics & Mechanics Year 1 / AS', 'Applied 1', 12, ['applied1', 'a1', 'applied year 1', 'applied year 12', 'statistics mechanics year 1'], [
('Data collection', 1, '''Populations and samples|S_SAMP_1.1
Sampling|S_SAMP_1.1
Non-random sampling|S_SAMP_1.1
Types of data|S_SAMP_1.1
The large data set|S_DATA_2.4'''),
('Measures of location and spread', 20, '''Measures of central tendency|S_DATA_2.3
Other measures of location|S_DATA_2.3
Measures of spread|S_DATA_2.3
Variance and standard deviation|S_DATA_2.3
Coding|S_DATA_2.3'''),
('Representations of data', 40, '''Outliers|S_DATA_2.4
Box plots|S_DATA_2.1
Cumulative frequency|S_DATA_2.1
Histograms|S_DATA_2.1
Comparing data|S_DATA_2.1,S_DATA_2.3'''),
('Correlation', 59, '''Correlation|S_DATA_2.2
Linear regression|S_DATA_2.2'''),
('Probability', 69, '''Calculating probabilities|S_PROB_3.1,S_PROB_3.3
Venn diagrams|S_PROB_3.1
Mutually exclusive and independent events|S_PROB_3.1
Tree diagrams|S_PROB_3.1'''),
('Statistical distributions', 83, '''Probability distributions|S_DIST_4.1,S_DIST_4.3
The binomial distribution|S_DIST_4.1
Cumulative probabilities|S_DIST_4.1'''),
('Hypothesis testing', 98, '''Hypothesis testing|S_HYP_5.1,S_HYP_5.2
Finding critical values|S_HYP_5.2
One-tailed tests|S_HYP_5.2
Two-tailed tests|S_HYP_5.2'''),
('Modelling in mechanics', 118, '''Constructing a model|M_UNITS_6.1,M_FORCES_8.1,M_KIN_7.1
Modelling assumptions|M_UNITS_6.1,M_FORCES_8.1
Quantities and units|M_UNITS_6.1
Working with vectors|M_FORCES_8.5,P_VEC_10.3'''),
('Constant acceleration', 130, '''Displacement–time graphs|M_KIN_7.2
Velocity–time graphs|M_KIN_7.2
Constant acceleration formulae 1|M_KIN_7.3,M_KIN_7.1
Constant acceleration formulae 2|M_KIN_7.3
Vertical motion under gravity|M_FORCES_8.3,M_KIN_7.3'''),
('Forces and motion', 156, '''Force diagrams|M_FORCES_8.1
Forces as vectors|M_FORCES_8.5
Forces and acceleration|M_FORCES_8.2,M_FORCES_8.3
Motion in 2 dimensions|M_FORCES_8.5,M_KIN_7.3
Connected particles|M_FORCES_8.4
Pulleys|M_FORCES_8.4'''),
('Variable acceleration', 181, '''Functions of time|M_KIN_7.4,M_KIN_7.1
Using differentiation|M_KIN_7.4
Maxima and minima problems|M_KIN_7.4
Using integration|M_KIN_7.4
Constant acceleration formulae|M_KIN_7.3'''),
]),
('A2', 'Statistics & Mechanics Year 2', 'Applied 2', 13, ['applied2', 'a2', 'applied year 2', 'applied year 13', 'statistics mechanics year 2'], [
('Regression, correlation and hypothesis testing', 1, '''Exponential models|S_DATA_2.2,P_EXP_6.6
Measuring correlation|S_DATA_2.2
Hypothesis testing for zero correlation|S_HYP_5.1'''),
('Conditional probability', 16, '''Set notation|S_PROB_3.2
Conditional probability|S_PROB_3.2,S_PROB_3.3
Conditional probabilities in Venn diagrams|S_PROB_3.2
Probability formulae|S_PROB_3.2
Tree diagrams|S_PROB_3.2'''),
('The normal distribution', 37, '''The normal distribution|S_DIST_4.2,S_DIST_4.3
Finding probabilities for normal distributions|S_DIST_4.2
The inverse normal distribution function|S_DIST_4.2
The standard normal distribution|S_DIST_4.2
Finding μ and σ|S_DIST_4.2
Approximating a binomial distribution|S_DIST_4.2
Hypothesis testing with the normal distribution|S_HYP_5.3'''),
('Moments', 70, '''Moments|M_MOM_9.1
Resultant moments|M_MOM_9.1
Equilibrium|M_MOM_9.1
Centres of mass|M_MOM_9.1
Tilting|M_MOM_9.1'''),
('Forces and friction', 90, '''Resolving forces|M_FORCES_8.2
Inclined planes|M_FORCES_8.6,M_FORCES_8.2
Friction|M_FORCES_8.6'''),
('Projectiles', 107, '''Horizontal projection|M_KIN_7.5
Horizontal and vertical components|M_KIN_7.5
Projection at any angle|M_KIN_7.5
Projectile motion formulae|M_KIN_7.5'''),
('Applications of forces', 128, '''Static particles|M_FORCES_8.6,M_FORCES_8.1
Modelling with statics|M_FORCES_8.6
Friction and static particles|M_FORCES_8.6
Static rigid bodies|M_MOM_9.1
Dynamics and inclined planes|M_FORCES_8.2,M_FORCES_8.6
Connected particles|M_FORCES_8.4'''),
('Further kinematics', 159, '''Vectors in kinematics|M_KIN_7.4,M_FORCES_8.5
Vector methods with projectiles|M_KIN_7.5
Variable acceleration in one dimension|M_KIN_7.4
Differentiating vectors|M_KIN_7.4
Integrating vectors|M_KIN_7.4'''),
]),
]


def reference(short):
    prefix, rest = short.split('_', 1)
    return 'EDX_MATH_' + {'P': 'PURE', 'S': 'STATS', 'M': 'MECH'}[prefix] + '_' + rest


def main():
    spec = json.loads((ROOT/'data/specs/EDX_ALEVEL_MATH_9MA0.json').read_text())
    valid = {p['id'] for s in spec['sections'] for t in s['topics'] for p in t['points']}
    evidence = json.loads((ROOT/'data/imports/maths/textbook-contents-sources.json').read_text())
    books = []
    for bid, title, short, year, aliases, chapters in BOOKS:
        book = {'id': bid, 'title': title, 'short_title': short, 'year': year,
                'aliases': aliases + [f'year {year-11}', f'year {year}'],
                'source': next(item for item in evidence if item['book_id'] == bid), 'chapters': []}
        for ci, (chapter_title, page, rows) in enumerate(chapters, 1):
            chapter = {'id': f'TB_MATH_{bid}_{ci}', 'code': str(ci), 'title': chapter_title,
                       'position': ci, 'printed_page': page, 'sections': []}
            for si, row in enumerate(rows.splitlines(), 1):
                section_title, refs = row.rsplit('|', 1)
                points = [reference(r) for r in refs.split(',')]
                assert set(points) <= valid, (bid, ci, si, points)
                code = f'{ci}.{si}'
                chapter['sections'].append({'id': f'TB_MATH_{bid}_{code}', 'code': code,
                    'title': section_title, 'official_points': points,
                    'relationship': 'related_skill_scope_not_whole_official_point'})
            book['chapters'].append(chapter)
        books.append(book)
    data = {'subject_id': 'EDX_ALEVEL_MATH_9MA0', 'version': 'owner-contents-2026-11-15',
            'source_basis': 'Transcribed from the four textbook contents images supplied by the project owner, in the stated order. Edition/ISBN is not inferred for books whose edition page was not supplied.',
            'mapping_basis': 'Editorial associations to stable official skill IDs; partial subsection scopes never mark a whole official skill learned.',
            'books': books}
    (ROOT/'data/curriculum/maths-textbooks.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
    print('Books', len(books), 'chapters', sum(len(b['chapters']) for b in books),
          'subsections', sum(len(c['sections']) for b in books for c in b['chapters']))


if __name__ == '__main__':
    main()
