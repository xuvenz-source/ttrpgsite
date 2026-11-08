-- Applied to the existing Supabase project as migration 20261108052335.
-- This source is maintained for the approved two-feature production release.
-- Moves one whole item between a character Inventory field and an issued
-- shared/mount inventory, atomically. No background jobs or paid infrastructure.
-- The source must have a current lease held by the caller. Target access is
-- checked independently; forged destination IDs cannot bypass ownership/RLS.

create or replace function public.find_campaign_inventory_transfer_slot(
 p_items jsonb,p_cols int,p_rows int,p_item jsonb,p_x int default null,p_y int default null)
returns jsonb language plpgsql security definer set search_path='' as $slot$
declare
 occupied int[]:='{}';r jsonb;w int;h int;px int;py int;
 candidate_x int;candidate_y int;dx int;dy int;good boolean;
 placed boolean;item_w int;item_h int;
begin
 if jsonb_typeof(p_items)<>'array' or p_cols not between 2 and 20
  or p_rows not between 2 and 20 then raise exception 'Invalid grid configuration';end if;
 -- Match the client grid-layout first-fit behavior for existing items, including
 -- older rows with invalid/overlapping saved positions.
 for r in select value from jsonb_array_elements(p_items) loop
  w:=case when coalesce(r->>'gridW','')~'^[0-9]{1,3}$'
   then greatest(1,least(p_cols,(r->>'gridW')::int)) else 1 end;
  h:=case when coalesce(r->>'gridH','')~'^[0-9]{1,3}$'
   then greatest(1,least(p_rows,(r->>'gridH')::int)) else 1 end;
  candidate_x:=case when coalesce(r->>'gridX','')~'^-?[0-9]{1,3}$'
   then (r->>'gridX')::int else -1 end;
  candidate_y:=case when coalesce(r->>'gridY','')~'^-?[0-9]{1,3}$'
   then (r->>'gridY')::int else -1 end;
  good:=candidate_x>=0 and candidate_y>=0
   and candidate_x+w<=p_cols and candidate_y+h<=p_rows;
  if good then
   for dy in 0..h-1 loop for dx in 0..w-1 loop
    if (candidate_y+dy)*p_cols+candidate_x+dx=any(occupied) then good:=false;end if;
   end loop;end loop;
  end if;
  if not good then
   candidate_x:=-1;candidate_y:=-1;
   <<existing_first_fit>>
   for py in 0..p_rows-h loop
    for px in 0..p_cols-w loop
     good:=true;
     for dy in 0..h-1 loop for dx in 0..w-1 loop
      if (py+dy)*p_cols+px+dx=any(occupied) then good:=false;end if;
     end loop;end loop;
     if good then candidate_x:=px;candidate_y:=py;exit existing_first_fit;end if;
    end loop;
   end loop existing_first_fit;
  end if;
  if candidate_x>=0 then
   for dy in 0..h-1 loop for dx in 0..w-1 loop
    occupied:=array_append(occupied,(candidate_y+dy)*p_cols+candidate_x+dx);
   end loop;end loop;
  end if;
 end loop;
 -- A transferred item keeps its footprint. Never shrink it to make room.
 item_w:=case when coalesce(p_item->>'gridW','')~'^[0-9]{1,3}$'
  then greatest(1,(p_item->>'gridW')::int) else 1 end;
 item_h:=case when coalesce(p_item->>'gridH','')~'^[0-9]{1,3}$'
  then greatest(1,(p_item->>'gridH')::int) else 1 end;
 if item_w>p_cols or item_h>p_rows then
  raise exception 'Item is larger than the destination grid';end if;
 if (p_x is null)<>(p_y is null) then raise exception 'Incomplete grid position';end if;
 -- Prefer the cell the user selected; if it is occupied, find another
 -- contiguous rectangle rather than incorrectly reporting no empty slots.
 if p_x is not null and p_x>=0 and p_y>=0
  and p_x+item_w<=p_cols and p_y+item_h<=p_rows then
  good:=true;
  for dy in 0..item_h-1 loop for dx in 0..item_w-1 loop
   if (p_y+dy)*p_cols+p_x+dx=any(occupied) then good:=false;end if;
  end loop;end loop;
  if good then return jsonb_build_object('x',p_x,'y',p_y);end if;
 end if;
 <<new_first_fit>>
 for py in 0..p_rows-item_h loop
  for px in 0..p_cols-item_w loop
   good:=true;
   for dy in 0..item_h-1 loop for dx in 0..item_w-1 loop
    if (py+dy)*p_cols+px+dx=any(occupied) then good:=false;end if;
   end loop;end loop;
   if good then return jsonb_build_object('x',px,'y',py);end if;
  end loop;
 end loop new_first_fit;
 raise exception 'Not enough free grid slots; item was not moved';
end $slot$;

create or replace function public.transfer_campaign_inventory_item(
 p_campaign uuid,p_sheet uuid,p_field text,p_issue uuid,p_item uuid,
 p_direction text,p_x int default null,p_y int default null)
returns jsonb language plpgsql security definer set search_path='' as $transfer$
declare
 actor uuid:=auth.uid();sheet_row record;tool_row record;template_field jsonb;
 from_rows jsonb;to_rows jsonb;updated_from jsonb:='[]'::jsonb;
 selected jsonb;candidate jsonb;found_count int:=0;target_grid boolean;
 target_cols int;target_rows int;placement jsonb;next_target jsonb;
begin
 if actor is null or p_campaign is null or p_sheet is null or p_issue is null
  or p_item is null or p_field is null or p_direction is null
  or p_direction not in ('to_tool','to_sheet')
  then raise exception 'Invalid inventory transfer';end if;
 if not coalesce(public.can_edit_campaign_sheet_inventory(p_campaign,'character',p_sheet,p_field),false)
 then raise exception 'No access to character inventory';end if;
 -- Lock the source sheet lease before its row, matching sheet-item mutation's
 -- lock order and preventing a move racing with an in-progress sheet edit.
 if p_direction='to_tool' and not exists(
  select 1 from public.campaign_sheet_item_leases l
  where l.campaign_id=p_campaign and l.source_type='character'
   and l.source_id=p_sheet and l.field_id=p_field and l.item_id=p_item
   and l.holder_id=actor and l.expires_at>now() for update)
 then raise exception 'Item is in use or its claim expired';end if;
 -- Consistent character-then-tool row lock order in both directions.
 select id,campaign_id,field_values into sheet_row
 from public.characters where id=p_sheet and campaign_id=p_campaign for update;
 if not found then raise exception 'Character inventory not found';end if;
 select id,campaign_id,kind,owner_id,party_shared,config,state into tool_row
 from public.campaign_tool_issues
 where id=p_issue and campaign_id=p_campaign for update;
 if not found or tool_row.kind not in ('mount','inventory') then
  raise exception 'Shared inventory not found';end if;
 if not (
  coalesce(public.is_campaign_dm(p_campaign),false)
  or (
   coalesce(public.is_campaign_member(p_campaign),false)
   and (
    coalesce(tool_row.party_shared,false)
    or coalesce(tool_row.owner_id=actor,false)
   )
  )
 ) then raise exception 'No access to destination inventory';end if;
 if p_direction='to_sheet' and not exists(
  select 1 from public.campaign_tool_item_leases l
  where l.issue_id=p_issue and l.item_id=p_item
   and l.holder_id=actor and l.expires_at>now() for update)
 then raise exception 'Item is in use or its claim expired';end if;
 select f.value into template_field from public.campaigns c
 cross join lateral jsonb_array_elements(coalesce(c.sheet_template->'tabs','[]'::jsonb)) t(value)
 cross join lateral jsonb_array_elements(coalesce(t.value->'fields','[]'::jsonb)) f(value)
 where c.id=p_campaign and f.value->>'type'='inventory'
  and f.value->>'id'=p_field limit 1;
 if template_field is null then raise exception 'Inventory field no longer exists';end if;
 if p_direction='to_tool' then
  from_rows:=coalesce(sheet_row.field_values->p_field,'[]'::jsonb);
  to_rows:=coalesce(tool_row.state->'items','[]'::jsonb);
  target_grid:=coalesce(tool_row.config->>'inventoryMode','list')='grid';
  target_cols:=coalesce((tool_row.config->>'columns')::int,8);
  target_rows:=coalesce((tool_row.config->>'rows')::int,5);
 else
  from_rows:=coalesce(tool_row.state->'items','[]'::jsonb);
  to_rows:=coalesce(sheet_row.field_values->p_field,'[]'::jsonb);
  target_grid:=coalesce(template_field->>'inventoryPreset','list')='grid';
  target_cols:=case when coalesce(template_field->>'gridColumns','')~'^[0-9]{1,3}$'
   then (template_field->>'gridColumns')::int else 8 end;
  target_rows:=case when coalesce(template_field->>'gridRows','')~'^[0-9]{1,3}$'
   then (template_field->>'gridRows')::int else 5 end;
 end if;
 if jsonb_typeof(from_rows)<>'array' or jsonb_typeof(to_rows)<>'array'
 then raise exception 'Inventory rows are invalid';end if;
 if jsonb_array_length(to_rows)>=250 then raise exception 'Destination inventory is full';end if;
 for candidate in select value from jsonb_array_elements(from_rows) loop
  if candidate->>'_inventoryId'=p_item::text then
   selected:=candidate;found_count:=found_count+1;
  else updated_from:=updated_from || jsonb_build_array(candidate);end if;
 end loop;
 if found_count<>1 then raise exception 'Source item is missing or duplicated';end if;
 if exists(select 1 from jsonb_array_elements(to_rows) r
  where r->>'_inventoryId'=p_item::text)
 then raise exception 'Item already exists in destination';end if;
 if octet_length(selected::text)>4096 then raise exception 'Inventory item is too large';end if;
 if target_grid then
  placement:=public.find_campaign_inventory_transfer_slot(
   to_rows,greatest(2,least(20,target_cols)),greatest(2,least(20,target_rows)),
   selected,p_x,p_y);
  selected:=selected||jsonb_build_object('gridX',placement->'x','gridY',placement->'y');
 else
  if p_x is not null or p_y is not null then
   raise exception 'Cannot place grid coordinates into a list inventory';end if;
  selected:=selected-'gridX'-'gridY';
 end if;
 next_target:=to_rows||jsonb_build_array(selected);
 -- Both writes run inside this one transaction: a failed update rolls back
 -- the entire move and does not duplicate or lose the item.
 if p_direction='to_tool' then
  update public.characters set field_values=jsonb_set(
   coalesce(field_values,'{}'::jsonb),array[p_field],updated_from,true)
  where id=p_sheet and campaign_id=p_campaign;
  update public.campaign_tool_issues set state=jsonb_set(
   state,'{items}',next_target,true)
  where id=p_issue and campaign_id=p_campaign;
  delete from public.campaign_sheet_item_leases where campaign_id=p_campaign
   and source_type='character' and source_id=p_sheet and field_id=p_field
   and item_id=p_item and holder_id=actor;
 else
  update public.campaign_tool_issues set state=jsonb_set(
   state,'{items}',updated_from,true)
  where id=p_issue and campaign_id=p_campaign;
  update public.characters set field_values=jsonb_set(
   coalesce(field_values,'{}'::jsonb),array[p_field],next_target,true)
  where id=p_sheet and campaign_id=p_campaign;
  delete from public.campaign_tool_item_leases
   where issue_id=p_issue and item_id=p_item and holder_id=actor;
 end if;
 return jsonb_build_object('moved',true,'itemId',p_item,'direction',p_direction);
end $transfer$;

revoke all on function public.find_campaign_inventory_transfer_slot(
 jsonb,int,int,jsonb,int,int) from public,anon,authenticated;
revoke all on function public.transfer_campaign_inventory_item(
 uuid,uuid,text,uuid,uuid,text,int,int) from public,anon,authenticated;
grant execute on function public.transfer_campaign_inventory_item(
 uuid,uuid,text,uuid,uuid,text,int,int) to authenticated;
