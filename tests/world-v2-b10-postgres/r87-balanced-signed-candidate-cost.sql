-- B10-R18-87: local PostgreSQL 17, fourth R54 full 6+4 position trigger
-- fixture ONLY, after complete R86 four-mode hostile eight-viewer parity.
-- 24 truly signed forward Commit measurements, 24 signed reverse Commits.
-- The identical original public Begin/Advance/Commit and all private fog,
-- authorization, collision and token validation triggers are never replaced.
-- Experimental phase order is a 4x4 balanced Latin square followed by
-- source-original vs combined ABBA + BAAB; no runtime release candidate.
\set ON_ERROR_STOP on
DO $r87_preflight$
DECLARE
 sig_fog text:='forge_visibility.authorized_viewer_fog_frame(uuid,uuid)';
 sig_ray text:='forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)';
 prior_starts bigint;
BEGIN
 -- Partition the fail-closed preflight into bounded named checkpoints.
 -- Only booleans and fixture counts are asserted; no fog/frame values logged.
 PERFORM public.b08_assert(
  current_database()='world_v2_b10_r05' AND current_user='postgres'
  AND to_regclass('pg_temp.r86_matrix_samples') IS NOT NULL
  AND (SELECT count(*)=4 FROM pg_temp.r86_matrix_samples)
  AND to_regclass('pg_temp.r87_balanced_samples') IS NULL
  AND to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
  AND to_regprocedure('forge_visibility.r86_frozen_original_frame(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('forge_visibility.r86_frozen_original_ray(jsonb,double precision,double precision,double precision,double precision,text,jsonb)') IS NOT NULL,
  'R87-00a local R86 transaction, frozen source functions and synthetic history');
 PERFORM public.b08_assert(
  md5(pg_get_functiondef(to_regprocedure(sig_fog)))='ee3356af321fec1a3e167a75c6245e86'
  AND md5(pg_get_functiondef(to_regprocedure(sig_ray)))='a9fc198168c29fd5d80041b05337017e'
  AND (SELECT count(*)=6 FROM pg_trigger t WHERE t.tgrelid='public.map_tokens'::regclass
   AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
  AND (SELECT count(*)=4 FROM pg_trigger t WHERE t.tgrelid='public.campaign_tool_issues'::regclass
   AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
  AND (SELECT x=1 AND y=1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'::uuid)
  AND (SELECT count(*)=8 FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid AND role='player'),
  'R87-00b original function digests, 6/4 triggers, token canonical and 8 viewer roles');
 PERFORM public.b08_assert(
  has_schema_privilege('postgres','forge_visibility','USAGE')
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE'),
  'R87-00c original private fog schema ACL remains unaltered');
 -- R86's four genuine signed forward/reverse cycles reconcile and expire
 -- the original R54 blocked-wall pending session. Require ZERO remaining
 -- active sessions, never reuse an unconfirmed or hostile gesture.
 PERFORM public.b08_assert(
  (SELECT count(*)=0 FROM forge_world_v2.motion_sessions WHERE status='active'),
  'R87-00d original authority cleared prior rejected-wall session; zero stale active gestures');
 IF current_database()<>'world_v2_b10_r05' OR current_user<>'postgres'
 OR to_regclass('pg_temp.r86_matrix_samples') IS NULL
 OR (SELECT count(*)<>4 FROM pg_temp.r86_matrix_samples)
 OR to_regclass('pg_temp.r87_balanced_samples') IS NOT NULL
 OR to_regclass('supabase_migrations.schema_migrations') IS NULL
 OR (SELECT count(*)<>91 FROM supabase_migrations.schema_migrations)
 OR to_regprocedure('forge_visibility.r86_frozen_original_frame(uuid,uuid)') IS NULL
 OR to_regprocedure('forge_visibility.r86_frozen_original_ray(jsonb,double precision,double precision,double precision,double precision,text,jsonb)') IS NULL
 OR md5(pg_get_functiondef(to_regprocedure(sig_fog)))<>'ee3356af321fec1a3e167a75c6245e86'
 OR md5(pg_get_functiondef(to_regprocedure(sig_ray)))<>'a9fc198168c29fd5d80041b05337017e'
 OR (SELECT count(*)<>6 FROM pg_trigger t
  WHERE t.tgrelid='public.map_tokens'::regclass
   AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
 OR (SELECT count(*)<>4 FROM pg_trigger t
  WHERE t.tgrelid='public.campaign_tool_issues'::regclass
   AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
 OR (SELECT x=1 AND y=1 FROM public.map_tokens
  WHERE id='00000000-0000-4000-8000-000000000101'::uuid) IS DISTINCT FROM true
 OR (SELECT count(*)<>8 FROM public.campaign_members
  WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid AND role='player')
 OR (SELECT count(*)<>0 FROM forge_world_v2.motion_sessions WHERE status='active')
 OR NOT has_schema_privilege('postgres','forge_visibility','USAGE')
 OR has_schema_privilege('authenticated','forge_visibility','USAGE')
 OR has_schema_privilege('anon','forge_visibility','USAGE')
 THEN RAISE EXCEPTION 'R87 refuses incomplete untrusted R86 original source and full-trigger fixture';END IF;
 SELECT starts INTO prior_starts FROM forge_world_v2.gesture_budgets
  WHERE actor_id='00000000-0000-4000-8000-000000000011'::uuid
   AND map_id='00000000-0000-4000-8000-000000000021'::uuid;
 IF prior_starts IS NULL OR prior_starts NOT BETWEEN 40 AND 48
 THEN RAISE EXCEPTION 'R87 refuses unknown signed gesture budget';END IF;
 PERFORM public.b08_assert(prior_starts+48<=120,
  'R87-01 original 120-session rolling budget retains >=48 additional signed session slots');
END $r87_preflight$;

CREATE TEMP TABLE r87_expected_schedule(
 ordinal int PRIMARY KEY CHECK(ordinal BETWEEN 1 AND 24),
 experiment text NOT NULL CHECK(experiment IN ('latin1','latin2','latin3','latin4','abba','baab')),
 position int NOT NULL CHECK(position BETWEEN 1 AND 4),
 variant text NOT NULL CHECK(variant IN ('original','r57','r77','combined')),
 UNIQUE(experiment,position)
) ON COMMIT DROP;
INSERT INTO pg_temp.r87_expected_schedule(ordinal,experiment,position,variant)
VALUES
 (1,'latin1',1,'original'),
 (2,'latin1',2,'r57'),
 (3,'latin1',3,'r77'),
 (4,'latin1',4,'combined'),
 (5,'latin2',1,'r57'),
 (6,'latin2',2,'combined'),
 (7,'latin2',3,'original'),
 (8,'latin2',4,'r77'),
 (9,'latin3',1,'r77'),
 (10,'latin3',2,'original'),
 (11,'latin3',3,'combined'),
 (12,'latin3',4,'r57'),
 (13,'latin4',1,'combined'),
 (14,'latin4',2,'r77'),
 (15,'latin4',3,'r57'),
 (16,'latin4',4,'original'),
 (17,'abba',1,'original'),
 (18,'abba',2,'combined'),
 (19,'abba',3,'combined'),
 (20,'abba',4,'original'),
 (21,'baab',1,'combined'),
 (22,'baab',2,'original'),
 (23,'baab',3,'original'),
 (24,'baab',4,'combined');

CREATE TEMP TABLE r87_balanced_samples(
 ordinal integer PRIMARY KEY CHECK(ordinal BETWEEN 1 AND 24),
 experiment text NOT NULL,
 position integer NOT NULL,
 variant text NOT NULL CHECK(variant IN ('original','r57','r77','combined')),
 commit_ms double precision NOT NULL CHECK(commit_ms>0),
 fog_viewer_revision_delta bigint NOT NULL CHECK(fog_viewer_revision_delta>=8),
 original_ray_calls bigint NOT NULL CHECK(original_ray_calls>=0),
 full_frame_pairs integer NOT NULL CHECK(full_frame_pairs=8),
 signed_commits integer NOT NULL CHECK(signed_commits=2)
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.r87_signed_sample(p_ordinal integer,p_variant text)
RETURNS void LANGUAGE plpgsql SET search_path=''
AS $r87_sample$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011'::uuid;
 test_map uuid:='00000000-0000-4000-8000-000000000021'::uuid;
 piece uuid:='00000000-0000-4000-8000-000000000101'::uuid;
 selection jsonb:=jsonb_build_array(jsonb_build_object('kind','token',
  'id','00000000-0000-4000-8000-000000000101'));
 sig_fog text:='forge_visibility.authorized_viewer_fog_frame(uuid,uuid)';
 sig_ray text:='forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)';
 fog_hash text;ray_source text;
 expected record;
 signed_begin jsonb;signed_advance jsonb;signed_commit jsonb;sid uuid;
 t0 timestamptz; commit_ms double precision; old_ticks bigint;new_ticks bigint;
 ray_before bigint;ray_after bigint;actor_view uuid;expected_frame jsonb;candidate_frame jsonb;
 compared int:=0;current_starts bigint;has_inline boolean;
BEGIN
 SELECT experiment,position,variant INTO expected
 FROM pg_temp.r87_expected_schedule WHERE ordinal=p_ordinal;
 IF NOT FOUND OR expected.variant IS DISTINCT FROM p_variant
 OR EXISTS(SELECT 1 FROM pg_temp.r87_balanced_samples WHERE ordinal=p_ordinal)
 OR (SELECT count(*) FROM pg_temp.r87_balanced_samples)<>p_ordinal-1
 THEN RAISE EXCEPTION 'R87 invalid/duplicate/out-of-order variant sample';END IF;

 -- Every phase must start with a *source-original or precisely sealed*
 -- candidate, and no public grants can be changed between phases.
 fog_hash:=md5(pg_get_functiondef(to_regprocedure(sig_fog)));
 ray_source:=pg_get_functiondef(to_regprocedure(sig_ray));
 has_inline:=position('((bx-ax)*(sy-ay)-(b_y-ay)*(sx-ax))' IN ray_source)>0
    AND position('forge_visibility.cross2(bx-ax,b_y-ay,sx-ax,sy-ay)' IN ray_source)=0;
 IF (p_variant IN('original','r77')) IS DISTINCT FROM
    (fog_hash='ee3356af321fec1a3e167a75c6245e86')
 OR (p_variant IN('r57','combined')) IS DISTINCT FROM
    (fog_hash='f37c8d13e8d48bea123b4c811ae6de4d')
 OR (p_variant IN('r77','combined')) IS DISTINCT FROM has_inline
 OR (p_variant IN('original','r57')) IS DISTINCT FROM
    (md5(ray_source)='a9fc198168c29fd5d80041b05337017e')
 -- Live pg_catalog: the original ray has NULL proacl (default PUBLIC
 -- EXECUTE) but PRIVATE forge_visibility schema denies anon/authenticated
 -- USAGE; the frame itself has postgres-only EXECUTE. Preserve BOTH
 -- exact source ACL shapes, never invent tighter privileges than live.
 OR (SELECT p.proacl IS NOT NULL FROM pg_proc p WHERE p.oid=to_regprocedure(sig_ray))
 OR (SELECT p.proacl::text IS DISTINCT FROM '{postgres=X/postgres}'
     FROM pg_proc p WHERE p.oid=to_regprocedure(sig_fog))
 OR has_function_privilege('authenticated',to_regprocedure(sig_fog),'EXECUTE')
 OR has_function_privilege('anon',to_regprocedure(sig_fog),'EXECUTE')
 OR has_schema_privilege('authenticated','forge_visibility','USAGE')
 OR has_schema_privilege('anon','forge_visibility','USAGE')
 THEN RAISE EXCEPTION 'R87 selected mode drifted private original/sealed source or ACL';END IF;

 PERFORM pg_catalog.set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
 UPDATE forge_visibility.map_rules SET fog_enforced=true WHERE map_id=test_map;
 UPDATE public.map_environments SET live=(
  SELECT scene FROM pg_temp.r86_matrix_scenes WHERE label='off-route-24-wall')
 WHERE map_id=test_map;
 PERFORM public.b08_assert(
  (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=piece)
  AND (SELECT count(*)=8 FROM public.campaign_members WHERE role='player'),
  'R87-02 source-real eight-viewer initial canonical position and active player roles');

 signed_begin:=public.begin_world_motion_v2(test_map,selection,
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(signed_begin->>'sessionId')::uuid;
 PERFORM public.b08_assert(sid IS NOT NULL,
  'R87-03 unmodified original actor-signed Begin');
 signed_advance:=public.advance_world_motion_v2(sid,1,'{"x":1,"y":1}'::jsonb,
  '[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  signed_advance->>'blocked'='false'
  AND signed_advance->'accepted'='[{"x":2,"y":1}]'::jsonb,
  'R87-04 unmodified source-real collision Advance');

 SELECT coalesce(sum(revision),0) INTO old_ticks
 FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
 PERFORM pg_stat_clear_snapshot();
 SELECT coalesce(calls,0) INTO ray_before
 FROM pg_stat_xact_user_functions WHERE funcid=to_regprocedure(sig_ray);
 t0:=clock_timestamp();
 signed_commit:=public.commit_world_motion_v2(sid,2,'{"x":2,"y":1}'::jsonb,1,1);
 commit_ms:=extract(epoch FROM clock_timestamp()-t0)*1000;
 PERFORM pg_stat_clear_snapshot();
 SELECT coalesce(calls,0) INTO ray_after
 FROM pg_stat_xact_user_functions WHERE funcid=to_regprocedure(sig_ray);
 SELECT coalesce(sum(revision),0) INTO new_ticks
 FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
 PERFORM public.b08_assert(
  signed_commit->'endpoint'='{"x":2,"y":1}'::jsonb
  AND (SELECT x=2 AND y=1 FROM public.map_tokens WHERE id=piece)
  AND new_ticks>=old_ticks+8
  AND (SELECT count(*)=8 FROM public.map_viewer_visibility_ticks
   WHERE map_id=test_map AND authorized_frame IS NOT NULL),
  'R87-05 each timed original signed Commit updates canonical and all eight private viewers');

 -- Compare complete authorized JSONB AFTER real canonical movement, with
 -- a fixed independent original fog+ray; not against R77-mutated alias.
 FOR actor_view IN
  SELECT user_id FROM public.campaign_members
  WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player' ORDER BY user_id
 LOOP
  expected_frame:=forge_visibility.r86_frozen_original_frame(test_map,actor_view);
  candidate_frame:=forge_visibility.authorized_viewer_fog_frame(test_map,actor_view);
  PERFORM public.b08_assert(
   expected_frame IS NOT DISTINCT FROM candidate_frame,
   'R87-06 exact complete private sight/exploration frame under same true signed Commit');
  compared:=compared+1;
 END LOOP;
 PERFORM public.b08_assert(compared=8,
  'R87-07 all eight independent fixture viewers retain full private source parity');

 -- Reverse also stays within original signed authority; no direct token
 -- UPDATE, no no-ack speculative positions and no disabled fog trigger.
 signed_begin:=public.begin_world_motion_v2(test_map,selection,
  '{"x":2,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(signed_begin->>'sessionId')::uuid;
 signed_advance:=public.advance_world_motion_v2(sid,1,'{"x":2,"y":1}'::jsonb,
  '[{"x":1,"y":1}]'::jsonb,1,1);
 signed_commit:=public.commit_world_motion_v2(sid,2,'{"x":1,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  sid IS NOT NULL AND signed_advance->>'blocked'='false'
  AND signed_commit->'endpoint'='{"x":1,"y":1}'::jsonb
  AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=piece),
  'R87-08 every measured attempt includes original signed canonical return');

 INSERT INTO pg_temp.r87_balanced_samples
 VALUES(p_ordinal,expected.experiment,expected.position,p_variant,
  commit_ms,new_ticks-old_ticks,
  greatest(0,coalesce(ray_after,0)-coalesce(ray_before,0)),compared,2);
 SELECT starts INTO current_starts FROM forge_world_v2.gesture_budgets
 WHERE actor_id=actor AND map_id=test_map;
 PERFORM public.b08_assert(current_starts IS NOT NULL AND current_starts<=120,
  'R87-09 original motion session limiter never bypassed');
END $r87_sample$;
REVOKE ALL ON FUNCTION pg_temp.r87_signed_sample(integer,text)
 FROM PUBLIC,anon,authenticated;

-- Every candidate install/inverse is the ORIGINAL exact reviewed source
-- file. Revert back to both pristine source hashes after EVERY phase.
-- No dynamic SQL assembling a non-original candidate body is allowed here.
-- Phase 1/24 latin1 position 1: original.
SELECT pg_temp.r87_signed_sample(1,'original');

-- Phase 2/24 latin1 position 2: r57.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SELECT pg_temp.r87_signed_sample(2,'r57');
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

-- Phase 3/24 latin1 position 3: r77.
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r87_signed_sample(3,'r77');
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql

-- Phase 4/24 latin1 position 4: combined.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r87_signed_sample(4,'combined');
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

-- Phase 5/24 latin2 position 1: r57.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SELECT pg_temp.r87_signed_sample(5,'r57');
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

-- Phase 6/24 latin2 position 2: combined.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r87_signed_sample(6,'combined');
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

-- Phase 7/24 latin2 position 3: original.
SELECT pg_temp.r87_signed_sample(7,'original');

-- Phase 8/24 latin2 position 4: r77.
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r87_signed_sample(8,'r77');
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql

-- Phase 9/24 latin3 position 1: r77.
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r87_signed_sample(9,'r77');
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql

-- Phase 10/24 latin3 position 2: original.
SELECT pg_temp.r87_signed_sample(10,'original');

-- Phase 11/24 latin3 position 3: combined.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r87_signed_sample(11,'combined');
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

-- Phase 12/24 latin3 position 4: r57.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SELECT pg_temp.r87_signed_sample(12,'r57');
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

-- Phase 13/24 latin4 position 1: combined.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r87_signed_sample(13,'combined');
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

-- Phase 14/24 latin4 position 2: r77.
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r87_signed_sample(14,'r77');
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql

-- Phase 15/24 latin4 position 3: r57.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SELECT pg_temp.r87_signed_sample(15,'r57');
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

-- Phase 16/24 latin4 position 4: original.
SELECT pg_temp.r87_signed_sample(16,'original');

-- Phase 17/24 abba position 1: original.
SELECT pg_temp.r87_signed_sample(17,'original');

-- Phase 18/24 abba position 2: combined.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r87_signed_sample(18,'combined');
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

-- Phase 19/24 abba position 3: combined.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r87_signed_sample(19,'combined');
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

-- Phase 20/24 abba position 4: original.
SELECT pg_temp.r87_signed_sample(20,'original');

-- Phase 21/24 baab position 1: combined.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r87_signed_sample(21,'combined');
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

-- Phase 22/24 baab position 2: original.
SELECT pg_temp.r87_signed_sample(22,'original');

-- Phase 23/24 baab position 3: original.
SELECT pg_temp.r87_signed_sample(23,'original');

-- Phase 24/24 baab position 4: combined.
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r87_signed_sample(24,'combined');
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

DO $r87_finish$
DECLARE map uuid:='00000000-0000-4000-8000-000000000021';
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=24 FROM pg_temp.r87_balanced_samples)
  AND (SELECT count(*)=24 FROM pg_temp.r87_expected_schedule)
  AND (SELECT sum(signed_commits)=48 FROM pg_temp.r87_balanced_samples)
  AND (SELECT sum(full_frame_pairs)=192 FROM pg_temp.r87_balanced_samples)
  AND (SELECT count(*)=4 FROM pg_temp.r87_balanced_samples
   WHERE variant='r57')
  AND (SELECT count(*)=4 FROM pg_temp.r87_balanced_samples
   WHERE variant='r77')
  AND (SELECT count(*)=8 FROM pg_temp.r87_balanced_samples
   WHERE variant='original')
  AND (SELECT count(*)=8 FROM pg_temp.r87_balanced_samples
   WHERE variant='combined')
  AND (SELECT count(*)=8 FROM pg_temp.r87_balanced_samples
   WHERE experiment IN('abba','baab'))
  AND (SELECT count(*)=16 FROM pg_temp.r87_balanced_samples
   WHERE experiment LIKE 'latin%')
  AND (SELECT count(*)=16 FROM (
    SELECT variant,position FROM pg_temp.r87_balanced_samples
    WHERE experiment LIKE 'latin%' GROUP BY variant,position
    HAVING count(*)=1) balanced)
  AND (SELECT count(*)=4 FROM (
    SELECT experiment,variant FROM pg_temp.r87_balanced_samples
    WHERE experiment IN('abba','baab') GROUP BY experiment,variant
    HAVING count(*)=2) paired)
  AND (SELECT count(*)=24 FROM pg_temp.r87_balanced_samples s
   JOIN pg_temp.r87_expected_schedule e USING(ordinal,experiment,position,variant))
  AND md5(pg_get_functiondef('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure))
    ='ee3356af321fec1a3e167a75c6245e86'
  AND md5(pg_get_functiondef('forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure))
    ='a9fc198168c29fd5d80041b05337017e'
  AND (SELECT count(*)=8 FROM public.campaign_members WHERE role='player')
  AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=
     '00000000-0000-4000-8000-000000000101'::uuid)
  AND (SELECT count(*)=6 FROM pg_trigger t
   WHERE t.tgrelid='public.map_tokens'::regclass
     AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
  AND (SELECT count(*)=4 FROM pg_trigger t
   WHERE t.tgrelid='public.campaign_tool_issues'::regclass
     AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE'),
  'R87-10 source-sealed original/57/77/composite, 24 balanced signed measured Commits, 48 signed forward/reverse, 192 complete private frames and original 6+4 triggers all restored');
 RAISE NOTICE 'R18-87 PASS: 4x4 balanced Latin + original/combined ABBA/BAAB, eight private viewers, 24 bounded measured signed Commits, no rate/authority bypass, rollback pending';
END $r87_finish$;

-- Local synthetic timings: 4 samples per individual candidate; 8 per
-- original/combined. Never claim browser or production p95 from this.
SELECT variant,count(*) AS n,
 round((percentile_cont(0.50) WITHIN GROUP (ORDER BY commit_ms))::numeric,3)
  AS local_p50_ms,
 round(avg(commit_ms)::numeric,3) AS local_mean_ms,
 round(min(commit_ms)::numeric,3) AS local_min_ms,
 round(max(commit_ms)::numeric,3) AS local_max_ms,
 round(avg(original_ray_calls)::numeric,1) AS mean_named_ray_calls
FROM pg_temp.r87_balanced_samples GROUP BY variant ORDER BY variant;
SELECT experiment,variant,count(*) AS n,
 round(avg(commit_ms)::numeric,3) AS local_mean_ms,
 round((percentile_cont(0.50) WITHIN GROUP (ORDER BY commit_ms))::numeric,3)
   AS local_p50_ms
FROM pg_temp.r87_balanced_samples
GROUP BY experiment,variant ORDER BY experiment,variant;
