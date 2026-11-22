-- Read models for the desktop and mobile study views. Invoker security preserves
-- all account, import and catalogue access policies for both tables and RPCs.
create view public.flashcard_visible_cards with (security_invoker = true) as
select c.id, c.user_id, c.note_id, c.deck_id, coalesce(m.variant, c.variant) as variant, c.suspended, c.source_key,
  coalesce(m.note_type, n.note_type) as type,
  coalesce(m.front, n.front) as front, coalesce(m.back, n.back) as back,
  coalesce(m.tags, n.tags) as tags, s.revision, s.state, c.created_at,
  (s.state->>'due')::timestamptz as due_at
from public.flashcard_cards c
join public.flashcard_notes n on n.user_id = c.user_id and n.id = c.note_id
join public.flashcard_states s on s.user_id = c.user_id and s.card_id = c.id
left join public.flashcard_imports i on i.user_id = c.user_id and i.id = c.import_id
join public.flashcard_decks d on d.user_id = c.user_id and d.id = c.deck_id
left join public.flashcard_catalogue_content() m on m.catalogue_card_id = c.catalogue_card_id
where (c.import_id is null or i.status = 'complete')
  and (c.catalogue_card_id is null and d.catalogue_id is null
    or m.catalogue_card_id is not null and d.catalogue_active);

revoke all on public.flashcard_visible_cards from public, anon;
grant select on public.flashcard_visible_cards to authenticated;

create function public.flashcard_list_decks() returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  with counts as (
    select c.deck_id,
      count(*) as card_count,
      count(*) filter (where not c.suspended and c.revision = 0) as new_count,
      count(*) filter (where not c.suspended and c.due_at <= statement_timestamp()
        and c.state->>'state' in ('Learning', 'Relearning')) as learning_count,
      count(*) filter (where not c.suspended and c.due_at <= statement_timestamp()
        and c.state->>'state' = 'Review') as due_count
    from public.flashcard_visible_cards c group by c.deck_id
  )
  select coalesce(jsonb_agg(
    to_jsonb(d) || jsonb_build_object(
      'target_retention', d.retention,
      'card_count', coalesce(c.card_count, 0),
      'new_count', coalesce(c.new_count, 0),
      'learning_count', coalesce(c.learning_count, 0),
      'due_count', coalesce(c.due_count, 0)
    ) order by lower(d.title), d.id
  ), '[]'::jsonb)
  from public.flashcard_decks d
  left join counts c on c.deck_id = d.id
  left join public.flashcard_imports i on i.user_id = d.user_id and i.id = d.import_id
  where d.user_id = auth.uid() and (d.import_id is null or i.status = 'complete')
    and (d.catalogue_id is null or (d.catalogue_active and public.flashcard_can_study_catalogue(d.catalogue_id)))
$$;

create function public.flashcard_study_queue(p_deck_id uuid) returns jsonb
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

revoke all on function public.flashcard_list_decks(), public.flashcard_study_queue(uuid) from public, anon;
grant execute on function public.flashcard_list_decks(), public.flashcard_study_queue(uuid) to authenticated;

create function public.flashcard_count_existing_sources(p_source_keys text[]) returns integer
language sql stable security invoker set search_path = public, pg_temp as $$
  select count(*)::integer
  from public.flashcard_cards c
  left join public.flashcard_imports i on i.user_id = c.user_id and i.id = c.import_id
  where c.user_id = auth.uid() and c.source_key = any(p_source_keys[1:5000])
    and (c.import_id is null or i.status = 'complete')
$$;
revoke all on function public.flashcard_count_existing_sources(text[]) from public, anon;
grant execute on function public.flashcard_count_existing_sources(text[]) to authenticated;
