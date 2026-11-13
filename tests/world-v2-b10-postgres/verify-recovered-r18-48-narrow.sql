-- R18-48 NARROW fifth-database post-commit forward recovery assertions.
-- All DDL happened ONLY in the isolated PG17 GitHub Actions container.
\set ON_ERROR_STOP on
DO $r46_check$
DECLARE item record;
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=5 FROM forge_world_v2.motion_r46_source_backup) AND
  (SELECT count(*)=5 FROM forge_world_v2.motion_r46_source_backup b
   WHERE md5(pg_get_functiondef(to_regprocedure(b.signature)))=b.original_digest
    AND md5(b.old_definition)=b.original_digest
    AND b.sealed_at IS NOT NULL AND b.installed_digest IS NOT NULL) AND
  (SELECT count(*)=4 FROM forge_world_v2.motion_r46_source_backup
    WHERE installed_digest<>original_digest) AND
  (SELECT count(*)=1 FROM forge_world_v2.motion_r46_source_backup
    WHERE signature LIKE 'forge_world_v2.step_allowed(%'
      AND installed_digest=original_digest) AND
  (SELECT count(*)=4 FROM forge_world_v2.motion_r05_function_backup) AND
  NOT EXISTS(SELECT 1 FROM forge_world_v2.motion_r05_function_backup b
   WHERE md5(pg_get_functiondef(to_regprocedure(b.signature)))<>b.original_digest),
  'R48-02 narrow original 5 geometry/collision/step PLUS 4 R05 restored, exactly four changed');
 PERFORM public.b08_assert(
  NOT has_function_privilege('authenticated',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') AND
  NOT has_function_privilege('anon',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') AND
  has_function_privilege('authenticated',
   'public.begin_world_motion_v2(uuid,jsonb,jsonb,text,bigint,bigint,boolean)','EXECUTE') AND
  has_function_privilege('authenticated',
   'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)','EXECUTE') AND
  has_function_privilege('authenticated',
   'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)','EXECUTE'),
  'R46-03 atomic new calls denied; original Begin/Advance/Commit still callable');
 PERFORM public.b08_assert(
  (SELECT count(*)=2 FROM pg_trigger t
   WHERE t.tgenabled='O' AND t.tgfoid=
    'forge_visibility.guard_campaign_affinity_r18_20()'::regprocedure) AND
  (SELECT md5(pg_get_functiondef(
   'forge_visibility.guard_campaign_affinity_r18_20()'::regprocedure))
   =function_digest FROM forge_world_v2.motion_r46_guard_seal WHERE id=1) AND
  NOT has_schema_privilege('anon','forge_world_v2','USAGE') AND
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE') AND
  (SELECT relrowsecurity FROM pg_class WHERE oid=
   'forge_world_v2.motion_r46_source_backup'::regclass) AND
  (SELECT relrowsecurity FROM pg_class WHERE oid=
   'forge_world_v2.motion_r46_guard_seal'::regclass),
  'R46-04 campaign identity security remains stronger while private source backups stay protected');
 PERFORM public.b08_assert(
  to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NOT NULL AND
  (SELECT count(*)=2 FROM information_schema.columns
   WHERE table_schema='forge_world_v2' AND table_name='motion_sessions'
    AND column_name IN ('final_request_r28','final_reply_r28')) AND
  (SELECT count(*)=0 FROM forge_world_v2.motion_sessions
   WHERE status='active' AND expires_at>clock_timestamp()) AND
  (SELECT x=1 AND y=1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'::uuid) AND
  (SELECT count(*)=0 FROM forge_world_v2.observer_pending_b07),
  'R46-05 release history/schema retained; no active movement, changed token, or residual private observer queue');
 RAISE NOTICE 'R18-48 narrow: 4 replaced plus 1 original step validator verified; 5 source + 4 R05 originals recovered, classic actor RPC ACL intact, campaign-affinity triggers retained, atomic API disabled (NOT full schema rollback)';
END $r46_check$;
