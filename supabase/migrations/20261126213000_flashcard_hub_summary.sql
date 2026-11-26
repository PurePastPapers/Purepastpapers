-- Data Hub "Flashcards" tab: review history for every one of the student's sets.
-- Per set: total reviews, reviews rated Good or Easy, reviews this week, last review
-- and the Again / Hard / Good / Easy split for the last 30 days. Per day (in the
-- student's time zone, last 371 days): reviews in each set, for the heatmap and streak.
create function public.flashcard_hub_summary(p_tz text default 'UTC') returns jsonb
language sql stable security invoker set search_path to '' as $function$
  with zone as (
    select coalesce((select name from pg_catalog.pg_timezone_names where name = p_tz), 'UTC') as tz
  ), mine as (
    select r.deck_id, r.grade, r.reviewed_at, (r.reviewed_at at time zone z.tz)::date as day
    from public.flashcard_reviews r cross join zone z
    where r.user_id = auth.uid()
  ), week_start as (
    select date_trunc('week', statement_timestamp() at time zone z.tz) at time zone z.tz as start from zone z
  )
  select jsonb_build_object(
    'decks', coalesce((select jsonb_agg(jsonb_build_object(
        'deck_id', s.deck_id, 'reviews', s.reviews, 'remembered', s.remembered, 'reviews_week', s.reviews_week,
        'last_review', s.last_review, 'grades_30', jsonb_build_array(s.again30, s.hard30, s.good30, s.easy30)))
      from (
        select m.deck_id, count(*) as reviews,
          count(*) filter (where m.grade >= 3) as remembered,
          count(*) filter (where m.reviewed_at >= (select start from week_start)) as reviews_week,
          max(m.reviewed_at) as last_review,
          count(*) filter (where m.grade = 1 and m.reviewed_at >= statement_timestamp() - interval '30 days') as again30,
          count(*) filter (where m.grade = 2 and m.reviewed_at >= statement_timestamp() - interval '30 days') as hard30,
          count(*) filter (where m.grade = 3 and m.reviewed_at >= statement_timestamp() - interval '30 days') as good30,
          count(*) filter (where m.grade = 4 and m.reviewed_at >= statement_timestamp() - interval '30 days') as easy30
        from mine m group by m.deck_id
      ) s), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'deck_id', d.deck_id, 'reviews', d.reviews) order by d.day)
      from (
        select m.day, m.deck_id, count(*) as reviews from mine m
        where m.day > (statement_timestamp() at time zone (select tz from zone))::date - 371
        group by m.day, m.deck_id
      ) d), '[]'::jsonb)
  )
$function$;
revoke all on function public.flashcard_hub_summary(text) from public, anon;
grant execute on function public.flashcard_hub_summary(text) to authenticated;
