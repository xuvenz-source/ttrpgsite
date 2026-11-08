-- STAGING ROLLBACK: FIRST deploy legacy-compatible frontend.
-- Only then run this SQL. The original preview_map_motion, get_authorized_map_fog_v2,
-- light masks, move_map_group, fog ticks and RLS policies are untouched.
revoke all on function public.get_authorized_map_fog_delta(uuid,uuid,bigint,bigint)
 from authenticated,anon,public;
revoke all on function public.end_map_motion_sessions(uuid,uuid[],uuid[])
 from authenticated,anon,public;
revoke all on function public.advance_map_motion_session(uuid,integer,integer,bigint)
 from authenticated,anon,public;
revoke all on function public.begin_map_motion_session(uuid,text,uuid,boolean)
 from authenticated,anon,public;
drop function if exists public.get_authorized_map_fog_delta(uuid,uuid,bigint,bigint);
drop function if exists forge_visibility.fog_cells_diff(jsonb,jsonb);
drop function if exists public.end_map_motion_sessions(uuid,uuid[],uuid[]);
drop function if exists public.advance_map_motion_session(uuid,integer,integer,bigint);
drop function if exists public.begin_map_motion_session(uuid,text,uuid,boolean);
drop table if exists forge_visibility.movement_sessions;
drop table if exists forge_visibility.viewer_fog_snapshots;
drop function if exists forge_visibility.observer_path_status_cached(uuid,uuid,uuid,jsonb,integer,integer,integer,double precision,double precision,double precision,double precision,integer);
-- Do not remove the private movement_preview_rates or public visibility ticks.
