-- R18-48 NARROW source-real release. ONLY disposable PostgreSQL 17.
-- R05 -> R46 five original-source capture -> R17 -> R19 -> R20
-- was already installed. R18-26/27 are intentionally NOT installed.
-- Install exact unmodified R18-28 and R18-30 atomic functions, then
-- the R18-48 narrow attestation seal in the SAME committed transaction.
\set ON_ERROR_STOP on
BEGIN;
\i supabase/candidates/world_v2_r18_28_atomic_finalize.sql
\i supabase/candidates/world_v2_r18_30_blocked_final_semantics.sql
\i supabase/candidates/world_v2_r18_48_narrow_seal_release_sources.sql
COMMIT;
DO $r48_install$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=5 FROM forge_world_v2.motion_r46_source_backup
   WHERE sealed_at IS NOT NULL AND installed_digest IS NOT NULL) AND
  (SELECT count(*)=4 FROM forge_world_v2.motion_r46_source_backup
   WHERE installed_digest<>original_digest) AND
  (SELECT count(*)=1 FROM forge_world_v2.motion_r46_source_backup
   WHERE signature LIKE 'forge_world_v2.step_allowed(%'
    AND installed_digest=original_digest
    AND original_digest='6dcd75ce4719cd0bf6173f77f75fdf32') AND
  (SELECT count(*)=1 FROM forge_world_v2.motion_r46_guard_seal) AND
  has_function_privilege('authenticated',
    'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') AND
  NOT has_function_privilege('anon',
    'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') AND
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE') AND
  (SELECT count(*)=0 FROM forge_world_v2.motion_sessions),
  'R48-01 narrow R05->R17/19/20->R28/30 committed; 4 changed + 1 untouched original source sealed');
 RAISE NOTICE 'R18-48 narrow source seal PASS: four changed sources, untouched original step validator, R18-26/27 absent';
END $r48_install$;
