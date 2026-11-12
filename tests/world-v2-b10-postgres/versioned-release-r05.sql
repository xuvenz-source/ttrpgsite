-- B10-R05 separate disposable PostgreSQL database, never live Supabase.
-- The calling shell guards the PGHOST, database name, and isolated marker.
\set ON_ERROR_STOP on

-- The synthetic B04 fixture lacks the original Commit. Install the exact
-- source-extracted released Commit to match live Supabase, not a stub.
\i /tmp/world_v2_b10_r05_original_commit.sql

CREATE TEMP TABLE r05_original AS
SELECT x.signature,md5(pg_get_functiondef(to_regprocedure(x.signature))) digest
FROM (VALUES
 ('forge_world_v2.publish_approved_observers(forge_world_v2.motion_sessions,jsonb,jsonb)'),
 ('forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'),
 ('public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'),
 ('public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)')
) x(signature);

-- First rehearsal: the entire versioned file must roll back cleanly when the
-- executor is inside a transaction, INCLUDING protected recovery snapshots.
BEGIN;
\i supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql
DO $r05_rollback_test$
BEGIN
 IF to_regclass('forge_world_v2.motion_r05_function_backup') IS NULL OR
  (SELECT count(*) FROM forge_world_v2.motion_r05_function_backup)<>4
 THEN RAISE EXCEPTION 'R05 fail: protected backup not captured';END IF;
 RAISE NOTICE 'R05-01 versioned migration installed atomically in test transaction';
END $r05_rollback_test$;
ROLLBACK;

DO $r05_rollback_verified$
BEGIN
 IF to_regclass('forge_world_v2.motion_r05_function_backup') IS NOT NULL OR
  to_regclass('forge_world_v2.observer_pending_b07') IS NOT NULL OR
  to_regclass('forge_world_v2.observer_budget_b07') IS NOT NULL OR
  to_regprocedure('forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)') IS NOT NULL OR
  EXISTS(SELECT 1 FROM r05_original x
    WHERE md5(pg_get_functiondef(to_regprocedure(x.signature))) IS DISTINCT FROM x.digest)
 THEN RAISE EXCEPTION 'R05 fail: migration did not fully roll back';END IF;
 RAISE NOTICE 'R05-02 aborted versioned migration leaves exact original source';
END $r05_rollback_verified$;

-- Second rehearsal: persist the migration, then execute our MANUAL
-- roll-forward compatibility repair from its protected original definitions.
BEGIN;
\i supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql
COMMIT;
DO $r05_committed$
BEGIN
 IF to_regclass('forge_world_v2.motion_r05_function_backup') IS NULL OR
  (SELECT count(*) FROM forge_world_v2.motion_r05_function_backup)<>4 OR
  EXISTS(SELECT 1 FROM r05_original x
   WHERE md5(pg_get_functiondef(to_regprocedure(x.signature)))=x.digest)
 THEN RAISE EXCEPTION 'R05 fail: committed SQL or backups missing';END IF;
 RAISE NOTICE 'R05-03 committed versioned migration has four original-function backups';
END $r05_committed$;

\i supabase/release-recovery/world_v2_b10_r05_restore_original_authority.sql
DO $r05_recovery_verified$
BEGIN
 IF EXISTS(SELECT 1 FROM r05_original x
  WHERE md5(pg_get_functiondef(to_regprocedure(x.signature))) IS DISTINCT FROM x.digest)
  OR to_regclass('forge_world_v2.motion_r05_function_backup') IS NULL OR
  NOT (SELECT relrowsecurity FROM pg_class WHERE oid=
   'forge_world_v2.motion_r05_function_backup'::regclass)
  OR has_schema_privilege('authenticated','forge_world_v2','USAGE') OR
  has_function_privilege('anon',
   'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'R05 fail: committed-migration recovery incomplete';END IF;
 RAISE NOTICE 'R05-04 post-commit recovery returned ALL four ORIGINAL functions, unchanged RLS/ACL';
END $r05_recovery_verified$;
\echo B10-R05 PASS: real CLI-named SQL atomic abort + after-commit source recovery on isolated PostgreSQL 17
