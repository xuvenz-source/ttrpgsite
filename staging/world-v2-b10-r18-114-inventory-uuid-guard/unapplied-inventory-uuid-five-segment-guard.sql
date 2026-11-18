-- R18-114 SOURCE-ONLY UNSCHEDULED REPAIR CANDIDATE. NOT A MIGRATION.
-- ORIGINAL and QA SQL installations are FORBIDDEN without separate approval.
-- Existing original function is 1950 bytes, R103 SHA-256
-- 4b168977eaa254f665fa1f26ed81d7296053bb988b991e60574c1610de0a879e.
-- Only correction: require canonical 8-4-4-4-12 UUID, not broken 8-4-4-12.
-- The previous predicate rejected even gen_random_uuid()::text, causing
-- repeated identity replacement and writes during inventory reads.
-- No table/ACL/RLS/function-signature/other behavior should change.
-- Apply ONLY within disposable PG17 in R114 workflow until review and approval.
BEGIN;
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
   '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12} then
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
end $get$; then
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
REVOKE ALL ON FUNCTION public.get_campaign_sheet_inventory(uuid,text,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_sheet_inventory(uuid,text,uuid,text)
 TO authenticated;
COMMIT;
