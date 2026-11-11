// Specification trees — A-Level humanities, languages, creative and Level 3 subjects.
// Format documented in alevel-stem.mjs. Topic option { kind: 'set_text' } marks set texts,
// which the Question Picker offers as its own filter (PRD 4.3).

export default {
  AQA_ALEVEL_GEOG_7037: [
    { key: 'PHYS', title: 'Physical geography', note: 'Paper 1', topics: [
      ['WC', '3.1.1', 'Water and carbon cycles', [
        '1.1|Systems in physical geography',
        '1.2|The water cycle: stores, transfers, drainage basins and hydrographs',
        '1.3|Changes in the water cycle over time',
        '1.4|The carbon cycle: stores, transfers and the carbon budget',
        '1.5|Changes in the carbon cycle over time',
        '1.6|Water, carbon, climate and life on Earth',
        '1.7|Case studies: tropical rainforest and river catchment',
      ]],
      ['HD', '3.1.2', 'Hot desert systems and landscapes', [
        '2.1|Deserts as natural systems',
        '2.2|Systems and processes in hot deserts',
        '2.3|Arid landscape development',
        '2.4|Desertification',
      ], { kind: 'option' }],
      ['COAST', '3.1.3', 'Coastal systems and landscapes', [
        '3.1|Coasts as natural systems',
        '3.2|Systems and processes: waves, tides, sediment cells, erosion and deposition',
        '3.3|Coastal landscape development and sea level change',
        '3.4|Coastal management',
        '3.5|Case studies: local coast and a contrasting coast beyond the UK',
      ], { kind: 'option' }],
      ['GLAC', '3.1.4', 'Glacial systems and landscapes', [
        '4.1|Glaciers as natural systems; the nature and distribution of cold environments',
        '4.2|Systems and processes in glaciated environments',
        '4.3|Glaciated landscape development',
        '4.4|Human impacts on cold environments',
      ], { kind: 'option' }],
      ['HAZ', '3.1.5', 'Hazards', [
        '5.1|The concept of hazard in a geographical context',
        '5.2|Plate tectonics',
        '5.3|Volcanic hazards',
        '5.4|Seismic hazards',
        '5.5|Storm hazards',
        '5.6|Fires in nature',
        '5.7|Case studies: multi-hazardous environment and local hazard setting',
      ], { kind: 'option' }],
      ['ECO', '3.1.6', 'Ecosystems under stress', [
        '6.1|Ecosystems and sustainability',
        '6.2|Ecosystems and processes',
        '6.3|Biomes',
        '6.4|Ecosystems in the British Isles over time',
        '6.5|Marine ecosystems',
      ], { kind: 'option' }],
    ] },
    { key: 'HUM', title: 'Human geography', note: 'Paper 2', topics: [
      ['GS', '3.2.1', 'Global systems and global governance', [
        '7.1|Globalisation',
        '7.2|Global systems',
        '7.3|International trade and access to markets',
        '7.4|Global governance',
        '7.5|The global commons and Antarctica',
      ]],
      ['CP', '3.2.2', 'Changing places', [
        '8.1|The nature and importance of places',
        '8.2|Relationships, connections, meaning and representation',
        '8.3|Place studies: local place and contrasting place',
      ]],
      ['URB', '3.2.3', 'Contemporary urban environments', [
        '9.1|Urbanisation and urban forms',
        '9.2|Social and economic issues associated with urbanisation',
        '9.3|Urban climate and urban drainage',
        '9.4|Urban waste and other environmental issues',
        '9.5|Sustainable urban development',
      ], { kind: 'option' }],
      ['POP', '3.2.4', 'Population and the environment', [
        '10.1|Environment and population: food production and soils',
        '10.2|Environment, health and well-being',
        '10.3|Population change',
        '10.4|Population ecology and global population futures',
      ], { kind: 'option' }],
      ['RES', '3.2.5', 'Resource security', [
        '11.1|Resource development and natural resource issues',
        '11.2|Water security',
        '11.3|Energy security',
        '11.4|Mineral security and resource futures',
      ], { kind: 'option' }],
    ] },
    { key: 'SKILLS', title: 'Geographical skills', topics: [
      ['SK', '3.4', 'Geographical skills checklist', [
        '12.1|Qualitative and quantitative data skills',
        '12.2|Statistical skills (including Spearman rank and chi-squared)',
        '12.3|Cartographic and graphical skills',
      ], { kind: 'skill' }],
    ] },
  ],

  EDX_ALEVEL_HIST_9HI0: [
    { key: 'P1', title: 'Paper 1, Option 1H: Britain transformed, 1918–97', topics: [
      ['1H_T1', '1', 'A changing political and economic environment, 1918–79', [
        '1.1|A changing political landscape',
        '1.2|Responding to economic challenges',
        '1.3|Change and challenge in the workplace',
      ]],
      ['1H_T2', '2', 'Creating a welfare state, 1918–79', [
        '2.1|The provision of welfare support',
        '2.2|Public health',
        '2.3|Education and widening opportunities',
      ]],
      ['1H_T3', '3', 'Society in transition, 1918–79', [
        '3.1|Class and social values',
        '3.2|The changing role and status of women',
        '3.3|Race and immigration',
      ]],
      ['1H_T4', '4', 'The changing quality of life, 1918–79', [
        '4.1|Changing living standards',
        '4.2|Popular culture and entertainment',
        '4.3|Leisure and travel',
      ]],
      ['1H_INT', '5', 'Historical interpretations', [
        "5.1|What impact did Thatcher's governments (1979–90) have on Britain, 1979–97?",
      ]],
    ] },
    { key: 'P2', title: 'Paper 2, Option 2H.2: The USA, 1955–92: conformity and challenge', topics: [
      ['2H2_K1', '1', 'Affluence and conformity, 1955–63', [
        '1.1|Urbanisation, affluence and the consumer society',
        '1.2|Cultural conformity and challenge',
        '1.3|The civil rights movement and the Ku Klux Klan',
        "1.4|Kennedy's New Frontier",
      ]],
      ['2H2_K2', '2', 'Protest and reaction, 1963–72', [
        '2.1|Civil rights: from King to Black Power',
        '2.2|Protest and personal freedom',
        "2.3|Johnson's Great Society",
        '2.4|Reactions to the counter-culture, 1968–72',
      ]],
      ['2H2_K3', '3', 'Social and political change, 1973–80', [
        '3.1|The crisis of political leadership',
        '3.2|The impact of economic change on society',
        '3.3|Changing popular culture',
        '3.4|The extent of progress in individual and civil rights',
      ]],
      ['2H2_K4', '4', 'Republican dominance and its opponents, 1981–92', [
        '4.1|New directions in economic policy',
        '4.2|The Religious Right and its critics',
        '4.3|Cultural challenge',
        '4.4|Social change',
      ]],
    ] },
    { key: 'P3', title: 'Paper 3, Option 33: The witch craze in Britain, Europe and North America, c1580–c1750', topics: [
      ['33_B', 'B', 'Aspects in breadth: challenges to the witch craze', [
        'B.1|Changing attitudes to witchcraft in Britain',
        'B.2|The wider intellectual context: the coming of the age of science and reason',
      ]],
      ['33_D', 'D', 'Aspects in depth: persecuting witches', [
        'D.1|The North Berwick witches in Scotland, 1590–91, and the aftermath to 1597',
        'D.2|The Lancashire witches of 1604–13',
        'D.3|The Great Witch Hunt in Bamberg, Germany, 1623–32',
        'D.4|Matthew Hopkins and the East Anglian witch craze, 1645–47',
        'D.5|Cotton Mather and the Salem witch hunt, 1692–93',
      ]],
    ] },
  ],

  AQA_ALEVEL_POL_7152: [
    { key: 'P1', title: 'Paper 1: Government and politics of the UK', topics: [
      ['UKGOV', '3.1.1', 'The government of the UK', [
        '1.1|The nature and sources of the British Constitution',
        '1.2|The structure and role of Parliament',
        '1.3|The Prime Minister and cabinet',
        '1.4|The judiciary',
        '1.5|Devolution',
      ]],
      ['UKPOL', '3.1.2', 'The politics of the UK', [
        '2.1|Democracy and participation',
        '2.2|Elections and referendums',
        '2.3|Political parties',
        '2.4|Pressure groups',
        '2.5|The European Union',
      ]],
    ] },
    { key: 'P2', title: 'Paper 2: Government and politics of the USA and comparative politics', topics: [
      ['USGOV', '3.2.1', 'Government and politics of the USA', [
        '3.1|The constitutional framework of US government',
        '3.2|The legislative branch of government: Congress',
        '3.3|The executive branch of government: President',
        '3.4|The judicial branch of government',
        '3.5|The electoral process and direct democracy',
        '3.6|Political parties',
        '3.7|Pressure groups',
        '3.8|Civil rights',
      ]],
      ['COMP', '3.2.2', 'Comparative politics', [
        '4.1|Constitutional arrangements',
        '4.2|The executives',
        '4.3|The judiciaries',
        '4.4|Electoral and party systems',
        '4.5|Pressure groups and civil rights',
      ]],
    ] },
    { key: 'P3', title: 'Paper 3: Political ideas', topics: [
      ['CORE', '3.3.1', 'Core ideologies', [
        '5.1|Liberalism',
        '5.2|Conservatism',
        '5.3|Socialism',
      ]],
      ['OTHER', '3.3.2', 'Other ideologies (one studied)', [
        '6.1|Nationalism',
        '6.2|Feminism',
        '6.3|Multiculturalism',
        '6.4|Anarchism',
        '6.5|Ecologism',
      ], { kind: 'option' }],
    ] },
  ],

  EDX_ALEVEL_ENGLIT_9ET0: [
    { key: 'P1', title: 'Paper 1: Drama', topics: [
      ['SHAKES', 'A', 'Section A: Shakespeare', [
        'A.1|Othello',
        'A.2|Critical anthology: Shakespearean tragedy',
      ], { kind: 'set_text' }],
      ['DRAMA', 'B', 'Section B: Other drama', [
        'B.1|A Streetcar Named Desire',
      ], { kind: 'set_text' }],
    ] },
    { key: 'P2', title: 'Paper 2: Prose', note: 'Theme: Science and Society', topics: [
      ['PROSE', 'P', 'Comparative prose study', [
        "P.1|The Handmaid's Tale",
        'P.2|Frankenstein',
      ], { kind: 'set_text' }],
    ] },
    { key: 'P3', title: 'Paper 3: Poetry', topics: [
      ['MODERN', 'A', 'Section A: Post-2000 specified poetry', [
        'A.1|Poems of the Decade (comparison with an unseen poem)',
      ], { kind: 'set_text' }],
      ['POET', 'B', 'Section B: Specified poetry pre- or post-1900', [
        'B.1|The Romantics',
        'B.2|John Keats',
        'B.3|Christina Rossetti',
        'B.4|Philip Larkin',
      ], { kind: 'set_text' }],
    ] },
  ],

  AQA_ALEVEL_PSYCH_7182: [
    { key: 'P1', title: 'Paper 1: Introductory topics in psychology', topics: [
      ['SOCIAL', '4.1.1', 'Social influence', [
        '1.1|Types of and explanations for conformity; conformity to social roles',
        '1.2|Explanations for obedience and situational variables',
        '1.3|Resistance to social influence',
        '1.4|Minority influence and social change',
      ]],
      ['MEMORY', '4.1.2', 'Memory', [
        '2.1|The multi-store model and types of long-term memory',
        '2.2|The working memory model',
        '2.3|Explanations for forgetting',
        '2.4|Eyewitness testimony and the cognitive interview',
      ]],
      ['ATTACH', '4.1.3', 'Attachment', [
        '3.1|Caregiver–infant interactions and stages of attachment',
        "3.2|Animal studies and explanations of attachment (learning theory and Bowlby)",
        "3.3|Ainsworth's Strange Situation and cultural variations",
        '3.4|Maternal deprivation, institutionalisation and later relationships',
      ]],
      ['PSYCHOPATH', '4.1.4', 'Psychopathology', [
        '4.1|Definitions of abnormality',
        '4.2|Phobias: characteristics, explanations and treatments',
        '4.3|Depression: characteristics, explanations and treatments',
        '4.4|OCD: characteristics, explanations and treatments',
      ]],
    ] },
    { key: 'P2', title: 'Paper 2: Psychology in context', topics: [
      ['APPROACH', '4.2.1', 'Approaches in psychology', [
        '5.1|Origins of psychology and the learning approaches',
        '5.2|The cognitive approach',
        '5.3|The biological approach',
        '5.4|The psychodynamic and humanistic approaches; comparison of approaches',
      ]],
      ['BIO', '4.2.2', 'Biopsychology', [
        '6.1|The nervous system, neurons and synaptic transmission',
        '6.2|The endocrine system and the fight or flight response',
        '6.3|Localisation of function, lateralisation and split-brain research',
        '6.4|Plasticity and ways of studying the brain',
        '6.5|Biological rhythms',
      ]],
      ['RM', '4.2.3', 'Research methods', [
        '7.1|Experimental method, observational techniques and self-report',
        '7.2|Scientific processes: hypotheses, sampling, design, ethics, reliability and validity',
        '7.3|Data handling and analysis',
        '7.4|Inferential testing',
      ]],
    ] },
    { key: 'P3', title: 'Paper 3: Issues and options in psychology', topics: [
      ['ISSUES', '4.3.1', 'Issues and debates in psychology', [
        '8.1|Gender and culture bias',
        '8.2|Free will and determinism; the nature–nurture debate',
        '8.3|Holism and reductionism; idiographic and nomothetic approaches',
        '8.4|Ethical implications of research',
      ]],
      ['OPT1', '4.3.2–4', 'Option 1 (one studied)', [
        '9.1|Relationships',
        '9.2|Gender',
        '9.3|Cognition and development',
      ], { kind: 'option' }],
      ['OPT2', '4.3.5–7', 'Option 2 (one studied)', [
        '10.1|Schizophrenia',
        '10.2|Eating behaviour',
        '10.3|Stress',
      ], { kind: 'option' }],
      ['OPT3', '4.3.8–10', 'Option 3 (one studied)', [
        '11.1|Aggression',
        '11.2|Forensic psychology',
        '11.3|Addiction',
      ], { kind: 'option' }],
    ] },
  ],

  AQA_ALEVEL_SOC_7192: [
    { key: 'P1', title: 'Paper 1: Education with theory and methods', topics: [
      ['EDU', '4.1.1', 'Education', [
        '1.1|The role and functions of the education system',
        '1.2|Differential educational achievement by class, gender and ethnicity',
        '1.3|Relationships and processes within schools',
        '1.4|The significance of educational policies',
      ]],
      ['MIC', '4.1.2', 'Methods in context', [
        '2.1|Applying sociological research methods to the study of education',
      ]],
      ['TM', '4.1.3', 'Theory and methods', [
        '3.1|Quantitative and qualitative research methods and sources of data',
        '3.2|Positivism, interpretivism and the choice of method',
        '3.3|Consensus, conflict, structural and social action theories',
        '3.4|Modernity and post-modernity; sociology, science and value freedom',
        '3.5|Sociology and social policy',
      ]],
    ] },
    { key: 'P2', title: 'Paper 2: Topics in sociology', topics: [
      ['FAM', '4.2.2', 'Families and households', [
        '4.1|The family, social structure and state policies',
        '4.2|Changing patterns of marriage, divorce and family diversity',
        '4.3|Gender roles, domestic labour and power relationships',
        '4.4|Childhood',
        '4.5|Demographic trends in the UK since 1900',
      ], { kind: 'option' }],
      ['BELIEFS', '4.2.5', 'Beliefs in society', [
        '5.1|Ideology, science and religion',
        '5.2|Religion, social change and social stability',
        '5.3|Religious organisations',
        '5.4|Social groups and religiosity',
        '5.5|Secularisation, globalisation and fundamentalism',
      ], { kind: 'option' }],
    ] },
    { key: 'P3', title: 'Paper 3: Crime and deviance with theory and methods', topics: [
      ['CRIME', '4.3.1', 'Crime and deviance', [
        '6.1|Crime, deviance, social order and social control',
        '6.2|The social distribution of crime by ethnicity, gender and class',
        '6.3|Globalisation, the media, green crime and state crime',
        '6.4|Crime control, surveillance, prevention, punishment and victims',
      ]],
    ] },
  ],

  EDUQAS_ALEVEL_FILM_A670QS: [
    { key: 'C1', title: 'Component 1: Varieties of film and filmmaking', topics: [
      ['HOLLY', 'A', 'Section A: Hollywood 1930–1990 (comparative study)', [
        'A.1|Core study areas: film form, meaning and response, and contexts',
        'A.2|Auteur',
      ]],
      ['USFILM', 'B', 'Section B: American film since 2005 (two-film study)', [
        'B.1|Spectatorship',
        'B.2|Ideology',
      ]],
      ['BRIT', 'C', 'Section C: British film since 1995 (two-film study)', [
        'C.1|Narrative',
        'C.2|Ideology',
      ]],
    ] },
    { key: 'C2', title: 'Component 2: Global filmmaking perspectives', topics: [
      ['GLOBAL', 'A', 'Section A: Global film (two-film study)', [
        'A.1|Core study areas applied to global film',
      ]],
      ['DOC', 'B', 'Section B: Documentary film', [
        'B.1|Critical debates: the significance of digital technology',
        "B.2|Filmmakers' theories",
      ]],
      ['SILENT', 'C', 'Section C: Film movements – Silent cinema', [
        'C.1|Critical debates: the realist and the expressive',
      ]],
      ['EXP', 'D', 'Section D: Film movements – Experimental film (1960–2000)', [
        'D.1|Narrative and alternative forms',
        'D.2|Auteur',
      ]],
    ] },
  ],

  EDUQAS_ALEVEL_DRAMA_A690QS: [
    { key: 'C3', title: 'Component 3: Text in performance', topics: [
      ['PRE1956', 'A', 'Pre-1956 set text', [
        'A.1|The Trojan Women (Euripides)',
      ], { kind: 'set_text' }],
      ['POST1956', 'B', 'Post-1956 set text', [
        'B.1|Saved (Edward Bond)',
      ], { kind: 'set_text' }],
      ['EXTRACT', 'C', 'Section C: closed-book extract', [
        'C.1|The Curious Incident of the Dog in the Night-Time (Haddon/Stephens)',
      ], { kind: 'set_text' }],
      ['CRAFT', 'S', 'Interpreting a text for performance', [
        'S.1|Performer: vocal and physical interpretation of character',
        'S.2|Director: staging, proxemics and rehearsal techniques',
        'S.3|Designer: set, lighting, sound and costume',
        'S.4|Social, historical and cultural context; original performance conditions',
        'S.5|The influence of live theatre and theatre practitioners',
      ], { kind: 'skill' }],
    ] },
  ],

  AQA_ALEVEL_SPAN_7692: [
    { key: 'SOC', title: 'Social issues and trends', topics: [
      ['SOC1', '3.1.1', 'Aspects of Hispanic society', [
        '1.1|Modern and traditional values (Los valores tradicionales y modernos)',
        '1.2|Cyberspace (El ciberespacio)',
        '1.3|Equal rights (La igualdad de los sexos)',
      ]],
      ['SOC2', '3.1.2', 'Multiculturalism in Hispanic society', [
        '2.1|Immigration (La inmigración)',
        '2.2|Racism (El racismo)',
        '2.3|Integration (La convivencia)',
      ]],
    ] },
    { key: 'CULT', title: 'Political and artistic culture', topics: [
      ['ART', '3.2.1', 'Artistic culture in the Hispanic world', [
        '3.1|Modern day idols (La influencia de los ídolos)',
        '3.2|Spanish regional identity (La identidad regional en España)',
        '3.3|Cultural heritage (El patrimonio cultural)',
      ]],
      ['POLIT', '3.2.2', 'Aspects of political life in the Hispanic world', [
        "4.1|Today's youth, tomorrow's citizens (Jóvenes de hoy, ciudadanos de mañana)",
        '4.2|Monarchies and dictatorships (Monarquías y dictaduras)',
        '4.3|Popular movements (Movimientos populares)',
      ]],
    ] },
    { key: 'WORKS', title: 'Grammar and works', topics: [
      ['GRAM', '3.3', 'Grammar', [
        '5.1|Grammar and translation into and out of Spanish',
      ], { kind: 'skill' }],
      ['LIT', '3.4', 'Works: literary texts and films', [
        '6.1|Literary text (essay)',
        '6.2|Film (essay)',
      ], { kind: 'set_text' }],
    ] },
  ],

  AQA_ALEVEL_ART_7202: [],

  OCR_L3_BUS_CTEC: [
    { key: 'U1', title: 'Unit 1: The business environment', note: 'Externally examined', topics: [
      ['U1', '1', 'The business environment', [
        '1.1|Types of business and their objectives',
        '1.2|Functional areas of business and how they work together',
        '1.3|Organisational structures',
        '1.4|Financial information: costs, revenue, break-even, cash flow and accounts',
        '1.5|Businesses and their stakeholders',
        '1.6|External influences and constraints on business',
        '1.7|Assessing business performance to inform future activities',
      ]],
    ] },
    { key: 'U2', title: 'Unit 2: Working in business', note: 'Externally examined', topics: [
      ['U2', '2', 'Working in business', [
        '2.1|Protocols to be followed when working in business',
        '2.2|Organising and arranging meetings',
        '2.3|Using business documents',
        '2.4|Prioritising business activities',
        '2.5|Communicating effectively with stakeholders',
      ]],
    ] },
  ],

  OCR_L3_IT_AAQ: [
    { key: 'F200', title: 'Unit F200: Fundamentals of data analytics', note: 'Externally examined', topics: [
      ['F200', 'F200', 'Fundamentals of data analytics', [
        'F200.1|All unit content (add topic areas from the OCR specification)',
      ]],
    ] },
    { key: 'F201', title: 'Unit F201: Big data and machine learning', note: 'Externally examined', topics: [
      ['F201', 'F201', 'Big data and machine learning', [
        'F201.1|All unit content (add topic areas from the OCR specification)',
      ]],
    ] },
  ],

  OCR_L3_SPORT_CTEC: [
    { key: 'U1', title: 'Unit 1: Body systems and the effects of physical activity', note: 'Externally examined', topics: [
      ['U1', '1', 'Body systems and the effects of physical activity', [
        '1.1|The skeletal system in relation to exercise and physical activity',
        '1.2|The muscular system in relation to exercise and physical activity',
        '1.3|The cardiovascular system in relation to exercise and physical activity',
        '1.4|The respiratory system in relation to exercise and physical activity',
        '1.5|The different energy systems in relation to exercise and physical activity',
      ]],
    ] },
    { key: 'U3', title: 'Unit 3: Sports organisation and development', note: 'Externally examined', topics: [
      ['U3', '3', 'Sports organisation and development', [
        '3.1|How sport in the UK is organised',
        '3.2|Sports development',
        '3.3|How the impact of sports development can be measured',
        '3.4|Sports development in practice',
      ]],
    ] },
  ],

  OCR_L3_APPSCI_AAQ: [
    { key: 'F180', title: 'Unit F180: Fundamentals of science', note: 'Externally examined', topics: [
      ['F180', 'F180', 'Fundamentals of science', [
        'F180.1|All unit content (add topic areas from the OCR specification)',
      ]],
    ] },
    { key: 'F181', title: 'Unit F181: Science in society', note: 'Externally examined', topics: [
      ['F181', 'F181', 'Science in society', [
        'F181.1|All unit content (add topic areas from the OCR specification)',
      ]],
    ] },
  ],
};
