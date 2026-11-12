-- B10-R18-20: STRICTLY THE TWO SOURCE-REAL LIVE WRITE VALIDATORS.
-- Captured by live pg_get_functiondef SELECT; no live DDL was performed.
-- REPLAY ONLY IN ISOLATED PG17 WITH ROLLBACK. NO MIGRATION.

-- source: public.validate_token_map() | pg_get_functiondef md5: 8ddb83de264171910132b2da9979f26c
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
end $function$
;

-- source: public.validate_campaign_tool_write() | pg_get_functiondef md5: 3968fd2daec5e268c931cdcf42e9bdc7
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
end $function$
;
