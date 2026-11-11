// Specification trees — GCSE STEM subjects. Format documented in alevel-stem.mjs.
// A trailing {H} marks Higher-tier-only content.
//
// The sciences follow the Pearson Edexcel GCSE (9–1) specifications: 1BI0, 1CH0, 1PH0 and
// Combined Science 1SC0. Each builder takes `separate`: true adds the content that only the
// separate ("triple") science studies, false gives the Combined Science version of the topics.

const BIOLOGY = (separate) => [
  ['B1', '1', 'Key concepts in biology', [
    '1.1|Cell structures: animal, plant and bacterial cells; specialised cells',
    '1.2|Microscopy and magnification calculations',
    '1.3|Enzymes: how they work, factors affecting activity, and digestion',
    '1.4|Transport: diffusion, osmosis and active transport',
    ...(separate ? ['1.5|Food tests and calorimetry'] : []),
  ]],
  ['B2', '2', 'Cells and control', [
    '2.1|Mitosis, the cell cycle and growth',
    '2.2|Stem cells and differentiation',
    '2.3|The nervous system: neurones, synapses and reflex arcs',
    ...(separate ? ['2.4|The brain and the eye'] : []),
  ]],
  ['B3', '3', 'Genetics', [
    '3.1|Meiosis, DNA structure and the genome',
    '3.2|Alleles and inheritance: genetic diagrams, Punnett squares and family pedigrees',
    '3.3|Variation, mutation and the Human Genome Project',
    ...(separate ? ['3.4|Sexual and asexual reproduction; protein synthesis', '3.5|Mendel, blood groups and sex-linked inheritance'] : []),
  ]],
  ['B4', '4', 'Natural selection and genetic modification', [
    '4.1|Evolution by natural selection; evidence for human evolution',
    '4.2|Classification: five kingdoms and three domains',
    '4.3|Selective breeding and genetic engineering',
    ...(separate ? ['4.4|Tissue culture, GM crops, fertilisers and biological control'] : []),
  ]],
  ['B5', '5', 'Health, disease and the development of medicines', [
    '5.1|Health, communicable and non-communicable disease',
    '5.2|Pathogens, the spread of disease and prevention',
    '5.3|The immune system and immunisation',
    '5.4|Antibiotics and the development of new medicines',
    '5.5|Lifestyle factors, cardiovascular disease and BMI',
    ...(separate ? ['5.6|Plant defences, plant diseases and monoclonal antibodies'] : []),
  ]],
  ['B6', '6', 'Plant structures and their functions', [
    '6.1|Photosynthesis and limiting factors',
    '6.2|Roots, xylem and phloem: transpiration and translocation',
    ...(separate ? ['6.3|Leaf adaptations and plant hormones'] : []),
  ]],
  ['B7', '7', 'Animal coordination, control and homeostasis', [
    '7.1|Hormones and the endocrine system',
    '7.2|The menstrual cycle, contraception and fertility treatment',
    '7.3|Homeostasis: control of blood glucose and diabetes',
    ...(separate ? ['7.4|Thermoregulation, osmoregulation and the kidneys'] : []),
  ]],
  ['B8', '8', 'Exchange and transport in animals', [
    '8.1|Exchange surfaces, surface area to volume ratio and the alveoli',
    '8.2|Blood, blood vessels and the heart',
    '8.3|Aerobic and anaerobic respiration',
  ]],
  ['B9', '9', 'Ecosystems and material cycles', [
    '9.1|Ecosystems, interdependence, and abiotic and biotic factors',
    '9.2|Fieldwork: quadrats and belt transects',
    '9.3|Human effects on ecosystems and biodiversity',
    '9.4|The carbon, water and nitrogen cycles',
    ...(separate ? ['9.5|Food security, decomposition and energy transfer between trophic levels'] : []),
  ]],
];

const CHEMISTRY = (separate) => [
  ['C1', '1', 'Key concepts in chemistry', [
    '1.1|Atomic structure: subatomic particles, isotopes and relative atomic mass',
    '1.2|The periodic table and electronic configurations',
    '1.3|Ionic bonding',
    '1.4|Covalent bonding',
    '1.5|Types of substance: ionic, simple molecular, giant covalent and metallic',
    '1.6|Calculations involving masses: formulae, conservation of mass and moles',
  ]],
  ['C2', '2', 'States of matter and mixtures', [
    '2.1|States of matter',
    '2.2|Methods of separating and purifying substances; drinking water',
  ]],
  ['C3', '3', 'Chemical changes', [
    '3.1|Acids, alkalis, neutralisation and making salts',
    '3.2|Electrolytic processes',
  ]],
  ['C4', '4', 'Extracting metals and equilibria', [
    '4.1|Obtaining and using metals: reactivity, extraction, recycling and life cycle assessment',
    '4.2|Reversible reactions and equilibria',
  ]],
  ...(separate
    ? [['C5', '5', 'Separate chemistry 1', [
        '5.1|Transition metals, alloys and corrosion',
        '5.2|Quantitative analysis: yield, atom economy, concentrations and gas volumes',
        '5.3|Dynamic equilibria and fertilisers',
        '5.4|Chemical cells and fuel cells',
      ]]]
    : []),
  ['C6', '6', 'Groups in the periodic table', [
    '6.1|Group 1: the alkali metals',
    '6.2|Group 7: the halogens',
    '6.3|Group 0: the noble gases',
  ]],
  ['C7', '7', 'Rates of reaction and energy changes', [
    '7.1|Rates of reaction, collision theory and catalysts',
    '7.2|Heat energy changes in chemical reactions',
  ]],
  ['C8', '8', 'Fuels and Earth science', [
    '8.1|Fuels: crude oil, fractional distillation, combustion and cracking',
    '8.2|Earth and atmospheric science: the atmosphere and climate change',
  ]],
  ...(separate
    ? [['C9', '9', 'Separate chemistry 2', [
        '9.1|Qualitative analysis: tests for ions',
        '9.2|Hydrocarbons, polymers, alcohols and carboxylic acids',
        '9.3|Bulk and surface properties of matter including nanoparticles',
      ]]]
    : []),
];

const PHYSICS = (separate) => [
  ['P1', '1', 'Key concepts of physics', [
    '1.1|SI units, prefixes, standard form and significant figures',
  ]],
  ['P2', '2', 'Motion and forces', [
    '2.1|Scalars, vectors, speed and velocity',
    '2.2|Acceleration, motion graphs and equations of motion',
    "2.3|Newton's laws, weight and resultant forces",
    '2.4|Momentum and its conservation {H}',
    '2.5|Stopping distances and road safety',
  ]],
  ['P3', '3', 'Conservation of energy', [
    '3.1|Energy stores and transfers; kinetic and gravitational potential energy',
    '3.2|Efficiency and reducing unwanted energy transfers',
    '3.3|Renewable and non-renewable energy sources',
  ]],
  ['P4', '4', 'Waves', [
    '4.1|Wave properties: transverse and longitudinal waves; the wave equation',
    '4.2|Refraction and waves at boundaries',
    ...(separate ? ['4.3|Sound, ultrasound and infrasound'] : []),
  ]],
  ['P5', '5', 'Light and the electromagnetic spectrum', [
    '5.1|The electromagnetic spectrum: properties, uses and dangers',
    ...(separate ? ['5.2|Reflection, lenses and colour', '5.3|Radiation and temperature'] : []),
  ]],
  ['P6', '6', 'Radioactivity', [
    '6.1|Atomic models, isotopes and electron energy levels',
    '6.2|Alpha, beta and gamma radiation; background radiation and nuclear equations',
    '6.3|Half-life',
    '6.4|Dangers of radioactivity: contamination and irradiation',
    ...(separate ? ['6.5|Uses of radioactivity; nuclear fission, fusion and nuclear power'] : []),
  ]],
  ...(separate
    ? [['P7', '7', 'Astronomy', [
        '7.1|The Solar System, gravity and orbits',
        '7.2|The life cycle of stars',
        '7.3|Red-shift, the Big Bang and the expanding Universe',
      ]]]
    : []),
  ['P8', '8', 'Energy – forces doing work', [
    '8.1|Work done, power and energy transfers',
  ]],
  ['P9', '9', 'Forces and their effects', [
    '9.1|Interacting objects, free body diagrams and resultant forces',
    ...(separate ? ['9.2|Moments, levers and gears'] : []),
  ]],
  ['P10', '10', 'Electricity and circuits', [
    '10.1|Charge, current and potential difference',
    '10.2|Resistance, series and parallel circuits, and circuit components',
    '10.3|Electrical power and energy transfer',
    '10.4|Mains electricity and safety',
  ]],
  ...(separate
    ? [['P11', '11', 'Static electricity', [
        '11.1|Charging, electric fields, and uses and dangers of static electricity',
      ]]]
    : []),
  ['P12', '12', 'Magnetism and the motor effect', [
    '12.1|Magnets, magnetic fields and electromagnetism',
    '12.2|The motor effect {H}',
  ]],
  ['P13', '13', 'Electromagnetic induction', [
    '13.1|Transformers and the National Grid',
    ...(separate ? ['13.2|Induced potential difference, generators and microphones {H}'] : []),
  ]],
  ['P14', '14', 'Particle model', [
    '14.1|Density and states of matter',
    '14.2|Specific heat capacity and specific latent heat',
    '14.3|Gas pressure and temperature',
  ]],
  ['P15', '15', 'Forces and matter', [
    "15.1|Elastic and inelastic distortion; Hooke's law",
    ...(separate ? ['15.2|Pressure in fluids and upthrust'] : []),
  ]],
];

/** Separate sciences: Topic 1 is examined on both papers, the rest are split between them. */
const twoPapers = (topics, paper1Count, paper1Note, paper2Note) => [
  { key: 'KEY', title: 'Both papers', note: 'Topic 1 is assessed on Paper 1 and Paper 2', topics: topics.slice(0, 1) },
  { key: 'P1', title: 'Paper 1', note: paper1Note, topics: topics.slice(1, 1 + paper1Count) },
  { key: 'P2', title: 'Paper 2', note: paper2Note, topics: topics.slice(1 + paper1Count) },
];

export default {
  EDX_GCSE_MATH_1MA1: [
    { key: 'CONTENT', title: 'Subject content', note: 'Assessed across all three papers', topics: [
      ['NUM', '1', 'Number', [
        '1.1|Place value, ordering and the four operations',
        '1.2|Fractions, decimals and percentages',
        '1.3|Factors, multiples, primes, HCF and LCM',
        '1.4|Powers, roots and the laws of indices',
        '1.5|Standard form',
        '1.6|Rounding, estimation, bounds and error intervals',
        '1.7|Surds and recurring decimals {H}',
        '1.8|Fractional and negative indices {H}',
      ]],
      ['ALG', '2', 'Algebra', [
        '2.1|Notation, simplifying, expanding and factorising',
        '2.2|Substitution, formulae and rearranging',
        '2.3|Linear equations and inequalities',
        '2.4|Sequences and the nth term',
        '2.5|Straight-line graphs: gradient and y = mx + c',
        '2.6|Quadratics: expanding, factorising and solving',
        '2.7|Simultaneous equations',
        '2.8|Quadratic, cubic, reciprocal and real-life graphs',
        '2.9|Quadratic formula and completing the square {H}',
        '2.10|Algebraic fractions {H}',
        '2.11|Functions, composite and inverse functions {H}',
        '2.12|Graph transformations, circles and gradients of curves {H}',
        '2.13|Iteration {H}',
        '2.14|Algebraic proof {H}',
      ]],
      ['RATIO', '3', 'Ratio, proportion and rates of change', [
        '3.1|Ratio notation and sharing in a ratio',
        '3.2|Direct and inverse proportion',
        '3.3|Percentage change, reverse percentages and interest',
        '3.4|Compound measures: speed, density and pressure',
        '3.5|Units, conversions and scale',
        '3.6|Growth, decay and compound interest',
      ]],
      ['GEOM', '4', 'Geometry and measures', [
        '4.1|Angles in lines, parallel lines and polygons',
        '4.2|Properties of shapes; congruence and similarity',
        '4.3|Perimeter and area, including circles and sectors',
        '4.4|Volume and surface area',
        '4.5|Transformations',
        '4.6|Constructions, loci and bearings',
        "4.7|Pythagoras' theorem",
        '4.8|Right-angled trigonometry and exact values',
        '4.9|Vectors',
        '4.10|Circle theorems {H}',
        '4.11|Sine rule, cosine rule and area of a triangle {H}',
        '4.12|Pythagoras and trigonometry in 3D {H}',
      ]],
      ['PROB', '5', 'Probability', [
        '5.1|Probability scale, single events and relative frequency',
        '5.2|Sample spaces, two-way tables and Venn diagrams',
        '5.3|Tree diagrams and independent events',
        '5.4|Conditional probability {H}',
      ]],
      ['STAT', '6', 'Statistics', [
        '6.1|Sampling and data collection',
        '6.2|Averages and range',
        '6.3|Charts, time series and frequency polygons',
        '6.4|Scatter graphs and correlation',
        '6.5|Cumulative frequency and box plots {H}',
        '6.6|Histograms {H}',
      ]],
    ] },
  ],

  EDX_GCSE_COMBSCI_1SC0: [
    { key: 'BIO', title: 'Biology', note: 'Papers 1 and 2 (Biology 1 and Biology 2)', topics: BIOLOGY(false) },
    { key: 'CHEM', title: 'Chemistry', note: 'Papers 3 and 4 (Chemistry 1 and Chemistry 2)', topics: CHEMISTRY(false) },
    { key: 'PHYS', title: 'Physics', note: 'Papers 5 and 6 (Physics 1 and Physics 2)', topics: PHYSICS(false) },
  ],

  EDX_GCSE_BIOL_1BI0: twoPapers(BIOLOGY(true), 4, 'Topics 2–5', 'Topics 6–9'),
  EDX_GCSE_CHEM_1CH0: twoPapers(CHEMISTRY(true), 4, 'Topics 2–5', 'Topics 6–9'),
  EDX_GCSE_PHYS_1PH0: twoPapers(PHYSICS(true), 6, 'Topics 2–7', 'Topics 8–15'),

  OCR_GCSE_CS_J277: [
    { key: 'C1', title: 'Component 01: Computer systems', topics: [
      ['1.1', '1.1', 'Systems architecture', [
        '1.1.1|Architecture of the CPU',
        '1.1.2|CPU performance',
        '1.1.3|Embedded systems',
      ]],
      ['1.2', '1.2', 'Memory and storage', [
        '1.2.1|Primary storage (memory)',
        '1.2.2|Secondary storage',
        '1.2.3|Units',
        '1.2.4|Data storage: numbers, characters, images and sound',
        '1.2.5|Compression',
      ]],
      ['1.3', '1.3', 'Computer networks, connections and protocols', [
        '1.3.1|Networks and topologies',
        '1.3.2|Wired and wireless networks, protocols and layers',
      ]],
      ['1.4', '1.4', 'Network security', [
        '1.4.1|Threats to computer systems and networks',
        '1.4.2|Identifying and preventing vulnerabilities',
      ]],
      ['1.5', '1.5', 'Systems software', [
        '1.5.1|Operating systems',
        '1.5.2|Utility software',
      ]],
      ['1.6', '1.6', 'Ethical, legal, cultural and environmental impacts of digital technology', [
        '1.6.1|Ethical, legal, cultural and environmental impact',
      ]],
    ] },
    { key: 'C2', title: 'Component 02: Computational thinking, algorithms and programming', topics: [
      ['2.1', '2.1', 'Algorithms', [
        '2.1.1|Computational thinking',
        '2.1.2|Designing, creating and refining algorithms',
        '2.1.3|Searching and sorting algorithms',
      ]],
      ['2.2', '2.2', 'Programming fundamentals', [
        '2.2.1|Programming fundamentals',
        '2.2.2|Data types',
        '2.2.3|Additional programming techniques',
      ]],
      ['2.3', '2.3', 'Producing robust programs', [
        '2.3.1|Defensive design',
        '2.3.2|Testing',
      ]],
      ['2.4', '2.4', 'Boolean logic', [
        '2.4.1|Boolean logic',
      ]],
      ['2.5', '2.5', 'Programming languages and Integrated Development Environments', [
        '2.5.1|Languages',
        '2.5.2|The Integrated Development Environment (IDE)',
      ]],
    ] },
  ],
};
