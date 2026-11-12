-- B10-R18-46 MANUAL POST-COMMIT FORWARD RECOVERY. NEVER AUTOAPPLY.
-- Only after: browser dual atomic flags OFF, R18-45 terminal ACL
-- containment COMMITTED, no active movement sessions, and the separate
-- protected R05 four-function recovery has COMMITTED.
-- Restores the FIVE original live wall/step/legacy-trigger function bodies.
-- Retains the two installed R18-20 campaign-affinity triggers intentionally:
-- dropping a security restriction during an incident could permit campaign
-- reparenting. R05 queues/backup, the disabled atomic API and receipt columns,
-- schema migration history and already committed token positions are retained.
-- This is source recovery / forward containment, NOT a schema downgrade.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
SET LOCAL search_path='';

DO $r46_recover$
DECLARE
 rec record; src text; p oid;
 guard_oid oid; guard_src text; guard_rec record;
 map_o oid;token_o oid;map_def text;token_def text;
 active_n integer;applied_n integer;
BEGIN
 IF to_regclass('forge_world_v2.motion_r46_source_backup') IS NULL
  OR to_regclass('forge_world_v2.motion_r46_guard_seal') IS NULL
  OR to_regclass('forge_world_v2.motion_r05_function_backup') IS NULL
  OR to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NULL
  OR (SELECT count(*) FROM forge_world_v2.motion_r46_source_backup)<>5
  OR (SELECT count(*) FROM forge_world_v2.motion_r46_source_backup
   WHERE sealed_at IS NOT NULL AND installed_digest IS NOT NULL)<>5
  OR (SELECT count(*) FROM forge_world_v2.motion_r05_function_backup)<>4
  OR (SELECT count(*) FROM forge_world_v2.motion_r46_guard_seal)<>1
 THEN RAISE EXCEPTION 'R46 recovery STOP: incomplete source backups, seals or atomic server release';END IF;
 IF has_schema_privilege('anon','forge_world_v2','USAGE')
  OR has_schema_privilege('authenticated','forge_world_v2','USAGE')
  OR has_table_privilege('anon','forge_world_v2.motion_r46_source_backup','SELECT')
  OR has_table_privilege('authenticated','forge_world_v2.motion_r46_source_backup','SELECT')
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid=
   'forge_world_v2.motion_r46_source_backup'::regclass)
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid=
   'forge_world_v2.motion_r46_guard_seal'::regclass)
  OR has_function_privilege('authenticated',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
  OR has_function_privilege('anon',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'R46 recovery STOP: browser/private privilege drift or atomic endpoint still enabled';END IF;
 SELECT count(*)::int INTO active_n FROM forge_world_v2.motion_sessions
 WHERE status='active' AND expires_at>clock_timestamp();
 IF active_n<>0 THEN
  RAISE EXCEPTION 'R46 recovery STOP: % active movement sessions',active_n;
 END IF;
 -- The R05 recovery must precede this recovery. Never restore a subset of
 -- the original code against the active R05 replacement path.
 IF EXISTS(SELECT 1 FROM forge_world_v2.motion_r05_function_backup b
   WHERE to_regprocedure(b.signature) IS NULL OR
    md5(pg_get_functiondef(to_regprocedure(b.signature))) IS DISTINCT FROM
    b.original_digest)
 THEN RAISE EXCEPTION 'R46 recovery STOP: original four R05 functions not yet restored';END IF;

 guard_oid:=to_regprocedure('forge_visibility.guard_campaign_affinity_r18_20()');
 SELECT * INTO guard_rec FROM forge_world_v2.motion_r46_guard_seal WHERE id=1;
 IF guard_oid IS NULL OR
  md5(pg_get_functiondef(guard_oid)) IS DISTINCT FROM guard_rec.function_digest
 THEN RAISE EXCEPTION 'R46 recovery STOP: campaign-affinity guard changed';END IF;
 SELECT t.oid,pg_get_triggerdef(t.oid) INTO map_o,map_def
 FROM pg_trigger t
 WHERE t.tgrelid='public.battle_maps'::regclass
  AND t.tgname='forge_map_campaign_affinity_r18_20'
  AND t.tgfoid=guard_oid AND t.tgenabled='O' AND NOT t.tgisinternal;
 SELECT t.oid,pg_get_triggerdef(t.oid) INTO token_o,token_def
 FROM pg_trigger t
 WHERE t.tgrelid='public.map_tokens'::regclass
  AND t.tgname='forge_token_campaign_affinity_r18_20'
  AND t.tgfoid=guard_oid AND t.tgenabled='O' AND NOT t.tgisinternal;
 IF map_o IS NULL OR token_o IS NULL
  OR md5(map_def) IS DISTINCT FROM guard_rec.map_trigger_digest
  OR md5(token_def) IS DISTINCT FROM guard_rec.token_trigger_digest
  OR (SELECT count(*) FROM pg_trigger WHERE tgfoid=guard_oid)<>2
  OR has_function_privilege('anon',guard_oid,'EXECUTE')
  OR has_function_privilege('authenticated',guard_oid,'EXECUTE')
 THEN RAISE EXCEPTION 'R46 recovery STOP: guard trigger topology/source drift';END IF;

 -- BEFORE any DDL: validate all five installed digests and private stored
 -- original code. Any unrecognized edit aborts the entire transaction.
 FOR rec IN SELECT * FROM forge_world_v2.motion_r46_source_backup
  ORDER BY signature LOOP
  p:=to_regprocedure(rec.signature);
  IF p IS NULL OR md5(rec.old_definition)<>rec.original_digest
   OR md5(pg_get_functiondef(p)) IS DISTINCT FROM rec.installed_digest
   OR has_function_privilege('anon',p,'EXECUTE') IS DISTINCT FROM rec.original_anon_exec
   OR has_function_privilege('authenticated',p,'EXECUTE') IS DISTINCT FROM rec.original_auth_exec
   OR (SELECT prosecdef FROM pg_proc WHERE oid=p) IS DISTINCT FROM rec.original_security_definer
  THEN RAISE EXCEPTION 'R46 recovery STOP: source, ACL, or security mode drift %',rec.signature;END IF;
 END LOOP;

 -- Reapply EXACT original live function source definitions captured before
 -- installation. CREATE OR REPLACE retains existing function OIDs, grants
 -- and trigger bindings; no DROP CASCADE or temporary collision bypass.
 FOR rec IN SELECT * FROM forge_world_v2.motion_r46_source_backup
  ORDER BY signature LOOP
  EXECUTE rec.old_definition;
  p:=to_regprocedure(rec.signature);
  IF p IS NULL OR md5(pg_get_functiondef(p))<>rec.original_digest
   OR has_function_privilege('anon',p,'EXECUTE') IS DISTINCT FROM rec.original_anon_exec
   OR has_function_privilege('authenticated',p,'EXECUTE') IS DISTINCT FROM rec.original_auth_exec
   OR (SELECT prosecdef FROM pg_proc WHERE oid=p) IS DISTINCT FROM rec.original_security_definer
  THEN RAISE EXCEPTION 'R46 recovery STOP: exact postrestore source/ACL mismatch %',rec.signature;END IF;
 END LOOP;

 -- Deliberately KEEP both source-pinned R18-20 campaign-affinity triggers.
 -- This recovery restores historical movement behavior WITHOUT weakening
 -- unrelated campaign isolation. Exact schema rollback is a different plan.
 IF (SELECT count(*) FROM forge_world_v2.motion_r46_source_backup b
    WHERE md5(pg_get_functiondef(to_regprocedure(b.signature)))=b.original_digest)<>5
  OR (SELECT count(*) FROM pg_trigger WHERE tgfoid=guard_oid AND tgenabled='O')<>2
  OR NOT has_function_privilege('authenticated',
   'public.begin_world_motion_v2(uuid,jsonb,jsonb,text,bigint,bigint,boolean)','EXECUTE')
 THEN RAISE EXCEPTION 'R46 recovery STOP: postflight source/guard/classic API drift';END IF;
 RAISE NOTICE 'R18-46 RECOVERY PASS: five exact original wall/step/collision-trigger definitions restored; 2 security-affinity triggers, disabled atomic API, existing game data and migration history retained';
END $r46_recover$;
COMMIT;

-- No manipulation of supabase_migrations history; no DELETE of campaign data.
-- No automatic regrant of atomic EXECUTE. Operator must separately test
-- independently signed DM/P1/passive-P2 collision, fog, revocation and LOS.
