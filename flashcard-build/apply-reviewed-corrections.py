"""Apply independently sourced corrections with exact before-value checks."""
import argparse, collections, csv, hashlib, json, pathlib
BASE=pathlib.Path(__file__).resolve().parent

def apply(subject, filenames):
    folder=BASE/subject
    cards=json.loads((folder/'draft/all-cards.json').read_text())
    originals={c['stable_key']:c for c in cards}
    history_path=folder/'applied-corrections.json'
    history=json.loads(history_path.read_text()) if history_path.exists() else []
    applied={r['correction_id'] for r in history}
    edits=[]
    for filename in filenames:
        for row in json.loads((folder/filename).read_text()):
            rid=hashlib.sha256(json.dumps(row,sort_keys=True).encode()).hexdigest()
            if rid in applied:continue
            c=originals[row['stable_key']]
            before=row.get('before') or {'front':row['before_front'],'back':row['before_back']}
            assert c['front']==before['front'] and c['back']==before['back'], 'Snapshot differs: '+row['stable_key']
            after=None if row.get('action')=='remove' or ('after'in row and row['after'] is None) else (row.get('after') or {'front':row.get('after_front',c['front']),'back':row.get('after_back',c['back'])})
            if after:
                assert 0<len(after['front'])<=260 and 0<len(after['back'])<=120
                assert '\n' not in after['front']+after['back'] and '—' not in after['front']+after['back']
            suffix=c['catalogue'].rsplit('_',1)[1]
            key=None if after is None else c['stable_key'].split(':',1)[0]+':'+hashlib.sha256(f"{suffix}|{c['spec_id']}|{after['front']}".encode()).hexdigest()[:20]
            edits.append(dict(correction_id=rid,review_file=filename,old_stable_key=c['stable_key'],new_stable_key=key,before=before,after=after,source=row['source'],reason=row['reason']))
    fronts={c['stable_key']:c['front'] for c in cards}
    for row in edits:
        if row['after'] is None:fronts.pop(row['old_stable_key'])
        else:fronts[row['old_stable_key']]=row['after']['front']
    assert all(v==1 for v in collections.Counter(fronts.values()).values()), 'Correction creates duplicate fronts'
    contents={f:f.read_text() for f in (folder/'source').glob('*.txt')}
    for row in edits:
        old='Q: '+row['before']['front']+'\nA: '+row['before']['back']
        matches=[f for f,text in contents.items() if old in text]
        assert len(matches)==1, 'Missing/ambiguous source pair: '+row['old_stable_key']
        replacement='' if row['after'] is None else 'Q: '+row['after']['front']+'\nA: '+row['after']['back']
        contents[matches[0]]=contents[matches[0]].replace(old,replacement,1)
    for file,text in contents.items():file.write_text(text)
    history+=edits;history_path.write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'applied':len(edits),'cuts':sum(r['after'] is None for r in edits),'revised':sum(r['after'] is not None for r in edits)}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('subject');p.add_argument('files',nargs='+');a=p.parse_args();apply(a.subject,a.files)
