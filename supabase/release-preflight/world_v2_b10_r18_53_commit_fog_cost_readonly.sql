-- Tabletop Forge B10-R18-53: READ-ONLY fog/Commit dependency and cost survey.
-- This is NOT a migration or a performance benchmark. No SQL-body/hidden
-- map, user, campaign, token, recipient or coordinate values are returned.
-- Single SELECT only. Requires privileged operator, never browser execution.
WITH pinned(signature, expected_md5) AS (
 VALUES
 ('public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','f87014e7a967d1db1262dabe9e125552'),
 ('forge_visibility.tick_tokens()','f6c2eef860141bff253024e0f6d8c7ba'),
 ('forge_visibility.viewers_affected_by_token_move(public.map_tokens,public.map_tokens)','18ee8bd8e81d681dc22aecd50eb66425'),
 ('forge_visibility.bump_tick_scoped(uuid,uuid[])','f75e231c06bef2912c9b013ea9735cdc'),
 ('forge_visibility.bump_viewer_ticks(uuid,uuid[])','fead41e37dfd6e2fa30499829e24bd02'),
 ('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','ee3356af321fec1a3e167a75c6245e86'),
 ('forge_visibility.fog_cells_diff(jsonb,jsonb)','0c477595f2fd916d3520a792bbe52cd7')
),
fingerprints AS (
 SELECT signature, to_regprocedure(signature) IS NOT NULL AS present,
        md5(pg_get_functiondef(to_regprocedure(signature))) AS source_md5
 FROM pinned
),
triggers AS (
 SELECT t.tgname AS name, t.tgenabled AS enabled, pg_get_triggerdef(t.oid,true) AS definition
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='map_tokens'
  AND t.tgname IN ('forge_visibility_token_tick','forge_player_collision')
  AND NOT t.tgisinternal
),
rpc_queries AS (
 SELECT
  CASE WHEN query ILIKE '%commit_world_motion_v2%' THEN 'commit'
       WHEN query ILIKE '%advance_world_motion_v2%' THEN 'advance'
       ELSE NULL END AS phase,
  calls,total_exec_time,max_exec_time
 FROM extensions.pg_stat_statements
 WHERE query ILIKE 'WITH pgrst_source AS%'
   AND (query ILIKE '%commit_world_motion_v2%' OR query ILIKE '%advance_world_motion_v2%')
),
metrics AS (
 SELECT phase, SUM(calls)::bigint AS calls,
        ROUND((SUM(total_exec_time)/NULLIF(SUM(calls),0))::numeric,2) AS mean_db_ms,
        ROUND(MAX(max_exec_time)::numeric,2) AS max_db_ms
 FROM rpc_queries WHERE phase IS NOT NULL GROUP BY phase
)
SELECT jsonb_build_object(
 'kind','B10-R18-53-fog-commit-dependency-readonly',
 'schema',1,'observed_at',clock_timestamp(),
 'history',jsonb_build_object(
  'applied',(SELECT count(*)::integer FROM supabase_migrations.schema_migrations),
  'last_version',(SELECT max(version::text) FROM supabase_migrations.schema_migrations),
  'r05_installed',(SELECT count(*)>0 FROM supabase_migrations.schema_migrations WHERE version::text='20261111023204')
 ),
 'function_hashes',(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'signature',signature,'present',present,'source_md5',source_md5) ORDER BY signature),'[]'::jsonb)
 FROM fingerprints),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'name',name,'enabled',enabled,'definition',definition) ORDER BY name),'[]'::jsonb) FROM triggers),
 'footprint',jsonb_build_object(
  'fog_maps',(SELECT count(*)::integer FROM forge_visibility.map_rules WHERE fog_enforced),
  'tokens',(SELECT count(*)::integer FROM public.map_tokens),
  'viewer_snapshots',(SELECT count(*)::integer FROM forge_visibility.viewer_fog_snapshots),
  'viewer_tick_rows',(SELECT count(*)::integer FROM public.map_viewer_visibility_ticks)
 ),
 'measurement',jsonb_build_object(
  'scope','CUMULATIVE_PG_STAT_STATEMENTS_NOT_COMPONENT_TIME',
  'stats_reset',(SELECT stats_reset FROM extensions.pg_stat_statements_info),
  'track_functions',current_setting('track_functions'),
  'rpc_aggregates',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'phase',phase,'calls',calls,'mean_db_ms',mean_db_ms,'max_db_ms',max_db_ms) ORDER BY phase),'[]'::jsonb) FROM metrics),
  'waiting_locks_at_snapshot',(SELECT count(*)::integer FROM pg_locks WHERE NOT granted)
 )
) AS diagnostic_receipt;
