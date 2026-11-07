-- STAGING ONLY: apply before the corresponding frontend release.
-- Both claim RPCs are RETURNS TABLE(holder_id, expires_at). PL/pgSQL exposes
-- expires_at as an output variable, making bare WHERE expires_at ambiguous.
-- Keep their existing signatures, lease expiry, DM takeover, grants and RLS.
-- Does not modify existing leases or campaign inventory data.

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
 delete from public.campaign_tool_item_leases as lease
 where lease.issue_id=p_issue and lease.expires_at<=now();
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
 delete from public.campaign_sheet_item_leases as lease
 where lease.expires_at<=now() and lease.campaign_id=p_campaign and
  lease.source_type=p_source and lease.source_id=p_source_id and lease.field_id=p_field;
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
