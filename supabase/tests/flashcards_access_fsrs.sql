-- Access, catalogue-update and topic-suspension edge cases. Run only against a disposable
-- database (tools/flashcards/sql-tests.mjs). All fixtures roll back.
begin;
insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id::uuid,'authenticated','authenticated',email,'',confirmed,'{}','{}',now(),now()
from (values
 ('00000000-0000-4000-8000-000000000501','pupil@reachfree.co.uk',now()),
 ('00000000-0000-4000-8000-000000000502','Pupil.Two@ReachFree.Co.UK',now()),
 ('00000000-0000-4000-8000-000000000503','pupil@reachfree.co.uk.evil.example',now()),
 ('00000000-0000-4000-8000-000000000504','pupil@xreachfree.co.uk',now()),
 ('00000000-0000-4000-8000-000000000505','pupil@reachfree.co',now()),
 ('00000000-0000-4000-8000-000000000506','pupil@mail.reachfree.co.uk',now()),
 ('00000000-0000-4000-8000-000000000507','pupil@reachfree.cо.uk',now()),          -- Cyrillic o
 ('00000000-0000-4000-8000-000000000508','pupil@reachfree.co.uk@evil.example',now()),
 ('00000000-0000-4000-8000-000000000509','pupil@reachfree.co.uk',null),
 ('00000000-0000-4000-8000-000000000510','private@example.invalid',now())
) as u(id,email,confirmed);

-- Only confirmed accounts on exactly reachfree.co.uk are eligible.
do $$ declare r record; begin
 for r in select id, email, public.flashcard_school_eligible(id) as eligible from auth.users where id::text like '00000000-0000-4000-8000-0000000005%' loop
   if r.eligible <> (r.id::text in ('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000502')) then
     raise exception 'Eligibility wrong for % (%)', r.email, r.eligible;
   end if;
 end loop;
end $$;

-- Catalogue v1: three topics with optional and archived material, as curated.
insert into public.flashcard_catalogue_versions(id,catalogue_id,version) values
 ('40000000-0000-4000-8000-000000000501','EDX_ALEVEL_PHYS_9PH0_ATOMIC','v1'),
 ('40000000-0000-4000-8000-000000000502','EDX_ALEVEL_PHYS_9PH0_ATOMIC','v2');
insert into public.flashcard_catalogue_items(id,catalogue_id,stable_key)
select ('50000000-0000-4000-8000-0000000005'||lpad(n::text,2,'0'))::uuid,'EDX_ALEVEL_PHYS_9PH0_ATOMIC','phys-'||n from generate_series(1,9) n;
insert into public.flashcard_catalogue_material(version_id,catalogue_id,catalogue_card_id,front,back,note_type,variant,tags,suspended,subdeck_path)
select '40000000-0000-4000-8000-000000000501','EDX_ALEVEL_PHYS_9PH0_ATOMIC',('50000000-0000-4000-8000-0000000005'||lpad(n::text,2,'0'))::uuid,
  'Q'||n,'A'||n,'basic','forward',tags,true,path
from (values
 (1,'{}'::text[],'Mechanics'),
 (2,'{}','Mechanics::Kinematics'),
 (3,'{optional}','Mechanics'),                 -- optional by tag
 (4,'{}','Mechanics::Optional extension'),     -- optional by subdeck
 (5,'{Archived::2019}','Mechanics'),           -- archived by hierarchical tag
 (6,'{}','Mechanics::Archive'),                -- archived by subdeck
 (7,'{optionality}','Mechanics'),              -- a different word: not excluded
 (8,'{}','Electricity'),
 (9,'{}','Mechanics')
) m(n,tags,path);
select public.flashcard_publish_catalogue('EDX_ALEVEL_PHYS_9PH0_ATOMIC','40000000-0000-4000-8000-000000000501','EDX_ALEVEL_PHYS_9PH0','A-level 9PH0','atomic',9);

-- Ineligible accounts see no material or media and cannot subscribe.
set local role authenticated;
do $$ declare v_user text; r jsonb; begin
 foreach v_user in array array['503','504','505','506','507','508','509','510'] loop
   perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000'||v_user,true);
   if (select count(*) from public.flashcard_catalogue_content()) <> 0 then raise exception 'Account % read catalogue material', v_user; end if;
   r := public.flashcard_add_catalogue_deck('EDX_ALEVEL_PHYS_9PH0_ATOMIC');
   if r->>'status' <> 'unavailable' then raise exception 'Account % subscribed %', v_user, r; end if;
   if (public.flashcard_list_catalogue()->>'schoolEligible')::boolean then raise exception 'Account % shown as eligible', v_user; end if;
 end loop;
end $$;

-- An eligible student subscribes; bulk unsuspend skips optional and archived cards.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',true);
do $$ declare r jsonb; v_deck uuid; begin
 r := public.flashcard_add_catalogue_deck('EDX_ALEVEL_PHYS_9PH0_ATOMIC');
 if r->>'status' <> 'added' then raise exception 'Eligible student could not subscribe %', r; end if;
 v_deck := (r->>'deck_id')::uuid;
 if (select count(*) from public.flashcard_visible_cards where suspended) <> 9 then raise exception 'Catalogue cards should start suspended'; end if;
 r := public.flashcard_set_topic_suspension(v_deck,'Mechanics',false);
 if r->>'matched' <> '8' or r->>'excluded' <> '4' or r->>'changed' <> '4' then raise exception 'Topic unsuspend counts %', r; end if;
 if (select array_agg(front order by front) from public.flashcard_visible_cards where not suspended) <> array['Q1','Q2','Q7','Q9'] then
   raise exception 'Wrong cards unsuspended: %', (select array_agg(front order by front) from public.flashcard_visible_cards where not suspended);
 end if;
 r := public.flashcard_set_topic_suspension(v_deck,null,false);
 if (select array_agg(front order by front) from public.flashcard_visible_cards where suspended) <> array['Q3','Q4','Q5','Q6'] then
   raise exception 'All-topics unsuspend touched optional or archived cards';
 end if;
 -- An optional card can still be activated individually.
 update public.flashcard_cards set suspended=false where id=(select id from public.flashcard_visible_cards where front='Q3');
 if (select suspended from public.flashcard_visible_cards where front='Q3') then raise exception 'Individual unsuspend failed'; end if;
end $$;
reset role;

-- Review two cards, then publish v2: Q1 reworded (same identity), Q8 removed, Q10 added.
do $$ declare v_card uuid; v_deck uuid; r jsonb; begin
 for v_card, v_deck in select c.id,c.deck_id from public.flashcard_cards c where c.user_id='00000000-0000-4000-8000-000000000502'
     and c.catalogue_card_id in ('50000000-0000-4000-8000-000000000501','50000000-0000-4000-8000-000000000508') loop
   r := public.flashcard_commit_review('00000000-0000-4000-8000-000000000502',v_card,0,gen_random_uuid(),3,clock_timestamp(),'fsrs-test',
     '{"retention":90}','{"due":"2100-01-01T00:00:00Z","state":"Review","stability":12.5}',v_deck);
   if r->>'status' <> 'saved' then raise exception 'Review failed %', r; end if;
 end loop;
end $$;
create temporary table before_update on commit drop as
 select c.catalogue_card_id,c.id,c.suspended,s.revision,s.state from public.flashcard_cards c join public.flashcard_states s on s.card_id=c.id
 where c.user_id='00000000-0000-4000-8000-000000000502';
grant select on before_update to authenticated;
insert into public.flashcard_catalogue_items(id,catalogue_id,stable_key) values ('50000000-0000-4000-8000-000000000510','EDX_ALEVEL_PHYS_9PH0_ATOMIC','phys-10');
insert into public.flashcard_catalogue_material(version_id,catalogue_id,catalogue_card_id,front,back,note_type,variant,tags,suspended,subdeck_path)
select '40000000-0000-4000-8000-000000000502',catalogue_id,catalogue_card_id,case when front='Q1' then 'Q1 reworded' else front end,back,note_type,variant,tags,suspended,subdeck_path
 from public.flashcard_catalogue_material where version_id='40000000-0000-4000-8000-000000000501' and front <> 'Q8';
insert into public.flashcard_catalogue_material(version_id,catalogue_id,catalogue_card_id,front,back,note_type,variant,tags,suspended,subdeck_path)
values ('40000000-0000-4000-8000-000000000502','EDX_ALEVEL_PHYS_9PH0_ATOMIC','50000000-0000-4000-8000-000000000510','Q10','A10','basic','forward','{}',true,'Electricity');
select public.flashcard_publish_catalogue('EDX_ALEVEL_PHYS_9PH0_ATOMIC','40000000-0000-4000-8000-000000000502','EDX_ALEVEL_PHYS_9PH0','A-level 9PH0','atomic',9);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',true);
do $$ declare r jsonb; begin
 r := public.flashcard_sync_catalogue_decks();
 if r->>'added' <> '1' then raise exception 'Sync should add only Q10 %', r; end if;
 -- Every surviving card keeps its id, suspension, revision and exact schedule.
 if exists (select 1 from before_update b join public.flashcard_cards c on c.catalogue_card_id=b.catalogue_card_id
            join public.flashcard_states s on s.card_id=c.id
            where c.id<>b.id or c.suspended<>b.suspended or s.revision<>b.revision or s.state is distinct from b.state) then
   raise exception 'Catalogue update changed a student card';
 end if;
 if not exists (select 1 from public.flashcard_visible_cards where front='Q1 reworded' and revision=1 and state->>'due'='2100-01-01T00:00:00Z') then
   raise exception 'Reworded card lost its schedule';
 end if;
 if exists (select 1 from public.flashcard_visible_cards where front='Q8') then raise exception 'Removed card still visible'; end if;
 if (select count(*) from public.flashcard_reviews r join public.flashcard_cards c on c.id=r.card_id where c.catalogue_card_id='50000000-0000-4000-8000-000000000508') <> 1 then
   raise exception 'Removed card lost its review history';
 end if;
 if not (select suspended from public.flashcard_visible_cards where front='Q10') then raise exception 'New card should arrive suspended'; end if;
end $$;
reset role;

-- A private account cannot read or change the student's cards, schedule, history or media.
insert into public.flashcard_media(user_id,source_key,mime_type,data)
values ('00000000-0000-4000-8000-000000000502','media-key','image/png','\x89504e47');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000510',true);
do $$ declare n integer; begin
 if (select count(*) from public.flashcard_decks) + (select count(*) from public.flashcard_notes) + (select count(*) from public.flashcard_cards)
    + (select count(*) from public.flashcard_states) + (select count(*) from public.flashcard_reviews) + (select count(*) from public.flashcard_media)
    + (select count(*) from public.flashcard_visible_cards) + (select count(*) from public.flashcard_imports) <> 0 then
   raise exception 'Another account can read private flashcard rows';
 end if;
 update public.flashcard_cards set suspended=false; get diagnostics n = row_count;
 if n <> 0 then raise exception 'Another account updated cards'; end if;
 delete from public.flashcard_media; get diagnostics n = row_count;
 if n <> 0 then raise exception 'Another account deleted media'; end if;
 if (select count(*) from public.flashcard_catalogue_media_content(gen_random_uuid())) <> 0 then raise exception 'Unexpected media'; end if;
 if jsonb_array_length(public.flashcard_study_queue((select id from public.flashcard_decks limit 1),null)->'cards') is not null then
   raise exception 'Another account can open a study queue';
 end if;
 begin
   perform public.flashcard_set_topic_suspension((select d.id from public.flashcard_decks d limit 1),null,false);
 exception when others then null; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.flashcard_media where user_id='00000000-0000-4000-8000-000000000502') <> 1 then raise exception 'Media was removed'; end if;
 if exists (select 1 from public.flashcard_cards c join public.flashcard_decks d on d.id=c.deck_id
            where d.user_id='00000000-0000-4000-8000-000000000510') then raise exception 'Cards leaked to the private account'; end if;
end $$;
-- Writing a card into someone else's deck is rejected by the composite foreign key.
select set_config('qa.victim_deck',(select id::text from public.flashcard_decks where user_id='00000000-0000-4000-8000-000000000502' limit 1),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000510',true);
do $$ declare v_note uuid; begin
 insert into public.flashcard_notes(user_id,note_type,front,back) values ('00000000-0000-4000-8000-000000000510','basic','x','y') returning id into v_note;
 begin
   insert into public.flashcard_cards(user_id,note_id,deck_id,variant)
   values ('00000000-0000-4000-8000-000000000510',v_note,current_setting('qa.victim_deck')::uuid,'forward');
   raise exception 'Card written into another account''s deck';
 exception when foreign_key_violation then null; end;
end $$;
rollback;
