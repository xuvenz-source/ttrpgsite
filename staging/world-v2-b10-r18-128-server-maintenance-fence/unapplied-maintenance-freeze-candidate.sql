-- B10-R18-128 / SOURCE-ONLY / UNAPPLIED / NOT A PRODUCTION MIGRATION.
-- SQL is intentionally a FULL DENIAL of legacy PUBLIC-schema API, including
-- old and future public RPCs. This is not a V3-ready unseal strategy.
-- Use ONLY within an isolated, disposable PostgreSQL 17 security fixture.
--
-- Strict limitations:
--  * USAGE revocation blocks normal anon/authenticated queries and RPC
--    schema resolution, even when old bearer JWTs remain authenticated.
--  * Postgres SECURITY DEFINER bypasses base-table RLS; revoking schema
--    usage does not itself review private-schema RPCs, triggers or workers.
--  * Already joined Realtime channels are not disconnected by SQL GRANTs.
--  * Other postgres_changes, Broadcast, Storage and previously issued signed
--    bearer URLs are NOT covered. Full server-side fence is NOT established.
--  * This is an intentionally disruptive maintenance freeze, not an
--    innocuous live migration or a protocol version negotiated with clients.
BEGIN;
-- Wait for earlier scene publications to finish their transaction before
-- the API freeze commits. This orders only THIS specific shared publisher.
LOCK TABLE forge_world_v2.scene_publications IN ACCESS EXCLUSIVE MODE;

-- Preserve existing trigger return type and generation upsert. During
-- maintenance no map-wide V2 scene notification may be newly published.
-- The original (environment/rules) trigger call sites continue to work.
CREATE OR REPLACE FUNCTION forge_world_v2.bump_scene_publication_v2(p_map uuid)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $freeze$
DECLARE camp uuid;new_gen bigint;
BEGIN
 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm WHERE bm.id=p_map;
 IF camp IS NULL THEN RETURN NULL; END IF;
 INSERT INTO forge_world_v2.scene_publications(
  map_id,campaign_id,generation,changed_at)
 VALUES(p_map,camp,1,clock_timestamp())
 ON CONFLICT(map_id) DO UPDATE SET
  generation=forge_world_v2.scene_publications.generation+1,
  campaign_id=excluded.campaign_id,
  changed_at=clock_timestamp()
 RETURNING generation INTO new_gen;
 -- No event emission on this maintenance boundary.
 RETURN new_gen;
END $freeze$;
REVOKE ALL ON FUNCTION forge_world_v2.bump_scene_publication_v2(uuid)
 FROM PUBLIC,anon,authenticated;

-- MAINTENANCE-ONLY hard denial of browser-accessible public schema.
-- Blocking schema USAGE is independent of RLS and independently denies
-- old direct owner policies, public views, and authenticated public RPCs.
-- DO NOT invent an unfence GRANT here: restoring schema USAGE without first
-- completing signed V3 actor enforcement would reopen legacy clients.
REVOKE USAGE ON SCHEMA public FROM PUBLIC,anon,authenticated;
COMMIT;

-- Not covered: private security-definer entrypoints, Postgres Changes,
-- server-side jobs, Realtime channels/senders other than the scene publisher,
-- service_role (privileged), CDN bearer URLs, or in-flight transactions outside
-- the scene_publications lock. Hence this is NOT a verified total server fence.
-- No rollback that restores old scene Broadcast is included.
