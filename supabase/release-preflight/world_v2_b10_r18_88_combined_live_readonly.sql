-- B10-R18-88: READ ONLY LIVE CATALOG PREFLIGHT.
-- This file never performs SQL DDL/DML, never authorizes deployment,
-- never prints scene geometry, tokens, user IDs or private fog frames.
-- It is NOT the official authenticated pinned v2.81.3 CLI linked
-- fetch/list/db push --dry-run, nor a substitute for signed DM/P1/P2 QA.
SELECT jsonb_build_object(
 'kind','B10-R18-88-live-readonly',
 'observed_at',clock_timestamp(),
 'registered_migrations',(SELECT count(*) FROM supabase_migrations.schema_migrations),
 'newest_version',(SELECT max(version)::text FROM supabase_migrations.schema_migrations),
 'pending_eight_installed',(
   SELECT count(*) FROM supabase_migrations.schema_migrations
    WHERE version::text=ANY(ARRAY[
      '20261111023204','20261113021005','20261113021007',
      '20261113021010','20261113021012','20261113021020',
      '20261113021022','20261113024116']::text[])),
 'fog_original_md5',md5(pg_get_functiondef(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure)),
 'ray_original_md5',md5(pg_get_functiondef(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure)),
 'fog_function_acl',(SELECT p.proacl::text FROM pg_proc p WHERE
   p.oid='forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure),
 'ray_function_acl',(SELECT p.proacl::text FROM pg_proc p WHERE
   p.oid='forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure),
 'authenticated_private_schema_usage',
   has_schema_privilege('authenticated','forge_visibility','USAGE'),
 'anon_private_schema_usage',
   has_schema_privilege('anon','forge_visibility','USAGE'),
 'active_motion_sessions',(SELECT count(*) FROM forge_world_v2.motion_sessions
    WHERE status='active'),
 'database_waiting_locks',(SELECT count(*) FROM pg_stat_activity
    WHERE datname=current_database() AND wait_event_type='Lock'),
 'track_functions',current_setting('track_functions'),
 'source_preinstall_requires',
   '83 historical + 8 separately reviewed official migrations and exact unmodified private original functions',
 'release_decision','NO_GO'
) AS r88_readonly_qa_preflight;
