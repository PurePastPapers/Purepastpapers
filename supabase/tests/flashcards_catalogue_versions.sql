-- Run against a disposable Supabase database only.
begin;
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-4000-8000-000000000401','authenticated','authenticated','version@reachfree.co.uk','',now(),'{}','{}',now(),now());
insert into public.flashcard_catalogue_versions(id,catalogue_id,version) values
 ('40000000-0000-4000-8000-000000000401','EDX_ALEVEL_BIOL_9BN0_ATOMIC','v1'),
 ('40000000-0000-4000-8000-000000000402','EDX_ALEVEL_BIOL_9BN0_ATOMIC','v2');
insert into public.flashcard_catalogue_items(id,catalogue_id,stable_key) values
 ('50000000-0000-4000-8000-000000000401','EDX_ALEVEL_BIOL_9BN0_ATOMIC','stable-1'),
 ('50000000-0000-4000-8000-000000000402','EDX_ALEVEL_BIOL_9BN0_ATOMIC','stable-2'),
 ('50000000-0000-4000-8000-000000000403','EDX_ALEVEL_BIOL_9BN0_ATOMIC','stable-3');
insert into public.flashcard_catalogue_material(version_id,catalogue_id,catalogue_card_id,front,back,note_type,variant,subdeck_path) values
 ('40000000-0000-4000-8000-000000000401','EDX_ALEVEL_BIOL_9BN0_ATOMIC','50000000-0000-4000-8000-000000000401','Old question','Answer','basic','forward','Topic 1'),
 ('40000000-0000-4000-8000-000000000402','EDX_ALEVEL_BIOL_9BN0_ATOMIC','50000000-0000-4000-8000-000000000401','Updated question','Answer','basic','forward','Topic 1'),
 ('40000000-0000-4000-8000-000000000402','EDX_ALEVEL_BIOL_9BN0_ATOMIC','50000000-0000-4000-8000-000000000402','New question','Answer','basic','forward','Topic 2::Cells');
insert into public.flashcard_catalogue_material(version_id,catalogue_id,catalogue_card_id,front,back,note_type,variant,subdeck_path,suspended) values
 ('40000000-0000-4000-8000-000000000402','EDX_ALEVEL_BIOL_9BN0_ATOMIC','50000000-0000-4000-8000-000000000403','Archive question','Answer','basic','forward','Topic 2::Archive',true);
select public.flashcard_publish_catalogue('EDX_ALEVEL_BIOL_9BN0_ATOMIC','40000000-0000-4000-8000-000000000401','EDX_ALEVEL_BIOL_9BN0','A-level 9BN0','atomic',1);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000401',true);
select public.flashcard_add_catalogue_deck('EDX_ALEVEL_BIOL_9BN0_ATOMIC');
do $$ begin
 if (select count(*) from public.flashcard_visible_cards) <> 1 then raise exception 'Initial catalogue card missing'; end if;
end $$;
reset role;
do $$ declare v_card uuid; v_deck uuid; r jsonb; begin
 select id,deck_id into v_card,v_deck from public.flashcard_cards where catalogue_card_id='50000000-0000-4000-8000-000000000401';
 r:=public.flashcard_commit_review('00000000-0000-4000-8000-000000000401',v_card,0,'60000000-0000-4000-8000-000000000401',3,clock_timestamp(),'fsrs-test','{"retention":90}'::jsonb,'{"due":"2100-01-01T00:00:00Z","state":"Review"}'::jsonb,v_deck);
 if r->>'status'<>'saved' then raise exception 'Could not save initial review %',r; end if;
end $$;
select public.flashcard_publish_catalogue('EDX_ALEVEL_BIOL_9BN0_ATOMIC','40000000-0000-4000-8000-000000000402','EDX_ALEVEL_BIOL_9BN0','A-level 9BN0','atomic',3);
set local role authenticated;
do $$ declare r jsonb; v_deck uuid; begin
 r:=public.flashcard_sync_catalogue_decks();
 if r->>'added'<>'2' then raise exception 'Sync should add exactly two cards %',r; end if;
 if (select count(*) from public.flashcard_visible_cards)<>3 then raise exception 'Updated version cards missing'; end if;
 if not exists(select 1 from public.flashcard_visible_cards where front='Updated question' and revision=1 and subdeck_path='Topic 1') then
   raise exception 'Updated material lost its review state';
 end if;
 if exists(select 1 from public.flashcard_notes where front<>'' or back<>'') then raise exception 'Official content copied into private notes'; end if;
 select id into v_deck from public.flashcard_decks where catalogue_id='EDX_ALEVEL_BIOL_9BN0_ATOMIC';
 r:=public.flashcard_study_queue(v_deck,'Topic 2');
 if jsonb_array_length(r->'cards')<>1 or r->'cards'->0->>'front'<>'New question' then raise exception 'Subdeck filter failed %',r; end if;
 r:=public.flashcard_set_topic_suspension(v_deck,'Topic 2',true);
 if r->>'changed'<>'1' then raise exception 'Topic suspend failed %',r; end if;
 r:=public.flashcard_set_topic_suspension(v_deck,'Topic 2',false);
 if r->>'changed'<>'1' or r->>'excluded'<>'1' then raise exception 'Topic unsuspend should retain archive %',r; end if;
 if not exists(select 1 from public.flashcard_visible_cards where front='Archive question' and suspended) then raise exception 'Archive was unsuspended'; end if;
 r:=public.flashcard_sync_catalogue_decks();
 if r->>'added'<>'0' then raise exception 'Repeat sync duplicated a card'; end if;
end $$;
rollback;
