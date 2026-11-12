-- B10-R18-20 source-real read-only live PostgreSQL pg_get_functiondef snapshot.
-- Captured 2026-11-12: PRODUCTION FUNCTION SOURCE IS REPLAYED ONLY IN DISPOSABLE PG17.
-- This is NOT a migration, NEVER APPLY TO LIVE. Supabase was queried with SELECT.
-- Live source MD5s below match read-only pg_catalog at capture time.
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

-- source: public.advance_map_motion_session_path() | pg_get_functiondef md5: 539292b1950d76909c032a056bebee79
CREATE OR REPLACE FUNCTION public.advance_map_motion_session_path(p_session uuid, p_path jsonb, p_seq bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 actor uuid:=auth.uid();s forge_visibility.movement_sessions%rowtype;
 t record;u record;scene_rev bigint;rule_stamp timestamptz;
 collision_on boolean;map_w integer;map_h integer;map_grid integer;
 piece jsonb;before jsonb;approved jsonb:='[]'::jsonb;
 x integer;y integer;tx integer;ty integer;start_x integer;start_y integer;
 dx integer;dy integer;leg_steps integer;i integer;total_steps integer:=0;
 nx integer;ny integer;seq_rate bigint;now_at timestamptz:=clock_timestamp();
 recipient record;access integer;
BEGIN
 IF actor IS NULL OR p_session IS NULL OR p_seq IS NULL OR
    p_seq<=0 OR p_seq>9000000000000000 OR
    jsonb_typeof(p_path)<>'array' OR
    jsonb_array_length(p_path) NOT BETWEEN 2 AND 49
 THEN RETURN false;END IF;
 SELECT ms.* INTO s FROM forge_visibility.movement_sessions ms
  WHERE ms.id=p_session AND ms.actor_id=actor FOR UPDATE;
 IF NOT FOUND OR s.expires_at<now_at OR p_seq<=s.last_seq OR
    (s.last_sent IS NOT NULL AND
     now_at-s.last_sent<interval '90 milliseconds') OR
    NOT public.can_view_campaign_map(s.campaign_id,s.map_id) OR
    (s.ignore_collision AND NOT public.is_campaign_dm(s.campaign_id))
 THEN RETURN false;END IF;
 SELECT floor(m.width/m.grid_size),floor(m.height/m.grid_size),m.grid_size
 INTO map_w,map_h,map_grid
 FROM public.battle_maps m
 WHERE m.id=s.map_id AND m.campaign_id=s.campaign_id AND m.grid_size>0;
 IF map_w IS DISTINCT FROM s.map_width OR map_h IS DISTINCT FROM s.map_height
    OR map_grid IS DISTINCT FROM s.grid_size THEN RETURN false;END IF;
 SELECT coalesce(e.revision,0) INTO scene_rev FROM public.map_environments e
 WHERE e.map_id=s.map_id;
 IF coalesce(scene_rev,0) IS DISTINCT FROM s.environment_revision
 THEN RETURN false;END IF;
 SELECT r.updated_at,coalesce(r.collision_enforced,false)
 INTO rule_stamp,collision_on FROM forge_visibility.map_rules r
 WHERE r.map_id=s.map_id;
 IF rule_stamp IS DISTINCT FROM s.rules_updated_at OR
    collision_on IS DISTINCT FROM s.collision_enforced THEN RETURN false;END IF;
 IF s.kind='token' THEN
  SELECT mt.* INTO t FROM public.map_tokens mt WHERE mt.id=s.piece_id;
  IF NOT FOUND OR t.map_id IS DISTINCT FROM s.map_id OR
     t.campaign_id IS DISTINCT FROM s.campaign_id OR
     t.x IS DISTINCT FROM s.base_x OR t.y IS DISTINCT FROM s.base_y OR
     t.updated_at IS DISTINCT FROM s.base_updated_at OR
     t.character_id IS DISTINCT FROM s.character_id OR
     t.span_x IS DISTINCT FROM s.span_x OR
     t.span_y IS DISTINCT FROM s.span_y OR
     (NOT public.is_campaign_dm(s.campaign_id) AND
      (t.owner_id IS DISTINCT FROM actor OR t.visible IS DISTINCT FROM true))
  THEN RETURN false;END IF;
  IF s.character_id IS NOT NULL AND
    (SELECT c.updated_at FROM public.characters c
     WHERE c.id=s.character_id AND c.campaign_id=s.campaign_id)
       IS DISTINCT FROM s.character_updated_at THEN RETURN false;END IF;
 ELSIF s.kind='tool' THEN
  SELECT ti.* INTO u FROM public.campaign_tool_issues ti WHERE ti.id=s.piece_id;
  IF NOT FOUND OR u.map_id IS DISTINCT FROM s.map_id OR
     u.campaign_id IS DISTINCT FROM s.campaign_id OR
     u.x IS DISTINCT FROM s.base_x OR u.y IS DISTINCT FROM s.base_y OR
     u.revision IS DISTINCT FROM s.base_tool_revision OR
     u.held_by_token_id IS NOT NULL OR
     (NOT public.is_campaign_dm(s.campaign_id) AND
      u.owner_id IS DISTINCT FROM actor AND u.party_shared IS DISTINCT FROM true)
  THEN RETURN false;END IF;
 ELSE RETURN false;END IF;
 IF s.collision_enforced AND NOT s.ignore_collision AND
    (jsonb_typeof(s.scene->'objects')<>'array' OR
     jsonb_array_length(s.scene->'objects')>120) THEN RETURN false;END IF;
 IF jsonb_typeof(p_path->0->'x')<>'number' OR
    jsonb_typeof(p_path->0->'y')<>'number' OR
    (p_path->0->>'x')::numeric IS DISTINCT FROM s.last_x OR
    (p_path->0->>'y')::numeric IS DISTINCT FROM s.last_y
 THEN RETURN false;END IF;
 x:=s.last_x;y:=s.last_y;
 approved:=jsonb_build_array(jsonb_build_object('x',x,'y',y));
 FOR piece IN SELECT value FROM jsonb_array_elements(p_path) LOOP
  IF jsonb_typeof(piece)<>'object' OR
     jsonb_typeof(piece->'x')<>'number' OR
     jsonb_typeof(piece->'y')<>'number' OR
     (piece->>'x')::numeric<>trunc((piece->>'x')::numeric) OR
     (piece->>'y')::numeric<>trunc((piece->>'y')::numeric) OR
     abs((piece->>'x')::numeric)>10000 OR
     abs((piece->>'y')::numeric)>10000 THEN RETURN false;END IF;
  tx:=(piece->>'x')::integer;ty:=(piece->>'y')::integer;
  dx:=tx-x;dy:=ty-y;
  leg_steps:=greatest(abs(dx),abs(dy));
  IF leg_steps=0 THEN CONTINUE;END IF;
  IF leg_steps>48 OR total_steps+leg_steps>48 OR
     tx<0 OR ty<0 OR tx+s.span_x>map_w OR ty+s.span_y>map_h
  THEN RETURN false;END IF;
  IF s.collision_enforced AND NOT s.ignore_collision THEN
   PERFORM forge_visibility.validate_piece_trajectory(
    s.scene,s.attributes,x,y,s.span_x,s.span_y,map_w,map_h,
    jsonb_build_array(jsonb_build_object('dx',dx,'dy',dy)));
  END IF;
  start_x:=x;start_y:=y;
  FOR i IN 1..leg_steps LOOP
   nx:=start_x+round(dx*i::numeric/leg_steps)::integer;
   ny:=start_y+round(dy*i::numeric/leg_steps)::integer;
   IF nx=x AND ny=y THEN CONTINUE;END IF;
   IF greatest(abs(nx-x),abs(ny-y))<>1 THEN RETURN false;END IF;
   approved:=approved||jsonb_build_array(jsonb_build_object('x',nx,'y',ny));
   x:=nx;y:=ny;
  END LOOP;
  total_steps:=total_steps+leg_steps;
 END LOOP;
 IF total_steps=0 OR jsonb_array_length(approved)>49 THEN RETURN false;END IF;
 -- At most one in-flight session RPC and its trusted transient coordinate.
 -- This does not write the canonical map_tokens or issued tool position.
 INSERT INTO forge_visibility.movement_preview_rates(
  actor_id,piece_id,last_sent,last_seq,map_id,kind,
  base_x,base_y,last_x,last_y
 )VALUES(actor,s.piece_id,now_at,p_seq,s.map_id,s.kind,
  s.base_x,s.base_y,x,y)
 ON CONFLICT(actor_id,piece_id) DO UPDATE SET
  last_sent=excluded.last_sent,last_seq=excluded.last_seq,
  map_id=excluded.map_id,kind=excluded.kind,
  base_x=excluded.base_x,base_y=excluded.base_y,
  last_x=excluded.last_x,last_y=excluded.last_y
 WHERE excluded.last_seq>forge_visibility.movement_preview_rates.last_seq
 RETURNING last_seq INTO seq_rate;
 IF seq_rate IS NULL THEN RETURN false;END IF;
 UPDATE forge_visibility.movement_sessions ms
 SET last_x=x,last_y=y,last_seq=p_seq,last_sent=now_at,
  expires_at=now_at+interval '6 seconds' WHERE ms.id=s.id;
 FOR recipient IN SELECT cm.user_id,cm.role
  FROM public.campaign_members cm WHERE cm.campaign_id=s.campaign_id
   AND cm.user_id<>actor ORDER BY cm.user_id LIMIT 32
 LOOP
  IF s.kind='token' AND s.token_visible IS DISTINCT FROM true AND
     recipient.role<>'dm' THEN CONTINUE;END IF;
  access:=forge_visibility.observer_verified_path_status(
   s.map_id,recipient.user_id,s.campaign_id,s.scene,s.grid_size,
   s.map_width,s.map_height,approved);
  IF access=0 THEN CONTINUE;END IF;
  IF access=1 THEN
   PERFORM realtime.send(jsonb_build_object(
    'kind',s.kind,'id',s.piece_id,'mapId',s.map_id,
    'actor',actor,'seq',p_seq,'action','path','path',approved),
    'motion','forge-observer:'||s.map_id::text||':'||
     recipient.user_id::text,true);
  ELSE
   PERFORM realtime.send(jsonb_build_object(
    'kind',s.kind,'id',s.piece_id,'mapId',s.map_id,
    'actor',actor,'seq',p_seq,'action','hide'),
    'motion','forge-observer:'||s.map_id::text||':'||
     recipient.user_id::text,true);
  END IF;
 END LOOP;
 PERFORM forge_visibility.bump_viewer_ticks(s.map_id,NULL);
 RETURN true;
EXCEPTION WHEN others THEN
 -- A failed Realtime publish or unknown scene cannot downgrade privacy.
 RETURN false;
END $function$
;
