-- Share one filter between the paged manager and bulk changes.
create function public.flashcard_filtered_manager_cards(
  p_deck_id uuid, p_subdeck_path text, p_query text, p_filters jsonb
) returns setof public.flashcard_visible_cards
language sql stable security invoker set search_path = '' as $$
  select c.*
  from public.flashcard_visible_cards c
  where c.user_id = auth.uid() and c.deck_id = p_deck_id
    and (nullif(p_subdeck_path,'') is null or c.subdeck_path = p_subdeck_path
      or starts_with(c.subdeck_path, p_subdeck_path || '::'))
    and (nullif(trim(p_query),'') is null or strpos(
      lower(c.front || ' ' || c.back || ' ' || coalesce(array_to_string(c.tags,' '),'')),
      lower(trim(p_query))
    ) > 0)
    and (coalesce(p_filters->>'specPoint','') = '' or (p_filters->>'specPoint') = any(c.tags))
    and case coalesce(p_filters->>'status','all')
      when 'all' then true
      when 'new' then c.revision = 0
      when 'learning' then c.revision > 0 and c.state->>'state' in ('Learning','Relearning')
      when 'due' then c.revision > 0 and c.due_at <= statement_timestamp()
      when 'reviewed' then c.revision > 0
      else false
    end
    and case coalesce(p_filters->>'availability','all')
      when 'all' then true
      when 'active' then not c.suspended
      when 'suspended' then c.suspended
      else false
    end
$$;

create function public.flashcard_protected_from_bulk_unsuspend(p_path text, p_tags text[]) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select (coalesce(p_path,'') || ' ' || coalesce(array_to_string(p_tags,' '),''))
    ~* '(^|[^[:alnum:]])(archive|archived|optional)([^[:alnum:]]|$)'
$$;

create function public.flashcard_manage_cards(
  p_deck_id uuid, p_subdeck_path text, p_query text, p_page integer, p_page_size integer, p_filters jsonb
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with paging as (
    select least(100, greatest(1, coalesce(p_page_size, 30))) as page_size,
      greatest(1, coalesce(p_page, 1))::bigint - 1 as page_index
  ), matched as materialized (
    select c.id,c.note_id,c.deck_id,c.variant,c.suspended,c.type,c.front,c.back,c.tags,
      c.revision,c.state,c.due_at,c.subdeck_path,c.created_at,
      public.flashcard_protected_from_bulk_unsuspend(c.subdeck_path,c.tags) as protected
    from public.flashcard_filtered_manager_cards(p_deck_id,p_subdeck_path,p_query,p_filters) c
  ), ranked as (
    select c.*, row_number() over (order by
      case when p_filters->>'sort' = 'newest' then c.created_at end desc nulls last,
      case when p_filters->>'sort' = 'due' then c.due_at end asc nulls last,
      case when p_filters->>'sort' = 'new-first' then c.revision <> 0 end asc nulls last,
      c.created_at,c.id) as position
    from matched c
  ), page_cards as (
    select * from ranked order by position
    limit (select page_size from paging) offset (select page_index * page_size from paging)
  )
  select jsonb_build_object(
    'cards', coalesce((select jsonb_agg(to_jsonb(c) - 'created_at' - 'position' - 'protected' order by c.position) from page_cards c),'[]'::jsonb),
    'total', count(*),
    'active', count(*) filter (where not suspended),
    'unsuspendable', count(*) filter (where suspended and not protected),
    'protected', count(*) filter (where protected)
  )
  from matched
$$;

create function public.flashcard_deck_spec_points(p_deck_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(points.tag order by points.tag),'[]'::jsonb)
  from (
    select distinct tag
    from public.flashcard_visible_cards c
    cross join lateral unnest(c.tags) as t(tag)
    where c.user_id = auth.uid() and c.deck_id = p_deck_id
      and ((starts_with(lower(tag),'spec::') and length(tag) > 6)
        or (starts_with(lower(tag),'ppp::spec::') and length(tag) > 11))
  ) points
$$;

create function public.flashcard_set_filtered_suspension(
  p_deck_id uuid, p_subdeck_path text, p_query text, p_filters jsonb, p_suspended boolean
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='28000'; end if;
  if p_deck_id is null or p_suspended is null then raise exception 'Invalid card action.' using errcode='22023'; end if;
  if not exists(select 1 from public.flashcard_decks d where d.id=p_deck_id and d.user_id=auth.uid()
      and (d.catalogue_id is null or (d.catalogue_active and public.flashcard_can_study_catalogue(d.catalogue_id)))) then
    raise exception 'Deck unavailable.' using errcode='42501';
  end if;

  with selected as materialized (
    select c.id, public.flashcard_protected_from_bulk_unsuspend(c.subdeck_path,c.tags) as protected
    from public.flashcard_filtered_manager_cards(p_deck_id,p_subdeck_path,p_query,p_filters) c
  ), changed as (
    update public.flashcard_cards c set suspended=p_suspended
      from selected s where c.id=s.id and c.user_id=auth.uid() and c.deck_id=p_deck_id
        and c.suspended is distinct from p_suspended and (p_suspended or not s.protected)
    returning c.id
  )
  select jsonb_build_object(
    'matched', count(*), 'changed', (select count(*) from changed),
    'excluded', count(*) filter (where not p_suspended and protected)
  ) into result
  from selected;
  return result;
end
$$;

revoke all on function public.flashcard_filtered_manager_cards(uuid,text,text,jsonb),
  public.flashcard_protected_from_bulk_unsuspend(text,text[]),
  public.flashcard_manage_cards(uuid,text,text,integer,integer,jsonb),
  public.flashcard_deck_spec_points(uuid),
  public.flashcard_set_filtered_suspension(uuid,text,text,jsonb,boolean) from public,anon;
grant execute on function public.flashcard_filtered_manager_cards(uuid,text,text,jsonb),
  public.flashcard_protected_from_bulk_unsuspend(text,text[]),
  public.flashcard_manage_cards(uuid,text,text,integer,integer,jsonb),
  public.flashcard_deck_spec_points(uuid),
  public.flashcard_set_filtered_suspension(uuid,text,text,jsonb,boolean) to authenticated;
