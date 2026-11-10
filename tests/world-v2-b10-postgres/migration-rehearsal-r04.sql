-- B10-R04: transaction-safe migration rehearsal on disposable PostgreSQL 17.
-- Must be invoked ONLY by the guarded tests/world-v2-b10-postgres/run.sh
-- after released-source fixture and source-real LOS selector are installed.
-- No live database URI, user data, secrets or SQL writes from production.
\set ON_ERROR_STOP on

-- Record BEFORE state outside the rehearsal transaction so rollback can be
-- proven rather than assumed.
CREATE TEMP TABLE world_v2_r04_before AS
SELECT md5(pg_get_functiondef(
 'forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'::regprocedure
)) AS original_core,
 md5(pg_get_functiondef(
 'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'::regprocedure
)) AS original_advance,
 md5(pg_get_functiondef(to_regprocedure(
 'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'
))) AS original_commit;

DO $r04_pre$
BEGIN
 IF to_regclass('forge_world_v2.observer_pending_b07') IS NOT NULL OR
   to_regclass('forge_world_v2.observer_budget_b07') IS NOT NULL OR
   to_regprocedure('forge_world_v2.validate_motion_path_batch_b03(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NOT NULL OR
   to_regprocedure('forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)') IS NOT NULL
 THEN RAISE EXCEPTION 'R04 rehearsal fixture was not clean';END IF;
 RAISE NOTICE 'R04-01 verified clean live-shaped baseline';
END $r04_pre$;

BEGIN;
\i supabase/candidates/world_v2_b03_path_validation.sql
\i supabase/candidates/world_v2_b07_private_observer_budget.sql
\i supabase/candidates/world_v2_b08_commit_reconciliation.sql
\i supabase/candidates/world_v2_b10_r01_core_path_integration.sql
\i supabase/candidates/world_v2_b10_r03_terminal_queue_retirement.sql
DO $r04_inside$
DECLARE count_public int;count_private int;
BEGIN
 IF to_regclass('forge_world_v2.observer_pending_b07') IS NULL OR
  to_regclass('forge_world_v2.observer_budget_b07') IS NULL OR
  to_regprocedure('forge_world_v2.validate_motion_path_batch_b03(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NULL OR
  to_regprocedure('forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)') IS NULL
 THEN RAISE EXCEPTION 'R04 missing candidate after atomic staged installation';END IF;

 IF NOT (SELECT pg_get_functiondef(
 'forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'::regprocedure)
 LIKE '%validate_motion_path_batch_b03%') THEN
  RAISE EXCEPTION 'R04 B03 authority not wired';END IF;
 IF NOT (SELECT pg_get_functiondef(
 'forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)'::regprocedure)
 LIKE '%Retain only%') THEN
  RAISE EXCEPTION 'R04 B08 private terminal retirement not installed';END IF;
 IF (SELECT pg_get_functiondef(
 'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'::regprocedure)
 NOT LIKE '%drain_committed_observers_b08%') THEN
  RAISE EXCEPTION 'R04 public B08 commit not wired';END IF;

 -- Private tables require RLS even though the private schema is not
 -- exposed. The only browser-callable entry remains signed actor RPC.
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=
  'forge_world_v2.observer_pending_b07'::regclass) OR
  NOT (SELECT relrowsecurity FROM pg_class WHERE oid=
  'forge_world_v2.observer_budget_b07'::regclass) OR
  has_schema_privilege('anon','forge_world_v2','USAGE') OR
  has_schema_privilege('authenticated','forge_world_v2','USAGE') OR
  has_function_privilege('anon',
    'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') OR
  NOT has_function_privilege('authenticated',
    'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') OR
  NOT has_function_privilege('authenticated',
    'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'R04 role/ACL/source-compatible migration gate failed';END IF;
 SELECT count(*) INTO count_public FROM pg_proc p JOIN pg_namespace n
 ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
 ('advance_world_motion_v2','commit_world_motion_v2');
 IF count_public<>2 THEN
  RAISE EXCEPTION 'R04 unexpected public API signatures count %',count_public;
 END IF;
 RAISE NOTICE 'R04-02 atomic 5-candidate install source, RLS, RPC signatures and roles verified';
END $r04_inside$;
ROLLBACK;

-- The isolated B04 fixture does not install the original public Commit
-- wrapper before B08, while actual Supabase live already has it. Record
-- the pre-existing absence as NULL rather than invent a dummy RPC. Both
-- present and absent original source must be restored exactly.
-- Validate rollback in the SAME connection after the transaction ends.
DO $r04_after$
DECLARE before_values world_v2_r04_before%ROWTYPE;
BEGIN
 SELECT * INTO before_values FROM world_v2_r04_before LIMIT 1;
 IF md5(pg_get_functiondef(
 'forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'::regprocedure
 )) IS DISTINCT FROM before_values.original_core OR
 md5(pg_get_functiondef(
 'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'::regprocedure
 )) IS DISTINCT FROM before_values.original_advance OR
 md5(pg_get_functiondef(to_regprocedure(
 'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'
 ))) IS DISTINCT FROM before_values.original_commit
 THEN RAISE EXCEPTION 'R04 rollback did not restore exact V2 function source';END IF;
 IF to_regclass('forge_world_v2.observer_pending_b07') IS NOT NULL OR
  to_regclass('forge_world_v2.observer_budget_b07') IS NOT NULL OR
  to_regprocedure('forge_world_v2.validate_motion_path_batch_b03(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NOT NULL OR
  to_regprocedure('forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)') IS NOT NULL
 THEN RAISE EXCEPTION 'R04 rollback left an incompatible private candidate object';END IF;
 RAISE NOTICE 'R04-03 one-transaction rollback restored original Core, Advance, Commit and private catalog';
END $r04_after$;
DROP TABLE world_v2_r04_before;
\echo B10-R04 PASS: atomic candidate sequence + real PG rollback pre/post catalog identical
