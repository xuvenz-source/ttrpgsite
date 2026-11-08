-- READ ONLY. Collect with an authorized maintenance account before and after
-- identical test gestures (2/4/6–10 users, 10/50/100 tokens).
-- No EXPLAIN ANALYZE on mutating RPCs, no reset counters, no config changes.
-- Copy results from TWO times and subtract cumulative counters.
select now() as observed_at,
 current_setting('max_connections')::integer as max_connections,
 (select count(*) from pg_stat_activity) as sessions_total,
 (select count(*) from pg_stat_activity where state='idle') as idle_sessions,
 pg_size_pretty(pg_database_size(current_database())) as database_size;
select application_name,backend_type,coalesce(state,'background') as state,
 count(*) as sessions,
 max(now()-backend_start) as oldest_backend_age
from pg_stat_activity group by 1,2,3 order by sessions desc;
select left(regexp_replace(query,'\s+',' ','g'),180) as signature,
 calls,round(total_exec_time::numeric,1) as total_ms,
 round(mean_exec_time::numeric,1) as mean_ms,
 round(max_exec_time::numeric,1) as max_ms,
 temp_blks_written,shared_blks_read,wal_bytes
from pg_stat_statements
where query ilike '%preview_map_motion%' or query ilike '%advance_map_motion_session%'
 or query ilike '%get_authorized_map_fog%'
 or query ilike '%get_authorized_map_light_masks%'
 or query ilike '%move_map_group%'
order by total_exec_time desc limit 30;
select * from pg_stat_wal;
select relname,n_live_tup,n_dead_tup,seq_scan,idx_scan
from pg_stat_user_tables where schemaname in ('public','forge_visibility')
and relname in ('map_tokens','movement_preview_rates','movement_sessions',
 'viewer_fog_snapshots','map_viewer_visibility_ticks','map_visibility_ticks')
order by relname;
-- dashboard capture, outside SQL: committed memory, physical RAM, swap,
-- PostgREST pool occupancy and Supabase Realtime message rate.
-- Browser console at each test client: __ttrpgMovementMetrics()
