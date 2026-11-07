-- STAGING ONLY: apply only after the designer authorizes a consolidated release.
-- Derived from verified production protect_token_fields() definition.
-- The change adds an owner-scoped character artwork exception and does not
-- relax the other protected token-field checks.
CREATE OR REPLACE FUNCTION public.protect_token_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_config jsonb;
 v_template jsonb;
 v_field text;
 v_count int:=0;
 v_type text;
 v_before jsonb;
 v_after jsonb;
 v_canonical jsonb;
 v_changed jsonb;
 v_part text;
 v_catalog jsonb;
begin
 if public.is_campaign_dm(old.campaign_id) then return new; end if;

 -- Existing token position updates.
 if (to_jsonb(new)-'x'-'y'-'updated_at')
    is not distinct from (to_jsonb(old)-'x'-'y'-'updated_at')
 then return new; end if;

 -- Player can sync only the image of their controlled, visible map
 -- token. Reject all other field changes, and require the sheet's selected
 -- artwork to be a WebP token file in this player's campaign-scoped folder.
 if old.image_path is distinct from new.image_path
   and (to_jsonb(new)-'image_path'-'updated_at')
     is not distinct from (to_jsonb(old)-'image_path'-'updated_at')
   and old.owner_id=auth.uid()
   and old.character_id is not null
   and old.visible
   and public.is_campaign_member(old.campaign_id)
   and public.can_view_campaign_map(old.campaign_id,old.map_id)
   and exists(
    select 1 from public.characters ch
    where ch.id=old.character_id
      and ch.campaign_id=old.campaign_id
      and ch.user_id=auth.uid()
      and ch.token_path is not distinct from new.image_path
   )
   and (
    new.image_path is null
    or new.image_path ~ (
     '^'||old.campaign_id::text||'/players/'||old.owner_id::text||
     '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-token[.]webp$'
    )
   )
 then return new; end if;

 -- Status-only updates for the owner, on the published campaign map.
 if old.status_effects is distinct from new.status_effects
   and (to_jsonb(new)-'status_effects'-'updated_at')
     is not distinct from (to_jsonb(old)-'status_effects'-'updated_at')
   and old.owner_id=auth.uid() and old.visible
   and public.is_campaign_member(old.campaign_id)
   and old.map_id=(select c.active_map_id from public.campaigns c
    where c.id=old.campaign_id)
 then
  select token_status_catalog into v_catalog from public.campaigns
   where id=old.campaign_id;
  if not public.valid_token_statuses(new.status_effects,v_catalog)
  then raise exception 'Invalid status effects'; end if;
  return new;
 end if;

 -- Existing DM-approved numeric changes on controlled NPCs.
 if old.npc_values is distinct from new.npc_values
   and (to_jsonb(new)-'updated_at'-'npc_values')
     is not distinct from (to_jsonb(old)-'updated_at'-'npc_values')
   and old.character_id is null and old.owner_id=auth.uid()
   and old.visible and public.is_campaign_member(old.campaign_id)
   and old.map_id=(select c.active_map_id from public.campaigns c
    where c.id=old.campaign_id)
 then
  select c.token_quick_fields,c.sheet_template
   into v_config,v_template from public.campaigns c where c.id=old.campaign_id;
  for v_field in
   select k.field from (
     select jsonb_object_keys(coalesce(old.npc_values,'{}'::jsonb)) as field
     union
     select jsonb_object_keys(coalesce(new.npc_values,'{}'::jsonb)) as field
   ) k
   where old.npc_values->k.field is distinct from new.npc_values->k.field
  loop
   v_count:=v_count+1;
   if v_count>8 or not coalesce(v_config,'[]'::jsonb) ? v_field
   then raise exception 'Only DM-approved quick attributes can be modified'; end if;
   select f->>'type' into v_type
    from jsonb_array_elements(coalesce(v_template->'tabs','[]'::jsonb)) tab,
         lateral jsonb_array_elements(coalesce(tab->'fields','[]'::jsonb)) f
    where f->>'id'=v_field and f->>'type' in ('number','resource')
    limit 1;
   v_before:=old.npc_values->v_field;
   v_after:=new.npc_values->v_field;
   if v_type='number' then
    if jsonb_typeof(v_after)<>'number' or
      (v_after #>> '{}')::numeric not between -1000000 and 1000000
    then raise exception 'Invalid numeric quick edit'; end if;
   elsif v_type='resource' then
    if jsonb_typeof(v_after)<>'object' or
       v_after-'current'-'max'<>'{}'::jsonb or
       not (v_after ? 'current' and v_after ? 'max')
    then raise exception 'Invalid resource quick edit'; end if;
    if jsonb_typeof(v_before)<>'object' then
     v_canonical:=jsonb_build_object('current',v_before,'max',null);
    else v_canonical:=v_before; end if;
    for v_part in select unnest(array['current','max']::text[]) loop
     v_changed:=v_after->v_part;
     if v_canonical->v_part is distinct from v_changed then
      if jsonb_typeof(v_changed)<>'number' or
        (v_changed #>> '{}')::numeric not between -1000000 and 1000000
      then raise exception 'Invalid resource quick edit'; end if;
     end if;
    end loop;
   else raise exception 'Only Number and Resource quick fields may be edited';
   end if;
  end loop;
  if v_count>0 then return new; end if;
 end if;
 raise exception 'Players may only change positions, statuses or DM-approved quick attributes';
end $function$;
