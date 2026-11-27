#!/usr/bin/env python3
"""Generate the final handover only after every subject passes strict review."""
import collections
import csv
import datetime
import difflib
import html
from html.parser import HTMLParser
import importlib.util
import json
import pathlib
import random
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = ROOT / 'flashcard-build'
SUBJECTS = ('psychology', 'sociology', 'alevel-englit', 'gcse-history', 'gcse-englit')
SEED = 20261126
OUTPUT = BASE / 'give this to will.md'
DECK_CONTENTS = {'content':'Definitions, theories, explanations and evaluation.', 'evidence':'Named research, findings and other exam evidence.', 'background':'Additional context where useful.', 'quotes':'Textual quotations and their uses.', 'context':'Relevant contexts, themes and methods.', 'critics':'Attributed critical interpretations.', 'exam':'Knowledge for the examined route.', 'back':'Supporting historical background.', 'mark_scheme':'Exam technique, marking points and model answers.'}

class TextHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag in ('p', 'li', 'br', 'tr'): self.parts.append(' ')
        if tag == 'img':
            alt = dict(attrs).get('alt', '')
            if alt: self.parts.append(' [Figure: ' + alt + '] ')
    def handle_endtag(self, tag):
        if tag in ('p', 'li', 'tr'): self.parts.append(' ')
    def handle_data(self, value): self.parts.append(value)
    def text(self): return ' '.join(''.join(self.parts).split())

def plain(value):
    parser = TextHTML(); parser.feed(value or '')
    return parser.text()

def line(value):
    return plain(str(value)).replace('|', '\\|').replace('\n', ' ')

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))

def load_builder():
    spec = importlib.util.spec_from_file_location('flashcard_final_builder', BASE / 'build.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module

def is_recall(card):
    front = card.get('front', '')
    return card.get('set') == 'quotes' and bool(re.search(r'\b(?:what|which) (?:exact |short )?(?:words|word|phrase|line|quotation|quote)\b|\bwhat does .{1,90}\b(?:say|call|ask|describe)\b|\bcomplete (?:the|this) (?:quote|quotation|line)\b', front, re.I))

def sample_cards(cards, rng, limit=90, minimum=40, mark_n=4, require_recall=False):
    """Stratify by paper/topic/leaf/deck, then protect coverage during cap."""
    marks = sorted((c for c in cards if c['set'] == 'mark_scheme'), key=lambda x:x['stable_key'])
    atom = sorted((c for c in cards if c['set'] != 'mark_scheme'), key=lambda x:x['stable_key'])
    if len(marks) < mark_n: raise ValueError('Fewer than four MARK cards available')
    marks = rng.sample(marks, mark_n)
    topics = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.defaultdict(list)))
    for c in atom: topics[(c['paper'],c['topic'])][c['spec_id']][c['set']].append(c)
    candidates = []
    for topic in sorted(topics):
        leaves = sorted(topics[topic]); chosen = rng.sample(leaves, min(3,len(leaves)))
        for leaf in chosen:
            for deck in sorted(topics[topic][leaf]): candidates.append(rng.choice(topics[topic][leaf][deck]))
    universe = {('paper', c['paper']) for c in atom} | {('topic',c['paper'],c['topic']) for c in atom} | {('deck',c['set']) for c in atom}
    if require_recall:
        recall = [c for c in atom if is_recall(c)]
        if not recall: raise ValueError('English quotation-recall cards are missing')
        candidates.append(rng.choice(recall)); universe.add(('recall',))
    def features(c):
        result = {('paper',c['paper']),('topic',c['paper'],c['topic']),('deck',c['set'])}
        if is_recall(c): result.add(('recall',))
        return result
    # Add candidates for any deck absent from the randomly chosen leaves.
    represented = set().union(*(features(c) for c in candidates)) if candidates else set()
    for feature in sorted(universe - represented):
        pool = [c for c in atom if feature in features(c)]
        if not pool: raise ValueError('Cannot cover required sample stratum')
        candidates.append(rng.choice(pool))
    pool = {c['stable_key']:c for c in candidates}
    # When all leaf/deck selections fit, retain every one. Greedy coverage is
    # only needed to trim a candidate set that exceeds the subject cap.
    if len(pool) + len(marks) <= limit:
        selected=list(pool.values())
        used=set(pool)
        if len(selected)+len(marks)<minimum:
            strata={(c['spec_id'],c['set']) for c in selected}
            extra=[c for c in atom if c['stable_key'] not in used];rng.shuffle(extra)
            extra.sort(key=lambda c:(c['spec_id'],c['set']) in strata)
            selected.extend(extra[:min(minimum-len(marks)-len(selected),limit-len(marks)-len(selected))])
        return sorted(selected+marks,key=lambda c:(c['set'],c['paper'],c['topic'],c['stable_key']))
    selected = []; uncovered = set(universe)
    while uncovered:
        ranked = [(len(features(c) & uncovered), key, c) for key,c in pool.items()]
        best = max((x[0] for x in ranked),default=0)
        if not best: raise ValueError('Cannot cover required sample strata')
        choices = [x for x in ranked if x[0] == best]
        _,key,c = rng.choice(sorted(choices,key=lambda x:x[1])); selected.append(c); del pool[key]; uncovered -= features(c)
    if len(selected)+len(marks)>limit: raise ValueError('Coverage exceeds sample cap')
    remaining = sorted(pool.values(),key=lambda c:c['stable_key']); rng.shuffle(remaining)
    selected.extend(remaining[:max(0,limit-len(marks)-len(selected))])
    if len(selected)+len(marks)<minimum:
        used={c['stable_key'] for c in selected}
        strata={(c['spec_id'],c['set']) for c in selected}
        extra=[c for c in atom if c['stable_key'] not in used];rng.shuffle(extra)
        extra.sort(key=lambda c:(c['spec_id'],c['set']) in strata)
        selected.extend(extra[:min(minimum-len(marks)-len(selected),limit-len(marks)-len(selected))])
    return sorted(selected+marks,key=lambda c:(c['set'],c['paper'],c['topic'],c['stable_key']))

def source_map(folder):
    with (folder/'sources.tsv').open(encoding='utf-8',newline='') as f:
        rows=list(csv.DictReader(f,delimiter='\t'))
    result={}
    for r in rows:
        if r.get('verified','').strip().lower() == 'yes' and r.get('source','').strip():
            result[r['stable_key']] = r['source'].strip()
    return result

def source_link(source):
    match=re.search(r'https?://[^\s<>]+',source)
    if not match: return line(source)
    url=match.group(0).rstrip('.,;')
    return f'[{line(source)}](<{url}>)'

def load_ready(builder):
    # Gate all subjects before calling any sampling function or writing the output.
    failed=[]
    for subject in SUBJECTS:
        try:
            if not builder.compile_subject(subject): failed.append(subject)
        except (OSError,ValueError,KeyError,TypeError) as exc: failed.append(f'{subject}: {exc}')
    if failed: raise RuntimeError('All five strict builds must pass before samples are drawn: '+', '.join(failed))
    data={}
    for subject in SUBJECTS:
        folder=BASE/subject; report=read_json(folder/'build-report.json'); cards=read_json(folder/'build/all-cards.json'); review=read_json(folder/'review-complete.json'); sources=source_map(folder)
        if report['errors'] or review.get('content_complete') is not True or review.get('source_digest') != report.get('source_digest') or not review.get('reviewer'):
            raise RuntimeError(subject+': stale or incomplete independent review')
        if any(c['stable_key'] not in sources for c in cards): raise RuntimeError(subject+': unverified source')
        if subject=='gcse-history' and (report['leaves'] != 21 or any('_HAU_' in (c.get('spec_id') or '') or 'verulamium' in (c['front']+' '+c['back']).lower() for c in cards)):
            raise RuntimeError('GCSE History must contain the 21-leaf route excluding Verulamium')
        data[subject]={'report':report,'cards':cards,'sources':sources}
    originals=read_json(BASE/'mark-original.json')
    for subject in ('psychology','sociology'):
        sid=builder.CONFIG[subject][0]; expected={c['stable_key']:(c['front'],c['catalogue_card_id']) for c in originals if c['catalogue_id']==sid+'_MARK'}
        actual={c['stable_key']:(c['front'],c['catalogue_card_id']) for c in data[subject]['cards'] if c['set']=='mark_scheme'}
        if len(expected)!=(64 if subject=='psychology' else 28) or actual!=expected: raise RuntimeError(subject+': original MARK identities/fronts differ')
    return data

def publication_status(publication, subject):
    # Publication records are optional, and only explicit successful status counts.
    entry=publication.get(subject,{}) if isinstance(publication,dict) else {}
    if not isinstance(entry,dict): return 'No confirmed publication record'
    status=str(entry.get('status','')).strip().lower()
    return 'Published (recorded)' if status in ('published','success') else 'No confirmed publication record'

def mark_change_lines(data):
    originals={c['stable_key']:c for c in read_json(BASE/'mark-original.json')}
    lines=[]
    for subject in ('psychology','sociology'):
        for c in sorted((x for x in data[subject]['cards'] if x['set']=='mark_scheme'),key=lambda x:x['stable_key']):
            old=originals[c['stable_key']]; changes=[]
            if old.get('back')!=c.get('back'):
                before,after=plain(old.get('back','')),plain(c.get('back',''))
                if before==after: changes.append('HTML formatting changed; readable text unchanged')
                sm=difflib.SequenceMatcher(a=before,b=after,autojunk=False)
                for op,a,b,x,y in sm.get_opcodes():
                    if op!='equal':
                        if a!=b: changes.append('removed: '+before[a:b])
                        if x!=y: changes.append('added: '+after[x:y])
            removed=sorted(set(old.get('tags',[]))-set(c.get('tags',[])))
            added=sorted(set(c.get('tags',[]))-set(old.get('tags',[])))
            if removed:changes.append('removed tags: '+', '.join(removed))
            if added:changes.append('added tags: '+', '.join(added))
            for field in ('note_type','variant','suspended','subdeck_path'):
                if old.get(field)!=c.get(field):changes.append(f'{field}: {old.get(field)} to {c.get(field)}')
            if changes: lines.append(f"- `{c['stable_key']}`: "+line('; '.join(changes)))
    return lines

def generate(builder, data):
    rng=random.Random(SEED)
    approval=read_json(BASE/'approved-subjects.json')
    pubpath=BASE/'publication-results.json'; publication=read_json(pubpath) if pubpath.exists() else {}
    samples={s:sample_cards(data[s]['cards'],rng,require_recall=s in ('alevel-englit','gcse-englit')) for s in SUBJECTS}
    now=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    out=['# Give this to Will',f'Generated {now}. Sample seed: `{SEED}`. This report is generated only after all five strict source and content-review gates pass.','', '| Subject | Deck counts | Route leaves covered | Approval | Publication |','|---|---|---:|---|---|']
    for subject in SUBJECTS:
        d=data[subject]; counts=collections.Counter(c['set'] for c in d['cards']); sid,board,level,title,code,_=builder.CONFIG[subject]
        deck='<br>'.join(f'{builder.SETS[k][1]}: {v}. {DECK_CONTENTS[k]}' for k,v in sorted(counts.items()))
        out.append(f"| {board} {level} {title} {code} | {deck} | {d['report']['covered']}/{d['report']['leaves']} | {'Recorded' if subject in approval.get('subjects',[]) else 'Not recorded'} | {publication_status(publication,subject)} |")
    out += ['', 'Psychology retains all 64 original MARK identities and fronts; Sociology retains all 28. Checked content and source verdicts do not themselves establish publication.', '', '## Exclusions and deck decisions', 'GCSE History excludes the History Around Us Verulamium leaves; Will handles that option, so there are no Verulamium cards or sources in this release. Psychology follows v1.4 and excludes removed content such as Zimbardo, biological rhythms and Schaffer. GCSE English Literature uses the 2027 anthology rather than the previous 18-poem anthology. The A-level Literature route excludes the NEA.']
    expected={'psychology':{'content','evidence','background','mark_scheme'},'sociology':{'content','evidence','background','mark_scheme'},'alevel-englit':{'quotes','context','critics','mark_scheme'},'gcse-history':{'exam','back','mark_scheme'},'gcse-englit':{'quotes','context','mark_scheme'}}
    for subject in SUBJECTS:
        actual={c['set'] for c in data[subject]['cards']}; omitted=expected[subject]-actual; extra=actual-expected[subject]
        if omitted or extra:
            out.append(f"- {subject}: proposed decks without cards: {', '.join(sorted(omitted)) or 'none'}; additional decks: {', '.join(sorted(extra)) or 'none'}. An empty deck is not padded; consult the subject review for any further reason.")
        else: out.append(f'- {subject}: uses the proposed deck categories.')
    notes=BASE/'alevel-englit'/'NOTES.md'
    if notes.exists() and 'textual moments and methods' in notes.read_text(encoding='utf-8').lower():
        out.append('- A-level Literature: the subject notes say the quotations deck also contains textual moments and method prompts, alongside quotation recall.')
    out += ['', '## Sparse route leaves', 'These counts flag leaves with fewer than four atomic cards for review; they are not a judgment that a leaf needs a fixed number of cards.']
    for subject in SUBJECTS:
        counts=collections.Counter(c['spec_id'] for c in data[subject]['cards'] if c.get('spec_id'))
        sparse=[f'{key} ({n})' for key,n in sorted(counts.items()) if n<4]
        out.append(f"- {subject}: "+(', '.join(sparse) if sparse else 'No leaves have fewer than four atomic cards.'))
    out += ['', '## Facts marked as of', 'Check these time-sensitive cards against their sources before release.']
    dated=0
    for subject in SUBJECTS:
        for c in data[subject]['cards']:
            if re.search(r'\bas[ -]of\b',c['front']+' '+c['back'],re.I):
                dated+=1;out.append(f"- {subject}, `{c['stable_key']}`: {line(c['front'])} | {line(c['back'])} | {source_link(data[subject]['sources'][c['stable_key']])}")
    if not dated:out.append('- No current cards are explicitly marked “as of”.')
    out += ['', '## Retained MARK changes', 'Changes below compare the actual built cards with the original export by stable key. All original fronts and IDs were checked. The detailed historical comparison is also in `mark-review/changes-exact.json`.']
    changes=mark_change_lines(data);out.extend(changes or ['- No changes to the compared fields.'])
    out += ['', '## Review evidence']
    for subject in SUBJECTS:
        ap=BASE/subject/'lead-audit.json'
        if ap.exists():
            audit=read_json(ap); fields=('first_sample','first_defects','first_rate','resample_n','factual_errors','prompt_defects','citation_repairs','final_resample_content_error_rate')
            details=', '.join(f'{k}: {audit[k]}' for k in fields if k in audit)
            if details: out.append(f'- {subject}: {details}.')
            else: out.append(f'- {subject}: an audit record exists but does not expose a comparable 10% error rate.')
        else: out.append(f'- {subject}: no lead-audit.json error rate was recorded; do not infer a 10% error rate.')
        cp=BASE/subject/'audit-cuts.txt'
        if cp.exists():
            count=sum(1 for v in cp.read_text(encoding='utf-8').splitlines() if v.strip())
            out.append(f'- {subject}: {count} non-empty entries in the recorded cut list; see `{subject}/audit-cuts.txt` for its details.')
        else: out.append(f'- {subject}: no audit-cuts.txt count recorded; consult the subject review for documented cuts.')
    out += ['', '## Prescribed-edition checks still flagged', 'The following current cards appear in the recorded A-level quotation-check ledger with an outstanding verdict. Check the prescribed edition; this status is distinct from general source verification.']
    ledger=BASE/'alevel-englit'/'copyright-anchors-sources.tsv'
    unresolved=0
    if ledger.exists():
        with ledger.open(encoding='utf-8',newline='') as f: pending={r['front']:r for r in csv.DictReader(f,delimiter='\t') if r.get('verified','').strip().lower()!='yes'}
        for c in data['alevel-englit']['cards']:
            if c['front'] in pending:
                row=pending[c['front']];unresolved+=1
                out.append(f"- `{c['stable_key']}`: {line(c['point'].get('title','Text'))} | {source_link(row['source'])} | {line(row.get('location',''))}")
    if not unresolved:out.append('- No current cards match an outstanding entry in the A-level quotation-check ledger. This is not proof that every full prescribed edition was consulted.')
    out.append('- GCSE Literature: there is no separate machine-readable prescribed-edition verdict ledger in this report; use the full index below and the subject review to identify edition checks.')
    out += ['', '## All quotation-bearing cards for copyright checking', 'The following inclusive index also contains public-domain text. Compare relevant in-copyright wording and punctuation against the prescribed edition; quotation text is not repeated in this index.']
    for subject in ('alevel-englit','gcse-englit'):
        # Include quotation-bearing cards in every deck, not only the quotation
        # deck. This deliberately over-includes public-domain excerpts.
        qs=[c for c in data[subject]['cards'] if c['set']=='quotes' or re.search(r'“[^”]+”|‘[^’]+’|"[^"]+"',c['front']+' '+c['back'])]
        out.append(f'\n### {subject} quotation cards')
        for c in qs:
            # Titles and keys identify the card without repeating its quoted text.
            out.append(f"- {line(c['point'].get('title','Assessment'))} — `{c['stable_key']}` — {source_link(data[subject]['sources'][c['stable_key']])}")
    out += ['', '## Fresh stratified samples', 'Selection uses one random card per chosen leaf and deck, up to three leaves per topic, then protects every paper, topic and deck. Where possible the sample is supplemented to 40; its cap is 90 including four random exam-technique cards. English samples include a quotation-recall card.']
    for subject in SUBJECTS:
        out.append(f'\n## {subject} ({len(samples[subject])} sampled)')
        previous=None
        for i,c in enumerate(samples[subject],1):
            group=(c['set'],c['paper'])
            if group!=previous:out.append(f"\n### {builder.SETS[c['set']][1]} — {line(c['paper'])}");previous=group
            point=c['point'];label=(str(point.get('code',''))+' '+str(point.get('title','Exam technique'))).strip()
            out += [f"\n**{i}. {line(label)}** (`{c['stable_key']}`)",f"- Front: {line(c['front'])}",f"- Back: {line(c['back'])}",f"- Source: {source_link(data[subject]['sources'][c['stable_key']])}"]
    formatted=[]
    for value in out:
        if value.startswith('- ') and formatted and formatted[-1] and not formatted[-1].startswith('- '): formatted.append('')
        formatted.append(value)
    return '\n'.join(formatted)+'\n'

def main():
    builder=load_builder(); data=load_ready(builder); report=generate(builder,data)
    # Atomic replacement prevents an interrupted write from leaving a partial report.
    temp=OUTPUT.with_suffix('.md.tmp');temp.write_text(report,encoding='utf-8');temp.replace(OUTPUT)
    print(f'Wrote {OUTPUT}')

if __name__=='__main__': main()
