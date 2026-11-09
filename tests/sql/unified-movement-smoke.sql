-- All tests execute against a throwaway PostgreSQL service, not Supabase.
\set ON_ERROR_STOP on
DO $$
BEGIN
 IF has_function_privilege('anon',
  'public.advance_authorized_navigation_gesture_batch(uuid,jsonb,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'Anonymous role can execute privileged movement';END IF;
 IF NOT has_function_privilege('authenticated',
  'public.advance_authorized_navigation_gesture_batch(uuid,jsonb,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'Authenticated role cannot use movement RPC';END IF;
 IF has_table_privilege('authenticated',
  'forge_visibility.navigation_gestures','SELECT')
 THEN RAISE EXCEPTION 'Hidden gesture table accessible';END IF;
END $$;

BEGIN;
SELECT set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE answer jsonb;
BEGIN
 answer:=public.advance_authorized_navigation_gesture_batch(
  '77777777-7777-4777-8777-777777777777',
  '[{"dx":4,"dy":0}]'::jsonb,1);
 IF answer IS NULL OR answer->>'blocked'<>'false' OR
    jsonb_array_length(answer->'approved')<>4 OR
    (answer->'approved'->3->>'dx')::integer<>4
 THEN RAISE EXCEPTION 'Unobstructed 4-cell batch rejected %',answer;END IF;
 IF public.advance_authorized_navigation_gesture_batch(
  '77777777-7777-4777-8777-777777777777',
  '[{"dx":5,"dy":0}]'::jsonb,1) IS NOT NULL
 THEN RAISE EXCEPTION 'Sequence replay was accepted';END IF;
END $$;
COMMIT;
-- Probe the private publisher directly inside an always-rolled-back
-- transaction so SQL errors cannot disappear behind the public neutral
-- response or modify the smoke-test counts.
BEGIN;
SELECT set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',true);
SELECT forge_visibility.publish_approved_navigation_batch(
 '77777777-7777-4777-8777-777777777777',0,0,
 '[{"dx":1,"dy":0}]'::jsonb,
 '{"objects":[],"fog":{"partyShared":true}}'::jsonb,true);
ROLLBACK;
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.notifications
   WHERE packet->>'action'='path' AND is_private
    AND (packet->'path'->0->>'x')::integer=1
    AND (packet->'path'->4->>'x')::integer=5)<>2
 THEN RAISE EXCEPTION 'Valid path not limited to entitled recipients';END IF;
 IF EXISTS(SELECT 1 FROM realtime.notifications
   WHERE topic LIKE '%22222222-2222-4222-8222-222222222222')
 THEN RAISE EXCEPTION 'Mover received a redundant remote observer packet';END IF;
 IF (SELECT count(*) FROM forge_visibility.test_fog_ticks)<>1
 THEN RAISE EXCEPTION 'Expected exactly one verified fog tick per batch';END IF;
 IF (SELECT x FROM public.map_tokens
   WHERE id='55555555-5555-4555-8555-555555555555')<>1
 THEN RAISE EXCEPTION 'Preview incorrectly persisted canonical position';END IF;
END $$;

-- A granted player may not continue after a scene or permission change.
UPDATE forge_visibility.navigation_permission_generations SET generation=1;
BEGIN;
SELECT set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF public.advance_authorized_navigation_gesture_batch(
  '77777777-7777-4777-8777-777777777777',
  '[{"dx":5,"dy":0}]'::jsonb,2) IS NOT NULL
 THEN RAISE EXCEPTION 'Stale permission generation accepted';END IF;
END $$;
ROLLBACK;
UPDATE forge_visibility.navigation_permission_generations SET generation=0;

-- Reset disposable session to a newer published scene with a simple solid wall.
UPDATE public.map_environments SET
 live='{"objects":[{"type":"wall","at":3}],"fog":{"partyShared":true}}'::jsonb,
 revision=1;
UPDATE forge_visibility.navigation_gestures SET
 environment_revision=1,last_dx=0,last_dy=0,last_seq=0,
 batch_count=0,validated_cells=0,last_fog_sent=null;
BEGIN;
SELECT set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE answer jsonb;
BEGIN
 answer:=public.advance_authorized_navigation_gesture_batch(
  '77777777-7777-4777-8777-777777777777',
  '[{"dx":4,"dy":0}]'::jsonb,1);
 IF answer IS NULL OR answer->>'blocked'<>'true' OR
    jsonb_array_length(answer->'approved')<>1 OR
    (answer->'approved'->0->>'dx')::integer<>1
 THEN RAISE EXCEPTION 'Blocked corridor did not return only accepted prefix: %',answer;END IF;
END $$;
ROLLBACK;

-- Mixed token formation: one member hits a wall first => group remains put.
UPDATE forge_visibility.navigation_gestures SET
 token_origins='[
 {"id":"55555555-5555-4555-8555-555555555555","x":1,"y":1,
  "spanX":1,"spanY":1,"characterId":null},
 {"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","x":2,"y":2,
  "spanX":1,"spanY":1,"characterId":null}
 ]'::jsonb;
BEGIN;
SELECT set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE answer jsonb;
BEGIN
 answer:=public.advance_authorized_navigation_gesture_batch(
  '77777777-7777-4777-8777-777777777777',
  '[{"dx":1,"dy":0}]'::jsonb,1);
 IF answer IS NULL OR answer->>'blocked'<>'true' OR
    jsonb_array_length(answer->'approved')<>0
 THEN RAISE EXCEPTION 'Atomic group collision failure: %',answer;END IF;
END $$;
ROLLBACK;

-- Another authenticated account cannot borrow the original actor session.
BEGIN;
SELECT set_config('request.jwt.claim.sub',
 '88888888-8888-4888-8888-888888888888',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF public.advance_authorized_navigation_gesture_batch(
  '77777777-7777-4777-8777-777777777777',
  '[{"dx":1,"dy":0}]'::jsonb,1) IS NOT NULL
 THEN RAISE EXCEPTION 'Cross-user session replay accepted';END IF;
END $$;
ROLLBACK;

-- Malformed actor/path requests must fail closed without error details.
BEGIN;
SELECT set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF public.advance_authorized_navigation_gesture_batch(
  '77777777-7777-4777-8777-777777777777',
  '[{"dx":129,"dy":0}]'::jsonb,1) IS NOT NULL
 THEN RAISE EXCEPTION 'Oversized hidden-wall survey accepted';END IF;
END $$;
ROLLBACK;

\echo 'PASS: all isolated batch, wall, group, RLS/grant and private observer tests'

-- Synthetic map edits above deliberately invalidated the DM's old
-- session. Re-arm it with the latest published scene, as a new authorized
-- begin_map_motion_session call would do in the real application.
UPDATE forge_visibility.movement_sessions ms SET
 environment_revision=e.revision,scene=e.live,
 last_x=ms.base_x,last_y=ms.base_y,last_seq=0,last_sent=NULL
 FROM public.map_environments e WHERE e.map_id=ms.map_id;
-- DM moved a player-owned token along a right-angle turn. The old server
-- would validate only a straight endpoint, but the staged endpoint must
-- preserve this exact swept route in both recipients' private broadcasts.
DO $$
BEGIN
 IF has_function_privilege('anon',
  'public.advance_map_motion_session_path(uuid,jsonb,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'Anonymous role can publish DM path';END IF;
END $$;
BEGIN;
SELECT set_config('request.jwt.claim.sub',
 '99999999-9999-4999-8999-999999999999',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF public.advance_map_motion_session_path(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '[{"x":1,"y":1},{"x":2,"y":1},{"x":2,"y":2}]'::jsonb,1234500)
 IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Server rejected valid DM corner route';END IF;
END $$;
COMMIT;
DO $$
BEGIN
 IF (SELECT count(*) FROM realtime.notifications
  WHERE packet->>'action'='path'
   AND (packet->'path'->0->>'x')::integer=1
   AND (packet->'path'->2->>'y')::integer=2
   AND topic LIKE 'forge-observer:%')<2
 THEN RAISE EXCEPTION 'DM corner did not reach authorized observers';END IF;
 IF (SELECT x FROM public.map_tokens
   WHERE id='55555555-5555-4555-8555-555555555555')<>1
 THEN RAISE EXCEPTION 'DM path preview persisted canonical position';END IF;
END $$;
-- A player cannot adopt the DM's server-owned session and use override.
BEGIN;
SELECT set_config('request.jwt.claim.sub',
 '22222222-2222-4222-8222-222222222222',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF public.advance_map_motion_session_path(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '[{"x":2,"y":2},{"x":3,"y":2}]'::jsonb,1234600)
 IS DISTINCT FROM false THEN RAISE EXCEPTION 'DM session hijack';END IF;
END $$;
ROLLBACK;
-- A valid actor cannot start the requested route at a forged coordinate.
BEGIN;
SELECT set_config('request.jwt.claim.sub',
 '99999999-9999-4999-8999-999999999999',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF public.advance_map_motion_session_path(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '[{"x":7,"y":7},{"x":8,"y":7}]'::jsonb,1234600)
 IS DISTINCT FROM false THEN RAISE EXCEPTION 'DM forged origin accepted';END IF;
END $$;
ROLLBACK;
\echo 'PASS: DM verified paths, scene-specific sequence and private observer recipients'

-- Regression: DM drag of an owned character carrying a torch must move
-- the private illuminated position. A random viewer cannot author a rate.
INSERT INTO public.campaign_tool_map_tokens(
 issue_id,map_id,campaign_id,kind,held_by_token_id,
 x,y,light_enabled,light_bright,light_dim)
VALUES(
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 '33333333-3333-4333-8333-333333333333',
 '11111111-1111-4111-8111-111111111111',
 'torch','55555555-5555-4555-8555-555555555555',
 1,1,true,5,0);
INSERT INTO forge_visibility.movement_preview_rates(
 actor_id,piece_id,last_sent,last_seq,map_id,kind,
 base_x,base_y,last_x,last_y)
VALUES(
 '99999999-9999-4999-8999-999999999999',
 '55555555-5555-4555-8555-555555555555',
 clock_timestamp(),9000000,'33333333-3333-4333-8333-333333333333',
 'token',1,1,8,1)
ON CONFLICT(actor_id,piece_id) DO UPDATE SET
 last_sent=excluded.last_sent,last_seq=excluded.last_seq,
 last_x=excluded.last_x,last_y=excluded.last_y;
DO $$
DECLARE scene jsonb:='{"objects":[],"ambient":0}'::jsonb;
BEGIN
 IF NOT forge_visibility.is_lit(
  '33333333-3333-4333-8333-333333333333',
  scene,1.5,1.5,8.5,1.5,10)
 THEN RAISE EXCEPTION 'DM moving a held torch failed to update authorized light';END IF;
END $$;
DELETE FROM forge_visibility.movement_preview_rates
 WHERE piece_id='55555555-5555-4555-8555-555555555555';
DO $$
DECLARE scene jsonb:='{"objects":[],"ambient":0}'::jsonb;
BEGIN
 IF forge_visibility.is_lit(
  '33333333-3333-4333-8333-333333333333',
  scene,1.5,1.5,8.5,1.5,10)
 THEN RAISE EXCEPTION 'Unverified torch moved without a server-authorized rate';END IF;
END $$;
\echo 'PASS: DM-carried torches use authorized ephemeral coordinates and revoke stale light'

-- Attempts to create fresh hidden-wall probing sessions are bounded by
-- a private actor/map rate limit. This fixture proves the trigger and RLS,
-- not the browser's pointer-intent authenticity.
DO $$
DECLARE n integer;blocked boolean:=false;
BEGIN
 IF has_table_privilege('authenticated',
  'forge_visibility.navigation_gesture_budgets','SELECT')
 THEN RAISE EXCEPTION 'Player can inspect hidden navigation rate budget';END IF;
 PERFORM set_config('request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',true);
 FOR n IN 1..120 LOOP
  INSERT INTO forge_visibility.navigation_gestures(
   id,actor_id,map_id,campaign_id,token_origins,tool_origins,
   environment_revision,permission_generation,rules_updated_at,expires_at)
  SELECT gen_random_uuid(),actor_id,map_id,campaign_id,token_origins,tool_origins,
   environment_revision,permission_generation,rules_updated_at,
   clock_timestamp()+interval '5 seconds'
  FROM forge_visibility.navigation_gestures
  WHERE id='77777777-7777-4777-8777-777777777777';
 END LOOP;
 BEGIN
  INSERT INTO forge_visibility.navigation_gestures(
   id,actor_id,map_id,campaign_id,token_origins,tool_origins,
   environment_revision,permission_generation,rules_updated_at,expires_at)
  SELECT gen_random_uuid(),actor_id,map_id,campaign_id,token_origins,tool_origins,
   environment_revision,permission_generation,rules_updated_at,
   clock_timestamp()+interval '5 seconds'
  FROM forge_visibility.navigation_gestures
  WHERE id='77777777-7777-4777-8777-777777777777';
 EXCEPTION WHEN others THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Private session restart probe budget failed';END IF;
END $$;
\echo 'PASS: private navigation restart budget, 121st session denied'
