-- Run against a disposable Supabase database only.
begin;
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-4000-8000-000000000501','authenticated','authenticated','choose@reachfree.co.uk','',now(),'{}','{}',now(),now()),
      ('00000000-0000-4000-8000-000000000502','authenticated','authenticated','other@reachfree.co.uk','',now(),'{}','{}',now(),now());
insert into public.flashcard_catalogue_versions(id,catalogue_id,version) values
 ('40000000-0000-4000-8000-000000000501','EDX_ALEVEL_BIOL_9BN0_ATOMIC','v1');
insert into public.flashcard_catalogue_items(id,catalogue_id,stable_key) values
 ('50000000-0000-4000-8000-000000000501','EDX_ALEVEL_BIOL_9BN0_ATOMIC','sel-1'),
 ('50000000-0000-4000-8000-000000000502','EDX_ALEVEL_BIOL_9BN0_ATOMIC','sel-2'),
 ('50000000-0000-4000-8000-000000000503','EDX_ALEVEL_BIOL_9BN0_ATOMIC','sel-3'),
 ('50000000-0000-4000-8000-000000000504','EDX_ALEVEL_BIOL_9BN0_ATOMIC','sel-4'),
 ('50000000-0000-4000-8000-000000000505','EDX_ALEVEL_BIOL_9BN0_ATOMIC','sel-5');
insert into public.flashcard_catalogue_material(version_id,catalogue_id,catalogue_card_id,front,back,note_type,variant,subdeck_path,tags,suspended) values
 ('40000000-0000-4000-8000-000000000501','EDX_ALEVEL_BIOL_9BN0_ATOMIC','50000000-0000-4000-8000-000000000501','Learnt','A','basic','forward','Topic 1','{spec::1.1}',true),
 ('40000000-0000-4000-8000-000000000501','EDX_ALEVEL_BIOL_9BN0_ATOMIC','50000000-0000-4000-8000-000000000502','Mixed','A','basic','forward','Topic 1','{spec::1.1,spec::5.1}',true),
 ('40000000-0000-4000-8000-000000000501','EDX_ALEVEL_BIOL_9BN0_ATOMIC','50000000-0000-4000-8000-000000000503','Skill','A','basic','forward','Skills','{spec::appendix7}',true),
 ('40000000-0000-4000-8000-000000000501','EDX_ALEVEL_BIOL_9BN0_ATOMIC','50000000-0000-4000-8000-000000000504','Optional','A','basic','forward','Topic 1::Optional','{spec::1.1}',true),
 ('40000000-0000-4000-8000-000000000501','EDX_ALEVEL_BIOL_9BN0_ATOMIC','50000000-0000-4000-8000-000000000505','Later','A','basic','forward','Topic 5','{spec::5.1}',true);
select public.flashcard_publish_catalogue('EDX_ALEVEL_BIOL_9BN0_ATOMIC','40000000-0000-4000-8000-000000000501','EDX_ALEVEL_BIOL_9BN0','A-level 9BN0','atomic',5);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select public.flashcard_add_catalogue_deck('EDX_ALEVEL_BIOL_9BN0_ATOMIC');
do $$ declare v_deck uuid; r jsonb; active text[]; begin
 select id into v_deck from public.flashcard_decks where catalogue_id='EDX_ALEVEL_BIOL_9BN0_ATOMIC';
 perform set_config('test.deck', v_deck::text, true);
 r:=public.flashcard_deck_spec_sets(v_deck);
 if not r @> '[{"tags":["spec::1.1"],"cards":1,"active":0,"optional":false},{"tags":["spec::1.1"],"cards":1,"optional":true},{"tags":["spec::1.1","spec::5.1"],"cards":1}]'::jsonb then
   raise exception 'Spec sets wrong %',r;
 end if;
 -- Only what I've learnt: 1.1 ticked, 5.1 not; exam skills included.
 r:=public.flashcard_apply_spec_selection(v_deck,'{spec::1.1,spec::5.1}','{spec::1.1}',true);
 select array_agg(front order by front) into active from public.flashcard_visible_cards where deck_id=v_deck and not suspended;
 if active is distinct from '{Learnt,Skill}'::text[] or r->>'active'<>'2' then raise exception 'Learnt selection wrong % %',active,r; end if;
 -- Exam skills off.
 r:=public.flashcard_apply_spec_selection(v_deck,'{spec::1.1,spec::5.1}','{spec::1.1}',false);
 select array_agg(front order by front) into active from public.flashcard_visible_cards where deck_id=v_deck and not suspended;
 if active is distinct from '{Learnt}'::text[] then raise exception 'Exam skills not excluded %',active; end if;
 -- Both points ticked: mixed card joins, optional card stays out.
 r:=public.flashcard_apply_spec_selection(v_deck,'{spec::1.1,spec::5.1}','{spec::1.1,spec::5.1}',true);
 select array_agg(front order by front) into active from public.flashcard_visible_cards where deck_id=v_deck and not suspended;
 if active is distinct from '{Later,Learnt,Mixed,Skill}'::text[] then raise exception 'Full choice wrong %',active; end if;
 -- Everything.
 r:=public.flashcard_apply_spec_selection(v_deck,null,null,true);
 if r->>'active'<>'5' or r->>'total'<>'5' then raise exception 'Everything wrong %',r; end if;
 -- Repeating changes nothing.
 r:=public.flashcard_apply_spec_selection(v_deck,null,null,true);
 if r->>'changed'<>'0' then raise exception 'Repeat changed cards %',r; end if;
end $$;
-- Another account cannot change this deck.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',true);
do $$ declare v_deck uuid; begin
 select id into v_deck from public.flashcard_decks where catalogue_id='EDX_ALEVEL_BIOL_9BN0_ATOMIC';
 if v_deck is not null then raise exception 'Other account can see the deck'; end if;
 begin
   perform public.flashcard_apply_spec_selection(current_setting('test.deck')::uuid,null,null,true);
   raise exception 'Foreign deck accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
