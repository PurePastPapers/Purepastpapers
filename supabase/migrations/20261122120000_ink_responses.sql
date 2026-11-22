-- Per-response handwriting records avoid rewriting the whole user_progress snapshot.
create table public.ink_responses (
  user_id uuid not null references auth.users (id) on delete cascade,
  response_id text not null check (length(response_id) between 1 and 256),
  part_id text not null check (length(part_id) between 1 and 256),
  revision bigint not null check (revision > 0),
  record jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, response_id, part_id),
  constraint ink_responses_record_shape check (
    jsonb_typeof(record) is not distinct from 'object'
    and record->>'schemaVersion' is not distinct from '1'
    and record->>'responseId' is not distinct from response_id
    and record->>'partId' is not distinct from part_id
    and record->>'ownerId' is not distinct from user_id::text
    and record->>'revision' is not distinct from revision::text
    and record->>'status' is not null
    and record->>'status' in ('draft', 'saved')
    and jsonb_typeof(record->'sections') is not distinct from 'array'
    and jsonb_array_length(record->'sections') between 1 and 24
    and octet_length(record::text) <= 1000000
  )
);

create table public.ink_response_conflicts (
  conflict_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  response_id text not null check (length(response_id) between 1 and 256),
  part_id text not null check (length(part_id) between 1 and 256),
  revision bigint not null check (revision > 0),
  record jsonb not null,
  created_at timestamptz not null default now(),
  constraint ink_conflicts_record_shape check (
    jsonb_typeof(record) is not distinct from 'object'
    and record->>'schemaVersion' is not distinct from '1'
    and record->>'responseId' is not distinct from response_id
    and record->>'partId' is not distinct from part_id
    and record->>'ownerId' is not distinct from user_id::text
    and record->>'revision' is not distinct from revision::text
    and record->>'status' is not null
    and record->>'status' in ('draft', 'saved')
    and jsonb_typeof(record->'sections') is not distinct from 'array'
    and jsonb_array_length(record->'sections') between 1 and 24
    and octet_length(record::text) <= 1000000
  )
);

alter table public.ink_responses enable row level security;
alter table public.ink_response_conflicts enable row level security;
revoke all on table public.ink_responses, public.ink_response_conflicts from anon, authenticated;
grant select on table public.ink_responses, public.ink_response_conflicts to authenticated;

create policy "Students read their own ink responses"
  on public.ink_responses for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Students read their own ink conflicts"
  on public.ink_response_conflicts for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.save_ink_response(
  p_response_id text,
  p_part_id text,
  p_expected_revision bigint,
  p_revision bigint,
  p_record jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_current public.ink_responses%rowtype;
  v_conflict_id uuid;
  v_section jsonb;
  v_stroke jsonb;
  v_point jsonb;
  v_width numeric;
  v_height numeric;
  v_x numeric;
  v_y numeric;
  v_pressure numeric;
  v_point_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to save ink.' using errcode = '28000';
  end if;
  if p_response_id is null or p_part_id is null
     or length(p_response_id) not between 1 and 256 or length(p_part_id) not between 1 and 256
     or p_revision is null or p_revision < 1
     or jsonb_typeof(p_record) is distinct from 'object'
     or p_record->>'schemaVersion' is distinct from '1'
     or p_record->>'ownerId' is distinct from v_user_id::text
     or p_record->>'revision' is distinct from p_revision::text
     or p_record->>'status' is null
     or p_record->>'status' not in ('draft', 'saved')
     or p_record->>'responseId' is distinct from p_response_id
     or p_record->>'partId' is distinct from p_part_id
     or jsonb_typeof(p_record->'sections') is distinct from 'array'
     or jsonb_array_length(p_record->'sections') not between 1 and 24
     or octet_length(p_record::text) > 1000000 then
    raise exception 'Ink response is invalid or exceeds the allowed size.' using errcode = '22023';
  end if;

  for v_section in select value from jsonb_array_elements(p_record->'sections') loop
    if jsonb_typeof(v_section->'width') is distinct from 'number'
       or jsonb_typeof(v_section->'height') is distinct from 'number'
       or jsonb_typeof(v_section->'strokes') is distinct from 'array'
       or jsonb_array_length(v_section->'strokes') > 5000 then
      raise exception 'Ink section is invalid.' using errcode = '22023';
    end if;
    v_width := (v_section->>'width')::numeric;
    v_height := (v_section->>'height')::numeric;
    if v_width <= 0 or v_width > 100000 or v_height <= 0 or v_height > 100000 then
      raise exception 'Ink section dimensions are invalid.' using errcode = '22023';
    end if;
    for v_stroke in select value from jsonb_array_elements(v_section->'strokes') loop
      if jsonb_typeof(v_stroke->'width') is distinct from 'number'
         or jsonb_typeof(v_stroke->'color') is distinct from 'string'
         or length(v_stroke->>'color') > 64
         or v_stroke->>'tool' is null
         or jsonb_typeof(v_stroke->'points') is distinct from 'array'
         or jsonb_array_length(v_stroke->'points') not between 1 and 20000
         or v_stroke->>'tool' not in ('pen', 'eraser') then
        raise exception 'Ink stroke is invalid.' using errcode = '22023';
      end if;
      if (v_stroke->>'width')::numeric <= 0 or (v_stroke->>'width')::numeric > 256 then
        raise exception 'Ink stroke width is invalid.' using errcode = '22023';
      end if;
      for v_point in select value from jsonb_array_elements(v_stroke->'points') loop
        if jsonb_typeof(v_point->'x') is distinct from 'number'
           or jsonb_typeof(v_point->'y') is distinct from 'number'
           or jsonb_typeof(v_point->'pressure') is distinct from 'number' then
          raise exception 'Ink point is invalid.' using errcode = '22023';
        end if;
        v_x := (v_point->>'x')::numeric;
        v_y := (v_point->>'y')::numeric;
        v_pressure := (v_point->>'pressure')::numeric;
        if v_x < 0 or v_x > v_width or v_y < 0 or v_y > v_height or v_pressure < 0 or v_pressure > 1 then
          raise exception 'Ink point is outside its section.' using errcode = '22023';
        end if;
        v_point_count := v_point_count + 1;
        if v_point_count > 100000 then
          raise exception 'Ink response contains too many points.' using errcode = '22023';
        end if;
      end loop;
    end loop;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || chr(31) || p_response_id || chr(31) || p_part_id, 0));
  select * into v_current
    from public.ink_responses
    where user_id = v_user_id and response_id = p_response_id and part_id = p_part_id
    for update;

  if not found then
    if p_expected_revision is not null and p_expected_revision <> 0 then
      select conflict_id into v_conflict_id from public.ink_response_conflicts
        where user_id = v_user_id and response_id = p_response_id and part_id = p_part_id and record = p_record
        order by created_at desc limit 1;
      if v_conflict_id is not null then
        return jsonb_build_object('status', 'conflict', 'conflict_id', v_conflict_id, 'current_revision', null);
      end if;
      insert into public.ink_response_conflicts (user_id, response_id, part_id, revision, record)
      values (v_user_id, p_response_id, p_part_id, p_revision, p_record)
      returning conflict_id into v_conflict_id;
      return jsonb_build_object('status', 'conflict', 'conflict_id', v_conflict_id, 'current_revision', null);
    end if;
    insert into public.ink_responses (user_id, response_id, part_id, revision, record)
    values (v_user_id, p_response_id, p_part_id, p_revision, p_record);
    return jsonb_build_object('status', 'saved', 'revision', p_revision);
  end if;

  if v_current.record = p_record then
    return jsonb_build_object('status', 'saved', 'revision', v_current.revision);
  end if;
  if p_expected_revision = v_current.revision and p_revision > v_current.revision then
    update public.ink_responses
      set revision = p_revision, record = p_record, updated_at = now()
      where user_id = v_user_id and response_id = p_response_id and part_id = p_part_id;
    return jsonb_build_object('status', 'saved', 'revision', p_revision);
  end if;

  select conflict_id into v_conflict_id from public.ink_response_conflicts
    where user_id = v_user_id and response_id = p_response_id and part_id = p_part_id and record = p_record
    order by created_at desc limit 1;
  if v_conflict_id is not null then
    return jsonb_build_object('status', 'conflict', 'conflict_id', v_conflict_id, 'current_revision', v_current.revision);
  end if;
  insert into public.ink_response_conflicts (user_id, response_id, part_id, revision, record)
  values (v_user_id, p_response_id, p_part_id, p_revision, p_record)
  returning conflict_id into v_conflict_id;
  return jsonb_build_object('status', 'conflict', 'conflict_id', v_conflict_id, 'current_revision', v_current.revision);
end;
$$;

revoke all on function public.save_ink_response(text, text, bigint, bigint, jsonb) from public, anon;
grant execute on function public.save_ink_response(text, text, bigint, bigint, jsonb) to authenticated;

create or replace function public.delete_ink_response(p_response_id text, p_part_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required to delete ink.' using errcode = '28000';
  end if;
  delete from public.ink_responses
    where user_id = v_user_id and response_id = p_response_id and part_id = p_part_id;
  delete from public.ink_response_conflicts
    where user_id = v_user_id and response_id = p_response_id and part_id = p_part_id;
  return true;
end;
$$;

revoke all on function public.delete_ink_response(text, text) from public, anon;
grant execute on function public.delete_ink_response(text, text) to authenticated;

create or replace function public.delete_ink_response_conflict(p_conflict_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required to resolve handwriting.' using errcode = '28000';
  end if;
  delete from public.ink_response_conflicts
    where conflict_id = p_conflict_id and user_id = v_user_id;
  return found;
end;
$$;

revoke all on function public.delete_ink_response_conflict(uuid) from public, anon;
grant execute on function public.delete_ink_response_conflict(uuid) to authenticated;
