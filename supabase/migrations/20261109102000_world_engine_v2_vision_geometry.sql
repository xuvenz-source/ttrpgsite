-- World Engine V2 / Phase 7 — SERVER-OWNED SIGHT AND LIGHTING
-- STAGED ONLY. Requires earlier V2 phases; never apply standalone.
-- Uses existing public.map_environments.live and forge_visibility.exploration.
-- No raw scene, wall, static light or hidden NPC data is sent to a player.

CREATE TABLE IF NOT EXISTS forge_world_v2.vision_epochs(
 map_id uuid NOT NULL,viewer_id uuid NOT NULL,campaign_id uuid NOT NULL,
 epoch bigint NOT NULL DEFAULT 0 CHECK(epoch>=0),
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(map_id,viewer_id)
);
ALTER TABLE forge_world_v2.vision_epochs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_world_v2.vision_epochs FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION forge_world_v2.sight_wall_passes_v2(
 obj jsonb,attrs jsonb,mode text,side text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=''
AS $$
DECLARE fld text:=obj->>'attributeField'; threshold text:=obj->>'visionAt';
 raw text;
BEGIN
 IF mode='vision' AND coalesce(fld,'')<>'' AND
  coalesce(threshold,'')~'^[-]?[0-9]{1,5}([.][0-9]{1,3})?$'
 THEN
  raw:=CASE WHEN jsonb_typeof(attrs->fld)='object'
   THEN attrs->fld->>'current' ELSE attrs->>fld END;
  IF coalesce(raw,'')~'^[-]?[0-9]{1,5}([.][0-9]{1,3})?$'
   AND raw::numeric>=threshold::numeric THEN RETURN true;END IF;
 END IF;
 IF obj->>'type' IN ('door','window') AND
  obj->>'state' IN ('open','broken') THEN RETURN true;END IF;
 IF mode='light' THEN
  RETURN obj->>'blocksLight'='false' AND
   NOT (obj->>'type'='window' AND
    coalesce((obj->>'curtains')::boolean,false));
 END IF;
 IF obj->>'type'='window' AND obj->>'curtains'='true' THEN RETURN false;END IF;
 IF obj->>'vision'='pass' THEN RETURN true;END IF;
 IF obj->>'vision'='one-way' THEN
  RETURN obj->>'oneWay'=CASE WHEN side='a'
   THEN 'a-to-b' ELSE 'b-to-a' END;
 END IF;
 RETURN false;
END $$;

CREATE OR REPLACE FUNCTION forge_world_v2.ray_blocked_v2(
 p_scene jsonb,sx double precision,sy double precision,
 tx double precision,ty double precision,p_mode text,
 p_attrs jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=''
AS $$
DECLARE obj jsonb;points jsonb;a jsonb;b jsonb;
 ax double precision;ay double precision;bx double precision;by_ double precision;
 denom double precision;t double precision;u double precision;
 side text;i integer;
BEGIN
 IF p_mode NOT IN ('vision','light') OR
  jsonb_typeof(p_scene->'objects')<>'array' OR
  jsonb_array_length(p_scene->'objects')>120 OR
  sx IS NULL OR sy IS NULL OR tx IS NULL OR ty IS NULL
 THEN RETURN true;END IF;
 FOR obj IN SELECT value FROM jsonb_array_elements(p_scene->'objects') LOOP
  IF obj->>'type' NOT IN ('wall','door','window') THEN CONTINUE;END IF;
  points:=obj->'points';
  IF jsonb_typeof(points)<>'array' OR
   jsonb_array_length(points) NOT BETWEEN 2 AND 80
  THEN RETURN true;END IF;
  FOR i IN 1..jsonb_array_length(points)-1 LOOP
   a:=points->(i-1);b:=points->i;
   ax:=(a->>'x')::double precision;ay:=(a->>'y')::double precision;
   bx:=(b->>'x')::double precision;by_:=(b->>'y')::double precision;
   side:=CASE WHEN (bx-ax)*(sy-ay)-(by_-ay)*(sx-ax)>=0
    THEN 'a' ELSE 'b' END;
   IF forge_world_v2.sight_wall_passes_v2(
    obj,p_attrs,p_mode,side) THEN CONTINUE;END IF;
   denom:=(tx-sx)*(by_-ay)-(ty-sy)*(bx-ax);
   IF abs(denom)<0.0000001 THEN CONTINUE;END IF;
   t:=((ax-sx)*(by_-ay)-(ay-sy)*(bx-ax))/denom;
   u:=((ax-sx)*(ty-sy)-(ay-sy)*(tx-sx))/denom;
   IF t>0.00001 AND t<0.99999 AND
    u>=-0.00001 AND u<=1.00001 THEN RETURN true;END IF;
  END LOOP;
 END LOOP;
 RETURN false;
EXCEPTION WHEN others THEN RETURN true;
END $$;

-- A different player's viewer refresh must safely see authorized in-flight
-- movement, including DM-owned gestures. The Phase 4 session_valid() is
-- deliberately bound to auth.uid() and cannot serve this read-only purpose.
CREATE OR REPLACE FUNCTION forge_world_v2.source_session_valid_v2(
 s forge_world_v2.motion_sessions)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE role_name text;part jsonb;t record;u record;c record;
 env_rev bigint;perm_rev bigint;rule_stamp timestamptz;coll boolean;
BEGIN
 IF s.status<>'active' OR s.expires_at<=statement_timestamp() OR
  s.created_at+interval '60 seconds'<=statement_timestamp()
 THEN RETURN false;END IF;
 role_name:=forge_world_v2.viewer_on_map(
  s.campaign_id,s.map_id,s.actor_id);
 IF role_name IS NULL OR
  (s.dm_override AND role_name<>'dm') THEN RETURN false;END IF;
 SELECT e.revision INTO env_rev FROM public.map_environments e
 WHERE e.map_id=s.map_id AND e.campaign_id=s.campaign_id;
 SELECT g.generation INTO perm_rev
 FROM forge_visibility.navigation_permission_generations g
 WHERE g.map_id=s.map_id;
 SELECT r.updated_at,r.collision_enforced INTO rule_stamp,coll
 FROM forge_visibility.map_rules r
 WHERE r.map_id=s.map_id AND r.campaign_id=s.campaign_id;
 IF coalesce(env_rev,0)<>s.environment_revision OR
  coalesce(perm_rev,0)<>s.permission_generation OR
  rule_stamp IS DISTINCT FROM s.rules_updated_at OR
  coalesce(coll,false)<>s.collision_on
 THEN RETURN false;END IF;
 FOR part IN SELECT value FROM jsonb_array_elements(s.selection) LOOP
  IF part->>'kind'='token' THEN
   SELECT tok.id,tok.owner_id,tok.visible,tok.character_id,
    tok.x,tok.y,tok.span_x,tok.span_y,tok.updated_at
   INTO t FROM public.map_tokens tok
   WHERE tok.id=(part->>'id')::uuid AND
    tok.campaign_id=s.campaign_id AND tok.map_id=s.map_id;
   IF NOT FOUND OR t.x<>(part->>'x')::integer OR
    t.y<>(part->>'y')::integer OR
    t.span_x<>(part->>'spanX')::numeric OR
    t.span_y<>(part->>'spanY')::numeric OR
    t.updated_at::text<>(part->>'updatedAt') OR
    (role_name<>'dm' AND (t.owner_id IS DISTINCT FROM s.actor_id
      OR t.visible IS DISTINCT FROM true))
   THEN RETURN false;END IF;
   IF t.character_id IS NOT NULL THEN
    SELECT ch.id,ch.user_id,ch.updated_at INTO c
     FROM public.characters ch
     WHERE ch.id=t.character_id AND ch.campaign_id=s.campaign_id;
    IF NOT FOUND OR t.character_id::text IS DISTINCT FROM
      part->>'characterId' OR
     c.updated_at::text IS DISTINCT FROM part->>'characterUpdatedAt'
     OR (role_name<>'dm' AND c.user_id IS DISTINCT FROM s.actor_id)
    THEN RETURN false;END IF;
   ELSIF part->>'characterId' IS NOT NULL THEN RETURN false;END IF;
  ELSIF part->>'kind'='tool' THEN
   SELECT tool.id,tool.owner_id,tool.party_shared,tool.held_by_token_id,
    tool.x,tool.y,tool.revision
   INTO u FROM public.campaign_tool_issues tool
   WHERE tool.id=(part->>'id')::uuid AND
    tool.campaign_id=s.campaign_id AND tool.map_id=s.map_id;
   IF NOT FOUND OR u.held_by_token_id IS NOT NULL OR
    u.x<>(part->>'x')::integer OR u.y<>(part->>'y')::integer OR
    u.revision<>(part->>'toolRevision')::bigint OR
    (role_name<>'dm' AND u.owner_id IS DISTINCT FROM s.actor_id
     AND u.party_shared IS DISTINCT FROM true)
   THEN RETURN false;END IF;
  ELSE RETURN false;END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $$;

-- Return the last AUTHORIZED in-flight V2 displacement only. This is not a
-- free-form preview table, and the session_valid check revokes changed rights.
CREATE OR REPLACE FUNCTION forge_world_v2.piece_offset_v2(
 p_map uuid,p_kind text,p_piece uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE s forge_world_v2.motion_sessions%rowtype;
BEGIN
 SELECT * INTO s FROM forge_world_v2.motion_sessions m
 WHERE m.map_id=p_map AND m.status='active' AND
  m.expires_at>statement_timestamp() AND
  m.selection @> jsonb_build_array(jsonb_build_object(
   'kind',p_kind,'id',p_piece))
 ORDER BY m.created_at DESC LIMIT 1;
 IF NOT FOUND OR NOT forge_world_v2.source_session_valid_v2(s)
 THEN RETURN jsonb_build_object('dx',0,'dy',0);END IF;
 RETURN jsonb_build_object('dx',s.last_x-s.origin_x,
  'dy',s.last_y-s.origin_y);
EXCEPTION WHEN others THEN
 RETURN jsonb_build_object('dx',0,'dy',0);
END $$;

-- Materialized once for a viewer snapshot or approved observer path.
-- Never return this server-internal values/owner list to a player.
CREATE OR REPLACE FUNCTION forge_world_v2.vision_sources_v2(
 p_map uuid,p_campaign uuid,p_viewer uuid,p_scene jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE party boolean:=coalesce((p_scene->'fog'->>'partyShared')::boolean,false);
 sources jsonb:='[]'::jsonb;piece record;delta jsonb;
BEGIN
 FOR piece IN
  SELECT t.id,t.x,t.y,t.span_x,t.span_y,t.npc_values,ch.field_values
  FROM public.map_tokens t
  LEFT JOIN public.characters ch ON ch.id=t.character_id AND
   ch.campaign_id=p_campaign
  WHERE t.map_id=p_map AND t.campaign_id=p_campaign AND t.visible
   AND (t.owner_id=p_viewer OR
    (party AND t.owner_id IS NOT NULL AND EXISTS(
     SELECT 1 FROM public.campaign_members cm
     WHERE cm.campaign_id=p_campaign AND cm.user_id=t.owner_id
      AND cm.role='player')))
  ORDER BY t.id LIMIT 8
 LOOP
  delta:=forge_world_v2.piece_offset_v2(p_map,'token',piece.id);
  sources:=sources||jsonb_build_array(jsonb_build_object(
   'x',piece.x+(delta->>'dx')::integer,
   'y',piece.y+(delta->>'dy')::integer,
   'spanX',piece.span_x,'spanY',piece.span_y,
   'values',coalesce(piece.field_values,piece.npc_values,'{}'::jsonb)));
 END LOOP;
 RETURN sources;
EXCEPTION WHEN others THEN RETURN '[]'::jsonb;
END $$;

-- Static map lights are immutable until a scene publish. Carried/placed
-- torches depend ONLY on server-owned canonical or active V2 positions.
-- Light emitters can be used to calculate pixels but their coordinates are
-- never included in a player-facing visibility response.
CREATE OR REPLACE FUNCTION forge_world_v2.light_sources_v2(
 p_map uuid,p_campaign uuid,p_scene jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE sources jsonb:='[]'::jsonb;obj jsonb;tool record;delta jsonb;
 torch_x double precision;torch_y double precision;
BEGIN
 IF jsonb_typeof(p_scene->'objects')<>'array' OR
  jsonb_array_length(p_scene->'objects')>120 THEN RETURN sources;END IF;
 FOR obj IN SELECT value FROM jsonb_array_elements(p_scene->'objects')
 WHERE value->>'type'='light' AND value->>'enabled'<>'false' LIMIT 60 LOOP
  sources:=sources||jsonb_build_array(jsonb_build_object(
   'x',(obj->>'x')::double precision,
   'y',(obj->>'y')::double precision,
   'reach',greatest(0,least(200,
     (coalesce((obj->>'bright')::double precision,0)+
      coalesce((obj->>'dim')::double precision,0))/5.0))));
 END LOOP;
 FOR tool IN
  SELECT p.issue_id,p.x,p.y,p.held_by_token_id,p.light_bright,p.light_dim,
   t.id AS token_id,t.x AS token_x,t.y AS token_y,
   t.span_x,t.span_y,t.visible
  FROM public.campaign_tool_map_tokens p
  LEFT JOIN public.map_tokens t ON t.id=p.held_by_token_id AND
   t.map_id=p_map AND t.campaign_id=p_campaign
  WHERE p.map_id=p_map AND p.campaign_id=p_campaign AND
   p.kind='torch' AND p.light_enabled AND
   (p.held_by_token_id IS NULL OR (t.id IS NOT NULL AND t.visible))
  ORDER BY p.issue_id LIMIT 50
 LOOP
  IF tool.held_by_token_id IS NOT NULL THEN
   delta:=forge_world_v2.piece_offset_v2(p_map,'token',tool.token_id);
   torch_x:=tool.token_x+tool.span_x/2.0+(delta->>'dx')::integer;
   torch_y:=tool.token_y+tool.span_y/2.0+(delta->>'dy')::integer;
  ELSE
   delta:=forge_world_v2.piece_offset_v2(p_map,'tool',tool.issue_id);
   torch_x:=tool.x+0.5+(delta->>'dx')::integer;
   torch_y:=tool.y+0.5+(delta->>'dy')::integer;
  END IF;
  sources:=sources||jsonb_build_array(jsonb_build_object(
   'x',torch_x,'y',torch_y,
   'reach',greatest(0,least(200,
    (coalesce(tool.light_bright,0)+coalesce(tool.light_dim,0))/5.0))));
 END LOOP;
 RETURN sources;
EXCEPTION WHEN others THEN RETURN '[]'::jsonb;
END $$;

CREATE OR REPLACE FUNCTION forge_world_v2.is_lit_v2(
 p_scene jsonb,p_lights jsonb,
 viewer_x double precision,viewer_y double precision,
 target_x double precision,target_y double precision)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=''
AS $$
DECLARE ambient double precision;light jsonb;
 sx double precision;sy double precision;reach double precision;
BEGIN
 ambient:=coalesce((p_scene->>'ambient')::double precision,25);
 IF ambient>=50 THEN RETURN true;END IF;
 IF ambient>0 AND
  (target_x-viewer_x)^2+(target_y-viewer_y)^2<=36 THEN RETURN true;END IF;
 IF (target_x-viewer_x)^2+(target_y-viewer_y)^2<=2.25
 THEN RETURN true;END IF;
 IF jsonb_typeof(p_lights)<>'array' OR
  jsonb_array_length(p_lights)>110 THEN RETURN false;END IF;
 FOR light IN SELECT value FROM jsonb_array_elements(p_lights) LOOP
  sx:=(light->>'x')::double precision;
  sy:=(light->>'y')::double precision;
  reach:=(light->>'reach')::double precision;
  IF reach>0 AND (target_x-sx)^2+(target_y-sy)^2<=reach^2
   AND NOT forge_world_v2.ray_blocked_v2(
    p_scene,sx,sy,target_x,target_y,'light','{}'::jsonb)
  THEN RETURN true;END IF;
 END LOOP;
 RETURN false;
EXCEPTION WHEN others THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION forge_world_v2.is_seen_v2(
 p_scene jsonb,p_sources jsonb,p_lights jsonb,
 target_x double precision,target_y double precision)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=''
AS $$
DECLARE source jsonb;sx double precision;sy double precision;
BEGIN
 IF jsonb_typeof(p_sources)<>'array' OR
  jsonb_array_length(p_sources)>8 OR
  jsonb_typeof(p_scene->'objects')<>'array' THEN RETURN false;END IF;
 FOR source IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
  sx:=(source->>'x')::double precision+
   (source->>'spanX')::double precision/2.0;
  sy:=(source->>'y')::double precision+
   (source->>'spanY')::double precision/2.0;
  IF (target_x-sx)^2+(target_y-sy)^2<=144 AND
   NOT forge_world_v2.ray_blocked_v2(
    p_scene,sx,sy,target_x,target_y,'vision',
    coalesce(source->'values','{}'::jsonb)) AND
   forge_world_v2.is_lit_v2(
    p_scene,p_lights,sx,sy,target_x,target_y)
  THEN RETURN true;END IF;
 END LOOP;
 RETURN false;
EXCEPTION WHEN others THEN RETURN false;
END $$;

-- Replace the Phase 5 dependency on forge_visibility.* with V2-only sight.
-- Codes: 0 unseen origin; 1 entire path visible; 2 leave visible space.
CREATE OR REPLACE FUNCTION forge_world_v2.observer_verified_path_v2(
 p_map uuid,p_viewer uuid,p_campaign uuid,p_scene jsonb,
 p_grid integer,p_width integer,p_height integer,p_path jsonb)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE role_name text;sources jsonb;lights jsonb;point jsonb;
 last_point jsonb;first_seen boolean:=false;all_seen boolean:=true;
 ix integer:=0;visible boolean;enabled boolean;
BEGIN
 role_name:=forge_world_v2.viewer_on_map(p_campaign,p_map,p_viewer);
 IF role_name IS NULL OR jsonb_typeof(p_path)<>'array' OR
  jsonb_array_length(p_path) NOT BETWEEN 2 AND 25 OR
  p_grid<=0 OR p_width<=0 OR p_height<=0
 THEN RETURN 0;END IF;
 FOR point IN SELECT value FROM jsonb_array_elements(p_path) LOOP
  IF NOT forge_world_v2.valid_point(point) OR
   (point->>'x')::integer>=p_width OR
   (point->>'y')::integer>=p_height THEN RETURN 0;END IF;
  IF last_point IS NOT NULL AND greatest(
    abs((point->>'x')::integer-(last_point->>'x')::integer),
    abs((point->>'y')::integer-(last_point->>'y')::integer))<>1
  THEN RETURN 0;END IF;
  last_point:=point;
 END LOOP;
 IF role_name='dm' THEN RETURN 1;END IF;
 SELECT r.fog_enforced INTO enabled FROM forge_visibility.map_rules r
 WHERE r.map_id=p_map AND r.campaign_id=p_campaign;
 IF NOT coalesce(enabled,false) THEN RETURN 1;END IF;
 IF jsonb_typeof(p_scene->'objects')<>'array' OR
  jsonb_array_length(p_scene->'objects')>120 THEN RETURN 0;END IF;
 sources:=forge_world_v2.vision_sources_v2(
  p_map,p_campaign,p_viewer,p_scene);
 lights:=forge_world_v2.light_sources_v2(p_map,p_campaign,p_scene);
 FOR point IN SELECT value FROM jsonb_array_elements(p_path) LOOP
  ix:=ix+1;
  visible:=forge_world_v2.is_seen_v2(p_scene,sources,lights,
   (point->>'x')::double precision+0.5,
   (point->>'y')::double precision+0.5);
  IF ix=1 THEN first_seen:=visible;END IF;
  IF NOT visible THEN all_seen:=false;END IF;
 END LOOP;
 IF NOT first_seen THEN RETURN 0;END IF;
 IF NOT all_seen THEN RETURN 2;END IF;
 RETURN 1;
EXCEPTION WHEN others THEN RETURN 0;
END $$;

-- Preserve Phase 5's piece-level visibility checks, but delegate every
-- fog/light/LOS decision to independent V2 helpers, not old fog functions.
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
 RETURN forge_world_v2.observer_verified_path_v2(
  p_session.map_id,p_viewer,p_session.campaign_id,p_scene,
  p_grid,p_width,p_height,p_route);
EXCEPTION WHEN others THEN RETURN 0;
END $$;

-- Private helpers are not executable from the browser.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_world_v2
 FROM PUBLIC,anon,authenticated;
