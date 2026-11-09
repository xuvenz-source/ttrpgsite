-- Optional additive endpoint for DM and collision-unrestricted movement.
-- The mover paints locally. Every remote waypoint is checked here against
-- actor control, canonical origin, geometry and recipient-specific sight.
-- No production execution without explicit designer approval.
CREATE OR REPLACE FUNCTION public.advance_map_motion_session_path(
 p_session uuid,p_path jsonb,p_seq bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $path$
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
    jsonb_array_length(p_path) NOT BETWEEN 2 AND 12
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
END $path$;
REVOKE ALL ON FUNCTION public.advance_map_motion_session_path(uuid,jsonb,bigint)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.advance_map_motion_session_path(uuid,jsonb,bigint)
 TO authenticated,service_role;
