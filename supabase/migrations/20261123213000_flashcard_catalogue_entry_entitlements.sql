-- Show the existing per-deck entitlement in the catalogue without exposing material.
create or replace function public.flashcard_list_catalogue() returns jsonb
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select jsonb_build_object(
    'entries', coalesce(jsonb_agg(
      to_jsonb(c) || jsonb_build_object('entitled', public.flashcard_has_entitlement(auth.uid(),c.id))
      order by c.subject_id,c.deck_type
    ), '[]'::jsonb),
    'schoolEligible', public.flashcard_school_eligible(auth.uid()) or public.is_site_owner()
  )
  from public.flashcard_catalogue c
$$;
