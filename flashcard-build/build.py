"""Strict source compiler. Draft output is never an upload/approval claim."""
import argparse, collections, csv, hashlib, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG = {
    'psychology': ('AQA_ALEVEL_PSYCH_7182', 'AQA', 'A-level', 'Psychology', '7182', 'psych'),
    'sociology': ('AQA_ALEVEL_SOC_7192', 'AQA', 'A-level', 'Sociology', '7192', 'soc'),
    'alevel-englit': ('EDX_ALEVEL_ENGLIT_9ET0', 'Edexcel', 'A-level', 'English Literature', '9ET0', 'englit'),
    'gcse-history': ('OCR_GCSE_HIST_J411', 'OCR', 'GCSE', 'History', 'J411', 'gcse-hist'),
    'gcse-englit': ('EDUQAS_GCSE_ENGLIT_C720QS', 'Eduqas', 'GCSE', 'English Literature', 'C720QS', 'gcse-englit'),
}
SETS = {
    'content': ('CONTENT', 'Key content'), 'evidence': ('EVIDENCE', 'Exam evidence'),
    'background': ('BACKGROUND', 'Background knowledge'), 'quotes': ('QUOTES', 'Key quotations'),
    'context': ('CONTEXT', 'Context'), 'critics': ('CRITICS', 'Critics and interpretations'),
    'exam': ('EXAM', 'Exam knowledge'), 'back': ('BACK', 'Background knowledge'),
    'mark_scheme': ('MARK', 'Exam technique'),
}
ALLOWED = {
    'psychology': {'content', 'evidence', 'background', 'mark_scheme'},
    'sociology': {'content', 'evidence', 'background', 'mark_scheme'},
    'alevel-englit': {'quotes', 'context', 'critics', 'mark_scheme'},
    'gcse-history': {'exam', 'back', 'mark_scheme'},
    'gcse-englit': {'quotes', 'context', 'mark_scheme'},
}

def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')

def compile_subject(name, draft=False):
    sid, board, level, title, code, short = CONFIG[name]
    folder = ROOT / 'flashcard-build' / name
    spec = json.loads((ROOT / 'data/specs' / (sid + '.json')).read_text())
    points = {p['id']: (s,t,p) for s in spec['sections'] for t in s['topics'] for p in t['points']}
    errors, cards, seen = [], [], set()
    source_files=sorted((folder/'source').glob('*.txt'))
    source_digest=hashlib.sha256(b''.join(f.name.encode()+b'\0'+f.read_bytes()+b'\0' for f in source_files)).hexdigest()
    out = folder/('draft' if draft else 'build')
    # Remove only generated set files, so failed builds cannot leave stale cards.
    if out.exists():
        for stale in [out/'all-cards.json', *out.glob('*-set.json')]: stale.unlink(missing_ok=True)
    for file in sorted((folder / 'source').glob('*.txt')):
        current = None
        question = None
        for n,line in enumerate(file.read_text().splitlines(), 1):
            where = f'{file.name}:{n}'
            if not line.strip(): continue
            if line.startswith('## '):
                if question: errors.append(f'{where}: unanswered front')
                fields = line[3:].split('|')
                if len(fields) != 2:
                    errors.append(f'{where}: malformed heading'); current = None; continue
                pid, st = [v.strip() for v in fields]
                st = {'mark':'mark_scheme','technique':'mark_scheme','exam_knowledge':'exam','background_knowledge':'back' if name=='gcse-history' else 'background'}.get(st, st)
                if name == 'gcse-history' and st == 'background': st = 'back'
                current = (pid, st)
                if st not in ALLOWED[name]: errors.append(f'{where}: unknown deck {st}')
                if st != 'mark_scheme' and pid not in points: errors.append(f'{where}: unknown leaf {pid}')
            elif line.startswith('Q: '):
                if question: errors.append(f'{where}: unanswered previous front')
                question = line[3:].strip()
            elif line.startswith('A: '):
                if not current or not question:
                    errors.append(f'{where}: missing heading/front'); continue
                pid, st = current
                answer = line[3:].strip()
                if st not in ALLOWED[name] or (st != 'mark_scheme' and pid not in points): question=None; continue
                ismark = st == 'mark_scheme'
                s,t,p = points[pid] if pid in points else ({'title':'Assessment skills'},{'title':'Assessment skills'},{'code':'','title':'Assessment skills'})
                suffix, label = SETS[st]
                if question in seen: errors.append(f'{where}: duplicate front {question}')
                seen.add(question)
                if not answer: errors.append(f'{where}: empty back')
                if not ismark and len(answer)>120: errors.append(f'{where}: back over 120 characters')
                if not ismark and len(question)>260: errors.append(f'{where}: front over 260 characters')
                if '—' in question+answer: errors.append(f'{where}: em dash')
                if not ismark and (re.search(r'\b(name|give|list)\s+(two|three|four|five|six|all)\b',question,re.I) or re.search(r'(?:;|\n|(?:^|\s)[1-9][.)]\s)',answer)):
                    errors.append(f'{where}: list-like card')
                deck = 'mark_scheme' if ismark else 'atomic'
                paper = s['title']
                paper_match = re.search(r'Paper\s*(\d+)', paper, re.I)
                component = p.get('official_reference', {}).get('component') or s.get('code') or s.get('id') or slug(paper)
                paper_tag = 'Paper'+paper_match[1] if paper_match else component
                tags = ([] if ismark else [f'PPP::Spec::{pid}']) + [f'PPP::{board}::{code}',f'PPP::Deck::{deck}',f'PPP::Paper::{paper_tag}',f'PPP::Topic::{slug(t["title"])}',f'PPP::Class::{st}']
                stable = f'ppp-{short}-{code}-{suffix.lower()}:' + hashlib.sha256(f'{suffix}|{pid if not ismark else ""}|{question}'.encode()).hexdigest()[:20]
                cards.append(dict(deck=deck,spec_id=None if ismark else pid,front=question,back=answer,paper=paper,topic=t['title'],point=p,set=st,catalogue=sid+'_'+suffix,subdeck_path=f'{board} {level} {title} {code} – {label}::{paper}::{t["title"]}::{p.get("code", "")} {p["title"]}',tags=tags,stable_key=stable))
                question = None
            else: errors.append(f'{where}: unexpected line')
        if question: errors.append(f'{file.name}: unanswered final front')
    coverage = collections.Counter(c['spec_id'] for c in cards if c['deck']=='atomic')
    missing = [pid for pid in points if not coverage[pid]]
    if missing and not draft: errors.append(f'missing leaves: {missing}')
    if not draft:
        ledger=folder/'sources.tsv'
        if not ledger.exists(): errors.append('independent sources.tsv missing')
        else:
            rows=list(csv.DictReader(ledger.open(),delimiter='\t'))
            verified={r.get('stable_key') for r in rows if r.get('verified','').strip().lower()=='yes' and r.get('source','').strip()}
            unverified=[c['stable_key'] for c in cards if c['stable_key'] not in verified]
            if unverified: errors.append(f'{len(unverified)} cards lack independent verification')
        review_file=folder/'review-complete.json'
        if not review_file.exists(): errors.append('content completeness review is outstanding')
        else:
            review=json.loads(review_file.read_text())
            if review.get('content_complete') is not True or not review.get('reviewer') or review.get('source_digest') != source_digest:
                errors.append('content completeness review is incomplete or stale')
    report = dict(subject_id=sid,status='DRAFT - NOT APPROVED' if draft else 'CHECKED - AWAITING OWNER APPROVAL',source_digest=source_digest,cards=len(cards),leaves=len(points),covered=len(coverage),missing=missing,counts=dict(collections.Counter(c['set'] for c in cards)),errors=errors)
    folder.mkdir(parents=True,exist_ok=True)
    (folder/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
    if errors:
        print(json.dumps(report,indent=2)); return False
    out = folder/('draft' if draft else 'build'); out.mkdir(exist_ok=True)
    (out/'all-cards.json').write_text(json.dumps(cards,ensure_ascii=False,indent=2)+'\n')
    for st in ALLOWED[name]:
        (out/f'{st}-set.json').write_text(json.dumps([c for c in cards if c['set']==st],ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,indent=2)); return True

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('subject', choices=CONFIG)
    parser.add_argument('--draft',action='store_true',help='Permit missing leaves; output is visibly quarantined')
    args=parser.parse_args()
    sys.exit(0 if compile_subject(args.subject,args.draft) else 1)
