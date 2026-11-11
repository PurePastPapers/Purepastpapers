// DEMO question bank — A-Level humanities, languages and Level 3 subjects.
// Original demo content (not from any exam board paper). Field key: see alevel-maths.mjs.
// Essay mark schemes give indicative content; real mark schemes use the board's level descriptors.

const LEVELS = 'Marked by level of response. Top-level answers are sustained, analytical and reach a supported judgement.';

export default [
  {
    subject: 'AQA_ALEVEL_GEOG_7037', code: 'P1', title: 'Demo Paper A: Physical geography',
    questions: [
      { m: 4, d: 'e', p: ['WC_1.1'], x: ['WC_1.5'],
        q: `Explain how positive feedback can affect the carbon cycle. [4]`,
        ms: `Positive feedback amplifies an initial change in a system :: (1)
e.g. rising temperatures thaw permafrost :: (1)
which releases stored carbon dioxide and methane :: (1)
increasing the greenhouse effect and causing further warming and thawing :: (1)` },
      { m: 6, d: 'm', p: ['WC_1.2'], x: ['SK_12.1'],
        q: `The table shows the water balance for a drainage basin in southern England.
| Month | Precipitation (mm) | Potential evapotranspiration (mm) |
| January | 82 | 12 |
| April | 48 | 51 |
| July | 44 | 104 |
| October | 79 | 38 |
Analyse the data shown in the table. [6]`,
        ms: `${LEVELS}
Indicative content:
- Precipitation exceeds potential evapotranspiration in January (+70 mm) and October (+41 mm): a water surplus
- July shows a deficit of 60 mm; April is close to balance (−3 mm)
- Seasonal pattern: soil moisture recharge in autumn, surplus in winter, utilisation in spring and deficit in summer
- Links to river discharge and groundwater levels; manipulates the data rather than just quoting it
- Recognises limits of four months of data` },
      { m: 20, d: 'h', p: ['WC_1.5', 'WC_1.3'], x: ['WC_1.6'],
        q: `'Human activity now has a greater impact on the carbon cycle than on the water cycle.' To what extent do you agree with this view? [20]`,
        ms: `${LEVELS}
Indicative content:
- Carbon: fossil fuel combustion, deforestation and land use change have raised atmospheric carbon dioxide above 420 ppm
- Water: abstraction, irrigation, deforestation, urbanisation and dams alter stores and flows, mainly at local and regional scales
- Scale: carbon impacts are global and long-lived; water impacts vary sharply between places
- Interdependence: warming from the enhanced greenhouse effect intensifies the water cycle
- Case study evidence from a tropical rainforest and a river catchment
- Judgement on extent, with criteria such as scale, permanence and reversibility` },
      { m: 9, d: 'm', p: ['COAST_3.2'],
        q: `Assess the importance of sediment cells in understanding how coastal systems operate. [9]`,
        ms: `${LEVELS}
Indicative content:
- Sediment cells as largely closed systems with inputs, transfers and stores
- Useful for sediment budgets and explaining why intervention in one place affects another down-drift
- Limits: cells are not fully closed; storms, sea level change and geology also control coastal form
- Assessment of importance relative to other concepts such as wave energy and dynamic equilibrium` },
      { m: 20, d: 'h', p: ['COAST_3.4'], x: ['COAST_3.5', 'COAST_3.2'],
        q: `'Hard engineering is no longer a sustainable approach to coastal management.' With reference to a coastal environment you have studied, how far do you agree? [20]`,
        ms: `${LEVELS}
Indicative content:
- Hard engineering: sea walls, groynes and rock armour; high cost, down-drift erosion and visual impact
- Soft engineering and managed retreat: beach nourishment, dune regeneration, realignment
- Sustainability judged economically, socially and environmentally, and over time with sea level rise
- Shoreline Management Plans: hold the line where high-value assets justify the cost
- Detailed place evidence, leading to a qualified judgement` },
      { m: 9, d: 'm', p: ['HAZ_5.1'], x: ['HAZ_5.4'],
        q: `Assess the usefulness of the hazard management cycle in understanding responses to seismic hazards. [9]`,
        ms: `${LEVELS}
Indicative content:
- The four stages: mitigation, preparedness, response and recovery
- Application to a named earthquake: building codes, drills, emergency response and reconstruction
- Limits: earthquakes cannot be predicted precisely; the model says little about inequality in capacity to respond
- Comparison with the Park model; overall assessment of usefulness` },
    ],
  },
  {
    subject: 'AQA_ALEVEL_GEOG_7037', code: 'P2', title: 'Demo Paper B: Human geography',
    questions: [
      { m: 4, d: 'e', p: ['GS_7.3'],
        q: `Outline the role of trade agreements in international trade. [4]`,
        ms: `Agreements between countries or blocs that reduce barriers to trade :: (1)
They lower or remove tariffs and quotas :: (1)
This increases the volume of trade between members :: (1)
but can disadvantage countries outside the agreement :: (1)` },
      { m: 9, d: 'h', p: ['URB_9.3'], x: ['WC_1.2'],
        q: `Assess the extent to which sustainable urban drainage systems (SuDS) can restore a more natural water cycle in urban catchments. [9]`,
        ms: `${LEVELS}
Indicative content:
- Urbanisation: impermeable surfaces reduce infiltration, increase surface runoff and shorten lag times
- SuDS: permeable paving, swales, green roofs and retention ponds increase infiltration and storage
- Evidence from a named urban area
- Limits: retrofitting costs, space, maintenance and extreme rainfall events
- Judgement: partial restoration rather than a return to the natural cycle` },
      { m: 20, d: 'h', p: ['CP_8.2'], x: ['CP_8.3'],
        q: `'Places are shaped more by external forces than by the people who live there.' With reference to a local place and a contrasting place you have studied, how far do you agree? [20]`,
        ms: `${LEVELS}
Indicative content:
- External forces: government policy, transnational corporations, migration and global institutions
- Endogenous factors: location, topography, built environment and demographic character
- The role of residents, community groups and local identity in resisting or directing change
- Meaning and representation: how insiders and outsiders perceive each place
- Detailed, contrasting evidence from both places and a reasoned judgement` },
    ],
  },
  {
    subject: 'EDX_ALEVEL_HIST_9HI0', code: 'P1', title: 'Demo Paper A: Britain transformed, 1918–97',
    questions: [
      { m: 20, d: 'm', p: ['1H_T1_1.1'],
        q: `How far do you agree that the decline of the Liberal Party was the main reason for the changing fortunes of political parties in the years 1918–31? [20]`,
        ms: `${LEVELS}
Indicative content:
- Liberal decline: the Asquith–Lloyd George split, the 1918 coupon election, loss of the working-class vote
- Rise of Labour: the 1918 constitution, trade union funding, the extended franchise
- Conservative strength: Baldwin's leadership, party organisation, appeal to new women voters
- The impact of the electoral system and the 1931 crisis
- Judgement on the relative importance of the stated factor` },
      { m: 20, d: 'h', p: ['1H_T2_2.2'], x: ['1H_T2_2.1'],
        q: `How accurate is it to say that the creation of the National Health Service was the most significant development in welfare provision in the years 1918–79? [20]`,
        ms: `${LEVELS}
Indicative content:
- The NHS (1948): universal care free at the point of use, and its effect on public health
- Other developments: the Beveridge Report, National Insurance and National Assistance, family allowances
- Interwar provision: unemployment insurance, the means test, council housing
- Challenges by the 1970s: rising costs and prescription charges
- Judgement using criteria such as reach, permanence and impact on living standards` },
      { m: 20, d: 'h', p: ['1H_T3_3.2'],
        q: `To what extent did the role and status of women change in the years 1918–79? [20]`,
        ms: `${LEVELS}
Indicative content:
- Political change: the franchise in 1918 and 1928, slow growth in the number of women MPs
- Work: wartime employment, the marriage bar, the Equal Pay Act 1970 and Sex Discrimination Act 1975
- Family and personal life: contraception, the Abortion Act 1967 and Divorce Reform Act 1969
- Continuity: pay gaps, domestic expectations and under-representation
- Judgement on the extent and pace of change` },
      { m: 20, d: 'h', p: ['1H_INT_5.1'],
        q: `'Thatcher's governments transformed the British economy for the better.' How convincing do you find this interpretation of the years 1979–90? [20]`,
        ms: `${LEVELS} In the real paper this question is based on two extracts.
Indicative content:
- Support: lower inflation, privatisation, wider share and home ownership, reduced trade union power, City deregulation
- Challenge: deindustrialisation, unemployment above three million, regional inequality, the late-1980s boom and bust
- Evaluation of how far change was transformation and how far it was 'for the better', and for whom
- Substantiated judgement on the interpretation` },
    ],
  },
  {
    subject: 'EDX_ALEVEL_HIST_9HI0', code: 'P23', title: 'Demo Paper B: The USA 1955–92 and the witch craze',
    questions: [
      { m: 20, d: 'm', p: ['2H2_K2_2.3'],
        q: `How far do you agree that Johnson's Great Society achieved its aims in the years 1964–68? [20]`,
        ms: `${LEVELS}
Indicative content:
- Aims: ending poverty and racial injustice, improving education and health care
- Successes: Medicare and Medicaid, the Civil Rights Act and Voting Rights Act, federal education funding, falling poverty rates
- Limits: urban riots, the cost of the Vietnam War, persistent inequality, conservative backlash
- Judgement on how far the aims were met` },
      { m: 20, d: 'h', p: ['2H2_K3_3.1'],
        q: `How accurate is it to say that the Watergate scandal was the main cause of the crisis of political leadership in the USA in the years 1973–80? [20]`,
        ms: `${LEVELS}
Indicative content:
- Watergate: abuse of power, Nixon's resignation and the loss of public trust
- Ford: the pardon and economic difficulties
- Carter: stagflation, the energy crisis and the Iran hostage crisis
- Wider causes: Vietnam, a more critical media and congressional reassertion
- Judgement on the relative significance of Watergate` },
      { m: 20, d: 'h', p: ['33_B_B.2'], x: ['33_B_B.1'],
        q: `How far do you agree that the growth of scientific thinking was the main reason for the decline of belief in witchcraft in Britain in the years c1580–c1750? [20]`,
        ms: `${LEVELS}
Indicative content:
- Scientific thinking: the Royal Society, Newton, empiricism and natural explanations
- Sceptical publications: Scot, Ady, Webster and Bekker
- Legal change: higher standards of evidence, sceptical judges such as Holt, the 1736 Witchcraft Act
- Notorious frauds and cases that discredited accusations
- Continuity: popular belief persisted well beyond elite belief
- Judgement on the main reason` },
      { m: 20, d: 'h', p: ['33_D_D.4'],
        q: `How far was Matthew Hopkins personally responsible for the scale of the East Anglian witch craze of 1645–47? [20]`,
        ms: `${LEVELS}
Indicative content:
- Hopkins and Stearne: methods such as watching and searching for marks, and the number of prosecutions they prompted
- Context: the breakdown of authority in the Civil War and the absence of assize judges
- Puritan religious anxiety and economic hardship
- Local support from communities and magistrates; opposition from John Gaule
- Judgement weighing the individual against the conditions` },
    ],
  },
  {
    subject: 'AQA_ALEVEL_POL_7152', code: 'P1', title: 'Demo Paper: UK, US and political ideas',
    questions: [
      { m: 9, d: 'm', p: ['UKGOV_1.2'], x: ['UKGOV_1.3'],
        q: `Explain and analyse three ways in which Parliament can hold the executive to account. [9]`,
        ms: `Up to 3 marks for each way explained and analysed.
Indicative content:
- Prime Minister's Questions and ministerial questions: public scrutiny, but often adversarial theatre
- Select committees: detailed investigation, strengthened by elected chairs, but they cannot compel change
- Votes and debates: legislation can be defeated or amended, and confidence withdrawn; limited by large majorities and whips` },
      { m: 25, d: 'h', p: ['UKGOV_1.1'],
        q: `'The UK constitution is no longer fit for purpose.' Analyse and evaluate this statement. [25]`,
        ms: `${LEVELS}
Indicative content:
- Flexibility of an uncodified constitution against the lack of entrenched rights
- Reform since 1997: devolution, the Human Rights Act, the Supreme Court, Lords reform
- Tensions: parliamentary sovereignty, executive dominance and asymmetric devolution
- The case for and against codification
- A clear, sustained judgement` },
      { m: 9, d: 'm', p: ['UKPOL_2.2'],
        q: `Explain and analyse three factors that can influence voting behaviour in UK general elections. [9]`,
        ms: `Up to 3 marks for each factor explained and analysed.
Indicative content:
- Age and education: now stronger predictors of vote than social class
- Party leaders and campaigns: valence judgements about competence
- Issues and the media: salient issues and the framing of them` },
      { m: 25, d: 'h', p: ['UKPOL_2.4'], x: ['UKPOL_2.1'],
        q: `'Pressure groups enhance democracy in the UK.' Analyse and evaluate this statement. [25]`,
        ms: `${LEVELS}
Indicative content:
- Participation and representation between elections; expertise for policy makers
- Pluralist view against elitist view: insider groups and wealthy interests have unequal access
- Direct action and its legitimacy
- Internal democracy and accountability of groups
- A clear, sustained judgement` },
      { m: 9, d: 'm', p: ['USGOV_3.2'], x: ['USGOV_3.3', 'USGOV_3.1'],
        q: `Explain and analyse three checks that Congress has on the power of the President. [9]`,
        ms: `Up to 3 marks for each check explained and analysed.
Indicative content:
- The power of the purse: control of budgets and appropriations
- Overriding a veto with a two-thirds majority in both houses: powerful but rarely achieved
- Senate confirmation of appointments and ratification of treaties; impeachment as a final check` },
      { m: 25, d: 'h', p: ['COMP_4.3'], x: ['USGOV_3.4', 'UKGOV_1.4'],
        q: `'The US Supreme Court is more powerful than the UK Supreme Court.' Analyse and evaluate this statement. [25]`,
        ms: `${LEVELS}
Indicative content:
- The US Court can strike down legislation under a codified, sovereign constitution
- The UK Court works within parliamentary sovereignty: declarations of incompatibility and ultra vires rulings
- Significant UK rulings on prorogation and Article 50
- Appointments, independence and politicisation in each system
- Structural, rational and cultural explanations for the differences; a clear judgement` },
      { m: 25, d: 'h', p: ['CORE_5.1'],
        q: `'Liberals agree about the role of the state.' Analyse and evaluate this statement with reference to the thinkers you have studied. [25]`,
        ms: `${LEVELS}
Indicative content:
- Classical liberalism: a minimal state and negative freedom (Locke, Mill)
- Modern liberalism: an enabling state and positive freedom (Green, Rawls)
- Shared ground: government by consent, limited and constitutional government
- Disagreement over welfare, taxation and economic intervention
- A clear, sustained judgement` },
    ],
  },
  {
    subject: 'EDX_ALEVEL_ENGLIT_9ET0', code: 'P1', title: 'Demo Paper: Drama, prose and poetry essays',
    questions: [
      { m: 35, d: 'h', p: ['SHAKES_A.1'], x: ['SHAKES_A.2'],
        q: `Explore how Shakespeare presents jealousy in Othello. You must relate your discussion to relevant contextual factors and ideas from your critical reading. [35]`,
        ms: `${LEVELS}
Indicative content:
- Jealousy as the engine of the tragedy: Iago's professional and sexual jealousy, and Othello's corruption
- Language: the 'green-eyed monster', animal imagery and the collapse of Othello's verse
- Dramatic methods: soliloquy, dramatic irony and the handkerchief as a prop
- Context: attitudes to race, honour and marriage in Venice
- Critical views on tragedy and the tragic hero` },
      { m: 35, d: 'h', p: ['SHAKES_A.1'],
        q: `Explore Shakespeare's presentation of Iago as a villain. You must relate your discussion to relevant contextual factors and ideas from your critical reading. [35]`,
        ms: `${LEVELS}
Indicative content:
- Motive and 'motiveless malignity'; improvisation and opportunism
- Relationship with the audience through soliloquy and aside
- Links to the stage Machiavel and the Vice figure
- How far other characters and Venetian society enable him
- Critical readings of Iago across time` },
      { m: 25, d: 'h', p: ['DRAMA_B.1'],
        q: `Explore the ways in which Williams presents the conflict between illusion and reality in A Streetcar Named Desire. You must relate your discussion to relevant contextual factors. [25]`,
        ms: `${LEVELS}
Indicative content:
- Blanche's illusions and the paper lantern; Stanley as the force of harsh reality
- Plastic theatre: music, lighting and the Varsouviana
- Structure: the movement towards exposure and breakdown
- Context: the Old South and post-war America; attitudes to gender and class` },
      { m: 40, d: 'h', p: ['PROSE_P.1', 'PROSE_P.2'],
        q: `Compare the ways in which the writers of your two chosen texts present attempts to control others. You must relate your discussion to relevant contextual factors. [40]`,
        ms: `${LEVELS}
Indicative content:
- The Handmaid's Tale: state control of bodies, language and movement in Gilead
- Frankenstein: Victor's attempt to control life, and the Creature's control over Victor
- Narrative methods: first-person and framed narratives; reliability
- Science and society contexts: Enlightenment science; second-wave feminism and the religious right
- Sustained comparison throughout` },
      { m: 30, d: 'h', p: ['MODERN_A.1'],
        q: `Choose one poem from Poems of the Decade that explores family relationships. Explore the ways in which the poet presents those relationships. (In the real paper this question asks for a comparison with an unseen poem.) [30]`,
        ms: `${LEVELS}
Indicative content:
- A clear argument about how the relationship is presented
- Close analysis of language, imagery, form and structure
- How tone and voice shape the reader's response
- In the real paper: a sustained comparison of methods with the unseen poem` },
      { m: 30, d: 'h', p: ['POET_B.2'],
        q: `Explore the ways in which Keats presents the relationship between imagination and reality. You must refer to two poems and relate your discussion to relevant contextual factors. [30]`,
        ms: `${LEVELS}
Indicative content:
- The pull of the ideal against return to the real, for example in the odes
- Sensuous imagery, negative capability and the ode form
- Romantic contexts: the imagination, nature and mortality
- Close reading of two poems, linked throughout` },
    ],
  },
  {
    subject: 'AQA_ALEVEL_PSYCH_7182', code: 'P1', title: 'Demo Paper: Papers 1–3 mixed questions',
    questions: [
      { m: 4, d: 'e', p: ['SOCIAL_1.3'],
        q: `Outline two explanations of resistance to social influence. [4]`,
        ms: `Social support: seeing others resist reduces the pressure to conform or obey :: (2)
Locus of control: people with an internal locus of control believe they control events and are more likely to resist :: (2)` },
      { m: 6, d: 'm', p: ['MEMORY_2.2'],
        q: `Describe and briefly evaluate the working memory model. [6]`,
        ms: `Description (up to 3 marks): central executive directs attention; phonological loop, visuo-spatial sketchpad and episodic buffer as slave systems with limited capacity.
Evaluation (up to 3 marks): support from dual-task studies and patient KF; the central executive is vague and hard to test.` },
      { m: 16, d: 'h', p: ['ATTACH_3.2'],
        q: `Discuss Bowlby's monotropic theory of attachment. [16]`,
        ms: `${LEVELS} AO1 = 6, AO3 = 10.
Indicative content:
- Attachment as innate and adaptive; monotropy, social releasers, the critical period and the internal working model
- Support: Lorenz's imprinting research; Hazan and Shaver on later relationships
- Challenges: Schaffer and Emerson found multiple attachments; the critical period is better seen as a sensitive period
- Economic and social implications for working parents` },
      { m: 8, d: 'm', p: ['PSYCHOPATH_4.2'],
        q: `Tom was bitten by a dog as a child. He is now so afraid of dogs that he avoids parks and crosses the road when he sees one.
Using the two-process model, explain Tom's phobia, and describe how systematic desensitisation could be used to treat it. [8]`,
        ms: `${LEVELS}
Indicative content:
- Acquisition by classical conditioning: the dog (neutral stimulus) was paired with the pain of the bite (unconditioned stimulus) to produce fear
- Maintenance by operant conditioning: avoiding parks reduces anxiety, which negatively reinforces avoidance
- Systematic desensitisation: relaxation training, an anxiety hierarchy, and gradual exposure while relaxed
- Application to Tom throughout, for example a hierarchy from pictures of dogs to stroking a dog` },
      { m: 6, d: 'm', p: ['RM_7.1', 'RM_7.4'],
        q: `A psychologist investigates whether background noise affects recall. One group of participants learns a word list in silence and a different group learns it with noise. Each participant's score out of 20 is recorded.
(a) Identify the experimental design and explain one limitation of it. [3]
(b) Identify an appropriate statistical test for these data and justify your choice. [3]`,
        ms: `(a) Independent groups design :: (1)
Participant variables differ between the groups :: (1)
so differences in recall may be caused by these rather than by noise :: (1)
(b) Mann–Whitney U test :: (1)
It is a test of difference with an independent groups design :: (1)
The data can be treated as ordinal :: (1)` },
      { m: 16, d: 'h', p: ['APPROACH_5.3'], x: ['APPROACH_5.4'],
        q: `Discuss the biological approach in psychology. Refer to at least one other approach in your answer. [16]`,
        ms: `${LEVELS} AO1 = 6, AO3 = 10.
Indicative content:
- Assumptions: behaviour has a physical basis in genes, biological structures and neurochemistry; evolution
- Methods: twin studies, brain scanning and drug trials; scientific and objective
- Real-world application to drug treatments
- Issues: determinism and reductionism
- Comparison with another approach, for example the humanistic emphasis on free will` },
      { m: 8, d: 'm', p: ['ISSUES_8.2'],
        q: `Discuss the nature–nurture debate in psychology. [8]`,
        ms: `${LEVELS}
Indicative content:
- Nature: heredity and innate influences; nurture: environment and experience
- The interactionist approach: the diathesis-stress model and epigenetics
- Evidence from twin and adoption studies and its limits
- Implications of taking an extreme position on either side` },
      { m: 16, d: 'h', p: ['OPT2_10.1'], x: ['BIO_6.1'],
        q: `Discuss biological explanations for schizophrenia. [16]`,
        ms: `${LEVELS} AO1 = 6, AO3 = 10.
Indicative content:
- Genetic basis: family and twin studies; schizophrenia as polygenic
- The dopamine hypothesis: hyperdopaminergia in the subcortex and hypodopaminergia in the cortex
- Neural correlates of symptoms
- Evaluation: antipsychotic evidence; the role of glutamate; correlation and causation; the diathesis-stress model` },
    ],
  },
  {
    subject: 'AQA_ALEVEL_SOC_7192', code: 'P1', title: 'Demo Paper: Education, families, beliefs and crime',
    questions: [
      { m: 4, d: 'e', p: ['EDU_1.3'],
        q: `Outline two ways in which the hidden curriculum may reproduce social class inequality. [4]`,
        ms: `Two marks for each way that is outlined, for example:
Teacher expectations and labelling lead to working-class pupils being placed in lower sets :: (2)
Schools reward middle-class language and cultural capital, so working-class pupils are disadvantaged :: (2)` },
      { m: 10, d: 'm', p: ['EDU_1.2'],
        q: `Analyse two reasons for gender differences in subject choice. [10]`,
        ms: `${LEVELS} In the real paper this question is based on an item.
Indicative content:
- Gender role socialisation and gender domains (Murphy and Elwood)
- Gendered subject images, peer pressure and teaching styles
- Each reason developed through a chain of reasoning, with analysis of its strength` },
      { m: 30, d: 'h', p: ['EDU_1.2'], x: ['EDU_1.3'],
        q: `Evaluate the view that differences in educational achievement between social classes are mainly the result of factors outside school. [30]`,
        ms: `${LEVELS}
Indicative content:
- External factors: material deprivation, cultural deprivation and cultural capital (Bourdieu)
- Internal factors: labelling, the self-fulfilling prophecy, setting and streaming, pupil subcultures
- The interaction of home and school, for example habitus and marketisation policies
- Evaluation of evidence and a reasoned conclusion` },
      { m: 20, d: 'h', p: ['MIC_2.1'], x: ['TM_3.1', 'EDU_1.3'],
        q: `Evaluate the strengths and limitations of using unstructured interviews to investigate pupils' experiences of setting and streaming. [20]`,
        ms: `${LEVELS}
Indicative content:
- Strengths: rapport and depth; validity; pupils can explain meanings in their own words
- Limitations: time, small samples, lack of reliability and representativeness
- Research characteristics of pupils and schools: power differences between adult and pupil, parental consent, gatekeepers, timetable constraints, the sensitivity of ability labels
- Method applied to the specific issue throughout` },
      { m: 10, d: 'm', p: ['FAM_4.2'],
        q: `Outline and explain two reasons for the increase in family diversity in the UK over the past 50 years. [10]`,
        ms: `${LEVELS}
Indicative content:
- Changes in the law and attitudes: divorce reform, civil partnership and same-sex marriage
- The changing position of women: employment and financial independence
- Secularisation and individualisation
- Each reason explained with a developed chain of reasoning` },
      { m: 30, d: 'h', p: ['CRIME_6.1'],
        q: `Evaluate the contribution of labelling theory to our understanding of crime and deviance. [30]`,
        ms: `${LEVELS}
Indicative content:
- The social construction of crime: Becker and moral entrepreneurs
- Primary and secondary deviance (Lemert); the deviance amplification spiral; Cicourel on typifications
- Strengths: exposes the role of power and the agencies of control
- Criticisms: deterministic; ignores the causes of primary deviance; Marxist and realist critiques
- A reasoned conclusion` },
      { m: 20, d: 'h', p: ['BELIEFS_5.5'],
        q: `Evaluate the view that secularisation is a feature of only some societies. [20]`,
        ms: `${LEVELS}
Indicative content:
- Evidence of secularisation in the UK and Western Europe: Wilson and Bruce
- Counter-evidence: the USA, religious market theory, the global growth of Pentecostalism
- Believing without belonging (Davie) and the spiritual revolution
- Problems of defining and measuring religiosity` },
    ],
  },
  {
    subject: 'EDUQAS_ALEVEL_FILM_A670QS', code: 'C12', title: 'Demo Paper: Components 1 and 2 essays',
    questions: [
      { m: 40, d: 'h', p: ['HOLLY_A.2'], x: ['HOLLY_A.1'],
        q: `Compare how far your two chosen Hollywood films reflect the signature features of their directors as auteurs. [40]`,
        ms: `${LEVELS}
Indicative content:
- Recurring visual style, themes and collaborators in each film
- How far the studio system or New Hollywood production context allowed individual authorship
- Close analysis of key sequences from both films
- Sustained comparison and a judgement on the usefulness of the auteur approach` },
      { m: 40, d: 'h', p: ['USFILM_B.1'],
        q: `'Spectators are active rather than passive.' How far do your two chosen American films support this view? [40]`,
        ms: `${LEVELS}
Indicative content:
- Passive and active models of spectatorship; preferred, negotiated and oppositional readings
- How film form positions the spectator in key sequences
- Differences between the mainstream and independent film
- The influence of social and cultural background on response` },
      { m: 40, d: 'h', p: ['BRIT_C.1'], x: ['BRIT_C.2'],
        q: `Explore how narrative structure shapes the ideological messages of your two chosen British films. [40]`,
        ms: `${LEVELS}
Indicative content:
- Narrative structure: linear and non-linear, resolution and character arcs
- How structure positions the audience towards or against dominant values
- Close reference to key sequences in both films
- British social and political contexts` },
      { m: 20, d: 'm', p: ['DOC_B.1'],
        q: `'Digital technology has made documentary film more truthful.' How far do you agree, with reference to your chosen documentary? [20]`,
        ms: `${LEVELS}
Indicative content:
- Lightweight digital cameras: access, intimacy and long observational shooting
- Digital editing and manipulation: the constructed nature of documentary truth
- The filmmaker's approach compared with the theories of filmmakers studied
- A judgement on 'more truthful'` },
    ],
  },
  {
    subject: 'EDUQAS_ALEVEL_DRAMA_A690QS', code: 'C3', title: 'Demo Paper: Text in performance',
    questions: [
      { m: 15, d: 'm', p: ['PRE1956_A.1'], x: ['CRAFT_S.1'],
        q: `As a performer, explain how you would use voice and movement to interpret Hecuba in the opening of The Trojan Women. [15]`,
        ms: `${LEVELS}
Indicative content:
- Vocal choices: pitch, pace, pause and the shift between lament and command
- Physicality: status, weight and the use of the floor and levels to show grief
- Relationship with the Chorus and the audience
- Justification by reference to the text` },
      { m: 25, d: 'h', p: ['PRE1956_A.1'], x: ['CRAFT_S.2', 'CRAFT_S.4'],
        q: `As a director, discuss how you would stage one key scene from The Trojan Women for a contemporary audience. Refer to the play's original performance conditions in your answer. [25]`,
        ms: `${LEVELS}
Indicative content:
- A clear directorial concept and its relevance to a modern audience
- Staging decisions: space, proxemics and the handling of the Chorus
- Original conditions: the Greek theatre, masks, the role of the Chorus and the festival context
- Detailed reference to the chosen scene` },
      { m: 20, d: 'h', p: ['POST1956_B.1'], x: ['CRAFT_S.3'],
        q: `As a designer, explain how your set and lighting design for Saved would communicate the social environment of the play. [20]`,
        ms: `${LEVELS}
Indicative content:
- Bond's sparse staging and what the bare stage communicates
- Set: materials, scale and the contrast between domestic interiors and public spaces
- Lighting: colour, intensity and its effect on mood and focus
- Justification with reference to specific scenes and the 1960s context` },
      { m: 40, d: 'h', p: ['EXTRACT_C.1'], x: ['CRAFT_S.2', 'CRAFT_S.5'],
        q: `With reference to an extract of your choice from The Curious Incident of the Dog in the Night-Time, discuss how you would direct it, drawing on live theatre you have seen. (In the real paper the extract is specified.) [40]`,
        ms: `${LEVELS}
Indicative content:
- How staging communicates Christopher's perspective
- Physical theatre, ensemble movement, projection and sound
- Specific influence of live productions seen, analysed rather than described
- Detailed reference to the extract` },
    ],
  },
  {
    subject: 'AQA_ALEVEL_SPAN_7692', code: 'P12', title: 'Demo Paper: Translation and essays',
    questions: [
      { m: 10, d: 'm', p: ['SOC2_2.1'], x: ['GRAM_5.1', 'SOC2_2.3'],
        q: `Traduce el siguiente texto al inglés. [10]
En los últimos años, España ha recibido a miles de inmigrantes que buscan una vida mejor. Aunque muchos se integran con éxito, otros se enfrentan a dificultades para encontrar trabajo y vivienda. Los expertos subrayan que la educación es fundamental para fomentar la convivencia.`,
        ms: `Example translation (accept equivalent wording):
In recent years, Spain has received thousands of immigrants who are looking for a better life. Although many integrate successfully, others face difficulties in finding work and housing. Experts stress that education is fundamental to encouraging people to live together in harmony.
The text is divided into sections for marking, with one mark for each section translated accurately.` },
      { m: 10, d: 'm', p: ['SOC1_1.2'], x: ['GRAM_5.1'],
        q: `Translate the following passage into Spanish. [10]
Young people today spend more time online than ever before. Although social networks allow us to keep in touch with friends, they can also create problems if they are not used responsibly.`,
        ms: `Example translation (accept equivalent wording):
Los jóvenes de hoy pasan más tiempo en línea que nunca. Aunque las redes sociales nos permiten mantenernos en contacto con los amigos, también pueden crear problemas si no se usan de forma responsable.
The text is divided into sections for marking, with one mark for each section translated accurately.` },
      { m: 40, d: 'h', p: ['LIT_6.2'],
        q: `Analiza la importancia del papel de las mujeres en la película que has estudiado. Escribe aproximadamente 300 palabras. [40]`,
        ms: `${LEVELS} AO3 (language) = 20, AO4 (critical and analytical response) = 20.
Indicative content:
- The main female characters and their role in the plot
- How the director presents them through dialogue, camera work and setting
- The social and historical context of the film
- Evaluation of their importance, with precise reference to scenes` },
      { m: 40, d: 'h', p: ['LIT_6.1'],
        q: `Examina cómo el autor presenta el tema del conflicto entre generaciones en la obra que has estudiado. Escribe aproximadamente 300 palabras. [40]`,
        ms: `${LEVELS} AO3 (language) = 20, AO4 (critical and analytical response) = 20.
Indicative content:
- Key relationships that show the conflict
- Literary techniques: characterisation, symbolism and structure
- The social and historical context of the work
- A clear argument supported by precise reference to the text` },
    ],
  },
  {
    subject: 'OCR_L3_BUS_CTEC', code: 'U12', title: 'Demo Paper: Units 1 and 2',
    questions: [
      { m: 4, d: 'e', p: ['U1_1.1'],
        q: `Explain two differences between a private limited company and a public limited company. [4]`,
        ms: `Shares in a public limited company can be sold to the general public on a stock exchange :: (1)
whereas shares in a private limited company are sold privately with the agreement of shareholders :: (1)
A public limited company must have at least £50 000 of share capital and publish detailed accounts :: (1)
whereas a private limited company has no minimum share capital and lighter reporting requirements :: (1)` },
      { m: 6, d: 'm', p: ['U1_1.4'],
        q: `A business has fixed costs of £24 000. Each unit sells for £20 and has a variable cost of £12.
(a) Calculate the break-even output. [2]
(b) Calculate the margin of safety when 4500 units are sold. [2]
(c) Calculate the profit made when 4500 units are sold. [2]`,
        ms: `(a) Contribution per unit = £20 − £12 = £8 :: (1)
Break-even output = {{24 000|8}} = 3000 units :: (1)
(b) 4500 − 3000 :: (1)
= 1500 units :: (1)
(c) 4500 × £8 − £24 000 :: (1)
= £12 000 :: (1)` },
      { m: 8, d: 'm', p: ['U1_1.6'],
        q: `Analyse how a rise in interest rates might affect a house-building business. [8]`,
        ms: `${LEVELS}
Indicative content:
- Mortgages cost more, so demand for new houses falls
- The cost of the business's own borrowing rises, reducing profit margins
- Possible responses: lower prices, slower building, smaller homes
- Analysis develops each point into a chain of consequences for the business` },
      { m: 6, d: 'm', p: ['U2_2.2'],
        q: `Explain three factors a business should consider when arranging a meeting with clients who are based overseas. [6]`,
        ms: `Two marks for each factor explained, for example:
Time zones: choose a time within working hours for all participants :: (2)
Format and technology: video conferencing avoids travel cost, but needs reliable connections :: (2)
Language and culture: translated documents and awareness of business customs :: (2)` },
    ],
  },
  {
    subject: 'OCR_L3_SPORT_CTEC', code: 'U13', title: 'Demo Paper: Units 1 and 3',
    questions: [
      { m: 4, d: 'e', p: ['U1_1.2'], x: ['U1_1.1'],
        q: `A performer carries out the upward phase of a biceps curl.
(a) Identify the agonist and the antagonist at the elbow. [2]
(b) Identify the type of muscle contraction in the agonist. [1]
(c) Identify the type of synovial joint at the elbow. [1]`,
        ms: `(a) Agonist: biceps brachii :: (1)
Antagonist: triceps brachii :: (1)
(b) Concentric (isotonic) contraction :: (1)
(c) Hinge joint :: (1)` },
      { m: 6, d: 'm', p: ['U1_1.3'],
        q: `At rest an athlete has a stroke volume of 70 ml and a heart rate of 72 beats per minute. During exercise the stroke volume is 120 ml and the heart rate is 150 beats per minute.
(a) Calculate the cardiac output at rest and during exercise, in litres per minute. [3]
(b) Explain why stroke volume increases during exercise. [3]`,
        ms: `(a) Cardiac output = stroke volume × heart rate :: (1)
Rest: 70 × 72 = 5040 ml = 5.04 litres per minute :: (1)
Exercise: 120 × 150 = 18 000 ml = 18.0 litres per minute :: (1)
(b) Venous return increases as working muscles squeeze the veins :: (1)
The ventricles fill more and the cardiac muscle is stretched :: (1)
so it contracts with more force (Starling's law) and ejects more blood :: (1)` },
      { m: 6, d: 'm', p: ['U1_1.5'],
        q: `Explain which energy system is predominant in a 100 m sprint and which is predominant in a 1500 m race. [6]`,
        ms: `100 m sprint: the ATP-PC system :: (1)
Maximal intensity for about 10 seconds :: (1)
Phosphocreatine is broken down to resynthesise ATP rapidly without oxygen :: (1)
1500 m race: mainly the aerobic system, with a large contribution from the lactic acid system :: (1)
The duration of several minutes exceeds the capacity of the anaerobic systems :: (1)
Glucose is broken down with oxygen to give a high yield of ATP :: (1)` },
      { m: 8, d: 'm', p: ['U3_3.1'], x: ['U3_3.2'],
        q: `Discuss the role of national governing bodies in the development of sport in the UK. [8]`,
        ms: `${LEVELS}
Indicative content:
- Setting rules, organising competitions and selecting national teams
- Increasing participation through clubs, schools and targeted programmes
- Developing coaches and officials; talent pathways to elite level
- Distributing funding and meeting targets set by funders
- Limits: funding pressures and unequal reach across groups` },
    ],
  },
];
