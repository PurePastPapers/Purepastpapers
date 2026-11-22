-- Private flashcard records. Review state is written only by the trusted scheduler.
create table public.flashcard_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'staging' check (status in ('staging', 'complete')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, id)
);

create table public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  parent_id uuid,
  retention integer not null default 90 check (retention between 80 and 92),
  new_limit integer not null default 20 check (new_limit between 0 and 999),
  import_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, parent_id) references public.flashcard_decks(user_id, id) on delete cascade,
  foreign key (user_id, import_id) references public.flashcard_imports(user_id, id) on delete cascade,
  check (parent_id is distinct from id)
);

create table public.flashcard_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_type text not null check (note_type in ('basic', 'reverse', 'cloze')),
  front text not null check (octet_length(front) <= 250000),
  back text not null default '' check (octet_length(back) <= 250000),
  tags text[] not null default '{}',
  source_key text check (length(source_key) <= 512),
  import_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, import_id) references public.flashcard_imports(user_id, id) on delete cascade
);

create unique index flashcard_notes_source_key on public.flashcard_notes(user_id, source_key) where source_key is not null;

create table public.flashcard_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null,
  deck_id uuid not null,
  variant text not null check (length(variant) between 1 and 100),
  source_key text check (length(source_key) <= 512),
  suspended boolean not null default false,
  import_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, note_id, variant),
  foreign key (user_id, note_id) references public.flashcard_notes(user_id, id) on delete cascade,
  foreign key (user_id, deck_id) references public.flashcard_decks(user_id, id) on delete cascade,
  foreign key (user_id, import_id) references public.flashcard_imports(user_id, id) on delete cascade
);
create unique index flashcard_cards_source_key on public.flashcard_cards(user_id, source_key) where source_key is not null;
create index flashcard_cards_deck on public.flashcard_cards(user_id, deck_id);

create table public.flashcard_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null,
  revision bigint not null default 0 check (revision >= 0),
  state jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id),
  foreign key (user_id, card_id) references public.flashcard_cards(user_id, id) on delete cascade,
  check (state is null or (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 20000))
);

create table public.flashcard_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  card_id uuid not null,
  deck_id uuid not null,
  revision bigint not null,
  grade integer not null check (grade between 1 and 4),
  reviewed_at timestamptz not null,
  scheduler text not null check (length(scheduler) between 1 and 100),
  settings jsonb not null,
  state_before jsonb,
  state_after jsonb not null,
  primary key (user_id, request_id),
  unique (user_id, card_id, revision)
);

create or replace function public.flashcard_create_state() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.flashcard_states(user_id, card_id) values (new.user_id, new.id);
  return new;
end $$;
create trigger flashcard_create_state after insert on public.flashcard_cards
for each row execute function public.flashcard_create_state();

alter table public.flashcard_imports enable row level security;
alter table public.flashcard_decks enable row level security;
alter table public.flashcard_notes enable row level security;
alter table public.flashcard_cards enable row level security;
alter table public.flashcard_states enable row level security;
alter table public.flashcard_reviews enable row level security;
revoke all on public.flashcard_imports, public.flashcard_decks, public.flashcard_notes,
  public.flashcard_cards, public.flashcard_states, public.flashcard_reviews from anon, authenticated;
grant select, delete on public.flashcard_imports to authenticated;
grant select, insert, update, delete on public.flashcard_decks, public.flashcard_notes, public.flashcard_cards to authenticated;
grant select on public.flashcard_states, public.flashcard_reviews to authenticated;

create policy flashcard_import_owner_select on public.flashcard_imports for select to authenticated using (user_id = (select auth.uid()));
create policy flashcard_import_owner_insert on public.flashcard_imports for insert to authenticated with check (user_id = (select auth.uid()) and status = 'staging' and completed_at is null);
create policy flashcard_import_owner_delete on public.flashcard_imports for delete to authenticated using (user_id = (select auth.uid()) and status = 'staging');

-- Staged records remain visible to their owner for inspection, but consumers must only
-- present batches whose status is complete. Finalization is a single database update.
create policy flashcard_deck_owner on public.flashcard_decks for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy flashcard_note_owner on public.flashcard_notes for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy flashcard_card_owner on public.flashcard_cards for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy flashcard_state_owner on public.flashcard_states for select to authenticated using (user_id = (select auth.uid()));
create policy flashcard_review_owner on public.flashcard_reviews for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.flashcard_begin_import(p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid := auth.uid(); v_existing public.flashcard_imports%rowtype;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='28000'; end if;
  if p_batch_id is null then raise exception 'Missing batch id.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('flashcard-import:' || v_user::text,0));
  select * into v_existing from public.flashcard_imports where user_id=v_user and id=p_batch_id;
  if found then return jsonb_build_object('status',v_existing.status,'batch_id',v_existing.id); end if;
  delete from public.flashcard_imports where user_id=v_user and status='staging' and created_at < now() - interval '24 hours';
  select * into v_existing from public.flashcard_imports where user_id=v_user and status='staging' order by created_at limit 1;
  if found then return jsonb_build_object('status','active_batch','batch_id',v_existing.id); end if;
  insert into public.flashcard_imports(id,user_id) values(p_batch_id,v_user);
  return jsonb_build_object('status','staging','batch_id',p_batch_id);
end $$;
revoke all on function public.flashcard_begin_import(uuid) from public,anon;
grant execute on function public.flashcard_begin_import(uuid) to authenticated;

create or replace function public.flashcard_finish_import(p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_status text; v_count integer;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('flashcard-import:' || v_user::text,0));
  select status into v_status from public.flashcard_imports where id=p_batch_id and user_id=v_user for update;
  if not found then raise exception 'Import unavailable.' using errcode='42501'; end if;
  select count(*) into v_count from public.flashcard_cards where user_id=v_user and import_id=p_batch_id;
  if v_status='staging' and v_count=0 then
    delete from public.flashcard_media where user_id=v_user and import_id=p_batch_id;
    delete from public.flashcard_decks where user_id=v_user and import_id=p_batch_id;
  end if;
  update public.flashcard_imports set status='complete',completed_at=coalesce(completed_at,now()) where id=p_batch_id and user_id=v_user;
  return jsonb_build_object('status','complete','accepted',v_count);
end $$;
revoke all on function public.flashcard_finish_import(uuid) from public, anon;
grant execute on function public.flashcard_finish_import(uuid) to authenticated;

-- Invoke only from the authenticated server-side scheduler. The scheduler receives a
-- previously authenticated user id, reads the state, and calculates the next state
-- using its own UTC clock. Revision checks protect concurrent tabs and devices.
create or replace function public.flashcard_commit_review(
  p_user_id uuid, p_card_id uuid, p_expected_revision bigint, p_request_id uuid,
  p_grade integer, p_reviewed_at timestamptz, p_scheduler text, p_settings jsonb, p_state jsonb, p_expected_deck_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_state public.flashcard_states%rowtype;
  v_previous public.flashcard_reviews%rowtype;
  v_retention integer;
  v_new_limit integer;
  v_today_count integer;
  v_suspended boolean;
  v_batch_status text;
begin
  if p_user_id is null or p_card_id is null or p_request_id is null or p_expected_revision is null
     or p_grade is null or p_grade not between 1 and 4 or p_reviewed_at is null
     or p_scheduler is null or length(p_scheduler) not between 1 and 100
     or jsonb_typeof(p_settings) is distinct from 'object'
     or jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text) > 20000 then
    raise exception 'Invalid review request.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_request_id::text, 0));
  select * into v_previous from public.flashcard_reviews where user_id = p_user_id and request_id = p_request_id;
  if found then
    if v_previous.card_id <> p_card_id or v_previous.grade <> p_grade then
      raise exception 'Review request id is already in use.' using errcode = '22023';
    end if;
    return jsonb_build_object('status', 'saved', 'revision', v_previous.revision, 'state', v_previous.state_after, 'reviewed_at', v_previous.reviewed_at);
  end if;
  if abs(extract(epoch from (clock_timestamp() - p_reviewed_at))) > 60 then
    raise exception 'Review time expired.' using errcode = '22023';
  end if;
  select d.retention, d.new_limit, c.suspended into v_retention, v_new_limit, v_suspended
    from public.flashcard_cards c join public.flashcard_decks d on d.user_id = c.user_id and d.id = c.deck_id
    where c.user_id = p_user_id and c.id = p_card_id and c.deck_id = p_expected_deck_id
    for update of c, d;
  if not found then return jsonb_build_object('status', 'missing_or_moved'); end if;
  select i.status into v_batch_status from public.flashcard_cards c
    join public.flashcard_imports i on i.user_id = c.user_id and i.id = c.import_id
    where c.user_id = p_user_id and c.id = p_card_id;
  select * into v_state from public.flashcard_states
    where user_id = p_user_id and card_id = p_card_id for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;
  if not public.flashcard_can_study_card(p_user_id,p_card_id) then
    return jsonb_build_object('status','missing');
  end if;
  if v_suspended or (v_batch_status is not null and v_batch_status <> 'complete') then
    raise exception 'Card unavailable.' using errcode = '42501';
  end if;
  if p_settings->>'retention' is distinct from v_retention::text then
    return jsonb_build_object('status', 'settings_changed', 'retention', v_retention);
  end if;
  if v_state.revision <> p_expected_revision then
    return jsonb_build_object('status', 'conflict', 'revision', v_state.revision, 'state', v_state.state);
  end if;
  if v_state.revision = 0 then
    select count(*) into v_today_count from public.flashcard_reviews r
      where r.user_id = p_user_id and r.deck_id = p_expected_deck_id
        and r.revision = 1 and r.reviewed_at >= date_trunc('day', p_reviewed_at at time zone 'UTC') at time zone 'UTC'
        and r.reviewed_at < (date_trunc('day', p_reviewed_at at time zone 'UTC') + interval '1 day') at time zone 'UTC';
    if v_today_count >= v_new_limit then
      return jsonb_build_object('status', 'new_limit_reached');
    end if;
  end if;
  if v_state.state is not null and (v_state.state->>'due')::timestamptz > p_reviewed_at then
    return jsonb_build_object('status','not_due','due',v_state.state->>'due');
  end if;
  insert into public.flashcard_reviews(user_id, request_id, card_id, deck_id, revision, grade, reviewed_at, scheduler, settings, state_before, state_after)
    values (p_user_id, p_request_id, p_card_id, p_expected_deck_id, v_state.revision + 1, p_grade, p_reviewed_at, p_scheduler, p_settings, v_state.state, p_state);
  update public.flashcard_states set state = p_state, revision = v_state.revision + 1, updated_at = clock_timestamp()
    where user_id = p_user_id and card_id = p_card_id;
  return jsonb_build_object('status', 'saved', 'revision', v_state.revision + 1, 'state', p_state, 'reviewed_at', p_reviewed_at);
end $$;
revoke all on function public.flashcard_commit_review(uuid, uuid, bigint, uuid, integer, timestamptz, text, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.flashcard_commit_review(uuid, uuid, bigint, uuid, integer, timestamptz, text, jsonb, jsonb, uuid) to service_role;

create table public.flashcard_account_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- The first release uses one fixed account-wide study day.
  study_timezone text not null default 'UTC' check (study_timezone = 'UTC')
);
alter table public.flashcard_account_settings enable row level security;
revoke all on public.flashcard_account_settings from anon, authenticated;
grant select, insert, update on public.flashcard_account_settings to authenticated;
create policy flashcard_settings_owner on public.flashcard_account_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.flashcard_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null check (length(source_key) between 1 and 512),
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/gif','image/webp','audio/mpeg','audio/ogg','audio/wav','audio/mp4')),
  data bytea not null check (octet_length(data) between 1 and 10485760),
  import_id uuid,
  unique (user_id, id), unique (user_id, source_key),
  foreign key (user_id, import_id) references public.flashcard_imports(user_id, id) on delete cascade
);
alter table public.flashcard_media enable row level security;
revoke all on public.flashcard_media from anon, authenticated;
grant select, insert, delete on public.flashcard_media to authenticated;
create policy flashcard_media_owner on public.flashcard_media for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Trusted server gets its scheduling inputs and an authoritative timestamp in one call.
create or replace function public.flashcard_prepare_review(
  p_user_id uuid, p_card_id uuid, p_expected_revision bigint, p_request_id uuid, p_grade integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb; v_previous public.flashcard_reviews%rowtype; v_now timestamptz := clock_timestamp();
begin
  select * into v_previous from public.flashcard_reviews where user_id=p_user_id and request_id=p_request_id;
  if found then
    if v_previous.card_id <> p_card_id or v_previous.grade <> p_grade then
      raise exception 'Review request id is already in use.' using errcode = '22023';
    end if;
    return jsonb_build_object('status','saved','revision',v_previous.revision,'state',v_previous.state_after,'reviewed_at',v_previous.reviewed_at);
  end if;
  select jsonb_build_object('status', case
        when c.suspended then 'suspended'
        when s.revision <> p_expected_revision then 'conflict'
        when s.state is not null and (s.state->>'due')::timestamptz > v_now then 'not_due'
        else 'ready' end,
      'card_id', c.id, 'deck_id', c.deck_id, 'revision', s.revision, 'state', s.state,
      'retention', d.retention, 'reviewed_at', v_now) into v_result
    from public.flashcard_cards c
    join public.flashcard_states s on s.user_id = c.user_id and s.card_id = c.id
    join public.flashcard_decks d on d.user_id = c.user_id and d.id = c.deck_id
    left join public.flashcard_imports i on i.user_id = c.user_id and i.id = c.import_id
    where c.user_id = p_user_id and c.id = p_card_id and (c.import_id is null or i.status = 'complete')
      and public.flashcard_can_study_card(p_user_id,p_card_id);
  return coalesce(v_result, jsonb_build_object('status', 'missing'));
end $$;
revoke all on function public.flashcard_prepare_review(uuid,uuid,bigint,uuid,integer) from public, anon, authenticated;
grant execute on function public.flashcard_prepare_review(uuid,uuid,bigint,uuid,integer) to service_role;

-- Create a note and its variants as a single transaction. Existing variants retain
-- their card ids and scheduling state. A caller must confirm removal explicitly.
create or replace function public.flashcard_save_note(
  p_note_id uuid, p_deck_id uuid, p_type text, p_front text, p_back text,
  p_tags text[], p_variants text[], p_confirm_remove boolean default false
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid(); v_note_id uuid; v_variant text; v_removed integer; v_existing_type text;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  if not exists (select 1 from public.flashcard_decks where user_id = v_user and id = p_deck_id and catalogue_id is null)
     or p_type not in ('basic','reverse','cloze') or p_front is null or p_back is null
     or p_variants is null or cardinality(p_variants) < 1 or cardinality(p_variants) > 100
     or array_position(p_variants, null) is not null
     or cardinality(p_variants) <> (select count(distinct x) from unnest(p_variants) x) then
    raise exception 'Invalid note.' using errcode = '22023';
  end if;
  if p_note_id is null then
    insert into public.flashcard_notes(user_id,note_type,front,back,tags)
      values(v_user,p_type,p_front,p_back,coalesce(p_tags,'{}')) returning id into v_note_id;
  else
    select id, note_type into v_note_id, v_existing_type from public.flashcard_notes where user_id = v_user and id = p_note_id for update;
    if not found or exists(select 1 from public.flashcard_cards where user_id=v_user and note_id=v_note_id and catalogue_card_id is not null) then
      raise exception 'Note unavailable.' using errcode = '42501';
    end if;
    select count(*) into v_removed from public.flashcard_cards
      where user_id = v_user and note_id = v_note_id and not (variant = any(p_variants));
    if (v_removed > 0 or v_existing_type <> p_type) and not coalesce(p_confirm_remove,false) then
      return jsonb_build_object('status','confirm_remove','removed_cards',v_removed,'type_changed',v_existing_type <> p_type);
    end if;
    update public.flashcard_notes set note_type=p_type,front=p_front,back=p_back,tags=coalesce(p_tags,'{}'),updated_at=now()
      where user_id=v_user and id=v_note_id;
    delete from public.flashcard_cards where user_id=v_user and note_id=v_note_id and not (variant = any(p_variants));
  end if;
  foreach v_variant in array p_variants loop
    insert into public.flashcard_cards(user_id,note_id,deck_id,variant)
      values(v_user,v_note_id,p_deck_id,v_variant)
      on conflict (user_id,note_id,variant) do nothing;
  end loop;
  return jsonb_build_object('status','saved','note_id',v_note_id);
end $$;
revoke all on function public.flashcard_save_note(uuid,uuid,text,text,text,text[],text[],boolean) from public,anon;
grant execute on function public.flashcard_save_note(uuid,uuid,text,text,text,text[],text[],boolean) to authenticated;

-- Import chunks are inserted into an invisible batch and become available when
-- flashcard_finish_import changes the batch status. Duplicate source cards are skipped.
create or replace function public.flashcard_import_chunk(p_batch_id uuid, p_notes jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid(); v_note jsonb; v_card jsonb; v_note_id uuid;
  v_source text; v_card_count integer := 0; v_skipped integer := 0;
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='28000'; end if;
  if jsonb_typeof(p_notes) is distinct from 'array' or jsonb_array_length(p_notes) > 500
     or octet_length(p_notes::text) > 5000000 then
    raise exception 'Invalid import chunk.' using errcode='22023';
  end if;
  perform 1 from public.flashcard_imports where id=p_batch_id and user_id=v_user and status='staging' for update;
  if not found then raise exception 'Import unavailable.' using errcode='42501'; end if;
  for v_note in select value from jsonb_array_elements(p_notes) loop
    if v_note->>'type' not in ('basic','reverse','cloze') or v_note->>'front' is null
       or jsonb_typeof(v_note->'cards') is distinct from 'array'
       or jsonb_typeof(coalesce(v_note->'tags','[]'::jsonb)) is distinct from 'array' then
      raise exception 'Invalid import note.' using errcode='22023';
    end if;
    v_note_id := null;
    if nullif(v_note->>'key','') is not null then
      select id into v_note_id from public.flashcard_notes
        where user_id=v_user and source_key=v_note->>'key';
    end if;
    for v_card in select value from jsonb_array_elements(v_note->'cards') loop
      v_source := nullif(v_card->>'sourceKey','');
      if v_source is not null and exists (select 1 from public.flashcard_cards where user_id=v_user and source_key=v_source) then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      if not exists (select 1 from public.flashcard_decks where user_id=v_user and id=(v_card->>'deckId')::uuid and catalogue_id is null) then
        raise exception 'Import target deck unavailable.' using errcode='42501';
      end if;
      if v_note_id is null then
        insert into public.flashcard_notes(user_id,note_type,front,back,tags,source_key,import_id)
        values (v_user,v_note->>'type',v_note->>'front',coalesce(v_note->>'back',''),
          array(select jsonb_array_elements_text(coalesce(v_note->'tags','[]'::jsonb))),nullif(v_note->>'key',''),p_batch_id)
        returning id into v_note_id;
      end if;
      insert into public.flashcard_cards(user_id,note_id,deck_id,variant,source_key,suspended,import_id)
      values (v_user,v_note_id,(v_card->>'deckId')::uuid,v_card->>'variant',v_source,
        coalesce((v_card->>'suspended')::boolean,false),p_batch_id)
      on conflict do nothing returning id into v_id;
      if v_id is null then v_skipped := v_skipped + 1; else v_card_count := v_card_count + 1; end if;
      v_id := null;
    end loop;
    if v_note_id is not null and not exists (select 1 from public.flashcard_cards where user_id=v_user and note_id=v_note_id) then
      delete from public.flashcard_notes where user_id=v_user and id=v_note_id and import_id=p_batch_id;
    end if;
  end loop;
  return jsonb_build_object('accepted',v_card_count,'duplicates',v_skipped);
end $$;
revoke all on function public.flashcard_import_chunk(uuid,jsonb) from public,anon;
grant execute on function public.flashcard_import_chunk(uuid,jsonb) to authenticated;
