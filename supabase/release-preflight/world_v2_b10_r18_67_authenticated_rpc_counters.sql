-- Tabletop Forge R18-67 — READ-ONLY authenticated World V2 RPC
-- performance-counter snapshot for before/after live QA.
--
-- Does not read user IDs, token IDs, map geometry, SQL source text, or session
-- credentials. Only four hardcoded public RPC name patterns and cumulative
-- pg_stat_statements counters are reported.
--
-- These counters span the entire stats_reset epoch; they do NOT report p95
-- latency, browser RTT, or the time of an individual movement. No approval
-- to install migrations, change collision, or release to production.
WITH classified AS (
 SELECT CASE
   WHEN position('commit_world_motion_v2' IN lower(s.query))>0 THEN 'commit'
   WHEN position('advance_world_motion_v2' IN lower(s.query))>0 THEN 'advance'
   WHEN position('get_world_visibility_v2' IN lower(s.query))>0 THEN 'visibility'
   WHEN position('begin_world_motion_v2' IN lower(s.query))>0 THEN 'begin'
   ELSE NULL END AS family,
   s.calls,s.total_exec_time,s.max_exec_time,
   s.shared_blks_hit,s.shared_blks_read
 FROM extensions.pg_stat_statements s
 JOIN pg_roles r ON r.oid=s.userid
 WHERE s.dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
   AND r.rolname='authenticated'
   AND (position('world_motion_v2' IN lower(s.query))>0 OR
        position('get_world_visibility_v2' IN lower(s.query))>0)
), grouped AS (
 SELECT family,count(*)::integer AS variants,
  sum(calls)::bigint AS calls,
  round(sum(total_exec_time)::numeric,3) AS total_exec_ms,
  round(max(max_exec_time)::numeric,3) AS historical_max_exec_ms,
  sum(shared_blks_hit)::bigint AS shared_hits,
  sum(shared_blks_read)::bigint AS shared_reads
 FROM classified WHERE family IS NOT NULL GROUP BY family
), ordered AS (
 SELECT f.family,coalesce(g.variants,0)::integer AS variants,
  coalesce(g.calls,0)::bigint AS calls,
  coalesce(g.total_exec_ms,0)::numeric AS total_exec_ms,
  coalesce(g.historical_max_exec_ms,0)::numeric AS historical_max_exec_ms,
  coalesce(g.shared_hits,0)::bigint AS shared_hits,
  coalesce(g.shared_reads,0)::bigint AS shared_reads,
  f.rank
 FROM (VALUES ('begin',1),('advance',2),('commit',3),('visibility',4))
  AS f(family,rank)
 LEFT JOIN grouped g ON g.family=f.family
)
SELECT jsonb_build_object(
 'schema',1,
 'kind','B10-R18-67-world-v2-authenticated-rpc-counter-snapshot',
 'observed_at',clock_timestamp(),
 'stats_reset',(SELECT stats_reset FROM extensions.pg_stat_statements_info),
 'track_mode',current_setting('pg_stat_statements.track',true),
 'db_role','authenticated',
 'families',(
  SELECT jsonb_agg(jsonb_build_object(
   'family',family,'variants',variants,'calls',calls,
   'totalExecMs',total_exec_ms,
   'historicalMaxExecMs',historical_max_exec_ms,
   'sharedHits',shared_hits,'sharedReads',shared_reads
  ) ORDER BY rank) FROM ordered)
) AS world_v2_performance_snapshot;
