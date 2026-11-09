-- READ ONLY: lightweight Supabase Nano baseline. Sample idle and after controlled load.
-- PostgreSQL cannot report host resident RAM or swap-in/swap-out: use Dashboard.
select now() sample_at,pg_postmaster_start_time() pg_started,
 pg_size_pretty(pg_database_size(current_database())) db_size;
select name,setting,unit,context,source,pending_restart from pg_settings
where name in ('shared_buffers','work_mem','max_connections','maintenance_work_mem')
order by name;
select coalesce(name,'unnamed') component,sum(allocated_size)::bigint bytes,
 pg_size_pretty(sum(allocated_size)::bigint) size
from pg_shmem_allocations group by 1 order by bytes desc limit 15;
select sum(allocated_size)::bigint total_shmem_bytes
from pg_shmem_allocations;
select coalesce(nullif(application_name,''),'(blank)') application,backend_type,
 coalesce(state,'(system)') state,count(*) connections
from pg_stat_activity group by 1,2,3 order by connections desc;
select datname,stats_reset,xact_commit,xact_rollback,blks_read,blks_hit,
 temp_files,temp_bytes,deadlocks
from pg_stat_database where datname=current_database();
select slot_type,plugin,active,count(*) slots
from pg_replication_slots group by 1,2,3 order by 1,2,3;
