// Specification trees — A-Level STEM subjects.
//
// Compact format (expanded by build.mjs into data/specs/<subject_id>.json):
//   section: { key, title, note?, topics: [ topic, ... ] }
//   topic:   [topicKey, code, title, [ 'pointCode|Point title', ... ], options? ]
// IDs: topic  = <sp_prefix>_<topicKey>            e.g. EDX_MATH_PURE_TRIG
//      point  = <sp_prefix>_<topicKey>_<code>     e.g. EDX_PHYS_M2_2.2
//      (numeric topic keys such as "2.1" give flat point ids: OCR_CHEM_2.1.3)
// Point codes are written out explicitly so ids stay stable when points are added.

export default {
  EDX_ALEVEL_MATH_9MA0: [
    { key: 'PURE', title: 'Pure Mathematics', note: 'Papers 1 & 2', topics: [
      ['PURE_PROOF', '1', 'Proof', [
        '1.1|Proof by deduction, proof by exhaustion and disproof by counter-example',
        '1.2|Proof by contradiction',
      ]],
      ['PURE_ALG', '2', 'Algebra and functions', [
        '2.1|Laws of indices for rational exponents',
        '2.2|Surds and rationalising denominators',
        '2.3|Quadratic functions: discriminant and completing the square',
        '2.4|Simultaneous equations (linear and quadratic)',
        '2.5|Linear and quadratic inequalities',
        '2.6|Polynomials: factor theorem, algebraic division and rational expressions',
        '2.7|Graphs of functions: sketching curves, modulus graphs and proportion',
        '2.8|Composite and inverse functions',
        '2.9|Transformations of graphs',
        '2.10|Partial fractions',
        '2.11|Functions in modelling',
      ]],
      ['PURE_COORD', '3', 'Coordinate geometry in the (x, y) plane', [
        '3.1|Straight lines: equations, parallel and perpendicular lines',
        '3.2|Circles: equation, tangents and chord properties',
        '3.3|Parametric equations of curves',
        '3.4|Parametric equations in modelling',
      ]],
      ['PURE_SEQ', '4', 'Sequences and series', [
        '4.1|Binomial expansion (positive integer and rational n)',
        '4.2|Sequences: nth term, recurrence relations, increasing, decreasing and periodic',
        '4.3|Sigma notation',
        '4.4|Arithmetic sequences and series',
        '4.5|Geometric sequences and series, including sum to infinity',
        '4.6|Sequences and series in modelling',
      ]],
      ['PURE_TRIG', '5', 'Trigonometry', [
        '5.1|Sine and cosine rules, area of a triangle, radians, arc length and sector area',
        '5.2|Small angle approximations',
        '5.3|Graphs of sin, cos and tan; exact values',
        '5.4|Secant, cosecant, cotangent and the inverse trigonometric functions',
        '5.5|Trigonometric identities (including Pythagorean identities)',
        '5.6|Addition and double angle formulae; R cos(θ ± α) form',
        '5.7|Solving trigonometric equations',
        '5.8|Proofs involving trigonometric functions and identities',
        '5.9|Trigonometry in context (vectors, kinematics and forces)',
      ]],
      ['PURE_EXP', '6', 'Exponentials and logarithms', [
        '6.1|The functions a^x and e^x and their graphs',
        '6.2|Gradient of e^(kx)',
        '6.3|Logarithms as the inverse of exponentials; ln x',
        '6.4|Laws of logarithms',
        '6.5|Solving equations of the form a^x = b',
        '6.6|Logarithmic graphs to estimate parameters',
        '6.7|Exponential growth and decay in modelling',
      ]],
      ['PURE_DIFF', '7', 'Differentiation', [
        '7.1|Derivative as gradient and rate of change; first principles; second derivatives',
        '7.2|Differentiating x^n, e^(kx), a^(kx), sin kx, cos kx, tan kx and ln x',
        '7.3|Tangents, normals, stationary points, increasing and decreasing functions',
        '7.4|Product, quotient and chain rules; connected rates of change',
        '7.5|Implicit and parametric differentiation',
        '7.6|Constructing simple differential equations',
      ]],
      ['PURE_INT', '8', 'Integration', [
        '8.1|Fundamental theorem of calculus',
        '8.2|Integrating x^n, e^(kx), 1/x, sin kx and cos kx',
        '8.3|Definite integrals; area under a curve and between two curves',
        '8.4|Integration as the limit of a sum',
        '8.5|Integration by substitution and by parts',
        '8.6|Integration using partial fractions',
        '8.7|Separable first order differential equations',
        '8.8|Interpreting solutions of differential equations in context',
      ]],
      ['PURE_NUM', '9', 'Numerical methods', [
        '9.1|Locating roots by change of sign',
        '9.2|Iterative methods; cobweb and staircase diagrams',
        '9.3|The Newton–Raphson method',
        '9.4|Numerical integration: the trapezium rule',
        '9.5|Numerical methods in context',
      ]],
      ['PURE_VEC', '10', 'Vectors', [
        '10.1|Vectors in two and three dimensions',
        '10.2|Magnitude and direction of a vector',
        '10.3|Vector addition and multiplication by scalars',
        '10.4|Position vectors and the distance between two points',
        '10.5|Vectors in pure mathematics and in context (forces, kinematics)',
      ]],
    ] },
    { key: 'STATS', title: 'Statistics', note: 'Paper 3, Section A', topics: [
      ['STATS_SAMP', '1', 'Statistical sampling', [
        '1.1|Populations, samples and sampling techniques',
      ]],
      ['STATS_DATA', '2', 'Data presentation and interpretation', [
        '2.1|Histograms, box plots, cumulative frequency and frequency polygons',
        '2.2|Scatter diagrams, regression lines and correlation',
        '2.3|Measures of central tendency and variation',
        '2.4|Outliers, cleaning data and the large data set',
      ]],
      ['STATS_PROB', '3', 'Probability', [
        '3.1|Mutually exclusive and independent events; Venn and tree diagrams',
        '3.2|Conditional probability',
        '3.3|Modelling with probability',
      ]],
      ['STATS_DIST', '4', 'Statistical distributions', [
        '4.1|Discrete distributions and the binomial distribution',
        '4.2|The normal distribution',
        '4.3|Selecting a distribution; normal approximation to the binomial',
      ]],
      ['STATS_HYP', '5', 'Statistical hypothesis testing', [
        '5.1|Language of hypothesis testing; testing correlation coefficients',
        '5.2|Hypothesis tests for the binomial distribution',
        '5.3|Hypothesis tests for the mean of a normal distribution',
      ]],
    ] },
    { key: 'MECH', title: 'Mechanics', note: 'Paper 3, Section B', topics: [
      ['MECH_UNITS', '6', 'Quantities and units in mechanics', [
        '6.1|SI units and derived quantities',
      ]],
      ['MECH_KIN', '7', 'Kinematics', [
        '7.1|Language of kinematics: position, displacement, velocity, acceleration',
        '7.2|Kinematics graphs',
        '7.3|Constant acceleration (suvat) in one and two dimensions',
        '7.4|Calculus in kinematics (variable acceleration)',
        '7.5|Projectiles',
      ]],
      ['MECH_FORCES', '8', "Forces and Newton's laws", [
        "8.1|The concept of a force; Newton's first law",
        "8.2|Newton's second law; resolving forces in two dimensions",
        '8.3|Weight and motion under gravity',
        "8.4|Newton's third law; connected particles and pulleys",
        '8.5|Resultant forces and dynamics for motion in a plane',
        '8.6|Friction and the coefficient of friction; statics',
      ]],
      ['MECH_MOM', '9', 'Moments', [
        '9.1|Moments in simple static contexts',
      ]],
    ] },
  ],

  EDX_ALEVEL_FMATH_9FM0: [
    { key: 'CP', title: 'Core Pure Mathematics', note: 'Papers 1 & 2', topics: [
      ['CP_PROOF', '1', 'Proof', [
        '1.1|Proof by mathematical induction (series, divisibility, matrices)',
      ]],
      ['CP_COMPLEX', '2', 'Complex numbers', [
        '2.1|Solving polynomial equations with real coefficients; conjugate pairs',
        '2.2|Arithmetic of complex numbers in the form x + iy',
        '2.3|Argand diagrams; modulus–argument form',
        '2.4|Loci and regions in the Argand diagram',
        "2.5|De Moivre's theorem and its applications",
        '2.6|Exponential form; nth roots and roots of unity',
      ]],
      ['CP_MATRICES', '3', 'Matrices', [
        '3.1|Matrix arithmetic; zero and identity matrices',
        '3.2|Linear transformations in 2D and 3D; invariant points and lines',
        '3.3|Determinants and inverses of 2×2 and 3×3 matrices',
        '3.4|Solving simultaneous equations; intersections of three planes',
      ]],
      ['CP_ALG', '4', 'Further algebra and functions', [
        '4.1|Roots and coefficients of polynomial equations',
        '4.2|Transforming the roots of an equation',
        '4.3|Summation of series: Σr, Σr² and Σr³',
        '4.4|Method of differences',
        '4.5|Maclaurin series',
      ]],
      ['CP_CALC', '5', 'Further calculus', [
        '5.1|Improper integrals',
        '5.2|Volumes of revolution',
        '5.3|Mean value of a function',
        '5.4|Integration using partial fractions with quadratic factors',
        '5.5|Differentiating and integrating with inverse trigonometric functions',
      ]],
      ['CP_VECTORS', '6', 'Further vectors', [
        '6.1|Vector and Cartesian equations of a line in 3D',
        '6.2|Vector and Cartesian equations of a plane',
        '6.3|Scalar product; angles between lines and planes',
        '6.4|Intersections and shortest distances',
      ]],
      ['CP_POLAR', '7', 'Polar coordinates', [
        '7.1|Polar coordinates and converting to and from Cartesian form',
        '7.2|Sketching polar curves',
        '7.3|Area enclosed by a polar curve',
      ]],
      ['CP_HYP', '8', 'Hyperbolic functions', [
        '8.1|Definitions and graphs of sinh, cosh and tanh',
        '8.2|Differentiating and integrating hyperbolic functions',
        '8.3|Inverse hyperbolic functions and their logarithmic forms',
        '8.4|Integration using hyperbolic substitutions',
      ]],
      ['CP_DE', '9', 'Differential equations', [
        '9.1|First order equations: integrating factor',
        '9.2|Second order homogeneous equations',
        '9.3|Second order non-homogeneous equations',
        '9.4|Simple and damped harmonic motion',
        '9.5|Coupled first order differential equations',
      ]],
    ] },
    { key: 'FP1', title: 'Further Pure Mathematics 1', note: 'Option paper 3A', topics: [
      ['FP1_TRIG', '1', 'Further trigonometry', ['1.1|The t-formulae and their applications']],
      ['FP1_CALC', '2', 'Further calculus', ["2.1|Taylor series", "2.2|Limits and L'Hospital's rule", "2.3|Leibnitz's theorem", '2.4|The Weierstrass substitution']],
      ['FP1_DE', '3', 'Further differential equations', ['3.1|Taylor series solutions', '3.2|Reducible differential equations']],
      ['FP1_CONICS', '4', 'Coordinate systems', ['4.1|Parabola and rectangular hyperbola', '4.2|Ellipse and hyperbola', '4.3|Tangents, normals and loci']],
      ['FP1_VEC', '5', 'Further vectors', ['5.1|Vector product', '5.2|Scalar triple product', '5.3|Applications to lines and planes']],
      ['FP1_NUM', '6', 'Further numerical methods', ["6.1|Euler's method and the midpoint method", "6.2|Simpson's rule"]],
      ['FP1_INEQ', '7', 'Inequalities', ['7.1|Algebraic and modulus inequalities']],
    ] },
    { key: 'FS1', title: 'Further Statistics 1', note: 'Option paper 3B', topics: [
      ['FS1_DRV', '1', 'Discrete probability distributions', ['1.1|Mean and variance of discrete random variables']],
      ['FS1_POISSON', '2', 'Poisson and binomial distributions', ['2.1|The Poisson distribution', '2.2|Poisson approximation to the binomial']],
      ['FS1_GEO', '3', 'Geometric and negative binomial distributions', ['3.1|Geometric and negative binomial models']],
      ['FS1_HYP', '4', 'Hypothesis testing', ['4.1|Tests for the Poisson and geometric distributions']],
      ['FS1_CLT', '5', 'Central limit theorem', ['5.1|Applying the central limit theorem']],
      ['FS1_CHI', '6', 'Chi-squared tests', ['6.1|Goodness of fit', '6.2|Contingency tables']],
      ['FS1_PGF', '7', 'Probability generating functions', ['7.1|Definition, mean and variance from a p.g.f.']],
      ['FS1_QUAL', '8', 'Quality of tests', ['8.1|Type I and Type II errors; size and power']],
    ] },
    { key: 'FM1', title: 'Further Mechanics 1', note: 'Option paper 3C', topics: [
      ['FM1_MOM', '1', 'Momentum and impulse', ['1.1|Momentum and impulse in one and two dimensions']],
      ['FM1_WEP', '2', 'Work, energy and power', ['2.1|Kinetic and potential energy; work–energy principle', '2.2|Power']],
      ['FM1_ELASTIC', '3', 'Elastic strings and springs', ["3.1|Hooke's law and elastic potential energy"]],
      ['FM1_COLL1', '4', 'Elastic collisions in one dimension', ["4.1|Newton's law of restitution and successive impacts"]],
      ['FM1_COLL2', '5', 'Elastic collisions in two dimensions', ['5.1|Oblique impacts']],
    ] },
    { key: 'D1', title: 'Decision Mathematics 1', note: 'Option paper 3D', topics: [
      ['D1_ALG', '1', 'Algorithms and graph theory', ['1.1|Sorting and bin packing algorithms', '1.2|Graphs and networks']],
      ['D1_GRAPHS', '2', 'Algorithms on graphs', ["2.1|Minimum spanning trees (Kruskal's and Prim's)", "2.2|Shortest paths (Dijkstra's and Floyd's)", '2.3|Route inspection and the travelling salesman problem']],
      ['D1_CPA', '3', 'Critical path analysis', ['3.1|Activity networks, float and scheduling']],
      ['D1_LP', '4', 'Linear programming', ['4.1|Formulation and graphical solution', '4.2|The Simplex algorithm']],
    ] },
    { key: 'FP2', title: 'Further Pure Mathematics 2', note: 'Option paper 4A', topics: [
      ['FP2_GROUPS', '1', 'Groups', ["1.1|Group axioms, Cayley tables and Lagrange's theorem"]],
      ['FP2_CALC', '2', 'Further calculus', ['2.1|Reduction formulae', '2.2|Arc length and area of a surface of revolution']],
      ['FP2_MATRIX', '3', 'Further matrix algebra', ['3.1|Eigenvalues, eigenvectors and diagonalisation', '3.2|The Cayley–Hamilton theorem']],
      ['FP2_COMPLEX', '4', 'Further complex numbers', ['4.1|Loci and transformations of the complex plane']],
      ['FP2_NUMBER', '5', 'Number theory', ["5.1|Euclid's algorithm and modular arithmetic", "5.2|Fermat's little theorem and combinatorics"]],
      ['FP2_RECUR', '6', 'Further sequences and series', ['6.1|First and second order recurrence relations']],
    ] },
    { key: 'FS2', title: 'Further Statistics 2', note: 'Option paper 4B', topics: [
      ['FS2_REG', '1', 'Linear regression', ['1.1|Least squares regression and residuals']],
      ['FS2_CONT', '2', 'Continuous probability distributions', ['2.1|Probability density and cumulative distribution functions']],
      ['FS2_CORR', '3', 'Correlation', ["3.1|Product moment and Spearman's rank correlation"]],
      ['FS2_COMB', '4', 'Combinations of random variables', ['4.1|Linear combinations of independent normal variables']],
      ['FS2_EST', '5', 'Estimation, confidence intervals and tests', ['5.1|Normal, t, chi-squared and F distributions in inference']],
    ] },
    { key: 'FM2', title: 'Further Mechanics 2', note: 'Option paper 4C', topics: [
      ['FM2_CIRC', '1', 'Motion in a circle', ['1.1|Horizontal and vertical circular motion']],
      ['FM2_COM', '2', 'Centres of mass', ['2.1|Plane figures and frameworks', '2.2|Solids by calculus; toppling and sliding']],
      ['FM2_DYN', '3', 'Further dynamics', ['3.1|Variable forces and simple harmonic motion']],
      ['FM2_KIN', '4', 'Further kinematics', ['4.1|Acceleration as a function of time, displacement or velocity']],
    ] },
    { key: 'D2', title: 'Decision Mathematics 2', note: 'Option paper 4D', topics: [
      ['D2_TRANS', '1', 'Transportation and allocation problems', ['1.1|Transportation problems', '1.2|The Hungarian algorithm']],
      ['D2_FLOWS', '2', 'Flows in networks', ['2.1|Maximum flow – minimum cut']],
      ['D2_DP', '3', 'Dynamic programming and game theory', ['3.1|Dynamic programming', '3.2|Game theory']],
      ['D2_REC', '4', 'Recurrence relations and decision analysis', ['4.1|Recurrence relations', '4.2|Decision trees']],
    ] },
  ],

  EDX_ALEVEL_BIOL_9BN0: [
    { key: 'P1', title: 'Paper 1 topics', note: 'Topics 1–6 are assessed on Paper 1', topics: [
      ['T1', '1', 'Lifestyle, Health and Risk', [
        '1.1|The heart, blood vessels and mass transport',
        '1.2|The cardiac cycle, blood clotting and atherosclerosis',
        '1.3|Water as a solvent and its dipole nature',
        '1.4|Carbohydrates: monosaccharides, disaccharides and polysaccharides',
        '1.5|Lipids: triglycerides, saturated and unsaturated fats',
        '1.6|Risk factors for cardiovascular disease; correlation and causation',
        '1.7|Energy budgets, diet and obesity indicators',
        '1.8|Treatments for cardiovascular disease',
      ]],
      ['T2', '2', 'Genes and Health', [
        "2.1|Gas exchange surfaces and Fick's law",
        '2.2|Cell membranes and transport across them',
        '2.3|Protein structure and amino acids',
        '2.4|Enzymes: mechanism of action and factors affecting rate',
        '2.5|DNA and RNA structure; DNA replication',
        '2.6|The genetic code and protein synthesis',
        '2.7|Gene mutations and cystic fibrosis',
        '2.8|Monohybrid inheritance and pedigree diagrams',
        '2.9|Genetic screening and its ethical issues',
      ]],
      ['T3', '3', 'Voice of the Genome', [
        '3.1|Cell ultrastructure: eukaryotic and prokaryotic cells',
        '3.2|Protein trafficking: the role of the rER and Golgi apparatus',
        '3.3|Gametes and fertilisation',
        '3.4|Meiosis and genetic variation',
        '3.5|The cell cycle and mitosis',
        '3.6|Stem cells and differentiation',
        '3.7|Gene expression and epigenetics',
        '3.8|Phenotype, environment and polygenic inheritance',
      ]],
      ['T4', '4', 'Biodiversity and Natural Resources', [
        '4.1|Biodiversity, endemism and how they are measured',
        '4.2|Niches, adaptation and natural selection',
        '4.3|The Hardy–Weinberg equation and reproductive isolation',
        '4.4|Classification and the three domains',
        '4.5|Plant cell structure; starch and cellulose',
        '4.6|Transport in plants: xylem, phloem and plant fibres',
        '4.7|Drug testing and antimicrobial properties of plants',
        '4.8|Sustainability and conservation (zoos and seed banks)',
      ]],
      ['T5', '5', 'On the Wild Side', [
        '5.1|Ecosystems, habitats and succession',
        '5.2|Photosynthesis: light-dependent and light-independent reactions',
        '5.3|Productivity and energy transfer between trophic levels',
        '5.4|Evidence for climate change',
        '5.5|The carbon cycle and the greenhouse effect',
        '5.6|Effects of climate change on organisms',
        '5.7|Evolution, speciation and how science is validated',
      ]],
      ['T6', '6', 'Immunity, Infection and Forensics', [
        '6.1|Forensics: estimating time of death',
        '6.2|DNA profiling, PCR and gel electrophoresis',
        '6.3|Bacteria and viruses: structure and infection (TB and HIV)',
        '6.4|Non-specific immune responses',
        '6.5|The specific immune response: B and T cells',
        '6.6|Types of immunity and vaccination',
        '6.7|Antibiotics and antibiotic resistance',
      ]],
    ] },
    { key: 'P2', title: 'Paper 2 topics', note: 'Topics 7–8 are assessed on Paper 2 (with Topics 1–4)', topics: [
      ['T7', '7', 'Run for Your Life', [
        '7.1|Muscles, joints and the sliding filament theory',
        '7.2|Aerobic respiration: glycolysis, link reaction, Krebs cycle and oxidative phosphorylation',
        '7.3|Anaerobic respiration and lactate',
        '7.4|Control of heart rate and ventilation; ECGs and spirometry',
        '7.5|Homeostasis and thermoregulation',
        '7.6|Hormones, transcription factors and gene switching',
        '7.7|Sports injuries, medical technology and performance-enhancing substances',
      ]],
      ['T8', '8', 'Grey Matter', [
        '8.1|Neurones, resting potential and action potentials',
        '8.2|Synapses and neurotransmitters',
        '8.3|Nervous and hormonal coordination; plant responses',
        '8.4|The eye and the pupil reflex',
        '8.5|Brain structure, function and imaging',
        '8.6|Visual development, learning and habituation',
        '8.7|Brain chemistry, drugs and disease',
        '8.8|Genome sequencing and genetically modified organisms',
      ]],
    ] },
  ],

  OCR_ALEVEL_CHEM_H432: [
    { key: 'M1', title: 'Module 1: Development of practical skills', topics: [
      ['1.1', '1.1', 'Practical skills assessed in a written examination', [
        '1.1.1|Planning',
        '1.1.2|Implementing',
        '1.1.3|Analysis',
        '1.1.4|Evaluation',
      ]],
    ] },
    { key: 'M2', title: 'Module 2: Foundations in chemistry', topics: [
      ['2.1', '2.1', 'Atoms and reactions', [
        '2.1.1|Atomic structure and isotopes',
        '2.1.2|Compounds, formulae and equations',
        '2.1.3|Amount of substance',
        '2.1.4|Acids',
        '2.1.5|Redox',
      ]],
      ['2.2', '2.2', 'Electrons, bonding and structure', [
        '2.2.1|Electron structure',
        '2.2.2|Bonding and structure',
      ]],
    ] },
    { key: 'M3', title: 'Module 3: Periodic table and energy', topics: [
      ['3.1', '3.1', 'The periodic table', [
        '3.1.1|Periodicity',
        '3.1.2|Group 2',
        '3.1.3|The halogens',
        '3.1.4|Qualitative analysis',
      ]],
      ['3.2', '3.2', 'Physical chemistry', [
        '3.2.1|Enthalpy changes',
        '3.2.2|Reaction rates',
        '3.2.3|Chemical equilibrium',
      ]],
    ] },
    { key: 'M4', title: 'Module 4: Core organic chemistry', topics: [
      ['4.1', '4.1', 'Basic concepts and hydrocarbons', [
        '4.1.1|Basic concepts of organic chemistry',
        '4.1.2|Alkanes',
        '4.1.3|Alkenes',
      ]],
      ['4.2', '4.2', 'Alcohols, haloalkanes and analysis', [
        '4.2.1|Alcohols',
        '4.2.2|Haloalkanes',
        '4.2.3|Organic synthesis',
        '4.2.4|Analytical techniques (IR and mass spectrometry)',
      ]],
    ] },
    { key: 'M5', title: 'Module 5: Physical chemistry and transition elements', topics: [
      ['5.1', '5.1', 'Rates, equilibrium and pH', [
        '5.1.1|How fast? Rate equations, orders and the Arrhenius equation',
        '5.1.2|How far? Equilibrium constants Kc and Kp',
        '5.1.3|Acids, bases and buffers',
      ]],
      ['5.2', '5.2', 'Energy', [
        '5.2.1|Lattice enthalpy',
        '5.2.2|Enthalpy and entropy',
        '5.2.3|Redox and electrode potentials',
      ]],
      ['5.3', '5.3', 'Transition elements', [
        '5.3.1|Transition elements',
        '5.3.2|Qualitative analysis',
      ]],
    ] },
    { key: 'M6', title: 'Module 6: Organic chemistry and analysis', topics: [
      ['6.1', '6.1', 'Aromatic compounds, carbonyls and acids', [
        '6.1.1|Aromatic compounds',
        '6.1.2|Carbonyl compounds',
        '6.1.3|Carboxylic acids and esters',
      ]],
      ['6.2', '6.2', 'Nitrogen compounds, polymers and synthesis', [
        '6.2.1|Amines',
        '6.2.2|Amino acids, amides and chirality',
        '6.2.3|Polyesters and polyamides',
        '6.2.4|Carbon–carbon bond formation',
        '6.2.5|Organic synthesis',
      ]],
      ['6.3', '6.3', 'Analysis', [
        '6.3.1|Chromatography and qualitative analysis',
        '6.3.2|Spectroscopy (NMR and combined techniques)',
      ]],
    ] },
  ],

  EDX_ALEVEL_PHYS_9PH0: [
    { key: 'P1', title: 'Paper 1 topics', note: 'Advanced Physics I', topics: [
      ['M1', '1', 'Working as a Physicist', [
        '1.1|SI units, base and derived quantities, and estimation',
        '1.2|Practical skills, uncertainties and errors',
        '1.3|Applications and implications of science',
      ]],
      ['M2', '2', 'Mechanics', [
        '2.1|Equations of motion and motion graphs',
        '2.2|Scalars and vectors: resolving, combining and projectile motion',
        "2.3|Free-body diagrams and Newton's laws of motion",
        '2.4|Momentum and its conservation in one dimension',
        '2.5|Moments, centre of gravity and equilibrium',
        '2.6|Work, kinetic and gravitational potential energy; conservation of energy',
        '2.7|Power and efficiency',
      ]],
      ['M3', '3', 'Electric Circuits', [
        '3.1|Charge, current, potential difference and resistance',
        "3.2|Ohm's law and I–V characteristics",
        '3.3|Series and parallel circuits; conservation of charge and energy',
        '3.4|Resistivity and the transport equation I = nqvA',
        '3.5|Potential dividers, thermistors and LDRs',
        '3.6|E.m.f. and internal resistance',
        '3.7|Electrical power and energy',
      ]],
      ['M6', '6', 'Further Mechanics', [
        '6.1|Impulse and momentum in two dimensions',
        '6.2|Elastic and inelastic collisions',
        '6.3|Circular motion: angular velocity and centripetal force',
      ]],
      ['M7', '7', 'Electric and Magnetic Fields', [
        "7.1|Electric fields and Coulomb's law",
        '7.2|Electric potential and equipotentials',
        '7.3|Capacitance and energy stored by a capacitor',
        '7.4|Capacitor charge and discharge; time constant',
        '7.5|Magnetic flux density, flux and flux linkage',
        '7.6|Forces on current-carrying conductors and moving charges',
        "7.7|Electromagnetic induction: Faraday's and Lenz's laws",
        '7.8|Alternating currents: peak and r.m.s. values',
      ]],
      ['M8', '8', 'Nuclear and Particle Physics', [
        '8.1|The nuclear model of the atom and alpha scattering',
        '8.2|Particle accelerators and detectors',
        '8.3|Mass–energy equivalence and relativistic effects',
        '8.4|The standard model: quarks, leptons and conservation laws',
      ]],
    ] },
    { key: 'P2', title: 'Paper 2 topics', note: 'Advanced Physics II', topics: [
      ['M4', '4', 'Materials', [
        '4.1|Density and upthrust',
        "4.2|Viscous drag, Stokes' law and terminal velocity",
        "4.3|Hooke's law and elastic strain energy",
        '4.4|Stress, strain and the Young modulus',
      ]],
      ['M5', '5', 'Waves and the Particle Nature of Light', [
        '5.1|Wave properties and the wave equation',
        '5.2|Superposition, interference and stationary waves',
        "5.3|Refraction, Snell's law and total internal reflection",
        '5.4|Lenses: focal length, power and magnification',
        '5.5|Polarisation and diffraction; the diffraction grating',
        '5.6|Wave–particle duality and electron diffraction',
        '5.7|The photoelectric effect and photons',
        '5.8|Atomic line spectra and energy levels',
      ]],
      ['M9', '9', 'Thermodynamics', [
        '9.1|Specific heat capacity and specific latent heat',
        '9.2|Internal energy and absolute zero',
        '9.3|The ideal gas equation',
        '9.4|Kinetic theory of gases',
      ]],
      ['M10', '10', 'Space', [
        "10.1|Black body radiation: Stefan–Boltzmann and Wien's laws",
        '10.2|Intensity, luminosity and standard candles',
        '10.3|Astronomical distances and trigonometric parallax',
        '10.4|The Hertzsprung–Russell diagram and stellar evolution',
        "10.5|The Doppler effect, redshift and Hubble's law",
      ]],
      ['M11', '11', 'Nuclear Radiation', [
        '11.1|Binding energy, fission and fusion',
        '11.2|Alpha, beta and gamma radiation; background radiation',
        '11.3|Radioactive decay: activity, decay constant and half-life',
      ]],
      ['M12', '12', 'Gravitational Fields', [
        "12.1|Gravitational field strength and Newton's law of gravitation",
        '12.2|Gravitational potential in a radial field',
        '12.3|Orbital motion; comparing electric and gravitational fields',
      ]],
      ['M13', '13', 'Oscillations', [
        '13.1|Conditions for simple harmonic motion',
        '13.2|SHM equations, graphs and energy',
        '13.3|Free, damped and forced oscillations; resonance',
      ]],
    ] },
  ],

  OCR_ALEVEL_CS_H446: [
    { key: 'C1', title: 'Component 01: Computer systems', topics: [
      ['1.1', '1.1', 'The characteristics of contemporary processors, input, output and storage devices', [
        '1.1.1|Structure and function of the processor',
        '1.1.2|Types of processor',
        '1.1.3|Input, output and storage',
      ]],
      ['1.2', '1.2', 'Software and software development', [
        '1.2.1|Systems software',
        '1.2.2|Applications generation',
        '1.2.3|Software development',
        '1.2.4|Types of programming language',
      ]],
      ['1.3', '1.3', 'Exchanging data', [
        '1.3.1|Compression, encryption and hashing',
        '1.3.2|Databases',
        '1.3.3|Networks',
        '1.3.4|Web technologies',
      ]],
      ['1.4', '1.4', 'Data types, data structures and algorithms', [
        '1.4.1|Data types',
        '1.4.2|Data structures',
        '1.4.3|Boolean algebra',
      ]],
      ['1.5', '1.5', 'Legal, moral, cultural and ethical issues', [
        '1.5.1|Computing related legislation',
        '1.5.2|Moral and ethical issues',
      ]],
    ] },
    { key: 'C2', title: 'Component 02: Algorithms and programming', topics: [
      ['2.1', '2.1', 'Elements of computational thinking', [
        '2.1.1|Thinking abstractly',
        '2.1.2|Thinking ahead',
        '2.1.3|Thinking procedurally',
        '2.1.4|Thinking logically',
        '2.1.5|Thinking concurrently',
      ]],
      ['2.2', '2.2', 'Problem solving and programming', [
        '2.2.1|Programming techniques',
        '2.2.2|Computational methods',
      ]],
      ['2.3', '2.3', 'Algorithms', [
        '2.3.1|Algorithms: analysis, design, sorting, searching and path finding',
      ]],
    ] },
  ],
};
