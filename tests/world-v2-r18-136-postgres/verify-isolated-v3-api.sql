-- B10-R18-136 synthetic PostgreSQL 17. No real JWT/PostgREST/sockets.
\set ON_ERROR_STOP on

-- Schema deny should stay in effect even though the original V3 topic RPC
-- has an authenticated EXECUTE grant at function level.
DO $r136_assert$
BEGIN
 IF has_schema_privilege('authenticated','public','USAGE')
 OR has_schema_privilege('anon','public','USAGE')
 THEN RAISE EXCEPTION 'R136 public legacy API unexpectedly unsealed';END IF;
 IF NOT has_function_privilege('authenticated',
  'public.get_authorized_scene_channel_v3(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'R136 original R125 function grant fixture lost';END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='forge_v3_api')<>1
 THEN RAISE EXCEPTION 'R136 exposed more than one isolated function';END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='forge_v3_api')<>0
 THEN RAISE EXCEPTION 'R136 isolated schema contains a table or view';END IF;
 IF has_schema_privilege('anon','forge_v3_api','USAGE')
 OR NOT has_schema_privilege('authenticated','forge_v3_api','USAGE')
 THEN RAISE EXCEPTION 'R136 incorrect V3 exposed API schema USAGE';END IF;
 IF has_function_privilege('anon',
     'forge_v3_api.get_authorized_scene_channel_v3(uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
     'forge_v3_api.get_authorized_scene_channel_v3(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'R136 wrong RPC execute permissions';END IF;
END $r136_assert$;

-- A current player gets only their own epoch. No client-supplied actor
-- argument or protocol version was needed; signed DB role/JWT claim is
-- the actor authority in the original R125 helper.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
SELECT pg_catalog.set_config('r136.p2_epoch',
 forge_v3_api.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201'),false);
DO $assert$
DECLARE topic text;
BEGIN
 topic:=forge_v3_api.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201');
 IF topic IS NULL OR topic IS DISTINCT FROM
   pg_catalog.current_setting('r136.p2_epoch')
  OR topic NOT LIKE
    'forge-world-scene-v3:00000000-0000-4000-8000-000000000201:00000000-0000-4000-8000-000000000303:%'
 THEN RAISE EXCEPTION 'R136 signed P2 did not receive current private topic';END IF;
END $assert$;
COMMIT;

-- Current DM is permitted, but only their own topic.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000301',true);
DO $assert$
DECLARE topic text;
BEGIN
 topic:=forge_v3_api.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201');
 IF topic NOT LIKE
    'forge-world-scene-v3:00000000-0000-4000-8000-000000000201:00000000-0000-4000-8000-000000000301:%'
 THEN RAISE EXCEPTION 'R136 DM topic not scoped to their own signed ID';END IF;
END $assert$;
COMMIT;

-- Cross-campaign outsider has no signed membership for this map.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000304',true);
DO $assert$
BEGIN
 IF forge_v3_api.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201') IS NOT NULL
 THEN RAISE EXCEPTION 'R136 outsider gained another campaign topic';END IF;
END $assert$;
COMMIT;

-- No current auth.uid: R136 gives no topic even to a permitted DB role.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','',true);
DO $assert$
BEGIN
 IF forge_v3_api.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201') IS NOT NULL OR
 forge_v3_api.get_authorized_scene_channel_v3(NULL) IS NOT NULL
 THEN RAISE EXCEPTION 'R136 null actor or map was accepted';END IF;
END $assert$;
COMMIT;

-- P2 map assignment switched away: R125 map membership helper denies old
-- map without changing public schema privileges.
INSERT INTO public.campaign_player_maps(campaign_id,user_id,map_id)
VALUES('00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000303',
 '00000000-0000-4000-8000-000000000202');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
DO $assert$
BEGIN
 IF forge_v3_api.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201') IS NOT NULL
 THEN RAISE EXCEPTION 'R136 player off-map still gets old map topic';END IF;
END $assert$;
COMMIT;
-- Restore live current-map assignment for revoke/reinstate coverage.
DELETE FROM public.campaign_player_maps
 WHERE campaign_id='00000000-0000-4000-8000-000000000101'
 AND user_id='00000000-0000-4000-8000-000000000303';

DELETE FROM public.campaign_members
 WHERE campaign_id='00000000-0000-4000-8000-000000000101'
 AND user_id='00000000-0000-4000-8000-000000000303';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
DO $assert$
BEGIN
 IF forge_v3_api.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201') IS NOT NULL
 THEN RAISE EXCEPTION 'R136 removed P2 still obtained V3 topic';END IF;
END $assert$;
COMMIT;

INSERT INTO public.campaign_members(campaign_id,user_id,role)
VALUES('00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000303','player');
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
SELECT pg_catalog.set_config('r136.p2_new_epoch',
 forge_v3_api.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201'),false);
COMMIT;
DO $assert$
BEGIN
 IF pg_catalog.current_setting('r136.p2_epoch') IS NOT DISTINCT FROM
  pg_catalog.current_setting('r136.p2_new_epoch')
 THEN RAISE EXCEPTION 'R136 reinstated player reused revoked recipient epoch';END IF;
 IF has_schema_privilege('authenticated','public','USAGE')
 THEN RAISE EXCEPTION 'R136 membership reinstatement reopened public API';END IF;
END $assert$;
\echo 'R136 PG17 PASS: R128 public schema freeze stays enforced while exactly one signed V3 custom-schema RPC works, with revoke/reinstatement and map denial.'
