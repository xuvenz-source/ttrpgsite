-- STAGING ONLY. Requires explicit designer approval before touching live Supabase.
-- Designed for existing Supabase Free; no background worker or paid test branch.
-- Additive, non-destructive: issued inventory entries gain stable _inventoryId UUIDs.
-- After approval, apply BEFORE the matching frontend and test in live test campaigns.

create table if not exists public.campaign_tool_item_leases (
 issue_id uuid not null references public.campaign_tool_issues(id) on delete cascade,
 item_id uuid not null,
 holder_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null,
 primary key (issue_id,item_id)
);
create index if not exists campaign_tool_item_leases_expires_idx
 on public.campaign_tool_item_leases(expires_at);
alter table public.campaign_tool_item_leases enable row level security;
revoke all on public.campaign_tool_item_leases from anon,authenticated;
grant select on public.campaign_tool_item_leases to authenticated;
create policy "issued recipient can see temporary item claims"
 on public.campaign_tool_item_leases for select to authenticated
 using (exists (
  select 1 from public.campaign_tool_issues i
  where i.id=issue_id and (
   public.is_campaign_dm(i.campaign_id) or
   (public.is_campaign_member(i.campaign_id) and
    (i.party_shared or i.owner_id=(select auth.uid())))
  )
 ));

-- Stable IDs are added once without changing item text, position or order.
-- Restrict updates to legacy rows so repeated migration is idempotent.
update public.campaign_tool_issues i
set state=jsonb_set(i.state,'{items}',coalesce((
 select jsonb_agg(
   case when e.value->>'_inventoryId' ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then e.value else e.value || jsonb_build_object('_inventoryId',gen_random_uuid()::text) end
   order by e.position)
 from jsonb_array_elements(i.state->'items') with ordinality as e(value,position)
),'[]'::jsonb),true)
where i.kind in ('mount','inventory')
 and exists (
  select 1 from jsonb_array_elements(i.state->'items') row
  where coalesce(row->>'_inventoryId','') !~
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 );

-- Lock acquisition is a server-atomic lease. Only the DM can forcibly take
-- another player's claim; on expiry an abandoned item becomes editable.
create or replace function public.claim_campaign_tool_item(
 p_issue uuid,p_item uuid,p_takeover boolean default false)
returns table(holder_id uuid,expires_at timestamptz)
language plpgsql security definer set search_path='' as $claim$
declare actor uuid; target record; gm boolean; taken record;
begin
 actor:=auth.uid();
 if actor is null then raise exception 'Sign in required'; end if;
 select id,campaign_id,owner_id,party_shared,kind,state into target
 from public.campaign_tool_issues where id=p_issue;
 if not found or target.kind not in ('mount','inventory') then
  raise exception 'Inventory not found';end if;
 gm:=public.is_campaign_dm(target.campaign_id);
 if not gm and not (public.is_campaign_member(target.campaign_id)
  and (target.party_shared or target.owner_id=actor)) then
  raise exception 'Inventory unavailable';end if;
 if p_item is null then raise exception 'Item identity required';end if;
 -- An uncreated item can be claimed to add it; prevent unlimited spam.
 if not exists(select 1 from jsonb_array_elements(target.state->'items') r
  where r->>'_inventoryId'=p_item::text) and
  (select count(*) from public.campaign_tool_item_leases l
   where l.issue_id=p_issue and l.expires_at>now())>=250 then
  raise exception 'Too many active inventory claims';end if;
 delete from public.campaign_tool_item_leases
 where issue_id=p_issue and expires_at<=now();
 insert into public.campaign_tool_item_leases as l
 (issue_id,item_id,holder_id,expires_at)
 values(p_issue,p_item,actor,now()+interval '18 seconds')
 on conflict(issue_id,item_id) do update
 set holder_id=excluded.holder_id,expires_at=excluded.expires_at
 where l.expires_at<=now() or l.holder_id=actor or (gm and p_takeover)
 returning l.holder_id,l.expires_at into taken;
 if not found then raise exception 'This item is being edited by another player';end if;
 return query select taken.holder_id,taken.expires_at;
end $claim$;

create or replace function public.release_campaign_tool_item(p_issue uuid,p_item uuid)
returns boolean language plpgsql security definer set search_path='' as $release$
declare actor uuid;
begin
 actor:=auth.uid();
 if actor is null then return false;end if;
 delete from public.campaign_tool_item_leases
 where issue_id=p_issue and item_id=p_item and holder_id=actor;
 return found;
end $release$;

-- Entire tool state must NEVER be submitted for a shared inventory edit.
-- This RPC patches one claimed row within the latest server state under
-- an issue row lock, preserving other players' unrelated modifications.
create or replace function public.mutate_campaign_tool_item(
 p_issue uuid,p_item uuid,p_row jsonb,p_remove boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $edit$
declare actor uuid;target record;gm boolean;found_item boolean:=false;
 items jsonb;next_items jsonb:='[]'::jsonb;row jsonb;
begin
 actor:=auth.uid();
 if actor is null or p_item is null then raise exception 'Sign in required';end if;
 select * into target from public.campaign_tool_issues where id=p_issue for update;
 if not found or target.kind not in ('mount','inventory') then
  raise exception 'Inventory not found';end if;
 gm:=public.is_campaign_dm(target.campaign_id);
 if not gm and not (public.is_campaign_member(target.campaign_id)
  and (target.party_shared or target.owner_id=actor)) then
  raise exception 'Inventory unavailable';end if;
 if not exists(select 1 from public.campaign_tool_item_leases l
  where l.issue_id=p_issue and l.item_id=p_item
   and l.holder_id=actor and l.expires_at>now())
 then raise exception 'Item claim expired; select the item again';end if;
 if not p_remove and (jsonb_typeof(p_row)<>'object' or
  octet_length(p_row::text)>4096 or
  p_row ? '_inventoryId') then
  raise exception 'Invalid inventory item update';end if;
 items:=target.state->'items';
 if jsonb_typeof(items)<>'array' then raise exception 'Invalid inventory state';end if;
 for row in select value from jsonb_array_elements(items) loop
  if row->>'_inventoryId'=p_item::text then
   if found_item then raise exception 'Duplicate item IDs';end if;
   found_item:=true;
   if not p_remove then
    next_items:=next_items || jsonb_build_array(
     p_row || jsonb_build_object('_inventoryId',p_item::text));
   end if;
  else next_items:=next_items || jsonb_build_array(row);
  end if;
 end loop;
 if not found_item and p_remove then raise exception 'Item no longer exists';end if;
 if not found_item and not p_remove then
  if jsonb_array_length(items)>=250 then raise exception 'Inventory limit is 250 items';end if;
  next_items:=next_items || jsonb_build_array(
   p_row || jsonb_build_object('_inventoryId',p_item::text));
 end if;
 update public.campaign_tool_issues
  set state=jsonb_set(target.state,'{items}',next_items,true)
  where id=p_issue;
 -- Return only the edited safe inventory data to an authorised claimant.
 return next_items;
end $edit$;

-- Modifying light toggles or mount stats must not overwrite concurrent items.
create or replace function public.patch_campaign_tool_details(
 p_issue uuid,p_lit boolean default null,p_attrs jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $meta$
declare actor uuid;target record;gm boolean;next_state jsonb;
begin
 actor:=auth.uid();if actor is null then raise exception 'Sign in required';end if;
 select * into target from public.campaign_tool_issues where id=p_issue for update;
 if not found then raise exception 'Tool not found';end if;
 gm:=public.is_campaign_dm(target.campaign_id);
 if not gm and not (public.is_campaign_member(target.campaign_id)
  and (target.party_shared or target.owner_id=actor)) then
  raise exception 'Tool unavailable';end if;
 if p_attrs is not null and not gm then
  raise exception 'Only DMs can edit mount attributes';end if;
 if p_attrs is not null and (target.kind<>'mount' or
  jsonb_typeof(p_attrs)<>'object') then
  raise exception 'Invalid mount attributes';end if;
 next_state:=target.state;
 if p_lit is not null then
  next_state:=jsonb_set(next_state,'{lit}',to_jsonb(p_lit),true);end if;
 if p_attrs is not null then
  next_state:=jsonb_set(next_state,'{attrs}',p_attrs,true);end if;
 update public.campaign_tool_issues set state=next_state where id=p_issue;
 return next_state;
end $meta$;

revoke all on function public.claim_campaign_tool_item(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.release_campaign_tool_item(uuid,uuid) from public,anon,authenticated;
revoke all on function public.mutate_campaign_tool_item(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.patch_campaign_tool_details(uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.claim_campaign_tool_item(uuid,uuid,boolean) to authenticated;
grant execute on function public.release_campaign_tool_item(uuid,uuid) to authenticated;
grant execute on function public.mutate_campaign_tool_item(uuid,uuid,jsonb,boolean) to authenticated;
grant execute on function public.patch_campaign_tool_details(uuid,boolean,jsonb) to authenticated;

-- Lease changes contain only issue/item identifiers, actor IDs, and expiry.
-- RLS continues to restrict who can receive Postgres Changes.
do $publication$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public'
    and tablename='campaign_tool_item_leases') then
  alter publication supabase_realtime add table public.campaign_tool_item_leases;
 end if;
end $publication$;
