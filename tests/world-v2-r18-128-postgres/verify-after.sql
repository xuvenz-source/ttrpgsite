-- Following UNAPPLIED R128 maintenance candidate in disposable PG17:
-- Public schema owner/privileged routes are now server-denied, independent
-- of an already signed-in JWT; original RLS grants are still installed.
\set ON_ERROR_STOP on
DO $test$
DECLARE gen bigint;
BEGIN
 gen:=forge_world_v2.bump_scene_publication_v2(
  '00000000-0000-4000-8000-000000000201');
 IF gen IS DISTINCT FROM 2 THEN
  RAISE EXCEPTION 'R128 maintenance quiescence broke scene generation';END IF;
 IF (SELECT count(*) FROM realtime.messages
  WHERE event='scene-revision-v2')<>1
 THEN RAISE EXCEPTION 'R128 shared scene sender emitted during freeze';END IF;
 IF position('realtime.send' in lower(pg_get_functiondef(
  'forge_world_v2.bump_scene_publication_v2(uuid)'::regprocedure)))>0
 THEN RAISE EXCEPTION 'R128 shared sender not actually replaced';END IF;
END $test$;

-- Exact caveat: previously queued mock Realtime events are still present.
-- The SQL does not revoke already-joined sockets or unrelated publishers.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
SELECT pg_catalog.set_config('request.jwt.claim.scene_topic',
 'forge-world-scene-v2:00000000-0000-4000-8000-000000000201',true);
DO $test$
BEGIN
 IF (SELECT count(*) FROM realtime.messages
  WHERE topic=realtime.topic()) IS DISTINCT FROM 1
 THEN RAISE EXCEPTION 'R128 fixture must prove cached Realtime scope remains';END IF;
 IF forge_world_v2.r128_private_schema_bypass_fixture()
  IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'R128 private-schema bypass illustration missing';END IF;
END $test$;
COMMIT;
\echo 'R128 boundary proven: scene sender quiet, but private-schema RPC and Realtime access remain in fixture.'
