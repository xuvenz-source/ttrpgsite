-- B10-R05 EMERGENCY POST-COMMIT RECOVERY SCRIPT — NEVER AUTOAPPLY.
-- FOR DISPOSABLE TEST CAMPAIGNS ONLY. This is NOT a migration and is never
-- discovered by Supabase db push. Execution requires a deliberate incident
-- decision, application feature-flag fallback, verified DBA privileges,
-- zero active sessions and a full read-only live preflight.
--
-- Restores precisely the four original public/private function definitions
-- captured by the R05 release migration. Keeps B07 private tables and B08
-- columns inert for audit/forward repair; does NOT try to reverse migration
-- history, DROP permanent schema objects, RLS, or map campaign data.
-- All definitions must restore or the transaction is rolled back in full.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

DO $r05_restore$
DECLARE sig text;src text;digest text;current_body text;
BEGIN
 IF to_regclass('forge_world_v2.motion_r05_function_backup') IS NULL OR
  to_regclass('forge_world_v2.observer_pending_b07') IS NULL OR
  to_regprocedure('forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)') IS NULL
 THEN RAISE EXCEPTION 'R05 recovery refused: expected applied release not installed';END IF;
 IF has_schema_privilege('anon','forge_world_v2','USAGE') OR
   has_schema_privilege('authenticated','forge_world_v2','USAGE') OR
   NOT (SELECT relrowsecurity FROM pg_class WHERE oid=
      'forge_world_v2.motion_r05_function_backup'::regclass)
 THEN RAISE EXCEPTION 'R05 recovery refused: private schema protections diverged';END IF;
 IF EXISTS(SELECT 1 FROM forge_world_v2.motion_sessions
  WHERE status='active' AND expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'R05 recovery refused: live motion sessions still active';
 END IF;
 IF (SELECT count(*) FROM forge_world_v2.motion_r05_function_backup)<>4
 THEN RAISE EXCEPTION 'R05 recovery refused: backup source is incomplete';END IF;
 -- Before any restoration, ensure the expected new release bodies are active.
 IF position('validate_motion_path_batch_b03' IN pg_get_functiondef(
  'forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'::regprocedure))=0 OR
  position('drain_committed_observers_b08' IN pg_get_functiondef(
  'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'::regprocedure))=0
 THEN RAISE EXCEPTION 'R05 recovery refused: movement schema changed since release';END IF;
 FOR sig IN
  SELECT unnest(ARRAY[
   'forge_world_v2.publish_approved_observers(forge_world_v2.motion_sessions,jsonb,jsonb)',
   'forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
   'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
   'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'
  ])
 LOOP
  SELECT old_definition,original_digest INTO src,digest
  FROM forge_world_v2.motion_r05_function_backup
  WHERE signature=sig;
  IF src IS NULL OR digest IS NULL OR md5(src)<>digest OR
   to_regprocedure(sig) IS NULL
  THEN RAISE EXCEPTION 'R05 recovery refused: missing/changed backup for %',sig;END IF;
  EXECUTE src;
  SELECT pg_get_functiondef(to_regprocedure(sig)) INTO current_body;
  IF md5(current_body)<>digest THEN
   RAISE EXCEPTION 'R05 recovery failed to restore exact original for %',sig;
  END IF;
 END LOOP;
 -- The restored original publisher never uses B07's private queued routes.
 -- These are test-only transient data and must NOT be re-sent by future
 -- operator retries. Leave the B07 schema (plus its RLS) intact for review.
 DELETE FROM forge_world_v2.observer_pending_b07;
 IF has_function_privilege('anon',
  'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') OR
  has_schema_privilege('authenticated','forge_world_v2','USAGE') OR
  NOT has_function_privilege('authenticated',
   'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'R05 recovery refused: public RPC permissions changed';END IF;
 RAISE NOTICE 'R05 forward-recovery restored four original movement functions; private B07 queue retired';
END $r05_restore$;
COMMIT;

-- AFTER THIS TRANSACTION:
-- 1. Do NOT delete/repair supabase_migrations history manually.
-- 2. Maintain/reconcile browser feature flags; do not enable B05/B06/B08
--    until a new reviewed forward fix is successfully applied.
-- 3. Keep original-version public Advance/Commit APIs and private ACLs.
-- 4. Re-run authenticated DM/P1/P2 fog/collision/revocation matrix.
-- 5. Record R05 incident and superseding migration before any future db push.
