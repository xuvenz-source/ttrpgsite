-- B10-R18-84 end: read-only aggregate of original PG17 R18-68 workload.
-- Runs immediately AFTER R18-68 inside the same R18-54 disposable
-- BEGIN/ROLLBACK. No additional movements, remote DB, or source mutation.
\set ON_ERROR_STOP on
DO $r84_after_guard$
BEGIN
 IF current_database()<>'world_v2_b10_r05' OR current_user<>'postgres'
 OR current_setting('track_functions')<>'all'
 OR to_regclass('pg_temp.r84_functions_before') IS NULL
 OR to_regclass('pg_temp.r68_samples') IS NULL
 OR to_regclass('pg_temp.r84_function_delta') IS NOT NULL
 OR (SELECT count(*) FROM pg_temp.r68_samples)<>36
 OR (SELECT x=1 AND y=1 FROM public.map_tokens
     WHERE id='00000000-0000-4000-8000-000000000101'::uuid)
     IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'R84 rejects incomplete/nonisolated or changed signed workload';END IF;
END $r84_after_guard$;

-- PostgreSQL xact-scoped user-function counters include original Commit,
-- token collision and fog triggers, plus called PL/pgSQL functions.
-- Each R68 iteration performed a timed signed forward Commit and an
-- untimed signed return: exactly 72 original Commits, no new sessions.
SELECT pg_stat_clear_snapshot();
CREATE TEMP TABLE r84_function_delta ON COMMIT DROP AS
SELECT ns.nspname AS function_schema,p.proname AS function_name,
 (after_stats.calls-coalesce(before_stats.calls,0))::bigint AS calls,
 greatest(0,after_stats.total_time-coalesce(before_stats.total_time,0))
  ::double precision AS inclusive_ms,
 greatest(0,after_stats.self_time-coalesce(before_stats.self_time,0))
  ::double precision AS self_ms
FROM pg_stat_xact_user_functions after_stats
LEFT JOIN pg_temp.r84_functions_before before_stats
 ON before_stats.funcid=after_stats.funcid
JOIN pg_proc p ON p.oid=after_stats.funcid
JOIN pg_namespace ns ON ns.oid=p.pronamespace
WHERE (after_stats.calls-coalesce(before_stats.calls,0))>0
 AND ns.nspname IN('public','forge_visibility','forge_world_v2');

DO $r84_assert$
DECLARE signed_commits bigint;fog_trigger_calls bigint;collision_trigger_calls bigint;
BEGIN
 SELECT calls INTO signed_commits FROM pg_temp.r84_function_delta
 WHERE function_schema='public' AND function_name='commit_world_motion_v2';
 SELECT calls INTO fog_trigger_calls FROM pg_temp.r84_function_delta
 WHERE function_schema='forge_visibility' AND function_name='tick_tokens';
 SELECT calls INTO collision_trigger_calls FROM pg_temp.r84_function_delta
 WHERE function_schema='forge_visibility' AND function_name='enforce_collision';
 PERFORM public.b08_assert(
  signed_commits=72
  AND fog_trigger_calls>=72
  AND collision_trigger_calls>=72
  AND (SELECT count(*)=4 FROM pg_temp.r84_function_delta
    WHERE function_schema='public'
    AND function_name IN('reject_direct_sheet_inventory_overwrite',
      'protect_token_fields','touch_updated_at','validate_token_map')
    AND calls>=72)
  AND (SELECT count(*)=36 FROM pg_temp.r68_samples)
  AND (SELECT min(viewer_revision_delta)>=2 FROM pg_temp.r68_samples
       WHERE fog='fog-on')
  AND (SELECT max(viewer_revision_delta)=0 FROM pg_temp.r68_samples
       WHERE fog='fog-off'),
  'R84-02 PostgreSQL xact profiler observed 72 signed Commit calls, real canonical token triggers and original private fog effects');
 PERFORM public.b08_assert(
  to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)')
   IS NULL
  AND (SELECT status='committed' FROM forge_world_v2.motion_sessions
       ORDER BY created_at DESC LIMIT 1),
  'R84-03 source original Commit remains without installed atomic finalizer');
END $r84_assert$;

-- Only source-function names, counts and aggregate timings are logged:
-- never map IDs, player IDs, source geometry or private frame bodies.
-- The R68 workload includes signed Begin/Advance, forward/return Commit,
-- synthetic fog warmup, and all authentic user-function descendants.
-- This is NOT a per-Commit causal timing breakdown or live browser p95.
SELECT function_schema,function_name,calls,
 round(inclusive_ms::numeric,2) inclusive_ms,
 round(self_ms::numeric,2) self_ms,
 round((self_ms/nullif(calls,0))::numeric,3) self_ms_per_call
FROM pg_temp.r84_function_delta
WHERE (function_schema,function_name) IN (
 ('public','commit_world_motion_v2'),
 ('public','reject_direct_sheet_inventory_overwrite'),
 ('public','protect_token_fields'),
 ('public','touch_updated_at'),
 ('public','validate_token_map'),
 ('public','advance_world_motion_v2'),
 ('public','begin_world_motion_v2'),
 ('forge_world_v2','step_allowed'),
 ('forge_world_v2','session_valid'),
 ('forge_world_v2','commit_allows_piece_v2'),
 ('forge_visibility','tick_tokens'),
 ('forge_visibility','enforce_collision'),
 ('forge_visibility','viewers_affected_by_token_move'),
 ('forge_visibility','bump_tick_scoped'),
 ('forge_visibility','bump_viewer_ticks'),
 ('forge_visibility','authorized_viewer_fog_frame'),
 ('forge_visibility','fog_cells_diff'),
 ('forge_visibility','ray_blocked'),
 ('forge_visibility','is_lit'))
ORDER BY self_ms DESC,function_schema,function_name LIMIT 15;

DO $r84_finish$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=36 FROM pg_temp.r68_samples)
  AND (SELECT x=1 AND y=1 FROM public.map_tokens
     WHERE id='00000000-0000-4000-8000-000000000101'::uuid)
  AND to_regclass('pg_temp.r84_function_delta') IS NOT NULL
  AND (SELECT calls=72 FROM pg_temp.r84_function_delta
       WHERE function_schema='public'
        AND function_name='commit_world_motion_v2'),
  'R84-04 original signed Commit and per-function sample counts preserved before R54 rollback');
 RAISE NOTICE 'R18-84 PASS: isolated xact-scoped function profile for existing R68 workload, SIX of SIX live token position triggers; tool check follows, NOT live browser attribution';
END $r84_finish$;
