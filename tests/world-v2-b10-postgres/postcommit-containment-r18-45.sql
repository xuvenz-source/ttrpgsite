-- R18-45 POST-COMMIT containment and R05 forward-recovery rehearsal.
-- This is an isolated, disposable PostgreSQL 17 test fixture, NOT an
-- instruction to execute against Supabase. Starts with R05->R17/19/20
-- already installed in the R18-44 third localhost test database.
\set ON_ERROR_STOP on
DO $r45_before$
BEGIN
 PERFORM public.b08_assert(
  to_regprocedure(
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)'
  ) IS NULL AND
  to_regclass('forge_world_v2.motion_r05_function_backup') IS NOT NULL AND
  (SELECT count(*)=4 FROM forge_world_v2.motion_r05_function_backup) AND
  to_regprocedure('forge_visibility.guard_campaign_affinity_r18_20()') IS NOT NULL,
  'R45-01 baseline has R05+wall/guards but no atomic endpoint');
END $r45_before$;

-- Commit the COMPLETE historical post-R05 dependency chain to the
-- throwaway database: R18-26/27 performance candidates first, followed by
-- R18-28 and R18-30 authenticated atomic finalization. This is *not* a
-- recommendation to ship R18-26/27 on performance grounds: prior measurements
-- were mixed and some scenarios regressed. Recovery below will show why
-- original step_allowed and legacy guard backups are still required.
BEGIN;
\i supabase/candidates/world_v2_r18_26_step_bbox_prefilter.sql
\i supabase/candidates/world_v2_r18_27_commit_empty_work.sql
\i supabase/candidates/world_v2_r18_28_atomic_finalize.sql
\i supabase/candidates/world_v2_r18_30_blocked_final_semantics.sql
COMMIT;
DO $r45_installed$
BEGIN
 PERFORM public.b08_assert(
  has_function_privilege('authenticated',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
   'EXECUTE') AND
  NOT has_function_privilege('anon',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)',
   'EXECUTE') AND
  (SELECT count(*)=2 FROM information_schema.columns
   WHERE table_schema='forge_world_v2' AND table_name='motion_sessions'
   AND column_name IN ('final_request_r28','final_reply_r28')),
  'R45-02 atomic endpoint actually committed in disposable DB, authenticated only');
END $r45_installed$;

-- An ordinary signed movement may be ACTIVE while the optional terminal
-- endpoint is disabled. The containment script must not remove that
-- session or invalidate the ordinary Begin/Advance/Commit API.
CREATE TEMP TABLE r45_active(session_id uuid NOT NULL);
DO $r45_open_gesture$
DECLARE
 a jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000011',true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 a:=public.begin_world_motion_v2(
  '00000000-0000-4000-8000-000000000021'::uuid,
  '[{"kind":"token","id":"00000000-0000-4000-8000-000000000101"}]'::jsonb,
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 PERFORM public.b08_assert(a ? 'sessionId',
  'R45-03 a signed existing gesture can begin before incident containment');
 INSERT INTO pg_temp.r45_active VALUES((a->>'sessionId')::uuid);
END $r45_open_gesture$;

-- The containment script is a separate committed transaction. It revokes
-- only new calls to the optional terminal RPC and does not stop already
-- running SQL statements or delete any motion rows.
\i supabase/release-recovery/world_v2_b10_r18_45_atomic_containment.sql
DO $r45_disabled$
DECLARE sid uuid;
BEGIN
 SELECT session_id INTO sid FROM pg_temp.r45_active LIMIT 1;
 PERFORM public.b08_assert(
  NOT has_function_privilege('authenticated',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)',
   'EXECUTE') AND
  NOT has_function_privilege('anon',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)',
   'EXECUTE') AND
  to_regprocedure(
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'
  ) IS NOT NULL AND
  (SELECT status='active' AND last_seq=0
   FROM forge_world_v2.motion_sessions WHERE id=sid) AND
  (SELECT x=1 AND y=1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'::uuid),
  'R45-04 post-commit containment denies atomic browser calls and leaves current active gesture/canonical token alone');
END $r45_disabled$;

-- Prove the signed movement session can still terminate through the
-- EXISTING safe server endpoints after emergency terminal revocation.
DO $r45_ordinary$
DECLARE sid uuid;ack jsonb;committed jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000011',true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 SELECT session_id INTO sid FROM pg_temp.r45_active LIMIT 1;
 ack:=public.advance_world_motion_v2(sid,1,
  '{"x":1,"y":1}'::jsonb,'[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  ack->'accepted'='[{"x":2,"y":1}]'::jsonb,
  'R45-05 normal actor-authorized Advance still works after terminal revoke');
 committed:=public.commit_world_motion_v2(sid,2,
  '{"x":2,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  committed->'endpoint'='{"x":2,"y":1}'::jsonb AND
  (SELECT x=2 AND y=1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'::uuid) AND
  (SELECT status='committed' FROM forge_world_v2.motion_sessions
   WHERE id=sid),
  'R45-06 existing signed canonical Commit closes gesture correctly');
END $r45_ordinary$;

-- Separate R05 protected forward recovery restores the exact four
-- frozen function definitions. This is NOT a full downgrade: R17/19/20
-- triggers and the disabled atomic function remain for forward repair.
\i supabase/release-recovery/world_v2_b10_r05_restore_original_authority.sql
DO $r45_forward_restored$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=4 FROM forge_world_v2.motion_r05_function_backup) AND
  NOT EXISTS(
    SELECT 1 FROM forge_world_v2.motion_r05_function_backup b
    WHERE b.original_digest IS DISTINCT FROM
     md5(pg_get_functiondef(to_regprocedure(b.signature)))) AND
  NOT has_function_privilege('authenticated',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)',
   'EXECUTE') AND
  has_function_privilege('authenticated',
   'public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
   'EXECUTE') AND
  has_function_privilege('authenticated',
   'public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)',
   'EXECUTE') AND
  to_regprocedure('forge_visibility.guard_campaign_affinity_r18_20()') IS NOT NULL AND
  -- R18-26's separate collision helper and R18-19/20 guards are still
  -- installed: THIS IS FORWARD CONTAINMENT, NOT FULL PRE-RELEASE ROLLBACK.
  position('sweep_min_x' IN pg_get_functiondef(
   'forge_world_v2.step_allowed(jsonb,jsonb,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer,boolean)'::regprocedure))>0 AND
  (SELECT x=2 AND y=1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'::uuid) AND
  (SELECT count(*)=0 FROM forge_world_v2.motion_sessions
   WHERE status='active' AND expires_at>clock_timestamp()),
  'R45-07 original four V2 functions restored, terminal denied, newer guards/canonical state retained; NOT a full SQL rollback');
 RAISE NOTICE 'R18-45 PASS: committed atomic endpoint contained; ordinary gesture closed; four original R05 functions forward-restored; migration/guards remain';
END $r45_forward_restored$;
