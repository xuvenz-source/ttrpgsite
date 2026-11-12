-- B10-R18-45 — READ-ONLY, exact pre-deployment operator gate.
-- This script is not a migration. Run only when preparing a supervised
-- release; never assume the results remain true after a competing write.
-- A second lock/active-session check inside each future migration is required.
DO $r45_exact_gate$
DECLARE
 n integer; latest text; active_n integer; got text; expected record;
BEGIN
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL OR
    to_regclass('forge_world_v2.motion_sessions') IS NULL THEN
  RAISE EXCEPTION 'R45 STOP: expected migration/session catalog absent';
 END IF;
 SELECT count(*)::int,max(version::text) INTO n,latest
 FROM supabase_migrations.schema_migrations;
 IF n<>83 OR latest<>'20261109171247' OR
    EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version='20261111023204') THEN
  RAISE EXCEPTION 'R45 STOP: exact 83-version pre-R05 history drift (% / %)',n,latest;
 END IF;
 IF to_regprocedure(
    'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'
   ) IS NOT NULL OR
    to_regclass('forge_world_v2.motion_r05_function_backup') IS NOT NULL OR
    to_regclass('forge_world_v2.observer_pending_b07') IS NOT NULL OR
    to_regclass('forge_world_v2.observer_budget_b07') IS NOT NULL OR
    to_regprocedure('forge_visibility.guard_campaign_affinity_r18_20()') IS NOT NULL OR
    EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='forge_world_v2' AND
      table_name='motion_sessions' AND column_name IN (
       'final_request_r28','final_reply_r28',
       'last_advance_request_b08','last_commit_request_b08')) THEN
  RAISE EXCEPTION 'R45 STOP: partial R05/terminal/campaign-guard installation';
 END IF;
 IF has_schema_privilege('anon','forge_world_v2','USAGE') OR
    has_schema_privilege('authenticated','forge_world_v2','USAGE') OR
    has_function_privilege('anon',
      'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
      'EXECUTE') OR
    has_function_privilege('anon',
      'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)',
      'EXECUTE') OR
    NOT has_function_privilege('authenticated',
      'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
      'EXECUTE') OR
    NOT has_function_privilege('authenticated',
      'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)',
      'EXECUTE') THEN
  RAISE EXCEPTION 'R45 STOP: V2 public/private function ACL drift';
 END IF;
 FOR expected IN SELECT * FROM (VALUES
  ('forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','4145e4a7b1eee062196e91fffd052be1'),
  ('public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','4b38b5e7116a3ff9abc8a99f58755126'),
  ('public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','f87014e7a967d1db1262dabe9e125552'),
  ('forge_world_v2.publish_approved_observers(forge_world_v2.motion_sessions,jsonb,jsonb)','129d3d872050dd44da989fc5c36a816e'),
  ('forge_world_v2.observer_path_status(forge_world_v2.motion_sessions,uuid,text,uuid,jsonb,jsonb,integer,integer,integer)','fe246c2a813edb77179dfa6c3632face'),
  ('forge_world_v2.viewer_on_map(uuid,uuid,uuid)','d31f0c5cf2be78374b348f12c4e756a5'),
  ('public.get_world_visibility_v2(uuid)','88f8da7421b36f5375aa26e798a4a08b'),
  ('forge_world_v2.step_allowed(jsonb,jsonb,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer,boolean)','6dcd75ce4719cd0bf6173f77f75fdf32'),
  ('forge_visibility.enforce_collision()','7e652f0f2334980ccc724e1748d334ba'),
  ('forge_visibility.enforce_tool_collision()','771ea1716498a43210661532f9c24977')
 ) AS pinned(signature,digest) LOOP
  IF to_regprocedure(expected.signature) IS NULL THEN
   RAISE EXCEPTION 'R45 STOP: missing pinned live function %',expected.signature;
  END IF;
  SELECT md5(pg_get_functiondef(to_regprocedure(expected.signature))) INTO got;
  IF got IS DISTINCT FROM expected.digest THEN
   RAISE EXCEPTION 'R45 STOP: source hash drift in %',expected.signature;
  END IF;
 END LOOP;
 SELECT count(*)::int INTO active_n FROM forge_world_v2.motion_sessions
 WHERE status='active' AND expires_at>clock_timestamp();
 IF active_n>0 THEN
  RAISE EXCEPTION 'R45 STOP: % active motion sessions, do not deploy now',active_n;
 END IF;
 RAISE NOTICE 'R18-45 PASS: read-only 83-version live baseline / 10 source SHA256-independent MD5 digests / actor ACL / no partial install / zero active gestures';
END $r45_exact_gate$;
