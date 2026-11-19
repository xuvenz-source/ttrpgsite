-- Before maintenance: fabricated signed P1 accesses old exposed table/RPC.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000302',true);
DO $test$
BEGIN
 IF (SELECT secret FROM public.r128_private_sheet
  WHERE campaign_id='00000000-0000-4000-8000-000000000101')
   IS DISTINCT FROM 'synthetic-secret'
 THEN RAISE EXCEPTION 'R128 missing baseline direct table permission';END IF;
 IF public.r128_legacy_sheet_rpc(
  '00000000-0000-4000-8000-000000000101')
  IS DISTINCT FROM 'synthetic-secret'
 THEN RAISE EXCEPTION 'R128 missing baseline privileged sheet RPC';END IF;
 IF public.r128_legacy_motion_rpc(
  '00000000-0000-4000-8000-000000000201') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R128 missing baseline privileged movement RPC';END IF;
 IF forge_world_v2.r128_private_schema_bypass_fixture() IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R128 fixture private schema definer inaccessible';END IF;
END $test$;
COMMIT;
-- Trusted service actor, never exposed to browser JWTs.
DO $test$
DECLARE gen bigint;
BEGIN
 gen:=forge_world_v2.bump_scene_publication_v2(
 '00000000-0000-4000-8000-000000000201');
 IF gen IS DISTINCT FROM 1 OR (SELECT count(*) FROM realtime.messages
  WHERE event='scene-revision-v2'
   AND topic='forge-world-scene-v2:00000000-0000-4000-8000-000000000201')<>1
 THEN RAISE EXCEPTION 'R128 old map-wide scene publisher not reproduced';END IF;
END $test$;
\echo 'R128 baseline proven: legacy sheet, movement, direct table and map-wide scene notice.'
