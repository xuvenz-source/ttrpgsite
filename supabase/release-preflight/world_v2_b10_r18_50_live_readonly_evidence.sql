-- Tabletop Forge B10-R18-50 — READ-ONLY, one-statement audit receipt.
-- This is NOT a migration. Never install, link, push or run against a
-- different project without separate authorization. No SQL-body disclosure,
-- user/token IDs, signed sight, map geometry, role changes or writes.
-- 83 historical SQL fingerprints must be checked against the frozen R18-08
-- local baseline by validate-world-v2-r18-50-readonly-evidence.mjs.
WITH
  history AS (
    SELECT version::text AS version, name,
           coalesce(array_length(statements,1),0)::int AS statement_count,
           md5(array_to_string(statements, E';\n') || E';\n') AS fetched_sql_md5
    FROM supabase_migrations.schema_migrations
  ),
  critical(signature, expected_md5) AS (
    VALUES
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
  ),
  functions AS (
    SELECT signature,
           to_regprocedure(signature) IS NOT NULL AS present,
           md5(pg_get_functiondef(to_regprocedure(signature))) AS source_md5
    FROM critical
  )
SELECT jsonb_build_object(
  'schema', 1,
  'kind', 'B10-R18-50-live-readonly',
  'observed_at', now(),
  'migration_history', coalesce(
    (SELECT jsonb_agg(jsonb_build_object(
      'version',version,'name',name,'statement_count',statement_count,
      'fetched_sql_md5',fetched_sql_md5
    ) ORDER BY version) FROM history), '[]'::jsonb),
  'authority_sources', coalesce(
    (SELECT jsonb_agg(jsonb_build_object(
      'signature',signature,'present',present,'source_md5',source_md5
    ) ORDER BY signature) FROM functions), '[]'::jsonb),
  'preinstall', jsonb_build_object(
    'r05_installed', EXISTS(SELECT 1 FROM history WHERE version='20261111023204'),
    'atomic_rpc_present',to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NOT NULL,
    'r05_backup_present',to_regclass('forge_world_v2.motion_r05_function_backup') IS NOT NULL,
    'r20_campaign_guard_present',to_regprocedure('forge_visibility.guard_campaign_affinity_r18_20()') IS NOT NULL,
    'r05_observer_pending_present',to_regclass('forge_world_v2.observer_pending_b07') IS NOT NULL,
    'active_motion_sessions',(SELECT count(*)::int FROM forge_world_v2.motion_sessions WHERE status='active' AND expires_at>clock_timestamp())
  ),
  'access',jsonb_build_object(
    'anon_internal_schema_usage',has_schema_privilege('anon','forge_world_v2','USAGE'),
    'authenticated_internal_schema_usage',has_schema_privilege('authenticated','forge_world_v2','USAGE'),
    'anon_advance_execute',has_function_privilege('anon','public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE'),
    'anon_commit_execute',has_function_privilege('anon','public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','EXECUTE'),
    'authenticated_advance_execute',has_function_privilege('authenticated','public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE'),
    'authenticated_commit_execute',has_function_privilege('authenticated','public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','EXECUTE')
  ),
  'point_in_time',jsonb_build_object(
    'waiting_database_locks',(SELECT count(*)::int FROM pg_locks WHERE NOT granted),
    'database_sessions',(SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database()),
    'configured_max_connections',(SELECT setting::int FROM pg_settings WHERE name='max_connections')
  )
) AS release_receipt;
