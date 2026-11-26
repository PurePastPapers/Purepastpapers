-- The study queue also reports the daily new-card limit, so the site can show a
-- pop-up when a learner reaches it (William, 26 Nov 2026). Body otherwise unchanged.
create or replace function public.flashcard_study_queue(p_deck_id uuid,p_subdeck_path text) returns jsonb
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
    select greatest(0, d.new_limit - u.used) as remaining, u.used
    from deck d cross join clock t
    cross join lateral (
      select count(*)::int as used from public.flashcard_reviews r
      where r.user_id = d.user_id and r.deck_id = d.id and r.revision = 1
        and r.reviewed_at >= t.day_start and r.reviewed_at <= t.now_utc
    ) u
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
    ),
    'newLimit', d.new_limit,
    'newToday', q.used,
    'newWaiting', (select count(*) from candidates where revision = 0),
    'newLimitReached', d.new_limit > 0 and q.remaining = 0 and exists (select 1 from candidates where revision = 0)
  )
  from deck d cross join quota q cross join clock t
$$;
