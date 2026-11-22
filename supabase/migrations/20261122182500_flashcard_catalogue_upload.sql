-- Curators are assigned explicitly by the database administrator. A normal site
-- account has no ability to stage material or publish a release.
create table public.flashcard_catalogue_curators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.flashcard_catalogue_curators enable row level security;
revoke all on public.flashcard_catalogue_curators from public, anon, authenticated;
grant select, insert, delete on public.flashcard_catalogue_curators to service_role;

create function public.flashcard_ingest_catalogue_batch(p_version_id uuid, p_cards jsonb, p_media jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_catalogue text;
  v_media record;
  v_bytes bytea;
  v_existing bytea;
  v_inserted integer;
begin
  if not exists(select 1 from public.flashcard_catalogue_curators where user_id=auth.uid()) then
    raise exception 'This account cannot stage catalogue material.' using errcode='42501';
  end if;
  select catalogue_id into v_catalogue from public.flashcard_catalogue_versions
  where id=p_version_id and published_at is null for share;
  if not found then raise exception 'The draft catalogue version is unavailable.' using errcode='22023'; end if;
  if jsonb_typeof(p_cards) is distinct from 'array' or jsonb_typeof(p_media) is distinct from 'array'
     or jsonb_array_length(p_cards)>200 or jsonb_array_length(p_media)>20
     or octet_length(p_cards::text)+octet_length(p_media::text)>1500000 then
    raise exception 'Reduce the size of the staging batch.' using errcode='22023';
  end if;

  insert into public.flashcard_catalogue_items(catalogue_id,stable_key)
  select v_catalogue,r.stable_key from jsonb_to_recordset(p_cards) as r(stable_key text)
  on conflict (catalogue_id,stable_key) do nothing;

  insert into public.flashcard_catalogue_material(version_id,catalogue_id,catalogue_card_id,front,back,note_type,variant,tags,suspended,subdeck_path)
  select p_version_id,v_catalogue,i.id,r.front,r.back,r.note_type,r.variant,r.tags,r.suspended,r.subdeck_path
  from jsonb_to_recordset(p_cards) as r(stable_key text,front text,back text,note_type text,variant text,tags text[],suspended boolean,subdeck_path text)
  join public.flashcard_catalogue_items i on i.catalogue_id=v_catalogue and i.stable_key=r.stable_key
  on conflict (version_id,catalogue_card_id) do nothing;
  get diagnostics v_inserted=row_count;

  for v_media in select * from jsonb_to_recordset(p_media) as r(id uuid,mime_type text,position integer,base64 text) loop
    v_bytes:=decode(v_media.base64,'base64');
    if v_media.position is null or v_media.position<0 or octet_length(v_bytes) not between 1 and 260000 then
      raise exception 'Invalid media part.' using errcode='22023';
    end if;
    if v_media.position=0 then
      insert into public.flashcard_catalogue_media(id,catalogue_id,version_id,mime_type,data)
      values(v_media.id,v_catalogue,p_version_id,v_media.mime_type,v_bytes)
      on conflict (version_id,id) do nothing;
    end if;
    select data into v_existing from public.flashcard_catalogue_media
    where id=v_media.id and version_id=p_version_id and mime_type=v_media.mime_type for update;
    if not found or octet_length(v_existing)<v_media.position then
      raise exception 'A preceding media part is missing.' using errcode='22023';
    end if;
    if octet_length(v_existing)=v_media.position then
      update public.flashcard_catalogue_media set data=data||v_bytes where id=v_media.id and version_id=p_version_id;
    elsif substring(v_existing from v_media.position+1 for octet_length(v_bytes)) is distinct from v_bytes then
      raise exception 'A staged media part differs from this upload.' using errcode='22023';
    end if;
  end loop;
  return jsonb_build_object('inserted',v_inserted,'media_parts',jsonb_array_length(p_media));
end $$;
revoke all on function public.flashcard_ingest_catalogue_batch(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.flashcard_ingest_catalogue_batch(uuid,jsonb,jsonb) to authenticated,service_role;
