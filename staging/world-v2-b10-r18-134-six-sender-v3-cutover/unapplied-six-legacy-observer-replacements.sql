-- B10-R18-134 SOURCE-ONLY / UNAPPLIED. NEVER HOSTED, NEVER PRODUCTION.
-- Apply only inside fictional PG17 after R125,R126,R132,R133 fixture SQL.
-- This staged body is generated from the six exact ORIGINAL database
-- pg_get_functiondef definitions with pinned MD5s. All original collision,
-- vision, fog, timing, authorization code is retained around each call.
-- Critical limitations: R133 relay does not calculate token LOS; current
-- callers must. Client old topic retirement, R128 system fence, all RPCs
-- and storage bearer URL revocation remain release blockers.
BEGIN;
-- R18-134: TRIGGER/CASCADE-INITIATED vision notices need an explicitly
-- trusted private entrypoint; auth.uid() can be NULL in a trigger.
-- No client, anon, or authenticated EXECUTE privilege is granted. This
-- PRIVATE helper does not validate token LOS (the original callers must).
-- It is neither a general user-supplied event forwarder nor a recovery
-- path for a revoked signed client.
CREATE FUNCTION forge_observer_v3.dispatch_trusted_vision_v3(
 p_campaign uuid,p_map uuid,p_viewer uuid,p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $trusted_vision$
DECLARE camp uuid; old_scene_topic text; private_topic text;
BEGIN
 IF p_campaign IS NULL OR p_map IS NULL OR p_viewer IS NULL
  OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
  OR pg_catalog.pg_column_size(p_payload)>8192
  OR p_payload->>'mapId' IS DISTINCT FROM p_map::text
  OR p_payload->>'viewerId' IS DISTINCT FROM p_viewer::text
  OR p_payload->>'version' IS DISTINCT FROM '2'
 THEN RETURN false;END IF;
 IF NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN false;END IF;
 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm
 WHERE bm.id=p_map AND bm.campaign_id=p_campaign;
 IF camp IS NULL OR
    forge_world_v2.viewer_on_map(p_campaign,p_map,p_viewer)
      IS DISTINCT FROM 'player'
 THEN RETURN false;END IF;
 old_scene_topic:=forge_scene_revoke.current_recipient_scene_topic_v3(
   p_map,p_viewer);
 IF old_scene_topic IS NULL OR
    old_scene_topic NOT LIKE 'forge-world-scene-v3:%'
 THEN RETURN false;END IF;
 private_topic:='forge-world-observer-v3:'||
   substr(old_scene_topic,length('forge-world-scene-v3:')+1);
 BEGIN
  PERFORM realtime.send(p_payload,'world-vision-v2',private_topic,true);
 EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'R134 trusted vision notice unavailable';
  RETURN false;
 END;
 RETURN true;
END $trusted_vision$;
REVOKE ALL ON FUNCTION
 forge_observer_v3.dispatch_trusted_vision_v3(uuid,uuid,uuid,jsonb)
 FROM PUBLIC,anon,authenticated;

-- R18-134 original live read-only MD5: 472683101bfcdfac83d90b4062bd77e1
-- Exact unchanged function body other than replacement of 1 outbound
-- realtime.send expression(s) with verified recipient V3 relays.
CREATE OR REPLACE FUNCTION forge_visibility.dispatch_movement_preview(p_map uuid, p_kind text, p_piece uuid, p_x integer, p_y integer, p_seq bigint, p_ignore_collision boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 actor uuid:=auth.uid(); camp uuid; m record; dm boolean;
 bx double precision; start_y double precision; footprint double precision;
 fw double precision;fh double precision;attrs jsonb:='{}'::jsonb;
 token public.map_tokens%rowtype; tool public.campaign_tool_issues%rowtype;
 scene jsonb; obstacle jsonb;pts jsonb;a jsonb;b jsonb;i integer;
 recipient record; packet jsonb;
 token_visible boolean:=true; accepted bigint;
 canonical_x integer;canonical_y integer;history record;
 route_steps integer;probe integer;
begin
 if actor is null or p_kind not in ('token','tool') or p_piece is null or
    p_seq is null or p_seq<=0 or p_seq>9000000000000000 or
    p_x is null or p_y is null or p_ignore_collision is null
 then return false;end if;
 select bm.campaign_id,bm.width,bm.height,bm.grid_size into m
 from public.battle_maps bm where bm.id=p_map;
 if not found or not public.can_view_campaign_map(m.campaign_id,p_map)
  or m.grid_size<=0 then return false;end if;
 camp:=m.campaign_id;
 dm:=public.is_campaign_dm(camp);
 if p_ignore_collision and not dm then return false;end if;
 if p_kind='token' then
  select * into token from public.map_tokens t where t.id=p_piece
   and t.campaign_id=camp and t.map_id=p_map;
  if not found or (not dm and (token.owner_id is distinct from actor
   or not token.visible)) then return false;end if;
  bx:=token.x;start_y:=token.y;fw:=token.span_x;fh:=token.span_y;
  token_visible:=token.visible;
  attrs:=coalesce(token.npc_values,'{}'::jsonb);
  if token.character_id is not null then
   select coalesce(ch.field_values,'{}'::jsonb) into attrs
    from public.characters ch where ch.id=token.character_id
     and ch.campaign_id=camp;
  end if;
 else
  select * into tool from public.campaign_tool_issues t where t.id=p_piece
   and t.campaign_id=camp and t.map_id=p_map;
  if not found or tool.held_by_token_id is not null or
    (not dm and tool.owner_id is distinct from actor and not tool.party_shared)
   then return false;end if;
  bx:=tool.x;start_y:=tool.y;
  footprint:=case when tool.kind='mount' then
   coalesce((tool.config->>'span')::double precision,2) else 1.0 end;
  fw:=footprint;fh:=footprint;
  attrs:=coalesce(tool.state->'attrs','{}'::jsonb);
 end if;
 canonical_x:=bx;canonical_y:=start_y;
 -- The last accepted waypoint is trusted only while the persisted origin
 -- is unchanged and the preview is recent. A resumed drag never reuses an
 -- arbitrary stale user-supplied starting coordinate.
 select h.* into history from forge_visibility.movement_preview_rates h
 where h.actor_id=actor and h.piece_id=p_piece;
 if found and history.map_id=p_map and history.kind=p_kind and
  history.base_x=canonical_x and history.base_y=canonical_y and
  history.last_sent>clock_timestamp()-interval '3 seconds' and
  history.last_seq<p_seq then
   bx:=history.last_x;start_y:=history.last_y;
 end if;
 if fw<=0 or fh<=0 or fw>12 or fh>12 or
    p_x<0 or p_y<0 or p_x+fw>floor(m.width/m.grid_size) or
    p_y+fh>floor(m.height/m.grid_size) then return false;end if;
 if not (dm and p_ignore_collision) and exists(
   select 1 from forge_visibility.map_rules r
   where r.map_id=p_map and r.collision_enforced
 )then
  select live into scene from public.map_environments where map_id=p_map;
  if scene is null or jsonb_typeof(scene->'objects')<>'array' or
    jsonb_array_length(scene->'objects')>120 then return false;end if;
  for obstacle in select value from jsonb_array_elements(scene->'objects') loop
   if obstacle->>'type' not in ('wall','door','window') then continue;end if;
   if obstacle->>'type' in ('door','window') and obstacle->>'state'='broken'
    then continue;end if;
   if forge_visibility.wall_passes(obstacle,attrs,'movement') then continue;end if;
   pts:=obstacle->'points';
   if jsonb_typeof(pts)<>'array' or
    jsonb_array_length(pts) not between 2 and 80 then return false;end if;
   for i in 1..jsonb_array_length(pts)-1 loop
    a:=pts->(i-1);b:=pts->i;
    if forge_visibility.swept_hits_segment(
      bx,start_y,fw,fh,p_x,p_y,
      (a->>'x')::double precision,(a->>'y')::double precision,
      (b->>'x')::double precision,(b->>'y')::double precision)
    then return false;end if;
   end loop;
  end loop;
 end if;
 -- DB-level per actor/piece rate limit survives reconnect and malicious
 -- client spam. Each accepted preview updates ONLY this private rate row,
 -- not map_tokens or any map visibility tick.
 insert into forge_visibility.movement_preview_rates(
  actor_id,piece_id,last_sent,last_seq,
  map_id,kind,base_x,base_y,last_x,last_y
 )values(actor,p_piece,clock_timestamp(),p_seq,
  p_map,p_kind,canonical_x,canonical_y,p_x,p_y)
 on conflict(actor_id,piece_id)do update set
  last_sent=excluded.last_sent,last_seq=excluded.last_seq,
  map_id=excluded.map_id,kind=excluded.kind,
  base_x=excluded.base_x,base_y=excluded.base_y,
  last_x=excluded.last_x,last_y=excluded.last_y
 where forge_visibility.movement_preview_rates.last_sent<=
  excluded.last_sent-interval '100 milliseconds'
  and p_seq>forge_visibility.movement_preview_rates.last_seq
 returning last_seq into accepted;
 if accepted is null then return false;end if;
 for recipient in
  select cm.user_id,cm.role from public.campaign_members cm
  where cm.campaign_id=camp and cm.user_id<>actor
  order by cm.user_id limit 32
 loop
  if p_kind='token' and not token_visible and recipient.role<>'dm'
   then continue;end if;
  -- Single private query per recipient, rather than scene/viewer SQL once
  -- for each intermediate path probe. The server is still authoritative.
  route_steps:=ceil(greatest(abs(p_x-bx),abs(p_y-start_y)))::int;
  probe:=forge_visibility.observer_path_status(
   p_map,recipient.user_id,
   bx+fw/2,start_y+fh/2,p_x+fw/2,p_y+fh/2,route_steps);
  if probe=0 then continue;end if;
  if probe=1 then
   packet:=jsonb_build_object('kind',p_kind,'id',p_piece,'mapId',p_map,
    'actor',actor,'seq',p_seq,'action','move','x',p_x,'y',p_y);
  else
   -- If the route or destination is concealed, NEVER include coordinates.
   packet:=jsonb_build_object('kind',p_kind,'id',p_piece,'mapId',p_map,
    'actor',actor,'seq',p_seq,'action','hide');
  end if;
  perform forge_observer_v3.dispatch_authorized_observer_v3(p_map,recipient.user_id,'motion',packet);
 end loop;
 return true;
exception when others then
 -- An unavailable broadcast is not authorization to weaken privacy.
 return false;
end $function$;

-- R18-134 original live read-only MD5: 543c982eb1d2bc1c5214b278382b96a1
-- Exact unchanged function body other than replacement of 2 outbound
-- realtime.send expression(s) with verified recipient V3 relays.
CREATE OR REPLACE FUNCTION forge_visibility.publish_approved_navigation_batch(p_session uuid, p_start_dx integer, p_start_dy integer, p_approved jsonb, p_scene jsonb, p_refresh_fog boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 s forge_visibility.navigation_gestures%rowtype;actor uuid:=auth.uid();
 piece jsonb;accepted jsonb;route jsonb;recipient record;
 kind_name text;piece_uuid uuid;start_x integer;start_y integer;
 path_x integer;path_y integer;end_x integer;end_y integer;
 visible_flag boolean;access integer;
 server_seq bigint;now_at timestamptz:=clock_timestamp();
 map_w integer;map_h integer;grid integer;
BEGIN
 IF actor IS NULL OR p_session IS NULL OR jsonb_typeof(p_approved)<>'array' OR
    jsonb_array_length(p_approved) NOT BETWEEN 1 AND 48 THEN RETURN;END IF;
 SELECT ng.* INTO s FROM forge_visibility.navigation_gestures ng
 WHERE ng.id=p_session AND ng.actor_id=actor;
 IF NOT FOUND OR s.expires_at<now_at THEN RETURN;END IF;
 SELECT floor(m.width/m.grid_size),floor(m.height/m.grid_size),m.grid_size
 INTO map_w,map_h,grid FROM public.battle_maps m
 WHERE m.id=s.map_id AND m.campaign_id=s.campaign_id AND m.grid_size>0;
 IF map_w IS NULL OR map_h IS NULL OR
    jsonb_typeof(p_scene->'objects')<>'array' THEN RETURN;END IF;
 -- Match legacy observer packet monotonic sequence scale while ensuring
 -- no route packet uses client-authored actor or recipient coordinates.
 server_seq:=floor(extract(epoch FROM now_at)*1000000)::bigint+s.last_seq;
 FOR piece IN
  SELECT value FROM jsonb_array_elements(s.token_origins||s.tool_origins)
 LOOP
  kind_name:=CASE WHEN (s.token_origins @> jsonb_build_array(piece))
                  THEN 'token' ELSE 'tool' END;
  piece_uuid:=(piece->>'id')::uuid;
  start_x:=(piece->>'x')::integer;
  start_y:=(piece->>'y')::integer;
  path_x:=start_x+p_start_dx;path_y:=start_y+p_start_dy;
  route:=jsonb_build_array(jsonb_build_object('x',path_x,'y',path_y));
  FOR accepted IN SELECT value FROM jsonb_array_elements(p_approved) LOOP
   path_x:=start_x+(accepted->>'dx')::integer;
   path_y:=start_y+(accepted->>'dy')::integer;
   route:=route||jsonb_build_array(jsonb_build_object('x',path_x,'y',path_y));
  END LOOP;
  end_x:=path_x;end_y:=path_y;
  IF kind_name='token' THEN
   SELECT t.visible INTO visible_flag FROM public.map_tokens t
   WHERE t.id=piece_uuid AND t.map_id=s.map_id AND t.campaign_id=s.campaign_id;
  ELSE visible_flag:=true;END IF;
  -- A single idempotent transient position per member feeds the EXISTING
  -- authorized sight/torch functions. It does not mutate canonical tokens.
  INSERT INTO forge_visibility.movement_preview_rates(
   actor_id,piece_id,last_sent,last_seq,map_id,kind,
   base_x,base_y,last_x,last_y
  )VALUES(actor,piece_uuid,now_at,server_seq,s.map_id,kind_name,
   start_x,start_y,end_x,end_y)
  ON CONFLICT(actor_id,piece_id) DO UPDATE SET
   last_sent=excluded.last_sent,last_seq=excluded.last_seq,
   map_id=excluded.map_id,kind=excluded.kind,
   base_x=excluded.base_x,base_y=excluded.base_y,
   last_x=excluded.last_x,last_y=excluded.last_y
  WHERE excluded.last_seq>forge_visibility.movement_preview_rates.last_seq;
  FOR recipient IN
   SELECT cm.user_id,cm.role FROM public.campaign_members cm
   WHERE cm.campaign_id=s.campaign_id AND cm.user_id<>actor
   ORDER BY cm.user_id LIMIT 32
  LOOP
   IF kind_name='token' AND visible_flag IS DISTINCT FROM true AND
      recipient.role<>'dm' THEN CONTINUE;END IF;
   access:=forge_visibility.observer_verified_path_status(
    s.map_id,recipient.user_id,s.campaign_id,p_scene,grid,map_w,map_h,route);
   IF access=0 THEN CONTINUE;END IF;
   IF access=1 THEN
    PERFORM forge_observer_v3.dispatch_authorized_observer_v3(s.map_id,recipient.user_id,'motion',jsonb_build_object(
     'kind',kind_name,'id',piece_uuid,'mapId',s.map_id,
     'actor',actor,'seq',server_seq,'action','path','path',route));
   ELSE
    PERFORM forge_observer_v3.dispatch_authorized_observer_v3(s.map_id,recipient.user_id,'motion',jsonb_build_object(
     'kind',kind_name,'id',piece_uuid,'mapId',s.map_id,
     'actor',actor,'seq',server_seq,'action','hide'));
   END IF;
  END LOOP;
 END LOOP;
 -- The snapshot RPC already creates per-viewer deltas and saves explored
 -- history. Run once per accepted batch (throttled by the caller), NOT per cell.
 IF p_refresh_fog THEN
  PERFORM forge_visibility.bump_viewer_ticks(s.map_id,NULL);
 END IF;
END $function$;

-- R18-134 original live read-only MD5: 809322f2f358d87ce0524d4ba7444000
-- Exact unchanged function body other than replacement of 1 outbound
-- realtime.send expression(s) with verified recipient V3 relays.
CREATE OR REPLACE FUNCTION forge_world_v2.bump_vision_epoch_v2(p_campaign uuid, p_map uuid, p_viewer uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE new_epoch bigint;env_rev bigint:=0;
 perm_gen bigint:=0;scene_gen bigint:=0;
BEGIN
 IF forge_world_v2.viewer_on_map(p_campaign,p_map,p_viewer) IS DISTINCT FROM 'player'
 THEN RETURN NULL;END IF;
 INSERT INTO forge_world_v2.vision_epochs(
  map_id,viewer_id,campaign_id,epoch,changed_at)
 VALUES(p_map,p_viewer,p_campaign,1,clock_timestamp())
 ON CONFLICT(map_id,viewer_id) DO UPDATE SET
  epoch=forge_world_v2.vision_epochs.epoch+1,
  campaign_id=excluded.campaign_id,
  changed_at=clock_timestamp()
 RETURNING epoch INTO new_epoch;
 SELECT e.revision INTO env_rev FROM public.map_environments e
 WHERE e.map_id=p_map AND e.campaign_id=p_campaign;
 SELECT g.generation INTO perm_gen
 FROM forge_visibility.navigation_permission_generations g WHERE g.map_id=p_map;
 SELECT s.generation INTO scene_gen FROM forge_world_v2.scene_publications s
 WHERE s.map_id=p_map AND s.campaign_id=p_campaign;
 BEGIN
  PERFORM forge_observer_v3.dispatch_trusted_vision_v3(p_campaign,p_map,p_viewer,jsonb_build_object(
   'version',2,'mapId',p_map,'viewerId',p_viewer,
   'visionEpoch',new_epoch,
   'environmentRevision',coalesce(env_rev,0),
   'permissionGeneration',coalesce(perm_gen,0),
   'sceneGeneration',coalesce(scene_gen,0)));
 EXCEPTION WHEN others THEN
  RAISE WARNING 'World V2 sight notification unavailable';
 END;
 RETURN new_epoch;
END $function$;

-- R18-134 original live read-only MD5: 129d3d872050dd44da989fc5c36a816e
-- Exact unchanged function body other than replacement of 1 outbound
-- realtime.send expression(s) with verified recipient V3 relays.
CREATE OR REPLACE FUNCTION forge_world_v2.publish_approved_observers(p_session forge_world_v2.motion_sessions, p_from jsonb, p_accepted jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE audience record;part jsonb;waypoint jsonb;
 viewer_role text;scene jsonb;grid record;
 path jsonb;items jsonb;world_x integer;world_y integer;
 start_x integer;start_y integer;status integer;
 piece_kind text;piece_id uuid;cursor bigint;sent integer:=0;
BEGIN
 IF p_session.actor_id<>auth.uid() OR p_session.status<>'active' OR
  p_session.mode='preview' OR NOT forge_world_v2.session_valid(p_session) OR
  jsonb_typeof(p_accepted)<>'array' OR
  jsonb_array_length(p_accepted) NOT BETWEEN 1 AND 24 OR
  NOT forge_world_v2.valid_point(p_from)
 THEN RETURN 0;END IF;
 SELECT env.live INTO scene FROM public.map_environments env
 WHERE env.map_id=p_session.map_id AND
  env.campaign_id=p_session.campaign_id;
 SELECT m.grid_size,
  floor(m.width/m.grid_size)::integer AS width_cells,
  floor(m.height/m.grid_size)::integer AS height_cells
 INTO grid FROM public.battle_maps m
 WHERE m.id=p_session.map_id AND m.campaign_id=p_session.campaign_id
  AND m.grid_size>0;
 IF NOT FOUND THEN RETURN 0;END IF;
 FOR audience IN
  SELECT m.user_id FROM public.campaign_members m
  WHERE m.campaign_id=p_session.campaign_id
   AND m.user_id<>p_session.actor_id AND m.role IN ('player','dm')
  ORDER BY CASE WHEN m.role='dm' THEN 0 ELSE 1 END,
   m.user_id LIMIT 32
 LOOP
  viewer_role:=forge_world_v2.viewer_on_map(
   p_session.campaign_id,p_session.map_id,audience.user_id);
  IF viewer_role IS NULL THEN CONTINUE;END IF;
  items:='[]'::jsonb;
  FOR part IN SELECT value FROM jsonb_array_elements(p_session.selection) LOOP
   piece_kind:=part->>'kind';piece_id:=(part->>'id')::uuid;
   start_x:=(part->>'x')::integer+(p_from->>'x')::integer-
    p_session.origin_x;
   start_y:=(part->>'y')::integer+(p_from->>'y')::integer-
    p_session.origin_y;
   path:=jsonb_build_array(jsonb_build_object('x',start_x,'y',start_y));
   FOR waypoint IN SELECT value FROM jsonb_array_elements(p_accepted) LOOP
    world_x:=(part->>'x')::integer+(waypoint->>'x')::integer-
      p_session.origin_x;
    world_y:=(part->>'y')::integer+(waypoint->>'y')::integer-
      p_session.origin_y;
    path:=path||jsonb_build_array(
     jsonb_build_object('x',world_x,'y',world_y));
   END LOOP;
   status:=forge_world_v2.observer_path_status(
    p_session,audience.user_id,piece_kind,piece_id,path,scene,
    grid.grid_size,grid.width_cells,grid.height_cells);
   IF status=1 THEN
    items:=items||jsonb_build_array(jsonb_build_object(
     'kind',piece_kind,'id',piece_id,'action','path','path',path));
   ELSIF status=2 THEN
    items:=items||jsonb_build_array(jsonb_build_object(
     'kind',piece_kind,'id',piece_id,'action','hide'));
   END IF;
  END LOOP;
  IF jsonb_array_length(items)=0 THEN CONTINUE;END IF;
  INSERT INTO forge_world_v2.viewer_streams(
   map_id,viewer_id,campaign_id,seq,updated_at)
  VALUES(p_session.map_id,audience.user_id,p_session.campaign_id,1,now())
  ON CONFLICT(map_id,viewer_id) DO UPDATE
   SET seq=forge_world_v2.viewer_streams.seq+1,
    campaign_id=excluded.campaign_id,updated_at=now()
  RETURNING seq INTO cursor;
  IF forge_observer_v3.dispatch_authorized_observer_v3(p_session.map_id,audience.user_id,'world-motion-v2',jsonb_build_object(
   'version',2,'mapId',p_session.map_id,'viewerId',audience.user_id,
   'seq',cursor,'environmentRevision',p_session.environment_revision,
   'permissionGeneration',p_session.permission_generation,'items',items)) THEN
   sent:=sent+1;
  END IF;
 END LOOP;
 RETURN sent;
END $function$;

-- R18-134 original live read-only MD5: fe6946643fb701ac6d30684cfdd9bca6
-- Exact unchanged function body other than replacement of 1 outbound
-- realtime.send expression(s) with verified recipient V3 relays.
CREATE OR REPLACE FUNCTION public.advance_map_motion_session(p_session uuid, p_x integer, p_y integer, p_seq bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 actor uuid:=auth.uid();s forge_visibility.movement_sessions%rowtype;
 t record;u record;env_rev bigint;rule_stamp timestamptz;collision_on boolean;
 current_width integer;current_height integer;current_grid integer;
 obstacle jsonb;pts jsonb;a jsonb;b jsonb;i integer;accepted bigint;
 recipient record;probe integer;steps integer;packet jsonb;now_at timestamptz;
begin
 if actor is null or p_session is null or p_x is null or p_y is null
 or p_seq is null or p_seq<=0 or p_seq>9000000000000000 then return false;end if;
 select * into s from forge_visibility.movement_sessions
 where id=p_session and actor_id=actor for update;
 if not found or s.expires_at<clock_timestamp() or p_seq<=s.last_seq
 or p_x<0 or p_y<0 or p_x+s.span_x>s.map_width
 or p_y+s.span_y>s.map_height then return false;end if;
 now_at:=clock_timestamp();
 if s.last_sent is not null and now_at-s.last_sent<interval '90 milliseconds'
 then return false;end if;
 if not public.can_view_campaign_map(s.campaign_id,s.map_id)
 or (s.ignore_collision and not public.is_campaign_dm(s.campaign_id))
 then return false;end if;
 -- Grid resizing must invalidate the gesture even when no wall was edited.
 select floor(b.width/b.grid_size),floor(b.height/b.grid_size),b.grid_size
 into current_width,current_height,current_grid
 from public.battle_maps b where b.id=s.map_id and b.campaign_id=s.campaign_id
  and b.grid_size>0;
 if current_width is distinct from s.map_width or
    current_height is distinct from s.map_height or
    current_grid is distinct from s.grid_size then return false;end if;
 select coalesce(e.revision,0) into env_rev from public.map_environments e
 where e.map_id=s.map_id;
 if coalesce(env_rev,0)<>s.environment_revision then return false;end if;
 select r.updated_at,coalesce(r.collision_enforced,false) into rule_stamp,collision_on
 from forge_visibility.map_rules r where r.map_id=s.map_id;
 if rule_stamp is distinct from s.rules_updated_at or
    coalesce(collision_on,false)<>s.collision_enforced then return false;end if;
 if s.kind='token' then
  select mt.map_id,mt.campaign_id,mt.x,mt.y,mt.owner_id,mt.visible,mt.updated_at,
   mt.character_id,mt.span_x,mt.span_y into t
   from public.map_tokens mt where mt.id=s.piece_id;
  if not found or t.map_id is distinct from s.map_id or
   t.campaign_id is distinct from s.campaign_id or t.x<>s.base_x or
   t.y<>s.base_y or t.updated_at is distinct from s.base_updated_at or
   t.character_id is distinct from s.character_id or
   t.span_x is distinct from s.span_x or t.span_y is distinct from s.span_y or
   (not public.is_campaign_dm(s.campaign_id) and
    (t.owner_id is distinct from actor or t.visible is distinct from true))
  then return false;end if;
  if s.character_id is not null and
   (select c.updated_at from public.characters c where c.id=s.character_id
    and c.campaign_id=s.campaign_id) is distinct from s.character_updated_at
  then return false;end if;
 else
  select ti.map_id,ti.campaign_id,ti.x,ti.y,ti.owner_id,ti.party_shared,
    ti.held_by_token_id,ti.revision into u
  from public.campaign_tool_issues ti where ti.id=s.piece_id;
  if not found or u.map_id is distinct from s.map_id or
   u.campaign_id is distinct from s.campaign_id or
   u.x<>s.base_x or u.y<>s.base_y or
   u.revision is distinct from s.base_tool_revision or
   u.held_by_token_id is not null or
   (not public.is_campaign_dm(s.campaign_id) and
    u.owner_id is distinct from actor and u.party_shared is distinct from true)
  then return false;end if;
 end if;
 -- No-op samples cannot cross a wall: only a changed segment requires
 -- swept collision. Real segments still fail closed on malformed geometry.
 if s.collision_enforced and not s.ignore_collision and
    (p_x<>s.last_x or p_y<>s.last_y) then
  if pg_catalog.jsonb_typeof(s.scene->'objects')<>'array' or
    pg_catalog.jsonb_array_length(s.scene->'objects')>120 then return false;end if;
  for obstacle in select value from pg_catalog.jsonb_array_elements(s.scene->'objects') loop
   if obstacle->>'type' not in ('wall','door','window') then continue;end if;
   if obstacle->>'type' in ('door','window') and obstacle->>'state'='broken'
   then continue;end if;
   if forge_visibility.wall_passes(obstacle,s.attributes,'movement') then continue;end if;
   pts:=obstacle->'points';
   if pg_catalog.jsonb_typeof(pts)<>'array' or
     pg_catalog.jsonb_array_length(pts) not between 2 and 80 then return false;end if;
   for i in 1..pg_catalog.jsonb_array_length(pts)-1 loop
    a:=pts->(i-1);b:=pts->i;
    if forge_visibility.swept_hits_segment(s.last_x,s.last_y,s.span_x,s.span_y,
      p_x,p_y,(a->>'x')::double precision,(a->>'y')::double precision,
      (b->>'x')::double precision,(b->>'y')::double precision)
    then return false;end if;
   end loop;
  end loop;
 end if;
 -- Existing visibility and lighting functions consume this trusted last step.
 insert into forge_visibility.movement_preview_rates(
 actor_id,piece_id,last_sent,last_seq,map_id,kind,
 base_x,base_y,last_x,last_y
 ) values(actor,s.piece_id,now_at,p_seq,s.map_id,s.kind,
 s.base_x,s.base_y,p_x,p_y)
 on conflict(actor_id,piece_id) do update set
 last_sent=excluded.last_sent,last_seq=excluded.last_seq,
 map_id=excluded.map_id,kind=excluded.kind,
 base_x=excluded.base_x,base_y=excluded.base_y,
 last_x=excluded.last_x,last_y=excluded.last_y
 where p_seq>forge_visibility.movement_preview_rates.last_seq
 returning last_seq into accepted;
 if accepted is null then return false;end if;
 update forge_visibility.movement_sessions
 set last_x=p_x,last_y=p_y,last_seq=p_seq,last_sent=now_at,
 expires_at=now_at+interval '6 seconds' where id=s.id;
 steps:=pg_catalog.ceil(greatest(
  pg_catalog.abs(p_x-s.last_x),pg_catalog.abs(p_y-s.last_y)))::int;
 for recipient in
  select cm.user_id,cm.role from public.campaign_members cm
   where cm.campaign_id=s.campaign_id and cm.user_id<>actor
   order by cm.user_id limit 32
 loop
  if s.kind='token' and not s.token_visible and recipient.role<>'dm'
  then continue;end if;
  -- Private recipients are validated by the existing current-LOS routine.
  -- No direct client send or public map topic can bypass this gate.
  probe:=forge_visibility.observer_path_status_cached(
   s.map_id,recipient.user_id,s.campaign_id,s.scene,
   s.grid_size,
   s.map_width,s.map_height,
   s.last_x+s.span_x/2,s.last_y+s.span_y/2,
   p_x+s.span_x/2,p_y+s.span_y/2,steps);
  if probe=0 then continue;end if;
  if probe=1 then
   packet:=pg_catalog.jsonb_build_object('kind',s.kind,'id',s.piece_id,
    'mapId',s.map_id,'actor',actor,'seq',p_seq,
    'action','move','x',p_x,'y',p_y);
  else
   packet:=pg_catalog.jsonb_build_object('kind',s.kind,'id',s.piece_id,
    'mapId',s.map_id,'actor',actor,'seq',p_seq,'action','hide');
  end if;
  perform forge_observer_v3.dispatch_authorized_observer_v3(s.map_id,recipient.user_id,'motion',packet);
 end loop;
 return true;
exception when others then
 -- A failed broadcast, malformed scene or unexpected backend error NEVER
 -- downgrades to an unsafe direct client preview.
 return false;
end $function$;

-- R18-134 original live read-only MD5: 539292b1950d76909c032a056bebee79
-- Exact unchanged function body other than replacement of 2 outbound
-- realtime.send expression(s) with verified recipient V3 relays.
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
   PERFORM forge_observer_v3.dispatch_authorized_observer_v3(s.map_id,recipient.user_id,'motion',jsonb_build_object(
    'kind',s.kind,'id',s.piece_id,'mapId',s.map_id,
    'actor',actor,'seq',p_seq,'action','path','path',approved));
  ELSE
   PERFORM forge_observer_v3.dispatch_authorized_observer_v3(s.map_id,recipient.user_id,'motion',jsonb_build_object(
    'kind',s.kind,'id',s.piece_id,'mapId',s.map_id,
    'actor',actor,'seq',p_seq,'action','hide'));
  END IF;
 END LOOP;
 PERFORM forge_visibility.bump_viewer_ticks(s.map_id,NULL);
 RETURN true;
EXCEPTION WHEN others THEN
 -- A failed Realtime publish or unknown scene cannot downgrade privacy.
 RETURN false;
END $function$;

COMMIT;
