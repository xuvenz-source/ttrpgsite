-- STAGING ONLY: universal sheet-grid inventory collaboration.
-- Do not execute until the designer approves a coordinated production release.
-- Existing Supabase Free plan, no hourly services or database test branches.

create table if not exists public.campaign_sheet_item_leases(
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 source_type text not null check(source_type in ('character','npc_template','npc_token')),
 source_id uuid not null,
 field_id text not null check(field_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 item_id uuid not null,
 holder_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null,
 primary key(campaign_id,source_type,source_id,field_id,item_id)
);
create index if not exists campaign_sheet_item_leases_expiry
 on public.campaign_sheet_item_leases(expires_at);
alter table public.campaign_sheet_item_leases enable row level security;
revoke all on public.campaign_sheet_item_leases from anon,authenticated;
grant select on public.campaign_sheet_item_leases to authenticated;
create policy "sheet owners and DMs see temporary item claims"
 on public.campaign_sheet_item_leases for select to authenticated
 using (
  public.is_campaign_dm(campaign_id) or
  (source_type='character' and exists(
   select 1 from public.characters c where c.id=source_id
   and c.campaign_id=public.campaign_sheet_item_leases.campaign_id
   and c.user_id=(select auth.uid())
  ))
 );

-- Internal authorization helper: all source identities are scoped to the
-- requested campaign, and NPC sheets are strictly DM-only.
create or replace function public.can_edit_campaign_sheet(
 p_campaign uuid,p_source text,p_source_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $acl$
declare actor uuid;
begin
 actor:=auth.uid();
 if actor is null or p_campaign is null or p_source_id is null then return false;end if;
 if p_source='character' then
  return exists(select 1 from public.characters c
   where c.id=p_source_id and c.campaign_id=p_campaign
    and (c.user_id=actor or public.is_campaign_dm(p_campaign)));
 elsif p_source='npc_template' then
  return public.is_campaign_dm(p_campaign) and exists(
   select 1 from public.npc_templates n where n.id=p_source_id
    and n.campaign_id=p_campaign);
 elsif p_source='npc_token' then
  return public.is_campaign_dm(p_campaign) and exists(
   select 1 from public.map_tokens t where t.id=p_source_id
    and t.campaign_id=p_campaign and t.character_id is null
    and t.owner_id is null);
 end if;
 return false;
end $acl$;
revoke all on function public.can_edit_campaign_sheet(uuid,text,uuid)
 from public,anon,authenticated;

-- Only real Inventory field identifiers in the campaign's template qualify.
create or replace function public.can_edit_campaign_sheet_inventory(
 p_campaign uuid,p_source text,p_source_id uuid,p_field text)
returns boolean language sql stable security definer set search_path='' as $acl$
 select public.can_edit_campaign_sheet(p_campaign,p_source,p_source_id)
 and exists(
  select 1 from public.campaigns c
  cross join lateral jsonb_array_elements(
   coalesce(c.sheet_template->'tabs','[]'::jsonb)) as tab(value)
  cross join lateral jsonb_array_elements(
   coalesce(tab.value->'fields','[]'::jsonb)) as fld(value)
  where c.id=p_campaign and fld.value->>'type'='inventory'
   and fld.value->>'id'=p_field
 );
$acl$;
revoke all on function public.can_edit_campaign_sheet_inventory(uuid,text,uuid,text)
 from public,anon,authenticated;

-- Fetch and lazily add durable item UUIDs once. This avoids shifting indexes
-- when players add, delete or move different objects concurrently.
create or replace function public.get_campaign_sheet_inventory(
 p_campaign uuid,p_source text,p_source_id uuid,p_field text)
returns jsonb language plpgsql security definer set search_path='' as $get$
declare values jsonb;items jsonb;normalized jsonb;entry jsonb;dirty boolean:=false;
begin
 if not public.can_edit_campaign_sheet_inventory(p_campaign,p_source,p_source_id,p_field)
 then raise exception 'Sheet inventory unavailable';end if;
 if p_source='character' then
  select field_values into values from public.characters
   where id=p_source_id and campaign_id=p_campaign for update;
 elsif p_source='npc_template' then
  select field_values into values from public.npc_templates
   where id=p_source_id and campaign_id=p_campaign for update;
 else
  select npc_values into values from public.map_tokens
   where id=p_source_id and campaign_id=p_campaign for update;
 end if;
 items:=coalesce(values->p_field,'[]'::jsonb);
 if jsonb_typeof(items)<>'array' then raise exception 'Invalid inventory rows';end if;
 normalized:='[]'::jsonb;
 for entry in select value from jsonb_array_elements(items) loop
  if jsonb_typeof(entry)<>'object' then raise exception 'Invalid inventory item';end if;
  if coalesce(entry->>'_inventoryId','') !~
   '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
   entry:=entry || jsonb_build_object('_inventoryId',gen_random_uuid()::text);
   dirty:=true;
  end if;
  normalized:=normalized || jsonb_build_array(entry);
 end loop;
 if dirty then
  if p_source='character' then
   update public.characters set
    field_values=jsonb_set(coalesce(field_values,'{}'::jsonb),array[p_field],normalized,true)
   where id=p_source_id and campaign_id=p_campaign;
  elsif p_source='npc_template' then
   update public.npc_templates set
    field_values=jsonb_set(coalesce(field_values,'{}'::jsonb),array[p_field],normalized,true)
   where id=p_source_id and campaign_id=p_campaign;
  else
   update public.map_tokens set
    npc_values=jsonb_set(coalesce(npc_values,'{}'::jsonb),array[p_field],normalized,true)
   where id=p_source_id and campaign_id=p_campaign;
  end if;
 end if;
 return normalized;
end $get$;

create or replace function public.claim_campaign_sheet_item(
 p_campaign uuid,p_source text,p_source_id uuid,p_field text,p_item uuid,
 p_takeover boolean default false)
returns table(holder_id uuid,expires_at timestamptz)
language plpgsql security definer set search_path='' as $claim$
declare actor uuid;gm boolean;winner record;
begin
 actor:=auth.uid();
 if actor is null or p_item is null or not public.can_edit_campaign_sheet_inventory(
  p_campaign,p_source,p_source_id,p_field)
 then raise exception 'No access to this inventory';end if;
 gm:=public.is_campaign_dm(p_campaign);
 delete from public.campaign_sheet_item_leases
 where expires_at<=now() and campaign_id=p_campaign and
  source_type=p_source and source_id=p_source_id and field_id=p_field;
 if (select count(*) from public.campaign_sheet_item_leases
     where campaign_id=p_campaign and source_type=p_source
      and source_id=p_source_id and field_id=p_field)>=250 then
  raise exception 'Too many concurrent item claims';end if;
 insert into public.campaign_sheet_item_leases as l
  (campaign_id,source_type,source_id,field_id,item_id,holder_id,expires_at)
 values(p_campaign,p_source,p_source_id,p_field,p_item,actor,now()+interval '18 seconds')
 on conflict (campaign_id,source_type,source_id,field_id,item_id)
 do update set holder_id=excluded.holder_id,expires_at=excluded.expires_at
 where l.holder_id=actor or l.expires_at<=now() or (gm and p_takeover)
 returning l.holder_id,l.expires_at into winner;
 if not found then raise exception 'That item is in use by another player';end if;
 return query select winner.holder_id,winner.expires_at;
end $claim$;

create or replace function public.release_campaign_sheet_item(
 p_campaign uuid,p_source text,p_source_id uuid,p_field text,p_item uuid)
returns boolean language plpgsql security definer set search_path='' as $release$
begin
 if auth.uid() is null then return false;end if;
 delete from public.campaign_sheet_item_leases
 where campaign_id=p_campaign and source_type=p_source
 and source_id=p_source_id and field_id=p_field and item_id=p_item
 and holder_id=auth.uid();
 return found;
end $release$;

-- The server patches the one locked item within the latest sheet snapshot.
-- Separate objects can be edited concurrently without losing each other's
-- changes; no entire inventory JSON array comes from an untrusted client.
create or replace function public.mutate_campaign_sheet_item(
 p_campaign uuid,p_source text,p_source_id uuid,p_field text,
 p_item uuid,p_row jsonb,p_remove boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $mutate$
declare existing jsonb;items jsonb;next_rows jsonb:='[]'::jsonb;
 current_row jsonb;found_row boolean:=false;
begin
 if not public.can_edit_campaign_sheet_inventory(p_campaign,p_source,p_source_id,p_field)
 then raise exception 'No access to this inventory';end if;
 if not exists(select 1 from public.campaign_sheet_item_leases l
  where l.campaign_id=p_campaign and l.source_type=p_source
   and l.source_id=p_source_id and l.field_id=p_field and l.item_id=p_item
   and l.holder_id=auth.uid() and l.expires_at>now())
 then raise exception 'Item claim expired; select it again';end if;
 if not p_remove and (jsonb_typeof(p_row)<>'object'
  or p_row ? '_inventoryId' or octet_length(p_row::text)>4096)
 then raise exception 'Invalid inventory item';end if;
 if p_source='character' then
  select field_values into existing from public.characters
  where campaign_id=p_campaign and id=p_source_id for update;
 elsif p_source='npc_template' then
  select field_values into existing from public.npc_templates
  where campaign_id=p_campaign and id=p_source_id for update;
 else
  select npc_values into existing from public.map_tokens
  where campaign_id=p_campaign and id=p_source_id for update;
 end if;
 items:=coalesce(existing->p_field,'[]'::jsonb);
 if jsonb_typeof(items)<>'array' then raise exception 'Invalid inventory rows';end if;
 for current_row in select value from jsonb_array_elements(items) loop
  if current_row->>'_inventoryId'=p_item::text then
   if found_row then raise exception 'Duplicate item identifier';end if;
   found_row:=true;
   if not p_remove then
    next_rows:=next_rows || jsonb_build_array(
     p_row || jsonb_build_object('_inventoryId',p_item::text));
   end if;
  else next_rows:=next_rows || jsonb_build_array(current_row);end if;
 end loop;
 if p_remove and not found_row then raise exception 'Item no longer exists';end if;
 if not p_remove and not found_row then
  if jsonb_array_length(items)>=250 then raise exception 'Inventory has 250 items';end if;
  next_rows:=next_rows || jsonb_build_array(
   p_row || jsonb_build_object('_inventoryId',p_item::text));
 end if;
 if p_source='character' then
  update public.characters set
   field_values=jsonb_set(coalesce(field_values,'{}'::jsonb),array[p_field],next_rows,true)
  where campaign_id=p_campaign and id=p_source_id;
 elsif p_source='npc_template' then
  update public.npc_templates set
   field_values=jsonb_set(coalesce(field_values,'{}'::jsonb),array[p_field],next_rows,true)
  where campaign_id=p_campaign and id=p_source_id;
 else
  update public.map_tokens set
   npc_values=jsonb_set(coalesce(npc_values,'{}'::jsonb),array[p_field],next_rows,true)
  where campaign_id=p_campaign and id=p_source_id;
 end if;
 return next_rows;
end $mutate$;

-- Auto-save for regular character and NPC fields merges into the latest
-- server snapshot while EXCLUDING inventory fields (owned by the item RPC).
-- This is required to stop editing HP from restoring a stale inventory array.
create or replace function public.patch_campaign_sheet_noninventory(
 p_campaign uuid,p_source text,p_source_id uuid,p_values jsonb,p_meta jsonb)
returns jsonb language plpgsql security definer set search_path='' as $patch$
declare inventory_fields text[];filtered jsonb;updated jsonb;
begin
 if not public.can_edit_campaign_sheet(p_campaign,p_source,p_source_id)
 then raise exception 'No permission to update sheet';end if;
 if jsonb_typeof(p_values)<>'object' or octet_length(p_values::text)>1000000
  or jsonb_typeof(p_meta)<>'object' or octet_length(p_meta::text)>4096
 then raise exception 'Invalid sheet update';end if;
 select coalesce(array_agg(f.value->>'id'),'{}'::text[]) into inventory_fields
 from public.campaigns c
 cross join lateral jsonb_array_elements(coalesce(c.sheet_template->'tabs','[]'::jsonb)) as t(value)
 cross join lateral jsonb_array_elements(coalesce(t.value->'fields','[]'::jsonb)) as f(value)
 where c.id=p_campaign and f.value->>'type'='inventory';
 filtered:=p_values-inventory_fields;
 if p_source='character' then
  update public.characters as c set
   field_values=coalesce(field_values,'{}'::jsonb)||filtered,
   name=coalesce(p_meta->>'name',name),
   portrait_path=case when p_meta?'portrait_path' then p_meta->>'portrait_path' else portrait_path end,
   token_path=case when p_meta?'token_path' then p_meta->>'token_path' else token_path end
  where campaign_id=p_campaign and id=p_source_id returning to_jsonb(c) into updated;
 elsif p_source='npc_template' then
  update public.npc_templates as n set
   field_values=coalesce(field_values,'{}'::jsonb)||filtered,
   name=coalesce(p_meta->>'name',name),
   portrait_path=case when p_meta?'portrait_path' then p_meta->>'portrait_path' else portrait_path end,
   token_path=case when p_meta?'token_path' then p_meta->>'token_path' else token_path end,
   npc_bars_public=case when p_meta?'bars_public'
    then (p_meta->>'bars_public')::boolean else npc_bars_public end
  where campaign_id=p_campaign and id=p_source_id returning to_jsonb(n) into updated;
 else
  update public.map_tokens as t set
   npc_values=coalesce(npc_values,'{}'::jsonb)||filtered,
   name=coalesce(p_meta->>'name',name),
   image_path=case when p_meta?'token_path' then p_meta->>'token_path' else image_path end,
   npc_bars_public=case when p_meta?'bars_public'
    then (p_meta->>'bars_public')::boolean else npc_bars_public end
  where campaign_id=p_campaign and id=p_source_id returning to_jsonb(t) into updated;
 end if;
 if updated is null then raise exception 'Sheet no longer exists';end if;
 return updated;
end $patch$;

revoke all on function public.get_campaign_sheet_inventory(uuid,text,uuid,text)
 from public,anon,authenticated;
revoke all on function public.claim_campaign_sheet_item(uuid,text,uuid,text,uuid,boolean)
 from public,anon,authenticated;
revoke all on function public.release_campaign_sheet_item(uuid,text,uuid,text,uuid)
 from public,anon,authenticated;
revoke all on function public.mutate_campaign_sheet_item(uuid,text,uuid,text,uuid,jsonb,boolean)
 from public,anon,authenticated;
revoke all on function public.patch_campaign_sheet_noninventory(uuid,text,uuid,jsonb,jsonb)
 from public,anon,authenticated;
grant execute on function public.get_campaign_sheet_inventory(uuid,text,uuid,text) to authenticated;
grant execute on function public.claim_campaign_sheet_item(uuid,text,uuid,text,uuid,boolean) to authenticated;
grant execute on function public.release_campaign_sheet_item(uuid,text,uuid,text,uuid) to authenticated;
grant execute on function public.mutate_campaign_sheet_item(uuid,text,uuid,text,uuid,jsonb,boolean) to authenticated;
grant execute on function public.patch_campaign_sheet_noninventory(uuid,text,uuid,jsonb,jsonb) to authenticated;

do $publication$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public'
   and tablename='campaign_sheet_item_leases') then
  alter publication supabase_realtime add table public.campaign_sheet_item_leases;
 end if;
 -- Existing RLS policies still apply; enable owner/DM sheet notifications
 -- only when those tables are not already in the publication.
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public'
   and tablename='characters') then
  alter publication supabase_realtime add table public.characters;
 end if;
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public'
   and tablename='npc_templates') then
  alter publication supabase_realtime add table public.npc_templates;
 end if;
end $publication$;
