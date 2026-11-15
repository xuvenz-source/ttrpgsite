-- R18-84 DISPOSABLE PG17 ONLY: literal pg_get_functiondef bodies, exact source-MD5 checked.
-- Read-only retrieved from linked PostgreSQL 17 15-Nov-2026; NEVER install on Supabase.
-- Only included inside R54 BEGIN/ROLLBACK with local-only shell guards.

-- forge_visibility.enforce_tool_collision source MD5 771ea1716498a43210661532f9c24977
CREATE OR REPLACE FUNCTION forge_visibility.enforce_tool_collision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 scene jsonb; m record; item jsonb; pts jsonb; a jsonb; b jsonb; i integer;
 span double precision; old_span double precision; w double precision; h double precision;
 attrs jsonb; actor uuid:=auth.uid();route_text text;route_end jsonb;
begin
 if actor is null then
  if current_setting('request.jwt.claim.role',true)='service_role' then return new;end if;
  raise exception 'Sign in to move tools';
 end if;
 if new.held_by_token_id is not null or old.held_by_token_id is not null
 then return new;end if;
 if new.map_id is null then return new;end if;
 if not exists(select 1 from forge_visibility.map_rules r where r.map_id=new.map_id
  and (r.collision_enforced or r.fog_enforced))then return new;end if;
 if old.map_id is null or old.map_id is distinct from new.map_id then
  if not public.is_campaign_dm(new.campaign_id) then
   raise exception 'Ask the DM to place this tool on a published map';
  end if;
  return new;
 end if;
 if old.x=new.x and old.y=new.y and old.config is not distinct from new.config
 then return new;end if;
 if not exists(select 1 from forge_visibility.map_rules r where r.map_id=new.map_id
  and r.collision_enforced)then return new;end if;
 if public.is_campaign_dm(new.campaign_id) and
  current_setting('forge.collision_override',true)='on' then return new;end if;
 select live into scene from public.map_environments where map_id=new.map_id;
 select bm.width,bm.height,bm.grid_size into m from public.battle_maps bm
  where bm.id=new.map_id and bm.campaign_id=new.campaign_id;
 if not found or scene is null or jsonb_typeof(scene->'objects')<>'array'
    or m.grid_size<=0 or jsonb_array_length(scene->'objects')>120
 then raise exception 'Published collision configuration unavailable';end if;
 span:=case when new.kind='mount' then
  coalesce((new.config->>'span')::double precision,2) else 1.0 end;
 old_span:=case when old.kind='mount' then
  coalesce((old.config->>'span')::double precision,2) else 1.0 end;
 w:=floor(m.width/m.grid_size);h:=floor(m.height/m.grid_size);
 if span<1 or span>4 or new.x<0 or new.y<0 or
  new.x+span>w or new.y+span>h then
   raise exception 'Tool movement leaves the map bounds';end if;
 attrs:=coalesce(new.state->'attrs','{}'::jsonb);
 IF old.map_id IS NOT DISTINCT FROM new.map_id AND
     old.campaign_id IS NOT DISTINCT FROM new.campaign_id AND
     old.config IS NOT DISTINCT FROM new.config AND
     old.kind IS NOT DISTINCT FROM new.kind AND
     forge_world_v2.commit_allows_piece_v2(
      'tool',new.id,new.campaign_id,new.map_id,
      old.x,old.y,new.x,new.y) THEN RETURN new;END IF;
  route_text:=current_setting('forge.trajectory_steps',true);
 if coalesce(route_text,'')<>'' and
    current_setting('forge.trajectory_map',true)=new.map_id::text and
    current_setting('forge.trajectory_actor',true)=actor::text then
  route_end:=forge_visibility.validate_piece_trajectory(
   scene,attrs,old.x,old.y,old_span,old_span,
   w,h,route_text::jsonb);
  if (route_end->>'x')::double precision is distinct from new.x or
     (route_end->>'y')::double precision is distinct from new.y
  then raise exception 'Tool destination does not match validated route';end if;
  return new;
 end if;
 for item in select value from jsonb_array_elements(scene->'objects') loop
  if item->>'type' not in ('wall','door','window') then continue;end if;
  if item->>'type' in ('door','window') and item->>'state'='broken'
  then continue;end if;
  if forge_visibility.wall_passes(item,attrs,'movement') then continue;end if;
  pts:=item->'points';
  if jsonb_typeof(pts)<>'array' or jsonb_array_length(pts) not between 2 and 80
   then raise exception 'Invalid published barrier geometry';end if;
  for i in 1..jsonb_array_length(pts)-1 loop
   a:=pts->(i-1);b:=pts->i;
   if forge_visibility.swept_hits_segment(
    old.x,old.y,old_span,old_span,new.x,new.y,
    (a->>'x')::double precision,(a->>'y')::double precision,
    (b->>'x')::double precision,(b->>'y')::double precision)
    or forge_visibility.swept_hits_segment(
    new.x,new.y,span,span,new.x,new.y,
    (a->>'x')::double precision,(a->>'y')::double precision,
    (b->>'x')::double precision,(b->>'y')::double precision)
   then raise exception 'Tool movement blocked by a wall or closed portal';end if;
  end loop;
 end loop;
 return new;
end $function$;

-- public.protect_token_fields source MD5 188ca42e10f52115511eba0a594c29c6
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

-- public.reject_direct_sheet_inventory_overwrite source MD5 14c6e5f2f18d473a807c8f5a4bd3277d
CREATE OR REPLACE FUNCTION public.reject_direct_sheet_inventory_overwrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare old_values jsonb;new_values jsonb;field_record record;
begin
 if current_user<>'authenticated' then return new;end if;
 if tg_table_name='characters' or tg_table_name='npc_templates' then
  old_values:=coalesce(old.field_values,'{}'::jsonb);
  new_values:=coalesce(new.field_values,'{}'::jsonb);
 elsif tg_table_name='map_tokens' then
  old_values:=coalesce(old.npc_values,'{}'::jsonb);
  new_values:=coalesce(new.npc_values,'{}'::jsonb);
 else return new;end if;
 if old_values is not distinct from new_values then return new;end if;
 for field_record in
  select f.value->>'id' as id
  from public.campaigns c
  cross join lateral jsonb_array_elements(
   coalesce(c.sheet_template->'tabs','[]'::jsonb)) as t(value)
  cross join lateral jsonb_array_elements(
   coalesce(t.value->'fields','[]'::jsonb)) as f(value)
  where c.id=new.campaign_id and f.value->>'type'='inventory'
 loop
  if old_values->field_record.id is distinct from new_values->field_record.id then
   raise exception 'Collaborative inventory items must be edited individually';
  end if;
 end loop;
 return new;
end $function$;

-- public.reject_direct_tool_inventory_overwrite source MD5 b33940d8d6f5b676b4cf0ec4e0548978
CREATE OR REPLACE FUNCTION public.reject_direct_tool_inventory_overwrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if current_user='authenticated'
  and new.state->'items' is distinct from old.state->'items' then
  raise exception 'Collaborative inventory items must be edited individually';
 end if;
 return new;
end $function$;

-- public.sync_campaign_tool_map_token source MD5 640b3b7ae479936c45271482a150afaa
CREATE OR REPLACE FUNCTION public.sync_campaign_tool_map_token()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if tg_op='DELETE' then
  delete from public.campaign_tool_map_tokens where issue_id=old.id;
  return old;
 end if;
 if tg_op='UPDATE'
  and new.map_id is not distinct from old.map_id
  and new.x=old.x and new.y=old.y
  and new.kind=old.kind and new.name=old.name and new.icon=old.icon
  and new.config is not distinct from old.config
  and new.state->'lit' is not distinct from old.state->'lit'
  and new.held_by_token_id is not distinct from old.held_by_token_id
 then return new; end if;
 if new.map_id is null then
  delete from public.campaign_tool_map_tokens where issue_id=new.id;
 else
  insert into public.campaign_tool_map_tokens(
   issue_id,campaign_id,map_id,name,icon,kind,x,y,span,
   light_bright,light_dim,light_color,light_intensity,light_enabled,
   held_by_token_id,updated_at
  ) values (
   new.id,new.campaign_id,new.map_id,new.name,new.icon,new.kind,new.x,new.y,
   case when new.kind='mount' then (new.config->>'span')::int else 1 end,
   case when new.kind='torch' then (new.config->>'bright')::int else 0 end,
   case when new.kind='torch' then (new.config->>'dim')::int else 0 end,
   coalesce(new.config->>'color','#ffce7a'),
   case when new.kind='torch' then (new.config->>'intensity')::int else 0 end,
   new.kind='torch' and (new.state->>'lit')::boolean,
   new.held_by_token_id,now()
  ) on conflict(issue_id) do update set
   campaign_id=excluded.campaign_id,map_id=excluded.map_id,
   name=excluded.name,icon=excluded.icon,kind=excluded.kind,
   x=excluded.x,y=excluded.y,span=excluded.span,
   light_bright=excluded.light_bright,light_dim=excluded.light_dim,
   light_color=excluded.light_color,light_intensity=excluded.light_intensity,
   light_enabled=excluded.light_enabled,
   held_by_token_id=excluded.held_by_token_id,updated_at=now();
 end if;
 return new;
end $function$;

-- public.touch_updated_at source MD5 8639838030b589f3caeaf247e9aa9986
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin new.updated_at:=now(); return new; end $function$;

-- public.validate_campaign_tool_write source MD5 3968fd2daec5e268c931cdcf42e9bdc7
CREATE OR REPLACE FUNCTION public.validate_campaign_tool_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_map record;v_carrier record;v_old_carrier record;v_span int;v_dm boolean;
begin
 v_dm:=public.is_campaign_dm(new.campaign_id);
 if tg_op='UPDATE' then
  if new.id<>old.id or new.campaign_id<>old.campaign_id then
   raise exception 'Tool identity cannot change';end if;
  if not v_dm then
   if (to_jsonb(new)-'state'-'map_id'-'x'-'y'-'held_by_token_id'-'updated_at'-'revision')
    is distinct from
    (to_jsonb(old)-'state'-'map_id'-'x'-'y'-'held_by_token_id'-'updated_at'-'revision') then
    raise exception 'Players may not reconfigure or reassign issued tools';end if;
   if new.state->'attrs' is distinct from old.state->'attrs' then
    raise exception 'Only the DM may change mount attributes';end if;
   if old.held_by_token_id is not null then
    select t.owner_id,t.map_id,t.x,t.y into v_old_carrier
     from public.map_tokens t where t.id=old.held_by_token_id;
    if found and v_old_carrier.owner_id is distinct from (select auth.uid()) then
     if new.held_by_token_id is distinct from old.held_by_token_id
      or new.map_id is distinct from old.map_id
      or new.x is distinct from old.x or new.y is distinct from old.y then
      raise exception 'Only the current carrier or DM can drop a held tool';
     end if;
    end if;
    if found and new.held_by_token_id is null and
     (new.map_id is distinct from v_old_carrier.map_id
      or abs(new.x-v_old_carrier.x)>1
      or abs(new.y-v_old_carrier.y)>1) then
     raise exception 'Drop a held tool at its carrier, not across the map';
    end if;
   end if;
  end if;
  new.revision:=old.revision+1;
 else
  if not v_dm then raise exception 'Only DMs may issue tools';end if;
  new.revision:=0;
 end if;
 if tg_op='INSERT' then
  if not new.party_shared and not exists(
   select 1 from public.campaign_members cm
   where cm.campaign_id=new.campaign_id and cm.user_id=new.owner_id
  ) then raise exception 'Tool recipient must belong to campaign';end if;
 elsif new.owner_id is distinct from old.owner_id or
       new.party_shared is distinct from old.party_shared then
  if not new.party_shared and not exists(
   select 1 from public.campaign_members cm
   where cm.campaign_id=new.campaign_id and cm.user_id=new.owner_id
  ) then raise exception 'Tool recipient must belong to campaign';end if;
 end if;
 if new.template_id is not null and not exists(
  select 1 from public.campaign_tool_templates t
  where t.id=new.template_id and t.campaign_id=new.campaign_id
 ) then raise exception 'Tool template belongs to another campaign';end if;
 if new.map_id is not null then
  select m.id,m.campaign_id,m.width,m.height,m.grid_size into v_map
   from public.battle_maps m where m.id=new.map_id;
  if not found or v_map.campaign_id<>new.campaign_id then
   raise exception 'Tool map must belong to campaign';end if;
  if not v_dm and not public.can_view_campaign_map(new.campaign_id,new.map_id) then
   raise exception 'Cannot place a tool on an unauthorized map';end if;
  v_span:=case when new.kind='mount' then (new.config->>'span')::int else 1 end;
  if v_map.grid_size<=0 or new.x<0 or new.y<0
   or new.x+v_span>floor(v_map.width/nullif(v_map.grid_size,0))
   or new.y+v_span>floor(v_map.height/nullif(v_map.grid_size,0))
   then raise exception 'Tool position is outside map bounds';end if;
 end if;
 if new.held_by_token_id is not null then
  if jsonb_typeof(new.config->'holdable') is distinct from 'boolean'
   or new.config->>'holdable'<>'true' then
   raise exception 'This tool is not configured to be held';end if;
  select t.campaign_id,t.map_id,t.owner_id,t.visible,t.x,t.y into v_carrier
   from public.map_tokens t where t.id=new.held_by_token_id;
  if not found or v_carrier.campaign_id is distinct from new.campaign_id
   or v_carrier.map_id is distinct from new.map_id then
   raise exception 'Tool carrier must be on the same campaign map';end if;
  if not v_dm and (v_carrier.owner_id is distinct from (select auth.uid())
    or v_carrier.visible is not true) then
   raise exception 'You cannot attach a tool to that token';end if;
  if not v_dm and tg_op='UPDATE' and
   new.held_by_token_id is distinct from old.held_by_token_id and
   (new.x is distinct from round(v_carrier.x)::integer or
    new.y is distinct from round(v_carrier.y)::integer) then
   raise exception 'Attach the tool at the carrier token position';end if;
 end if;
 new.updated_at:=now();
 return new;
end $function$;

-- public.validate_token_map source MD5 8ddb83de264171910132b2da9979f26c
CREATE OR REPLACE FUNCTION public.validate_token_map()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.campaign_id is distinct from (select m.campaign_id from public.battle_maps m where m.id=new.map_id) then
  raise exception 'Token and map must belong to same campaign';
 end if;
 if new.npc_template_id is not null and new.campaign_id is distinct from (select n.campaign_id from public.npc_templates n where n.id=new.npc_template_id) then
  raise exception 'NPC must belong to token campaign';
 end if;
 if new.character_id is not null and
 (new.campaign_id is distinct from (select ch.campaign_id from public.characters ch where ch.id=new.character_id) or
  new.owner_id is distinct from (select ch.user_id from public.characters ch where ch.id=new.character_id)) then
  raise exception 'Character token ownership and campaign mismatch';
 end if;
 return new;
end $function$;
