-- Use a throwaway database and synthetic identities.
begin;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000001', 'summary-owner@example.invalid', now()),
  ('00000000-0000-4000-8000-000000000002', 'summary-other@example.invalid', now());
insert into auth.sessions (id,user_id) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002');
insert into public.user_progress (user_id, progress) values
('00000000-0000-4000-8000-000000000001', '{
  "enrolled_subjects":["biology"],
  "learned_spec_points":["SP_SYNTH"],
  "learned_textbook_sections":["TB_SYNTH"],
  "question_attempts":[
    {"question_id":"q1", "timestamp":"2026-04-12T22:59:59Z", "marks_awarded":1,"max_marks":5},
    {"question_id":"q1", "timestamp":"2026-04-12T23:00:00Z", "marks_awarded":2,"max_marks":5,"answer":"SECRET_ANSWER"},
    {"question_id":"q1", "timestamp":"2026-04-13T18:00:00Z", "marks_awarded":4,"max_marks":5},
    {"question_id":"q1b", "timestamp":"2026-04-13T22:59:59Z", "answered_at":"2026-04-10T12:00:00Z", "marks_awarded":0,"max_marks":1},
    {"question_id":"q2", "timestamp":"2026-04-13T23:00:00Z", "marks_awarded":4,"max_marks":5},
    {"question_id":"broken", "timestamp":"2026-04-99T15:00:00Z"}
  ],
  "saved_answers":[{"question_id":"q1", "timestamp":"2026-04-13T20:00:00Z","answer":"SECRET_WAITING"}],
  "paper_attempts":[{"paper_id":"test", "timestamp":"2026-04-13T18:01:00Z", "score_mode":"overall", "marks_awarded":7,"max_marks":10,"grade":"B"}],
  "sessions":[{"kind":"offline_test","status":"completed_on_paper","paper_id":"test","completed_at":"2026-04-13T18:01:00Z","ink_answers":"SECRET_INK"}]
}'),
('00000000-0000-4000-8000-000000000002', '{"enrolled_subjects":["OTHER_PRIVATE"]}');

create function pg_temp.claims(account text, session_id text, expiry bigint) returns text language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub',account,'session_id',session_id,'aud','authenticated','exp',expiry)::text,true)
$$;
create function pg_temp.denied() returns void language plpgsql as $$
begin
  perform public.private_study_summary();
  raise exception 'Expected access denial';
exception when sqlstate 'PT404' then
  assert sqlerrm = 'Study summary unavailable';
end
$$;
set local role anon;
do $$ begin
  assert not has_function_privilege(current_user, 'public.private_study_summary(date,date,boolean)', 'execute');
end $$;
reset role;

set local role authenticated;
select pg_temp.claims('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',9999999999);
select pg_temp.denied();
reset role;
insert into ppp_study_private.owner_binding (user_id,email_salt,email_fingerprint)
select id, id, sha256(convert_to(id::text || ':' || email,'UTF8'))
from auth.users where email = 'summary-owner@example.invalid';

set local role authenticated;
do $$
declare
  summary jsonb := public.private_study_summary('2026-04-13','2026-04-13');
begin
  assert public.private_study_summary(p_access_only => true) = 'true';
  assert current_setting('response.headers') like '%private, no-store%';
  assert jsonb_array_length(summary->'activity') = 4;
  assert summary->'activity'->2->>'in_activity_period' = 'false';
  assert summary->'activity'->2->>'in_mark_period' = 'true';
  assert summary->'activity'->3->>'waiting' = 'true';
  assert jsonb_array_length(summary->'results') = 2;
  assert summary->'results'->0->>'mode' = 'overall';
  assert summary->'results'->1->>'mode' = 'unmarked';
  assert summary->'flashcards' = '{"reviews":0,"due":0}';
  assert summary::text not like '%SECRET_%' and summary::text not like '%OTHER_PRIVATE%';
  assert not has_table_privilege(current_user, 'ppp_study_private.owner_binding', 'select');
  begin
    perform public.private_study_summary('2023-01-01','2026-04-13');
    raise exception 'Expected range rejection';
  exception when sqlstate 'PT400' then null;
  end;
end $$;
select pg_temp.claims('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000012',9999999999);
select pg_temp.denied();
do $$ begin
  assert (select progress->'enrolled_subjects' from public.user_progress) = '["OTHER_PRIVATE"]';
end $$;
select pg_temp.claims('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012',9999999999);
select pg_temp.denied();
select pg_temp.claims('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',1);
select pg_temp.denied();
reset role;

update auth.users set email = 'changed@example.invalid' where email = 'summary-owner@example.invalid';
set local role authenticated;
select pg_temp.claims('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',9999999999);
select pg_temp.denied();
reset role;
update auth.users set email = 'summary-owner@example.invalid' where email = 'changed@example.invalid';
delete from auth.sessions where id = '00000000-0000-4000-8000-000000000011';
set local role authenticated;
select pg_temp.denied();
rollback;
