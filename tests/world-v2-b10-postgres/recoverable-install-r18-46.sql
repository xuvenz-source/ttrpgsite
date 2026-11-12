-- R18-46 full post-R05 candidate install, fourth DISPOSABLE PG17 DB only.
-- R05 and R17/19/20 already installed, original five sources privately
-- backed up BEFORE R17. All later candidates COMMIT here to rehearse the
-- actual manual post-commit forward recovery in separate DB transactions.
\set ON_ERROR_STOP on
BEGIN;
\i supabase/candidates/world_v2_r18_26_step_bbox_prefilter.sql
\i supabase/candidates/world_v2_r18_27_commit_empty_work.sql
\i supabase/candidates/world_v2_r18_28_atomic_finalize.sql
\i supabase/candidates/world_v2_r18_30_blocked_final_semantics.sql
\i supabase/candidates/world_v2_r18_46_seal_release_sources.sql
COMMIT;
DO $r46_install_check$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=5 FROM forge_world_v2.motion_r46_source_backup
   WHERE sealed_at IS NOT NULL AND installed_digest<>original_digest) AND
  (SELECT count(*)=1 FROM forge_world_v2.motion_r46_guard_seal) AND
  has_function_privilege('authenticated',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') AND
  to_regprocedure('forge_visibility.guard_campaign_affinity_r18_20()') IS NOT NULL AND
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE') AND
  (SELECT count(*)=0 FROM forge_world_v2.motion_sessions),
  'R46-01 full source stack committed and protected recovery snapshots sealed');
END $r46_install_check$;
