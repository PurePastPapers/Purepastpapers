"""Prepare small plain-SQL batches from a fully checked, approved subject."""
import argparse, collections, hashlib, importlib.util, json, pathlib, re, uuid
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=ROOT/'flashcard-build'
spec=importlib.util.spec_from_file_location('builder',BASE/'build.py');builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
def literal(value):
    return "'"+str(value).replace("'","''")+"'"
def payload(value):
    text=json.dumps(value,ensure_ascii=False,separators=(',',':'))
    if '$j$' in text:raise ValueError('Reserved SQL JSON delimiter in content')
    return '$j$'+text+'$j$'
def prepare(subject,version,baseline_file=None,catalogues=None):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*',version) or version in {'.','..'}:
        raise ValueError('Invalid release version')
    approved=json.loads((BASE/'approved-subjects.json').read_text())
    if subject not in approved['subjects']:raise ValueError('Subject has no recorded publication approval')
    if not builder.compile_subject(subject):raise ValueError('Strict subject checks failed')
    folder=BASE/subject; cards=json.loads((folder/'build/all-cards.json').read_text())
    if subject=='gcse-history' and any('_HAU_' in str(c.get('spec_id')) or 'verulamium' in (c['front']+c['back']).lower() for c in cards):raise ValueError('Verulamium is excluded')
    sid,board,level,title,code,short=builder.CONFIG[subject]
    grouped=collections.defaultdict(list)
    for c in cards:grouped[c['catalogue']].append(c)
    if catalogues:
        if not set(catalogues) <= set(grouped): raise ValueError('Unknown selected catalogue')
        grouped={k:v for k,v in grouped.items() if k in catalogues}
    out=folder/'release'/version;out.mkdir(parents=True,exist_ok=True)
    prior=json.loads((out/'manifest.json').read_text()) if (out/'manifest.json').exists() else {}
    baseline={r['id']:r for r in json.loads(pathlib.Path(baseline_file or BASE/'catalogue-before-release.json').read_text())}
    # Validate the entire release before replacing any generated files.
    if prior and set(prior) != set(grouped):
        raise ValueError('Release version already prepared for different catalogues; use a new version')
    for catalogue,items in grouped.items():
        digest=hashlib.sha256(json.dumps(items,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        if catalogue in prior and prior[catalogue]['source_sha256'] != digest:
            raise ValueError('Release version already prepared from different material; use a new version')
        if catalogue in prior and prior[catalogue].get('expected_previous_version') != baseline.get(catalogue,{}).get('current_version'):
            raise ValueError('Release baseline changed; use a new version')
    manifest={}
    for catalogue,items in sorted(grouped.items()):
        if not items:continue
        raw=json.dumps(items,ensure_ascii=False,sort_keys=True).encode();digest=hashlib.sha256(raw).hexdigest()
        state=prior.get(catalogue,{})
        if state and state['source_sha256']!=digest:raise ValueError('Release version already prepared from different material; use a new version')
        vid=state.get('version_id') or str(uuid.uuid4())
        label=builder.SETS[items[0]['set']][1]; deck_type=items[0]['deck']; qualification=f'{level} {code}'
        metadata=[catalogue,f'{board} {level} {title} {code} – {label}',sid,board,qualification,'Approved specification route',deck_type,'coming_soon']
        stage=(f"-- Stop unless exactly one row is returned and id equals {vid}.\n"
               +"insert into public.flashcard_catalogue (id,title,subject_id,exam_board,qualification,topic,deck_type,status) values ("+','.join(map(literal,metadata))+") on conflict (id) do nothing;\n"
               +f"insert into public.flashcard_catalogue_versions (id,catalogue_id,version) values ({literal(vid)}::uuid,{literal(catalogue)},{literal(version)}) on conflict (catalogue_id,version) do nothing;\n"
               +f"select id,catalogue_id,version from public.flashcard_catalogue_versions where catalogue_id={literal(catalogue)} and version={literal(version)};\n")
        (out/(catalogue+'-000-stage.sql')).write_text(stage)
        for offset in range(0,len(items),100):
            part=items[offset:offset+100]
            records=[dict(k=c['stable_key'],f=c['front'],b=c['back'],t=c['tags'],p=c['subdeck_path']) for c in part]
            keys=payload([dict(k=c['stable_key']) for c in part]);data=payload(records)
            query=f"insert into public.flashcard_catalogue_items (catalogue_id,stable_key) select {literal(catalogue)},x.k from jsonb_to_recordset({keys}::jsonb) as x(k text) on conflict (catalogue_id,stable_key) do nothing;\n"
            query+=f"insert into public.flashcard_catalogue_material (version_id,catalogue_id,catalogue_card_id,front,back,note_type,variant,tags,suspended,subdeck_path) select {literal(vid)}::uuid,{literal(catalogue)},i.id,x.f,x.b,'basic','forward',x.t,true,x.p from jsonb_to_recordset({data}::jsonb) as x(k text,f text,b text,t text[],p text) join public.flashcard_catalogue_items i on i.catalogue_id={literal(catalogue)} and i.stable_key=x.k on conflict (version_id,catalogue_card_id) do nothing;\n"
            query+=f"select count(*) as staged from public.flashcard_catalogue_material where version_id={literal(vid)}::uuid;\n"
            (out/f'{catalogue}-{offset//100+1:03}-batch.sql').write_text(query)
        check=f"select count(*) as card_count,md5(string_agg(i.stable_key,'' order by i.stable_key collate \"C\")) as keys_md5 from public.flashcard_catalogue_material m join public.flashcard_catalogue_items i on i.id=m.catalogue_card_id and i.catalogue_id=m.catalogue_id where m.version_id={literal(vid)}::uuid and m.catalogue_id={literal(catalogue)};\n"
        # Verify material as well as key membership: ON CONFLICT DO NOTHING can
        # leave earlier, differently-valued material under the same version ID.
        for offset in range(0,len(items),100):
            part=items[offset:offset+100]
            expected_rows=payload([dict(k=c['stable_key'],f=c['front'],b=c['back'],t=c['tags'],p=c['subdeck_path']) for c in part])
            check+=f"select {offset//100+1} as batch, count(*) as expected_rows, count(*) filter (where i.id is null or m.catalogue_card_id is null or m.front is distinct from x.f or m.back is distinct from x.b or m.tags is distinct from x.t or m.subdeck_path is distinct from x.p or m.note_type is distinct from 'basic' or m.variant is distinct from 'forward' or m.suspended is distinct from true) as mismatched_rows from jsonb_to_recordset({expected_rows}::jsonb) as x(k text,f text,b text,t text[],p text) left join public.flashcard_catalogue_items i on i.catalogue_id={literal(catalogue)} and i.stable_key=x.k left join public.flashcard_catalogue_material m on m.catalogue_id={literal(catalogue)} and m.version_id={literal(vid)}::uuid and m.catalogue_card_id=i.id;\n"
        media_ids=sorted({m for c in items for m in re.findall(r'media:([0-9a-fA-F-]{36})',c['front']+c['back'])})
        if media_ids:
            previous=baseline.get(catalogue,{}).get('current_version')
            if not previous: raise ValueError('New media requires verified staging before release')
            ids=','.join(literal(m)+'::uuid' for m in media_ids)
            copy_media=f"insert into public.flashcard_catalogue_media (id,catalogue_id,version_id,mime_type,data) select id,catalogue_id,{literal(vid)}::uuid,mime_type,data from public.flashcard_catalogue_media where catalogue_id={literal(catalogue)} and version_id={literal(previous)}::uuid and id in ({ids}) on conflict (version_id,id) do nothing;\n"
            copy_media+=f"select id,mime_type,octet_length(data) as bytes,md5(data) as checksum from public.flashcard_catalogue_media where catalogue_id={literal(catalogue)} and version_id={literal(vid)}::uuid order by id;\n"
            (out/(catalogue+'-997-media.sql')).write_text(copy_media)
        (out/(catalogue+'-998-check.sql')).write_text(check)
        expected=baseline.get(catalogue,{}).get('current_version')
        expected_sql=literal(expected)+'::uuid' if expected else 'null::uuid'
        # Hold the catalogue row lock across both the baseline check and publish.
        # A WHERE predicate outside the function can become stale while waiting
        # for the function's internal lock under READ COMMITTED isolation.
        publish=("-- Stop if this file returns anything other than exactly one published result.\n"
            +"begin;\n"
            +f"select id from public.flashcard_catalogue where id={literal(catalogue)} for update;\n"
            +f"select public.flashcard_publish_catalogue({literal(catalogue)},{literal(vid)}::uuid,{literal(sid)},{literal(qualification)},{literal(deck_type)},{len(items)}) as published from public.flashcard_catalogue where id={literal(catalogue)} and current_version is not distinct from {expected_sql};\ncommit;\n")
        (out/(catalogue+'-999-publish.sql')).write_text(publish)
        manifest[catalogue]=dict(version_id=vid,card_count=len(items),keys_md5=hashlib.md5(''.join(sorted(c['stable_key'] for c in items)).encode()).hexdigest(),source_sha256=digest,expected_previous_version=expected,media_ids=media_ids,status='prepared_not_uploaded')
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest,indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('subject',choices=builder.CONFIG);p.add_argument('--version',required=True);p.add_argument('--baseline-file');p.add_argument('--catalogue',action='append');a=p.parse_args();prepare(a.subject,a.version,a.baseline_file,a.catalogue)
