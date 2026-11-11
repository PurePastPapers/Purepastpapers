// DEMO question bank — GCSE humanities, languages and applied subjects.
// Original demo content (not from any exam board paper). Field key: see alevel-maths.mjs.
// The reading extracts and the poem below were written for this build.

const LEVELS = 'Marked by level of response. Top-level answers are detailed, well organised and reach a supported judgement.';

export default [
  {
    subject: 'AQA_GCSE_ENGLANG_8700', code: 'P12', title: 'Demo Paper: Reading and writing',
    questions: [
      { m: 8, d: 'm', p: ['P1READ_A.2'],
        q: `Read the extract below.
> The wind arrived before the rain did. It came down the valley like something hunted, flattening the barley and slamming the gate against its post again and again. Mara stood at the kitchen window with a tea towel twisted in her hands. Beyond the yard, the sky had turned the colour of a bruise, and the old oak at the edge of the field thrashed as if it were trying to pull itself free of the earth. Then the first drops struck the glass: fat, deliberate, impatient. Somewhere upstairs a door banged. She counted the seconds after the lightning, the way her father had taught her, and reached only two.
How does the writer use language here to describe the storm? You could include the writer's choice of words and phrases, language features and techniques, and sentence forms. [8]`,
        ms: `${LEVELS}
Indicative content:
- Simile 'like something hunted' gives the wind an animal desperation
- Violent verbs: 'flattening', 'slamming', 'thrashed', 'struck'
- Personification of the oak 'trying to pull itself free' and of the rain as 'deliberate, impatient'
- Colour imagery: 'the colour of a bruise' suggests harm to come
- The list of three adjectives and the short final clause 'reached only two' build tension` },
      { m: 8, d: 'm', p: ['P2READ_A.2'],
        q: `Read the two sources.
**Source A** (a blog post written this year)
> Our Saturday market is quieter than it used to be, but it is friendlier for it. Stallholders know your name, there is room to stop and talk, and nobody shouts. You can buy bread still warm and be home again within the hour.
**Source B** (a letter written in 1852)
> The market was a roaring confusion from dawn. Drovers bellowed, cattle pressed against the railings, and the mud lay ankle-deep in every lane. A stranger might lose both his purse and his temper before he had crossed the square.
Use details from both sources. Write a summary of the differences between the two markets. [8]`,
        ms: `${LEVELS}
Indicative content:
- Atmosphere: Source A is 'quieter' and 'friendlier'; Source B is 'a roaring confusion'
- People: stallholders who 'know your name' against drovers who 'bellowed' and the risk of theft
- Conditions: 'room to stop and talk' against crowding, cattle and mud 'ankle-deep'
- Inference: the modern market is a social, comfortable place; the Victorian market is a place of work, noise and danger
- Best answers interpret both sources and link the differences` },
      { m: 40, d: 'h', t: 45, p: ['P1WRITE_B.1'],
        q: `Write a story about a time when someone had to make a difficult choice. (24 marks for content and organisation, 16 marks for technical accuracy) [40]`,
        ms: `${LEVELS}
Content and organisation (24 marks):
- A convincing, compelling voice matched to purpose and audience
- Deliberate structure: an engaging opening, controlled development and a crafted ending
- Ambitious vocabulary and conscious use of language devices
Technical accuracy (16 marks):
- Secure sentence demarcation and a wide range of punctuation
- Varied sentence forms used for effect
- Accurate spelling, including ambitious vocabulary` },
      { m: 40, d: 'h', t: 45, p: ['P2WRITE_B.1'],
        q: `'Homework has no value. It should be banned.' Write an article for a broadsheet newspaper in which you argue your point of view on this statement. (24 marks for content and organisation, 16 marks for technical accuracy) [40]`,
        ms: `${LEVELS}
Content and organisation (24 marks):
- A clear, sustained viewpoint in a register suited to a broadsheet article
- Persuasive methods: rhetorical questions, counter-argument, evidence and anecdote
- Fluently linked paragraphs with a strong opening and conclusion
Technical accuracy (16 marks):
- Accurate, varied sentences and a full range of punctuation
- Standard English and accurate spelling` },
    ],
  },
  {
    subject: 'EDUQAS_GCSE_ENGLIT_C720QS', code: 'C12', title: 'Demo Paper: Components 1 and 2 essays',
    questions: [
      { m: 25, d: 'h', p: ['SHAKES_A.2'],
        q: `Write about how Shakespeare presents ambition in Macbeth and how it changes at different points in the play. [25]`,
        ms: `${LEVELS}
Indicative content:
- Macbeth's reaction to the witches' prophecies and his 'vaulting ambition'
- Lady Macbeth's role in driving the murder of Duncan
- Ambition turning to paranoia: Banquo and Macduff's family
- The consequences for both characters by the end of the play
- Close reference to language and to key scenes` },
      { m: 25, d: 'h', p: ['SHAKES_A.1'],
        q: `Write about the relationship between Romeo and Juliet and how it is presented at different points in the play. [25]`,
        ms: `${LEVELS}
Indicative content:
- Their first meeting and the shared sonnet
- The balcony scene and the speed of their commitment
- The effect of the feud, Tybalt's death and Romeo's banishment
- The tragic ending and what it changes in Verona
- Close reference to language, imagery of light and dark, and structure` },
      { m: 40, d: 'h', p: ['POST1914_A.1'],
        q: `How does Priestley present the theme of responsibility in An Inspector Calls? (5 of the marks are for spelling, punctuation and grammar) [40]`,
        ms: `${LEVELS}
Indicative content:
- The Inspector as the voice of social responsibility: 'We are members of one body'
- The contrast between the older and younger generations in accepting blame
- Mr Birling's dismissal of 'community and all that nonsense'
- The 1912 setting and the 1945 audience
- Structure: the chain of events and the final telephone call` },
      { m: 40, d: 'h', p: ['C19_B.1'],
        q: `Write about how Dickens presents Scrooge's transformation and its importance to the novel as a whole. [40]`,
        ms: `${LEVELS}
Indicative content:
- Scrooge at the start: 'solitary as an oyster' and his treatment of Bob Cratchit and Fred
- The effect of each Spirit, including his own past, the Cratchits and the neglected grave
- His behaviour in the final stave
- Dickens's message about poverty and social responsibility in Victorian society
- Close reference to language and the five-stave structure` },
      { m: 40, d: 'h', p: ['C19_B.2'],
        q: `Write about how Stevenson presents the idea of duality in The Strange Case of Dr Jekyll and Mr Hyde. [40]`,
        ms: `${LEVELS}
Indicative content:
- Jekyll's belief that 'man is not truly one, but truly two'
- The contrast between the respectable front of the house and the laboratory door
- Hyde as the release of what Jekyll represses; Victorian reputation and hypocrisy
- The gradual loss of control
- Narrative structure: the mystery, the letters and Jekyll's final statement` },
      { m: 15, d: 'm', p: ['UNSEEN_C.1'],
        q: `Read the poem below.
**Tide**
> The sea keeps nothing that it takes for long:
> a boot, a bottle, half a painted oar
> come sidling back along the evening shore
> like guests who slipped away and now feel wrong.
> My grandfather would walk here every night
> and read the wrack the way he read the news.
> I walk here now. I find a pair of shoes,
> a length of rope, and wait for him to write.
Write about the poem and its effect on you. You may wish to consider what the poem is about and how it is organised, the ideas the poet may have wanted us to think about, and the poet's choice of words, phrases and images. [15]`,
        ms: `${LEVELS}
Indicative content:
- The poem moves from the sea returning objects to the speaker's grief for a grandfather who does not return
- The simile of embarrassed 'guests' and the personified sea
- 'read the wrack the way he read the news': the shore as a daily message
- The short sentence 'I walk here now.' marks the change of generation
- The final image: waiting for a message that the sea cannot bring
- Regular rhyme and two balanced stanzas, like the rhythm of the tide` },
    ],
  },
  {
    subject: 'AQA_GCSE_GEOG_8035', code: 'P123', title: 'Demo Paper: Physical, human and skills questions',
    questions: [
      { m: 2, d: 'e', p: ['HAZ_1.2'],
        q: `Give two primary effects of an earthquake. [2]`,
        ms: `Any two: buildings collapse; people are killed or injured; roads and bridges are damaged; water and gas pipes break :: (2)` },
      { m: 4, d: 'm', p: ['UKLAND_3.3'],
        q: `Explain how a waterfall is formed. [4]`,
        ms: `A river flows over a band of hard rock lying on top of softer rock :: (1)
The softer rock is eroded more quickly by hydraulic action and abrasion :: (1)
The hard rock is undercut and left overhanging, with a plunge pool below :: (1)
The overhang collapses and the waterfall retreats upstream, leaving a gorge :: (1)` },
      { m: 6, d: 'm', p: ['UKLAND_3.2'],
        q: `Explain how hard engineering and soft engineering strategies can protect a coastline. [6]`,
        ms: `${LEVELS}
Indicative content:
- Sea walls reflect wave energy; rock armour absorbs it
- Groynes trap sediment moved by longshore drift to build up a wider beach
- Beach nourishment and dune regeneration add natural buffers that absorb wave energy
- Managed retreat allows low-value land to flood and form salt marsh
- Clear explanation of how each strategy reduces erosion or flooding` },
      { m: 9, d: 'h', p: ['HAZ_1.2'],
        q: `'The effects of an earthquake are always more severe in lower income countries than in higher income countries.' Do you agree? Use examples you have studied. [9]`,
        ms: `${LEVELS} Three additional marks are available for spelling, punctuation and grammar in the real paper.
Indicative content:
- Lower income countries: weaker buildings, less preparation and slower emergency response, so more deaths
- Higher income countries: greater economic losses because of the value of buildings and infrastructure
- Other factors: magnitude, depth, time of day and population density
- Named examples compared
- A conclusion that challenges or supports 'always'` },
      { m: 6, d: 'm', p: ['LIVING_2.2'],
        q: `Discuss the effects of deforestation in a tropical rainforest. [6]`,
        ms: `${LEVELS}
Indicative content:
- Environmental: loss of biodiversity, soil erosion and contribution to climate change
- Economic: income from logging, farming and mining; jobs and exports
- Social: effects on indigenous communities
- Short-term gains weighed against long-term losses, with reference to a named rainforest` },
      { m: 9, d: 'h', p: ['URBAN_4.2'],
        q: `Evaluate the success of an urban regeneration project in a UK city you have studied. [9]`,
        ms: `${LEVELS}
Indicative content:
- Why the area needed regeneration
- Main features of the project: housing, jobs, transport and environment
- Evidence of success and of problems, such as rising house prices or displaced residents
- Different views of residents, businesses and the council
- An overall judgement supported by evidence` },
      { m: 4, d: 'm', p: ['ECON_5.1'],
        q: `Explain why gross national income (GNI) per head may not be a reliable measure of a country's level of development. [4]`,
        ms: `It is an average, so it hides inequality between rich and poor :: (1)
and between regions within the country :: (1)
It measures income only and not health, education or quality of life :: (1)
It misses the informal economy and subsistence farming :: (1)` },
      { m: 4, d: 'm', p: ['APP_7.3'], x: ['APP_7.2'],
        q: `A student measures the velocity of a river at five points across its channel.
| Point | 1 | 2 | 3 | 4 | 5 |
| Velocity (m/s) | 0.2 | 0.5 | 0.4 | 0.7 | 0.7 |
(a) Calculate the mean velocity. [1]
(b) Calculate the range. [1]
(c) State the median and the mode. [2]`,
        ms: `(a) 2.5 ÷ 5 = 0.5 m/s :: (1)
(b) 0.7 − 0.2 = 0.5 m/s :: (1)
(c) Median = 0.5 m/s :: (1)
Mode = 0.7 m/s :: (1)` },
    ],
  },
  {
    subject: 'EDX_GCSE_HIST_1HI0', code: 'P123', title: 'Demo Paper: Medicine, Cold War, Elizabeth and Germany',
    questions: [
      { m: 4, d: 'e', p: ['MED_11.1', 'MED_11.2'],
        q: `Explain one way in which ideas about the cause of disease were similar in the fourteenth and seventeenth centuries. [4]`,
        ms: `One similarity identified :: (2)
Supported with specific information from both periods :: (2)
e.g. In both periods people believed that miasma (bad air) caused disease: during the Black Death of 1348 people carried sweet-smelling herbs, and during the Great Plague of 1665 people lit fires to clean the air.` },
      { m: 12, d: 'm', p: ['MED_11.3'],
        q: `Explain why there was rapid change in surgical treatment in the period c1700–c1900. [12]`,
        ms: `${LEVELS}
Indicative content:
- Anaesthetics: Simpson's use of chloroform from 1847 allowed longer, more complex operations
- Antiseptics: Lister's carbolic spray from 1865, building on Pasteur's germ theory
- The move towards aseptic surgery by 1900
- The role of individuals, science and communication, and how the factors are linked` },
      { m: 16, d: 'h', p: ['MED_11.3', 'MED_11.4'],
        q: `'Louis Pasteur's germ theory was the most important breakthrough in medicine in the period c1700–present.' How far do you agree? Explain your answer. [16]`,
        ms: `${LEVELS} Four additional marks are available for spelling, punctuation and grammar.
Indicative content:
- Germ theory (1861) replaced miasma and spontaneous generation and led to Koch's identification of specific microbes, vaccines and antiseptic surgery
- Other breakthroughs: Jenner's vaccination, penicillin and antibiotics, the discovery of the structure of DNA
- Organisational change: the NHS in 1948
- Criteria for 'most important': how many later developments depended on it
- A sustained judgement` },
      { m: 8, d: 'm', p: ['COLDWAR_P4.2'],
        q: `Write a narrative account analysing the key events of the Cuban Missile Crisis in 1962. [8]`,
        ms: `${LEVELS}
Indicative content:
- US spy planes photograph Soviet missile sites on Cuba in October 1962
- Kennedy announces a naval blockade ('quarantine') of Cuba
- Soviet ships turn back; Khrushchev's two letters
- The agreement: Soviet missiles removed from Cuba; a US pledge not to invade and secret removal of missiles from Turkey
- Events linked into a clear sequence showing how each led to the next` },
      { m: 16, d: 'h', p: ['ELIZ_B4.2'],
        q: `'Religion was the main reason for the Revolt of the Northern Earls in 1569.' How far do you agree? Explain your answer. [16]`,
        ms: `${LEVELS}
Indicative content:
- Religion: the earls and much of the north remained Catholic; mass was celebrated in Durham Cathedral
- Politics: the earls of Northumberland and Westmorland had lost influence at court to newer men
- The succession: the plan to marry Mary, Queen of Scots to the Duke of Norfolk
- How the factors are linked, and a sustained judgement` },
      { m: 12, d: 'm', p: ['GERMANY_31.2'],
        q: `Explain why Hitler was able to become Chancellor in January 1933. [12]`,
        ms: `${LEVELS}
Indicative content:
- The Great Depression: six million unemployed by 1932 and the failure of Weimar governments
- Nazi propaganda, the SA and Hitler's appeal as a speaker
- Fear of communism among the middle classes and industrialists
- Political deals: von Papen and Hindenburg believed they could control Hitler
- How the factors combined` },
      { m: 4, d: 'e', p: ['GERMANY_31.4'],
        q: `Explain one way in which the Nazis tried to control young people in Germany in the years 1933–39. [4]`,
        ms: `One way identified :: (2)
Supported with specific information :: (2)
e.g. Through youth organisations: the Hitler Youth and the League of German Maidens taught loyalty to Hitler, and membership was made compulsory in 1939.` },
    ],
  },
  {
    subject: 'AQA_GCSE_RS_8062', code: 'P12', title: 'Demo Paper: Religions and themes',
    questions: [
      { m: 2, d: 'e', p: ['ISL_2.2'],
        q: `Give two of the Five Pillars of Islam. [2]`,
        ms: `Any two: Shahadah (declaration of faith); Salah (prayer); Zakah (charity); Sawm (fasting); Hajj (pilgrimage) :: (2)` },
      { m: 4, d: 'm', p: ['CHR_1.1'],
        q: `Explain two ways in which a belief in the resurrection of Jesus influences Christians today. [4]`,
        ms: `Two marks for each way that is explained, for example:
It gives hope of life after death, so Christians may face death with less fear :: (2)
It shows the power of God over evil, which gives Christians confidence to live as Jesus taught :: (2)` },
      { m: 5, d: 'm', p: ['ISL_2.1'],
        q: `Explain two Muslim beliefs about angels. Refer to sacred writings or another source of Muslim belief and teaching in your answer. [5]`,
        ms: `Two marks for each belief that is explained, plus one mark for a relevant reference to a source of authority.
- Angels are created from light and always obey God
- Jibril revealed the Qur'an to Muhammad
- Angels record every person's deeds for the Day of Judgement
- Reference to the Qur'an or Hadith` },
      { m: 12, d: 'h', p: ['CHR_1.2'],
        q: `'The best way for Christians to grow closer to God is by going on pilgrimage.' Evaluate this statement. In your answer you should give reasoned arguments for and against the statement, refer to Christian teaching, and reach a justified conclusion. [12]`,
        ms: `${LEVELS}
Indicative content:
- For: time away from daily life to pray; places such as Lourdes and Iona; walking where Jesus walked
- Against: prayer, worship and the Eucharist are available every day; serving others is commanded by Jesus
- Not all Christian traditions value pilgrimage equally
- A justified conclusion` },
      { m: 12, d: 'h', p: ['THEMES_B'],
        q: `'Religious believers should never agree with euthanasia.' Evaluate this statement. In your answer you should give reasoned arguments for and against the statement, refer to religious arguments, and reach a justified conclusion. [12]`,
        ms: `${LEVELS}
Indicative content:
- For: the sanctity of life; life is a gift from God; 'Do not murder'
- Against: compassion and quality of life; some believers accept withdrawing treatment
- Non-religious arguments about autonomy may be used
- A justified conclusion` },
      { m: 12, d: 'h', p: ['THEMES_D'],
        q: `'War is never justified.' Evaluate this statement. In your answer you should give reasoned arguments for and against the statement, refer to religious arguments, and reach a justified conclusion. [12]`,
        ms: `${LEVELS}
Indicative content:
- For: pacifism; 'Blessed are the peacemakers'; the suffering of civilians
- Against: just war theory; self-defence and the protection of the innocent; lesser jihad
- Modern weapons and whether the conditions for a just war can be met
- A justified conclusion` },
    ],
  },
  {
    subject: 'AQA_GCSE_SPAN_8698', code: 'P34', title: 'Demo Paper: Translation and writing',
    questions: [
      { m: 9, d: 'm', p: ['SK_4.2'], x: ['T1_1.1', 'T3_3.4'],
        q: `Translate this passage into English. [9]
> Mi hermana mayor vive en el centro de la ciudad. Le gusta ir de compras los sábados, pero ayer fue al cine con sus amigos. En el futuro quiere ser profesora porque le encantan los niños.`,
        ms: `Example translation (accept equivalent wording):
My older sister lives in the city centre. She likes to go shopping on Saturdays, but yesterday she went to the cinema with her friends. In the future she wants to be a teacher because she loves children.
Marks are awarded for conveying key messages and for the accurate use of tenses.` },
      { m: 10, d: 'm', p: ['SK_4.3'], x: ['T2_2.1', 'T3_3.2', 'SK_4.5'],
        q: `Translate the following sentences into Spanish. [10]
(a) I live in a small town.
(b) My school is quite big.
(c) I like sport but I don't like maths.
(d) Last weekend I went to the beach.
(e) Tomorrow I am going to play football.`,
        ms: `(a) Vivo en un pueblo pequeño. :: (2)
(b) Mi colegio es bastante grande. :: (2)
(c) Me gusta el deporte pero no me gustan las matemáticas. :: (2)
(d) El fin de semana pasado fui a la playa. :: (2)
(e) Mañana voy a jugar al fútbol. :: (2)` },
      { m: 16, d: 'm', t: 20, p: ['SK_4.4'], x: ['T2_2.4'],
        q: `Escribe a tu amigo español sobre tus vacaciones. Menciona:
- adónde fuiste el año pasado
- lo que hiciste
- tu opinión del alojamiento
- tus planes para el próximo verano
Escribe aproximadamente 90 palabras en español. [16]`,
        ms: `${LEVELS} Content = 10 marks, quality of language = 6 marks.
- All four bullet points are covered
- Opinions are given and justified
- Three time frames are used: past, present and future
- A variety of vocabulary and structures, with mostly accurate verbs` },
      { m: 32, d: 'h', t: 35, p: ['SK_4.4'], x: ['T2_2.3'],
        q: `Escribe un artículo sobre el medio ambiente para una revista española. Menciona:
- lo que has hecho recientemente para proteger el medio ambiente
- tus ideas para mejorar tu ciudad en el futuro
Escribe aproximadamente 150 palabras en español. [32]`,
        ms: `${LEVELS} Content = 15 marks, range of language = 12 marks, accuracy = 5 marks.
- Both bullet points are developed in detail
- Opinions are explained and justified
- Complex structures: the subjunctive, 'si' clauses and a range of tenses
- A convincing, well-organised article` },
    ],
  },
  {
    subject: 'EDX_GCSE_BUS_1BS0', code: 'P12', title: 'Demo Paper: Themes 1 and 2',
    questions: [
      { m: 3, d: 'e', p: ['1.2.2'],
        q: `Explain one reason why a new business might carry out market research. [3]`,
        ms: `To identify customer needs :: (1)
so that its product or service matches what customers want :: (1)
which reduces the risk of poor sales when the business starts trading :: (1)` },
      { m: 4, d: 'm', p: ['1.3.2'], x: ['2.4.1'],
        q: `A café has revenue of £48 000, variable costs of £18 000 and fixed costs of £21 000.
(a) Calculate the total costs. [1]
(b) Calculate the profit. [1]
(c) Calculate the net profit margin. [2]`,
        ms: `(a) £18 000 + £21 000 = £39 000 :: (1)
(b) £48 000 − £39 000 = £9000 :: (1)
(c) {{9000|48 000}} × 100 :: (1)
18.75% :: (1)` },
      { m: 6, d: 'm', p: ['1.5.3'], x: ['1.3.2'],
        q: `Discuss the likely impact on a small café of an increase in the National Minimum Wage. [6]`,
        ms: `${LEVELS}
Indicative content:
- Wage costs rise, increasing total costs and reducing profit
- The café may raise prices, cut hours or employ fewer staff
- Possible benefits: more motivated staff and lower staff turnover
- The impact depends on how many staff are paid the minimum wage and on local competition` },
      { m: 9, d: 'h', p: ['2.1.1'], x: ['2.2.4'],
        q: `A successful café is considering two options to grow: opening a second branch in a nearby town, or launching a delivery service from its existing branch. Justify which one of these two options the café should choose. [9]`,
        ms: `${LEVELS}
Indicative content:
- Second branch: reaches a new market and builds the brand, but needs high investment and a new team
- Delivery: lower cost and risk, uses existing capacity, but pays platform fees and may affect quality
- A justified choice that weighs risk, finance and the café's objectives; either option can gain full marks` },
      { m: 12, d: 'h', p: ['2.1.4'],
        q: `Evaluate whether a business should always put ethics before profit. You should use your knowledge of business and at least one business example. [12]`,
        ms: `${LEVELS}
Indicative content:
- Ethical behaviour: fair pay, responsible sourcing and honest marketing
- Costs: higher prices from suppliers and lower margins
- Benefits: reputation, customer loyalty, staff motivation and lower legal risk
- The trade-off depends on the market, customers and competitors
- A supported conclusion` },
      { m: 6, d: 'm', p: ['2.5.4'],
        q: `Analyse the impact on a business of using financial methods to motivate its employees. [6]`,
        ms: `${LEVELS}
Indicative content:
- Methods: bonuses, commission, promotion and fringe benefits
- Higher motivation may raise productivity and sales
- Costs rise, and commission can encourage pressure selling
- Linked chains of reasoning about the effect on the business` },
    ],
  },
  {
    subject: 'AQA_GCSE_PSYCH_8182', code: 'P12', title: 'Demo Paper: Papers 1 and 2 mixed questions',
    questions: [
      { m: 3, d: 'e', p: ['MEMORY_1.1'],
        q: `Outline what is meant by encoding, storage and retrieval in memory. [3]`,
        ms: `Encoding: changing information into a form that can be stored :: (1)
Storage: holding information in memory over time :: (1)
Retrieval: recovering stored information when it is needed :: (1)` },
      { m: 4, d: 'm', p: ['MEMORY_1.2'],
        q: `Describe Bartlett's 'War of the Ghosts' study. [4]`,
        ms: `Participants read an unfamiliar Native American story :: (1)
and were asked to recall it after different lengths of time :: (1)
The recalled story became shorter and details were changed to fit their own culture :: (1)
Bartlett concluded that memory is reconstructive and shaped by schemas :: (1)` },
      { m: 4, d: 'm', p: ['RM_4.1'],
        q: `A researcher wants to test whether listening to music affects how many words people can recall from a list.
(a) Write a suitable hypothesis for this study. [2]
(b) Identify the independent variable and the dependent variable. [2]`,
        ms: `(a) A clear, testable statement that includes both conditions and the measured outcome :: (2)
e.g. There will be a difference in the number of words recalled by participants who learn with music and participants who learn in silence.
(b) Independent variable: whether music is played :: (1)
Dependent variable: the number of words recalled :: (1)` },
      { m: 9, d: 'h', p: ['DEVELOP_3.1'],
        q: `Describe and evaluate Piaget's theory of cognitive development. [9]`,
        ms: `${LEVELS}
Indicative content:
- Schemas, assimilation and accommodation
- Four stages: sensorimotor, pre-operational, concrete operational and formal operational
- Evaluation: influential in education; later research suggests children can do more at younger ages; the samples were small and from one culture` },
      { m: 9, d: 'h', p: ['SOCIAL_5.1'],
        q: `Describe and evaluate Asch's study of conformity. [9]`,
        ms: `${LEVELS}
Indicative content:
- Line judgement task with confederates giving wrong answers
- About one third of responses on critical trials conformed; most participants conformed at least once
- Evaluation: controlled laboratory study; an artificial task; a sample of American male students in the 1950s; ethical issues of deception` },
      { m: 6, d: 'm', p: ['PROBLEMS_8.2'],
        q: `Explain how cognitive behaviour therapy (CBT) is used to treat depression, and give one strength of this therapy. [6]`,
        ms: `The therapist helps the patient to identify negative, irrational thoughts :: (1)
These thoughts are challenged and replaced with more rational ones :: (1)
Behavioural activation: the patient plans and carries out enjoyable activities :: (1)
Homework such as thought diaries is completed between sessions :: (1)
Strength: it gives patients skills to manage future episodes, with a lower relapse rate :: (2)` },
    ],
  },
  {
    subject: 'EDUQAS_GCSE_DRAMA_C690QS', code: 'C3', title: 'Demo Paper: Interpreting theatre',
    questions: [
      { m: 15, d: 'm', p: ['SETTEXT_A.1'],
        q: `Choose one character from a key scene in your set text. As an actor, describe how you would use voice and movement to communicate this character to the audience. [15]`,
        ms: `${LEVELS}
Indicative content:
- Vocal skills: pitch, pace, pause, volume, tone and accent
- Physical skills: posture, gesture, facial expression and use of space
- Interaction with other characters
- Each choice justified by reference to the text and the character's intentions` },
      { m: 12, d: 'm', p: ['SETTEXT_A.3'], x: ['SETTEXT_A.4'],
        q: `As a designer, explain your ideas for the costume and lighting for one scene from your set text. Refer to the context of the play in your answer. [12]`,
        ms: `${LEVELS}
Indicative content:
- Costume: period, colour, fabric and condition, and what they show about character and status
- Lighting: colour, intensity, angle and changes during the scene
- How the designs create mood and atmosphere
- Reference to the social, historical or cultural context of the play` },
      { m: 15, d: 'h', p: ['LIVE_B.1'],
        q: `Analyse and evaluate how acting skills were used to create tension in one live theatre production you have seen. [15]`,
        ms: `${LEVELS}
Indicative content:
- The production, company and venue are named
- Specific moments are described in detail
- Analysis of vocal and physical skills used by named performers
- Evaluation of the effect on the audience` },
    ],
  },
  {
    subject: 'OCR_GCSE_PE_J587', code: 'P12', title: 'Demo Paper: Physical factors and socio-cultural issues',
    questions: [
      { m: 3, d: 'e', p: ['1.1.c'],
        q: `A performer rises onto their toes during a calf raise.
(a) Identify the class of lever operating at the ankle. [1]
(b) Identify the fulcrum, the load and the effort in this lever. [2]`,
        ms: `(a) Second class lever :: (1)
(b) Fulcrum: the ball of the foot; load: body weight :: (1)
Effort: the gastrocnemius muscle pulling on the heel :: (1)` },
      { m: 4, d: 'm', p: ['1.1.e'], x: ['1.1.d'],
        q: `Describe two short-term effects of exercise on the cardiovascular system and two short-term effects on the respiratory system. [4]`,
        ms: `Heart rate increases :: (1)
Stroke volume and cardiac output increase :: (1)
Breathing rate increases :: (1)
Tidal volume (depth of breathing) increases :: (1)` },
      { m: 4, d: 'm', p: ['1.2.b'],
        q: `Explain how the principle of progressive overload could be applied to a six-week training programme for a 5 km runner. [4]`,
        ms: `Training must gradually become harder so that the body continues to adapt :: (1)
Frequency: increase from two to three or four runs per week :: (1)
Intensity or time: run faster, or run for longer in each session :: (1)
Increases must be gradual to avoid injury and overtraining :: (1)` },
      { m: 4, d: 'm', p: ['2.1.a'],
        q: `Explain two reasons why participation rates in sport may be lower for some social groups than for others. [4]`,
        ms: `Two marks for each reason that is explained, for example:
Cost: equipment, membership and travel are unaffordable for people on low incomes :: (2)
Role models and media coverage: fewer visible role models for some groups reduces interest and confidence :: (2)` },
      { m: 4, d: 'm', p: ['2.2.b'],
        q: `A novice swimmer wants to improve. Using the SMART principle, describe a suitable goal and explain why it is effective. [4]`,
        ms: `A goal that is specific and measurable, e.g. to swim 100 m front crawl without stopping :: (1)
with a time limit, e.g. within eight weeks :: (1)
Achievable and realistic for a novice :: (1)
A goal like this maintains motivation and allows progress to be monitored :: (1)` },
      { m: 6, d: 'h', t: 8, p: ['2.1.b'],
        q: `Evaluate the impact of commercialisation on performers and spectators in sport. [6]`,
        ms: `${LEVELS}
Indicative content:
- Performers: sponsorship income lets them train full time; pressure to perform and loss of privacy
- Spectators: more coverage and better facilities; higher ticket prices and pay-per-view
- Changes to events to suit television schedules
- A balanced judgement` },
    ],
  },
  {
    subject: 'EDUQAS_GCSE_FOOD_C560P1', code: 'C1', title: 'Demo Paper: Principles of food preparation and nutrition',
    questions: [
      { m: 3, d: 'e', p: ['A2_2.1'],
        q: `State three functions of protein in the diet. [3]`,
        ms: `Growth :: (1)
Repair and maintenance of body tissues :: (1)
A secondary source of energy :: (1)` },
      { m: 4, d: 'm', p: ['A4_4.1'], x: ['A1_1.1'],
        q: `(a) Explain why gluten is important when making bread. [2]
(b) Describe what happens to the starch on the surface of bread as it bakes. [2]`,
        ms: `(a) Kneading develops gluten into a stretchy network :: (1)
which traps carbon dioxide from the yeast so the dough rises :: (1)
(b) Dry heat breaks the starch down into dextrin (dextrinisation) :: (1)
which gives the crust its golden brown colour :: (1)` },
      { m: 4, d: 'm', p: ['A4_4.2'],
        q: `(a) State the temperature range known as the danger zone. [1]
(b) Explain three ways to prevent cross-contamination when preparing raw chicken. [3]`,
        ms: `(a) 5 °C to 63 °C :: (1)
(b) Use a separate chopping board and knife for raw meat :: (1)
Wash hands thoroughly after handling the chicken :: (1)
Store raw chicken covered at the bottom of the fridge, below cooked food :: (1)` },
      { m: 6, d: 'm', p: ['A3_3.2'], x: ['A2_2.2'],
        q: `Discuss the nutritional needs of teenagers. [6]`,
        ms: `${LEVELS}
Indicative content:
- Protein for rapid growth
- Calcium and vitamin D for bone development and peak bone mass
- Iron, particularly for girls, to replace losses and prevent anaemia
- Energy needs are high, best met from starchy carbohydrates
- Limiting sugar, salt and saturated fat` },
      { m: 8, d: 'h', p: ['A5_5.1'],
        q: `Assess the advantages and disadvantages of buying locally produced, seasonal food. [8]`,
        ms: `${LEVELS}
Indicative content:
- Advantages: fewer food miles, fresher produce, support for local farmers and the local economy
- Disadvantages: less choice, sometimes higher prices, limited availability out of season
- Environmental points: heated greenhouses may use more energy than imports
- A balanced conclusion` },
    ],
  },
];
