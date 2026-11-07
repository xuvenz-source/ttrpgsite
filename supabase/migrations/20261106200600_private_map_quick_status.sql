-- STAGED ONLY: both quick-adjust RPCs and the status RPC must honour
-- the authenticated player's currently assigned private map, not only
-- campaigns.active_map_id. The DM and ownership checks are preserved.
-- This migration builds directly from the deployed function definitions;
-- only the approved map guard is changed.
CREATE OR REPLACE FUNCTION public.get_token_quick_values(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_token public.map_tokens%rowtype;
 v_campaign public.campaigns%rowtype;
 v_values jsonb;
 v_allowed jsonb;
 v_result jsonb := '{}'::jsonb;
 v_field text;
 v_type text;
 v_value jsonb;
begin
 select * into v_token from public.map_tokens where id=p_token;
 if not found then raise exception 'Token not found'; end if;
 select * into v_campaign from public.campaigns where id=v_token.campaign_id;
 if not found then raise exception 'Campaign not found'; end if;
 if not (public.is_campaign_dm(v_campaign.id) or
   (public.is_campaign_member(v_campaign.id)
    and public.can_view_campaign_map(v_campaign.id,v_token.map_id)
    and v_token.visible and v_token.owner_id=auth.uid()))
 then raise exception 'Not allowed to edit this token'; end if;
 if v_token.character_id is not null then
  select field_values into v_values from public.characters
   where id=v_token.character_id and campaign_id=v_campaign.id;
 else v_values := v_token.npc_values; end if;
 v_allowed:=coalesce(v_campaign.token_quick_fields,'[]'::jsonb);
 for v_field in select jsonb_array_elements_text(v_allowed) loop
  select f->>'type' into v_type
  from jsonb_array_elements(v_campaign.sheet_template->'tabs') tab,
       lateral jsonb_array_elements(tab->'fields') f
  where f->>'id'=v_field and f->>'type' in ('number','resource')
  limit 1;
  if v_type is null then continue; end if;
  v_value:=coalesce(v_values,'{}'::jsonb)->v_field;
  if v_type='resource' then
   if jsonb_typeof(v_value)='object' then
    v_result:=jsonb_set(v_result,array[v_field],
      jsonb_build_object('current',v_value->'current','max',v_value->'max'),true);
   else
    v_result:=jsonb_set(v_result,array[v_field],
      jsonb_build_object('current',v_value,'max',null),true);
   end if;
  else v_result:=jsonb_set(v_result,array[v_field],coalesce(v_value,'null'::jsonb),true);
  end if;
  v_type:=null;
 end loop;
 return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.apply_token_quick_changes(p_token uuid, p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_token public.map_tokens%rowtype;
 v_campaign public.campaigns%rowtype;
 v_values jsonb;
 v_field text;
 v_type text;
 v_parts jsonb;
 v_part text;
 v_value jsonb;
 v_resource jsonb;
 v_count int:=0;
begin
 if p_changes is null or jsonb_typeof(p_changes)<>'object'
    or p_changes='{}'::jsonb
    or (select count(*) from jsonb_object_keys(p_changes))>8 then
  raise exception 'Provide between one and eight edited fields';
 end if;
 select * into v_token from public.map_tokens where id=p_token for update;
 if not found then raise exception 'Token no longer exists'; end if;
 select * into v_campaign from public.campaigns where id=v_token.campaign_id;
 if not found then raise exception 'Campaign no longer exists'; end if;
 if not (
   public.is_campaign_dm(v_campaign.id)
   or (
    public.is_campaign_member(v_campaign.id)
    and public.can_view_campaign_map(v_campaign.id,v_token.map_id)
    and v_token.visible and v_token.owner_id=auth.uid()
   )
 ) then raise exception 'Not allowed to edit this token'; end if;
 if v_token.character_id is not null then
  select field_values into v_values from public.characters
   where id=v_token.character_id and campaign_id=v_campaign.id for update;
  if not found then raise exception 'Character no longer exists'; end if;
 else
  v_values:=v_token.npc_values;
 end if;
 v_values:=coalesce(v_values,'{}'::jsonb);

 for v_field,v_parts in select key,value from jsonb_each(p_changes) loop
  if v_field !~ '^[A-Za-z0-9_-]{1,64}$'
    or not coalesce(v_campaign.token_quick_fields,'[]'::jsonb) ? v_field then
   raise exception 'Field is not approved for quick adjustment';
  end if;
  select f->>'type' into v_type
   from jsonb_array_elements(coalesce(v_campaign.sheet_template->'tabs','[]'::jsonb)) tab,
        lateral jsonb_array_elements(coalesce(tab->'fields','[]'::jsonb)) f
   where f->>'id'=v_field and f->>'type' in ('number','resource')
   limit 1;
  if v_type is null then raise exception 'Quick adjustment field is missing'; end if;
  if jsonb_typeof(v_parts)<>'object' or v_parts='{}'::jsonb
    or (select count(*) from jsonb_object_keys(v_parts))>2 then
   raise exception 'Invalid quick adjustment';
  end if;

  if v_type='resource' then
   if jsonb_typeof(v_values->v_field)='object' then
    v_resource:=jsonb_build_object(
     'current',v_values->v_field->'current','max',v_values->v_field->'max'
    );
   else
    v_resource:=jsonb_build_object('current',v_values->v_field,'max',null);
   end if;
  end if;
  for v_part,v_value in select key,value from jsonb_each(v_parts) loop
   if v_part not in ('current','max') or (v_type='number' and v_part<>'current')
     or jsonb_typeof(v_value)<>'number'
     or (v_value #>> '{}')::numeric < -1000000
     or (v_value #>> '{}')::numeric > 1000000 then
    raise exception 'Invalid numeric adjustment';
   end if;
   if v_type='resource' then
    v_resource:=jsonb_set(v_resource,array[v_part],v_value,true);
   else
    v_values:=jsonb_set(v_values,array[v_field],v_value,true);
   end if;
  end loop;
  if v_type='resource' then
   v_values:=jsonb_set(v_values,array[v_field],v_resource,true);
  end if;
  v_count:=v_count+1;
 end loop;

 if v_token.character_id is not null then
  update public.characters set field_values=v_values
   where id=v_token.character_id and campaign_id=v_campaign.id;
 else
  update public.map_tokens set npc_values=v_values
   where id=v_token.id;
 end if;
 return jsonb_build_object('updated',v_count);
end $function$;

CREATE OR REPLACE FUNCTION public.set_token_statuses(p_token uuid, p_statuses jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_token record;
 v_catalog jsonb;
 v_active_map uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to edit token statuses'; end if;
 select t.id,t.campaign_id,t.map_id,t.owner_id,t.visible into v_token
  from public.map_tokens t where t.id=p_token;
 if not found then raise exception 'Token not found or not visible'; end if;
 select c.token_status_catalog,c.active_map_id into v_catalog,v_active_map
  from public.campaigns c where c.id=v_token.campaign_id;
 if not (
   public.is_campaign_dm(v_token.campaign_id) or
   (public.is_campaign_member(v_token.campaign_id)
    and v_token.owner_id=auth.uid()
    and v_token.visible
    and public.can_view_campaign_map(v_token.campaign_id,v_token.map_id))
 ) then raise exception 'You cannot edit this token'; end if;
 if not public.valid_token_statuses(p_statuses,v_catalog)
 then raise exception 'Invalid status effects'; end if;
 update public.map_tokens set status_effects=p_statuses
  where id=p_token and campaign_id=v_token.campaign_id;
 if not found then raise exception 'Status update was not permitted'; end if;
 return p_statuses;
end $function$;
