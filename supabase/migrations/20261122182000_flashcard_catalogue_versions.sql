-- Track the catalogue revision materialized for each student's subscription.
-- Existing cards retain their identities and schedules across revisions.
alter table public.flashcard_decks add column catalogue_version uuid;
alter table public.flashcard_decks add constraint flashcard_decks_catalogue_version_fk
  foreign key(catalogue_id,catalogue_version) references public.flashcard_catalogue_versions(catalogue_id,id);
alter table public.flashcard_decks add constraint flashcard_deck_version_requires_catalogue
  check (catalogue_id is not null or catalogue_version is null);
create or replace function public.flashcard_protect_catalogue_version() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user='authenticated' and new.catalogue_version is distinct from old.catalogue_version then
    raise exception 'Catalogue versions are managed by synchronization.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger flashcard_protect_catalogue_version before update of catalogue_version on public.flashcard_decks
for each row execute function public.flashcard_protect_catalogue_version();


create or replace function public.flashcard_sync_catalogue_decks() returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_user uuid := auth.uid(); v_deck record; v_added integer := 0; v_count integer;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('flashcard-catalogue-sync:'||v_user::text,0));
  for v_deck in
    select d.id,d.catalogue_id,c.current_version
      from public.flashcard_decks d
      join public.flashcard_catalogue c on c.id=d.catalogue_id
      where d.user_id=v_user and d.catalogue_active and c.status='published'
        and c.current_version is not null
        and d.catalogue_version is distinct from c.current_version
        and public.flashcard_has_entitlement(v_user,c.id)
      order by d.catalogue_id
  loop
    -- Serialize subscription and synchronization operations for this account.
    perform 1 from public.flashcard_decks where user_id=v_user and id=v_deck.id and catalogue_active for update;
    if not found then continue; end if;
    if not public.flashcard_has_entitlement(v_user,v_deck.catalogue_id) then continue; end if;
    -- Lock and refresh the current version after acquiring the account lock.
    select current_version into v_deck.current_version from public.flashcard_catalogue
      where id=v_deck.catalogue_id and status='published' for share;
    if v_deck.current_version is null then continue; end if;
    with missing as materialized (
      select gen_random_uuid() as note_id,m.catalogue_card_id,m.note_type,m.variant,m.suspended
      from public.flashcard_catalogue_material m
      where m.catalogue_id=v_deck.catalogue_id and m.version_id=v_deck.current_version
        and not exists(select 1 from public.flashcard_cards c where c.user_id=v_user and c.catalogue_card_id=m.catalogue_card_id)
    ), inserted_notes as (
      insert into public.flashcard_notes(id,user_id,note_type,front,back)
        select note_id,v_user,note_type,'','' from missing returning id
    )
    insert into public.flashcard_cards(user_id,note_id,deck_id,variant,catalogue_card_id,suspended)
      select v_user,m.note_id,v_deck.id,m.variant,m.catalogue_card_id,m.suspended
      from missing m join inserted_notes n on n.id=m.note_id;
    get diagnostics v_count = row_count;
    v_added := v_added + v_count;
    update public.flashcard_decks set catalogue_version=v_deck.current_version
      where user_id=v_user and id=v_deck.id;
  end loop;
  return jsonb_build_object('status','synced','added',v_added);
end $$;
revoke all on function public.flashcard_sync_catalogue_decks() from public,anon;
grant execute on function public.flashcard_sync_catalogue_decks() to authenticated;

-- Creating or restoring a subscription uses the same set-based sync.
create or replace function public.flashcard_add_catalogue_deck(p_catalogue_id text) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_user uuid:=auth.uid(); v_catalogue public.flashcard_catalogue%rowtype; v_deck uuid;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('flashcard-catalogue-sync:'||v_user::text,0));
  select * into v_catalogue from public.flashcard_catalogue where id=p_catalogue_id and status='published' and current_version is not null;
  if not found or not public.flashcard_has_entitlement(v_user,p_catalogue_id) then
    return jsonb_build_object('status','unavailable');
  end if;
  insert into public.flashcard_decks(user_id,title,catalogue_id)
    values(v_user,v_catalogue.title,p_catalogue_id)
    on conflict(user_id,catalogue_id) where catalogue_id is not null do update set catalogue_active=true
    returning id into v_deck;
  perform public.flashcard_sync_catalogue_decks();
  return jsonb_build_object('status','added','deck_id',v_deck);
end $$;
revoke all on function public.flashcard_add_catalogue_deck(text) from public,anon;
grant execute on function public.flashcard_add_catalogue_deck(text) to authenticated;

create or replace function public.flashcard_catalogue_subdeck_paths()
returns table(catalogue_card_id uuid,subdeck_path text)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select m.catalogue_card_id,m.subdeck_path
  from public.flashcard_catalogue_material m
  join public.flashcard_catalogue c on c.id=m.catalogue_id and c.current_version=m.version_id
  where c.status='published' and public.flashcard_has_entitlement(auth.uid(),c.id)
$$;
revoke all on function public.flashcard_catalogue_subdeck_paths() from public,anon;
grant execute on function public.flashcard_catalogue_subdeck_paths() to authenticated;

create or replace view public.flashcard_visible_cards with (security_invoker = true) as
select c.id, c.user_id, c.note_id, c.deck_id, coalesce(m.variant, c.variant) as variant, c.suspended, c.source_key,
  coalesce(m.note_type, n.note_type) as type,
  coalesce(m.front, n.front) as front, coalesce(m.back, n.back) as back,
  coalesce(m.tags, n.tags) as tags, s.revision, s.state, c.created_at,
  (s.state->>'due')::timestamptz as due_at,
  p.subdeck_path
from public.flashcard_cards c
join public.flashcard_notes n on n.user_id = c.user_id and n.id = c.note_id
join public.flashcard_states s on s.user_id = c.user_id and s.card_id = c.id
left join public.flashcard_imports i on i.user_id = c.user_id and i.id = c.import_id
join public.flashcard_decks d on d.user_id = c.user_id and d.id = c.deck_id
left join public.flashcard_catalogue_content() m on m.catalogue_card_id = c.catalogue_card_id
left join public.flashcard_catalogue_subdeck_paths() p on p.catalogue_card_id = c.catalogue_card_id
where (c.import_id is null or i.status = 'complete')
  and (c.catalogue_card_id is null and d.catalogue_id is null
    or m.catalogue_card_id is not null and d.catalogue_active);

create function public.flashcard_study_queue(p_deck_id uuid,p_subdeck_path text) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  with clock as (
    select statement_timestamp() as now_utc,
      date_trunc('day', statement_timestamp() at time zone 'UTC') at time zone 'UTC' as day_start
  ), deck as (
    select d.*
    from public.flashcard_decks d
    left join public.flashcard_imports i on i.user_id = d.user_id and i.id = d.import_id
    where d.user_id = auth.uid() and d.id = p_deck_id
      and (d.import_id is null or i.status = 'complete')
      and (d.catalogue_id is null or (d.catalogue_active and public.flashcard_can_study_catalogue(d.catalogue_id)))
  ), quota as (
    select greatest(0, d.new_limit - (
      select count(*) from public.flashcard_reviews r
      where r.user_id = d.user_id and r.deck_id = d.id and r.revision = 1
        and r.reviewed_at >= t.day_start and r.reviewed_at <= t.now_utc
    )) as remaining
    from deck d cross join clock t
  ), candidates as materialized (
    select c.*,
      case when c.revision = 0 then 2 when c.state->>'state' in ('Learning','Relearning') then 0 else 1 end as priority
    from public.flashcard_visible_cards c
    join deck d on c.deck_id = d.id and c.user_id = d.user_id
    where not c.suspended
      and (p_subdeck_path is null or c.subdeck_path = p_subdeck_path
        or starts_with(c.subdeck_path, p_subdeck_path || '::'))
  ), due as (
    select c.* from candidates c cross join clock t
    where c.revision > 0 and c.due_at <= t.now_utc
    order by c.priority, c.due_at, c.created_at, c.id limit 24
  ), newcomers as (
    select c.* from candidates c where c.revision = 0
    order by c.created_at, c.id limit (select least(24, remaining) from quota)
  ), ready as (
    select * from due union all select * from newcomers
    order by priority, due_at, created_at, id limit 24
  )
  select jsonb_build_object(
    'cards', coalesce((select jsonb_agg(to_jsonb(r) - 'priority' - 'user_id' order by r.priority, r.due_at, r.created_at, r.id) from ready r), '[]'::jsonb),
    'serverNow', t.now_utc,
    'nextDue', least(
      (select min(c.due_at) from candidates c where c.revision > 0 and c.due_at > t.now_utc),
      case when d.new_limit > 0 and q.remaining = 0 and exists (select 1 from candidates where revision = 0)
        then (t.day_start at time zone 'UTC' + interval '1 day') at time zone 'UTC' end
    )
  )
  from deck d cross join quota q cross join clock t
$$;

revoke all on function public.flashcard_study_queue(uuid,text) from public,anon;
grant execute on function public.flashcard_study_queue(uuid,text) to authenticated;

-- A topic action never exposes or alters card bodies or scheduling state.
-- Optional/archive cards remain individually controllable and are excluded from
-- bulk unsuspension, including when their original path or tags identify them.
create or replace function public.flashcard_set_topic_suspension(
  p_deck_id uuid,p_subdeck_path text,p_suspended boolean
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_matched integer; v_excluded integer; v_changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='28000'; end if;
  if p_deck_id is null or p_suspended is null then raise exception 'Invalid topic action.' using errcode='22023'; end if;
  if not exists(select 1 from public.flashcard_decks d where d.id=p_deck_id and d.user_id=auth.uid()
      and (d.catalogue_id is null or (d.catalogue_active and public.flashcard_can_study_catalogue(d.catalogue_id)))) then
    raise exception 'Deck unavailable.' using errcode='42501';
  end if;
  with selected as materialized (
    select c.id,c.suspended,
      (coalesce(c.subdeck_path,'') || ' ' || array_to_string(coalesce(c.tags,'{}'::text[]),' '))
        ~* '(^|[^[:alnum:]])(archive|archived|optional)([^[:alnum:]]|$)' as optional_or_archived
    from public.flashcard_visible_cards c
    where c.user_id=auth.uid() and c.deck_id=p_deck_id
      and (p_subdeck_path is null or c.subdeck_path=p_subdeck_path
        or starts_with(c.subdeck_path,p_subdeck_path||'::'))
  ), changed as (
    update public.flashcard_cards c set suspended=p_suspended
      from selected s where c.id=s.id and c.user_id=auth.uid()
        and c.suspended is distinct from p_suspended
        and (p_suspended or not s.optional_or_archived)
    returning c.id
  )
  select count(*),count(*) filter(where not p_suspended and optional_or_archived),
    (select count(*) from changed) into v_matched,v_excluded,v_changed from selected;
  return jsonb_build_object('matched',v_matched,'changed',v_changed,'excluded',v_excluded);
end $$;
revoke all on function public.flashcard_set_topic_suspension(uuid,text,boolean) from public,anon;
grant execute on function public.flashcard_set_topic_suspension(uuid,text,boolean) to authenticated;
