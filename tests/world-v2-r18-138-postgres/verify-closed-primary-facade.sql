-- B10-R18-138 isolated PG17 tests, NOT production RLS/LOS/collision proof.
\set ON_ERROR_STOP on
DO $r138_acl$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns
 ON ns.oid=p.pronamespace WHERE ns.nspname='forge_v3_api';
 IF n<>8 THEN RAISE EXCEPTION 'R138 expected topic RPC + seven closed facade functions';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns
   ON ns.oid=p.pronamespace
   WHERE ns.nspname='forge_v3_api' AND p.prosecdef)
 THEN RAISE EXCEPTION 'R138 exposed new security definer';END IF;
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns
   ON ns.oid=p.pronamespace WHERE ns.nspname='forge_v3_internal' AND p.prosecdef;
 IF n<>8 THEN RAISE EXCEPTION 'R138 expected eight private security definers';END IF;
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE')
 OR pg_catalog.has_schema_privilege('anon','public','USAGE')
 THEN RAISE EXCEPTION 'R138 public legacy API reopened';END IF;
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_api' AND p.proname<>'get_authorized_scene_channel_v3'
 AND (pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
  OR pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'));
 IF n<>0 THEN RAISE EXCEPTION 'R138 unreviewed prototype exposed to browser';END IF;
END $r138_acl$;

-- The inherited R136 signed topic endpoint must still function through
-- its exposed SECURITY INVOKER and PRIVATE SECURITY DEFINER backend.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
DO $topic$
DECLARE t text;
BEGIN
 t:=forge_v3_api.get_authorized_scene_channel_v3(
  '00000000-0000-4000-8000-000000000201');
 IF t NOT LIKE 'forge-world-scene-v3:00000000-0000-4000-8000-000000000201:00000000-0000-4000-8000-000000000303:%'
 THEN RAISE EXCEPTION 'R138 inherited R136 signed topic routing failed after private relocation';END IF;
END $topic$;
COMMIT;

-- A superuser driving a fictional signed JWT can exercise the draft
-- function *body* while grants still deny real authenticated clients.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',false);
DO $r138_fence$
BEGIN
 IF forge_v3_api.get_authorized_world_scene_v3(
  '00000000-0000-4000-8000-000000000201') IS NOT NULL
 OR forge_v3_api.get_authorized_world_sight_v3(
  '00000000-0000-4000-8000-000000000201') IS NOT NULL
 OR forge_v3_api.begin_world_motion_v3(
  '00000000-0000-4000-8000-000000000201',
  '[{"kind":"token","id":"00000000-0000-4000-8000-000000000404"}]',
  '{"x":0,"y":0}','drag',0,0,false) IS NOT NULL
 THEN RAISE EXCEPTION 'R138 default fenced mode allowed gameplay';END IF;
END $r138_fence$;
-- Fictional trusted release only, NEVER apply on hosted database.
UPDATE forge_scene_drain.scene_publication_gate SET mode='v3-only'
 WHERE singleton=true;

DO $r138_viewer$
DECLARE scene jsonb;sight jsonb;cursor jsonb;outsider_scene jsonb;
BEGIN
 scene:=forge_v3_api.get_authorized_world_scene_v3(
  '00000000-0000-4000-8000-000000000201');
 sight:=forge_v3_api.get_authorized_world_sight_v3(
  '00000000-0000-4000-8000-000000000201');
 cursor:=forge_v3_api.get_authorized_world_cursor_v3(
  '00000000-0000-4000-8000-000000000201');
 IF scene->>'scope'<>'viewer' OR scene->'environment'<>'null'::jsonb OR
 sight->>'viewerId'<>'00000000-0000-4000-8000-000000000303' OR
 jsonb_typeof(sight->'visiblePieces')<>'array' OR
 cursor->>'cursor'<>'0' THEN
 RAISE EXCEPTION 'R138 player received wrong scene/sight/cursor projection';END IF;
 IF forge_v3_api.get_authorized_world_scene_v3(
  '00000000-0000-4000-8000-000000000203') IS NOT NULL THEN
 RAISE EXCEPTION 'R138 cross-campaign P2 scene was readable';END IF;
END $r138_viewer$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000301',false);
DO $r138_dm$
DECLARE scene jsonb;sight jsonb;
BEGIN
 scene:=forge_v3_api.get_authorized_world_scene_v3(
  '00000000-0000-4000-8000-000000000201');
 sight:=forge_v3_api.get_authorized_world_sight_v3(
  '00000000-0000-4000-8000-000000000201');
 IF scene->>'scope'<>'dm' OR
   scene->'environment' IS NULL OR
   scene->'environment'='null'::jsonb OR
   sight->>'viewerId'<>'00000000-0000-4000-8000-000000000301'
 THEN RAISE EXCEPTION 'R138 DM authorized fixture returned wrong scope';END IF;
END $r138_dm$;

-- A temporary GRANT inside a rolled-back transaction exercises signed
-- authenticated role, but never leaves the experimental function exposed.
BEGIN;
GRANT EXECUTE ON FUNCTION forge_v3_api.get_authorized_world_scene_v3(uuid)
 TO authenticated;
-- During this one rolled-back test transaction only, expose the private
-- invoker dependency. No permanent private schema grant is proposed.
GRANT USAGE ON SCHEMA forge_v3_internal TO authenticated;
GRANT EXECUTE ON FUNCTION forge_v3_internal.get_authorized_world_scene_v3(uuid)
 TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);
DO $r138_actor$
DECLARE v jsonb;
BEGIN
 v:=forge_v3_api.get_authorized_world_scene_v3(
  '00000000-0000-4000-8000-000000000201');
 IF v->>'scope'<>'viewer' OR v->'environment'<>'null'::jsonb THEN
 RAISE EXCEPTION 'R138 temporary-granted signed player has wrong scene';END IF;
END $r138_actor$;
ROLLBACK;

-- Original sample-owner V2 logic allows movement for the signed player.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',false);
DO $r138_motion$
DECLARE b jsonb;a jsonb;c jsonb;id uuid;
BEGIN
 b:=forge_v3_api.begin_world_motion_v3(
  '00000000-0000-4000-8000-000000000201',
  '[{"kind":"token","id":"00000000-0000-4000-8000-000000000404"}]',
  '{"x":0,"y":0}','drag',0,0,false);
 IF b->>'version'<>'2' THEN
  RAISE EXCEPTION 'R138 original begin reply shape changed';END IF;
 id:=(b->>'sessionId')::uuid;
 a:=forge_v3_api.advance_world_motion_v3(id,1,'{"x":0,"y":0}',
  '[{"x":1,"y":0}]',0,0);
 IF a->>'seq'<>'1' THEN
  RAISE EXCEPTION 'R138 original movement sequence not forwarded';END IF;
 c:=forge_v3_api.commit_world_motion_v3(id,2,'{"x":1,"y":0}',0,0);
 IF c->>'seq'<>'2' THEN
  RAISE EXCEPTION 'R138 original motion commit response changed';END IF;
END $r138_motion$;

-- New session; maintainer fence blocks advance and commit while
-- cancellation remains safe for current owner.
DO $r138_revoke$
DECLARE b jsonb;id uuid;
BEGIN
 b:=forge_v3_api.begin_world_motion_v3(
  '00000000-0000-4000-8000-000000000201',
  '[{"kind":"token","id":"00000000-0000-4000-8000-000000000404"}]',
  '{"x":0,"y":0}','drag',0,0,false);
 id:=(b->>'sessionId')::uuid;
 PERFORM pg_catalog.set_config('r138.pending_session',id::text,false);
END $r138_revoke$;
UPDATE forge_scene_drain.scene_publication_gate SET mode='fenced'
 WHERE singleton=true;
DO $r138_fenced_motion$
DECLARE id uuid:=pg_catalog.current_setting('r138.pending_session')::uuid;
BEGIN
 IF forge_v3_api.advance_world_motion_v3(id,1,'{"x":0,"y":0}',
   '[{"x":1,"y":0}]',0,0) IS NOT NULL OR
 forge_v3_api.commit_world_motion_v3(id,1,'{"x":1,"y":0}',0,0) IS NOT NULL
 THEN RAISE EXCEPTION 'R138 fenced motion still wrote';END IF;
 IF forge_v3_api.cancel_world_motion_v3(id) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R138 safe cancellation blocked while fenced';END IF;
END $r138_fenced_motion$;

-- No open default privileges after temporary test grants.
DO $r138_final$
BEGIN
 IF pg_catalog.has_function_privilege('authenticated',
   'forge_v3_api.get_authorized_world_scene_v3(uuid)','EXECUTE')
 OR pg_catalog.has_function_privilege('anon',
   'forge_v3_api.get_authorized_world_sight_v3(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'R138 temporary grant escaped rollback';END IF;
END $r138_final$;

\echo 'R138 SYNTHETIC PG17 PASS: closed facade, no player raw scene, actor session movement forwarding, fence and safe cancellation; NO hosted rollout proof.'
