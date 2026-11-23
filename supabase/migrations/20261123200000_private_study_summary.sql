-- The private binding is empty on installation. Keep the UUID and the email
-- fingerprint in the database only. The browser uses its normal authenticated role.
create schema ppp_study_private;
revoke all on schema ppp_study_private from public, anon, authenticated;
grant usage on schema ppp_study_private to authenticated;

create table ppp_study_private.owner_binding (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id) on delete cascade,
  email_salt uuid not null,
  email_fingerprint bytea not null check (octet_length(email_fingerprint) = 32)
);
revoke all on ppp_study_private.owner_binding from public, anon, authenticated;

-- This helper can see auth metadata but cannot read progress. The outer RPC
-- runs as the caller, so the existing progress and flashcard RLS still applies.
create function ppp_study_private.allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from ppp_study_private.owner_binding b
    join auth.users u on u.id = b.user_id
    join auth.sessions s on s.user_id = u.id
    where u.id = auth.uid()
      and s.id::text = auth.jwt()->>'session_id'
      and auth.jwt()->>'aud' = 'authenticated'
      and case when auth.jwt()->>'exp' ~ '^[0-9]{1,12}$'
        then (auth.jwt()->>'exp')::bigint > extract(epoch from statement_timestamp())
        else false end
      and (s.not_after is null or s.not_after > statement_timestamp())
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= statement_timestamp())
      and b.email_fingerprint = sha256(convert_to(b.email_salt::text || ':' || lower(u.email), 'UTF8'))
  )
$$;
revoke all on function ppp_study_private.allowed() from public, anon, authenticated;
grant execute on function ppp_study_private.allowed() to authenticated;

create function ppp_study_private.items(value jsonb) returns setof jsonb
language sql immutable security invoker set search_path = '' as $$
  select jsonb_array_elements(case when jsonb_typeof(value) = 'array' then value else '[]'::jsonb end)
$$;
create function ppp_study_private.ids(value jsonb) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(distinct id), '[]'::jsonb)
  from ppp_study_private.items(value) as entry(id)
  where jsonb_typeof(id) = 'string' and length(id #>> '{}') between 1 and 180
$$;
create function ppp_study_private.study_time(value text) returns timestamptz
language sql stable security invoker set search_path = '' as $$
  select case when value ~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$'
    and pg_input_is_valid(value, 'timestamp with time zone') then value::timestamptz end
$$;
revoke all on function ppp_study_private.items(jsonb), ppp_study_private.ids(jsonb),
  ppp_study_private.study_time(text) from public, anon, authenticated;
grant execute on function ppp_study_private.items(jsonb), ppp_study_private.ids(jsonb),
  ppp_study_private.study_time(text) to authenticated;

create function public.private_study_summary(
  p_from date default null, p_to date default null, p_access_only boolean default false
) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  owner_id uuid;
  doc jsonb;
  updated timestamptz;
  as_of timestamptz := statement_timestamp();
  today date := (as_of at time zone 'Europe/London')::date;
  period_start timestamptz;
  period_end timestamptz;
  activity jsonb;
  results jsonb;
  choices jsonb;
  reviews bigint;
  due bigint;
begin
  perform set_config('response.headers',
    '[{"Cache-Control":"private, no-store"},{"X-Robots-Tag":"noindex, nofollow"}]', true);
  if not ppp_study_private.allowed() then
    raise sqlstate 'PT404' using message = 'Study summary unavailable';
  end if;
  if p_access_only then return 'true'::jsonb; end if;

  p_from := coalesce(p_from, today - 29);
  p_to := coalesce(p_to, today);
  if not isfinite(p_from) or not isfinite(p_to) or p_from > p_to or p_to > today
    or p_from < date '2000-01-01' or p_to - p_from > 365 then
    raise sqlstate 'PT400' using message = 'Choose a date range of up to 366 days ending today or earlier';
  end if;
  period_start := p_from::timestamp at time zone 'Europe/London';
  period_end := (p_to + 1)::timestamp at time zone 'Europe/London';
  owner_id := auth.uid();
  select progress, updated_at into doc, updated from public.user_progress where user_id = owner_id;

  -- Project fields explicitly, including for documents restored from older backups.
  -- Use the original answer time for activity and the mark time for latest-mark rules.
  with entries as (
    select entry, false as waiting, ordinal
    from ppp_study_private.items(doc->'question_attempts') with ordinality as q(entry, ordinal)
    union all
    select entry, true, ordinal
    from ppp_study_private.items(doc->'saved_answers') with ordinality as q(entry, ordinal)
  ), timed as (
    select *, ppp_study_private.study_time(entry->>'timestamp') as recorded_at,
      coalesce(ppp_study_private.study_time(entry->>'answered_at'),
        ppp_study_private.study_time(entry->>'timestamp'),
        ppp_study_private.study_time(entry->>'updated_at')) as activity_at
    from entries where jsonb_typeof(entry->'question_id') = 'string'
      and length(entry->>'question_id') between 1 and 180
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'question_id', entry->>'question_id', 'subject_id', left(entry->>'subject_id', 100),
    'timestamp', coalesce(recorded_at, activity_at), 'activity_at', activity_at,
    'in_activity_period', coalesce(activity_at >= period_start and activity_at < period_end and activity_at <= as_of, false),
    'in_mark_period', coalesce(not waiting and recorded_at >= period_start and recorded_at < period_end and recorded_at <= as_of, false),
    'waiting', waiting, 'difficulty', left(entry->>'difficulty', 30),
    'marks_awarded', case when not waiting and jsonb_typeof(entry->'marks_awarded') = 'number' then entry->'marks_awarded' end,
    'max_marks', case when not waiting and jsonb_typeof(entry->'max_marks') = 'number' then entry->'max_marks' end
  ) order by waiting, ordinal), '[]'::jsonb) into activity
  from timed where (activity_at >= period_start and activity_at < period_end and activity_at <= as_of)
    or (not waiting and recorded_at >= period_start and recorded_at < period_end and recorded_at <= as_of);

  with sessions as materialized (
    select entry from ppp_study_private.items(doc->'sessions') as s(entry)
  ), scores as (
    select a.entry, ppp_study_private.study_time(a.entry->>'timestamp') as recorded_at,
      coalesce(a.entry->>'score_mode', s.entry->'result'->>'mode',
        case when s.entry->'result'->>'questions_marked' = '0' then 'overall'
          when s.entry->'result'->>'questions_marked' ~ '^[1-9][0-9]*$' then 'parts' end) as mode
    from ppp_study_private.items(doc->'paper_attempts') as a(entry)
    left join lateral (
      select entry from sessions where entry->>'session_id' = a.entry->>'session_id' limit 1
    ) s on true
    union all
    select entry, ppp_study_private.study_time(entry->>'completed_at'), 'unmarked'
    from sessions where entry->>'kind' = 'offline_test' and entry->>'status' = 'completed_on_paper'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'paper_id', left(entry->>'paper_id', 180), 'subject_id', left(entry->>'subject_id', 100),
    'title', case when jsonb_typeof(entry->'title') = 'string' then left(entry->>'title', 160) end,
    'paper_type', case when mode = 'unmarked' then 'user_custom_test' else left(entry->>'paper_type', 50) end,
    'timestamp', recorded_at, 'mode', case when mode in ('unmarked', 'overall', 'parts') then mode end,
    'marks_awarded', case when jsonb_typeof(entry->'marks_awarded') = 'number' then entry->'marks_awarded' end,
    'max_marks', case when jsonb_typeof(entry->'max_marks') = 'number' then entry->'max_marks' end,
    'grade', case when entry->>'grade' ~ '^([A-GU][*]?|[1-9])$' then entry->>'grade' end
  ) order by recorded_at desc, entry->>'session_id', entry->>'paper_id'), '[]'::jsonb) into results
  from scores where recorded_at >= period_start and recorded_at < period_end and recorded_at <= as_of;

  select coalesce(jsonb_object_agg(subject_id, ppp_study_private.ids(route->'levels')), '{}'::jsonb)
    into choices
  from jsonb_each(case when jsonb_typeof(doc->'preferences'->'moduleRoutes') = 'object'
    then doc->'preferences'->'moduleRoutes' else '{}'::jsonb end) as r(subject_id, route)
  where length(subject_id) between 1 and 100;

  select count(*) into reviews from public.flashcard_reviews
  where user_id = owner_id and reviewed_at >= period_start and reviewed_at < period_end and reviewed_at <= as_of;
  select count(*) into due from public.flashcard_visible_cards
  where user_id = owner_id and not suspended and revision > 0 and due_at <= as_of;

  return jsonb_build_object(
    'asOf', as_of, 'progressUpdatedAt', updated, 'from', p_from, 'to', p_to,
    'enrolled', ppp_study_private.ids(doc->'enrolled_subjects'), 'qualifications', choices,
    'specTicks', ppp_study_private.ids(doc->'learned_spec_points'),
    'textbookTicks', ppp_study_private.ids(doc->'learned_textbook_sections'),
    'activity', activity, 'results', results,
    'flashcards', jsonb_build_object('reviews', reviews, 'due', due)
  );
end
$$;
revoke all on function public.private_study_summary(date, date, boolean) from public, anon, authenticated;
grant execute on function public.private_study_summary(date, date, boolean) to authenticated;
