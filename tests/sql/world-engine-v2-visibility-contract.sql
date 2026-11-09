-- V2 Phase 7 independent sight + exploration + RLS contract.
-- Runs ONLY in disposable PostgreSQL 17 with synthetic actors.
DO $$
BEGIN
 IF has_function_privilege('anon',
  'public.get_world_visibility_v2(uuid)','EXECUTE') OR
  has_function_privilege('anon',
   'public.preview_world_visibility_v2(uuid,uuid)','EXECUTE') OR
  has_function_privilege('authenticated',
   'forge_world_v2.visibility_frame_v2(uuid,uuid,boolean)','EXECUTE') OR
  has_table_privilege('authenticated','forge_world_v2.vision_epochs','SELECT') OR
  has_table_privilege('authenticated','forge_visibility.exploration','SELECT')
 THEN RAISE EXCEPTION 'Phase 7 sight secrets or helper privileges exposed';END IF;
END $$;

-- Build a real published test map: opaque wall x4, static light beyond x4,
-- dark ambient, one nearby loose torch, one torch held by a player token.
UPDATE public.map_environments SET live='{
 "version":1,"ambient":0,
 "fog":{"automatic":true,"partyShared":false},
 "collision":{"enabled":true},
 "objects":[
  {"id":"secret-wall","type":"wall","points":[{"x":4,"y":0},{"x":4,"y":10}],
    "blocksMovement":true,"blocksLight":true,
    "vision":"block","oneWay":"a-to-b"},
  {"id":"secret-light","type":"light","x":8,"y":6,
   "enabled":true,"bright":20,"dim":10,"intensity":100}
 ]
}'::jsonb,revision=revision+1
WHERE map_id='10000000-0000-4000-8000-000000000001';
UPDATE forge_visibility.map_rules SET fog_enforced=true,
 collision_enforced=true,updated_at=now()
WHERE map_id='10000000-0000-4000-8000-000000000001';
-- DM conceals the second player's existing token.
UPDATE public.map_tokens SET visible=false
WHERE id='40000000-0000-4000-8000-000000000002';

DO $$
DECLARE s jsonb;pass boolean;
BEGIN
 SELECT live INTO s FROM public.map_environments WHERE
 map_id='10000000-0000-4000-8000-000000000001';
 IF NOT forge_world_v2.ray_blocked_v2(
  s,2.5,4.5,5.5,4.5,'vision','{}'::jsonb) OR
  NOT forge_world_v2.ray_blocked_v2(
  s,8,6,2.5,6,'light','{}'::jsonb)
 THEN RAISE EXCEPTION 'Opaque wall leaks light or vision';END IF;
 IF forge_world_v2.is_lit_v2(s,
  '[{"x":8,"y":6,"reach":20}]',2.5,4.5,2.5,7)
 THEN
  -- This target is outside personal light, and the distant static lamp
  -- is blocked by the solid wall.
  RAISE EXCEPTION 'Bad lighting test fixture';END IF;
END $$;

-- Glass passes vision/light but remains solid for movement.
DO $$
DECLARE s jsonb:='{"objects":[{"type":"window","state":"closed",
 "vision":"pass","blocksLight":false,"blocksMovement":true,
 "points":[{"x":4,"y":0},{"x":4,"y":10}]}]}'::jsonb;
BEGIN
 IF forge_world_v2.ray_blocked_v2(s,2,4,6,4,'vision') OR
    forge_world_v2.ray_blocked_v2(s,2,4,6,4,'light')
 THEN RAISE EXCEPTION 'Glass improperly blocks clear rays';END IF;
 s:=jsonb_set(s,'{objects,0,curtains}','true'::jsonb);
 IF NOT forge_world_v2.ray_blocked_v2(s,2,4,6,4,'light') OR
    NOT forge_world_v2.ray_blocked_v2(s,2,4,6,4,'vision')
 THEN RAISE EXCEPTION 'Curtains do not obscure glass';END IF;
 s:=jsonb_set(s,'{objects,0,state}','"open"'::jsonb);
 IF forge_world_v2.ray_blocked_v2(s,2,4,6,4,'light')
 THEN RAISE EXCEPTION 'Open window still blocks light';END IF;
END $$;

-- DM preview player sight without writing any exploration.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $$
DECLARE f jsonb;
BEGIN
 f:=public.preview_world_visibility_v2(
 '10000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001');
 IF f->>'enabled'<>'true' OR
  f->>'viewerId'<>'30000000-0000-4000-8000-000000000001'
  OR f->>'width'<>'10' OR f->>'height'<>'10' OR
  f->'visible' IS NULL OR f->'explored' IS NULL OR
  NOT (f->'visible' @> '[42]'::jsonb) OR
  f->'visible' @> '[45]'::jsonb OR
  f::text LIKE '%secret-wall%' OR
  f::text LIKE '%secret-light%'
 THEN RAISE EXCEPTION 'DM player preview not viewer-effective: %',f;END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM forge_visibility.exploration)
 THEN RAISE EXCEPTION 'DM preview wrote player explored history';END IF;
END $$;

-- Real player obtains only the current viewer mask and visible entity IDs.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE f jsonb;second jsonb;
BEGIN
 f:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001');
 IF f IS NULL OR f->>'version'<>'2' OR f->>'enabled'<>'true'
  OR f->'visible' @> '[45]'::jsonb OR
  NOT (f->'visible' @> '[42]'::jsonb) OR
  NOT (f->'explored' @> '[42]'::jsonb) OR
  f::text LIKE '%secret-wall%' OR f::text LIKE '%secret-light%'
  OR f::text LIKE '%npc_values%' OR
  f::text LIKE '%raw%' OR
  f->>'sceneGeneration' IS NULL OR f->>'visionEpoch'<>'0'
 THEN RAISE EXCEPTION 'Incorrect player authorized frame: %',f;END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(f->'visiblePieces') obj
  WHERE obj->>'id'='40000000-0000-4000-8000-000000000001')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(f->'visiblePieces') obj
  WHERE obj->>'id'='40000000-0000-4000-8000-000000000002')
 THEN RAISE EXCEPTION 'Hidden entity leaked or owner invisible: %',f;END IF;
 second:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001');
 IF f->'visible' IS DISTINCT FROM second->'visible'
 THEN RAISE EXCEPTION 'Stationary map fog jitters across snapshots';END IF;

END $$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT revision FROM forge_visibility.exploration ex WHERE
 ex.user_id='30000000-0000-4000-8000-000000000001')<>0
 THEN RAISE EXCEPTION 'Idempotent fog wrote redundant exploration revision';END IF;
END $$;

-- DM sees all entities, including explicitly DM-hidden NPC and all map cells
-- without any player scope or leaked prepared editing state.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $$
DECLARE f jsonb;
BEGIN
 f:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001');
 IF f->>'enabled'<>'false' OR f->'visible'<>'[]'::jsonb OR
  f->'explored'<>'[]'::jsonb OR
  NOT EXISTS(SELECT 1 FROM jsonb_array_elements(f->'visiblePieces') obj
   WHERE obj->>'id'='40000000-0000-4000-8000-000000000002')
 THEN RAISE EXCEPTION 'DM full map visibility unavailable: %',f;END IF;
END $$;
RESET ROLE;

-- Player assigned to a different map cannot request, preview or enumerate
-- anyone's sight frame, regardless of guesses about map UUIDs.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000002';
DO $$
BEGIN
 IF public.get_world_visibility_v2(
 '10000000-0000-4000-8000-000000000001') IS NOT NULL OR
 public.preview_world_visibility_v2(
 '10000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001') IS NOT NULL
 THEN RAISE EXCEPTION 'Other map or DM impersonation accepted';END IF;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$
BEGIN
 BEGIN
  PERFORM public.get_world_visibility_v2(
   '10000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'Anon queried privileged sight';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;

-- In-flight approved V2 movement updates the owner's sight BEFORE the
-- canonical commit, with a single private vision notice per approved batch.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE s uuid;ack jsonb;f jsonb;
BEGIN
 s:=(public.begin_world_motion_v2(
  '10000000-0000-4000-8000-000000000001',
  '[{"kind":"token","id":"40000000-0000-4000-8000-000000000001"}]',
  '{"x":2,"y":4}','drag',9,4)->>'sessionId')::uuid;
 IF s IS NULL THEN RAISE EXCEPTION 'Phase 7 owner movement not allowed';END IF;
 ack:=public.advance_world_motion_v2(s,1,'{"x":2,"y":4}',
  '[{"x":3,"y":4}]',9,4);
 IF ack->>'blocked'<>'false' THEN
  RAISE EXCEPTION 'Phase 7 legal owner move rejected: %',ack;END IF;
 f:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001');
 IF f->>'visionEpoch'<>'1' OR
  NOT EXISTS(SELECT 1 FROM jsonb_array_elements(f->'visiblePieces') item
    WHERE item->>'id'='40000000-0000-4000-8000-000000000001'
    AND item->>'x'='3')
 THEN RAISE EXCEPTION 'In-flight approved token not tracked in sight: %',f;END IF;
 ack:=public.advance_world_motion_v2(s,1,'{"x":2,"y":4}',
  '[{"x":3,"y":4}]',9,4);
 IF ack->>'seq'<>'1'
 THEN RAISE EXCEPTION 'Duplicate move changed ACK sequence';END IF;
 ack:=public.commit_world_motion_v2(s,2,'{"x":3,"y":4}',9,4);
 IF ack->'endpoint'<>'{"x":3,"y":4}'::jsonb
 THEN RAISE EXCEPTION 'Phase 7 commit failed: %',ack;END IF;
END $$;
RESET ROLE;
DO $$
DECLARE msg jsonb;
BEGIN
 IF (SELECT count(*) FROM realtime.messages WHERE
 event='world-vision-v2')<>1 OR
  (SELECT epoch FROM forge_world_v2.vision_epochs
   WHERE viewer_id='30000000-0000-4000-8000-000000000001')<>1
 THEN RAISE EXCEPTION 'Expected exactly one owner vision invalidation';END IF;
 SELECT payload INTO msg FROM realtime.messages
 WHERE event='world-vision-v2' LIMIT 1;
 IF msg->>'viewerId'<>'30000000-0000-4000-8000-000000000001'
 OR msg->>'visionEpoch'<>'1'
 OR msg ? 'visible' OR msg ? 'explored'
 OR msg ? 'x' OR msg ? 'y' OR msg ? 'tokenId' OR
 msg::text LIKE '%secret-wall%'
 THEN RAISE EXCEPTION 'Private vision notice leaked geometry: %',msg;END IF;
END $$;

-- Long-term discovery remains in persisted map exploration, not in a
-- transient movement preview or a static map environment revision.
DO $$
DECLARE discovered integer;stored_rev bigint;
BEGIN
 SELECT jsonb_array_length(explored_cells),revision
 INTO discovered,stored_rev FROM forge_visibility.exploration
 WHERE map_id='10000000-0000-4000-8000-000000000001'
 AND user_id='30000000-0000-4000-8000-000000000001';
 IF discovered<1 OR stored_rev<0 THEN
  RAISE EXCEPTION 'Per-map explored history not retained';END IF;
 IF (SELECT revision FROM public.map_environments WHERE
 map_id='10000000-0000-4000-8000-000000000001')<>9
 THEN RAISE EXCEPTION 'A token movement republished map geometry';END IF;
END $$;

SELECT 'world-engine-v2-visibility-contract-passed' AS result;


-- A DM-moving player token must change the PLAYER'S authorized sight,
-- not just the DM's local view. Carrying a torch follows the moving token
-- even before the final canonical write, without trusting client previews.
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $$
DECLARE s uuid;ack jsonb;
BEGIN
 s:=(public.begin_world_motion_v2(
  '10000000-0000-4000-8000-000000000001',
  '[{"kind":"token","id":"40000000-0000-4000-8000-000000000001"}]',
  '{"x":3,"y":4}','drag',9,4)->>'sessionId')::uuid;
 IF s IS NULL THEN RAISE EXCEPTION 'DM could not move player token';END IF;
 ack:=public.advance_world_motion_v2(s,1,'{"x":3,"y":4}',
  '[{"x":3,"y":5}]',9,4);
 IF ack->>'blocked'<>'false' THEN
  RAISE EXCEPTION 'DM authorized movement denied: %',ack;END IF;
 PERFORM set_config('fixture.dm_session_id',s::text,false);
 -- Keep session pending for an independent player-user snapshot below.
END $$;
RESET ROLE;
DO $$
DECLARE scene jsonb;lights jsonb;
BEGIN
 SELECT e.live INTO scene FROM public.map_environments e
 WHERE e.map_id='10000000-0000-4000-8000-000000000001';
 lights:=forge_world_v2.light_sources_v2(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',scene);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lights) l
  WHERE (l->>'x')::numeric=3.5 AND (l->>'y')::numeric=5.5
    AND (l->>'reach')::numeric=4)
 THEN RAISE EXCEPTION 'Carried torch did not follow DM-approved token: %',
  lights;END IF;
END $$;
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE f jsonb;
BEGIN
 f:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001');
 IF f->>'visionEpoch'<>'2' OR NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(f->'visiblePieces') p
   WHERE p->>'id'='40000000-0000-4000-8000-000000000001'
    AND p->>'x'='3' AND p->>'y'='5')
 THEN RAISE EXCEPTION 'Player missed DM moving their vision token: %',f;END IF;
END $$;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
DO $$
DECLARE session_id uuid;ack jsonb;
BEGIN
 session_id:=nullif(
  current_setting('fixture.dm_session_id',true),'')::uuid;
 -- No direct client access to sessions; verify final persistence as owner
 -- through its original server-issued commit.
 IF session_id IS NULL THEN
  RAISE EXCEPTION 'DM session disappeared before commit';END IF;
 ack:=public.commit_world_motion_v2(session_id,2,'{"x":3,"y":5}',9,4);
 IF ack->'endpoint'<>'{"x":3,"y":5}'::jsonb
 THEN RAISE EXCEPTION 'DM final commit failed: %',ack;END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.messages
 WHERE event='world-vision-v2')<>2
 THEN RAISE EXCEPTION 'DM movement must signal owner but not other map';END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages m
 WHERE m.event='world-vision-v2' AND
 m.payload->>'viewerId'='30000000-0000-4000-8000-000000000002')
 THEN RAISE EXCEPTION 'Out-of-map viewer was signalled';END IF;
END $$;

-- Party-shared sight unions allowed player SOURCES, not raw wall data.
-- A teammate standing beyond the wall reveals that side to the party.
UPDATE public.campaign_player_maps SET
 map_id='10000000-0000-4000-8000-000000000001'
WHERE user_id='30000000-0000-4000-8000-000000000002';
INSERT INTO public.map_tokens(
 id,campaign_id,map_id,owner_id,x,y,visible,span_x,span_y
) VALUES(
 '40000000-0000-4000-8000-00000000000a',
 '20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000002',
 8,8,true,1,1
);
UPDATE public.map_environments SET live=jsonb_set(
 live,'{fog,partyShared}','true'::jsonb),
 revision=revision+1
WHERE map_id='10000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
DO $$
DECLARE f jsonb;
BEGIN
 f:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001');
 IF f->>'partyShared'<>'true' OR
 NOT (f->'visible' @> '[88]'::jsonb) OR
 NOT (f->'explored' @> '[88]'::jsonb)
 THEN RAISE EXCEPTION 'Shared teammate source did not reveal own side: %',f;
 END IF;
END $$;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub='30000000-0000-4000-8000-000000000002';
DO $$
DECLARE f jsonb;
BEGIN
 f:=public.get_world_visibility_v2(
  '10000000-0000-4000-8000-000000000001');
 IF f->>'partyShared'<>'true' OR NOT
  (f->'visible' @> '[88]'::jsonb)
 THEN RAISE EXCEPTION 'Teammate cannot receive own shared sight: %',f;
 END IF;
END $$;
RESET ROLE;

-- Tool configuration edits invalidate ONLY affected viewer fog, without
-- republishing static map geometry or sending any torch coordinates.
UPDATE public.campaign_tool_map_tokens SET light_enabled=false
 WHERE issue_id='50000000-0000-4000-8000-000000000001';
DO $$
DECLARE before integer;
BEGIN
 SELECT count(*) INTO before FROM realtime.messages
 WHERE event='world-vision-v2';
 IF before<4 THEN
  RAISE EXCEPTION 'Dynamic torch edit failed to refresh entitled viewers';
 END IF;
 IF EXISTS(SELECT 1 FROM realtime.messages m
  WHERE m.event='world-vision-v2' AND (
   m.payload ? 'x' OR m.payload ? 'y' OR m.payload ? 'light' OR
   m.payload::text LIKE '%secret-light%'))
 THEN RAISE EXCEPTION 'Torch edit disclosed a private light location';END IF;
 IF (SELECT revision FROM public.map_environments
 WHERE map_id='10000000-0000-4000-8000-000000000001')<>10
 THEN RAISE EXCEPTION 'Torch change republished fixed map';END IF;
END $$;
DO $$
DECLARE body text;
BEGIN
 SELECT pg_get_functiondef(
 'forge_world_v2.observer_path_status(
 forge_world_v2.motion_sessions,uuid,text,uuid,jsonb,jsonb,integer,integer,integer
 )'::regprocedure) INTO body;
 IF position('forge_world_v2.observer_verified_path_v2' IN body)=0 OR
 position('forge_visibility.observer_verified_path_status' IN body)>0
 THEN RAISE EXCEPTION 'Phase 5 observer still depends on legacy fog';END IF;
END $$;
SELECT 'world-engine-v2-extended-visibility-contract-passed' AS result;
