"""Regenerate the review checkpoint and stratified samples; never publish."""
import collections, csv, hashlib, importlib.util, json, pathlib, random, re, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=ROOT/'flashcard-build'
spec=importlib.util.spec_from_file_location('compiler',BASE/'build.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
LABELS={'psychology':'A-level Psychology','sociology':'A-level Sociology','alevel-englit':'A-level English Literature','gcse-history':'GCSE History (OCR J411)','gcse-englit':'GCSE English Literature (Eduqas 2027)'}

def ledger(path):
 if not path.exists():return {}
 return {r['stable_key']:r for r in csv.DictReader(path.open(),delimiter='\t')}

def norm_sources(name,cards):
 folder=BASE/name; rows=ledger(folder/'sources.tsv')
 if name=='psychology':rows.update(ledger(folder/'review-p1.tsv'))
 drafts={}
 for path in list(folder.glob('*sources.tsv')):
  if path.name=='sources.tsv':continue
  for r in csv.DictReader(path.open(),delimiter='\t'):
   if r.get('front'):
    url=r.get('source') or r.get('URL/document/page') or r.get('url') or ''
    if url:drafts[r['front']]=url
 out=[]
 for c in cards:
  row=rows.get(c['stable_key'],{})
  out.append(dict(stable_key=c['stable_key'],source=row.get('source') or drafts.get(c['front'],'SOURCE NOT YET ESTABLISHED'),verified='yes' if row.get('verified')=='yes' else 'no',note=row.get('note') or row.get('reason') or ('Independently source-supported; see subject review notes' if row.get('verified')=='yes' else 'Independent verification outstanding')))
 with (folder/'checkpoint-sources.tsv').open('w') as fh:
  w=csv.DictWriter(fh,fieldnames=['stable_key','source','verified','note'],delimiter='\t',lineterminator='\n');w.writeheader();w.writerows(out)
 return {r['stable_key']:r for r in out}

allcards={};sources={};reports={}
for name in LABELS:
 if not mod.compile_subject(name,True):raise RuntimeError(name+' failed; report must not reuse stale output')
 folder=BASE/name;cards=json.loads((folder/'draft/all-cards.json').read_text());allcards[name]=cards;sources[name]=norm_sources(name,cards);reports[name]=json.loads((folder/'build-report.json').read_text())
 subprocess.run(['node','flashcard-build/check-tags.mjs',mod.CONFIG[name][0],str(folder/'draft/all-cards.json')],cwd=ROOT,check=True,stdout=subprocess.PIPE)
summary=['# Give this to Will: review checkpoint','', '25 November 2026. **Incomplete. No subject is ready for approval or upload.**','', 'These are draft sources and source-check results, not finished revision decks. A leaf with one card counts as represented below; that does not prove the leaf is fully taught.','', 'Nothing has been uploaded, merged or deployed. The old live content and MARK catalogues are unchanged.','', '| Subject | Draft deck counts | Leaves represented | Independently supported cards |','|---|---|---:|---:|']
for name,cards in allcards.items():
 r=reports[name];n=sum(x['verified']=='yes' for x in sources[name].values());count=', '.join(f'{mod.SETS[k][1]} {v}' for k,v in sorted(r['counts'].items()))
 summary.append(f'| {LABELS[name]} | {count} | {r["covered"]}/{r["leaves"]} | {n}/{len(cards)} |')
summary+=['','The 64 Psychology and 28 Sociology MARK cards were exported separately. The reviewed subset is not a complete replacement and must not be uploaded over either live catalogue. Exact fronts, stable keys and catalogue card IDs are preserved in the original and candidate exports.','', '## What was checked','', '- All five draft builds and the site’s own spec tag mapper run on current source files. Invalid tags, unknown leaves, duplicate fronts, long atomic backs, em dashes and common list patterns fail the compiler.', '- The corrected sign-test table was recomputed independently. It has six positive changes, two negative changes and two ties: s = 2 and N = 8.', '- Independent reviewers wrote per-card source verdicts. A “yes” is evidence for the specific retained card, not certification that a whole subject is complete.', '- The first GCSE Literature 10% sample exposed broad recall prompts. All matching templates were reviewed and removed or replaced. A second 12-card sample found a source/page mismatch for an Inspector Calls claim; records sharing that citation require a new audit. Final 10% error rates for all five finished subjects are not available.', '', '## Work still required','', '- Psychology: detailed study/evaluation coverage, research-methods completeness and independent checks beyond the reviewed Paper 1 cards. Missing leaves after quarantine are listed below. No Background knowledge deck has been built.', '- Sociology: substantially more studies/results, named theorists and methods-in-context detail. Review draft deck placement and near-duplicates across all sets; many source assignments remain unverified.', '- A-level Literature: substantial quotation recall, context and critical interpretations across the route. Most items currently in the quotation draft test moments or methods. This is an unresolved design departure, not an approved split.', '- GCSE History: substantially more exam knowledge, causes/consequences and checked J411 technique/model-answer cards. The small current source-backed selection cannot teach the whole course.', '- GCSE Literature: substantially more analysis, relevant context, quotations and technique breadth. Source verification alone does not establish exam coverage.', '- Preserve all supported existing MARK cards; the checked subset and quarantine are review aids, not a replacement version. Recheck the remaining cards against precise public AQA sources.', '', '## Sources and disputed details','', '- The 2027 Eduqas anthology has 15 poems. The old 18-poem anthology was excluded.', '- Psychology uses v1.4. Removed material such as Zimbardo, biological rhythms and Schaffer is excluded.', '- The Milgram telephone-variation percentage is quarantined: the original table’s printed percentage conflicts with its 9/40 count, and an AQA-hosted source repeats the printed value. The source disagreement is recorded in the Psychology review files.', '- No geography decks or NEA cards were built.', '- Public-domain quotation text is distinguished from copyrighted text. The review lists below flag retained A-level copyrighted-text cards for manual checks.', '', '## Thin or missing leaves','']
for name,cards in allcards.items():
 r=reports[name];cv=collections.Counter(c['spec_id'] for c in cards if c['deck']=='atomic')
 thin=[f'{k} ({v})' for k,v in cv.items() if v<4]
 summary+=['**'+LABELS[name]+'**','', 'Missing: '+(', '.join(r['missing']) or 'None represented as zero; content completeness still unverified')+'.','', 'Fewer than four draft cards: '+(', '.join(thin) or 'None')+'.','']
summary+=['## Stratified draft samples','', 'Seed: 20261125. One card per selected leaf in each deck, up to three leaves per topic. Every available topic is represented. Four technique cards are added where available. Each sample states its verification status. These samples are for diagnosis, not approval.','']
rng=random.Random(20261125)
for name,cards in allcards.items():
 summary+=['### '+LABELS[name],''];sample=[]
 atomic=[c for c in cards if c['deck']=='atomic']
 for st in sorted({c['set'] for c in atomic}):
  for topic in sorted({c['topic'] for c in atomic if c['set']==st}):
   group=[c for c in atomic if c['set']==st and c['topic']==topic];pids=sorted({c['spec_id'] for c in group});selected=rng.sample(pids,min(3,len(pids)))
   sample += [rng.choice([c for c in group if c['spec_id']==pid]) for pid in selected]
 tech=[c for c in cards if c['deck']=='mark_scheme']
 if name in ('psychology','sociology'):
  mark=json.loads((BASE/'mark-candidate.json').read_text());cat=mod.CONFIG[name][0]+'_MARK';tech=[dict(c,deck='mark_scheme',spec_id=None,set='mark_scheme',paper='Assessment skills',topic='Existing MARK',point={'code':'','title':'Existing MARK'}) for c in mark if c['catalogue_id']==cat]
 sample+=rng.sample(tech,min(4,len(tech)))
 sample.sort(key=lambda c:(c['set'],c['paper'],c.get('spec_id') or '',c['front']))
 for i,c in enumerate(sample,1):
  src=sources[name].get(c['stable_key']) or ledger(BASE/'mark-review/sources.tsv').get(c['stable_key'],{})
  title=c['point'].get('title','') if isinstance(c['point'],dict) else str(c['point'])
  summary += [f'**{i}. {c.get("spec_id") or "Technique"} {title}**',f'Deck: {c["set"]}; paper: {c["paper"]}',f'Front: {c["front"]}',f'Back: {c["back"]}',f'_Source: {src.get("source","SOURCE NOT YET ESTABLISHED")}; independently verified: {src.get("verified","no")}._','']
summary+=['## Verulamium: check every retained card','']
for c in allcards['gcse-history']:
 if c.get('spec_id','') and '_HAU_' in c['spec_id']:
  s=sources['gcse-history'][c['stable_key']];summary += [f'- {c["front"]} → {c["back"]} Source: {s["source"]}. Verified: {s["verified"]}.']
summary+=['','## Copyrighted A-level text cards for manual checking','', 'No long extracts are included. These include paraphrased moments as well as short quotation prompts; compare with the studied edition.','']
for c in allcards['alevel-englit']:
 if c['deck']=='atomic' and (c.get('spec_id','').startswith('EDX_ENGLIT_MODERN_') or c.get('spec_id') in ('EDX_ENGLIT_DRAMA_B.1','EDX_ENGLIT_PROSE_P.2')):
  summary.append(f'- {c["stable_key"]}: {c["front"]} → {c["back"]}')
summary+=['','## Publication status','', 'The content branch is local: `codex/flashcards-carry-over-20261125`. The label-only change is on a separate local branch: `codex/flashcard-subject-labels-20261125`; its patch is included. No PR has been opened.', '', 'Automatic approval review rejected pushing the draft branch. It interpreted the public GitHub push as publication requiring additional approval. The attached brief explicitly requests a review-branch push, but no bypass was attempted. Further explicit approval is needed before retrying this blocked external action.', '', 'Nothing is live yet. Finish the coverage and accuracy checks before requesting subject approval. After that, Will can approve subjects individually for upload.']
(BASE/'give-this-to-Will.md').write_text('\n'.join(summary)+'\n')
(BASE/'give this to Will.md').write_text('\n'.join(summary)+'\n')
(BASE/'checkpoint-summary.json').write_text(json.dumps({name:dict(reports[name],independently_supported=sum(r['verified']=='yes' for r in sources[name].values())) for name in LABELS},indent=2)+'\n')
print('Review checkpoint regenerated')
