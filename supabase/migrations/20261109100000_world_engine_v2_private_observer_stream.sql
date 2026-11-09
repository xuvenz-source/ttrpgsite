-- World Engine V2 Phase 5: PRIVATE, server-filtered observer transport.
-- STAGING ONLY. Requires the Phase 4 migration; do not apply in production
-- until V2 fog/renderer and legacy replacement are ready for one cutover.
--
-- Temporary bridge: forge_visibility.observer_verified_path_status is the
-- current server's per-viewer light/LOS authority. Phase 7 must replace this
-- dependency with the V2 viewer/sight engine before the final release.

CREATE TABLE IF NOT EXISTS forge_world_v2.viewer_streams(
  map_id uuid NOT NULL,
  viewer_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  seq bigint NOT NULL DEFAULT 0 CHECK(seq>=0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(map_id,viewer_id)
);
ALTER TABLE forge_world_v2.viewer_streams ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_world_v2.viewer_streams FROM PUBLIC,anon,authenticated;

-- Deliberately NO INSERT policy. A browser cannot publish to this topic;
-- only authenticated, map-entitled recipient can subscribe to it.
CREATE POLICY "World V2 private observers receive only their map stream"
ON realtime.messages FOR SELECT TO authenticated
USING (
 extension='broadcast'
 AND CASE WHEN (SELECT realtime.topic()) ~
 '^forge-world-v2:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN (split_part((SELECT realtime.topic()),':',3))::uuid=auth.uid()
 AND EXISTS(SELECT 1 FROM public.battle_maps bm
  WHERE bm.id=(split_part((SELECT realtime.topic()),':',2))::uuid
  AND public.can_view_campaign_map(bm.campaign_id,bm.id))
 ELSE false END
);

-- A resync/cursor query is recipient scoped and contains no other viewers,
-- piece identifiers, NPC attributes or hidden barriers.
CREATE OR REPLACE FUNCTION public.get_world_observer_cursor_v2(p_map uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE actor uuid:=auth.uid();camp uuid;cursor bigint:=0;
 env_rev bigint:=0;permission_rev bigint:=0;
BEGIN
 IF actor IS NULL OR p_map IS NULL THEN RETURN NULL;END IF;
 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm WHERE bm.id=p_map;
 IF camp IS NULL OR NOT public.can_view_campaign_map(camp,p_map)
 THEN RETURN NULL;END IF;
 SELECT s.seq INTO cursor FROM forge_world_v2.viewer_streams s
 WHERE s.map_id=p_map AND s.viewer_id=actor AND s.campaign_id=camp;
 SELECT coalesce(e.revision,0) INTO env_rev FROM public.map_environments e
 WHERE e.map_id=p_map AND e.campaign_id=camp;
 SELECT coalesce(g.generation,0) INTO permission_rev
 FROM forge_visibility.navigation_permission_generations g
 WHERE g.map_id=p_map;
 RETURN jsonb_build_object('version',2,'mapId',p_map,'viewerId',actor,
  'cursor',coalesce(cursor,0),'environmentRevision',coalesce(env_rev,0),
  'permissionGeneration',coalesce(permission_rev,0));
END $$;

-- Check recipient access separately from a private Realtime JOIN policy:
-- users may remain subscribed while their assigned map changes.
CREATE OR REPLACE FUNCTION forge_world_v2.viewer_on_map(
 p_campaign uuid,p_map uuid,p_viewer uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE result text;active_map uuid;assigned_map uuid;
BEGIN
 SELECT cm.role,c.active_map_id,assigned.map_id
 INTO result,active_map,assigned_map
 FROM public.campaign_members cm
 JOIN public.campaigns c ON c.id=cm.campaign_id
 LEFT JOIN public.campaign_player_maps assigned
  ON assigned.campaign_id=cm.campaign_id AND assigned.user_id=cm.user_id
 WHERE cm.campaign_id=p_campaign AND cm.user_id=p_viewer;
 IF result='dm' THEN RETURN 'dm';END IF;
 IF result='player' AND p_map=coalesce(assigned_map,active_map)
 THEN RETURN 'player';END IF;
 RETURN NULL;
END $$;

-- Returns 0=no already-visible origin, 1=entire approved path visible,
-- 2=origin visible but part of trajectory becomes concealed. In cases 0/2,
-- NO path or destination can be sent. Status 2 permits only a hide marker.
CREATE OR REPLACE FUNCTION forge_world_v2.observer_path_status(
 p_session forge_world_v2.motion_sessions,
 p_viewer uuid,p_kind text,p_id uuid,p_route jsonb,
 p_scene jsonb,p_grid integer,p_width integer,p_height integer)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE role_name text;shown boolean:=true;
BEGIN
 role_name:=forge_world_v2.viewer_on_map(
  p_session.campaign_id,p_session.map_id,p_viewer);
 IF role_name IS NULL THEN RETURN 0;END IF;
 IF p_kind='token' THEN
  SELECT t.visible INTO shown FROM public.map_tokens t
   WHERE t.id=p_id AND t.map_id=p_session.map_id AND
     t.campaign_id=p_session.campaign_id;
  IF NOT FOUND OR (role_name<>'dm' AND shown IS DISTINCT FROM true)
  THEN RETURN 0;END IF;
 ELSIF p_kind='tool' THEN
  IF NOT EXISTS(SELECT 1 FROM public.campaign_tool_issues u
   WHERE u.id=p_id AND u.map_id=p_session.map_id AND
    u.campaign_id=p_session.campaign_id AND u.held_by_token_id IS NULL)
  THEN RETURN 0;END IF;
 ELSE RETURN 0;END IF;
 IF role_name='dm' THEN RETURN 1;END IF;
 -- Only the existing server-authoritative fog/LOS function decides whether
 -- the complete trajectory may be shared. No local client geometry supplied.
 RETURN forge_visibility.observer_verified_path_status(
  p_session.map_id,p_viewer,p_session.campaign_id,p_scene,
  p_grid,p_width,p_height,p_route);
EXCEPTION WHEN others THEN RETURN 0;
END $$;

-- One private, recipient-scoped broadcast per approved batch, not one
-- message per frame, tile or piece. Each viewer stream has its own monotonic
-- cursor: gaps do not disclose activity of entities they were not sent.
CREATE OR REPLACE FUNCTION forge_world_v2.publish_approved_observers(
 p_session forge_world_v2.motion_sessions,p_from jsonb,p_accepted jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
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
  ORDER BY m.user_id LIMIT 32
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
  PERFORM realtime.send(jsonb_build_object(
   'version',2,'mapId',p_session.map_id,'viewerId',audience.user_id,
   'seq',cursor,'environmentRevision',p_session.environment_revision,
   'permissionGeneration',p_session.permission_generation,'items',items),
   'world-motion-v2',
   'forge-world-v2:'||p_session.map_id::text||':'||
    audience.user_id::text,true);
  sent:=sent+1;
 END LOOP;
 RETURN sent;
END $$;

-- Move the old Phase 4 V2 function into the private schema as the
-- implementation core. The PUBLIC endpoint is replaced by the wrapper below.
-- The core stays SECURITY DEFINER, is not available to browser roles.
ALTER FUNCTION public.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) SET SCHEMA forge_world_v2;
ALTER FUNCTION forge_world_v2.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) RENAME TO advance_core_v2;
REVOKE ALL ON FUNCTION forge_world_v2.advance_core_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.advance_world_motion_v2(
 p_session uuid,p_seq bigint,p_from jsonb,p_targets jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE before_seq bigint;current_session forge_world_v2.motion_sessions%rowtype;
 result jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR p_seq IS NULL
 THEN RETURN NULL;END IF;
 SELECT * INTO current_session FROM forge_world_v2.motion_sessions
  WHERE id=p_session AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 before_seq:=current_session.last_seq;
 result:=forge_world_v2.advance_core_v2(
  p_session,p_seq,p_from,p_targets,
  p_environment_revision,p_permission_generation);
 IF result IS NULL THEN RETURN NULL;END IF;
 -- Duplicate/replayed ACKs must never broadcast a route twice.
 IF p_seq>before_seq AND result->'accepted' IS NOT NULL AND
  jsonb_typeof(result->'accepted')='array' AND
  jsonb_array_length(result->'accepted')>0 AND
  current_session.mode<>'preview'
 THEN
  -- A missing Realtime daily partition/broadcast outage cannot rewrite
  -- previously approved session state or expose unauthorised coordinates.
  BEGIN
   PERFORM forge_world_v2.publish_approved_observers(
    current_session,p_from,result->'accepted');
  EXCEPTION WHEN others THEN
   RAISE WARNING 'V2 private motion broadcast unavailable';
  END;
 END IF;
 RETURN result;
END $$;

-- Helper functions are private; only explicit public RPCs are callable.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_world_v2
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.get_world_observer_cursor_v2(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_world_observer_cursor_v2(uuid)
 TO authenticated;

-- The real authorized roster+fog+cursor snapshot is a Phase 7 responsibility:
-- do not treat the cursor alone as permission to display a token/tool.
