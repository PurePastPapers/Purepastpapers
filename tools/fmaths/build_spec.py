#!/usr/bin/env python3
"""Build data/specs/EDX_ALEVEL_FMATH_9FM0.json from the official Pearson Edexcel
Further Mathematics specifications (A-Level 9FM0 Issue 4, June 2023; AS 8FM0
Issue 5, July 2025).

Content was transcribed from the public specification PDFs (text extraction,
2026-11-19). Each point title is the opening wording of the official content
point; long points are shortened at a clause boundary. Codes are strings.

Identity rules (see docs/FURTHER-MATHS-HANDOVER.md):
* Core Pure is one module. AS Core Pure (8FM0/01) is an exact subset of A-Level
  Core Pure with identical codes and wording, so those nodes are shared and each
  point lists the qualifications that assess it.
* Optional modules are scoped per qualification. AS option modules are narrower
  and numbered differently from the A-Level papers of the same name, so AS
  modules have their own ids (EDX_FMATH_AS_<module>_<code>).
* Core Pure is never merged with the optional Further Pure modules.

Earlier seeded ids are kept as `legacy_ids`, each mapped to the official points
that cover its meaning, so saved learned ticks expand rather than disappear.
Run tools/write_spec_migrations.py afterwards.
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
A_URL = ('https://qualifications.pearson.com/content/dam/pdf/A%20Level/Mathematics/2017/'
         'specification-and-sample-assesment/a-level-l3-further-mathematics-specification.pdf')
AS_URL = ('https://qualifications.pearson.com/content/dam/pdf/A%20Level/Mathematics/2017/'
          'specification-and-sample-assesment/as-l3-further-mathematics-specification.pdf')

A, AS = '9FM0', '8FM0'

# ── Core Pure (A-Level Papers 1 and 2; AS Paper 1 assesses the points marked AS) ──
# (topic code, existing topic id suffix, title, [(code, title, also_AS)])
CORE_PURE = [
    ('1', 'PROOF', 'Proof', [
        ('1.1', 'Construct proofs using mathematical induction', True)]),
    ('2', 'COMPLEX', 'Complex numbers', [
        ('2.1', 'Solve any quadratic equation with real coefficients', True),
        ('2.2', 'Add, subtract, multiply and divide complex numbers in the form x + iy', True),
        ('2.3', 'Understand and use the complex conjugate', True),
        ('2.4', 'Use and interpret Argand diagrams', True),
        ('2.5', 'Convert between the Cartesian form and the modulus-argument form', True),
        ('2.6', 'Multiply and divide complex numbers in modulus-argument form', True),
        ('2.7', 'Construct and interpret simple loci in the Argand diagram', True),
        ('2.8', "De Moivre's theorem: multiple angle formulae and sums of series", False),
        ('2.9', 'Know and use e^(iθ) = cos θ + i sin θ and the form z = re^(iθ)', False),
        ('2.10', 'Find the n distinct nth roots of re^(iθ)', False),
        ('2.11', 'Use complex roots of unity to solve geometric problems', False)]),
    ('3', 'MATRICES', 'Matrices', [
        ('3.1', 'Add, subtract and multiply conformable matrices', True),
        ('3.2', 'Understand and use zero and identity matrices', True),
        ('3.3', 'Use matrices to represent linear transformations in 2-D', True),
        ('3.4', 'Find invariant points and lines for a linear transformation', True),
        ('3.5', 'Determinants of 2 × 2 and 3 × 3 matrices as scale factors', True),
        ('3.6', 'Understand and use singular and non-singular matrices', True),
        ('3.7', 'Solve three linear simultaneous equations using the inverse matrix', True),
        ('3.8', 'Interpret geometrically the solution and failure of solution of three equations', True)]),
    ('4', 'ALG', 'Further algebra and functions', [
        ('4.1', 'Roots and coefficients of polynomial equations up to quartics', True),
        ('4.2', 'Form a polynomial whose roots are a linear transformation of given roots', True),
        ('4.3', 'Sums of integers, squares and cubes, and using them to sum other series', True),
        ('4.4', 'Method of differences for summing series, including partial fractions', False),
        ('4.5', 'Find the Maclaurin series of a function including the general term', False),
        ('4.6', 'Recognise and use the Maclaurin series for standard functions', False)]),
    ('5', 'CALC', 'Further calculus', [
        ('5.1', 'Derive formulae for and calculate volumes of revolution', True),
        ('5.2', 'Evaluate improper integrals', False),
        ('5.3', 'Understand and evaluate the mean value of a function', False),
        ('5.4', 'Integrate using partial fractions', False),
        ('5.5', 'Differentiate inverse trigonometric functions', False),
        ('5.6', 'Integrate using inverse trigonometric results and trigonometric substitutions', False)]),
    ('6', 'VECTORS', 'Further vectors', [
        ('6.1', 'Vector and Cartesian forms of the equation of a straight line in 3-D', True),
        ('6.2', 'Vector and Cartesian forms of the equation of a plane', True),
        ('6.3', 'Scalar product: equation of a plane and angles between lines and planes', True),
        ('6.4', 'Check whether vectors are perpendicular using the scalar product', True),
        ('6.5', 'Find the intersection of a line and a plane', True)]),
    ('7', 'POLAR', 'Polar coordinates', [
        ('7.1', 'Polar coordinates and converting between polar and Cartesian', False),
        ('7.2', 'Sketch curves with r given as a function of θ', False),
        ('7.3', 'Find the area enclosed by a polar curve', False)]),
    ('8', 'HYP', 'Hyperbolic functions', [
        ('8.1', 'Definitions of sinh x, cosh x and tanh x, their domains and ranges', False),
        ('8.2', 'Differentiate and integrate hyperbolic functions', False),
        ('8.3', 'Definitions, domains and ranges of the inverse hyperbolic functions', False),
        ('8.4', 'Derive and use the logarithmic forms of the inverse hyperbolic functions', False),
        ('8.5', 'Integrate using inverse hyperbolic results and hyperbolic substitutions', False)]),
    ('9', 'DE', 'Differential equations', [
        ('9.1', 'Integrating factor for dy/dx + P(x)y = Q(x)', False),
        ('9.2', 'Find both general and particular solutions to differential equations', False),
        ('9.3', 'Use differential equations in modelling in kinematics and other contexts', False),
        ('9.4', "Solve y'' + ay' + by = 0 using the auxiliary equation", False),
        ('9.5', "Solve y'' + ay' + by = f(x) using complementary function and particular integral", False),
        ('9.6', 'Relate the discriminant of the auxiliary equation to the form of solution', False),
        ('9.7', 'Solve the simple harmonic motion equation and relate it to the motion', False),
        ('9.8', 'Model damped oscillations using second order differential equations', False),
        ('9.9', 'Models with one independent and two dependent variables (coupled equations)', False)]),
]

# ── Optional modules. (module id, title, A-Level paper, topics) ──
A_LEVEL_OPTIONS = [
    ('FP1', 'Further Pure Mathematics 1', '3A', [
        ('1', 'TRIG', 'Further trigonometry', [
            ('1.1', 'The t-formulae: derivation and use'),
            ('1.2', 'Applications of t-formulae to trigonometric identities'),
            ('1.3', 'Applications of t-formulae to solve trigonometric equations')]),
        ('2', 'CALC', 'Further calculus', [
            ('2.1', 'Derivation and use of Taylor series'),
            ('2.2', 'Use of series expansions to find limits'),
            ('2.3', "Leibnitz's theorem for differentiating products"),
            ('2.4', "L'Hospital's rule: using derivatives to evaluate limits"),
            ('2.5', 'The Weierstrass substitution for integration')]),
        ('3', 'DE', 'Further differential equations', [
            ('3.1', 'Taylor series method for series solution of differential equations'),
            ('3.2', 'Differential equations reducible by a given substitution')]),
        ('4', 'CONICS', 'Coordinate systems', [
            ('4.1', 'Cartesian and parametric equations of parabola, rectangular hyperbola, ellipse and hyperbola'),
            ('4.2', 'Focus-directrix properties of the parabola, ellipse and hyperbola, including eccentricity'),
            ('4.3', 'Tangents and normals to these curves'),
            ('4.4', 'Loci problems')]),
        ('5', 'VEC', 'Further vectors', [
            ('5.1', 'The vector product a × b of two vectors'),
            ('5.2', 'The scalar triple product a.b × c'),
            ('5.3', 'Applications of vectors to 3-D geometry with points, lines and planes')]),
        ('6', 'NUM', 'Further numerical methods', [
            ('6.1', 'Numerical solution of first and second order differential equations'),
            ('6.2', "Simpson's rule")]),
        ('7', 'INEQ', 'Inequalities', [
            ('7.1', 'Algebraic inequalities and inequations, including the modulus sign')]),
    ]),
    ('FS1', 'Further Statistics 1', '3B', [
        ('1', 'DRV', 'Discrete probability distributions', [
            ('1.1', 'Mean and variance of discrete probability distributions')]),
        ('2', 'POISSON', 'Poisson and binomial distributions', [
            ('2.1', 'The Poisson distribution and its additive property'),
            ('2.2', 'Mean and variance of the binomial and Poisson distributions'),
            ('2.3', 'The Poisson distribution as an approximation to the binomial')]),
        ('3', 'GEO', 'Geometric and negative binomial distributions', [
            ('3.1', 'Geometric and negative binomial distributions'),
            ('3.2', 'Mean and variance of a geometric distribution'),
            ('3.3', 'Mean and variance of a negative binomial distribution')]),
        ('4', 'HYP', 'Hypothesis testing', [
            ('4.1', 'Hypothesis tests for the mean of a Poisson distribution'),
            ('4.2', 'Hypothesis tests for the parameter p of a geometric distribution')]),
        ('5', 'CLT', 'Central limit theorem', [
            ('5.1', 'Applications of the central limit theorem to other distributions')]),
        ('6', 'CHI', 'Chi-squared tests', [
            ('6.1', 'Goodness of fit tests and contingency tables')]),
        ('7', 'PGF', 'Probability generating functions', [
            ('7.1', 'Probability generating functions: definitions, derivations and applications'),
            ('7.2', 'Use a probability generating function to find the mean and variance'),
            ('7.3', 'Probability generating function of a sum of independent random variables')]),
        ('8', 'QUAL', 'Quality of tests', [
            ('8.1', 'Type I and Type II errors; size and power of a test')]),
    ]),
    ('FM1', 'Further Mechanics 1', '3C', [
        ('1', 'MOM', 'Momentum and impulse', [
            ('1.1', 'Momentum, impulse and conservation of momentum'),
            ('1.2', 'Momentum as a vector; impulse-momentum principle in vector form')]),
        ('2', 'WEP', 'Work, energy and power', [
            ('2.1', 'Kinetic and potential energy, work and power; the work-energy principle')]),
        ('3', 'ELASTIC', 'Elastic strings and springs and elastic energy', [
            ('3.1', "Elastic strings and springs; Hooke's law"),
            ('3.2', 'Energy stored in an elastic string or spring')]),
        ('4', 'COLL1', 'Elastic collisions in one dimension', [
            ('4.1', "Direct impact of elastic spheres; Newton's law of restitution; kinetic energy lost"),
            ('4.2', 'Successive direct impacts of spheres and/or a sphere with a plane surface')]),
        ('5', 'COLL2', 'Elastic collisions in two dimensions', [
            ('5.1', 'Oblique impact of smooth elastic spheres and of a sphere with a fixed surface'),
            ('5.2', 'Successive oblique impacts of a sphere with smooth plane surfaces')]),
    ]),
    ('D1', 'Decision Mathematics 1', '3D', [
        ('1', 'ALG', 'Algorithms and graph theory', [
            ('1.1', 'Algorithms and implementing an algorithm given by a flow chart or text'),
            ('1.2', 'Bin packing, bubble sort and quick sort'),
            ('1.3', 'Order of nodes: Eulerian, semi-Eulerian or neither'),
            ('1.4', 'The planarity algorithm for planar graphs')]),
        ('2', 'GRAPHS', 'Algorithms on graphs', [
            ('2.1', "Minimum spanning trees: Prim's and Kruskal's algorithms"),
            ('2.2', "Dijkstra's and Floyd's algorithms for shortest paths")]),
        ('3', 'GRAPHS2', 'Algorithms on graphs II', [
            ('3.1', 'Route inspection: shortest route travelling along every edge at least once'),
            ('3.2', 'The practical and classical travelling salesman problems')]),
        ('4', 'CPA', 'Critical path analysis', [
            ('4.1', 'Modelling a project by an activity network from a precedence table'),
            ('4.2', 'Completing the precedence table for a given activity network'),
            ('4.3', 'Finding the critical path; earliest and latest event times'),
            ('4.4', 'Total float; Gantt (cascade) charts'),
            ('4.5', 'Resource histograms, including resource levelling'),
            ('4.6', 'Scheduling activities with the least number of workers')]),
        ('5', 'LP', 'Linear programming', [
            ('5.1', 'Formulating linear programs, including slack, surplus and artificial variables'),
            ('5.2', 'Graphical solution using objective line and vertex methods'),
            ('5.3', 'The Simplex algorithm and tableau for problems with ≤ constraints'),
            ('5.4', 'The two-stage Simplex and big-M methods')]),
    ]),
    ('FP2', 'Further Pure Mathematics 2', '4A', [
        ('1', 'GROUPS', 'Groups', [
            ('1.1', 'The axioms of a group'),
            ('1.2', 'Examples of groups; Cayley tables; cyclic groups'),
            ('1.3', 'Order of a group and of an element; subgroups'),
            ('1.4', "Lagrange's theorem"),
            ('1.5', 'Isomorphism')]),
        ('2', 'CALC', 'Further calculus', [
            ('2.1', 'Further integration: reduction formulae'),
            ('2.2', 'Arc length and the area of a surface of revolution')]),
        ('3', 'MATRIX', 'Further matrix algebra', [
            ('3.1', 'Eigenvalues and eigenvectors of 2 × 2 and 3 × 3 matrices'),
            ('3.2', 'Reduction of matrices to diagonal form'),
            ('3.3', 'The Cayley-Hamilton theorem')]),
        ('4', 'COMPLEX', 'Further complex numbers', [
            ('4.1', 'Further loci and regions in the Argand diagram'),
            ('4.2', 'Elementary transformations from the z-plane to the w-plane')]),
        ('5', 'NUMBER', 'Number theory', [
            ('5.1', 'The division theorem and the Euclidean algorithm'),
            ('5.2', "Bezout's identity"),
            ('5.3', 'Modular arithmetic'),
            ('5.4', "Fermat's little theorem"),
            ('5.5', 'Divisibility tests'),
            ('5.6', 'Solution of congruence equations'),
            ('5.7', 'Combinatorics: counting problems, permutations and combinations')]),
        ('6', 'RECUR', 'Further sequences and series', [
            ('6.1', 'First and second order recurrence relations'),
            ('6.2', 'Solving recurrence relations to obtain closed forms'),
            ('6.3', 'Proof by induction of closed forms')]),
    ]),
    ('FS2', 'Further Statistics 2', '4B', [
        ('1', 'REG', 'Linear regression', [
            ('1.1', 'Least squares linear regression'),
            ('1.2', 'Residuals and the residual sum of squares')]),
        ('2', 'CONT', 'Continuous probability distributions', [
            ('2.1', 'Continuous random variables and probability density functions'),
            ('2.2', 'Relationship between probability density and cumulative distribution functions'),
            ('2.3', 'Mean and variance of continuous random variables'),
            ('2.4', 'The continuous uniform (rectangular) distribution')]),
        ('3', 'CORR', 'Correlation', [
            ('3.1', 'The product moment correlation coefficient'),
            ('3.2', "Spearman's rank correlation coefficient, its use and interpretation"),
            ('3.3', 'Testing the hypothesis that a correlation is zero')]),
        ('4', 'COMB', 'Combinations of random variables', [
            ('4.1', 'Linear combinations of independent Normal random variables')]),
        ('5', 'EST', 'Estimation, confidence intervals and tests using a normal distribution', [
            ('5.1', 'Standard error, estimators and bias; quality of estimators'),
            ('5.2', 'Confidence intervals and their interpretation'),
            ('5.3', 'Confidence limits for a Normal mean, with variance known'),
            ('5.4', 'Test for the difference between two Normal means with variances known'),
            ('5.5', 'Large sample results when the population variances are unknown')]),
        ('6', 'OTHER', 'Other hypothesis tests and confidence intervals', [
            ('6.1', 'Test and confidence interval for the variance of a Normal distribution'),
            ('6.2', 'Test that two independent samples are from Normal populations with equal variances')]),
        ('7', 'T', 'Confidence intervals and tests using the t-distribution', [
            ('7.1', 'Test and confidence interval for a Normal mean with unknown variance'),
            ('7.2', 'Paired t-test'),
            ('7.3', 'Test and confidence interval for the difference between two means')]),
    ]),
    ('FM2', 'Further Mechanics 2', '4C', [
        ('1', 'CIRC', 'Motion in a circle', [
            ('1.1', 'Angular speed; uniform motion in a horizontal circle'),
            ('1.2', 'Motion in a vertical circle; radial and tangential acceleration')]),
        ('2', 'COM', 'Centres of mass of plane figures', [
            ('2.1', 'Moment of a force; centre of mass of a discrete mass distribution'),
            ('2.2', 'Centre of mass of uniform plane figures and composite plane figures')]),
        ('3', 'COM3', 'Further centres of mass', [
            ('3.1', 'Centre of mass of uniform, non-uniform and composite rigid bodies'),
            ('3.2', 'Equilibrium of rigid bodies under coplanar forces'),
            ('3.3', 'Toppling and sliding of a rigid body on a rough plane')]),
        ('4', 'DYN', 'Further dynamics', [
            ('4.1', "Newton's laws for a particle in one dimension under a variable force"),
            ('4.2', 'Simple harmonic motion; oscillations on elastic strings or springs')]),
        ('5', 'KIN', 'Further kinematics', [
            ('5.1', 'Straight-line kinematics when acceleration is a function of time, velocity or displacement')]),
    ]),
    ('D2', 'Decision Mathematics 2', '4D', [
        ('1', 'TRANS', 'Transportation problems', [
            ('1.1', 'North-west corner method for an initial basic feasible solution'),
            ('1.2', 'Stepping-stone method for an improved solution; improvement indices'),
            ('1.3', 'Formulating the transportation problem as a linear programming problem')]),
        ('2', 'ALLOC', 'Allocation (assignment) problems', [
            ('2.1', 'Cost matrix reduction and the Hungarian algorithm'),
            ('2.2', 'Formulating the allocation problem as a linear programming problem')]),
        ('3', 'FLOWS', 'Flows in networks', [
            ('3.1', 'Cuts and their capacity'),
            ('3.2', 'Labelling procedure to augment a flow to a maximum flow'),
            ('3.3', 'Max-flow min-cut theorem to prove a flow is maximal'),
            ('3.4', 'Multiple sources and sinks; vertices with restricted capacity'),
            ('3.5', 'Optimal flow rate in a network subject to given constraints')]),
        ('4', 'DP', 'Dynamic programming', [
            ('4.1', "Principles of dynamic programming; Bellman's principle of optimality")]),
        ('5', 'GAME', 'Game theory', [
            ('5.1', 'Two person zero-sum games and the pay-off matrix'),
            ('5.2', 'Play-safe strategies and stable solutions (saddle points)'),
            ('5.3', 'Reducing pay-off matrices using dominance'),
            ('5.4', 'Optimal mixed strategies by graphical methods'),
            ('5.5', 'Optimal mixed strategies by converting games to linear programs')]),
        ('6', 'REC', 'Recurrence relations', [
            ('6.1', 'Using recurrence relations to model problems'),
            ('6.2', 'Solving first and second order linear recurrence relations')]),
        ('7', 'DA', 'Decision analysis', [
            ('7.1', 'Use, construct and interpret decision trees'),
            ('7.2', 'Expected monetary values (EMVs) and utility')]),
    ]),
]

AS_OPTIONS = [
    ('FP1', 'Further Pure Mathematics 1', [
        ('1', 'Further trigonometry', [
            ('1.1', 'The t-formulae: derivation and use'),
            ('1.2', 'Applications of t-formulae to trigonometric identities'),
            ('1.3', 'Applications of t-formulae to solve trigonometric equations')]),
        ('2', 'Coordinate systems', [
            ('2.1', 'Cartesian equations for the parabola and rectangular hyperbola'),
            ('2.2', 'Parametric equations for the parabola and rectangular hyperbola'),
            ('2.3', 'The focus-directrix property of the parabola'),
            ('2.4', 'Tangents and normals to these curves'),
            ('2.5', 'Simple loci problems')]),
        ('3', 'Further vectors', [
            ('3.1', 'The vector product a × b of two vectors'),
            ('3.2', 'Applications of the vector product'),
            ('3.3', 'The scalar triple product a · (b × c)')]),
        ('4', 'Numerical methods', [
            ('4.1', 'Numerical solution of first and second order differential equations')]),
        ('5', 'Inequalities', [
            ('5.1', 'The manipulation and solution of algebraic inequalities and inequations')]),
    ]),
    ('FP2', 'Further Pure Mathematics 2', [
        ('1', 'Groups', [
            ('1.1', 'The axioms of a group'),
            ('1.2', 'Examples of groups; Cayley tables; cyclic groups'),
            ('1.3', 'Order of a group and order of an element'),
            ('1.4', "Lagrange's theorem")]),
        ('2', 'Further matrix algebra', [
            ('2.1', 'Eigenvalues and eigenvectors of 2 × 2 matrices'),
            ('2.2', 'Reduction of matrices to diagonal form'),
            ('2.3', 'The Cayley-Hamilton theorem')]),
        ('3', 'Further complex numbers', [
            ('3.1', 'Further loci and regions in the Argand diagram')]),
        ('4', 'Number theory', [
            ('4.1', 'The division theorem and the Euclidean algorithm'),
            ('4.2', "Bezout's identity"),
            ('4.3', 'Modular arithmetic'),
            ('4.4', 'Divisibility tests')]),
        ('5', 'Further sequences and series', [
            ('5.1', 'First order recurrence relations'),
            ('5.2', 'Solving recurrence relations to obtain closed forms'),
            ('5.3', 'Proof by induction of closed forms')]),
    ]),
    ('FS1', 'Further Statistics 1', [
        ('1', 'Discrete probability distributions', [
            ('1.1', 'Mean and variance of discrete probability distributions')]),
        ('2', 'Poisson and binomial distributions', [
            ('2.1', 'The Poisson distribution'),
            ('2.2', 'Mean and variance of the binomial and Poisson distributions'),
            ('2.3', 'The Poisson distribution as an approximation to the binomial'),
            ('2.4', 'Hypothesis tests for the mean of a Poisson distribution')]),
        ('3', 'Chi-squared tests', [
            ('3.1', 'Goodness of fit tests and contingency tables')]),
    ]),
    ('FS2', 'Further Statistics 2', [
        ('1', 'Linear regression', [
            ('1.1', 'Least squares linear regression'),
            ('1.2', 'Residuals')]),
        ('2', 'Continuous probability distributions', [
            ('2.1', 'Continuous random variables'),
            ('2.2', 'Relationship between probability density and cumulative distribution functions'),
            ('2.3', 'Mean and variance of continuous random variables'),
            ('2.4', 'The continuous uniform (rectangular) distribution')]),
        ('3', 'Correlation', [
            ('3.1', 'The product moment correlation coefficient'),
            ('3.2', "Spearman's rank correlation coefficient, its use and interpretation"),
            ('3.3', 'Testing the hypothesis that a correlation is zero')]),
    ]),
    ('FM1', 'Further Mechanics 1', [
        ('1', 'Momentum and impulse', [
            ('1.1', 'Momentum and impulse; the impulse-momentum principle')]),
        ('2', 'Work, energy and power', [
            ('2.1', 'Kinetic and potential energy, work and power; the work-energy principle')]),
        ('3', 'Elastic collisions in one dimension', [
            ('3.1', "Direct impact of elastic spheres; Newton's law of restitution"),
            ('3.2', 'Successive direct impacts of spheres and/or a sphere with a plane surface')]),
    ]),
    ('FM2', 'Further Mechanics 2', [
        ('1', 'Motion in a circle', [
            ('1.1', 'Angular speed; radial acceleration in circular motion')]),
        ('2', 'Centres of mass of plane figures', [
            ('2.1', 'Moment of a force; centre of mass of a discrete mass distribution'),
            ('2.2', 'Centre of mass of uniform plane figures and simple composite figures')]),
        ('3', 'Further kinematics', [
            ('3.1', 'Straight-line kinematics when acceleration is a function of time')]),
    ]),
    ('D1', 'Decision Mathematics 1', [
        ('1', 'Algorithms and graph theory', [
            ('1.1', 'Algorithms and implementing an algorithm given by a flow chart or text'),
            ('1.2', 'Bin packing, bubble sort and quick sort'),
            ('1.3', 'Order of nodes: Eulerian, semi-Eulerian or neither')]),
        ('2', 'Algorithms on graphs', [
            ('2.1', "Minimum spanning trees: Prim's and Kruskal's algorithms"),
            ('2.2', "Dijkstra's algorithm for the shortest path")]),
        ('3', 'Algorithms on graphs II', [
            ('3.1', 'Route inspection: shortest route travelling along every edge at least once')]),
        ('4', 'Critical path analysis', [
            ('4.1', 'Modelling a project by an activity network from a precedence table'),
            ('4.2', 'Completing the precedence table for a given activity network'),
            ('4.3', 'Finding the critical path; earliest and latest event times'),
            ('4.4', 'Total float; Gantt (cascade) charts')]),
        ('5', 'Linear programming', [
            ('5.1', 'Formulation of problems as linear programs'),
            ('5.2', 'Graphical solution using objective line and vertex methods')]),
    ]),
    ('D2', 'Decision Mathematics 2', [
        ('1', 'Allocation (assignment) problems', [
            ('1.1', 'Cost matrix reduction'),
            ('1.2', 'The Hungarian algorithm for a least cost allocation'),
            ('1.3', 'Modifying the Hungarian algorithm for a maximum profit allocation')]),
        ('2', 'Flows in networks', [
            ('2.1', 'Cuts and their capacity'),
            ('2.2', 'Labelling procedure to augment a flow to a maximum flow'),
            ('2.3', 'Max-flow min-cut theorem to prove a flow is maximal')]),
        ('3', 'Game theory', [
            ('3.1', 'Two person zero-sum games and the pay-off matrix'),
            ('3.2', 'Play-safe strategies and stable solutions (saddle points)'),
            ('3.3', 'Optimal mixed strategies by graphical methods')]),
        ('4', 'Recurrence relations', [
            ('4.1', 'Using recurrence relations to model problems'),
            ('4.2', 'Solving first order linear recurrence relations')]),
    ]),
]

# Earlier seeded ids → the official points that cover that meaning.
cp = lambda *codes: [f'EDX_FMATH_CP_{c}' for c in codes]
opt = lambda module, *codes: [f'EDX_FMATH_{module}_{c}' for c in codes]
LEGACY_POINTS = {
    'EDX_FMATH_CP_PROOF_1.1': cp('1.1'),
    'EDX_FMATH_CP_COMPLEX_2.1': cp('2.1', '2.3'),
    'EDX_FMATH_CP_COMPLEX_2.2': cp('2.2'),
    'EDX_FMATH_CP_COMPLEX_2.3': cp('2.4', '2.5', '2.6'),
    'EDX_FMATH_CP_COMPLEX_2.4': cp('2.7'),
    'EDX_FMATH_CP_COMPLEX_2.5': cp('2.8'),
    'EDX_FMATH_CP_COMPLEX_2.6': cp('2.9', '2.10', '2.11'),
    'EDX_FMATH_CP_MATRICES_3.1': cp('3.1', '3.2'),
    'EDX_FMATH_CP_MATRICES_3.2': cp('3.3', '3.4'),
    'EDX_FMATH_CP_MATRICES_3.3': cp('3.5', '3.6'),
    'EDX_FMATH_CP_MATRICES_3.4': cp('3.7', '3.8'),
    'EDX_FMATH_CP_ALG_4.1': cp('4.1'),
    'EDX_FMATH_CP_ALG_4.2': cp('4.2'),
    'EDX_FMATH_CP_ALG_4.3': cp('4.3'),
    'EDX_FMATH_CP_ALG_4.4': cp('4.4'),
    'EDX_FMATH_CP_ALG_4.5': cp('4.5', '4.6'),
    'EDX_FMATH_CP_CALC_5.1': cp('5.2'),
    'EDX_FMATH_CP_CALC_5.2': cp('5.1'),
    'EDX_FMATH_CP_CALC_5.3': cp('5.3'),
    'EDX_FMATH_CP_CALC_5.4': cp('5.4'),
    'EDX_FMATH_CP_CALC_5.5': cp('5.5', '5.6'),
    'EDX_FMATH_CP_VECTORS_6.1': cp('6.1'),
    'EDX_FMATH_CP_VECTORS_6.2': cp('6.2'),
    'EDX_FMATH_CP_VECTORS_6.3': cp('6.3', '6.4'),
    'EDX_FMATH_CP_VECTORS_6.4': cp('6.5'),
    'EDX_FMATH_CP_POLAR_7.1': cp('7.1'),
    'EDX_FMATH_CP_POLAR_7.2': cp('7.2'),
    'EDX_FMATH_CP_POLAR_7.3': cp('7.3'),
    'EDX_FMATH_CP_HYP_8.1': cp('8.1'),
    'EDX_FMATH_CP_HYP_8.2': cp('8.2'),
    'EDX_FMATH_CP_HYP_8.3': cp('8.3', '8.4'),
    'EDX_FMATH_CP_HYP_8.4': cp('8.5'),
    'EDX_FMATH_CP_DE_9.1': cp('9.1', '9.2'),
    'EDX_FMATH_CP_DE_9.2': cp('9.4', '9.6'),
    'EDX_FMATH_CP_DE_9.3': cp('9.5'),
    'EDX_FMATH_CP_DE_9.4': cp('9.7', '9.8'),
    'EDX_FMATH_CP_DE_9.5': cp('9.9'),
    'EDX_FMATH_FP1_TRIG_1.1': opt('FP1', '1.1', '1.2', '1.3'),
    'EDX_FMATH_FP1_CALC_2.1': opt('FP1', '2.1'),
    'EDX_FMATH_FP1_CALC_2.2': opt('FP1', '2.2', '2.4'),
    'EDX_FMATH_FP1_CALC_2.3': opt('FP1', '2.3'),
    'EDX_FMATH_FP1_CALC_2.4': opt('FP1', '2.5'),
    'EDX_FMATH_FP1_DE_3.1': opt('FP1', '3.1'),
    'EDX_FMATH_FP1_DE_3.2': opt('FP1', '3.2'),
    'EDX_FMATH_FP1_CONICS_4.1': opt('FP1', '4.1'),
    'EDX_FMATH_FP1_CONICS_4.2': opt('FP1', '4.1', '4.2'),
    'EDX_FMATH_FP1_CONICS_4.3': opt('FP1', '4.3', '4.4'),
    'EDX_FMATH_FP1_VEC_5.1': opt('FP1', '5.1'),
    'EDX_FMATH_FP1_VEC_5.2': opt('FP1', '5.2'),
    'EDX_FMATH_FP1_VEC_5.3': opt('FP1', '5.3'),
    'EDX_FMATH_FP1_NUM_6.1': opt('FP1', '6.1'),
    'EDX_FMATH_FP1_NUM_6.2': opt('FP1', '6.2'),
    'EDX_FMATH_FP1_INEQ_7.1': opt('FP1', '7.1'),
    'EDX_FMATH_FS1_DRV_1.1': opt('FS1', '1.1'),
    'EDX_FMATH_FS1_POISSON_2.1': opt('FS1', '2.1', '2.2'),
    'EDX_FMATH_FS1_POISSON_2.2': opt('FS1', '2.3'),
    'EDX_FMATH_FS1_GEO_3.1': opt('FS1', '3.1', '3.2', '3.3'),
    'EDX_FMATH_FS1_HYP_4.1': opt('FS1', '4.1', '4.2'),
    'EDX_FMATH_FS1_CLT_5.1': opt('FS1', '5.1'),
    'EDX_FMATH_FS1_CHI_6.1': opt('FS1', '6.1'),
    'EDX_FMATH_FS1_CHI_6.2': opt('FS1', '6.1'),
    'EDX_FMATH_FS1_PGF_7.1': opt('FS1', '7.1', '7.2', '7.3'),
    'EDX_FMATH_FS1_QUAL_8.1': opt('FS1', '8.1'),
    'EDX_FMATH_FM1_MOM_1.1': opt('FM1', '1.1', '1.2'),
    'EDX_FMATH_FM1_WEP_2.1': opt('FM1', '2.1'),
    'EDX_FMATH_FM1_WEP_2.2': opt('FM1', '2.1'),
    'EDX_FMATH_FM1_ELASTIC_3.1': opt('FM1', '3.1', '3.2'),
    'EDX_FMATH_FM1_COLL1_4.1': opt('FM1', '4.1', '4.2'),
    'EDX_FMATH_FM1_COLL2_5.1': opt('FM1', '5.1', '5.2'),
    'EDX_FMATH_D1_ALG_1.1': opt('D1', '1.1', '1.2'),
    'EDX_FMATH_D1_ALG_1.2': opt('D1', '1.3', '1.4'),
    'EDX_FMATH_D1_GRAPHS_2.1': opt('D1', '2.1'),
    'EDX_FMATH_D1_GRAPHS_2.2': opt('D1', '2.2'),
    'EDX_FMATH_D1_GRAPHS_2.3': opt('D1', '3.1', '3.2'),
    'EDX_FMATH_D1_CPA_3.1': opt('D1', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6'),
    'EDX_FMATH_D1_LP_4.1': opt('D1', '5.1', '5.2'),
    'EDX_FMATH_D1_LP_4.2': opt('D1', '5.3', '5.4'),
    'EDX_FMATH_FP2_GROUPS_1.1': opt('FP2', '1.1', '1.2', '1.3', '1.4', '1.5'),
    'EDX_FMATH_FP2_CALC_2.1': opt('FP2', '2.1'),
    'EDX_FMATH_FP2_CALC_2.2': opt('FP2', '2.2'),
    'EDX_FMATH_FP2_MATRIX_3.1': opt('FP2', '3.1', '3.2'),
    'EDX_FMATH_FP2_MATRIX_3.2': opt('FP2', '3.3'),
    'EDX_FMATH_FP2_COMPLEX_4.1': opt('FP2', '4.1', '4.2'),
    'EDX_FMATH_FP2_NUMBER_5.1': opt('FP2', '5.1', '5.2', '5.3', '5.6'),
    'EDX_FMATH_FP2_NUMBER_5.2': opt('FP2', '5.4', '5.7'),
    'EDX_FMATH_FP2_RECUR_6.1': opt('FP2', '6.1', '6.2', '6.3'),
    'EDX_FMATH_FS2_REG_1.1': opt('FS2', '1.1', '1.2'),
    'EDX_FMATH_FS2_CONT_2.1': opt('FS2', '2.1', '2.2', '2.3', '2.4'),
    'EDX_FMATH_FS2_CORR_3.1': opt('FS2', '3.1', '3.2', '3.3'),
    'EDX_FMATH_FS2_COMB_4.1': opt('FS2', '4.1'),
    'EDX_FMATH_FS2_EST_5.1': opt('FS2', '5.1', '5.2', '5.3', '5.4', '5.5', '6.1', '6.2', '7.1', '7.2', '7.3'),
    'EDX_FMATH_FM2_CIRC_1.1': opt('FM2', '1.1', '1.2'),
    'EDX_FMATH_FM2_COM_2.1': opt('FM2', '2.1', '2.2'),
    'EDX_FMATH_FM2_COM_2.2': opt('FM2', '3.1', '3.3'),
    'EDX_FMATH_FM2_DYN_3.1': opt('FM2', '4.1', '4.2'),
    'EDX_FMATH_FM2_KIN_4.1': opt('FM2', '5.1'),
    'EDX_FMATH_D2_TRANS_1.1': opt('D2', '1.1', '1.2', '1.3'),
    'EDX_FMATH_D2_TRANS_1.2': opt('D2', '2.1', '2.2'),
    'EDX_FMATH_D2_FLOWS_2.1': opt('D2', '3.1', '3.2', '3.3', '3.4', '3.5'),
    'EDX_FMATH_D2_DP_3.1': opt('D2', '4.1'),
    'EDX_FMATH_D2_DP_3.2': opt('D2', '5.1', '5.2', '5.3', '5.4', '5.5'),
    'EDX_FMATH_D2_REC_4.1': opt('D2', '6.1', '6.2'),
    'EDX_FMATH_D2_REC_4.2': opt('D2', '7.1', '7.2'),
}
# Earlier topic ids that no longer name the same topic → the official points of their old meaning.
LEGACY_TOPICS = {
    'EDX_FMATH_FM2_DYN': opt('FM2', '4.1', '4.2'),      # was topic 3, now topic 4 (id kept below)
    'EDX_FMATH_FM2_KIN': opt('FM2', '5.1'),
    'EDX_FMATH_FS2_EST': opt('FS2', '5.1', '5.2', '5.3', '5.4', '5.5', '6.1', '6.2', '7.1', '7.2', '7.3'),
    'EDX_FMATH_D1_GRAPHS': opt('D1', '2.1', '2.2', '3.1', '3.2'),
    'EDX_FMATH_D1_CPA': opt('D1', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6'),
    'EDX_FMATH_D1_LP': opt('D1', '5.1', '5.2', '5.3', '5.4'),
    'EDX_FMATH_D2_TRANS': opt('D2', '1.1', '1.2', '1.3', '2.1', '2.2'),
    'EDX_FMATH_D2_FLOWS': opt('D2', '3.1', '3.2', '3.3', '3.4', '3.5'),
    'EDX_FMATH_D2_DP': opt('D2', '4.1', '5.1', '5.2', '5.3', '5.4', '5.5'),
    'EDX_FMATH_D2_REC': opt('D2', '6.1', '6.2', '7.1', '7.2'),
}
# Topic ids whose topic is unchanged in meaning keep their id; those listed in
# LEGACY_TOPICS are retired so a saved tick expands to the right points.
RETIRED_TOPIC_IDS = set(LEGACY_TOPICS)


def topic_id(prefix, suffix):
    candidate = f'{prefix}_{suffix}'
    return candidate if candidate not in RETIRED_TOPIC_IDS else f'{candidate}_T'


def build():
    sections, order = [], []
    # Core Pure
    topics = []
    for code, suffix, title, points in CORE_PURE:
        pts = []
        for pcode, ptitle, also_as in points:
            pid = f'EDX_FMATH_CP_{pcode}'
            quals = [A, AS] if also_as else [A]
            pts.append({'id': pid, 'code': pcode, 'title': ptitle, 'qualifications': quals,
                        'introduced_year': 12 if also_as else 13,
                        'official_reference': {'module': 'CP', 'statement': pcode, 'qualifications': quals}})
            order.append(pid)
        topics.append({'id': f'EDX_FMATH_CP_{suffix}', 'code': code, 'title': title, 'kind': 'topic', 'points': pts})
    sections.append({'id': 'EDX_FMATH_SEC_CP', 'code': 'CP', 'title': 'Core Pure Mathematics',
                     'note': 'Mandatory · A-Level 9FM0/01 and 9FM0/02 · AS 8FM0/01 assesses the points marked AS',
                     'module_id': 'CP', 'qualifications': [A, AS], 'topics': topics})
    # A-Level options
    for module, title, paper, mtopics in A_LEVEL_OPTIONS:
        topics = []
        for code, suffix, ttitle, points in mtopics:
            pts = []
            for pcode, ptitle in points:
                pid = f'EDX_FMATH_{module}_{pcode}'
                pts.append({'id': pid, 'code': pcode, 'title': ptitle, 'qualifications': [A],
                            'official_reference': {'module': module, 'paper': f'9FM0/{paper}', 'statement': pcode,
                                                   'qualifications': [A]}})
                order.append(pid)
            topics.append({'id': topic_id(f'EDX_FMATH_{module}', suffix), 'code': code, 'title': ttitle,
                           'kind': 'topic', 'points': pts})
        sections.append({'id': f'EDX_FMATH_SEC_{module}', 'code': paper, 'title': f'{title} (A-Level)',
                         'note': f'A-Level optional paper 9FM0/{paper}', 'module_id': module,
                         'qualifications': [A], 'topics': topics})
    # AS options
    for module, title, mtopics in AS_OPTIONS:
        topics = []
        for code, ttitle, points in mtopics:
            pts = []
            for pcode, ptitle in points:
                pid = f'EDX_FMATH_AS_{module}_{pcode}'
                pts.append({'id': pid, 'code': pcode, 'title': ptitle, 'qualifications': [AS], 'introduced_year': 12,
                            'official_reference': {'module': module, 'paper': '8FM0/02', 'statement': pcode,
                                                   'qualifications': [AS]}})
                order.append(pid)
            topics.append({'id': f'EDX_FMATH_AS_{module}_T{code}', 'code': code, 'title': ttitle,
                           'kind': 'topic', 'points': pts})
        sections.append({'id': f'EDX_FMATH_SEC_AS_{module}', 'code': f'AS {module}', 'title': f'{title} (AS)',
                         'note': 'AS Paper 2 option module (8FM0/02); AS content differs from the A-Level paper of the same name',
                         'module_id': module, 'qualifications': [AS], 'topics': topics})

    leaf_ids = set(order)
    legacy = {**LEGACY_POINTS, **LEGACY_TOPICS}
    for old, new in legacy.items():
        missing = [n for n in new if n not in leaf_ids]
        if missing:
            raise SystemExit(f'{old} maps to unknown points {missing}')
        if old in leaf_ids:
            raise SystemExit(f'{old} is still a live leaf')
    assert len(order) == len(leaf_ids), 'duplicate point id'
    return {
        'subject_id': 'EDX_ALEVEL_FMATH_9FM0',
        'specification_version': 'pearson-9fm0-issue4-2023-06+8fm0-issue5-2025-07',
        'order_status': 'verified',
        'official_source': {
            'a_level': {'code': A, 'issue': 'Issue 4', 'date': 'June 2023', 'url': A_URL, 'first_assessment': 'June 2019'},
            'as': {'code': AS, 'issue': 'Issue 5', 'date': 'July 2025', 'url': AS_URL, 'first_assessment': 'June 2018'},
            'transcription': 'Public specification PDFs read as extracted text on 2026-11-19; point titles are the '
                             'opening wording of each official content point. Source PDF checksums were not '
                             'recorded because qualifications.pearson.com was refused by the build host proxy.',
            'textbook_organisation': 'unavailable — no textbook contents supplied for Further Mathematics',
        },
        'legacy_ids': legacy,
        'point_order': order,
        'sections': sections,
    }


if __name__ == '__main__':
    spec = build()
    target = REPO / 'data/specs/EDX_ALEVEL_FMATH_9FM0.json'
    target.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + '\n')
    leaves = len(spec['point_order'])
    print(f'wrote {target.relative_to(REPO)}: {len(spec["sections"])} sections, {leaves} points, '
          f'{len(spec["legacy_ids"])} legacy ids')
