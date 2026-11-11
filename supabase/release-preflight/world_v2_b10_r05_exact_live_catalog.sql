-- B10-R05 READ-ONLY preflight for disposable LIVE TEST project only.
-- The following expected pg_get_functiondef MD5 digests were obtained
-- through read-only pg_catalog queries on 11 November 2026 (Melbourne).
-- DO NOT copy this SQL into a migration or run with elevated unsafe search_path.
-- Re-query and independently verify the current project before ANY deploy.
-- Any mismatch aborts; do not suppress it or bypass with migration repair.
DO $r05_exact_preflight$
DECLARE migration_count integer;latest text;active_count integer;
 expected record;actual text;
BEGIN
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL OR
  to_regclass('forge_world_v2.motion_sessions') IS NULL
 THEN RAISE EXCEPTION 'R05: missing expected migration history/base motion table';END IF;
 SELECT count(*),max(version::text) INTO migration_count,latest
 FROM supabase_migrations.schema_migrations;
 IF migration_count<>83 OR latest<>'20261109171247' THEN
  RAISE EXCEPTION 'R05: live history diverged, count % latest %',migration_count,latest;
 END IF;
 IF to_regclass('forge_world_v2.observer_pending_b07') IS NOT NULL OR
  to_regclass('forge_world_v2.observer_budget_b07') IS NOT NULL OR
  to_regclass('forge_world_v2.motion_r05_function_backup') IS NOT NULL OR
  to_regprocedure('forge_world_v2.validate_motion_path_batch_b03(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NOT NULL OR
  to_regprocedure('forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)') IS NOT NULL
 THEN RAISE EXCEPTION 'R05: candidate SQL already or partly installed';END IF;
 SELECT count(*) INTO active_count
 FROM forge_world_v2.motion_sessions
 WHERE status='active' AND expires_at>clock_timestamp();
 IF active_count>0 THEN
  RAISE EXCEPTION 'R05: stop with % currently active motion sessions',active_count;
 END IF;
 IF has_schema_privilege('anon','forge_world_v2','USAGE') OR
  has_schema_privilege('authenticated','forge_world_v2','USAGE') OR
  NOT has_function_privilege('authenticated',
    'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') OR
  has_function_privilege('anon',
    'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'R05: private observer or public RPC privilege drift';END IF;
 FOR expected IN
  SELECT * FROM (VALUES
   ('forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','4145e4a7b1eee062196e91fffd052be1'),
   ('public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','4b38b5e7116a3ff9abc8a99f58755126'),
   ('public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','f87014e7a967d1db1262dabe9e125552'),
   ('forge_world_v2.publish_approved_observers(forge_world_v2.motion_sessions,jsonb,jsonb)','129d3d872050dd44da989fc5c36a816e'),
   ('forge_world_v2.observer_path_status(forge_world_v2.motion_sessions,uuid,text,uuid,jsonb,jsonb,integer,integer,integer)','fe246c2a813edb77179dfa6c3632face'),
   ('forge_world_v2.viewer_on_map(uuid,uuid,uuid)','d31f0c5cf2be78374b348f12c4e756a5'),
   ('public.get_world_visibility_v2(uuid)','88f8da7421b36f5375aa26e798a4a08b')
  ) AS baseline(signature,expected_digest)
 LOOP
  IF to_regprocedure(expected.signature) IS NULL THEN
   RAISE EXCEPTION 'R05: expected function missing %',expected.signature;
  END IF;
  SELECT md5(pg_get_functiondef(to_regprocedure(expected.signature)))
  INTO actual;
  IF actual IS DISTINCT FROM expected.expected_digest THEN
   RAISE EXCEPTION 'R05: source drift in %',expected.signature;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM information_schema.columns
  WHERE table_schema='forge_world_v2' AND table_name='motion_sessions'
   AND column_name IN ('last_advance_request_b08','last_commit_request_b08'))
 THEN RAISE EXCEPTION 'R05: B08 columns already partially installed';END IF;
 RAISE NOTICE 'R05 live preflight PASS: source digests/ACLs, 83 applied history, no partial install, no active gestures. THIS DID NOT INSTALL SQL.';
END $r05_exact_preflight$;
