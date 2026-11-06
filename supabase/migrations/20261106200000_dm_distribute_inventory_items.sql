-- STAGED ONLY: DM-only atomic inventory grants to a specific player's character.
-- Existing inventory arrays remain the source of truth. Never expose unrestricted
-- field_values writes through this RPC; it validates campaign, field and payload.
create or replace function public.dm_give_inventory_item(
 p_character uuid,p_inventory_field text,p_item jsonb
) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare
 v_char public.characters%rowtype;v_template jsonb;v_field jsonb;
 v_inventory jsonb;v_item jsonb;
 v_name text;v_notes text;v_qty numeric;v_weight numeric;
begin
 if auth.uid() is null then raise exception 'Sign in to distribute items';end if;
 select * into v_char from public.characters where id=p_character for update;
 if not found or not public.is_campaign_dm(v_char.campaign_id) then
  raise exception 'Only the campaign DM can give items to this character';
 end if;
 select sheet_template into v_template from public.campaigns where id=v_char.campaign_id;
 if p_inventory_field is null or p_inventory_field!~'^[a-zA-Z0-9_-]{1,100}$'
 then raise exception 'Invalid inventory field';end if;
 select field into v_field from jsonb_array_elements(
   case when jsonb_typeof(v_template->'tabs')='array' then v_template->'tabs'
   else '[]'::jsonb end) tab
  cross join lateral jsonb_array_elements(
   case when jsonb_typeof(tab->'fields')='array' then tab->'fields'
   else '[]'::jsonb end) field
  where field->>'id'=p_inventory_field and field->>'type'='inventory' limit 1;
 if v_field is null then raise exception 'Inventory field is not defined in this campaign';end if;
 if jsonb_typeof(p_item)<>'object' then raise exception 'Item must be an object';end if;
 v_name:=left(btrim(coalesce(p_item->>'Item','')),100);
 v_notes:=left(coalesce(p_item->>'Notes',''),500);
 if v_name='' then raise exception 'Item must have a name';end if;
 if coalesce(p_item->>'Qty','') !~ '^[0-9]{1,5}$'
 then raise exception 'Quantity must be a whole number from 1 to 10000';end if;
 v_qty:=(p_item->>'Qty')::numeric;
 if v_qty<1 or v_qty>10000 then raise exception 'Quantity out of range';end if;
 if coalesce(p_item->>'Weight','') !~ '^[0-9]{1,6}([.][0-9]{1,3})?$'
 then raise exception 'Weight must be a nonnegative number';end if;
 v_weight:=(p_item->>'Weight')::numeric;
 if v_weight>100000 then raise exception 'Weight out of range';end if;
 v_item:=jsonb_build_object('Item',v_name,'Qty',v_qty,'Weight',v_weight,'Notes',v_notes);
 v_inventory:=v_char.field_values->p_inventory_field;
 if v_inventory is null or jsonb_typeof(v_inventory)='null' then
  v_inventory:='[]'::jsonb;
 elsif jsonb_typeof(v_inventory)<>'array' then
  raise exception 'The destination inventory cannot be read';
 end if;
 if jsonb_array_length(v_inventory)>=250
 then raise exception 'The destination inventory already contains 250 records';end if;
 update public.characters set field_values=jsonb_set(
  coalesce(v_char.field_values,'{}'::jsonb),array[p_inventory_field],
  v_inventory||jsonb_build_array(v_item),true
 ) where id=v_char.id;
 return v_char.id;
end $$;
revoke all on function public.dm_give_inventory_item(uuid,text,jsonb) from public,anon;
grant execute on function public.dm_give_inventory_item(uuid,text,jsonb) to authenticated;
