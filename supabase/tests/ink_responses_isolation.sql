-- Run only against a disposable Supabase database. All fixture users and data roll back.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'ink-test-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'ink-test-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);

select public.save_ink_response(
  'test-response', 'part-a', null, 1,
  '{"schemaVersion":1,"ownerId":"00000000-0000-4000-8000-000000000101","responseId":"test-response","partId":"part-a","revision":1,"status":"saved","sections":[{"id":"section-1","width":1000,"height":360,"strokes":[{"id":"stroke-1","color":"#111111","width":3,"tool":"pen","points":[{"x":3,"y":4,"pressure":0.5}]}]}]}'::jsonb
);

do $$
begin
  if (select count(*) from public.ink_responses) <> 1 then
    raise exception 'Owner A should see its own record.';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);

do $$
begin
  if (select count(*) from public.ink_responses) <> 0 then
    raise exception 'Owner B must not see owner A records.';
  end if;
  begin
    perform public.save_ink_response(
      'test-response', 'part-a', 1, 2,
      '{"schemaVersion":1,"ownerId":"00000000-0000-4000-8000-000000000101","responseId":"test-response","partId":"part-a","revision":2,"status":"saved","sections":[{"id":"section-1","width":1000,"height":360,"strokes":[{"id":"stroke-2","color":"#111111","width":3,"tool":"pen","points":[{"x":3,"y":4,"pressure":0.5}]}]}]}'::jsonb
    );
    raise exception 'A different owner must not write a response for owner A.';
  exception when sqlstate '22023' then
    null;
  end;
  if (select count(*) from public.ink_responses) <> 0 then
    raise exception 'Rejected cross-owner writes must leave no visible row.';
  end if;
end;
$$;

rollback;
