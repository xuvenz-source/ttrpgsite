-- B10-R18-138 -- SOURCE ONLY, UNAPPLIED. NEVER RUN ON HOSTED SUPABASE.
-- Seven private SECURITY DEFINER helpers and seven API SECURITY INVOKER stubs, all EXECUTE-REVOKED.
-- This is NOT an operational V3 API or compatible PostgREST release.
--
-- Fictional test order: R125 -> R126 -> R128 -> R136 -> R132 -> R138.
-- Original privileged V2 engine implementations MUST retain their existing
-- actor ownership, collision, rate, permission-generation and LOS behavior.
-- The wrapper does not reproduce, replace, or loosen those proofs.
--
-- Dynamic V2 client payload contracts remain version:2; V3 here refers
-- strictly to the private recipient transport and custom-schema access.
-- Separate real signed client and performance testing mandatory.
BEGIN;
DO $r138_preflight$
DECLARE n integer;
BEGIN
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE')
 OR pg_catalog.has_schema_privilege('anon','public','USAGE')
 THEN RAISE EXCEPTION 'R138 blocked: R128 legacy public schema is not frozen';
 END IF;
 IF pg_catalog.to_regprocedure('forge_v3_api.get_authorized_scene_channel_v3(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('forge_scene_drain.scene_v3_publish_allowed()') IS NULL
 THEN RAISE EXCEPTION 'R138 blocked: R136 topic or R132 transaction gate missing';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE
  schemaname='realtime' AND tablename='messages'
  AND policyname='World V2 scene publication receive')
 THEN RAISE EXCEPTION 'R138 blocked: old shared V2 scene receiver still installed';END IF;
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_api';
 IF n<>1 THEN RAISE EXCEPTION 'R138 blocked: unexpected pre-existing exposed V3 functions';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_api' AND
 pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'))
 THEN RAISE EXCEPTION 'R138 blocked: anon can execute existing V3 function';END IF;
END $r138_preflight$;

-- Privileged helpers must not live in a Data API-exposed schema.
-- Supabase RLS guidance recommends keeping SECURITY DEFINER outside
-- every exposed schema. No direct authenticated/anonymous USAGE here.
CREATE SCHEMA forge_v3_internal;
REVOKE ALL ON SCHEMA forge_v3_internal FROM PUBLIC,anon,authenticated;
-- Rehome the inherited R136 topic definer into this PRIVATE schema.
-- Supabase recommends no SECURITY DEFINER in an exposed schema.
CREATE FUNCTION forge_v3_internal.get_authorized_scene_channel_v3(p_map uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r136_topic$
DECLARE
 actor uuid;
 result_topic text;
BEGIN
 actor:=auth.uid();
 IF actor IS NULL OR p_map IS NULL THEN RETURN NULL;END IF;
 -- Inherited trusted R125 function re-reads the signed actor, current
 -- campaign membership, map assignment and recipient epoch FOR SHARE.
 -- This bridge MUST NOT accept caller-supplied user/campaign/version flags.
 result_topic:=public.get_authorized_scene_channel_v3(p_map);
 IF result_topic IS NULL THEN RETURN NULL;END IF;
 -- Defense in depth against a changed/malformed upstream topic.
 IF result_topic IS DISTINCT FROM
  'forge-world-scene-v3:'||p_map::text||':'||actor::text||':'||
  pg_catalog.split_part(result_topic,':',4)
  OR result_topic !~
  '^forge-world-scene-v3:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN RETURN NULL;END IF;
 RETURN result_topic;
END $r136_topic$;
REVOKE ALL ON FUNCTION forge_v3_internal.get_authorized_scene_channel_v3(uuid)
 FROM PUBLIC,anon,authenticated;
-- Only the inherited signed topic is allowed through a private helper.
GRANT USAGE ON SCHEMA forge_v3_internal TO authenticated;
GRANT EXECUTE ON FUNCTION forge_v3_internal.get_authorized_scene_channel_v3(uuid)
 TO authenticated;
CREATE OR REPLACE FUNCTION forge_v3_api.get_authorized_scene_channel_v3(p_map uuid)
RETURNS text LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r138_topic_invoker$
 SELECT forge_v3_internal.get_authorized_scene_channel_v3(p_map)
$r138_topic_invoker$;
-- Retain R136's narrow authenticated API EXECUTE; no anon grant.


-- Signed V3 topic check is a separate per-join/scene/sight check, never
-- added to the render frame loop or each movement cell.
CREATE FUNCTION forge_v3_internal.get_authorized_world_scene_v3(p_map uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $world_reader$
DECLARE actor uuid:=auth.uid();reply jsonb;topic text;
BEGIN
 IF actor IS NULL OR p_map IS NULL OR
  NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 topic:=public.get_authorized_scene_channel_v3(p_map);
 IF topic IS NULL OR topic NOT LIKE
   'forge-world-scene-v3:'||p_map::text||':'||actor::text||':%'
 THEN RETURN NULL;END IF;
 reply:=public.get_world_scene_v2(p_map);
 IF jsonb_typeof(reply)<>'object'
  OR reply->>'version' IS DISTINCT FROM '2'
  OR reply->>'mapId' IS DISTINCT FROM p_map::text
 THEN RETURN NULL;END IF;
 IF reply->>'scope' NOT IN('dm','viewer') THEN RETURN NULL;END IF;
 -- Non-DM callers can never receive a raw scene environment through here.
 IF reply->>'scope'='viewer' AND
    reply->'environment' IS DISTINCT FROM 'null'::jsonb
 THEN RETURN NULL;END IF;
 RETURN reply;
END $world_reader$;
REVOKE ALL ON FUNCTION forge_v3_internal.get_authorized_world_scene_v3(uuid)
 FROM PUBLIC,anon,authenticated;

-- Signed V3 topic check is a separate per-join/scene/sight check, never
-- added to the render frame loop or each movement cell.
CREATE FUNCTION forge_v3_internal.get_authorized_world_sight_v3(p_map uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $world_reader$
DECLARE actor uuid:=auth.uid();reply jsonb;topic text;
BEGIN
 IF actor IS NULL OR p_map IS NULL OR
  NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 topic:=public.get_authorized_scene_channel_v3(p_map);
 IF topic IS NULL OR topic NOT LIKE
   'forge-world-scene-v3:'||p_map::text||':'||actor::text||':%'
 THEN RETURN NULL;END IF;
 reply:=public.get_world_visibility_v2(p_map);
 IF jsonb_typeof(reply)<>'object'
  OR reply->>'version' IS DISTINCT FROM '2'
  OR reply->>'mapId' IS DISTINCT FROM p_map::text
 THEN RETURN NULL;END IF;
 IF reply->>'viewerId' IS DISTINCT FROM actor::text
  OR jsonb_typeof(reply->'visiblePieces')<>'array'
  OR jsonb_typeof(reply->'visible')<>'array'
  OR jsonb_typeof(reply->'explored')<>'array'
 THEN RETURN NULL;END IF;
 RETURN reply;
END $world_reader$;
REVOKE ALL ON FUNCTION forge_v3_internal.get_authorized_world_sight_v3(uuid)
 FROM PUBLIC,anon,authenticated;

-- Signed V3 topic check is a separate per-join/scene/sight check, never
-- added to the render frame loop or each movement cell.
CREATE FUNCTION forge_v3_internal.get_authorized_world_cursor_v3(p_map uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $world_reader$
DECLARE actor uuid:=auth.uid();reply jsonb;topic text;
BEGIN
 IF actor IS NULL OR p_map IS NULL OR
  NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 topic:=public.get_authorized_scene_channel_v3(p_map);
 IF topic IS NULL OR topic NOT LIKE
   'forge-world-scene-v3:'||p_map::text||':'||actor::text||':%'
 THEN RETURN NULL;END IF;
 reply:=public.get_world_observer_cursor_v2(p_map);
 IF jsonb_typeof(reply)<>'object'
  OR reply->>'version' IS DISTINCT FROM '2'
  OR reply->>'mapId' IS DISTINCT FROM p_map::text
 THEN RETURN NULL;END IF;
 IF reply->>'viewerId' IS DISTINCT FROM actor::text
  OR jsonb_typeof(reply->'cursor')<>'number'
 THEN RETURN NULL;END IF;
 RETURN reply;
END $world_reader$;
REVOKE ALL ON FUNCTION forge_v3_internal.get_authorized_world_cursor_v3(uuid)
 FROM PUBLIC,anon,authenticated;

-- Begin is the one motion phase that needs to establish the recipient's
-- currently authorized map/epoch. No extra network RPC is added: same
-- single client begin request, with a server-side signed gate.
CREATE FUNCTION forge_v3_internal.begin_world_motion_v3(
 p_map uuid,p_selection jsonb,p_origin jsonb,p_mode text,
 p_environment_revision bigint,p_permission_generation bigint,
 p_collision_override boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $world_begin$
DECLARE actor uuid:=auth.uid();topic text;reply jsonb;
BEGIN
 IF actor IS NULL OR p_map IS NULL OR
  NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 topic:=public.get_authorized_scene_channel_v3(p_map);
 IF topic IS NULL OR topic NOT LIKE
  'forge-world-scene-v3:'||p_map::text||':'||actor::text||':%'
 THEN RETURN NULL;END IF;
 reply:=public.begin_world_motion_v2(
  p_map,p_selection,p_origin,p_mode,
  p_environment_revision,p_permission_generation,p_collision_override);
 IF jsonb_typeof(reply)<>'object'
  OR reply->>'version' IS DISTINCT FROM '2'
  OR reply->>'sessionId' IS NULL THEN RETURN NULL;END IF;
 RETURN reply;
END $world_begin$;
REVOKE ALL ON FUNCTION forge_v3_internal.begin_world_motion_v3(
 uuid,jsonb,jsonb,text,bigint,bigint,boolean)
 FROM PUBLIC,anon,authenticated;

-- Advances and commits still use original actor-owned motion-session
-- checks, sequence/collision verification and server-approved broadcasts.
-- One transaction-level R132 gate check per *existing* motion RPC is needed
-- to prevent stale in-flight committed writes after a maintenance fence.
-- This adds a server-side row lock; performance is NOT yet measured.
CREATE FUNCTION forge_v3_internal.advance_world_motion_v3(
 p_session uuid,p_seq bigint,p_from jsonb,p_targets jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $world_advance$
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR
  NOT forge_scene_drain.scene_v3_publish_allowed() THEN RETURN NULL;END IF;
 RETURN public.advance_world_motion_v2(
  p_session,p_seq,p_from,p_targets,
  p_environment_revision,p_permission_generation);
END $world_advance$;
REVOKE ALL ON FUNCTION forge_v3_internal.advance_world_motion_v3(
 uuid,bigint,jsonb,jsonb,bigint,bigint)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_internal.commit_world_motion_v3(
 p_session uuid,p_seq bigint,p_endpoint jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $world_commit$
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR
  NOT forge_scene_drain.scene_v3_publish_allowed() THEN RETURN NULL;END IF;
 RETURN public.commit_world_motion_v2(
  p_session,p_seq,p_endpoint,
  p_environment_revision,p_permission_generation);
END $world_commit$;
REVOKE ALL ON FUNCTION forge_v3_internal.commit_world_motion_v3(
 uuid,bigint,jsonb,bigint,bigint)
 FROM PUBLIC,anon,authenticated;

-- Safe cleanup of one's own session is permitted while fenced; a cancel
-- never creates a token write or recipient broadcast.
CREATE FUNCTION forge_v3_internal.cancel_world_motion_v3(p_session uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $world_cancel$
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL THEN RETURN false;END IF;
 RETURN public.cancel_world_motion_v2(p_session);
END $world_cancel$;
REVOKE ALL ON FUNCTION forge_v3_internal.cancel_world_motion_v3(uuid)
 FROM PUBLIC,anon,authenticated;

-- The API schema gets only SECURITY INVOKER forwarding stubs.
-- Every stub remains EXECUTE-REVOKED, so this is NOT an unseal.
-- Granting API access in a future reviewed release would additionally
-- need narrowly-scoped internal USAGE/EXECUTE, not blanket grants.

CREATE FUNCTION forge_v3_api.get_authorized_world_scene_v3(p_map uuid)
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r138_invoker$
 SELECT forge_v3_internal.get_authorized_world_scene_v3(p_map)
$r138_invoker$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_world_scene_v3(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.get_authorized_world_sight_v3(p_map uuid)
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r138_invoker$
 SELECT forge_v3_internal.get_authorized_world_sight_v3(p_map)
$r138_invoker$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_world_sight_v3(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.get_authorized_world_cursor_v3(p_map uuid)
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r138_invoker$
 SELECT forge_v3_internal.get_authorized_world_cursor_v3(p_map)
$r138_invoker$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_world_cursor_v3(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.begin_world_motion_v3(p_map uuid,p_selection jsonb,p_origin jsonb,p_mode text,p_environment_revision bigint,p_permission_generation bigint,p_collision_override boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r138_invoker$
 SELECT forge_v3_internal.begin_world_motion_v3(p_map,p_selection,p_origin,p_mode,p_environment_revision,p_permission_generation,p_collision_override)
$r138_invoker$;
REVOKE ALL ON FUNCTION forge_v3_api.begin_world_motion_v3(uuid,jsonb,jsonb,text,bigint,bigint,boolean)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.advance_world_motion_v3(p_session uuid,p_seq bigint,p_from jsonb,p_targets jsonb,p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r138_invoker$
 SELECT forge_v3_internal.advance_world_motion_v3(p_session,p_seq,p_from,p_targets,p_environment_revision,p_permission_generation)
$r138_invoker$;
REVOKE ALL ON FUNCTION forge_v3_api.advance_world_motion_v3(uuid,bigint,jsonb,jsonb,bigint,bigint)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.commit_world_motion_v3(p_session uuid,p_seq bigint,p_endpoint jsonb,p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r138_invoker$
 SELECT forge_v3_internal.commit_world_motion_v3(p_session,p_seq,p_endpoint,p_environment_revision,p_permission_generation)
$r138_invoker$;
REVOKE ALL ON FUNCTION forge_v3_api.commit_world_motion_v3(uuid,bigint,jsonb,bigint,bigint)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.cancel_world_motion_v3(p_session uuid)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r138_invoker$
 SELECT forge_v3_internal.cancel_world_motion_v3(p_session)
$r138_invoker$;
REVOKE ALL ON FUNCTION forge_v3_api.cancel_world_motion_v3(uuid)
 FROM PUBLIC,anon,authenticated;

-- Never add grants here. A false-positive "green" synthetic mock must not
-- turn these into newly exposed authenticated routes in any environment.
DO $r138_postflight$
DECLARE cnt integer;
BEGIN
 SELECT count(*) INTO cnt FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_api';
 IF cnt<>8 THEN RAISE EXCEPTION 'R138 expected R136 topic plus seven closed wrappers';END IF;
 SELECT count(*) INTO cnt FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_internal';
 IF cnt<>8 THEN RAISE EXCEPTION 'R138 expected eight private privileged helpers including rehomed R136 topic';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_api' AND p.prosecdef)
 THEN RAISE EXCEPTION 'R138 newly exposed API function must be SECURITY INVOKER';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_internal' AND
   (NOT p.prosecdef OR
    pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') OR
    (p.proname<>'get_authorized_scene_channel_v3' AND
     pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'))))
 THEN RAISE EXCEPTION 'R138 private helpers not correctly fenced';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_api'
   AND p.proname<>'get_authorized_scene_channel_v3'
   AND (pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')))
 THEN RAISE EXCEPTION 'R138 unexpected browser EXECUTE on experimental facade';END IF;
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE')
 THEN RAISE EXCEPTION 'R138 postflight reopened legacy public API';END IF;
 IF NOT pg_catalog.has_function_privilege('authenticated',
  'forge_v3_api.get_authorized_scene_channel_v3(uuid)','EXECUTE')
 OR NOT pg_catalog.has_function_privilege('authenticated',
  'forge_v3_internal.get_authorized_scene_channel_v3(uuid)','EXECUTE')
 OR NOT pg_catalog.has_schema_privilege('authenticated','forge_v3_internal','USAGE')
 THEN RAISE EXCEPTION 'R138 inherited signed topic gateway lost narrow invoker access';END IF;
END $r138_postflight$;
COMMIT;

-- The seven new invoker stubs and private definer helpers remain unavailable to browser roles; the inherited R136 signed-topic RPC retains only its narrow authorized access
-- even if forge_v3_api is later exposed to PostgREST. NO_GO until signed
-- DM/P1/P2/outsider and performance, LOS, fog and revocation release tests.
