# Geography flashcards: rules for writers and checkers

Subject: AQA A-level Geography 7037 (`AQA_ALEVEL_GEOG_7037`). Only this school's route:

- Paper 1: Water and carbon cycles (3.1.1), Coastal systems and landscapes (3.1.3), Hazards (3.1.5)
- Paper 2: Global systems and global governance (3.2.1), Changing places (3.2.2), Contemporary urban environments (3.2.3)
- Paper 3 (NEA) and skills: 3.3.1 fieldwork, 3.4.1 and 3.4.2.1 to 3.4.2.5 skills

Spec leaf text for each topic is in `flashcard-build/geography/spec/<topic>.md`. Tag ids come ONLY from there.

Official AQA sources (text versions, already downloaded) are in
`/tmp/claude-0/-home-user-Purepastpapers/f19d0972-8b1c-5124-93be-13cb15eca63c/scratchpad/geo-src/txt/`:
`AQA-7037{1,2}-MS-*` mark schemes (indicative content), `-WRE-*` examiner reports, `-QP-*` question papers,
`-SMS`/`-SQP` specimen, `SPEC-7037.pdf.txt` specification. Grep them. Use WebSearch for facts outside them
(only reliable sources: USGS, NOAA, Met Office, NASA, IPCC, UN agencies, World Bank, ONS, gov.uk,
Environment Agency, BGS, British Antarctic Survey, Antarctic Treaty Secretariat, WTO, UNCTAD, BBC,
Guardian, Reuters, AP, peer-reviewed papers, university pages, Royal Geographical Society, Geographical Association).

## Card rules (SuperMemo minimum information)

- **One card tests one fact.** One question, one short answer.
- Back normally under 80 characters, hard limit 120. Front up to 260. Put context in the question, not the answer.
- **No list questions.** No "name two", "give three", "outline the factors". Split into specific single-answer cards.
  Very rarely, `Name one ...` with answer `X (also: Y, Z)`.
- **No hedging** ("can", "may", "some argue", "it depends"). State the fact, or attribute it: "Which geographer described place as a 'meeting place' of global flows?" -> "Doreen Massey".
- Concepts and models name their author (Park model, Doxey's Irritation Index, Massey's progressive sense of place, Relph's placelessness, Burgess, Hoyt, Harris and Ullman, Wallerstein's world systems), name on one card, idea on another.
- **A case study is never named without its facts.** Separate cards for: where and when, cause, magnitude figure, deaths or cost figure, one impact, one response. Every statistic carries its year and, where it matters, its source in the front ("According to USGS, what magnitude was the 2010 Haiti earthquake?" -> "7.0").
- Processes: one step or one definition per card ("What is the term for water dripping from leaves to the ground?" -> "Throughfall").
- Evaluation / evaluative points: one strength or weakness per card with its reason.
- Every number must match its question. Recompute any calculation.
- No em dashes (—) and no en dashes used as dashes. Use hyphens or commas. UK spelling. Plain wording a 16-year-old can read.
- No duplicate fronts. No near-identical cards in two decks.
- No cards about one specific past paper ("In June 2024 Q3..."), no spec-wording cards ("What does the spec list under..."), nothing school-specific.
- If you cannot confirm a fact from a reliable source, DO NOT write the card. A missing card does no harm; a wrong one teaches something false.
- If sources disagree on a figure, either cut the card or word it as "about X" and name the source in the front.
- Anything likely to change (CO2 ppm, populations, recent statistics) says "as of <month year>" or gives the year in the front. Today is 25 November 2026.

## Decks (no card is in more than one deck)

| deck tag | Catalogue suffix | Label | What goes in |
|---|---|---|---|
| `content` | `_CONTENT` | Key content | Definitions, processes, landforms and how they form, models and theories with their authors, key terms, factors, skills and methods, evaluation points. Generic knowledge true of any place. |
| `evidence` | `_EVIDENCE` | Case studies and evidence | Named places, events, case studies, statistics with year and source, named schemes, policies, treaties, organisations' actions, TNC examples, real data. Anything a student would quote as an example in an answer. |
| `mark` | `_MARK` | Exam technique | Exam-style question, model answer, marking points, common trap (see section below), plus one-fact paper-structure cards. Written by the mark-scheme writer only. |

Rule of thumb: if the card names a real place, event, date, organisation or statistic, it is `evidence`. If it is
true in general, it is `content`.

**Every content leaf needs cards in `content`. Every leaf except the pure skills leaves needs cards in `evidence`.**
Case-study leaves (3.1.1.6, 3.1.3.6, 3.1.5.7, 3.2.3.9, 3.2.2.4) go in `evidence` only.

Coverage target: no fixed number. A student who knew every card for a leaf should be able to answer any exam
question on that leaf. Do not pad. For guidance, a full content leaf like 3.1.1.2 or 3.1.5.5 typically needs 30 to 70 cards.

### Case studies to use (schools choose their own; we use widely taught ones and flag this for Will)

- Water and carbon 3.1.1.6: Amazon rainforest (tropical rainforest case study). Skip the local river catchment (school-specific).
- Coasts 3.1.3.6: Holderness coast (UK, erosion and management, e.g. Mappleton, Easington, Spurn); contrasting coast beyond the UK: the Sundarbans / Bangladesh coast, and the Maldives (sea level rise). Use other well-documented named examples freely in other leaves (Dawlish Warren, Chesil Beach, Studland, Old Harry, Durdle Door, Lulworth Cove, Medmerry managed realignment, Happisburgh, Shoreline Management Plans).
- Hazards 3.1.5.7: multi-hazardous environment = the Philippines; recent events: Haiti 2010 and Tohoku (Japan) 2011 earthquakes, Turkey-Syria 2023 earthquake, Eyjafjallajokull 2010, Montserrat (Soufriere Hills 1995 onwards), Mount Pinatubo 1991, Nyiragongo 2021, Typhoon Haiyan 2013, Hurricane Katrina 2005, Cyclone Nargis 2008, Hurricane Maria 2017, Australia Black Summer 2019-20, Black Saturday 2009, California Camp Fire 2018. Skip the local-scale hazard case study.
- Global systems: Apple or another well-documented TNC (supply chains), trade in one commodity, WTO, IMF, World Bank, UN, Antarctica (Antarctic Treaty 1959, Madrid Protocol 1991, CCAMLR, IAATO, threats and governance).
- Changing places: theory and concepts belong in content; evidence = documented real examples of place change and representation (e.g. regeneration of Stratford / Queen Elizabeth Olympic Park, Liverpool docks, Detroit decline, Salford MediaCityUK), with figures from ONS / councils / reliable press. Skip the student's own local and distant place studies (school-specific).
- Urban 3.2.3.9: London (UK city) and Mumbai (contrasting city, e.g. Dharavi) plus well-documented examples in each leaf: Curitiba, Freiburg, Masdar, Detroit, Beijing / Delhi air pollution, London ULEZ, Boscastle or Hull floods, SuDS, Lagos, Rio favelas, Bristol or London Docklands regeneration.

## Source file format

One file per topic: `flashcard-build/geography/source/<topic>.txt`. Nothing else in the file except:

```
## AQA_GEOG_3.1.5.5 | content
Q: What is the minimum sea surface temperature needed for a tropical storm to form?
A: About 26.5°C
Q: Which force makes tropical storms spin?
A: The Coriolis force
## AQA_GEOG_3.1.5.7 | evidence
Q: In which year did Typhoon Haiyan hit the Philippines?
A: 2013
```

- Heading: `## <leaf id> | <deck>` where deck is `content`, `evidence` or `mark`. A heading may repeat later in the file.
- Then pairs of `Q: ` and `A: ` lines, one line each. No blank lines inside a block are needed (blank lines are allowed).
- Mark scheme cards: heading `## MARK_P1 | mark`, `## MARK_P2 | mark` or `## MARK_NEA | mark`. The `A:` line may
  use the literal two characters `\n` for line breaks. Back format, exactly three labelled parts:
  `Model answer: ...\nMarking points: ...\nCommon trap: ...`. Short one-fact structure cards also go under these headings.

## Sources log

Each writer also writes `flashcard-build/geography/sources/<topic>.tsv` with columns
`front<TAB>source` (URL, or AQA document name and page) for every evidence card and for any content card whose
fact is not standard textbook knowledge. Checkers add a third column `verified` (yes / cut / fixed).
