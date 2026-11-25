-- Progress per set: how many cards the student has studied, and how many they know.
-- "Studied" means reviewed at least once. "Known" means the card has graduated to Review.
create or replace function public.flashcard_list_decks() returns jsonb
language sql stable set search_path to 'public', 'pg_temp' as $function$
  with counts as (
    select c.deck_id,
      count(*) as card_count,
      count(*) filter (where not c.suspended and c.revision = 0) as new_count,
      count(*) filter (where not c.suspended and c.due_at <= statement_timestamp()
        and c.state->>'state' in ('Learning', 'Relearning')) as learning_count,
      count(*) filter (where not c.suspended and c.due_at <= statement_timestamp()
        and c.state->>'state' = 'Review') as due_count,
      count(*) filter (where c.revision > 0) as studied_count,
      count(*) filter (where c.revision > 0 and c.state->>'state' = 'Review') as known_count
    from public.flashcard_visible_cards c group by c.deck_id
  )
  select coalesce(jsonb_agg(
    to_jsonb(d) || jsonb_build_object(
      'target_retention', d.retention,
      'card_count', coalesce(c.card_count, 0),
      'new_count', coalesce(c.new_count, 0),
      'learning_count', coalesce(c.learning_count, 0),
      'due_count', coalesce(c.due_count, 0),
      'studied_count', coalesce(c.studied_count, 0),
      'known_count', coalesce(c.known_count, 0)
    ) order by lower(d.title), d.id
  ), '[]'::jsonb)
  from public.flashcard_decks d
  left join counts c on c.deck_id = d.id
  left join public.flashcard_imports i on i.user_id = d.user_id and i.id = d.import_id
  where d.user_id = auth.uid() and (d.import_id is null or i.status = 'complete')
    and (d.catalogue_id is null or (d.catalogue_active and public.flashcard_can_study_catalogue(d.catalogue_id)))
$function$;

-- Spec point groups now also say how many of their cards are studied and known.
create or replace function public.flashcard_deck_spec_sets(p_deck_id uuid) returns jsonb
language sql stable set search_path to '' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tags', to_jsonb(x.spec), 'cards', x.cards, 'active', x.active, 'optional', x.protected,
    'studied', x.studied, 'known', x.known
  ) order by x.spec, x.protected), '[]'::jsonb)
  from (
    select y.spec, y.protected, count(*) as cards, count(*) filter (where not y.suspended) as active,
      count(*) filter (where y.revision > 0) as studied,
      count(*) filter (where y.revision > 0 and y.state->>'state' = 'Review') as known
    from (
      select array(select t from unnest(coalesce(c.tags, '{}'::text[])) as u(t) where t ~* '^(ppp::)?spec::' order by t) as spec,
        public.flashcard_protected_from_bulk_unsuspend(c.subdeck_path, c.tags) as protected,
        c.suspended, c.revision, c.state
      from public.flashcard_visible_cards c
      where c.user_id = auth.uid() and c.deck_id = p_deck_id
    ) y
    group by y.spec, y.protected
  ) x
$function$;

-- Review history for one set: totals, how often cards were remembered, and reviews each week.
create function public.flashcard_deck_progress(p_deck_id uuid, p_weeks integer default 8) returns jsonb
language sql stable security invoker set search_path to '' as $function$
  with mine as (
    select r.grade, r.reviewed_at from public.flashcard_reviews r
    where r.user_id = auth.uid() and r.deck_id = p_deck_id
  ), weeks as (
    select generate_series(
      date_trunc('week', statement_timestamp()) - make_interval(weeks => least(52, greatest(1, coalesce(p_weeks, 8))) - 1),
      date_trunc('week', statement_timestamp()), interval '1 week') as start
  )
  select jsonb_build_object(
    'reviews', (select count(*) from mine),
    'remembered', (select count(*) filter (where grade >= 3) from mine),
    'last_review', (select max(reviewed_at) from mine),
    'added_at', (select d.created_at from public.flashcard_decks d where d.user_id = auth.uid() and d.id = p_deck_id),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('start', w.start,
      'reviews', (select count(*) from mine m where m.reviewed_at >= w.start and m.reviewed_at < w.start + interval '1 week')) order by w.start)
      from weeks w), '[]'::jsonb)
  )
$function$;
revoke all on function public.flashcard_deck_progress(uuid, integer) from public, anon;
grant execute on function public.flashcard_deck_progress(uuid, integer) to authenticated;
