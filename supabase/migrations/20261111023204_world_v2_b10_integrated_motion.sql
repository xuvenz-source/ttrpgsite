-- Generated with official Supabase CLI 2.81.3 in isolated GitHub Actions
-- #42946657992 (B10_R05_CLI_GENERATED_PATH). This is a STAGED, NONAPPLIED
-- forward-only migration, NOT permission to run db push against live.
-- Five security-reviewed candidate bodies follow in strict dependency order.
-- CLI db push applies transactional migrations; do not set transaction=false.
-- No remote credentials, test user IDs, or public Realtime topics in this file.
-- Required paired client: VITE_WORLD_V2_OBSERVER_RECOVERY=1 must already
-- be running and verified for test viewers before this migration is applied.
-- Do not push all historical repo migrations: live history is alias-mismatched.
--
-- R05 preflight refuses partial installs, in-flight movements and unexpected
-- base RPC identities. Read-only exact live pg_proc digest checks are a
-- separate mandatory operator gate (see release-preflight SQL).
DO $world_v2_r05_pre$
DECLARE active_count integer;
BEGIN
 IF to_regclass('forge_world_v2.motion_sessions') IS NULL OR
  to_regclass('forge_world_v2.viewer_streams') IS NULL OR
  to_regprocedure('public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NULL OR
  to_regprocedure('public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)') IS NULL OR
  to_regprocedure('forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NULL OR
  to_regprocedure('forge_world_v2.publish_approved_observers(forge_world_v2.motion_sessions,jsonb,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'R05 stop: World Engine V2 base RPC/schema incomplete';END IF;
 IF to_regclass('forge_world_v2.observer_pending_b07') IS NOT NULL OR
  to_regclass('forge_world_v2.observer_budget_b07') IS NOT NULL OR
  to_regprocedure('forge_world_v2.validate_motion_path_batch_b03(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NOT NULL OR
  to_regprocedure('forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)') IS NOT NULL OR
  EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='forge_world_v2' AND table_name='motion_sessions'
      AND column_name IN ('last_advance_request_b08','last_commit_request_b08'))
 THEN RAISE EXCEPTION 'R05 stop: partial B03/B07/B08/R01/R03 install already present';END IF;
 IF has_schema_privilege('anon','forge_world_v2','USAGE') OR
  has_schema_privilege('authenticated','forge_world_v2','USAGE') OR
  has_function_privilege('anon',
    'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') OR
  NOT has_function_privilege('authenticated',
    'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'R05 stop: unexpected V2 browser role permissions';END IF;
 SELECT count(*) INTO active_count FROM forge_world_v2.motion_sessions
 WHERE status='active' AND expires_at>clock_timestamp();
 IF active_count>0 THEN
  RAISE EXCEPTION 'R05 stop: % active movement sessions; wait for idle fixture',active_count;
 END IF;
 RAISE NOTICE 'R05 live-shape preflight: no partial candidates or active motion';
END $world_v2_r05_pre$;

-- Preserve exact ORIGINAL in-place function sources for a future,
-- explicitly invoked forward recovery if a committed test rollout regresses.
-- Only platform owner/admin can read this private RLS-protected table; no
-- browser grants or policy are added. NO CREATE/DROP of production map data.
CREATE TABLE forge_world_v2.motion_r05_function_backup (
 signature text PRIMARY KEY,
 old_definition text NOT NULL CHECK(length(old_definition)>80),
 original_digest text NOT NULL CHECK(length(original_digest)=32),
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE forge_world_v2.motion_r05_function_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_world_v2.motion_r05_function_backup
 FROM PUBLIC,anon,authenticated;

INSERT INTO forge_world_v2.motion_r05_function_backup(
 signature,old_definition,original_digest)
SELECT x.signature,pg_get_functiondef(to_regprocedure(x.signature)),
 md5(pg_get_functiondef(to_regprocedure(x.signature)))
FROM (VALUES
 ('forge_world_v2.publish_approved_observers(forge_world_v2.motion_sessions,jsonb,jsonb)'),
 ('forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'),
 ('public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'),
 ('public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)')
) AS x(signature);
DO $world_v2_r05_backup$
BEGIN
 IF (SELECT count(*) FROM forge_world_v2.motion_r05_function_backup)<>4
  OR EXISTS(SELECT 1 FROM forge_world_v2.motion_r05_function_backup
   WHERE md5(old_definition)<>original_digest)
 THEN RAISE EXCEPTION 'R05 stop: incomplete original movement source backup';END IF;
 RAISE NOTICE 'R05 captured four original private/public function definitions for post-commit recovery';
END $world_v2_r05_backup$;

-- ================================================================
-- R05 SOURCE 1/5: supabase/candidates/world_v2_b03_path_validation.sql
-- GitHub verified blob SHA 4f35859f2e8b16fbc875a5f3b9701c80bde543e7
-- ================================================================
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

-- ================================================================
-- R05 SOURCE 2/5: supabase/candidates/world_v2_b07_private_observer_budget.sql
-- GitHub verified blob SHA 4e00a50dba4e8b78b4c151eaf1840db42e34be87
-- ================================================================
-- B07 NONAPPLIED SQL CANDIDATE. Staged under supabase/candidates ONLY.
-- Must NEVER be applied to production or automatically discovered as a migration.
-- Uses the unchanged, server-filtered V2 observer_path_status function;
-- all database/object authorization is inherited from the existing V2 RPC.
-- B08 must integrate final flush on successful commit and safe cancellation.
-- This candidate intentionally does not replace the public Commit RPC.
--
-- Realtime Free supports 100 messages/sec including delivered receiver
-- messages. 20 private publishes/sec is a conservative *movement-only*
-- global budget, NOT a hard cap on billed messages (multiple tabs and other
-- Realtime products also consume quota). Every recipient remains private.

CREATE TABLE forge_world_v2.observer_pending_b07(
 session_id uuid NOT NULL REFERENCES forge_world_v2.motion_sessions(id)
  ON DELETE CASCADE,
 viewer_id uuid NOT NULL,
 map_id uuid NOT NULL,campaign_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 environment_revision bigint NOT NULL,
 permission_generation bigint NOT NULL,
 pending jsonb NOT NULL DEFAULT '[]'::jsonb,
 -- Accepted batches are bounded at 64 per session and 128 attempted cells;
 -- backlog entries retain entire contiguous batches when a 25-point frame
 -- is full or the global movement message budget is exhausted.
 deferred jsonb NOT NULL DEFAULT '[]'::jsonb,
 last_sent_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(session_id,viewer_id),
 CHECK(jsonb_typeof(pending)='array'),
 CHECK(jsonb_array_length(pending)<=48),
 CHECK(jsonb_typeof(deferred)='array'),
 CHECK(jsonb_array_length(deferred)<=63)
);
CREATE INDEX observer_pending_b07_expiry ON
 forge_world_v2.observer_pending_b07(expires_at);
ALTER TABLE forge_world_v2.observer_pending_b07 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_world_v2.observer_pending_b07
 FROM PUBLIC,anon,authenticated;

CREATE TABLE forge_world_v2.observer_budget_b07(
 id smallint PRIMARY KEY CHECK(id=1),
 window_started timestamptz NOT NULL,
 emitted integer NOT NULL CHECK(emitted BETWEEN 0 AND 30)
);
ALTER TABLE forge_world_v2.observer_budget_b07 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_world_v2.observer_budget_b07
 FROM PUBLIC,anon,authenticated;
INSERT INTO forge_world_v2.observer_budget_b07(id,window_started,emitted)
 VALUES(1,'epoch'::timestamptz,0);

-- Use exact existing V2 motion wire grammar, not a newly invented packet.
-- Reject input even when supplied by an internal actor-owned routine.
CREATE OR REPLACE FUNCTION forge_world_v2.valid_observer_items_b07(
 p_items jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $b07$
DECLARE item jsonb;cell jsonb;previous jsonb;cnt integer;ids text[]:=ARRAY[]::text[];
 key text;uuid_text text;
BEGIN
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 48
 THEN RETURN false;END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR
   item->>'kind' NOT IN ('token','tool') OR
   item->>'action' NOT IN ('path','hide') OR
   (item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN RETURN false;END IF;
  key:=item->>'kind'||':'||(item->>'id')::uuid::text;
  IF key=ANY(ids) THEN RETURN false;END IF;
  ids:=array_append(ids,key);
  SELECT count(*) INTO cnt FROM jsonb_object_keys(item);
  IF item->>'action'='hide' THEN
   IF cnt<>3 OR item ? 'path' THEN RETURN false;END IF;
  ELSE
   IF cnt<>4 OR jsonb_typeof(item->'path') IS DISTINCT FROM 'array' OR
    jsonb_array_length(item->'path') NOT BETWEEN 2 AND 25
   THEN RETURN false;END IF;
   previous:=NULL;
   FOR cell IN SELECT value FROM jsonb_array_elements(item->'path') LOOP
    IF forge_world_v2.valid_point(cell) IS DISTINCT FROM true OR
     (SELECT count(*) FROM jsonb_object_keys(cell))<>2
    THEN RETURN false;END IF;
    IF previous IS NOT NULL AND
     greatest(abs((cell->>'x')::integer-(previous->>'x')::integer),
              abs((cell->>'y')::integer-(previous->>'y')::integer))<>1
    THEN RETURN false;END IF;
    previous:=cell;
   END LOOP;
  END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $b07$;

-- Merge only exact contiguous, already-authorized paths. An unseen actor
-- cannot become visible again through an old buffered hide; require a new
-- independently authorized sight/roster instead.
CREATE OR REPLACE FUNCTION forge_world_v2.merge_observer_items_b07(
 p_pending jsonb,p_next jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $b07$
DECLARE old jsonb;incoming jsonb;result jsonb:='[]'::jsonb;
 merged jsonb;path jsonb;found boolean;idx integer;
BEGIN
 IF NOT forge_world_v2.valid_observer_items_b07(p_next) OR
  (p_pending<>'[]'::jsonb AND
   NOT forge_world_v2.valid_observer_items_b07(p_pending))
 THEN RETURN NULL;END IF;
 IF p_pending='[]'::jsonb THEN RETURN p_next;END IF;
 FOR old IN SELECT value FROM jsonb_array_elements(p_pending) LOOP
  merged:=old;found:=false;
  FOR incoming IN SELECT value FROM jsonb_array_elements(p_next) LOOP
   IF incoming->>'kind'=old->>'kind' AND
      incoming->>'id'=old->>'id' THEN
    found:=true;
    IF incoming->>'action'='hide' THEN
     merged:=incoming;
    ELSIF old->>'action'='hide' THEN
     merged:=old;
    ELSE
     path:=old->'path';
     IF path->(jsonb_array_length(path)-1)<>incoming->'path'->0 OR
      jsonb_array_length(path)+jsonb_array_length(incoming->'path')-1>25
     THEN RETURN NULL;END IF;
     FOR idx IN 1..jsonb_array_length(incoming->'path')-1 LOOP
      path:=path||jsonb_build_array(incoming->'path'->idx);
     END LOOP;
     merged:=jsonb_set(old,'{path}',path);
    END IF;
    EXIT;
   END IF;
  END LOOP;
  result:=result||jsonb_build_array(merged);
 END LOOP;
 FOR incoming IN SELECT value FROM jsonb_array_elements(p_next) LOOP
  found:=false;
  FOR old IN SELECT value FROM jsonb_array_elements(p_pending) LOOP
   IF incoming->>'kind'=old->>'kind' AND
      incoming->>'id'=old->>'id' THEN found:=true;EXIT;END IF;
  END LOOP;
  IF NOT found THEN result:=result||jsonb_build_array(incoming);END IF;
 END LOOP;
 IF jsonb_array_length(result)>48 OR
  NOT forge_world_v2.valid_observer_items_b07(result)
 THEN RETURN NULL;END IF;
 RETURN result;
END $b07$;

-- Re-evaluate every buffered segment under the CURRENT viewer membership
-- and CURRENT server-side fog/LOS before any Realtime publication.
-- Returning status 0 silently discards an item; status 2 sends only hide.
CREATE OR REPLACE FUNCTION forge_world_v2.filter_pending_observer_b07(
 p_session forge_world_v2.motion_sessions,p_viewer uuid,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $b07$
DECLARE item jsonb;approved jsonb:='[]'::jsonb;scene jsonb;grid record;
 status integer;exists_selected boolean;piece_id uuid;
BEGIN
 IF p_session.actor_id IS DISTINCT FROM auth.uid() OR
  forge_world_v2.viewer_on_map(p_session.campaign_id,
   p_session.map_id,p_viewer) IS NULL OR
  NOT forge_world_v2.valid_observer_items_b07(p_items)
 THEN RETURN '[]'::jsonb;END IF;
 SELECT e.live INTO scene FROM public.map_environments e
 WHERE e.map_id=p_session.map_id AND e.campaign_id=p_session.campaign_id
  AND e.revision=p_session.environment_revision;
 IF NOT FOUND THEN RETURN '[]'::jsonb;END IF;
 SELECT m.grid_size,
  floor(m.width/m.grid_size)::integer AS width_cells,
  floor(m.height/m.grid_size)::integer AS height_cells
 INTO grid FROM public.battle_maps m
 WHERE m.id=p_session.map_id AND m.campaign_id=p_session.campaign_id
  AND m.grid_size>0;
 IF NOT FOUND THEN RETURN '[]'::jsonb;END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  piece_id:=(item->>'id')::uuid;
  SELECT EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_session.selection) sel
   WHERE sel->>'kind'=item->>'kind' AND
    (sel->>'id')::uuid=piece_id) INTO exists_selected;
  IF NOT exists_selected THEN CONTINUE;END IF;
  IF item->>'action'='hide' THEN
   -- A hide ID must have first been certified by the trusted publisher.
   -- No path or destination is exposed.
   approved:=approved||jsonb_build_array(item);
  ELSE
   status:=forge_world_v2.observer_path_status(
    p_session,p_viewer,item->>'kind',piece_id,item->'path',
    scene,grid.grid_size,grid.width_cells,grid.height_cells);
   IF status=1 THEN
    approved:=approved||jsonb_build_array(item);
   ELSIF status=2 THEN
    approved:=approved||jsonb_build_array(jsonb_build_object(
     'kind',item->>'kind','id',piece_id,'action','hide'));
   END IF;
  END IF;
 END LOOP;
 RETURN approved;
EXCEPTION WHEN others THEN RETURN '[]'::jsonb;
END $b07$;

-- Internal only. Mutable cursor and global free-tier budget are acquired
-- under a single database transaction/row lock before realtime.send.
-- If the publisher raises, the exception subtransaction rolls back cursor
-- and budget and the caller retains the queued progress for a later retry.
CREATE OR REPLACE FUNCTION forge_world_v2.flush_recipient_observer_b07(
 p_session forge_world_v2.motion_sessions,p_viewer uuid,
 p_now timestamptz DEFAULT clock_timestamp())
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $b07$
DECLARE q forge_world_v2.observer_pending_b07%ROWTYPE;
 filtered jsonb;budget forge_world_v2.observer_budget_b07%ROWTYPE;
 cursor bigint;outcome integer:=0;current_status text;
 max_sent integer:=20;
 current_permission bigint;current_revision bigint;
BEGIN
 IF auth.uid() IS NULL OR p_session.actor_id IS DISTINCT FROM auth.uid() OR
  p_viewer IS NULL OR p_now IS NULL THEN RETURN 0;END IF;
 SELECT * INTO q FROM forge_world_v2.observer_pending_b07
 WHERE session_id=p_session.id AND viewer_id=p_viewer FOR UPDATE;
 IF NOT FOUND OR q.pending='[]'::jsonb OR
  q.map_id IS DISTINCT FROM p_session.map_id OR
  q.campaign_id IS DISTINCT FROM p_session.campaign_id OR
  q.actor_id IS DISTINCT FROM p_session.actor_id OR
  q.environment_revision IS DISTINCT FROM p_session.environment_revision OR
  q.permission_generation IS DISTINCT FROM p_session.permission_generation OR
  p_now>q.expires_at
 THEN RETURN 0;END IF;
 SELECT ms.status INTO current_status
 FROM forge_world_v2.motion_sessions ms
 WHERE ms.id=p_session.id AND ms.actor_id=auth.uid();
 IF current_status NOT IN ('active','committed') THEN RETURN 0;END IF;
 SELECT e.revision INTO current_revision FROM public.map_environments e
 WHERE e.map_id=p_session.map_id AND e.campaign_id=p_session.campaign_id;
 SELECT g.generation INTO current_permission
 FROM forge_visibility.navigation_permission_generations g
 WHERE g.map_id=p_session.map_id;
 IF current_revision IS DISTINCT FROM p_session.environment_revision OR
  coalesce(current_permission,0) IS DISTINCT FROM p_session.permission_generation
  OR forge_world_v2.viewer_on_map(p_session.campaign_id,p_session.map_id,p_viewer) IS NULL
 THEN
  -- Revoked/invalid session: discard cached data; never replay it later.
  DELETE FROM forge_world_v2.observer_pending_b07
   WHERE session_id=p_session.id AND viewer_id=p_viewer;
  RETURN 0;
 END IF;
 filtered:=forge_world_v2.filter_pending_observer_b07(
  p_session,p_viewer,q.pending);
 IF jsonb_array_length(filtered)=0 THEN
  -- Even filtered-out stale/hidden paths must retire in queue order.
  UPDATE forge_world_v2.observer_pending_b07
   SET pending=CASE WHEN jsonb_array_length(q.deferred)>0
      THEN q.deferred->0 ELSE '[]'::jsonb END,
    deferred=CASE WHEN jsonb_array_length(q.deferred)>0
      THEN q.deferred-0 ELSE '[]'::jsonb END,
    updated_at=p_now
   WHERE session_id=p_session.id AND viewer_id=p_viewer;
  RETURN 0;
 END IF;
 BEGIN
  SELECT * INTO budget FROM forge_world_v2.observer_budget_b07
  WHERE id=1 FOR UPDATE;
  IF NOT FOUND THEN RETURN 0;END IF;
  IF p_now-budget.window_started>=interval '1 second' THEN
   UPDATE forge_world_v2.observer_budget_b07
    SET window_started=p_now,emitted=0 WHERE id=1;
   budget.emitted:=0;
  END IF;
  -- Reserve 20 movement broadcasts/sec, plus 10 priority hides/sec.
  -- This is NOT a full per-account Realtime billing quota guarantee.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(filtered) e
    WHERE e->>'action'='hide') THEN max_sent:=30;END IF;
  IF budget.emitted>=max_sent THEN RETURN 0;END IF;
  INSERT INTO forge_world_v2.viewer_streams(
   map_id,viewer_id,campaign_id,seq,updated_at)
  VALUES(p_session.map_id,p_viewer,p_session.campaign_id,1,p_now)
  ON CONFLICT(map_id,viewer_id) DO UPDATE
   SET seq=forge_world_v2.viewer_streams.seq+1,
    campaign_id=excluded.campaign_id,updated_at=p_now
  RETURNING seq INTO cursor;
  PERFORM realtime.send(jsonb_build_object(
   'version',2,'mapId',p_session.map_id,'viewerId',p_viewer,
   'seq',cursor,'environmentRevision',p_session.environment_revision,
   'permissionGeneration',p_session.permission_generation,
   'items',filtered),'world-motion-v2',
   'forge-world-v2:'||p_session.map_id::text||':'||p_viewer::text,true);
  UPDATE forge_world_v2.observer_budget_b07
  SET emitted=emitted+1 WHERE id=1;
  UPDATE forge_world_v2.observer_pending_b07
  SET pending=CASE WHEN jsonb_array_length(q.deferred)>0
      THEN q.deferred->0 ELSE '[]'::jsonb END,
    deferred=CASE WHEN jsonb_array_length(q.deferred)>0
      THEN q.deferred-0 ELSE '[]'::jsonb END,
    last_sent_at=p_now,updated_at=p_now
  WHERE session_id=p_session.id AND viewer_id=p_viewer;
  outcome:=1;
 EXCEPTION WHEN others THEN
  -- A failed/missing realtime partition cannot consume a stream cursor,
  -- lose pending authorized progress or fail canonical validation.
  RAISE WARNING 'B07 private observer dispatch deferred';
  outcome:=0;
 END;
 RETURN outcome;
END $b07$;

-- Called ONLY after the old observer publisher has built each per-viewer
-- ACL/LOS-filtered item. This helper cannot be a browser-authorized RPC.
CREATE OR REPLACE FUNCTION forge_world_v2.queue_recipient_observer_b07(
 p_session forge_world_v2.motion_sessions,p_viewer uuid,p_items jsonb,
 p_now timestamptz DEFAULT clock_timestamp())
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $b07$
DECLARE q forge_world_v2.observer_pending_b07%ROWTYPE;
 merged jsonb;new_deferred jsonb;
 count_sent integer:=0;has_hide boolean;last_index integer;
 hides jsonb;keep jsonb;other_items jsonb;frame jsonb;
 clean_deferred jsonb;piece record;
BEGIN
 IF auth.uid() IS NULL OR p_session.actor_id IS DISTINCT FROM auth.uid() OR
  p_session.status<>'active' OR
  forge_world_v2.session_valid(p_session) IS DISTINCT FROM true OR
  p_viewer=p_session.actor_id OR
  forge_world_v2.viewer_on_map(p_session.campaign_id,p_session.map_id,p_viewer) IS NULL OR
  NOT forge_world_v2.valid_observer_items_b07(p_items)
 THEN RETURN 0;END IF;
 -- Opportunistic, bounded TTL garbage collection: a stale/abandoned
 -- session cannot retain per-recipient accepted-path JSON forever.
 -- The session itself is already bounded to 60 seconds absolute TTL.
 IF NOT EXISTS(SELECT 1 FROM forge_world_v2.observer_pending_b07
   WHERE session_id=p_session.id AND viewer_id=p_viewer) THEN
  DELETE FROM forge_world_v2.observer_pending_b07
  WHERE (session_id,viewer_id) IN (
   SELECT expired.session_id,expired.viewer_id
   FROM forge_world_v2.observer_pending_b07 expired
   WHERE expired.expires_at<p_now ORDER BY expired.expires_at
   LIMIT 8);
 END IF;
 INSERT INTO forge_world_v2.observer_pending_b07(
  session_id,viewer_id,map_id,campaign_id,actor_id,
  environment_revision,permission_generation,pending,
  updated_at,expires_at)
 VALUES(p_session.id,p_viewer,p_session.map_id,p_session.campaign_id,
  p_session.actor_id,p_session.environment_revision,
  p_session.permission_generation,'[]'::jsonb,p_now,
  p_session.created_at+interval '60 seconds')
 ON CONFLICT(session_id,viewer_id) DO NOTHING;
 SELECT * INTO q FROM forge_world_v2.observer_pending_b07
 WHERE session_id=p_session.id AND viewer_id=p_viewer FOR UPDATE;
 IF NOT FOUND OR q.actor_id<>p_session.actor_id OR
  q.map_id<>p_session.map_id OR
  q.campaign_id<>p_session.campaign_id OR
  q.environment_revision<>p_session.environment_revision OR
  q.permission_generation<>p_session.permission_generation
 THEN RETURN 0;END IF;
 -- Never drop an accepted batch just because a previous 25-point
 -- recipient frame is full or no Realtime budget is currently available.
 -- The V2 session itself admits max 64 advances; first frame + 63 extra
 -- frames is a deterministic, bounded backlog. Pop in FIFO order.
 -- B08 hardening of the B07 candidate: a newly certified hide MUST
 -- supersede all unsent paths for that piece, including deep deferred FIFO.
 -- An old valid prefix must never be published after concealment. Keep
 -- unrelated piece paths in their original FIFO order behind the hide.
 SELECT coalesce(jsonb_agg(i.value ORDER BY i.ord),'[]'::jsonb)
 INTO hides FROM jsonb_array_elements(p_items) WITH ORDINALITY i(value,ord)
 WHERE i.value->>'action'='hide';
 IF hides<>'[]'::jsonb THEN
  SELECT coalesce(jsonb_agg(i.value ORDER BY i.ord),'[]'::jsonb)
  INTO keep FROM jsonb_array_elements(q.pending) WITH ORDINALITY i(value,ord)
  WHERE NOT EXISTS (
   SELECT 1 FROM jsonb_array_elements(hides) h
   WHERE h->>'kind'=i.value->>'kind' AND h->>'id'=i.value->>'id');
  clean_deferred:='[]'::jsonb;
  IF keep<>'[]'::jsonb THEN
   clean_deferred:=jsonb_build_array(keep);
  END IF;
  FOR frame IN SELECT value FROM jsonb_array_elements(q.deferred) LOOP
   SELECT coalesce(jsonb_agg(i.value ORDER BY i.ord),'[]'::jsonb)
   INTO keep FROM jsonb_array_elements(frame) WITH ORDINALITY i(value,ord)
   WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(hides) h
    WHERE h->>'kind'=i.value->>'kind' AND h->>'id'=i.value->>'id');
   IF keep<>'[]'::jsonb THEN
    clean_deferred:=clean_deferred||jsonb_build_array(keep);
   END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(i.value ORDER BY i.ord),'[]'::jsonb)
  INTO other_items FROM jsonb_array_elements(p_items) WITH ORDINALITY i(value,ord)
  WHERE i.value->>'action'<>'hide';
  IF other_items<>'[]'::jsonb THEN
   clean_deferred:=clean_deferred||jsonb_build_array(other_items);
  END IF;
  IF jsonb_array_length(clean_deferred)>63 THEN
   -- Never silently discard canonical path or hide information.
   RAISE EXCEPTION 'B07 hide priority queue capacity exhausted';
  END IF;
  UPDATE forge_world_v2.observer_pending_b07
  SET pending=hides,deferred=clean_deferred,updated_at=p_now
  WHERE session_id=p_session.id AND viewer_id=p_viewer;
  RETURN forge_world_v2.flush_recipient_observer_b07(
   p_session,p_viewer,p_now);
 END IF;
 new_deferred:=q.deferred;
 IF q.deferred='[]'::jsonb THEN
  merged:=forge_world_v2.merge_observer_items_b07(q.pending,p_items);
  IF merged IS NULL THEN
   IF jsonb_array_length(new_deferred)>=63 THEN
    RAISE EXCEPTION 'B07 bounded pending queue exhausted';
   END IF;
   merged:=q.pending;
   new_deferred:=jsonb_build_array(p_items);
  END IF;
 ELSE
  last_index:=jsonb_array_length(q.deferred)-1;
  merged:=forge_world_v2.merge_observer_items_b07(
   q.deferred->last_index,p_items);
  IF merged IS NULL THEN
   IF jsonb_array_length(new_deferred)>=63 THEN
    RAISE EXCEPTION 'B07 bounded pending queue exhausted';
   END IF;
   new_deferred:=new_deferred||jsonb_build_array(p_items);
  ELSE
   new_deferred:=jsonb_set(new_deferred,
    array[last_index::text],merged);
  END IF;
  merged:=q.pending;
 END IF;
 UPDATE forge_world_v2.observer_pending_b07
 SET pending=merged,deferred=new_deferred,updated_at=p_now
 WHERE session_id=p_session.id AND viewer_id=p_viewer;
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(merged) i
  WHERE i->>'action'='hide') INTO has_hide;
 -- First accepted motion goes out promptly. Subsequent progress accumulates
 -- at most 200ms; hide never waits for the normal cosmetic cadence.
 IF q.last_sent_at IS NULL OR
    p_now-q.last_sent_at>=interval '200 milliseconds' OR has_hide
 THEN
  count_sent:=count_sent+
   forge_world_v2.flush_recipient_observer_b07(p_session,p_viewer,p_now);
 END IF;
 RETURN count_sent;
END $b07$;

-- B08 integration prerequisite: after a VERIFIED successful final commit,
-- call flush_recipient_observer_b07 for each queued session viewer, then
-- delete session queue rows. On cancel/expiry/revocation, delete without
-- publishing stale uncommitted movement. This helper is not yet wired into
-- public.commit_world_motion_v2 and must not be treated as a release-ready
-- standalone migration.
CREATE OR REPLACE FUNCTION forge_world_v2.flush_session_observers_b07(
 p_session uuid,p_now timestamptz DEFAULT clock_timestamp())
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $b07$
DECLARE s forge_world_v2.motion_sessions%ROWTYPE;
 recipient record;sent integer:=0;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL THEN RETURN 0;END IF;
 SELECT * INTO s FROM forge_world_v2.motion_sessions
 WHERE id=p_session AND actor_id=auth.uid();
 IF NOT FOUND OR s.status<>'committed' THEN RETURN 0;END IF;
 FOR recipient IN
  SELECT q.viewer_id FROM forge_world_v2.observer_pending_b07 q
  WHERE q.session_id=p_session ORDER BY q.viewer_id
 LOOP
  sent:=sent+forge_world_v2.flush_recipient_observer_b07(
   s,recipient.viewer_id,p_now);
 END LOOP;
 -- Once the successful canonical commit has flushed every queued path,
 -- these private rows have no purpose; reclaim them immediately.
 -- A failed/budget-deferred packet stays queued and is NOT deleted.
 DELETE FROM forge_world_v2.observer_pending_b07
 WHERE session_id=p_session AND pending='[]'::jsonb
  AND deferred='[]'::jsonb;
 RETURN sent;
END $b07$;

-- Replacement of the existing private server-side recipient-LOS publisher.
-- Exact source-derived V2 selection, visibility, membership and fog checks
-- retained; ONLY the final realtime.send is replaced by bounded queueing.
CREATE OR REPLACE FUNCTION forge_world_v2.publish_approved_observers(
 p_session forge_world_v2.motion_sessions,p_from jsonb,p_accepted jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $b07_pub$
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
  sent:=sent+forge_world_v2.queue_recipient_observer_b07(
   p_session,audience.user_id,items);
 END LOOP;
 RETURN sent;
END $b07_pub$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_world_v2
 FROM PUBLIC,anon,authenticated;

-- ================================================================
-- R05 SOURCE 3/5: supabase/candidates/world_v2_b08_commit_reconciliation.sql
-- GitHub verified blob SHA ccaca6100c388ce5d2af45ee693e421392fbdad7
-- ================================================================
-- B08 NONAPPLIED SQL CANDIDATE. REQUIRES the complete B07 candidate first.
-- Staging only; not under supabase/migrations; do not apply to live Supabase.
-- Source-derived from the actual V2 public Advance wrapper and Commit RPC.
-- No new public RPC, role grant, Realtime topic or client-selected position.
-- Uses the same atomic checkpoint, sorted row locks and collision rechecks.
-- Supabase auth.uid(), current map authorization and current LOS still apply.
ALTER TABLE forge_world_v2.motion_sessions
 ADD COLUMN last_advance_request_b08 jsonb,
 ADD COLUMN last_commit_request_b08 jsonb;

CREATE OR REPLACE FUNCTION forge_world_v2.drain_committed_observers_b08(
 p_session uuid,p_now timestamptz DEFAULT clock_timestamp())
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $b08$
DECLARE s forge_world_v2.motion_sessions%ROWTYPE;
 recipient record; i integer; sent integer:=0;result integer;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR p_now IS NULL
 THEN RETURN 0;END IF;
 SELECT * INTO s FROM forge_world_v2.motion_sessions
 WHERE id=p_session AND actor_id=auth.uid() AND status='committed'
  AND p_now<=expires_at FOR UPDATE;
 IF NOT FOUND THEN RETURN 0;END IF;
 -- B07's flush rechecks the current viewer, scene, permission and LOS
 -- under its own locks. A budget outage leaves the exact FIFO intact.
 FOR recipient IN
  SELECT viewer_id FROM forge_world_v2.observer_pending_b07
  WHERE session_id=p_session ORDER BY viewer_id LIMIT 32
 LOOP
  -- Bounded: never turn terminal commit into 64 RPCs per viewer.
  FOR i IN 1..4 LOOP
   result:=forge_world_v2.flush_recipient_observer_b07(
    s,recipient.viewer_id,p_now);
   sent:=sent+result;
   EXIT WHEN result<>1;
  END LOOP;
 END LOOP;
 DELETE FROM forge_world_v2.observer_pending_b07
 WHERE session_id=p_session AND pending='[]'::jsonb
  AND deferred='[]'::jsonb;
 RETURN sent;
END $b08$;

-- Exact-payload sequence replay hardening for the existing public RPC.
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
 -- Bind replay to the EXACT previous request. Same sequence with a
 -- changed path, revisions or from-point is not an idempotent retry.
 IF p_seq<current_session.last_seq THEN RETURN NULL;END IF;
 IF p_seq=current_session.last_seq AND
   current_session.last_advance_request_b08 IS DISTINCT FROM
    jsonb_build_object('from',p_from,'targets',p_targets,
     'environmentRevision',p_environment_revision,
     'permissionGeneration',p_permission_generation)
 THEN RETURN NULL;END IF;
 before_seq:=current_session.last_seq;
 result:=forge_world_v2.advance_core_v2(
  p_session,p_seq,p_from,p_targets,
  p_environment_revision,p_permission_generation);
 IF result IS NULL THEN RETURN NULL;END IF;
 IF p_seq>before_seq THEN
  UPDATE forge_world_v2.motion_sessions
  SET last_advance_request_b08=jsonb_build_object(
    'from',p_from,'targets',p_targets,
    'environmentRevision',p_environment_revision,
    'permissionGeneration',p_permission_generation)
  WHERE id=p_session AND actor_id=auth.uid()
   AND status='active' AND last_seq=p_seq;
 END IF;
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

-- Atomic canonical commit and opportunistic, bounded observer drainage.
CREATE OR REPLACE FUNCTION public.commit_world_motion_v2(
 p_session uuid,p_seq bigint,p_endpoint jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE s forge_world_v2.motion_sessions%rowtype;
 part jsonb;token_ids uuid[]:=array[]::uuid[];tool_ids uuid[]:=array[]::uuid[];
 token_count integer;tool_count integer;step jsonb;cx integer;cy integer;
 revcheck jsonb;scene jsonb;attrs jsonb;grid record;t record;u record;
 endpoint_x integer;endpoint_y integer;reply jsonb;is_dm boolean;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR p_seq IS NULL OR
  NOT forge_world_v2.valid_point(p_endpoint) THEN RETURN NULL;END IF;
 SELECT * INTO s FROM forge_world_v2.motion_sessions
  WHERE id=p_session AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF s.status='committed' THEN
  -- A lost ACK may be retried with the SAME idempotency request; a
  -- different endpoint, sequence or revision must never reuse the ACK.
  IF s.last_seq IS DISTINCT FROM p_seq OR
    s.last_commit_request_b08 IS DISTINCT FROM
      jsonb_build_object('endpoint',p_endpoint,
       'environmentRevision',p_environment_revision,
       'permissionGeneration',p_permission_generation)
    OR clock_timestamp()>s.expires_at OR
    NOT public.can_view_campaign_map(s.campaign_id,s.map_id) OR
    (SELECT coalesce(g.generation,0)
     FROM forge_visibility.navigation_permission_generations g
     WHERE g.map_id=s.map_id) IS DISTINCT FROM s.permission_generation OR
    (SELECT e.revision FROM public.map_environments e
     WHERE e.map_id=s.map_id AND e.campaign_id=s.campaign_id)
     IS DISTINCT FROM s.environment_revision
   THEN RETURN NULL;END IF;
  -- Retry opportunistically drains retained private progress; it cannot
  -- write tokens twice or return a different canonical endpoint.
  BEGIN
   PERFORM forge_world_v2.drain_committed_observers_b08(s.id);
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'B08 observer terminal drain deferred';
  END;
  RETURN s.last_reply;
 END IF;
 IF p_seq<>s.last_seq+1 OR s.mode='preview' OR
   s.accepted_cells<1 OR s.accepted_steps='[]'::jsonb OR
   p_environment_revision IS DISTINCT FROM s.environment_revision OR
   p_permission_generation IS DISTINCT FROM s.permission_generation OR
   NOT forge_world_v2.session_valid(s) OR
   s.last_x<>(p_endpoint->>'x')::integer OR
   s.last_y<>(p_endpoint->>'y')::integer THEN RETURN NULL;END IF;
 -- Lock all selected rows in stable ID order before re-checking and writing.
 SELECT count(*) INTO token_count FROM (
  SELECT id FROM public.map_tokens WHERE map_id=s.map_id
   AND campaign_id=s.campaign_id AND
   id IN (SELECT (value->>'id')::uuid FROM
     jsonb_array_elements(s.selection) WHERE value->>'kind'='token')
   ORDER BY id FOR UPDATE
 ) owned;
 SELECT count(*) INTO tool_count FROM (
  SELECT id FROM public.campaign_tool_issues WHERE map_id=s.map_id
   AND campaign_id=s.campaign_id AND
   id IN (SELECT (value->>'id')::uuid FROM
     jsonb_array_elements(s.selection) WHERE value->>'kind'='tool')
   ORDER BY id FOR UPDATE
 ) owned;
 IF token_count<>(SELECT count(*) FROM jsonb_array_elements(s.selection)
   WHERE value->>'kind'='token')
 OR tool_count<>(SELECT count(*) FROM jsonb_array_elements(s.selection)
   WHERE value->>'kind'='tool')
 OR NOT forge_world_v2.session_valid(s) THEN RETURN NULL;END IF;
 SELECT e.live INTO scene FROM public.map_environments e WHERE e.map_id=s.map_id;
 SELECT floor(m.width/m.grid_size)::integer AS w,
  floor(m.height/m.grid_size)::integer AS h INTO grid FROM public.battle_maps m
  WHERE m.id=s.map_id AND m.campaign_id=s.campaign_id AND m.grid_size>0;
 IF NOT FOUND THEN RETURN NULL;END IF;
 -- Hold environment, rule and permission revisions stable for the commit
 -- transaction so a concurrent DM edit cannot race our last validation.
 PERFORM 1 FROM public.map_environments
  WHERE map_id=s.map_id AND campaign_id=s.campaign_id FOR SHARE;
 PERFORM 1 FROM forge_visibility.map_rules
  WHERE map_id=s.map_id FOR SHARE;
 PERFORM 1 FROM forge_visibility.navigation_permission_generations
  WHERE map_id=s.map_id FOR SHARE;
 IF NOT forge_world_v2.session_valid(s) THEN RETURN NULL;END IF;
 -- Independently verify all previously accepted legs against current scene.
 -- A stored approved route cannot bypass a changed rule or a bad endpoint.
 FOR part IN SELECT value FROM jsonb_array_elements(s.selection) LOOP
  attrs:='{}'::jsonb;
  IF part->>'kind'='token' THEN
   SELECT tok.character_id,tok.npc_values INTO t FROM public.map_tokens tok
    WHERE tok.id=(part->>'id')::uuid;
   attrs:=coalesce(t.npc_values,'{}'::jsonb);
   IF t.character_id IS NOT NULL THEN
    SELECT coalesce(ch.field_values,'{}'::jsonb) INTO attrs
    FROM public.characters ch WHERE ch.id=t.character_id AND ch.campaign_id=s.campaign_id;
   END IF;
   token_ids:=array_append(token_ids,(part->>'id')::uuid);
  ELSE
   SELECT coalesce(tool.state->'attrs','{}'::jsonb) INTO attrs
   FROM public.campaign_tool_issues tool WHERE tool.id=(part->>'id')::uuid;
   tool_ids:=array_append(tool_ids,(part->>'id')::uuid);
  END IF;
  cx:=(part->>'x')::integer;cy:=(part->>'y')::integer;
  FOR step IN SELECT value FROM jsonb_array_elements(s.accepted_steps) LOOP
   IF NOT forge_world_v2.step_allowed(scene,attrs,cx,cy,
     cx+(step->>'dx')::integer,cy+(step->>'dy')::integer,
     (part->>'spanX')::double precision,(part->>'spanY')::double precision,
     grid.w,grid.h,s.collision_on AND NOT s.dm_override)
   THEN RETURN NULL;END IF;
   cx:=cx+(step->>'dx')::integer;cy:=cy+(step->>'dy')::integer;
  END LOOP;
  IF cx<>(part->>'x')::integer+s.last_x-s.origin_x OR
   cy<>(part->>'y')::integer+s.last_y-s.origin_y THEN RETURN NULL;END IF;
 END LOOP;
 -- A trusted transaction checkpoint replaces every legacy GUC route hint.
 INSERT INTO forge_world_v2.commit_checkpoints(
  transaction_id,session_id,actor_id,campaign_id,map_id)
 VALUES(txid_current(),s.id,s.actor_id,s.campaign_id,s.map_id);
 UPDATE public.map_tokens tok SET x=tok.x+s.last_x-s.origin_x,
  y=tok.y+s.last_y-s.origin_y
 WHERE tok.id=ANY(token_ids) AND tok.map_id=s.map_id
  AND tok.campaign_id=s.campaign_id;
 UPDATE public.campaign_tool_issues tool SET
  x=tool.x+s.last_x-s.origin_x,
  y=tool.y+s.last_y-s.origin_y
 WHERE tool.id=ANY(tool_ids) AND tool.map_id=s.map_id
  AND tool.campaign_id=s.campaign_id;
 DELETE FROM forge_world_v2.commit_checkpoints
 WHERE transaction_id=txid_current() AND session_id=s.id;
 reply:=jsonb_build_object('version',2,'sessionId',s.id,'seq',p_seq,
  'endpoint',jsonb_build_object('x',s.last_x,'y',s.last_y));
 UPDATE forge_world_v2.motion_sessions SET status='committed',
  last_seq=p_seq,last_reply=reply,
  last_commit_request_b08=jsonb_build_object(
   'endpoint',p_endpoint,
   'environmentRevision',p_environment_revision,
   'permissionGeneration',p_permission_generation),
  expires_at=clock_timestamp()+interval '10 seconds'
 WHERE id=s.id;
 -- Canonical token/tool updates are already atomic. A private broadcast
 -- outage never undoes or duplicates the canonical commit.
 BEGIN
  PERFORM forge_world_v2.drain_committed_observers_b08(s.id);
 EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'B08 observer terminal drain deferred';
 END;
 RETURN reply;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_world_v2
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.commit_world_motion_v2(
 uuid,bigint,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_world_motion_v2(
 uuid,bigint,jsonb,bigint,bigint) TO authenticated;

-- ================================================================
-- R05 SOURCE 4/5: supabase/candidates/world_v2_b10_r01_core_path_integration.sql
-- GitHub verified blob SHA 08d06822582d6e1e878fc68ef09db3e2874ce1f0
-- ================================================================
-- B10-R01 STAGING CANDIDATE ONLY. NEVER RUN AGAINST LIVE SUPABASE.
-- Dependency: released World Engine V2, B03 candidate, B07 then B08 candidates.
-- This replaces the existing PRIVATE advance_core_v2 body, not public RPCs.
-- The existing public.advance_world_motion_v2 B08 wrapper retains:
-- actor-bound session + exact-payload replay, recipient-private LOS broadcast,
-- and the same result schema. No new GRANT, table, index or transport.
--
-- B03 is the sole newly accepted-path calculator for FRESH advances.
-- The old core's duplicated per-step attribute-fetch/collision loop is
-- removed; B03 reads actor-bound frozen selection and current server attrs
-- once per batch and returns only private route bookkeeping.
CREATE OR REPLACE FUNCTION forge_world_v2.advance_core_v2(
 p_session uuid,p_seq bigint,p_from jsonb,p_targets jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $b10_r01$
DECLARE
 s forge_world_v2.motion_sessions%ROWTYPE;
 candidate jsonb;
 accepted jsonb; steps jsonb; endpoint jsonb;
 attempted integer;processed integer;
 blocked boolean;reply jsonb;updated_session uuid;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR p_seq IS NULL OR
  forge_world_v2.valid_point(p_from) IS DISTINCT FROM true OR
  jsonb_typeof(p_targets) IS DISTINCT FROM 'array' OR
  jsonb_array_length(p_targets) NOT BETWEEN 1 AND 8
 THEN RETURN NULL;END IF;

 -- Preserve identical completed-Advance replay and reject any fresh
 -- request on a revoked/expired session. The public B08 wrapper owns the
 -- exact-payload idempotency fingerprint; private Core is not a public API.
 SELECT * INTO s FROM forge_world_v2.motion_sessions
 WHERE id=p_session AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF p_seq=s.last_seq AND s.last_reply IS NOT NULL THEN
  IF forge_world_v2.session_valid(s) IS TRUE THEN
   RETURN s.last_reply;
  END IF;
  RETURN NULL;
 END IF;
 IF p_seq<>s.last_seq+1 OR s.batches>=64 OR s.attempted_cells>=128 OR
  s.environment_revision IS DISTINCT FROM p_environment_revision OR
  s.permission_generation IS DISTINCT FROM p_permission_generation OR
  forge_world_v2.session_valid(s) IS DISTINCT FROM true
 THEN RETURN NULL;END IF;
 IF (p_from->>'x')::integer<>s.last_x OR
    (p_from->>'y')::integer<>s.last_y
 THEN RETURN NULL;END IF;

 -- B03 uses FOR UPDATE on the same owned session, current map/permission,
 -- current server-authored scene, frozen server-owned piece footprints and
 -- swept footprints at every intermediate tile. No UI-supplied collision.
 candidate:=forge_world_v2.validate_motion_path_batch_b03(
  p_session,p_seq,p_from,p_targets,
  p_environment_revision,p_permission_generation);
 IF candidate IS NULL OR
  jsonb_typeof(candidate) IS DISTINCT FROM 'object' OR
  candidate <> jsonb_strip_nulls(candidate) OR
  jsonb_typeof(candidate->'accepted') IS DISTINCT FROM 'array' OR
  jsonb_typeof(candidate->'routeSteps') IS DISTINCT FROM 'array' OR
  jsonb_typeof(candidate->'blocked') IS DISTINCT FROM 'boolean' OR
  forge_world_v2.valid_point(candidate->'endpoint') IS DISTINCT FROM true OR
  jsonb_typeof(candidate->'attemptedCells') IS DISTINCT FROM 'number' OR
  jsonb_typeof(candidate->'acceptedCells') IS DISTINCT FROM 'number'
 THEN RETURN NULL;END IF;

 -- Structural assertions make the public ack fail closed if a future
 -- internal candidate accidentally changes its contract.
 IF candidate <> jsonb_build_object(
  'accepted',candidate->'accepted',
  'blocked',candidate->'blocked',
  'endpoint',candidate->'endpoint',
  'routeSteps',candidate->'routeSteps',
  'attemptedCells',candidate->'attemptedCells',
  'acceptedCells',candidate->'acceptedCells')
 THEN RETURN NULL;END IF;

 attempted:=(candidate->>'attemptedCells')::integer;
 processed:=(candidate->>'acceptedCells')::integer;
 blocked:=(candidate->>'blocked')::boolean;
 accepted:=candidate->'accepted';
 steps:=candidate->'routeSteps';
 endpoint:=candidate->'endpoint';

 IF attempted<0 OR attempted>24 OR
  s.attempted_cells+attempted>128 OR
  processed<0 OR processed>attempted OR processed>24 OR
  processed<>jsonb_array_length(accepted) OR
  jsonb_array_length(steps)>64 OR
  (NOT blocked AND processed=0) OR
  (processed=0 AND endpoint IS DISTINCT FROM
   jsonb_build_object('x',s.last_x,'y',s.last_y)) OR
  (processed>0 AND endpoint IS DISTINCT FROM
   accepted->(jsonb_array_length(accepted)-1))
 THEN RETURN NULL;END IF;
 -- Route steps are never exposed to browser payloads; the public ACK is
 -- the same approved prefix, blocked flag and sequential identity as V2.
 reply:=jsonb_build_object(
  'version',2,'sessionId',s.id,'seq',p_seq,
  'blocked',blocked,'accepted',accepted);
 UPDATE forge_world_v2.motion_sessions
 SET last_x=(endpoint->>'x')::integer,
  last_y=(endpoint->>'y')::integer,
  last_seq=p_seq,
  accepted_steps=steps,
  accepted_cells=accepted_cells+processed,
  attempted_cells=attempted_cells+attempted,
  batches=batches+1,
  last_reply=reply,
  expires_at=least(created_at+interval '60 seconds',
   clock_timestamp()+interval '10 seconds')
 WHERE id=s.id AND actor_id=auth.uid() AND status='active'
  AND last_seq=s.last_seq AND environment_revision=p_environment_revision
  AND permission_generation=p_permission_generation
 RETURNING id INTO updated_session;
 IF updated_session IS NULL THEN RETURN NULL;END IF;
 RETURN reply;
END
$b10_r01$;

-- No schema USAGE or EXECUTE to browsers. Existing public RPC grants
-- continue to be governed by B08. Do not revoke public.advance_*.
REVOKE ALL ON FUNCTION forge_world_v2.advance_core_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint)
FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION forge_world_v2.validate_motion_path_batch_b03(
 uuid,bigint,jsonb,jsonb,bigint,bigint)
FROM PUBLIC,anon,authenticated;

-- ================================================================
-- R05 SOURCE 5/5: supabase/candidates/world_v2_b10_r03_terminal_queue_retirement.sql
-- GitHub verified blob SHA 40a3e7127878a648822ca097713d53c05e840587
-- ================================================================
-- B10-R03 STAGING ONLY. Dependencies: source-real B03 -> B07 -> B08 -> R01.
-- NEVER run on live Supabase without a versioned release migration and
-- explicit protected-map DM/P1/P2 acceptance evidence.
--
-- Defect: B08 preserves unsent path frames after a successful canonical
-- Commit when the global Realtime allowance is exhausted. An identical
-- Commit ACK retry can publish these OLD routes after a newer signed
-- canonical sight, including an equal-origin return path. A client cannot
-- infer the source session of the old frame from its authorized coordinate.
--
-- Resolution: drain at most four frames ONCE inside the successful Commit,
-- then permanently retire all unsent *path* frames for this terminal session.
-- Retain only previously certified, bounded, deduplicated hide items in a
-- private queue, for an opportunistic future authorized retry. A current
-- signed get_world_visibility_v2 provides canonical endpoint/roster and
-- conceals hidden actors even if the physical broadcast budget is depleted.
--
-- Wire remains version 2; public RPC, RLS grants, session/recipient identities,
-- Realtime topics and canonical map-token mutations are UNCHANGED.
CREATE OR REPLACE FUNCTION forge_world_v2.drain_committed_observers_b08(
 p_session uuid,p_now timestamptz DEFAULT clock_timestamp())
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $b10_r03$
DECLARE s forge_world_v2.motion_sessions%ROWTYPE;
 recipient record;pending_row forge_world_v2.observer_pending_b07%ROWTYPE;
 i integer;sent integer:=0;result integer;
 hides jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR p_now IS NULL
 THEN RETURN 0;END IF;
 SELECT * INTO s FROM forge_world_v2.motion_sessions
 WHERE id=p_session AND actor_id=auth.uid() AND status='committed'
  AND p_now<=expires_at FOR UPDATE;
 IF NOT FOUND THEN RETURN 0;END IF;

 -- Preserve B08's bounded same-transaction final flush ON THE FIRST COMMIT:
 -- a live Realtime budget can still finish at most four real approved frames
 -- per recipient. Nothing is ever sent until B07 independently checks
 -- current recipient membership, map, environment, generation and LOS.
 BEGIN
  FOR recipient IN
   SELECT viewer_id FROM forge_world_v2.observer_pending_b07
   WHERE session_id=p_session ORDER BY viewer_id LIMIT 32
  LOOP
   FOR i IN 1..4 LOOP
    result:=forge_world_v2.flush_recipient_observer_b07(
     s,recipient.viewer_id,p_now);
    sent:=sent+result;
    EXIT WHEN result<>1;
   END LOOP;
  END LOOP;
 EXCEPTION WHEN OTHERS THEN
  -- B08's public Commit intentionally does NOT roll back canonical data
  -- for broadcaster outages. Even if terminal flushing fails unexpectedly,
  -- continue retiring unsent old paths before returning to that wrapper.
  RAISE WARNING 'B10-R03 terminal path publication deferred';
 END;

 -- Terminal canonical sight must supersede remaining old unsent routes.
 -- This loop covers ALL rows, not just the 32 direct recipients, so an
 -- unexpected stale queue can never be left for a later B08 ACK retry.
 FOR pending_row IN
  SELECT * FROM forge_world_v2.observer_pending_b07
  WHERE session_id=p_session ORDER BY viewer_id FOR UPDATE
 LOOP
  -- An unrelated or stale queue is never eligible for later delivery.
  IF pending_row.actor_id IS DISTINCT FROM s.actor_id OR
    pending_row.campaign_id IS DISTINCT FROM s.campaign_id OR
    pending_row.map_id IS DISTINCT FROM s.map_id OR
    pending_row.environment_revision IS DISTINCT FROM s.environment_revision OR
    pending_row.permission_generation IS DISTINCT FROM s.permission_generation OR
    p_now>pending_row.expires_at
  THEN
   DELETE FROM forge_world_v2.observer_pending_b07
   WHERE session_id=p_session AND viewer_id=pending_row.viewer_id;
   CONTINUE;
  END IF;

  -- Merge all certified hide items from pending + bounded deferred FIFO.
  -- Distinct by (kind,id); never preserve any path or its coordinates.
  -- A hide can be valid only for a piece the original publisher selected.
  SELECT coalesce(jsonb_agg(h.item ORDER BY h.kind,h.id),'[]'::jsonb)
  INTO hides
  FROM (
   SELECT DISTINCT ON (v.item->>'kind',v.item->>'id')
    v.item, v.item->>'kind' AS kind,v.item->>'id' AS id
   FROM (
    SELECT value AS item
    FROM jsonb_array_elements(pending_row.pending)
    UNION ALL
    SELECT entry.value AS item
    FROM jsonb_array_elements(pending_row.deferred) frame
    CROSS JOIN LATERAL jsonb_array_elements(frame.value) entry
   ) v
   WHERE v.item->>'action'='hide'
   ORDER BY v.item->>'kind',v.item->>'id'
  ) h;
  IF hides='[]'::jsonb THEN
   DELETE FROM forge_world_v2.observer_pending_b07
   WHERE session_id=p_session AND viewer_id=pending_row.viewer_id;
   CONTINUE;
  END IF;
  -- Fail closed rather than truncate an overflowed private hide set.
  IF jsonb_array_length(hides)>48 OR
   forge_world_v2.valid_observer_items_b07(hides) IS DISTINCT FROM true
  THEN
   DELETE FROM forge_world_v2.observer_pending_b07
   WHERE session_id=p_session AND viewer_id=pending_row.viewer_id;
   CONTINUE;
  END IF;
  UPDATE forge_world_v2.observer_pending_b07
  SET pending=hides,deferred='[]'::jsonb,updated_at=p_now
  WHERE session_id=p_session AND viewer_id=pending_row.viewer_id;
  -- Best effort for certified hides under B07's separate priority budget.
  -- If the budget is exhausted, retain *hides only* until actor exact retry;
  -- R02 signed canonical sight will independently revoke hidden pieces.
  BEGIN
   sent:=sent+forge_world_v2.flush_recipient_observer_b07(
    s,pending_row.viewer_id,p_now);
  EXCEPTION WHEN OTHERS THEN
   -- Only certified coordinate-free hides remain, so a failed send may
   -- safely wait for a future signed sight/identical ACK retry.
   RAISE WARNING 'B10-R03 certified hide dispatch deferred';
  END;
 END LOOP;
 DELETE FROM forge_world_v2.observer_pending_b07
 WHERE session_id=p_session AND pending='[]'::jsonb
  AND deferred='[]'::jsonb;
 RETURN sent;
END $b10_r03$;

-- Private function only: never expose a new schema API or widen grants.
REVOKE ALL ON FUNCTION forge_world_v2.drain_committed_observers_b08(
 uuid,timestamptz)
FROM PUBLIC,anon,authenticated;

-- R05 final contract verifier: abort the migration transaction on a partial
-- or insecure installation; never expose private actor/session geometry.
DO $world_v2_r05_post$
BEGIN
 IF to_regclass('forge_world_v2.observer_pending_b07') IS NULL OR
  to_regclass('forge_world_v2.observer_budget_b07') IS NULL OR
  to_regprocedure('forge_world_v2.validate_motion_path_batch_b03(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NULL OR
  to_regprocedure('forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)') IS NULL OR
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='forge_world_v2' AND table_name='motion_sessions'
      AND column_name IN ('last_advance_request_b08','last_commit_request_b08'))<>2
 THEN RAISE EXCEPTION 'R05 stop: incomplete integrated candidate install';END IF;
 IF to_regclass('forge_world_v2.motion_r05_function_backup') IS NULL OR
  NOT (SELECT relrowsecurity FROM pg_class WHERE oid=
   'forge_world_v2.motion_r05_function_backup'::regclass) OR
  (SELECT count(*) FROM forge_world_v2.motion_r05_function_backup)<>4
 THEN RAISE EXCEPTION 'R05 stop: original function source backup is absent/unprotected';END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=
    'forge_world_v2.observer_pending_b07'::regclass) OR
  NOT (SELECT relrowsecurity FROM pg_class WHERE oid=
    'forge_world_v2.observer_budget_b07'::regclass) OR
  has_schema_privilege('anon','forge_world_v2','USAGE') OR
  has_schema_privilege('authenticated','forge_world_v2','USAGE') OR
  has_function_privilege('anon',
    'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') OR
  NOT has_function_privilege('authenticated',
    'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') OR
  NOT has_function_privilege('authenticated',
    'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'R05 stop: private RLS or RPC grants regression';END IF;
 IF position('validate_motion_path_batch_b03' IN pg_get_functiondef(
  'forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'::regprocedure))=0 OR
  position('drain_committed_observers_b08' IN pg_get_functiondef(
  'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'::regprocedure))=0 OR
  position('jsonb_agg' IN pg_get_functiondef(
  'forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)'::regprocedure))=0
 THEN RAISE EXCEPTION 'R05 stop: authority, canonical Commit or hide-only terminal retirement not wired';END IF;
 RAISE NOTICE 'R05 integrated private motion, replay, scope and terminal retirement PASS';
END $world_v2_r05_post$;
