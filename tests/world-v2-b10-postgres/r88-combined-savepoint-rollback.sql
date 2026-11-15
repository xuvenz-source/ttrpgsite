-- B10-R18-88: LOCAL PostgreSQL 17 ONLY. Sixth R54 BEGIN/ROLLBACK pass,
-- after original R86 full-trigger 8-viewer signed hostile parity.
-- Demonstrate an intentionally incomplete R57-only install and a complete
-- R57+R77 install can BOTH be atomically aborted with SAVEPOINT rollback.
-- This is never a production release script or a migration. No COMMIT.
\set ON_ERROR_STOP on
DO $r88_preflight$
DECLARE
 fog regprocedure:='forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure;
 ray regprocedure:='forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure;
BEGIN
 PERFORM public.b08_assert(
  current_database()='world_v2_b10_r05' AND current_user='postgres'
  AND to_regclass('pg_temp.r86_matrix_samples') IS NOT NULL
  AND (SELECT count(*)=4 FROM pg_temp.r86_matrix_samples)
  AND to_regclass('pg_temp.r87_balanced_samples') IS NULL
  AND to_regclass('pg_temp.r88_atomic_canary') IS NULL
  AND to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
  AND to_regprocedure('forge_visibility.r86_frozen_original_frame(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('forge_visibility.r86_frozen_original_ray(jsonb,double precision,double precision,double precision,double precision,text,jsonb)') IS NOT NULL
  AND md5(pg_get_functiondef(fog))='ee3356af321fec1a3e167a75c6245e86'
  AND md5(pg_get_functiondef(ray))='a9fc198168c29fd5d80041b05337017e'
  AND (SELECT proacl::text='{postgres=X/postgres}' FROM pg_proc WHERE oid=fog)
  AND (SELECT proacl IS NULL FROM pg_proc WHERE oid=ray)
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE')
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE'),
  'R88-01 original exact fog+ray source, private ACL and synthetic-only 91 history');
 PERFORM public.b08_assert(
  (SELECT count(*)=6 FROM pg_trigger t
    WHERE t.tgrelid='public.map_tokens'::regclass
      AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
  AND (SELECT count(*)=4 FROM pg_trigger t
    WHERE t.tgrelid='public.campaign_tool_issues'::regclass
      AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
  AND (SELECT count(*)=8 FROM public.campaign_members cm
    WHERE cm.campaign_id='00000000-0000-4000-8000-000000000001'::uuid
      AND cm.role='player')
  AND (SELECT count(*)=0 FROM forge_world_v2.motion_sessions WHERE status='active')
  AND (SELECT x=1 AND y=1 FROM public.map_tokens
    WHERE id='00000000-0000-4000-8000-000000000101'::uuid),
  'R88-02 all ten original triggers, eight viewers, no stale sessions, original canonical token');
END $r88_preflight$;

CREATE TEMP TABLE r88_atomic_canary(
 mode text PRIMARY KEY CHECK(mode IN('partial-r57-abort','combined-abort')),
 source_restored boolean NOT NULL CHECK(source_restored),
 private_access_preserved boolean NOT NULL CHECK(private_access_preserved),
 complete_frame_parity integer NOT NULL CHECK(complete_frame_parity IN(0,8))
) ON COMMIT DROP;

-- Phase A: emulate a failed second install without actually invoking any
-- unreviewed SQL. An incomplete first candidate must vanish at ROLLBACK TO.
SAVEPOINT r88_partial;
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
DO $r88_partial_proof$
BEGIN
 PERFORM public.b08_assert(
  md5(pg_get_functiondef('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure))
    ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND md5(pg_get_functiondef('forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure))
    ='a9fc198168c29fd5d80041b05337017e'
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE'),
  'R88-03 an incomplete combined install changes only fog source and remains private');
END $r88_partial_proof$;
ROLLBACK TO SAVEPOINT r88_partial;
RELEASE SAVEPOINT r88_partial;
DO $r88_partial_restored$
BEGIN
 PERFORM public.b08_assert(
  md5(pg_get_functiondef('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure))
   ='ee3356af321fec1a3e167a75c6245e86'
  AND md5(pg_get_functiondef('forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure))
   ='a9fc198168c29fd5d80041b05337017e'
  AND (SELECT proacl::text='{postgres=X/postgres}' FROM pg_proc
    WHERE oid='forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure)
  AND (SELECT proacl IS NULL FROM pg_proc
    WHERE oid='forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure),
  'R88-04 aborted R57-only partial install restores both exact original sources and ACL');
 INSERT INTO pg_temp.r88_atomic_canary VALUES('partial-r57-abort',true,true,0);
END $r88_partial_restored$;

-- Phase B: both source-sealed original candidate files install inside
-- ONE savepoint. After exact eight-viewer private JSONB parity, a single
-- ROLLBACK TO restores both functions without invoking either inverse.
SAVEPOINT r88_combined;
UPDATE public.map_environments SET live=(
 SELECT scene FROM pg_temp.r86_matrix_scenes
 WHERE label='off-route-24-wall')
WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
DO $r88_combined_proof$
DECLARE
 viewer uuid;
 parity integer:=0;
 expected jsonb;
 actual jsonb;
BEGIN
 PERFORM public.b08_assert(
  md5(pg_get_functiondef('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure))
   ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND md5(pg_get_functiondef('forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure))
   <>'a9fc198168c29fd5d80041b05337017e'
  AND (SELECT proacl::text='{postgres=X/postgres}' FROM pg_proc
    WHERE oid='forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure)
  AND (SELECT proacl IS NULL FROM pg_proc
    WHERE oid='forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure)
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE')
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE'),
  'R88-05 combined two-source installation retains exact private access');
 FOR viewer IN SELECT cm.user_id FROM public.campaign_members cm
  WHERE cm.campaign_id='00000000-0000-4000-8000-000000000001'::uuid
   AND cm.role='player' ORDER BY cm.user_id LOOP
  expected:=forge_visibility.r86_frozen_original_frame(
   '00000000-0000-4000-8000-000000000021'::uuid,viewer);
  actual:=forge_visibility.authorized_viewer_fog_frame(
   '00000000-0000-4000-8000-000000000021'::uuid,viewer);
  PERFORM public.b08_assert(expected IS NOT DISTINCT FROM actual,
    'R88-06 exact independent private JSONB frame parity under combined changes');
  parity:=parity+1;
 END LOOP;
 PERFORM public.b08_assert(parity=8,
   'R88-07 eight complete original fog and ray private frame comparisons');
END $r88_combined_proof$;
ROLLBACK TO SAVEPOINT r88_combined;
RELEASE SAVEPOINT r88_combined;

DO $r88_restored$
BEGIN
 PERFORM public.b08_assert(
  md5(pg_get_functiondef('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure))
   ='ee3356af321fec1a3e167a75c6245e86'
  AND md5(pg_get_functiondef('forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure))
   ='a9fc198168c29fd5d80041b05337017e'
  AND (SELECT proacl::text='{postgres=X/postgres}' FROM pg_proc
   WHERE oid='forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure)
  AND (SELECT proacl IS NULL FROM pg_proc
   WHERE oid='forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure)
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE')
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
   FROM public.map_environments
   WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid)
  AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=
    '00000000-0000-4000-8000-000000000101'::uuid)
  AND (SELECT count(*)=0 FROM forge_world_v2.motion_sessions WHERE status='active'),
  'R88-08 single combined savepoint abort restores both private source bodies, grants, scene and canonical movement');
 INSERT INTO pg_temp.r88_atomic_canary VALUES('combined-abort',true,true,8);
 PERFORM public.b08_assert(
  (SELECT count(*)=2 FROM pg_temp.r88_atomic_canary)
  AND (SELECT sum(complete_frame_parity)=8 FROM pg_temp.r88_atomic_canary)
  AND (SELECT bool_and(source_restored AND private_access_preserved)
   FROM pg_temp.r88_atomic_canary),
  'R88-09 partial-failure and full combined rollback both restore exactly');
 RAISE NOTICE 'R18-88 PASS: partial and combined transactional rollback, original 6+4 movement triggers, 8 full private source frames; fixture ONLY, no migration or deployment';
END $r88_restored$;

-- Do not emit fog, actor identifiers, walls, session IDs or private frames.
SELECT mode,source_restored,private_access_preserved,complete_frame_parity
FROM pg_temp.r88_atomic_canary ORDER BY mode;
