-- Site owners can use the published catalogue through the same entitlement checks
-- as verified school users. Removing ownership removes the owner-based access.
create or replace function public.flashcard_has_entitlement(p_user_id uuid,p_catalogue_id text) returns boolean
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select p_user_id is not null and (
    public.flashcard_school_eligible(p_user_id)
    or exists (select 1 from public.site_owners o where o.user_id=p_user_id)
    or exists (
      select 1 from public.flashcard_entitlements e where e.user_id=p_user_id and e.catalogue_id=p_catalogue_id
        and (e.expires_at is null or e.expires_at > now())
    )
  )
$$;

create or replace function public.flashcard_list_catalogue() returns jsonb
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select jsonb_build_object(
    'entries',coalesce(jsonb_agg(to_jsonb(c) order by c.subject_id,c.deck_type),'[]'::jsonb),
    -- The deployed client uses schoolEligible to enable the catalogue's Add deck button.
    'schoolEligible',public.flashcard_school_eligible(auth.uid()) or public.is_site_owner()
  )
  from public.flashcard_catalogue c
$$;
