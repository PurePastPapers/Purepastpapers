-- "Which cards do you want?" for PurePastPapers sets. The browser maps each card's
-- spec tags to the student's ticked spec points and sends the tags to keep. Cards
-- outside the choice are suspended, so review history is never lost.

-- Distinct spec-tag combinations in a deck with their card counts. The browser uses
-- these to count cards for any choice without loading every card.
create function public.flashcard_deck_spec_sets(p_deck_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tags', to_jsonb(x.spec), 'cards', x.cards, 'active', x.active, 'optional', x.protected
  ) order by x.spec, x.protected), '[]'::jsonb)
  from (
    select y.spec, y.protected, count(*) as cards, count(*) filter (where not y.suspended) as active
    from (
      select array(select t from unnest(coalesce(c.tags, '{}'::text[])) as u(t) where t ~* '^(ppp::)?spec::' order by t) as spec,
        public.flashcard_protected_from_bulk_unsuspend(c.subdeck_path, c.tags) as protected,
        c.suspended
      from public.flashcard_visible_cards c
      where c.user_id = auth.uid() and c.deck_id = p_deck_id
    ) y
    group by y.spec, y.protected
  ) x
$$;

-- p_mapped: every spec tag the browser understood. p_allowed: the tags to keep.
-- A card is kept when all of its understood tags are allowed. Cards with no
-- understood tag (exam skills) follow p_include_general. A null p_mapped keeps
-- every card, including optional and archived ones; otherwise those stay out.
create function public.flashcard_apply_spec_selection(
  p_deck_id uuid, p_mapped text[], p_allowed text[], p_include_general boolean
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  if p_deck_id is null or p_include_general is null then raise exception 'Invalid card action.' using errcode = '22023'; end if;
  if not exists(select 1 from public.flashcard_decks d where d.id = p_deck_id and d.user_id = auth.uid()
      and (d.catalogue_id is null or (d.catalogue_active and public.flashcard_can_study_catalogue(d.catalogue_id)))) then
    raise exception 'Deck unavailable.' using errcode = '42501';
  end if;

  with cards as materialized (
    select c.id,
      array(select t from unnest(coalesce(c.tags, '{}'::text[])) as u(t) where t = any(coalesce(p_mapped, '{}'::text[]))) as known,
      public.flashcard_protected_from_bulk_unsuspend(c.subdeck_path, c.tags) as protected
    from public.flashcard_visible_cards c
    where c.user_id = auth.uid() and c.deck_id = p_deck_id
  ), wanted as materialized (
    select id, case
      when p_mapped is null then true
      when protected then false
      when cardinality(known) = 0 then p_include_general
      else known <@ coalesce(p_allowed, '{}'::text[])
    end as keep
    from cards
  ), changed as (
    update public.flashcard_cards c set suspended = not w.keep
      from wanted w
      where c.id = w.id and c.user_id = auth.uid() and c.deck_id = p_deck_id and c.suspended is distinct from (not w.keep)
    returning c.id
  )
  select jsonb_build_object(
    'total', count(*), 'active', count(*) filter (where keep), 'changed', (select count(*) from changed)
  ) into result
  from wanted;
  return result;
end
$$;

revoke all on function public.flashcard_deck_spec_sets(uuid),
  public.flashcard_apply_spec_selection(uuid, text[], text[], boolean) from public, anon;
grant execute on function public.flashcard_deck_spec_sets(uuid),
  public.flashcard_apply_spec_selection(uuid, text[], text[], boolean) to authenticated;
