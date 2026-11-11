// Specification trees — GCSE humanities, languages, applied and creative subjects.
// Format documented in alevel-stem.mjs.

export default {
  AQA_GCSE_ENGLANG_8700: [
    { key: 'P1', title: 'Paper 1: Explorations in creative reading and writing', topics: [
      ['P1READ', 'A', 'Section A: Reading (one literature fiction text)', [
        'A.1|Question 1: identifying explicit information',
        'A.2|Question 2: analysing language',
        'A.3|Question 3: analysing structure',
        'A.4|Question 4: critical evaluation',
      ], { kind: 'skill' }],
      ['P1WRITE', 'B', 'Section B: Writing', [
        'B.1|Question 5: descriptive or narrative writing',
      ], { kind: 'skill' }],
    ] },
    { key: 'P2', title: "Paper 2: Writers' viewpoints and perspectives", topics: [
      ['P2READ', 'A', 'Section A: Reading (two linked non-fiction texts)', [
        'A.1|Question 1: identifying true statements',
        'A.2|Question 2: summarising differences or similarities',
        'A.3|Question 3: analysing language',
        "A.4|Question 4: comparing writers' viewpoints and methods",
      ], { kind: 'skill' }],
      ['P2WRITE', 'B', 'Section B: Writing', [
        'B.1|Question 5: writing to present a viewpoint',
      ], { kind: 'skill' }],
    ] },
  ],

  EDUQAS_GCSE_ENGLIT_C720QS: [
    { key: 'C1', title: 'Component 1: Shakespeare and Poetry', topics: [
      ['SHAKES', 'A', 'Section A: Shakespeare', [
        'A.1|Romeo and Juliet',
        'A.2|Macbeth',
        'A.3|Othello',
        'A.4|Much Ado About Nothing',
        'A.5|Henry V',
        'A.6|The Merchant of Venice',
      ], { kind: 'set_text' }],
      ['ANTH', 'B', 'Section B: Poetry from 1789 to the present day', [
        'B.1|Anthology poem: single poem response',
        'B.2|Anthology poems: comparison',
      ], { kind: 'skill' }],
    ] },
    { key: 'C2', title: 'Component 2: Post-1914 Prose/Drama, 19th Century Prose and Unseen Poetry', topics: [
      ['POST1914', 'A', 'Section A: Post-1914 prose/drama', [
        'A.1|An Inspector Calls',
        'A.2|Blood Brothers',
        'A.3|Lord of the Flies',
        'A.4|Never Let Me Go',
      ], { kind: 'set_text' }],
      ['C19', 'B', 'Section B: 19th century prose', [
        'B.1|A Christmas Carol',
        'B.2|The Strange Case of Dr Jekyll and Mr Hyde',
        'B.3|Jane Eyre',
        'B.4|Pride and Prejudice',
        'B.5|Silas Marner',
        'B.6|The War of the Worlds',
      ], { kind: 'set_text' }],
      ['UNSEEN', 'C', 'Section C: Unseen poetry', [
        'C.1|Unseen poem: single poem response',
        'C.2|Unseen poems: comparison',
      ], { kind: 'skill' }],
    ] },
  ],

  AQA_GCSE_GEOG_8035: [
    { key: 'P1', title: 'Paper 1: Living with the physical environment', topics: [
      ['HAZ', '3.1.1', 'The challenge of natural hazards', [
        '1.1|Natural hazards',
        '1.2|Tectonic hazards',
        '1.3|Weather hazards: tropical storms and UK extreme weather',
        '1.4|Climate change',
      ]],
      ['LIVING', '3.1.2', 'The living world', [
        '2.1|Ecosystems',
        '2.2|Tropical rainforests',
        '2.3|Hot deserts',
        '2.4|Cold environments',
      ]],
      ['UKLAND', '3.1.3', 'Physical landscapes in the UK', [
        '3.1|UK physical landscapes',
        '3.2|Coastal landscapes in the UK',
        '3.3|River landscapes in the UK',
        '3.4|Glacial landscapes in the UK',
      ]],
    ] },
    { key: 'P2', title: 'Paper 2: Challenges in the human environment', topics: [
      ['URBAN', '3.2.1', 'Urban issues and challenges', [
        '4.1|Global urbanisation and a city in an LIC or NEE',
        '4.2|Urban change in the UK',
        '4.3|Urban sustainability',
      ]],
      ['ECON', '3.2.2', 'The changing economic world', [
        '5.1|Global variations in economic development and quality of life',
        '5.2|Strategies for reducing the global development gap',
        '5.3|Rapid economic development in an LIC or NEE',
        '5.4|Economic futures in the UK',
      ]],
      ['RES', '3.2.3', 'The challenge of resource management', [
        '6.1|Resource management: food, water and energy in the UK',
        '6.2|Food',
        '6.3|Water',
        '6.4|Energy',
      ]],
    ] },
    { key: 'P3', title: 'Paper 3: Geographical applications', topics: [
      ['APP', '3.3', 'Geographical applications and skills', [
        '7.1|Issue evaluation',
        '7.2|Fieldwork',
        '7.3|Geographical skills: maps, graphs, numbers and statistics',
      ], { kind: 'skill' }],
    ] },
  ],

  EDX_GCSE_HIST_1HI0: [
    { key: 'P1', title: 'Paper 1: Thematic study and historic environment', note: 'Tick the option your school studies', topics: [
      ['MED', '11', 'Medicine in Britain, c1250–present', [
        '11.1|c1250–c1500: Medicine in medieval England',
        '11.2|c1500–c1700: The Medical Renaissance in England',
        '11.3|c1700–c1900: Medicine in eighteenth- and nineteenth-century Britain',
        '11.4|c1900–present: Medicine in modern Britain',
        '11.5|Historic environment: the British sector of the Western Front, 1914–18',
      ], { kind: 'option' }],
      ['CRIME', '10', 'Crime and punishment in Britain, c1000–present', [
        '10.1|c1000–c1500: Crime and punishment in medieval England',
        '10.2|c1500–c1700: Crime and punishment in early modern England',
        '10.3|c1700–c1900: Crime and punishment in eighteenth- and nineteenth-century Britain',
        '10.4|c1900–present: Crime and punishment in modern Britain',
        '10.5|Historic environment: Whitechapel, c1870–c1900',
      ], { kind: 'option' }],
    ] },
    { key: 'P2', title: 'Paper 2: Period study and British depth study', note: 'Tick the options your school studies', topics: [
      ['COLDWAR', 'P4', 'Superpower relations and the Cold War, 1941–91', [
        'P4.1|The origins of the Cold War, 1941–58',
        'P4.2|Cold War crises, 1958–70',
        'P4.3|The end of the Cold War, 1970–91',
      ], { kind: 'option' }],
      ['AMWEST', 'P3', 'The American West, c1835–c1895', [
        'P3.1|The early settlement of the West, c1835–c1862',
        'P3.2|Development of the plains, c1862–c1876',
        'P3.3|Conflicts and conquest, c1876–c1895',
      ], { kind: 'option' }],
      ['ELIZ', 'B4', 'Early Elizabethan England, 1558–88', [
        'B4.1|Queen, government and religion, 1558–69',
        'B4.2|Challenges to Elizabeth at home and abroad, 1569–88',
        'B4.3|Elizabethan society in the Age of Exploration, 1558–88',
      ], { kind: 'option' }],
      ['NORMAN', 'B1', 'Anglo-Saxon and Norman England, c1060–88', [
        'B1.1|Anglo-Saxon England and the Norman Conquest, 1060–66',
        'B1.2|William I in power: securing the kingdom, 1066–87',
        'B1.3|Norman England, 1066–88',
      ], { kind: 'option' }],
    ] },
    { key: 'P3', title: 'Paper 3: Modern depth study', note: 'Tick the option your school studies', topics: [
      ['GERMANY', '31', 'Weimar and Nazi Germany, 1918–39', [
        '31.1|The Weimar Republic, 1918–29',
        "31.2|Hitler's rise to power, 1919–33",
        '31.3|Nazi control and dictatorship, 1933–39',
        '31.4|Life in Nazi Germany, 1933–39',
      ], { kind: 'option' }],
      ['USA', '33', 'The USA, 1954–75: conflict at home and abroad', [
        '33.1|The development of the civil rights movement, 1954–60',
        '33.2|Protest, progress and radicalism, 1960–75',
        '33.3|US involvement in the Vietnam War, 1954–75',
        '33.4|Reactions to, and the end of, US involvement in Vietnam, 1964–75',
      ], { kind: 'option' }],
      ['RUSSIA', '30', 'Russia and the Soviet Union, 1917–41', [
        '30.1|The revolutions of 1917',
        '30.2|The Bolsheviks in power, 1917–24',
        "30.3|Stalin's rise to power and dictatorship, 1924–41",
        '30.4|Economic and social changes, 1924–41',
      ], { kind: 'option' }],
    ] },
  ],

  AQA_GCSE_RS_8062: [
    { key: 'P1', title: 'Paper 1: The study of religions', topics: [
      ['CHR', '3.1.2', 'Christianity', [
        '1.1|Christianity: beliefs and teachings',
        '1.2|Christianity: practices',
      ]],
      ['ISL', '3.1.5', 'Islam', [
        '2.1|Islam: beliefs and teachings',
        '2.2|Islam: practices',
      ]],
    ] },
    { key: 'P2', title: 'Paper 2: Thematic studies', note: 'Four themes are studied', topics: [
      ['THEMES', '3.2', 'Religious, philosophical and ethical studies', [
        'A|Theme A: Relationships and families',
        'B|Theme B: Religion and life',
        'C|Theme C: The existence of God and revelation',
        'D|Theme D: Religion, peace and conflict',
        'E|Theme E: Religion, crime and punishment',
        'F|Theme F: Religion, human rights and social justice',
      ], { kind: 'option' }],
    ] },
  ],

  AQA_GCSE_SPAN_8698: [
    { key: 'THEMES', title: 'Themes', topics: [
      ['T1', '1', 'Theme 1: Identity and culture', [
        '1.1|Me, my family and friends',
        '1.2|Technology in everyday life',
        '1.3|Free-time activities',
        '1.4|Customs and festivals in Spanish-speaking countries',
      ]],
      ['T2', '2', 'Theme 2: Local, national, international and global areas of interest', [
        '2.1|Home, town, neighbourhood and region',
        '2.2|Social issues',
        '2.3|Global issues',
        '2.4|Travel and tourism',
      ]],
      ['T3', '3', 'Theme 3: Current and future study and employment', [
        '3.1|My studies',
        '3.2|Life at school and college',
        '3.3|Education post-16',
        '3.4|Jobs, career choices and ambitions',
      ]],
    ] },
    { key: 'SKILLS', title: 'Skills', topics: [
      ['SK', '4', 'Reading, writing and translation skills', [
        '4.1|Reading comprehension',
        '4.2|Translation into English',
        '4.3|Translation into Spanish',
        '4.4|Structured and open-ended writing',
        '4.5|Grammar',
      ], { kind: 'skill' }],
    ] },
  ],

  EDX_GCSE_BUS_1BS0: [
    { key: 'T1', title: 'Theme 1: Investigating small business', note: 'Paper 1', topics: [
      ['1.1', '1.1', 'Enterprise and entrepreneurship', [
        '1.1.1|The dynamic nature of business',
        '1.1.2|Risk and reward',
        '1.1.3|The role of business enterprise',
      ]],
      ['1.2', '1.2', 'Spotting a business opportunity', [
        '1.2.1|Customer needs',
        '1.2.2|Market research',
        '1.2.3|Market segmentation',
        '1.2.4|The competitive environment',
      ]],
      ['1.3', '1.3', 'Putting a business idea into practice', [
        '1.3.1|Business aims and objectives',
        '1.3.2|Business revenues, costs and profits',
        '1.3.3|Cash and cash-flow',
        '1.3.4|Sources of business finance',
      ]],
      ['1.4', '1.4', 'Making the business effective', [
        '1.4.1|The options for start-up and small businesses',
        '1.4.2|Business location',
        '1.4.3|The marketing mix',
        '1.4.4|Business plans',
      ]],
      ['1.5', '1.5', 'Understanding external influences on business', [
        '1.5.1|Business stakeholders',
        '1.5.2|Technology and business',
        '1.5.3|Legislation and business',
        '1.5.4|The economy and business',
        '1.5.5|External influences',
      ]],
    ] },
    { key: 'T2', title: 'Theme 2: Building a business', note: 'Paper 2', topics: [
      ['2.1', '2.1', 'Growing the business', [
        '2.1.1|Business growth',
        '2.1.2|Changes in business aims and objectives',
        '2.1.3|Business and globalisation',
        '2.1.4|Ethics, the environment and business',
      ]],
      ['2.2', '2.2', 'Making marketing decisions', [
        '2.2.1|Product',
        '2.2.2|Price',
        '2.2.3|Promotion',
        '2.2.4|Place',
        '2.2.5|Using the marketing mix to make business decisions',
      ]],
      ['2.3', '2.3', 'Making operational decisions', [
        '2.3.1|Business operations',
        '2.3.2|Working with suppliers',
        '2.3.3|Managing quality',
        '2.3.4|The sales process',
      ]],
      ['2.4', '2.4', 'Making financial decisions', [
        '2.4.1|Business calculations',
        '2.4.2|Understanding business performance',
      ]],
      ['2.5', '2.5', 'Making human resource decisions', [
        '2.5.1|Organisational structures',
        '2.5.2|Effective recruitment',
        '2.5.3|Effective training and development',
        '2.5.4|Motivation',
      ]],
    ] },
  ],

  AQA_GCSE_PSYCH_8182: [
    { key: 'P1', title: 'Paper 1: Cognition and behaviour', topics: [
      ['MEMORY', '3.1.1', 'Memory', [
        '1.1|Processes and structures of memory; the multi-store model',
        '1.2|Memory as an active process and factors affecting accuracy',
      ]],
      ['PERCEPT', '3.1.2', 'Perception', [
        "2.1|Sensation, perception, visual cues and constancies",
        "2.2|Gibson's and Gregory's theories; visual illusions",
        '2.3|Factors affecting perception',
      ]],
      ['DEVELOP', '3.1.3', 'Development', [
        "3.1|Early brain development and Piaget's stage theory",
        '3.2|The effects of learning on development (Dweck and Willingham)',
      ]],
      ['RM', '3.1.4', 'Research methods', [
        '4.1|Hypotheses, variables, sampling and experimental design',
        '4.2|Ethics, correlation and data handling',
      ]],
    ] },
    { key: 'P2', title: 'Paper 2: Social context and behaviour', topics: [
      ['SOCIAL', '3.2.1', 'Social influence', [
        '5.1|Conformity and obedience',
        '5.2|Prosocial behaviour, crowd and collective behaviour',
      ]],
      ['LANG', '3.2.2', 'Language, thought and communication', [
        '6.1|The relationship between language and thought',
        '6.2|Human and animal communication; non-verbal communication',
      ]],
      ['BRAIN', '3.2.3', 'Brain and neuropsychology', [
        '7.1|Structure and function of the nervous system and neurons',
        '7.2|Structure and function of the brain; neuropsychology',
      ]],
      ['PROBLEMS', '3.2.4', 'Psychological problems', [
        '8.1|An introduction to mental health',
        '8.2|Depression: types, theories and therapies',
        '8.3|Addiction: theories and therapies',
      ]],
    ] },
  ],

  EDUQAS_GCSE_DRAMA_C690QS: [
    { key: 'C3', title: 'Component 3: Interpreting theatre', topics: [
      ['SETTEXT', 'A', 'Section A: Set text', [
        'A.1|Interpreting the set text as a performer',
        'A.2|Interpreting the set text as a director',
        'A.3|Interpreting the set text as a designer',
        'A.4|Social, historical and cultural context of the set text',
      ], { kind: 'skill' }],
      ['LIVE', 'B', 'Section B: Live theatre review', [
        'B.1|Analysing and evaluating acting in a live production',
        'B.2|Analysing and evaluating design in a live production',
      ], { kind: 'skill' }],
    ] },
  ],

  OCR_GCSE_PE_J587: [
    { key: 'C1', title: 'Component 01: Physical factors affecting performance', topics: [
      ['1.1', '1.1', 'Applied anatomy and physiology', [
        '1.1.a|The structure and function of the skeletal system',
        '1.1.b|The structure and function of the muscular system',
        '1.1.c|Movement analysis: levers, planes and axes',
        '1.1.d|The cardiovascular and respiratory systems',
        '1.1.e|Effects of exercise on body systems',
      ]],
      ['1.2', '1.2', 'Physical training', [
        '1.2.a|Components of fitness',
        '1.2.b|Applying the principles of training',
        '1.2.c|Preventing injury in physical activity and training',
      ]],
    ] },
    { key: 'C2', title: 'Component 02: Socio-cultural issues and sports psychology', topics: [
      ['2.1', '2.1', 'Socio-cultural influences', [
        '2.1.a|Engagement patterns of different social groups in physical activities and sports',
        '2.1.b|Commercialisation of physical activity and sport',
        '2.1.c|Ethical and socio-cultural issues in physical activity and sport',
      ]],
      ['2.2', '2.2', 'Sports psychology', [
        '2.2.a|Characteristics of skilful movement and classification of skills',
        '2.2.b|Goal setting, mental preparation, guidance and feedback',
      ]],
      ['2.3', '2.3', 'Health, fitness and well-being', [
        '2.3.a|Health, fitness and well-being',
        '2.3.b|Diet and nutrition',
      ]],
    ] },
  ],

  EDUQAS_GCSE_FOOD_C560P1: [
    { key: 'C1', title: 'Component 1: Principles of food preparation and nutrition', topics: [
      ['A1', '1', 'Food commodities', [
        '1.1|Cereals, bread, rice, potatoes and pasta',
        '1.2|Fruit and vegetables',
        '1.3|Milk, cheese, yoghurt, meat, fish, eggs and alternatives',
        '1.4|Fats, oils and sugars',
      ]],
      ['A2', '2', 'Principles of nutrition', [
        '2.1|Macronutrients',
        '2.2|Micronutrients',
      ]],
      ['A3', '3', 'Diet and good health', [
        '3.1|Energy requirements of individuals',
        '3.2|Planning balanced diets',
        '3.3|Calculating energy and nutritional values of recipes, meals and diets',
      ]],
      ['A4', '4', 'The science of food', [
        '4.1|The effect of cooking on food',
        '4.2|Food spoilage',
      ]],
      ['A5', '5', 'Where food comes from', [
        '5.1|Food provenance',
        '5.2|Food manufacturing',
      ]],
      ['A6', '6', 'Cooking and food preparation', [
        '6.1|Factors affecting food choice',
        '6.2|Preparation and cooking techniques',
        '6.3|Developing recipes and meals',
      ]],
    ] },
  ],

  AQA_GCSE_ART_8201: [],
};
