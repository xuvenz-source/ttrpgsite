-- B10-R18-136 -- UNAPPLIED / disposable PG17 security candidate.
-- SOURCE ONLY. NEVER RUN ON ORIGINAL OR HOSTED QA. NO VERSIONED MIGRATION.
--
-- Mandatory input order in fictional test DB:
--   R125 synthetic membership/epoch, R126 scene policy fixture,
--   R128 public-schema maintenance freeze, THEN this R136 API bridge.
--
-- This addresses ONE conflict: R128 REVOKE USAGE ON SCHEMA public denies
-- both legacy RPCs and R125's secure V3 topic RPC in public. Rather than
-- restoring public USAGE, expose only one narrow V3 RPC from an isolated
-- schema. Its internal trusted function calls the R125 signed-user authority.
--
-- POSTGREST CONFIG IS NOT SQL: future authorized staging would also need
-- 'forge_v3_api' in Data API > Exposed schemas. A PostgreSQL GRANT does not
-- make a schema routable over Supabase REST. Do not claim PGRST success.
--
-- A malicious CURRENT member can call this new RPC regardless of the JS
-- version they use; the protocol version string is NOT a security identity.
-- This protects a data surface, not the provenance of a browser binary.
--
-- Only the V3 topic issuance endpoint is bridged here. The full V3 client
-- also depends on scene, observer, sight, movement and fog interfaces; those
-- remain denied while public USAGE stays revoked. NO V3 unseal is authorized.
BEGIN;

-- Fail closed if upstream R128 freeze is absent; do not introduce a new
-- reachable gateway while old API routes remain browser-visible.
DO $r136_preflight$
BEGIN
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE')
    OR pg_catalog.has_schema_privilege('anon','public','USAGE') THEN
  RAISE EXCEPTION 'R136 preflight: R128 public schema fence not installed';
 END IF;
 IF pg_catalog.to_regprocedure(
   'public.get_authorized_scene_channel_v3(uuid)') IS NULL THEN
  RAISE EXCEPTION 'R136 preflight: R125 signed V3 topic authority missing';
 END IF;
END $r136_preflight$;

CREATE SCHEMA forge_v3_api;
REVOKE ALL ON SCHEMA forge_v3_api FROM PUBLIC,anon,authenticated;

-- Grant no direct table/view privileges, default privileges or routines
-- beyond this exact entrypoint. No SERVICE_ROLE grant is required.
GRANT USAGE ON SCHEMA forge_v3_api TO authenticated;

CREATE FUNCTION forge_v3_api.get_authorized_scene_channel_v3(p_map uuid)
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
REVOKE ALL ON FUNCTION
 forge_v3_api.get_authorized_scene_channel_v3(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 forge_v3_api.get_authorized_scene_channel_v3(uuid)
 TO authenticated;

-- Recheck both invariants before committing the candidate.
DO $r136_postflight$
BEGIN
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE')
    OR pg_catalog.has_schema_privilege('anon','public','USAGE') THEN
  RAISE EXCEPTION 'R136 postflight: legacy public schema unexpectedly reopened';
 END IF;
 IF NOT pg_catalog.has_schema_privilege(
   'authenticated','forge_v3_api','USAGE')
   OR pg_catalog.has_schema_privilege('anon','forge_v3_api','USAGE')
   OR NOT pg_catalog.has_function_privilege(
    'authenticated','forge_v3_api.get_authorized_scene_channel_v3(uuid)',
    'EXECUTE')
   OR pg_catalog.has_function_privilege(
    'anon','forge_v3_api.get_authorized_scene_channel_v3(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'R136 postflight: isolated V3 RPC ACL mismatch';END IF;
END $r136_postflight$;
COMMIT;

-- Even if the future Data API exposes forge_v3_api, this source-only SQL
-- does NOT bootstrap production. It has no actor-backed sight/materialized
-- scene RPC in the new schema, no old connected socket cutoff, no signed
-- Storage URL revocation and no safe blanket public-schema restore.
