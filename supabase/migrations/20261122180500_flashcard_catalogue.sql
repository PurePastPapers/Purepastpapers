-- Only preview metadata is public. Card bodies remain in owner-controlled tables.
create table public.flashcard_catalogue (
  id text primary key,
  title text not null,
  subject_id text not null,
  exam_board text not null,
  qualification text not null,
  topic text not null,
  deck_type text not null check (deck_type in ('atomic','mark_scheme')),
  status text not null default 'coming_soon' check (status in ('coming_soon','published','retired')),
  current_version uuid,
  card_count integer not null default 0 check (card_count >= 0)
);
create table public.flashcard_catalogue_versions (
  id uuid primary key default gen_random_uuid(),
  catalogue_id text not null references public.flashcard_catalogue(id),
  version text not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique(catalogue_id,id), unique(catalogue_id,version)
);
alter table public.flashcard_catalogue add constraint catalogue_current_version_fk
  foreign key(id,current_version) references public.flashcard_catalogue_versions(catalogue_id,id);
create table public.flashcard_catalogue_items (
  id uuid primary key default gen_random_uuid(),
  catalogue_id text not null references public.flashcard_catalogue(id),
  stable_key text not null,
  unique(catalogue_id,id), unique(catalogue_id,stable_key)
);
create table public.flashcard_catalogue_material (
  version_id uuid not null,
  catalogue_id text not null,
  catalogue_card_id uuid not null,
  front text not null,
  back text not null,
  note_type text not null check(note_type in ('basic','reverse','cloze')),
  variant text not null,
  tags text[] not null default '{}',
  suspended boolean not null default false,
  subdeck_path text not null default '',
  primary key(version_id,catalogue_card_id),
  foreign key(catalogue_id,version_id) references public.flashcard_catalogue_versions(catalogue_id,id) on delete cascade,
  foreign key(catalogue_id,catalogue_card_id) references public.flashcard_catalogue_items(catalogue_id,id)
);
create table public.flashcard_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  catalogue_id text not null references public.flashcard_catalogue(id),
  source text not null,
  expires_at timestamptz,
  primary key(user_id,catalogue_id,source)
);
alter table public.flashcard_decks add column catalogue_id text references public.flashcard_catalogue(id);
alter table public.flashcard_decks add column catalogue_active boolean not null default true;
create unique index flashcard_deck_catalogue_owner on public.flashcard_decks(user_id,catalogue_id) where catalogue_id is not null;
alter table public.flashcard_cards add column catalogue_card_id uuid references public.flashcard_catalogue_items(id);
create unique index flashcard_card_catalogue_owner on public.flashcard_cards(user_id,catalogue_card_id) where catalogue_card_id is not null;

create or replace function public.flashcard_school_eligible(p_user_id uuid) returns boolean
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null
    and lower(split_part(u.email,'@',2))='reachfree.co.uk' and array_length(string_to_array(u.email,'@'),1)=2)
$$;
revoke all on function public.flashcard_school_eligible(uuid) from public,anon,authenticated;
grant execute on function public.flashcard_school_eligible(uuid) to service_role;

create or replace function public.flashcard_has_entitlement(p_user_id uuid,p_catalogue_id text) returns boolean
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select p_user_id is not null and (
    public.flashcard_school_eligible(p_user_id) or exists (
      select 1 from public.flashcard_entitlements e where e.user_id=p_user_id and e.catalogue_id=p_catalogue_id
        and (e.expires_at is null or e.expires_at > now())
    )
  )
$$;
revoke all on function public.flashcard_has_entitlement(uuid,text) from public,anon,authenticated;
grant execute on function public.flashcard_has_entitlement(uuid,text) to service_role;

alter table public.flashcard_catalogue enable row level security;
alter table public.flashcard_catalogue_versions enable row level security;
alter table public.flashcard_catalogue_items enable row level security;
alter table public.flashcard_catalogue_material enable row level security;
alter table public.flashcard_entitlements enable row level security;
revoke all on public.flashcard_catalogue,public.flashcard_catalogue_versions,public.flashcard_catalogue_items,
 public.flashcard_catalogue_material,public.flashcard_entitlements from public,anon,authenticated;
grant select on public.flashcard_catalogue to authenticated;
create policy catalogue_preview on public.flashcard_catalogue for select to authenticated using (true);

-- This function never returns material unless current verified eligibility holds.
create or replace function public.flashcard_catalogue_content()
returns table(catalogue_card_id uuid,front text,back text,note_type text,variant text,tags text[])
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select m.catalogue_card_id,m.front,m.back,m.note_type,m.variant,m.tags
  from public.flashcard_catalogue_material m
  join public.flashcard_catalogue c on c.id=m.catalogue_id and c.current_version=m.version_id
  where c.status='published' and public.flashcard_has_entitlement(auth.uid(),c.id)
$$;
revoke all on function public.flashcard_catalogue_content() from public,anon;
grant execute on function public.flashcard_catalogue_content() to authenticated;

create or replace function public.flashcard_list_catalogue() returns jsonb
language sql stable security definer set search_path=public,auth,pg_temp as $$
 select jsonb_build_object('entries',coalesce(jsonb_agg(to_jsonb(c) order by c.subject_id,c.deck_type),'[]'::jsonb),
   'schoolEligible',public.flashcard_school_eligible(auth.uid())) from public.flashcard_catalogue c
$$;
revoke all on function public.flashcard_list_catalogue() from public,anon;
grant execute on function public.flashcard_list_catalogue() to authenticated;

create or replace function public.flashcard_can_study_card(p_user_id uuid,p_card_id uuid) returns boolean
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select exists(select 1 from public.flashcard_cards card
    join public.flashcard_decks d on d.id=card.deck_id and d.user_id=card.user_id
    where card.user_id=p_user_id and card.id=p_card_id and
      (card.catalogue_card_id is null and d.catalogue_id is null or
       card.catalogue_card_id is not null and d.catalogue_id is not null and d.catalogue_active
       and public.flashcard_has_entitlement(p_user_id,d.catalogue_id)
       and exists(select 1 from public.flashcard_catalogue c join public.flashcard_catalogue_material m
         on m.version_id=c.current_version and m.catalogue_id=c.id
         where c.id=d.catalogue_id and c.status='published' and m.catalogue_card_id=card.catalogue_card_id)))
$$;
revoke all on function public.flashcard_can_study_card(uuid,uuid) from public,anon,authenticated;
grant execute on function public.flashcard_can_study_card(uuid,uuid) to service_role;

create or replace function public.flashcard_add_catalogue_deck(p_catalogue_id text) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_user uuid:=auth.uid(); v_catalogue public.flashcard_catalogue%rowtype; v_deck uuid;
  v_item record; v_note uuid;
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('flashcard-catalogue:'||v_user::text||':'||p_catalogue_id,0));
  select * into v_catalogue from public.flashcard_catalogue where id=p_catalogue_id and status='published' and current_version is not null;
  if not found or not public.flashcard_has_entitlement(v_user,p_catalogue_id) then
    return jsonb_build_object('status','unavailable');
  end if;
  insert into public.flashcard_decks(user_id,title,catalogue_id)
    values(v_user,v_catalogue.title,p_catalogue_id)
    on conflict(user_id,catalogue_id) where catalogue_id is not null do update set catalogue_active=true
    returning id into v_deck;
  for v_item in select i.id,m.note_type,m.variant,m.suspended from public.flashcard_catalogue_items i
    join public.flashcard_catalogue_material m on m.catalogue_card_id=i.id and m.catalogue_id=i.catalogue_id
    where i.catalogue_id=p_catalogue_id and m.version_id=v_catalogue.current_version loop
    if not exists(select 1 from public.flashcard_cards where user_id=v_user and catalogue_card_id=v_item.id) then
      insert into public.flashcard_notes(user_id,note_type,front,back) values(v_user,v_item.note_type,'','') returning id into v_note;
      insert into public.flashcard_cards(user_id,note_id,deck_id,variant,catalogue_card_id,suspended)
        values(v_user,v_note,v_deck,v_item.variant,v_item.id,v_item.suspended);
    end if;
  end loop;
  return jsonb_build_object('status','added','deck_id',v_deck);
end $$;
revoke all on function public.flashcard_add_catalogue_deck(text) from public,anon;
grant execute on function public.flashcard_add_catalogue_deck(text) to authenticated;

insert into public.flashcard_catalogue(id,title,subject_id,exam_board,qualification,topic,deck_type) values
 ('EDX_ALEVEL_BIOL_9BN0_ATOMIC','A-level Biology Atomic','EDX_ALEVEL_BIOL_9BN0','Edexcel','A-level 9BN0','All topics','atomic'),
 ('EDX_ALEVEL_BIOL_9BN0_MARK','A-level Biology Mark scheme','EDX_ALEVEL_BIOL_9BN0','Edexcel','A-level 9BN0','All topics','mark_scheme'),
 ('EDX_ALEVEL_PHYS_9PH0_ATOMIC','A-level Physics Atomic','EDX_ALEVEL_PHYS_9PH0','Edexcel','A-level 9PH0','All topics','atomic'),
 ('EDX_ALEVEL_PHYS_9PH0_MARK','A-level Physics Mark scheme','EDX_ALEVEL_PHYS_9PH0','Edexcel','A-level 9PH0','All topics','mark_scheme'),
 ('EDX_AS_MATH_8MA0_ATOMIC','AS Pure Maths Atomic','EDX_ALEVEL_MATH_9MA0','Edexcel','AS 8MA0','Pure Maths','atomic'),
 ('EDX_AS_MATH_8MA0_MARK','AS Pure Maths Mark scheme','EDX_ALEVEL_MATH_9MA0','Edexcel','AS 8MA0','Pure Maths','mark_scheme');

create table public.flashcard_catalogue_media (
  id uuid not null,
  catalogue_id text not null,
  version_id uuid not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/gif','image/webp','audio/mpeg','audio/ogg','audio/wav','audio/mp4')),
  data bytea not null check (octet_length(data) between 1 and 10485760),
  primary key(version_id,id),
  foreign key(catalogue_id,version_id) references public.flashcard_catalogue_versions(catalogue_id,id) on delete cascade
);
alter table public.flashcard_catalogue_media enable row level security;
revoke all on public.flashcard_catalogue_media from public,anon,authenticated;
create or replace function public.flashcard_catalogue_media_content(p_id uuid)
returns table(id uuid,data bytea,mime_type text)
language sql stable security definer set search_path=public,auth,pg_temp as $$
 select m.id,m.data,m.mime_type from public.flashcard_catalogue_media m
 join public.flashcard_catalogue c on c.id=m.catalogue_id and c.current_version=m.version_id
 where c.status='published' and m.id=p_id and public.flashcard_has_entitlement(auth.uid(),c.id)
$$;
revoke all on function public.flashcard_catalogue_media_content(uuid) from public,anon;
grant execute on function public.flashcard_catalogue_media_content(uuid) to authenticated;

create or replace function public.flashcard_can_study_catalogue(p_catalogue_id text) returns boolean
language sql stable security definer set search_path=public,auth,pg_temp as $$
 select exists(select 1 from public.flashcard_catalogue c
   where c.id=p_catalogue_id and c.status='published' and c.current_version is not null
     and public.flashcard_has_entitlement(auth.uid(),c.id))
$$;
revoke all on function public.flashcard_can_study_catalogue(text) from public,anon;
grant execute on function public.flashcard_can_study_catalogue(text) to authenticated;

create or replace function public.flashcard_unsubscribe_catalogue(p_catalogue_id text) returns boolean
language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  update public.flashcard_decks set catalogue_active=false where user_id=auth.uid() and catalogue_id=p_catalogue_id;
  return found;
end $$;
revoke all on function public.flashcard_unsubscribe_catalogue(text) from public,anon;
grant execute on function public.flashcard_unsubscribe_catalogue(text) to authenticated;

-- Direct writes by students cannot alter official identity or content.
create or replace function public.flashcard_protect_catalogue_deck() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user='authenticated' then
    if tg_op='INSERT' and new.catalogue_id is not null then raise exception 'Official decks are read-only.' using errcode='42501'; end if;
    if tg_op='DELETE' and old.catalogue_id is not null then raise exception 'Use unsubscribe for official decks.' using errcode='42501'; end if;
    if tg_op <> 'DELETE' and new.parent_id is not null then
      perform pg_advisory_xact_lock(hashtextextended('flashcard-deck-tree:' || new.user_id::text,0));
      if exists(with recursive ancestors as (
        select d.id,d.parent_id,d.catalogue_id from public.flashcard_decks d where d.user_id=new.user_id and d.id=new.parent_id
        union select d.id,d.parent_id,d.catalogue_id from public.flashcard_decks d join ancestors a on d.id=a.parent_id where d.user_id=new.user_id
      ) select 1 from ancestors where id=new.id or catalogue_id is not null) then
        raise exception 'Invalid deck parent.' using errcode='22023';
      end if;
    end if;
    if tg_op='UPDATE' and (old.user_id is distinct from new.user_id or old.id is distinct from new.id or old.catalogue_id is distinct from new.catalogue_id or
        old.catalogue_id is not null and (old.title is distinct from new.title or old.parent_id is distinct from new.parent_id)) then
      raise exception 'Official decks are read-only.' using errcode='42501';
    end if;
  end if;
  return coalesce(new,old);
end $$;
create trigger flashcard_protect_catalogue_deck before insert or update or delete on public.flashcard_decks
for each row execute function public.flashcard_protect_catalogue_deck();

create or replace function public.flashcard_protect_catalogue_card() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user='authenticated' then
    if tg_op='UPDATE' and old.catalogue_card_id is not null then
      if (new.id,new.user_id,new.note_id,new.deck_id,new.variant,new.source_key,new.import_id,new.created_at,new.catalogue_card_id)
         is not distinct from
         (old.id,old.user_id,old.note_id,old.deck_id,old.variant,old.source_key,old.import_id,old.created_at,old.catalogue_card_id) then
        return new;
      end if;
      raise exception 'Official cards are read-only.' using errcode='42501';
    end if;
    if tg_op='DELETE' and old.catalogue_card_id is not null then
      raise exception 'Official cards are read-only.' using errcode='42501';
    end if;
    if tg_op <> 'DELETE' and (new.catalogue_card_id is not null
      or exists(select 1 from public.flashcard_decks d where d.id=new.deck_id and d.user_id=new.user_id and d.catalogue_id is not null)
      or exists(select 1 from public.flashcard_cards c where c.note_id=new.note_id and c.user_id=new.user_id and c.catalogue_card_id is not null)) then
      raise exception 'Official cards are read-only.' using errcode='42501';
    end if;
  end if;
  return coalesce(new,old);
end $$;
create trigger flashcard_protect_catalogue_card before insert or update or delete on public.flashcard_cards
for each row execute function public.flashcard_protect_catalogue_card();

create or replace function public.flashcard_protect_catalogue_note() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user='authenticated' and exists(select 1 from public.flashcard_cards c where c.user_id=old.user_id and c.note_id=old.id and c.catalogue_card_id is not null) then
    raise exception 'Official notes are read-only.' using errcode='42501';
  end if;
  return coalesce(new,old);
end $$;
create trigger flashcard_protect_catalogue_note before update or delete on public.flashcard_notes
for each row execute function public.flashcard_protect_catalogue_note();

create or replace function public.flashcard_delete_deck(p_deck_id uuid) returns boolean
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_user uuid:=auth.uid(); v_parent uuid;
begin
  select parent_id into v_parent from public.flashcard_decks where id=p_deck_id and user_id=v_user and catalogue_id is null for update;
  if not found then return false; end if;
  update public.flashcard_decks set parent_id=v_parent where user_id=v_user and parent_id=p_deck_id;
  delete from public.flashcard_decks where user_id=v_user and id=p_deck_id;
  delete from public.flashcard_notes n where n.user_id=v_user and not exists(select 1 from public.flashcard_cards c where c.user_id=n.user_id and c.note_id=n.id);
  return true;
end $$;
revoke all on function public.flashcard_delete_deck(uuid) from public,anon;
grant execute on function public.flashcard_delete_deck(uuid) to authenticated;

create or replace function public.flashcard_delete_card(p_card_id uuid) returns boolean
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_user uuid:=auth.uid(); v_note uuid;
begin
  delete from public.flashcard_cards where id=p_card_id and user_id=v_user and catalogue_card_id is null returning note_id into v_note;
  if not found then return false; end if;
  delete from public.flashcard_notes where id=v_note and user_id=v_user and not exists(select 1 from public.flashcard_cards where user_id=v_user and note_id=v_note);
  return true;
end $$;
revoke all on function public.flashcard_delete_card(uuid) from public,anon;
grant execute on function public.flashcard_delete_card(uuid) to authenticated;

create or replace function public.flashcard_cancel_import() returns boolean
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required.' using errcode='28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('flashcard-import:'||v_user::text,0));
  delete from public.flashcard_imports where user_id=v_user and status='staging';
  return true;
end $$;
revoke all on function public.flashcard_cancel_import() from public,anon;
grant execute on function public.flashcard_cancel_import() to authenticated;

-- Administrative ingest stages versions, items, material and media using the
-- service role. Publication is a single version-pointer switch after validation.
grant select, insert, update, delete on public.flashcard_catalogue,public.flashcard_catalogue_versions,
  public.flashcard_catalogue_items,public.flashcard_catalogue_material,public.flashcard_catalogue_media to service_role;
create or replace function public.flashcard_publish_catalogue(
  p_catalogue_id text,p_version_id uuid,p_subject_id text,p_qualification text,p_deck_type text,p_expected_count integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_entry public.flashcard_catalogue%rowtype; v_count integer;
begin
  select * into v_entry from public.flashcard_catalogue where id=p_catalogue_id for update;
  if not found or v_entry.subject_id is distinct from p_subject_id or v_entry.qualification is distinct from p_qualification
     or v_entry.deck_type is distinct from p_deck_type or p_expected_count is null or p_expected_count < 1
     or not exists(select 1 from public.flashcard_catalogue_versions v where v.id=p_version_id and v.catalogue_id=p_catalogue_id) then
    raise exception 'Catalogue metadata mismatch.' using errcode='22023';
  end if;
  select count(*) into v_count from public.flashcard_catalogue_material m
    join public.flashcard_catalogue_items i on i.id=m.catalogue_card_id and i.catalogue_id=m.catalogue_id
    where m.catalogue_id=p_catalogue_id and m.version_id=p_version_id
      and length(trim(i.stable_key)) > 0 and length(trim(m.front)) > 0
      and length(trim(m.variant)) > 0 and octet_length(m.front) <= 250000 and octet_length(m.back) <= 250000;
  if v_count <> p_expected_count or v_count <> (select count(*) from public.flashcard_catalogue_material where catalogue_id=p_catalogue_id and version_id=p_version_id) then
    raise exception 'Catalogue count or card validation failed.' using errcode='22023';
  end if;
  update public.flashcard_catalogue_versions set published_at=coalesce(published_at,now()) where id=p_version_id;
  update public.flashcard_catalogue set current_version=p_version_id,status='published',card_count=v_count where id=p_catalogue_id;
  return jsonb_build_object('status','published','card_count',v_count);
end $$;
revoke all on function public.flashcard_publish_catalogue(text,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.flashcard_publish_catalogue(text,uuid,text,text,text,integer) to service_role;

-- Published revisions are immutable. Stage corrections in another version.
create or replace function public.flashcard_catalogue_immutable_material() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_version uuid;
begin
  if tg_op <> 'INSERT' then
    v_version := old.version_id;
    if exists(select 1 from public.flashcard_catalogue_versions where id=v_version and published_at is not null) then
      raise exception 'Published catalogue versions are immutable.' using errcode='42501';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    v_version := new.version_id;
    if exists(select 1 from public.flashcard_catalogue_versions where id=v_version and published_at is not null) then
      raise exception 'Published catalogue versions are immutable.' using errcode='42501';
    end if;
  end if;
  return coalesce(new,old);
end $$;
create trigger flashcard_catalogue_immutable_material before insert or update or delete on public.flashcard_catalogue_material
for each row execute function public.flashcard_catalogue_immutable_material();
create trigger flashcard_catalogue_immutable_media before insert or update or delete on public.flashcard_catalogue_media
for each row execute function public.flashcard_catalogue_immutable_material();
revoke update,delete on public.flashcard_catalogue from service_role;
create or replace function public.flashcard_catalogue_immutable_version() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.published_at is not null and (tg_op='DELETE' or new is distinct from old) then
    raise exception 'Published catalogue versions are immutable.' using errcode='42501';
  end if;
  return coalesce(new,old);
end $$;
create trigger flashcard_catalogue_immutable_version before update or delete on public.flashcard_catalogue_versions
for each row execute function public.flashcard_catalogue_immutable_version();
create or replace function public.flashcard_catalogue_immutable_item() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.flashcard_catalogue_material m join public.flashcard_catalogue_versions v on v.id=m.version_id
      where m.catalogue_card_id=old.id and v.published_at is not null) then
    raise exception 'Published catalogue identities are immutable.' using errcode='42501';
  end if;
  return coalesce(new,old);
end $$;
create trigger flashcard_catalogue_immutable_item before update or delete on public.flashcard_catalogue_items
for each row execute function public.flashcard_catalogue_immutable_item();
