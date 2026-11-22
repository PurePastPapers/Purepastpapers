-- Run only against a disposable Supabase database. All fixtures roll back.
begin;
insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-4000-8000-000000000201','authenticated','authenticated','cards-a@example.invalid','',now(),'{}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000000202','authenticated','authenticated','cards-b@example.invalid','',now(),'{}','{}',now(),now());
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
insert into public.flashcard_decks(id,user_id,title,new_limit)
values ('10000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000201','Test',1);
select public.flashcard_save_note(null,'10000000-0000-4000-8000-000000000201','reverse','Question','Answer','{}',array['forward','reverse'],false);
do $$ begin
 if (select count(*) from public.flashcard_cards) <> 2 then raise exception 'Expected two variants'; end if;
 if (select count(*) from public.flashcard_states) <> 2 then raise exception 'Expected independent states'; end if;
end $$;
do $$ declare result jsonb; batch uuid := '30000000-0000-4000-8000-000000000201'; other_batch uuid := '30000000-0000-4000-8000-000000000202'; payload jsonb; begin
 result := public.flashcard_begin_import(batch);
 if result->>'status' <> 'staging' then raise exception 'Import did not start'; end if;
 result := public.flashcard_begin_import(other_batch);
 if result->>'status' <> 'active_batch' then raise exception 'Concurrent import was not rejected'; end if;
 payload := jsonb_build_array(jsonb_build_object('key','fixture-note','type','basic','front','Import question','back','Import answer','cards',jsonb_build_array(jsonb_build_object('deckId','10000000-0000-4000-8000-000000000201','variant','forward','sourceKey','fixture-card'))));
 result := public.flashcard_import_chunk(batch,payload);
 if result->>'accepted' <> '1' then raise exception 'Card was not imported %', result; end if;
 result := public.flashcard_import_chunk(batch,payload);
 if result->>'duplicates' <> '1' then raise exception 'Duplicate was not skipped %', result; end if;
 result := public.flashcard_finish_import(batch);
 if result->>'accepted' <> '1' then raise exception 'Import final count is wrong %', result; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true);
do $$ begin
 if (select count(*) from public.flashcard_cards) <> 0 or (select count(*) from public.flashcard_notes) <> 0 then
   raise exception 'Another account can read cards';
 end if;
 begin
   perform public.flashcard_save_note(null,'10000000-0000-4000-8000-000000000201','basic','X','Y','{}',array['forward'],false);
   raise exception 'Another account can write to the deck';
 exception when sqlstate '22023' then null; end;
end $$;
reset role;
do $$ declare card uuid; second_card uuid; result jsonb; retry jsonb; begin
 select id into card from public.flashcard_cards where variant='forward';
 select id into second_card from public.flashcard_cards where variant='reverse';
 result := public.flashcard_commit_review('00000000-0000-4000-8000-000000000201',card,0,'20000000-0000-4000-8000-000000000201',3,clock_timestamp(),'fsrs-test','{"retention":90}'::jsonb,'{"due":"2100-01-01T00:00:00Z"}'::jsonb,'10000000-0000-4000-8000-000000000201');
 if result->>'status' <> 'saved' then raise exception 'Review failed %', result; end if;
 retry := public.flashcard_commit_review('00000000-0000-4000-8000-000000000201',card,0,'20000000-0000-4000-8000-000000000201',3,clock_timestamp(),'fsrs-test','{"retention":90}'::jsonb,'{"due":"2100-01-01T00:00:00Z"}'::jsonb,'10000000-0000-4000-8000-000000000201');
 if retry->>'status' <> 'saved' or (select count(*) from public.flashcard_reviews) <> 1 then raise exception 'Retry was applied twice'; end if;
 result := public.flashcard_commit_review('00000000-0000-4000-8000-000000000201',second_card,0,'20000000-0000-4000-8000-000000000202',3,clock_timestamp(),'fsrs-test','{"retention":90}'::jsonb,'{"due":"2100-01-01T00:00:00Z"}'::jsonb,'10000000-0000-4000-8000-000000000201');
 if result->>'status' <> 'new_limit_reached' then raise exception 'Daily limit not enforced %', result; end if;
 delete from public.flashcard_cards where id=card;
 if (select count(*) from public.flashcard_reviews) <> 1 then raise exception 'Review log was deleted'; end if;
end $$;
rollback;
