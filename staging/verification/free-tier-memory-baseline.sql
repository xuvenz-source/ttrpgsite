-- READ ONLY. Execute for baseline and separately after controlled player tests.
-- pg_stat_statements counters are cumulative since stats_reset; measure deltas,
-- not absolute calls, and never assume virtual memory commitment equals RSS.
select now() at time zone 'UTC' as sampled_utc,
  (select stats_reset from pg_stat_statements_info) as query_stats_reset,
  (select count(*) from pg_stat_activity) as total_backends,
  (select count(*) from pg_stat_activity where state='idle') as idle_backends,
  (select count(*) from pg_stat_activity where state='active') as active_backends,
  current_setting('max_connections') as max_connections,
  pg_size_pretty(pg_database_size(current_database())) as database_bytes;
select application_name, backend_type, coalesce(state,'') state, count(*) count
from pg_stat_activity group by 1,2,3 order by count desc;
select case
 when query ilike '%get_token_monitor_values%' then 'hud_monitors'
 when query ilike '%get_token_encumbrance_badges%' then 'encumbrance'
 when query ilike '%get_authorized_map_fog%' then 'legacy_fog'
 when query ilike '%get_world_visibility_v2%' then 'world_v2_visibility'
 when query ilike '%preview_map_motion%' then 'legacy_preview'
 when query ilike '%advance_world_motion_v2%' then 'world_v2_advance'
 else null end as workload,
 sum(calls)::bigint as cumulative_calls,
 round(sum(total_exec_time)::numeric/1000,1) as cumulative_execution_seconds
from pg_stat_statements
where query ilike any (array[
 '%get_token_monitor_values%','%get_token_encumbrance_badges%',
 '%get_authorized_map_fog%','%get_world_visibility_v2%',
 '%preview_map_motion%','%advance_world_motion_v2%'])
group by 1 order by cumulative_execution_seconds desc;
-- Also capture Supabase Database Reports for actual RSS/working set,
-- committed memory, swap allocation AND swap-in/swap-out IO, CPU and IOPS.
