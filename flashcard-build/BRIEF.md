You are building spaced-repetition flashcard sets for PurePastPapers, a revision website for UK students (repo \`purepastpapers/purepastpapers\`). Two subjects already have flashcards that the owner, Will, approved after several rounds of feedback: A-level History (Edexcel 9HI0) and A-level Politics (AQA 7152). Build sets for the five subjects below the same way, adjusted for what each subject needs.\
\
Read this whole brief before you start. Most of it records mistakes that were already made once and that Will rejected.\
\
\## 0. How to work\
\
\- \*\*Use subagents.\*\* Use the models Will calls \*\*Luna\*\* or \*\*Terra\*\* where you can choose. Give each subagent one subject, or one paper of a large subject. Then give a \*\*separate\*\* subagent the job of checking that work (section 7). The agent that wrote a card never checks it.\
\- \*\*Branch only.\*\* Work on a new branch, for example \`codex/flashcards-carry-over\`. Never push to \`main\`. Put all build files in a top-level folder \`flashcard-build/\<subject>/\`, not in the site folders (\`js/\`, \`data/\`, \`css/\`).\
\- \*\*Nothing goes live until Will approves the samples\*\* (section 9). Do not write to the production database, do not publish a catalogue and do not merge anything until he says so for that subject.\
\- \*\*Will has already answered the setup questions\*\* (section 1.1). If something new would change a whole deck, ask him once in a single message and carry on with everything else. If he doesn't answer, choose the most likely reading, record it in the "give this to Will" document, and carry on.\
\- Keep a short \`flashcard-build/LOG.md\` with decisions, counts and anything you skipped.\
\
\## 1. Subjects and scope\
\
Take the spec point ids from \`data/specs/\<SUBJECT_ID>.json\` in the repo. That file is the only source of tag ids. Look at \`data/packs/index.json\` and each subject's \`coverage.json\` / handover doc in \`docs/\` to see which route and options the site uses.\
\
\| # | Subject | Site subject id | Route on the site |\
\|---|---|---|---|\
\| 1 | A-level Sociology, AQA 7192 | \`AQA_ALEVEL_SOC_7192\` | Education with methods in context; Theory and methods; Families and households (P2 A); Beliefs in society (P2 B); Crime and deviance (P3). 30 spec leaves. |\
\| 2 | A-level Psychology, AQA 7182 | \`AQA_ALEVEL_PSYCH_7182\` | \*\*Spec v1.4 (Sept 2025, first A-level exam 2027).\*\* All compulsory topics plus options: Cognition and development, Schizophrenia, Forensic psychology. 84 leaves. Leave out content that v1.4 removed (for example Zimbardo, biological rhythms, Schaffer) even though old papers test it. Note 4.1.4 is now "Clinical psychology and mental health". |\
\| 3 | A-level English Literature, Edexcel 9ET0 | \`EDX_ALEVEL_ENGLIT_9ET0\` | Othello; A Streetcar Named Desire; Frankenstein + The Handmaid's Tale (Science and Society); Poems of the Decade; The Romantics (English Romantic Verse anthology). No NEA. |\
\| 4 | GCSE History, \*\*OCR History B (SHP) J411\*\* | \`OCR_GCSE_HIST_J411\` | Crime and Punishment c.1250 to present; The Norman Conquest 1065-1087; Viking Expansion c.750-c.1050; Living under Nazi Rule 1933-1945; History Around Us: \*\*Verulamium\*\* (Roman St Albans; see 1.1). 23 leaves. \*\*Not Edexcel 1HI0.\*\* The site replaced 1HI0 with OCR J411 on 23 Nov 2026, so ignore anything that says 1HI0. |\
\| 5 | GCSE English Literature, Eduqas C720QS | \`EDUQAS_GCSE_ENGLIT_C720QS\` | Macbeth; An Inspector Calls; A Christmas Carol; the \*\*2027 anthology (15 poems)\*\*; unseen poetry skills. \*\*Do not use the old 18-poem anthology\*\* (last examined 2026, no overlap with the new one). |\
\
\### 1.0 Psychology and Sociology: rebuild (Will asked for this explicitly)\
\
Psychology and Sociology already have live sets, built by someone else in a different style. Will wants them \*\*rebuilt in the History and Politics style\*\*, but keeping their good part: the mark scheme cards. A review of the live sets found these problems. Each one must be fixed in the rebuild:\
\
\| Problem in the old sets | What the rebuild does |\
\|---|---|\
\| Typical answer was 104 characters (Psychology) and 146 (Sociology), and a third to a half of answers packed in two or more ideas | One fact per card, with a word or short-phrase answer (ours average 17 to 48 characters) |\
\| About 30 "name two", "give one" or "what are the four" cards in each set | Split these into specific single-answer cards |\
\| Hedging in about half of Sociology answers ("may", "can", "often", "depends on context", "the association is probabilistic") | State the fact, or attribute the claim to a named sociologist or psychologist |\
\| Studies named without results (no "65% went to 450V" for Milgram, no "about a third of answers conformed" for Asch); concepts given without their sociologist ("second shift" with no Hochschild, "believing without belonging" with no Davie, Pahl's allowance system called "the classic account") | Put creditworthy evidence on the cards: named studies, their results and statistics, and named theorists |\
\| Sociology "How can X affect Y?" cards that anyone could answer without knowing any sociology | Cut them. Each card should test sociological knowledge |\
\| One deck, with a hidden "direct/support" tag that didn't match exam usefulness | Separate decks with no overlap (section 3) |\
\| 66 Sociology cards tagged to several spec points (one to 21); 27 Psychology cards with no spec point | Exactly one spec point per content card. Assessment and structure cards go in the technique deck |\
\| Cards about specific past papers ("In AQA's June 2024 Methods in Context question, what was the research focus?"), spec-wording cards ("What biological factors are specified?"), cards specific to one school (The Reach Free School), and subdeck names like "Specification subdivisions" or "support" | Drop all of these |\
\| About 5 cards per spec point (Psychology) and 11 (Sociology) | Cover everything each spec point needs. There's no target number: write as many cards as the content needs, and never pad |\
\
\*\*What to keep:\*\* the mark scheme catalogues \`AQA_ALEVEL_PSYCH_7182_MARK\` (64 cards) and \`AQA_ALEVEL_SOC_7192_MARK\` (28 cards). Each one gives an exam-style question, a model answer, the marking points and a common trap. Will likes them. Keep them as the separate Exam technique deck for each subject, and don't rewrite them into one-fact cards. Export them from Supabase (or ask Will's Claude for an export), then check each against the AQA mark schemes and the v1.4 spec. \*\*One known error must be fixed:\*\* the Psychology sign test card's worked table uses different numbers from its question (the final answer is right, but the working doesn't match). Rebuild that table from the question's own numbers and check the calculation. Fix any other error you find the same way, and list every change in "give this to Will". Keep each card's front exactly as it is where you can (the stable key comes from the front), and publish the fixed deck as a new version of the same catalogue id, so students keep their progress.\
\
Psychology research methods coverage in the old set is thorough (about 160 cards). You may use those cards as a \*\*checklist of topics to cover\*\*, but write the new cards to this brief. The review of the old sets is summarised above. Leave the old content catalogue entries alone (section 8); Will decides when to retire them.\
\
\### 1.1 Will's answers to the setup questions (25 Nov 2026)\
\
\- \*\*English Literature texts are confirmed\*\* as listed above, at both levels.\
\- \*\*GCSE History "History Around Us" is Verulamium\*\*, the Roman town at St Albans. The OCR spec doesn't name a site, so the spec can't be used to check any of these facts. Will asked for extra care here. Use only reliable sources: Historic England (the scheduled monument listing), Verulamium Museum and St Albans Museums, the British Museum, published archaeology (for example Sheppard Frere's excavations, Mortimer Wheeler's 1930s digs, and Rosalind Niblett's work on Verulamium), and Tacitus for Boudica's attack in AD 60/61. Put every Verulamium card on the "check these" list in "give this to Will", with its source. Where sources disagree (dates, population figures, what a feature was for), say so in the source column or cut the card. Tag cards to \`OCR_GCSE_HIST_HAU_3.1\` (the physical features of the site as evidence about its past) or \`OCR_GCSE_HIST_HAU_3.2\` (how the site fits into its wider historical context). Also add the site-independent skills cards (types of evidence, how to analyse a site).\
\- \*\*No target card count.\*\* Do whatever each subject needs. Coverage should be thorough enough that a student could answer any exam question on the spec point from the cards, and no deck should be padded to reach a number.\
\- \*\*Geography is out of scope.\*\* Don't build A-level or GCSE Geography.\
\
\## 2. The card format: SuperMemo minimum information (Will's rule for every flashcard)\
\
\*\*One card tests one fact.\*\* This is the rule Will cares about most.\
\
\- One question, one short answer: a single fact, name, date, number, definition, cause, finding, quote or evaluation point.\
\- The back is normally \*\*under 80 characters\*\*, with a hard limit of 120 (technique cards are the only exception, see section 5). The front can be longer (up to 260): \*\*put context in the question, not the answer.\*\*\
\- \*\*No list questions.\*\* Don't write "name two", "give three", "outline the reasons", or "give one" cards with several answers bundled together. Split a list into separate cards, each with a specific prompt. For example, instead of "Name five liberalising laws", write "Which 1967 Act decriminalised homosexual acts in private for men over 21?"\
\- If a question really does have several right answers and that's unavoidable, use \`Name one ... \` with the answer as \`X (also: Y, Z)\`. Do this rarely.\
\- \*\*No hedging.\*\* Don't write answers like "can", "may", "it depends on context" or "some argue". If a fact is contested, attribute it: "Which sociologist argued X?" → "Hochschild".\
\- \*\*Pair each concept with its source.\*\* Sociology and Psychology concepts name the person behind them ("second shift" → Hochschild, 1989), with the name on one card and the idea on another.\
\- \*\*A study is never named without what it found.\*\* Write separate cards for researcher and year, the procedure, the key finding (with its number where there is one) and the conclusion.\
\- Every number must match the question it answers. Check worked examples and calculations by recomputing them (section 7).\
\- Don't use em dashes (—). Use UK spelling. Write plain wording a 16-year-old can read.\
\- Don't duplicate fronts within a subject, and don't put near-identical cards in two decks.\
\
\## 3. Decks: fully separate, with no overlap\
\
Will rejected "exam set + full superset" designs. Each subject gets \*\*two to four separate decks\*\*, and \*\*no card is in more than one deck\*\*. Choose the split that makes sense for the subject. These are the splits I recommend (change them if the content argues otherwise, and explain why in "give this to Will"):\
\
\| Subject | Decks (catalogue id suffix: label) |\
\|---|---|\
\| Sociology | Same as Politics: \`\_CONTENT\` Key content (concepts, theories, which sociologist argued what) · \`\_EVIDENCE\` Exam evidence (named studies and findings, statistics with year and source, policies and laws with dates, contemporary examples) · \`\_BACKGROUND\` Background knowledge (useful context only, see 3.1) · existing \`\_MARK\` Exam technique (kept, see 1.0) |\
\| Psychology | Same as Politics: \`\_CONTENT\` Key content (definitions, theories, explanations, therapies, research methods terms, and evaluation points: one strength or weakness per card, with its reason) · \`\_EVIDENCE\` Exam evidence (key studies: researcher and year, aim, procedure, finding with its figure, and conclusion, one card each; plus supporting research for evaluation) · \`\_BACKGROUND\` Background knowledge (useful context only) · existing \`\_MARK\` Exam technique (kept, see 1.0) |\
\| A-level English Lit | \`\_QUOTES\` Key quotations (one quote per card: who says it, or when, plus what it shows) · \`\_CONTEXT\` Context (historical, literary and biographical context that is actually relevant to the texts) · \`\_CRITICS\` Critics and interpretations (one critic's view per card) · \`\_MARK\` Exam technique (AOs, how each section is marked) |\
\| GCSE History | \`\_EXAM\` Exam knowledge · \`\_BACK\` Background knowledge · \`\_MARK\` Exam technique (as in A-level History) |\
\| GCSE English Lit | \`\_QUOTES\` Key quotations · \`\_CONTEXT\` Context and themes · \`\_MARK\` Exam technique |\
\
Catalogue ids are \`\<SITE SUBJECT ID>\<SUFFIX>\`, for example \`AQA_ALEVEL_SOC_7192_CONTENT\`. The site labels decks by suffix in \`js/flashcards/api.js\` (\`setVariants\` and \`subjectLabels\`). \`\_EXAM\`, \`\_BACK\`, \`\_CONTENT\`, \`\_EXAMPLES\` and \`\_BACKGROUND\` already exist. Any new suffix, and any subject missing from \`subjectLabels\` (English Literature and both GCSE subjects), needs a small change to \`api.js\`, on its own branch and PR, that \*\*stays unmerged until Will approves\*\*. Keep the label text short, in the style of the existing labels.\
\
\### 3.1 What goes in "Background knowledge" (Will rejected the first History background set)\
\
Background must be \*\*useful context\*\*: key terms ("What is a means test?"), who was in power, the wider setting (the Cold War, the Counter-Reformation) and why things happened. It must \*\*not\*\* be random trivia: who starred in a film, who wrote a minor book, exact prices, minor launch dates, translation dates or TV start dates.\
\
\### 3.2 What counts as exam evidence (Will's rulings on History)\
\
\- Exam evidence is what happened and what it caused: laws, policies, statistics, events, causes and consequences. Each card should be something a student could write in an answer and get credit for. Check against the mark schemes' indicative content for that spec point.\
\- Names of who held a post (which minister, which official) are background, unless the person is the subject of the spec or the questions.\
\- Books, films, slogans, propaganda, "firsts", consumer goods and pressure groups \*\*are\*\* exam evidence when they show a trend. Word the front so it says what the item shows, not its date or who made it.\
\
\## 4. What each subject needs\
\
\*\*Politics needed up-to-date real-world examples.\*\* Apply the same idea wherever a subject uses current evidence, such as Sociology statistics and policies, and Psychology research that has been updated. Rules:\
\- Facts must be checked against reliable sources ([gov.uk](http://gov.uk/), ONS, [parliament.uk](http://parliament.uk/), BBC, Guardian, Reuters, AP, the board's own documents, the UN, the World Bank, the IPCC, the Environment Agency, the Office for Students).\
\- Give every statistic its year in the front ("In 2023, what share of ...").\
\- If something is still pending or disputed, word it carefully or leave it out. Don't guess at current figures.\
\- \*\*Cut-off date:\*\* today's date. Write "as of \<month year>" on anything likely to change.\
\
\*\*English Literature (both levels): quotes, context and critics.\*\*\
\- \*\*Quotes must be exact.\*\* Check each one against a reliable text of the set edition. Othello, Frankenstein, the Romantic poems, A Christmas Carol, Macbeth and Blake are out of copyright, so check them against Project Gutenberg, Folger or a similar source. Streetcar, The Handmaid's Tale, An Inspector Calls, Poems of the Decade and most of the 2027 Eduqas poems are in copyright: use only short quotes (a few words, never long passages) that you are certain of, and put \*\*every\*\* in-copyright quote on a "quotes to check" list in "give this to Will". If you are not sure of a quote's exact wording, drop it.\
\- Quote cards: the front gives the moment or speaker and asks for the quote, or gives the quote and asks who says it, when, or what it shows. Split these into separate cards.\
\- \*\*Critics:\*\* use only real, well-known critics whose views you can attribute with confidence (for example Bradley, Leavis or Greenblatt on Othello; Mellor on Frankenstein). Paraphrase the view ("Which critic saw Iago as motiveless malignity?" → "Coleridge"). Quote a critic word for word only when you have checked the exact wording. \*\*Never invent a critic, a book title or a quote.\*\* If you can't confirm one, cut it.\
\- Context must link to the text, for example Jacobean attitudes to race for Othello, or 1912 versus 1945 for An Inspector Calls. Don't write general biography trivia.\
\- GCSE Eduqas: the anthology is the 2027 one only. For unseen poetry, write method and terminology cards (one term per card), not facts about particular poems.\
\
\*\*Psychology: studies and evaluation\*\* (example figures that must be on cards: Milgram 65% to 450 V; Asch about 37% of answers conformed). Split each study into separate cards for researcher and year, aim, procedure, finding (with the figure, for example Milgram 65% to 450 V) and conclusion. Evaluation cards say one strength or weakness and why ("Why does Loftus and Palmer's study lack ecological validity?"). Research-methods calculation cards must have answers you have recomputed. Follow spec v1.4 only.\
\
\*\*Sociology: concepts with their sociologists, plus evidence.\*\* Each perspective (functionalist, Marxist, feminist, interactionist, postmodern, New Right) appears as "Which perspective argues X?" and "What does [sociologist] argue about Y?". Include statistics and policies (for example the 1988 Education Reform Act and academies) with dates. Methods in context gets its own cards per research method (one strength or limitation per card).\
\
\*\*GCSE History (OCR J411): the same model as A-level History.\*\* Exam knowledge and Background knowledge decks, fully separate, using the rules in 3.1 and 3.2. Add an Exam technique deck covering the J411 question types and mark allocations, taken from OCR's own mark schemes.\
\
\## 5. Exam technique (\`\_MARK\`) cards\
\
For Psychology and Sociology, keep the existing mark scheme decks (section 1.0). For every other subject, build an Exam technique deck \*\*in the same style\*\*, because Will likes it: the front is an exam-style question, and the back gives a short model answer, the marking points, and one common trap. This is the one exception to the 120-character limit and to one fact per card. Keep the back as short as it can be, use the same three labelled parts on every card, and add no other text. Also add short one-fact cards for the paper structure (time, marks, assessment objectives per question type).\
\
Take everything from the board's published mark schemes and examiner reports. Don't make up mark allocations, and don't write cards about one particular past paper. Technique cards have \`deck: "mark_scheme"\` and \*\*no\*\* \`PPP::Spec::\` tag. Recompute every worked number.\
\
\## 6. Tags, spec mapping and file format\
\
\- \*\*Each atomic card has exactly one spec point\*\*, the leaf id from \`data/specs/\<SUBJECT_ID>.json\`, for example \`PPP::Spec::AQA_SOC_4.1.1_b1\` (no zero padding) or \`PPP::Spec::OCR_GCSE_HIST_HAU_3.1\`. Don't tag a card to several topics, and don't leave a card untagged (the old Psychology and Sociology cards had from 0 to 21 tags). If a fact fits two points, pick the one the exam asks about, or write two differently worded cards.\
\- \*\*Every spec leaf on the route has cards in each content deck that applies.\*\* There's no minimum or target count: cover what the leaf needs, and don't pad thin leaves.\
\- \*\*Don't use hidden tags\*\* to separate content within a deck (the old sets hid a "support" tag). A different kind of card goes in a different deck.\
\- Tags on each card: \`PPP::Spec::\<leaf id>\`, \`PPP::\<Board>::\<code>\`, \`PPP::Deck::atomic\` (or \`mark_scheme\`), \`PPP::Paper::\<PaperN or component>\`, \`PPP::Topic::\<slug of topic title>\`, \`PPP::Class::\<deck name>\`.\
\- \*\*Source files:\*\* use the format the existing sets use. For each spec point, a heading line \`## \<leaf id> | \<deck>\`, then pairs of \`Q: \` and \`A: \` lines. Don't put anything else in these files. Examples are in the History and Politics builds (structure below). Will can read these easily.\
\- \*\*Build script\*\* (one per subject, modelled on the Politics \`build.py\`, which is reproduced in the appendix): parse the sources; fail on an unknown spec id, an unknown deck, a duplicate front, a back over 120 characters, an em dash, list-like backs, or a spec leaf with no cards. Write \`\<deck>-set.json\` and \`all-cards.json\` with these fields: \`deck, spec_id, front, back, paper, topic, point, set, catalogue, subdeck_path, tags, stable_key\`.\
\- \*\*subdeck_path:\*\* \`\<Board> \<Level> \<Subject> \<code> – \<Deck label>::\<Paper title>::\<Topic title>::\<point code> \<point title>\`.\
\- \*\*stable_key:\*\* \`ppp-\<subjectslug>-\<code>-\<suffix lower>:\` + the first 20 hex characters of \`sha256("\<SUFFIX>|\<spec_id>|\<front>")\`. The key comes from the front, so \*\*once a set is live, don't reword a front unless you have to.\*\* Rewording a front makes a new card and the student loses their progress on it.\
\- \*\*Tag check:\*\* adapt \`check-tags.mjs\` (appendix) for each subject. It uses the site's own \`js/engine/spec-index.js\` and \`js/flashcards/spec-map.js\`, and every atomic card must map to exactly one point that equals its \`spec_id\`. A subject with a special rule in \`spec-map.js\` (for example Psychology's zero-pad rule) must still pass. Don't build anything on top of a check that fails.\
\
\## 7. Accuracy: guarding against invented facts\
\
Every card goes through a second subagent that didn't write it. That subagent:\
\
1\. Checks the card against a source: the spec, a board mark scheme or examiner report, the set text, or a reliable published source (section 4). It records the source for each card in \`flashcard-build/\<subject>/sources.tsv\` (stable key, URL or document and page, and verified yes or no).\
2\. Deletes any card it can't confirm. \*\*When in doubt, cut it.\*\* A missing card does no harm; a wrong one teaches a student something false.\
3\. Checks that the card follows the format rules (one fact, no hedging, the study has its finding, the concept has its theorist).\
4\. Recomputes every number and calculation.\
5\. Checks that the spec point is the right one for the fact, not just a nearby one.\
6\. For English Lit, checks every quote word for word, and lists the in-copyright ones that couldn't be checked against a full text.\
\
Also:\
\- Use only the board's public pages and well-known reliable sources. Don't use third-party copies of exam papers, and don't use secure or teacher-only areas.\
\- Don't let a subagent "fill gaps" from memory without checking. Dates, statistics, study figures, quotes and critic attributions are the places mistakes slip in most often.\
\- Compare a random 10% of each subject's verified cards against sources yourself, and record the error rate in the log. If it is above 2%, re-check that subject.\
\
\## 8. Upload method (only after Will approves that subject's sample)\
\
The site reads cards from Supabase (tables \`flashcard_catalogue\`, \`flashcard_catalogue_versions\`, \`flashcard_catalogue_items\`, \`flashcard_catalogue_material\`, and the function \`flashcard_publish_catalogue\`; see \`supabase/migrations/20261122180500_flashcard_catalogue.sql\`). Published versions can't be changed: any fix means a new version and a new publish.\
\
\*\*Use plain SQL statements only.\*\* Don't use \`DO $$ ... $$\` blocks, temp tables or DDL (create, alter or drop). These raise an approval prompt that Will can't see in his app, and the work stalls. Send small batches (about 100 to 150 cards per statement), and run a \`SELECT\` count between steps.\
\
For each deck:\
1\. \`insert into public.flashcard_catalogue (id, title, subject_id, exam_board, qualification, topic, deck_type, status) values (...) on conflict (id) do nothing;\` with \`deck_type\` \`atomic\` (or \`mark_scheme\` for \`\_MARK\`).\
2\. \`insert into public.flashcard_catalogue_versions (catalogue_id, version) values ('\<id>', '\<YYYY-MM-DD>') returning id;\`\
3\. Generate the batch files in Python with the stable key, tags and subdeck path already worked out. Each batch is two plain statements:\
   - \`insert into public.flashcard_catalogue_items (catalogue_id, stable_key) select '\<id>', k from jsonb_to_recordset($j$[...]$j$) as x(k text) on conflict (catalogue_id, stable_key) do nothing;\`\
   - \`insert into public.flashcard_catalogue_material (version_id, catalogue_id, catalogue_card_id, front, back, note_type, variant, tags, suspended, subdeck_path) select '\<version uuid>', '\<id>', [i.id](http://i.id/), x.f, x.b, 'basic', 'forward', x.t, true, x.p from jsonb_to_recordset($j$[...]$j$) as x(k text, f text, b text, t text[], p text) join public.flashcard_catalogue_items i on i.catalogue_id = '\<id>' and i.stable_key = x.k;\`\
   - Make sure no card text contains \`$j$\`.\
4\. Check that the count and the md5 of the sorted stable keys (\`collate "C"\`) match \`\<deck>-set.json\`.\
5\. \`select public.flashcard_publish_catalogue('\<id>', '\<version uuid>'::uuid, '\<subject id>', '\<qualification>', '\<deck_type>', \<count>);\`\
\
If you don't have Supabase access, stop after generating the batch files and an \`UPLOAD.md\` runbook. Will's Claude will run them. \*\*Don't touch the existing Psychology or Sociology catalogue rows.\*\* Retiring the old sets is Will's decision once the new ones are live.\
\
\## 9. The final deliverable: "give this to Will"\
\
When every subject is built and checked, write \*\*\`give this to Will.md\`\*\* in \`flashcard-build/\`, and push the branch. Write it in plain, short sentences, for a reader skimming on a phone. It contains:\
\
1\. \*\*A summary table:\*\* for each subject, each deck with its card count and one line on what is in it, and the number of spec points covered out of the total.\
2\. \*\*A stratified sample for each subject.\*\* Draw it with a fixed seed so it can be repeated. For each deck, take one random card from each spec point. For a deck with many points, randomly take up to 3 points per topic and one card from each, so every topic and paper is represented. Aim for 40 to 90 cards per subject. Add 4 random technique cards. Show each card as:\
   \`\*\*N. \<point code> \<point title>\*\*\` / \`Front: ...\` / \`Back: ...\` / \`\_Source: ...\_\`\
   grouped by subject, deck, then paper.\
3\. \*\*Lists Will needs to check:\*\* Verulamium cards with their sources (GCSE History), in-copyright quotes that couldn't be checked against a full text (English Lit), facts marked "as of" that will date, content you left out and why (for example Psychology v1.4 removals and the old Eduqas anthology), and spec points with few cards.\
4\. \*\*Deck-split decisions\*\* you made that differ from section 3, with a one-line reason each.\
5\. \*\*Accuracy check results:\*\* cards cut during checking, and the 10% audit error rate per subject.\
6\. \*\*What happens next:\*\* "Nothing is live yet. Tell me which subjects are approved, and I'll upload them."\
\
Will reviews the samples and replies by subject. Fix whatever he flags across the \*\*whole\*\* set, not only the sampled cards (a flagged card usually means there are similar ones), then redraw the sample for that subject with a new seed. Only upload a subject when he has approved it.\
\
\## Appendix: how the existing sets were built\
\
\*\*History (Edexcel 9HI0), live:\*\* Exam knowledge 966 cards, Background knowledge 385 context cards, and Exam technique 52 cards. Source file example:\
\
\`\`\`\
\## EDX_HIST_1H_T1_1.1\
Q: Which 1918 Act gave the vote to all men over 21?\
A: The Representation of the People Act 1918\
Q: Under the 1918 Representation of the People Act, from what age could women vote (if they met a property qualification)?\
A: 30\
\`\`\`\
\
Background cards Will approved (context, not trivia):\
\
\`\`\`\
Q: What is meant by the 'post-war consensus'?\
A: Broad agreement between the main parties on the mixed economy, the welfare state and full employment\
Q: Why did unions gain bargaining power after 1945?\
A: Full employment made workers harder to replace\
\`\`\`\
\
\*\*Politics (AQA 7152), live:\*\* Key content 668, Exam examples 482 (kept up to date every week), Background knowledge 163. Source heading: \`## AQA_POL_3.1.1.1 | content\`.\
\
Politics \`build.py\` (adapt the paths, ids and set names):\
\
\`\`\`python\
import json, re, hashlib, collections\
spec=json.load(open('data/specs/AQA_ALEVEL_POL_7152.json'))\
points={p['id']:(s,t,p) for s in spec['sections'] for t in s['topics'] for p in t['points']}\
SETS={'content':('CONTENT','Key content'),'examples':('EXAMPLES','Exam examples'),'background':('BACKGROUND','Background knowledge')}\
cards=[]; errors=[]\
for f in ['p1','p2','p3']:\
  cur=None; q=None\
  for n,line in enumerate(open(f'source/{f}.txt',encoding='utf8'),1):\
    line=line.rstrip('\n')\
    if line.startswith('## '):\
      pid,st=[x.strip() for x in line[3:].split('|')]; cur=(pid,st)\
      if pid not in points: errors.append(f'{f}:{n} unknown {pid}')\
      if st not in SETS: errors.append(f'{f}:{n} bad set {st}')\
    elif line.startswith('Q: '): q=line[3:].strip()\
    elif line.startswith('A: '):\
      pid,st=cur; s,t,p=points[pid]; cat,label=SETS[st]\
      cards.append(dict(deck='atomic',spec_id=pid,front=q,back=line[3:].strip(),set=st,catalogue=cat,\
        tags=[f'PPP::Spec::{pid}','PPP::AQA::7152','PPP::Deck::atomic',f'PPP::Class::{st}']))\
      q=None\
    elif line.strip(): errors.append(f'{f}:{n} bad line {line}')\
fr=collections.Counter(c['front'] for c in cards)\
errors+=[f'duplicate front: {k}' for k,v in fr.items() if v>1]\
for c in cards:\
  c['stable_key']=f"ppp-pol-7152-{c['catalogue'].lower()}:"+hashlib.sha256(f"{c['catalogue']}|{c['spec_id']}|{c['front']}".encode()).hexdigest()[:20]\
  if c['deck']=='atomic' and len(c['back'])>120: errors.append('long back: '+c['front'][:60])\
  if '—' in c['front']+c['back']: errors.append('em dash: '+c['front'][:50])\
for st in SETS:\
  cov=collections.Counter(c['spec_id'] for c in cards if c['set']==st)\
  miss=[p for p in points if not cov[p]]\
  if miss: errors.append(f'{st}: no cards for {miss}')\
print('ERRORS' if errors else 'OK',\*errors,sep='\n')\
\`\`\`\
\
\`check-tags.mjs\` (run from the repo root as \`node check-tags.mjs \<deck>-set.json\`, and change the subject id):\
\
\`\`\`js\
import { readFileSync } from 'node:fs';\
const repo = process.cwd() + '/';\
const { createSpecIndex } = await import(repo + 'js/engine/spec-index.js');\
const { createTagMapper, cardPoints } = await import(repo + 'js/flashcards/spec-map.js');\
const SUBJECT = 'AQA_ALEVEL_SOC_7192';\
const index = createSpecIndex();\
index.add(JSON.parse(readFileSync(repo + \`data/specs/${SUBJECT}.json\`, 'utf8')));\
const map = createTagMapper(SUBJECT, index);\
const cards = JSON.parse(readFileSync(process.argv[2], 'utf8'));\
let ok = 0, bad = [], skills = 0; const pts = new Set();\
for (const c of cards) { const p = cardPoints(c.tags, map);\
  if (c.deck === 'mark_scheme') { if (p.length) bad.push(c.front); else skills++; continue; }\
  if (p.length === 1 && p[0] === c.spec_id) { ok++; pts.add(p[0]); } else bad.push([c.front, p]); }\
console.log({ mapped: ok, examSkills: skills, pointsCovered: pts.size, leaves: index.subjectLeaves(SUBJECT).length, bad: bad.length });\
if (bad.length) { console.log(bad.slice(0, 20)); process.exit(1); }\