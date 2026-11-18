-- Accounts allowed to open the Content Studio.
-- Add or remove an owner in the Supabase dashboard (Table editor → site_owners) or with:
--   insert into public.site_owners (user_id) select id from auth.users where email = '...';
create table public.site_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.site_owners enable row level security;

-- Nobody edits this list from the browser.
revoke all on table public.site_owners from anon, authenticated;
grant select on table public.site_owners to authenticated;

create policy "Users can see whether they are an owner"
  on public.site_owners
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- True when the signed-in account is a site owner. Use it in RLS policies on any future studio tables.
create or replace function public.is_site_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.site_owners where user_id = (select auth.uid()));
$$;

revoke all on function public.is_site_owner() from public, anon;
grant execute on function public.is_site_owner() to authenticated;
