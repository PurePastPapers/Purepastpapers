-- Sync new catalogue versions and return the updated summary in one request.
create function public.flashcard_open_decks() returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.flashcard_sync_catalogue_decks();
  return public.flashcard_list_decks();
end;
$$;

-- Page deck management reads while keeping the existing visible-card RLS.
create function public.flashcard_manage_cards(
  p_deck_id uuid, p_subdeck_path text, p_query text, p_page integer, p_page_size integer
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with paging as (
    select least(100, greatest(1, coalesce(p_page_size, 30))) as page_size,
      greatest(1, coalesce(p_page, 1))::bigint - 1 as page_index
  ), matched as materialized (
    select c.id,c.note_id,c.deck_id,c.variant,c.suspended,c.type,c.front,c.back,c.tags,
      c.revision,c.state,c.due_at,c.subdeck_path,c.created_at
    from public.flashcard_visible_cards c
    where c.user_id = auth.uid() and c.deck_id = p_deck_id
      and (nullif(p_subdeck_path,'') is null or c.subdeck_path = p_subdeck_path
        or starts_with(c.subdeck_path,p_subdeck_path || '::'))
      and (nullif(p_query,'') is null or strpos(
        lower(c.front || ' ' || c.back || ' ' || coalesce(array_to_string(c.tags,' '),'')),
        lower(p_query)
      ) > 0)
  ), page_cards as (
    select * from matched order by created_at,id
    limit (select page_size from paging) offset (select page_index * page_size from paging)
  )
  select jsonb_build_object(
    'cards', coalesce((select jsonb_agg(to_jsonb(c) - 'created_at' order by c.created_at,c.id) from page_cards c),'[]'::jsonb),
    'total', (select count(*) from matched)
  )
$$;

-- Summarize stored topic paths and their ancestors without returning card text.
create function public.flashcard_deck_topics(p_deck_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with paths as (
    select array_remove(string_to_array(c.subdeck_path,'::'),'') as parts,
      count(*) as total, count(*) filter (where c.suspended) as suspended
    from public.flashcard_visible_cards c
    where c.user_id = auth.uid() and c.deck_id = p_deck_id and c.subdeck_path <> ''
    group by c.subdeck_path
  ), topics as (
    select array_to_string(p.parts[1:d.depth],'::') as path,
      sum(p.total) as total, sum(p.suspended) as suspended
    from paths p cross join lateral generate_subscripts(p.parts,1) d(depth)
    group by 1
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by t.path),'[]'::jsonb)
  from topics t
$$;

revoke all on function public.flashcard_open_decks(),
  public.flashcard_manage_cards(uuid,text,text,integer,integer),
  public.flashcard_deck_topics(uuid) from public,anon;
grant execute on function public.flashcard_open_decks(),
  public.flashcard_manage_cards(uuid,text,text,integer,integer),
  public.flashcard_deck_topics(uuid) to authenticated;
