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
