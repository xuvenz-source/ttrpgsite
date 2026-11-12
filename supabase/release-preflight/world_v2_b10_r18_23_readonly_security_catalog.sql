-- B10-R18-23. READ ONLY. Existing Free production test project only.
-- Never run migrations, set session JWTs, alter RLS, or print user/campaign data.
-- Pair this with the R18-08 83-body history digest query. This is NOT
-- independent signed DM/P1/P2 browser or WebSocket verification.
WITH expected_sources(signature, expected_md5) AS (
  VALUES
  ('forge_world_v2.advance_core_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','4145e4a7b1eee062196e91fffd052be1'),
  ('public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','4b38b5e7116a3ff9abc8a99f58755126'),
  ('public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','f87014e7a967d1db1262dabe9e125552'),
  ('forge_world_v2.publish_approved_observers(forge_world_v2.motion_sessions,jsonb,jsonb)','129d3d872050dd44da989fc5c36a816e'),
  ('forge_world_v2.observer_path_status(forge_world_v2.motion_sessions,uuid,text,uuid,jsonb,jsonb,integer,integer,integer)','fe246c2a813edb77179dfa6c3632face'),
  ('forge_world_v2.viewer_on_map(uuid,uuid,uuid)','d31f0c5cf2be78374b348f12c4e756a5'),
  ('public.get_world_visibility_v2(uuid)','88f8da7421b36f5375aa26e798a4a08b')
), source_summary AS (
  SELECT COUNT(*) AS functions_expected,
         COUNT(*) FILTER (WHERE to_regprocedure(signature) IS NOT NULL) AS functions_present,
         COUNT(*) FILTER (WHERE md5(pg_get_functiondef(to_regprocedure(signature))) = expected_md5) AS functions_matched
  FROM expected_sources
), private_summary AS (
  SELECT COUNT(*) AS private_table_count,
         COUNT(*) FILTER (WHERE NOT c.relrowsecurity) AS private_rls_disabled,
         COUNT(*) FILTER (WHERE has_table_privilege('anon', c.oid, 'SELECT')
                            OR has_table_privilege('authenticated', c.oid, 'SELECT')) AS direct_client_select_tables
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='forge_world_v2' AND c.relkind IN ('r','p')
), public_rpcs(signature) AS (
  VALUES
  ('public.begin_world_motion_v2(uuid,jsonb,jsonb,text,bigint,bigint,boolean)'),
  ('public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'),
  ('public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'),
  ('public.get_world_visibility_v2(uuid)'),
  ('public.get_world_observer_cursor_v2(uuid)'),
  ('public.preview_world_visibility_v2(uuid,uuid)'),
  ('public.can_observe_map_token(uuid)')
), rpc_summary AS (
  SELECT COUNT(*) AS checked_rpc_count,
         COUNT(*) FILTER (WHERE to_regprocedure(signature) IS NOT NULL) AS present_rpc_count,
         COUNT(*) FILTER (WHERE has_function_privilege('anon',to_regprocedure(signature),'EXECUTE')) AS anon_executable_rpc_count
  FROM public_rpcs
)
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS history_count,
  (SELECT max(version::text) FROM supabase_migrations.schema_migrations) AS latest_version,
  EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261111023204') AS r05_registered,
  s.functions_expected,s.functions_present,s.functions_matched,
  (SELECT count(*) FROM forge_world_v2.motion_sessions WHERE status='active' AND expires_at>clock_timestamp()) AS active_unexpired_sessions,
  (to_regclass('forge_world_v2.observer_pending_b07') IS NOT NULL) AS b07_pending_installed,
  (to_regclass('forge_world_v2.observer_budget_b07') IS NOT NULL) AS b07_budget_installed,
  (to_regclass('forge_world_v2.motion_r05_function_backup') IS NOT NULL) AS r05_backup_installed,
  (to_regprocedure('forge_world_v2.validate_motion_path_batch_b03(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NOT NULL) AS b03_path_installed,
  (to_regprocedure('forge_world_v2.drain_committed_observers_b08(uuid,timestamptz)') IS NOT NULL) AS b08_drain_installed,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='forge_world_v2' AND table_name='motion_sessions'
       AND column_name IN ('last_advance_request_b08','last_commit_request_b08')) AS b08_extra_columns,
  has_schema_privilege('anon','forge_world_v2','USAGE') AS anon_private_schema_usage,
  has_schema_privilege('authenticated','forge_world_v2','USAGE') AS auth_private_schema_usage,
  has_function_privilege('anon','public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') AS anon_advance_execute,
  has_function_privilege('authenticated','public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') AS auth_advance_execute,
  p.private_table_count,p.private_rls_disabled,p.direct_client_select_tables,
  r.checked_rpc_count,r.present_rpc_count,r.anon_executable_rpc_count
FROM source_summary s CROSS JOIN private_summary p CROSS JOIN rpc_summary r;
