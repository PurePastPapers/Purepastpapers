-- Run against a disposable Supabase database only.
begin;
insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-4000-8000-000000000301','authenticated','authenticated','student@REACHFREE.CO.UK','',now(),'{}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000302','authenticated','authenticated','student@reachfree.co.uk','',null,'{}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000303','authenticated','authenticated','student@reachfree.co.uk.example','',now(),'{}','{}',now(),now());
insert into public.flashcard_catalogue_versions(id,catalogue_id,version) values('40000000-0000-4000-8000-000000000301','EDX_ALEVEL_BIOL_9BN0_ATOMIC','fixture-1');
insert into public.flashcard_catalogue_items(id,catalogue_id,stable_key) values('50000000-0000-4000-8000-000000000301','EDX_ALEVEL_BIOL_9BN0_ATOMIC','item-1');
insert into public.flashcard_catalogue_material(version_id,catalogue_id,catalogue_card_id,front,back,note_type,variant)
values('40000000-0000-4000-8000-000000000301','EDX_ALEVEL_BIOL_9BN0_ATOMIC','50000000-0000-4000-8000-000000000301','Private question','Private answer','basic','forward');
select public.flashcard_publish_catalogue('EDX_ALEVEL_BIOL_9BN0_ATOMIC','40000000-0000-4000-8000-000000000301','EDX_ALEVEL_BIOL_9BN0','A-level 9BN0','atomic',1);
do $$ begin
 begin
   update public.flashcard_catalogue_material set front='Modified' where version_id='40000000-0000-4000-8000-000000000301';
   raise exception 'Published material is mutable';
 exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
do $$ declare r jsonb; v_card uuid; begin
 if (select count(*) from public.flashcard_catalogue_content()) <> 1 then raise exception 'Verified student cannot read content'; end if;
 r:=public.flashcard_add_catalogue_deck('EDX_ALEVEL_BIOL_9BN0_ATOMIC');
 if r->>'status'<>'added' then raise exception 'Subscription failed %',r; end if;
 select id into v_card from public.flashcard_cards where catalogue_card_id is not null;
 if (select front from public.flashcard_notes n join public.flashcard_cards c on c.note_id=n.id where c.id=v_card) <> '' then raise exception 'Restricted content was copied'; end if;
 begin
   update public.flashcard_cards set variant='changed' where id=v_card;
   raise exception 'Official card update allowed';
 exception when insufficient_privilege then null; end;
 begin
   update public.flashcard_notes set front='Changed' where id=(select note_id from public.flashcard_cards where id=v_card);
   raise exception 'Official note update allowed';
 exception when insufficient_privilege then null; end;
 update public.flashcard_cards set suspended=true where id=v_card;
 if not (select suspended from public.flashcard_cards where id=v_card) then raise exception 'Cannot suspend official card'; end if;
 if not public.flashcard_unsubscribe_catalogue('EDX_ALEVEL_BIOL_9BN0_ATOMIC') then raise exception 'Unsubscribe failed'; end if;
 r:=public.flashcard_add_catalogue_deck('EDX_ALEVEL_BIOL_9BN0_ATOMIC');
 if r->>'status'<>'added' or not exists(select 1 from public.flashcard_cards where id=v_card and suspended) then
   raise exception 'Restoring subscription failed to retain card state';
 end if;
end $$;
reset role;
update auth.users set email_confirmed_at=null where id='00000000-0000-4000-8000-000000000301';
do $$ declare v_card uuid; v_result jsonb; begin
 select id into v_card from public.flashcard_cards where user_id='00000000-0000-4000-8000-000000000301' and catalogue_card_id is not null;
 v_result:=public.flashcard_prepare_review('00000000-0000-4000-8000-000000000301',v_card,0,'60000000-0000-4000-8000-000000000301',3);
 if v_result->>'status'<>'missing' then raise exception 'Lost entitlement can still review'; end if;
 if not exists(select 1 from public.flashcard_states where user_id='00000000-0000-4000-8000-000000000301' and card_id=v_card) then
   raise exception 'Lost entitlement deleted the schedule';
 end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
do $$ begin
 if (select count(*) from public.flashcard_catalogue_content()) <> 0 then raise exception 'Unverified school email received content'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000303',true);
do $$ begin
 if (select count(*) from public.flashcard_catalogue_content()) <> 0 then raise exception 'Lookalike domain received content'; end if;
end $$;
rollback;
