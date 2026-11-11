-- B03 CANDIDATE ONLY. NOT A DEPLOYABLE/APPLIED MIGRATION.
-- Place under supabase/candidates to prevent accidental migration discovery.
-- Requires the eight released World Engine V2 migrations; B04 must compile and
-- adversarially exercise it in an isolated PostgreSQL instance before B05 wiring.
--
-- The existing public.begin/advance/commit_world_motion_v2 RPCs are untouched.
-- This function is PRIVATE and has no caller-facing EXECUTE grants.
--
-- B02 decision: preserve existing authenticated RPC transport. The caller
-- (future private advance_core_v2 integration) owns the state write and the
-- server-filtered per-recipient observer broadcast. This core only calculates
-- a candidate exact, swept, contiguous accepted prefix. It never writes
-- canonical coordinates, session rows, sight, exploration or Realtime packets.
--
-- "oneWay" is a V2 VISION setting, not a movement-direction bypass.
-- The existing forge_world_v2.step_allowed / wall_passes is authoritative:
-- solid walls/closed doors continue to block movement in either direction.

CREATE OR REPLACE FUNCTION forge_world_v2.validate_motion_path_batch_b03(
 p_session uuid,
 p_seq bigint,
 p_from jsonb,
 p_targets jsonb,
 p_environment_revision bigint,
 p_permission_generation bigint)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $b03$
DECLARE
 s forge_world_v2.motion_sessions%ROWTYPE;
 scene jsonb;
 cells_w integer; cells_h integer;
 part jsonb; target jsonb; candidate jsonb; recent jsonb;
 token_row record; tool_row record; character_row record;
 piece_attrs jsonb;
 parts jsonb:='[]'::jsonb;
 accepted jsonb:='[]'::jsonb;
 routes jsonb;
 segment_start_x integer; segment_start_y integer;
 cursor_x integer; cursor_y integer;
 cell_x integer; cell_y integer;
 delta_x integer; delta_y integer;
 step_x integer; step_y integer;
 steps integer; needed integer:=0; processed integer:=0;
 i integer; blocked boolean:=false; valid boolean;
BEGIN
 -- Private invocation is not a bypass: same auth.uid, map, ownership,
 -- expiry, permission generation, environment revision and DM-override
 -- checks as public.advance_world_motion_v2.
 IF auth.uid() IS NULL OR p_session IS NULL OR p_seq IS NULL
    OR p_seq<1 OR p_environment_revision IS NULL
    OR p_permission_generation IS NULL
 THEN RETURN NULL; END IF;
 IF forge_world_v2.valid_point(p_from) IS DISTINCT FROM true
 THEN RETURN NULL; END IF;
 IF p_from IS DISTINCT FROM jsonb_build_object(
    'x',(p_from->>'x')::integer,'y',(p_from->>'y')::integer)
 THEN RETURN NULL; END IF;
 IF jsonb_typeof(p_targets) IS DISTINCT FROM 'array'
 THEN RETURN NULL; END IF;
 IF jsonb_array_length(p_targets) NOT BETWEEN 1 AND 8
 THEN RETURN NULL; END IF;

 -- Lock the exact, actor-owned session. This prevents a forged row argument
 -- from being used as authority and maintains one ordered advance at a time.
 SELECT * INTO s FROM forge_world_v2.motion_sessions motion
 WHERE motion.id=p_session AND motion.actor_id=auth.uid()
 FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF p_seq<>s.last_seq+1 OR s.batches>=64 OR
    s.attempted_cells>=128 OR
    s.environment_revision IS DISTINCT FROM p_environment_revision OR
    s.permission_generation IS DISTINCT FROM p_permission_generation OR
    forge_world_v2.session_valid(s) IS DISTINCT FROM true
 THEN RETURN NULL; END IF;
 IF (p_from->>'x')::integer<>s.last_x OR
    (p_from->>'y')::integer<>s.last_y
 THEN RETURN NULL; END IF;
 IF jsonb_typeof(s.selection) IS DISTINCT FROM 'array'
 THEN RETURN NULL; END IF;
 IF jsonb_array_length(s.selection) NOT BETWEEN 1 AND 48
 THEN RETURN NULL; END IF;
 IF s.dm_override AND NOT public.is_campaign_dm(s.campaign_id)
 THEN RETURN NULL; END IF;

 SELECT floor(m.width/m.grid_size)::integer,
        floor(m.height/m.grid_size)::integer
 INTO cells_w,cells_h FROM public.battle_maps m
 WHERE m.id=s.map_id AND m.campaign_id=s.campaign_id
   AND m.grid_size>0;
 IF NOT FOUND OR cells_w IS NULL OR cells_h IS NULL OR
    cells_w<1 OR cells_h<1 OR cells_w>10000 OR cells_h>10000
 THEN RETURN NULL; END IF;
 SELECT e.live INTO scene FROM public.map_environments e
 WHERE e.map_id=s.map_id AND e.campaign_id=s.campaign_id;
 -- Avoid a legacy NULL-scene behavior: SQL IF NULL does not enter a THEN.
 -- A collision-enforced published map MUST have a valid object array;
 -- otherwise wall iteration could be skipped and a route approved.
 IF s.collision_on AND NOT s.dm_override THEN
  IF scene IS NULL OR
     jsonb_typeof(scene->'objects') IS DISTINCT FROM 'array'
  THEN RETURN NULL; END IF;
  IF jsonb_array_length(scene->'objects')>120
  THEN RETURN NULL; END IF;
 END IF;

 -- Load only the selected, server-recorded pieces. Current attrs come from
 -- private authoritative rows, never from p_targets, caller JSON or visible
 -- player roster. Cache them ONCE per batch instead of per cell.
 FOR part IN SELECT value FROM jsonb_array_elements(s.selection) LOOP
  IF part->>'kind'='token' THEN
   SELECT t.character_id,t.npc_values INTO token_row
   FROM public.map_tokens t
   WHERE t.id=(part->>'id')::uuid
     AND t.map_id=s.map_id AND t.campaign_id=s.campaign_id;
   IF NOT FOUND THEN RETURN NULL; END IF;
   piece_attrs:=coalesce(token_row.npc_values,'{}'::jsonb);
   IF token_row.character_id IS NOT NULL THEN
    SELECT c.field_values INTO character_row FROM public.characters c
    WHERE c.id=token_row.character_id
      AND c.campaign_id=s.campaign_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    piece_attrs:=coalesce(character_row.field_values,'{}'::jsonb);
   END IF;
  ELSIF part->>'kind'='tool' THEN
   SELECT u.state,u.held_by_token_id INTO tool_row
   FROM public.campaign_tool_issues u
   WHERE u.id=(part->>'id')::uuid
     AND u.map_id=s.map_id AND u.campaign_id=s.campaign_id;
   IF NOT FOUND OR tool_row.held_by_token_id IS NOT NULL
   THEN RETURN NULL; END IF;
   piece_attrs:=coalesce(tool_row.state->'attrs','{}'::jsonb);
  ELSE
   RETURN NULL;
  END IF;
  -- Footprints and offsets are frozen by begin_world_motion_v2 and
  -- rechecked by session_valid. Collisions are evaluated for every piece.
  parts:=parts||jsonb_build_array(jsonb_build_object(
   'x',(part->>'x')::double precision,
   'y',(part->>'y')::double precision,
   'spanX',(part->>'spanX')::double precision,
   'spanY',(part->>'spanY')::double precision,
   'attrs',piece_attrs));
 END LOOP;

 cursor_x:=s.last_x;cursor_y:=s.last_y;
 routes:=s.accepted_steps;
 IF jsonb_typeof(routes) IS DISTINCT FROM 'array'
    OR jsonb_array_length(routes)>64
 THEN RETURN NULL; END IF;
 FOR target IN SELECT value FROM jsonb_array_elements(p_targets) LOOP
  IF forge_world_v2.valid_point(target) IS DISTINCT FROM true
  THEN RETURN NULL; END IF;
  IF target IS DISTINCT FROM jsonb_build_object(
     'x',(target->>'x')::integer,'y',(target->>'y')::integer)
  THEN RETURN NULL; END IF;
  segment_start_x:=cursor_x;segment_start_y:=cursor_y;
  delta_x:=(target->>'x')::integer-segment_start_x;
  delta_y:=(target->>'y')::integer-segment_start_y;
  steps:=greatest(abs(delta_x),abs(delta_y));
  IF steps=0 THEN CONTINUE; END IF;

  -- Strict per-packet and whole-session bounds. Rejected oversized batches
  -- never create a partial result outside the agreed transport contract.
  IF needed+steps>24 OR s.attempted_cells+needed+steps>128
  THEN RETURN NULL; END IF;
  needed:=needed+steps;
  FOR i IN 1..steps LOOP
   -- Same half-away-from-zero 8-connected interpolation as GesturePath.js
   -- and the existing advance_core_v2. No direct endpoint teleport.
   cell_x:=segment_start_x+
    sign(delta_x)*floor(abs(delta_x)::numeric*i/steps+0.5)::integer;
   cell_y:=segment_start_y+
    sign(delta_y)*floor(abs(delta_y)::numeric*i/steps+0.5)::integer;
   IF cell_x=cursor_x AND cell_y=cursor_y THEN CONTINUE; END IF;
   step_x:=cell_x-cursor_x;step_y:=cell_y-cursor_y;
   IF greatest(abs(step_x),abs(step_y))<>1
   THEN RETURN NULL; END IF;

   valid:=true;
   FOR candidate IN SELECT value FROM jsonb_array_elements(parts) LOOP
    IF forge_world_v2.step_allowed(
      scene,candidate->'attrs',
      (candidate->>'x')::double precision+(cursor_x-s.origin_x),
      (candidate->>'y')::double precision+(cursor_y-s.origin_y),
      (candidate->>'x')::double precision+(cell_x-s.origin_x),
      (candidate->>'y')::double precision+(cell_y-s.origin_y),
      (candidate->>'spanX')::double precision,
      (candidate->>'spanY')::double precision,
      cells_w,cells_h,s.collision_on AND NOT s.dm_override
    ) IS DISTINCT FROM true THEN valid:=false; EXIT; END IF;
   END LOOP;
   IF NOT valid THEN blocked:=true; EXIT; END IF;

   recent:=routes->(jsonb_array_length(routes)-1);
   IF jsonb_array_length(routes)>0 AND
      sign((recent->>'dx')::integer)=step_x AND
      sign((recent->>'dy')::integer)=step_y
   THEN
    routes:=jsonb_set(
      routes,array[(jsonb_array_length(routes)-1)::text],
      jsonb_build_object(
       'dx',(recent->>'dx')::integer+step_x,
       'dy',(recent->>'dy')::integer+step_y));
   ELSE
    IF jsonb_array_length(routes)>=64
    THEN blocked:=true; EXIT; END IF;
    routes:=routes||jsonb_build_array(
      jsonb_build_object('dx',step_x,'dy',step_y));
   END IF;
   accepted:=accepted||jsonb_build_array(
     jsonb_build_object('x',cell_x,'y',cell_y));
   cursor_x:=cell_x;cursor_y:=cell_y;processed:=processed+1;
  END LOOP;
  IF blocked THEN EXIT; END IF;
 END LOOP;

 -- No empty approved prefix on an unblocked no-op. A genuine blocked first
 -- step may return {blocked:true,accepted:[]} without revealing obstacle data.
 IF NOT blocked AND processed=0 THEN RETURN NULL; END IF;

 -- INTERNAL ONLY. Never expose routeSteps, selected attr cache or collision
 -- metadata from a public RPC. The eventual wrapper emits only the current
 -- public V2 ack shape and a separately filtered observer stream.
 RETURN jsonb_build_object(
  'accepted',accepted,
  'blocked',blocked,
  'endpoint',jsonb_build_object('x',cursor_x,'y',cursor_y),
  'routeSteps',routes,
  'attemptedCells',needed,
  'acceptedCells',processed);
END
$b03$;

-- Belt-and-suspenders denial: private schema USAGE is already revoked.
-- Integration may grant EXECUTE to an audited internal owner only; never to
-- anon/authenticated/Public or directly to a browser-exposed RPC.
REVOKE ALL ON FUNCTION forge_world_v2.validate_motion_path_batch_b03(
 uuid,bigint,jsonb,jsonb,bigint,bigint)
FROM PUBLIC,anon,authenticated;
