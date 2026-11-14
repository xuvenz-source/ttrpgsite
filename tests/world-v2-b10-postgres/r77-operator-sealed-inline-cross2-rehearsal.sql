-- R18-77: Source-real operator candidate and inverse rehearsal ONLY.
-- Execute inside the existing R57 disposable PG17 BEGIN/ROLLBACK after R76
-- restored the exact source. NEVER execute on the linked/live Supabase project.
\set ON_ERROR_STOP on
DO $r77_fixture$
BEGIN
 PERFORM public.b08_assert(
  current_database()='world_v2_b10_r05'
  AND current_user='postgres'
  AND current_setting('track_functions')='none'
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
  AND (SELECT count(*)=41 FROM pg_temp.r76_scenes)
  AND (SELECT count(*)=15744 FROM pg_temp.r76_expected_rays)
  AND (SELECT count(*)=656 FROM pg_temp.r76_expected_frames)
  AND (SELECT count(*)=16 FROM pg_temp.r75_expected_torch)
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
   ='a9fc198168c29fd5d80041b05337017e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))
   ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND (SELECT p.proacl IS NULL AND p.prosecdef=false
   AND p.provolatile='s' AND p.proparallel='u'
   AND p.proconfig=ARRAY['search_path=""']::text[]
   AND pg_get_userbyid(p.proowner)='postgres'
   FROM pg_proc p WHERE p.oid=to_regprocedure(
    'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'))
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE'),
  'R77-01 exact original ray/source/ACL and R76 disposable references');
END $r77_fixture$;

-- All negative operator calls run in individual SAVEPOINTS. A failed DO
-- must never poison the parent transaction or leak a partially changed ray.
SAVEPOINT r77_wrong_install_approval;
SET LOCAL forge.r18_77_release_authorization='unauthorized';
\set ON_ERROR_STOP off
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
\set ON_ERROR_STOP on
\if :ERROR
\echo 'R77 PASS: wrong install authorization rejected'
\else
SELECT 1/0 AS r77_wrong_install_auth_must_refuse;
\endif
ROLLBACK TO SAVEPOINT r77_wrong_install_approval;
RELEASE SAVEPOINT r77_wrong_install_approval;

SAVEPOINT r77_missing_release_version;
DELETE FROM supabase_migrations.schema_migrations
 WHERE version='20261113024116';
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\set ON_ERROR_STOP off
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
\set ON_ERROR_STOP on
\if :ERROR
\echo 'R77 PASS: missing reviewed migration rejected'
\else
SELECT 1/0 AS r77_missing_history_must_refuse;
\endif
ROLLBACK TO SAVEPOINT r77_missing_release_version;
RELEASE SAVEPOINT r77_missing_release_version;

SAVEPOINT r77_drifted_original;
ALTER FUNCTION forge_visibility.ray_blocked(
 jsonb,double precision,double precision,double precision,double precision,text,jsonb)
 COST 999;
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\set ON_ERROR_STOP off
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
\set ON_ERROR_STOP on
\if :ERROR
\echo 'R77 PASS: original source metadata drift rejected'
\else
SELECT 1/0 AS r77_original_drift_must_refuse;
\endif
ROLLBACK TO SAVEPOINT r77_drifted_original;
RELEASE SAVEPOINT r77_drifted_original;

DO $r77_negative_unchanged$
BEGIN
 PERFORM public.b08_assert(
  md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
   ='a9fc198168c29fd5d80041b05337017e'
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
  AND (SELECT count(*)=8 FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player'),
  'R77-02 rejected operator calls did not change source, history or roster');
END $r77_negative_unchanged$;

-- Install the ACTUAL reviewed, source-pinned candidate on disposable PG17.
-- It is rolled back within this additional SAVEPOINT, and again by outer R57.
SAVEPOINT r77_operator_rehearsal;
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql

DO $r77_applied$
DECLARE
 fn regprocedure:=to_regprocedure(
 'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)');
 source text:=pg_get_functiondef(fn);
BEGIN
 PERFORM public.b08_assert(
  md5(source)<>'a9fc198168c29fd5d80041b05337017e'
  AND position('forge_visibility.cross2(' in source)=0
  AND position('((bx-ax)*(sy-ay)-(b_y-ay)*(sx-ax))' in source)>0
  AND position('((tx-sx)*(b_y-ay)-(ty-sy)*(bx-ax))' in source)>0
  AND position('((ax-sx)*(b_y-ay)-(ay-sy)*(bx-ax))' in source)>0
  AND position('((ax-sx)*(ty-sy)-(ay-sy)*(tx-sx))' in source)>0
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.cross2(double precision,double precision,double precision,double precision)')))
   ='65c4bff8aaa6ecf38e335a44e95d874e'
  AND (SELECT p.proacl IS NULL
   AND p.prosecdef=false AND p.provolatile='s'
   AND p.proparallel='u'
   AND pg_get_userbyid(p.proowner)='postgres'
   AND p.proconfig=ARRAY['search_path=""']::text[]
   FROM pg_proc p WHERE p.oid=fn),
  'R77-03 actual reviewed candidate installs with exact private function invariants');
END $r77_applied$;

SAVEPOINT r77_duplicate_install;
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\set ON_ERROR_STOP off
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
\set ON_ERROR_STOP on
\if :ERROR
\echo 'R77 PASS: duplicate candidate install rejected'
\else
SELECT 1/0 AS r77_duplicate_install_must_refuse;
\endif
ROLLBACK TO SAVEPOINT r77_duplicate_install;
RELEASE SAVEPOINT r77_duplicate_install;

-- Source-real BOOLEAN ray parity under all hostile/malformed/equivalent
-- scenes, 32 directed/boundary rays, three visibility modes, four attributes.
DO $r77_ray_equivalence$
DECLARE
 candidate_ray record;blocked boolean;n integer:=0;
BEGIN
 FOR candidate_ray IN
  SELECT e.expected,s.scene,r.sx,r.sy,r.tx,r.ty,e.mode,v.vals
  FROM pg_temp.r76_expected_rays e
  JOIN pg_temp.r76_scenes s ON s.label=e.label
  JOIN pg_temp.r76_rays r ON r.ray_case=e.ray_case
  JOIN pg_temp.r76_vals v ON v.vals_case=e.vals_case
  ORDER BY e.label,e.ray_case,e.mode,e.vals_case LOOP
  blocked:=forge_visibility.ray_blocked(
   candidate_ray.scene,candidate_ray.sx,candidate_ray.sy,
   candidate_ray.tx,candidate_ray.ty,candidate_ray.mode,candidate_ray.vals);
  IF blocked IS DISTINCT FROM candidate_ray.expected THEN
   RAISE EXCEPTION 'R77 reviewed candidate differs from exact original ray';
  END IF;
  n:=n+1;
 END LOOP;
 PERFORM public.b08_assert(n=15744,
  'R77-04 actual installable candidate matches 15744 exact source ray booleans');
END $r77_ray_equivalence$;

-- Compare the ENTIRE private JSONB frame against the original reference,
-- not a visible-cell count, approximate intersection or untrusted client.
DO $r77_private_frames$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 fixture_row record;reference record;actual jsonb;n integer:=0;
BEGIN
 FOR fixture_row IN SELECT label,scene FROM pg_temp.r76_scenes
  ORDER BY label LOOP
  UPDATE public.map_environments
   SET live=fixture_row.scene WHERE map_id=test_map;
  FOR reference IN
   SELECT e.variant,e.viewer,e.expected
   FROM pg_temp.r76_expected_frames e
   WHERE e.label=fixture_row.label ORDER BY e.variant,e.viewer LOOP
   IF reference.variant='original' THEN
    actual:=forge_visibility.r57_unmodified_fog_frame(
     test_map,reference.viewer);
   ELSE
    actual:=forge_visibility.authorized_viewer_fog_frame(
     test_map,reference.viewer);
   END IF;
   IF actual IS DISTINCT FROM reference.expected THEN
    RAISE EXCEPTION 'R77 installable candidate private frame differs from original';
   END IF;
   n:=n+1;
  END LOOP;
 END LOOP;
 PERFORM public.b08_assert(n=656,
  'R77-05 656 complete original-vs-actual-candidate private fog frames');
END $r77_private_frames$;

-- Authored scene lights plus equipped torch, source-equivalent baseline.
UPDATE public.map_environments SET live=(
 SELECT scene FROM pg_temp.r76_scenes WHERE label='r74-mixed-wall-dark')
WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;
INSERT INTO public.campaign_tool_map_tokens(
 issue_id,campaign_id,map_id,name,icon,kind,x,y,
 light_bright,light_dim,light_enabled)
VALUES('00000000-0000-4000-8000-000000000906'::uuid,
 '00000000-0000-4000-8000-000000000001'::uuid,
 '00000000-0000-4000-8000-000000000021'::uuid,
 'fixture torch','torch','torch',8,8,40,20,true);
DO $r77_torch$
DECLARE r record;actual jsonb;n integer:=0;
BEGIN
 FOR r IN SELECT t.variant,t.viewer,t.expected
  FROM pg_temp.r75_expected_torch t
  ORDER BY t.variant,t.viewer LOOP
  IF r.variant='original' THEN
   actual:=forge_visibility.r57_unmodified_fog_frame(
    '00000000-0000-4000-8000-000000000021'::uuid,r.viewer);
  ELSE
   actual:=forge_visibility.authorized_viewer_fog_frame(
    '00000000-0000-4000-8000-000000000021'::uuid,r.viewer);
  END IF;
  IF actual IS DISTINCT FROM r.expected THEN
   RAISE EXCEPTION 'R77 torch+authored-light full private fog parity failed';
  END IF;
  n:=n+1;
 END LOOP;
 PERFORM public.b08_assert(n=16,
  'R77-06 16 complete private torch and authored-light frames match original');
END $r77_torch$;
DELETE FROM public.campaign_tool_map_tokens
 WHERE issue_id='00000000-0000-4000-8000-000000000906'::uuid;

SAVEPOINT r77_revoke;
UPDATE public.campaign_members SET role='spectator'
 WHERE user_id='00000000-0000-4000-8000-000000000019'::uuid;
DO $r77_revoke_assert$
DECLARE original_denied boolean:=false;candidate_denied boolean:=false;
BEGIN
 BEGIN
  PERFORM forge_visibility.r57_unmodified_fog_frame(
   '00000000-0000-4000-8000-000000000021'::uuid,
   '00000000-0000-4000-8000-000000000019'::uuid);
 EXCEPTION WHEN others THEN original_denied:=true;
 END;
 BEGIN
  PERFORM forge_visibility.authorized_viewer_fog_frame(
   '00000000-0000-4000-8000-000000000021'::uuid,
   '00000000-0000-4000-8000-000000000019'::uuid);
 EXCEPTION WHEN others THEN candidate_denied:=true;
 END;
 PERFORM public.b08_assert(original_denied AND candidate_denied,
  'R77-07 original and candidate both reject revoked viewer');
END $r77_revoke_assert$;
ROLLBACK TO SAVEPOINT r77_revoke;
RELEASE SAVEPOINT r77_revoke;

-- Wrong rollback approval refuses WITHOUT modifying installed candidate.
SAVEPOINT r77_wrong_rollback_approval;
SET LOCAL forge.r18_77_release_authorization='unauthorized';
\set ON_ERROR_STOP off
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql
\set ON_ERROR_STOP on
\if :ERROR
\echo 'R77 PASS: wrong rollback authorization rejected'
\else
SELECT 1/0 AS r77_wrong_rollback_must_refuse;
\endif
ROLLBACK TO SAVEPOINT r77_wrong_rollback_approval;
RELEASE SAVEPOINT r77_wrong_rollback_approval;

-- Source drift: rollback must refuse an altered candidate rather than
-- silently restoring a function it did not review.
SAVEPOINT r77_rollback_source_drift;
ALTER FUNCTION forge_visibility.ray_blocked(
 jsonb,double precision,double precision,double precision,double precision,text,jsonb)
 COST 999;
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\set ON_ERROR_STOP off
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql
\set ON_ERROR_STOP on
\if :ERROR
\echo 'R77 PASS: rollback refused source/property drift'
\else
SELECT 1/0 AS r77_rollback_drift_must_refuse;
\endif
ROLLBACK TO SAVEPOINT r77_rollback_source_drift;
RELEASE SAVEPOINT r77_rollback_source_drift;

-- ACTUAL sealed inverse, separate transaction-local operator authorization.
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql
DO $r77_inverse_assert$
BEGIN
 PERFORM public.b08_assert(
  md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
   ='a9fc198168c29fd5d80041b05337017e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.cross2(double precision,double precision,double precision,double precision)')))
   ='65c4bff8aaa6ecf38e335a44e95d874e'
  AND (SELECT p.proacl IS NULL AND p.prosecdef=false
   AND p.proconfig=ARRAY['search_path=""']::text[]
   AND p.provolatile='s' AND p.proparallel='u'
   AND pg_get_userbyid(p.proowner)='postgres'
   FROM pg_proc p WHERE p.oid=to_regprocedure(
    'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'))
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE'),
  'R77-08 actual operator rollback restores original exact source/ACL');
END $r77_inverse_assert$;

SAVEPOINT r77_double_rollback;
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\set ON_ERROR_STOP off
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql
\set ON_ERROR_STOP on
\if :ERROR
\echo 'R77 PASS: already-restored source cannot be rolled back twice'
\else
SELECT 1/0 AS r77_repeat_rollback_must_refuse;
\endif
ROLLBACK TO SAVEPOINT r77_double_rollback;
RELEASE SAVEPOINT r77_double_rollback;

-- Undo synthetic geometry, exploration and every candidate fixture mutation.
ROLLBACK TO SAVEPOINT r77_operator_rehearsal;
RELEASE SAVEPOINT r77_operator_rehearsal;

DO $r77_final$
BEGIN
 PERFORM public.b08_assert(
  current_setting('track_functions')='none'
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
  AND (SELECT count(*)=8 FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player')
  AND NOT EXISTS(SELECT 1 FROM public.campaign_tool_map_tokens
   WHERE issue_id='00000000-0000-4000-8000-000000000906'::uuid)
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
   FROM public.map_environments
   WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid)
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
   ='a9fc198168c29fd5d80041b05337017e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))
   ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE'),
  'R77-09 no candidate, migration, privilege, fixture or history residue');
 RAISE NOTICE 'R18-77 PASS: actual sealed candidate and inverse, 15744 rays, 656 private frames, 16 torch frames, revoked viewer, all negative operator gates, no residue';
END $r77_final$;
