-- R18-86: FOURTH disposable, full-source-trigger R54 rehearsal ONLY.
-- NEVER run standalone or against connected Supabase. All DDL and signed
-- movement runs are under R54 BEGIN/ROLLBACK, via guarded LOCAL PostgreSQL 17.
-- Retain historical R83/R84/R85 runs unchanged. R86 uses all 6 map_token
-- and 4 tool UPDATE triggers, full 8-viewer sight parity, and the existing
-- source-sealed candidate install+inverse files without altering them.
\set ON_ERROR_STOP on
DO $r86_preflight$
BEGIN
 IF current_database()<>'world_v2_b10_r05' OR current_user<>'postgres'
 OR to_regclass('pg_temp.r54_samples') IS NULL
 OR to_regclass('pg_temp.r84_function_delta') IS NOT NULL
 OR to_regclass('pg_temp.r68_samples') IS NOT NULL
 OR to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
 OR to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NOT NULL
 OR md5(pg_get_functiondef('public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)'::regprocedure))
   <>'f87014e7a967d1db1262dabe9e125552'
 OR md5(pg_get_functiondef('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure))
   <>'ee3356af321fec1a3e167a75c6245e86'
 OR md5(pg_get_functiondef('forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure))
   <>'a9fc198168c29fd5d80041b05337017e'
 OR (SELECT count(*)<>6 FROM pg_trigger t WHERE t.tgrelid='public.map_tokens'::regclass
   AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
 OR (SELECT count(*)<>4 FROM pg_trigger t WHERE t.tgrelid='public.campaign_tool_issues'::regclass
   AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
 OR (SELECT x=1 AND y=1 FROM public.map_tokens
    WHERE id='00000000-0000-4000-8000-000000000101'::uuid) IS DISTINCT FROM true
 -- R54's already verified opaque blocked-wall Advance deliberately leaves
 -- ONE active, unmoved rejected-wall session; it is not an authorization grant.
 -- Do not discard/Commit it or silently weaken original rate limits.
 OR (SELECT count(*)<>1 FROM forge_world_v2.motion_sessions WHERE status='active')
 THEN RAISE EXCEPTION 'R86 refuses nonisolated, source-drifted or incomplete six/four trigger fixture';END IF;
END $r86_preflight$;

-- This is the same R57 synthetic version gate; it is NOT official
-- linked Supabase CLI proof and cannot be used as release authorization.
\i tests/world-v2-b10-postgres/r57-synthetic-91-version-gate.sql
-- The original LIVE private function grants, only for this local copy.
REVOKE ALL ON FUNCTION forge_visibility.authorized_viewer_fog_frame(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
\i tests/world-v2-b10-postgres/r57-source-original-alias.sql

-- Establish eight distinct scene members and owned pieces as R57 did,
-- but with all six source-real token triggers already attached.
UPDATE public.campaign_members SET role='player'
 WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
 AND user_id='00000000-0000-4000-8000-000000000012'::uuid;
INSERT INTO public.campaign_members(campaign_id,user_id,role)
SELECT '00000000-0000-4000-8000-000000000001'::uuid,
 ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'player'
FROM generate_series(14,19) AS n;
INSERT INTO public.map_tokens(
 id,campaign_id,map_id,owner_id,visible,x,y,span_x,span_y,npc_values
)
SELECT ('00000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,
 '00000000-0000-4000-8000-000000000001'::uuid,
 '00000000-0000-4000-8000-000000000021'::uuid,
 ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 true,n-10,n-10,1,1,'{}'::jsonb
FROM generate_series(14,19) AS n;

-- The R77 candidate mutates the live-named ray helper, including what
-- R57's original-frame alias calls. Therefore clone an INDEPENDENT,
-- immutable SOURCE-ORIGINAL ray helper and a frozen viewer-frame helper.
-- Both clones use the exact pg_get_functiondef of source originals, check
-- unique substitutions, remain private, and vanish at outer ROLLBACK.
DO $r86_frozen_aliases$
DECLARE ray text;frame text;
 ray_header text:='CREATE OR REPLACE FUNCTION forge_visibility.ray_blocked(';
 frame_header text:='CREATE OR REPLACE FUNCTION forge_visibility.r57_unmodified_fog_frame(';
 call_anchor text:='forge_visibility.ray_blocked(';
BEGIN
 ray:=pg_get_functiondef('forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure);
 frame:=pg_get_functiondef('forge_visibility.r57_unmodified_fog_frame(uuid,uuid)'::regprocedure);
 IF position(ray_header IN ray)<>1 OR position(frame_header IN frame)<>1
 OR (length(ray)-length(replace(ray,ray_header,'')))<>length(ray_header)
 OR (length(frame)-length(replace(frame,frame_header,'')))<>length(frame_header)
 OR (length(frame)-length(replace(frame,call_anchor,'')))<>length(call_anchor)
 THEN RAISE EXCEPTION 'R86 cannot clone precisely one original private ray and frame function';END IF;
 EXECUTE replace(ray,ray_header,
  'CREATE OR REPLACE FUNCTION forge_visibility.r86_frozen_original_ray(');
 EXECUTE replace(replace(frame,frame_header,
  'CREATE OR REPLACE FUNCTION forge_visibility.r86_frozen_original_frame('),
  call_anchor,'forge_visibility.r86_frozen_original_ray(');
 PERFORM public.b08_assert(
  to_regprocedure('forge_visibility.r86_frozen_original_ray(jsonb,double precision,double precision,double precision,double precision,text,jsonb)') IS NOT NULL
  AND to_regprocedure('forge_visibility.r86_frozen_original_frame(uuid,uuid)') IS NOT NULL
  AND md5(pg_get_functiondef('forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure))
   ='a9fc198168c29fd5d80041b05337017e'
  AND md5(pg_get_functiondef('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure))
   ='ee3356af321fec1a3e167a75c6245e86',
  'R86-01 frozen source-original independent private ray+frame references');
END $r86_frozen_aliases$;
REVOKE ALL ON FUNCTION forge_visibility.r86_frozen_original_ray(
 jsonb,double precision,double precision,double precision,double precision,text,jsonb)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION forge_visibility.r86_frozen_original_frame(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

CREATE TEMP TABLE r86_matrix_scenes(
 label text PRIMARY KEY,scene jsonb NOT NULL,requires_empty boolean NOT NULL DEFAULT false
) ON COMMIT DROP;
INSERT INTO pg_temp.r86_matrix_scenes VALUES
 ('open','{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb,false),
 ('shared-dark','{"objects":[],"ambient":0,"fog":{"partyShared":true}}'::jsonb,false),
 ('door-closed','{"objects":[{"type":"door","state":"closed",
   "points":[{"x":6.5,"y":0},{"x":6.5,"y":16}]}],
   "ambient":25,"fog":{"partyShared":false}}'::jsonb,false),
 ('bad-wall','{"objects":[{"type":"wall","points":"invalid"}],
   "ambient":25,"fog":{"partyShared":false}}'::jsonb,false),
 ('over-limit','{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb,true),
 ('off-route-24-wall',jsonb_build_object('objects',
  (SELECT jsonb_agg(jsonb_build_object(
     'type','wall','blocksMovement',true,
     'points',jsonb_build_array(
      jsonb_build_object('x',14.1+((n%3)::numeric/10),'y',3),
      jsonb_build_object('x',14.1+((n%3)::numeric/10),'y',15)))
   ORDER BY n) FROM generate_series(1,24) AS x(n)),
  'ambient',25,'fog',jsonb_build_object('partyShared',false)),false);
UPDATE pg_temp.r86_matrix_scenes SET scene=jsonb_set(scene,'{objects}',
 (SELECT jsonb_agg(jsonb_build_object('type','decoration'))
  FROM generate_series(1,121)))
WHERE label='over-limit';

CREATE TEMP TABLE r86_matrix_samples(
 variant text PRIMARY KEY CHECK (variant IN('original','r57','r77','combined')),
 commit_ms double precision NOT NULL CHECK(commit_ms>=0),
 affected_viewers integer NOT NULL CHECK(affected_viewers=8),
 full_frame_pairs integer NOT NULL CHECK(full_frame_pairs=48),
 signed_commits integer NOT NULL CHECK(signed_commits=2),
 ray_calls bigint NOT NULL CHECK(ray_calls>=0)
) ON COMMIT DROP;

-- Fresh member/item set and all original private ACLs are checked AFTER
-- inserting test participants with the full live 6/4 trigger set.
DO $r86_setup_guard$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=8 FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid AND role='player')
  AND (SELECT count(*)=8 FROM public.map_tokens WHERE visible AND owner_id IS NOT NULL)
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
  AND (SELECT proacl::text='{postgres=X/postgres}' FROM pg_proc
    WHERE oid='forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure)
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE')
  AND NOT has_function_privilege('authenticated',
   'forge_visibility.r86_frozen_original_frame(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon',
   'forge_visibility.r86_frozen_original_ray(jsonb,double precision,double precision,double precision,double precision,text,jsonb)','EXECUTE'),
  'R86-02 source-real 6+4 triggers, eight actor-owned pieces, 91 synthetic history and private original aliases');
END $r86_setup_guard$;

-- Test-only helper is explicitly pg_temp and test-only. At most 8 extra
-- original actor-signed sessions across 4 variants, no limiter bypass.
SET LOCAL track_functions='all';
CREATE OR REPLACE FUNCTION pg_temp.r86_signed_probe(p_variant text)
RETURNS void LANGUAGE plpgsql SET search_path=''
AS $r86_probe$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021'::uuid;
 actor uuid:='00000000-0000-4000-8000-000000000011'::uuid;
 piece uuid:='00000000-0000-4000-8000-000000000101'::uuid;
 selected jsonb:=jsonb_build_array(jsonb_build_object('kind','token',
  'id','00000000-0000-4000-8000-000000000101'));
 sid uuid;b jsonb;adv jsonb;c jsonb;
 old_ticks bigint;new_ticks bigint;t0 timestamptz;commit_ms double precision;
 frame_original jsonb;frame_current jsonb;person uuid;sc record;
 pairs integer:=0;bad boolean:=false;ray_before bigint;ray_after bigint;
BEGIN
 IF p_variant NOT IN('original','r57','r77','combined') OR
  EXISTS(SELECT 1 FROM pg_temp.r86_matrix_samples WHERE variant=p_variant)
 THEN RAISE EXCEPTION 'R86 invalid or duplicate candidate comparison';END IF;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
 UPDATE forge_visibility.map_rules SET fog_enforced=true WHERE map_id=test_map;
 UPDATE public.map_environments SET live=(
  SELECT scene FROM pg_temp.r86_matrix_scenes WHERE label='off-route-24-wall')
 WHERE map_id=test_map;
 PERFORM public.b08_assert(
  (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=piece)
  AND (SELECT count(*)=8 FROM public.campaign_members WHERE role='player'),
  'R86-03 canonical origin and all eight still authorized before signed Commit');
 b:=public.begin_world_motion_v2(test_map,selected,
  '{"x":1,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(b->>'sessionId')::uuid;
 PERFORM public.b08_assert(sid IS NOT NULL,'R86-04 original signed Begin');
 adv:=public.advance_world_motion_v2(sid,1,'{"x":1,"y":1}'::jsonb,
  '[{"x":2,"y":1}]'::jsonb,1,1);
 PERFORM public.b08_assert(
  adv->>'blocked'='false' AND adv->'accepted'='[{"x":2,"y":1}]'::jsonb,
  'R86-05 original signed Advance and wall authority');

 SELECT coalesce(sum(revision),0) INTO old_ticks
  FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
 PERFORM pg_stat_clear_snapshot();
 SELECT coalesce(calls,0) INTO ray_before FROM pg_stat_xact_user_functions
 WHERE funcid='forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure::oid;
 t0:=clock_timestamp();
 c:=public.commit_world_motion_v2(sid,2,'{"x":2,"y":1}'::jsonb,1,1);
 commit_ms:=extract(epoch FROM clock_timestamp()-t0)*1000;
 PERFORM pg_stat_clear_snapshot();
 SELECT coalesce(calls,0) INTO ray_after FROM pg_stat_xact_user_functions
 WHERE funcid='forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure::oid;
 SELECT coalesce(sum(revision),0) INTO new_ticks
  FROM public.map_viewer_visibility_ticks WHERE map_id=test_map;
 PERFORM public.b08_assert(
  c->'endpoint'='{"x":2,"y":1}'::jsonb AND
  (SELECT x=2 AND y=1 FROM public.map_tokens WHERE id=piece)
  AND new_ticks>=old_ticks+8
  AND (SELECT count(*)=8 FROM public.map_viewer_visibility_ticks
    WHERE map_id=test_map AND authorized_frame IS NOT NULL),
  'R86-06 all eight protected viewers refreshed synchronously in real Commit');

 -- Source-real reverse, no test-only canonical direct token UPDATE.
 b:=public.begin_world_motion_v2(test_map,selected,
  '{"x":2,"y":1}'::jsonb,'drag',1,1,false);
 sid:=(b->>'sessionId')::uuid;
 adv:=public.advance_world_motion_v2(sid,1,
  '{"x":2,"y":1}'::jsonb,'[{"x":1,"y":1}]'::jsonb,1,1);
 c:=public.commit_world_motion_v2(sid,2,'{"x":1,"y":1}'::jsonb,1,1);
 PERFORM public.b08_assert(
  adv->>'blocked'='false' AND c->'endpoint'='{"x":1,"y":1}'::jsonb
  AND (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=piece),
  'R86-07 canonical reverse signed under unchanged collision and privacy');

 -- Crucially, the independently frozen original frame uses a separately
 -- source-exact original ray function; never compare candidate with itself.
 FOR sc IN SELECT * FROM pg_temp.r86_matrix_scenes ORDER BY label LOOP
  UPDATE public.map_environments SET live=sc.scene WHERE map_id=test_map;
  FOR person IN SELECT cm.user_id FROM public.campaign_members cm
   WHERE cm.campaign_id='00000000-0000-4000-8000-000000000001'::uuid
     AND cm.role='player' ORDER BY cm.user_id LOOP
   frame_original:=forge_visibility.r86_frozen_original_frame(test_map,person);
   frame_current:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
   PERFORM public.b08_assert(
    frame_original IS NOT DISTINCT FROM frame_current,
    'R86-08 complete private frame equality versus independently frozen original source');
   IF sc.requires_empty THEN
    PERFORM public.b08_assert(
     frame_original->'visible'='[]'::jsonb AND
     frame_current->'visible'='[]'::jsonb,
     'R86-09 over-limit geometry fails closed for both original and candidate');
   END IF;
   pairs:=pairs+1;
  END LOOP;
 END LOOP;
 UPDATE public.map_environments SET live=
  '{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
 WHERE map_id=test_map;
 PERFORM public.b08_assert(pairs=48 AND
  (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=piece),
  'R86-10 six hostile/shared/dark/24-wall scenes x eight independent source frames');
 INSERT INTO pg_temp.r86_matrix_samples
 VALUES(p_variant,commit_ms,8,pairs,2,
  greatest(0,coalesce(ray_after,0)-coalesce(ray_before,0)));
END $r86_probe$;
REVOKE ALL ON FUNCTION pg_temp.r86_signed_probe(text) FROM PUBLIC,anon,authenticated;

-- Original source, both sealed candidates applied separately and together.
-- Every candidate installation below uses the actual independently gated
-- unversioned source in supabase/candidates, never a rewritten fake proxy.
SELECT pg_temp.r86_signed_probe('original');
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SELECT pg_temp.r86_signed_probe('r57');
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

DO $r86_r57_inverse$
BEGIN
 PERFORM public.b08_assert(
  md5(pg_get_functiondef('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure))
   ='ee3356af321fec1a3e167a75c6245e86',
  'R86-11 independently sealed R57 inverse restored original fog before ray-only variant');
END $r86_r57_inverse$;
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r86_signed_probe('r77');
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql

DO $r86_r77_inverse$
BEGIN
 PERFORM public.b08_assert(
  md5(pg_get_functiondef('forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure))
   ='a9fc198168c29fd5d80041b05337017e',
  'R86-12 independently sealed R77 inverse restored original ray before combined variant');
END $r86_r77_inverse$;
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_candidate_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_optin.sql
SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_candidate_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_optin.sql
SELECT pg_temp.r86_signed_probe('combined');

-- Hostile candidate revocation after its own signed Commit.
DO $r86_hostile_candidate$
DECLARE map uuid:='00000000-0000-4000-8000-000000000021';
 outsider uuid:='00000000-0000-4000-8000-000000000014';bad boolean:=false;
BEGIN
 UPDATE public.campaign_members SET role='spectator' WHERE user_id=outsider;
 BEGIN
  PERFORM forge_visibility.authorized_viewer_fog_frame(map,outsider);
 EXCEPTION WHEN others THEN bad:=true;END;
 PERFORM public.b08_assert(bad
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE')
  AND NOT has_function_privilege('authenticated',
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon',
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE'),
  'R86-13 combined candidate revoked spectator denied and private ACL unchanged');
 UPDATE public.campaign_members SET role='player' WHERE user_id=outsider;
END $r86_hostile_candidate$;

SET LOCAL forge.r18_77_release_authorization='sealed_post_83_plus_8_ray_inline_rollback_only';
\i supabase/candidates/world_v2_r18_77_inline_cross2_ray_rollback.sql
SET LOCAL forge.r18_57_release_authorization='sealed_post_83_plus_8_rollback_only';
\i supabase/candidates/world_v2_r18_57_sync_fog_fastpath_rollback.sql

DO $r86_finish$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=4 FROM pg_temp.r86_matrix_samples)
  AND (SELECT count(*)=192 FROM pg_temp.r86_matrix_samples s
   CROSS JOIN generate_series(1,s.full_frame_pairs))
  AND (SELECT sum(signed_commits)=8 FROM pg_temp.r86_matrix_samples)
  AND (SELECT count(*)=8 FROM public.campaign_members WHERE role='player')
  AND md5(pg_get_functiondef('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'::regprocedure))
   ='ee3356af321fec1a3e167a75c6245e86'
  AND md5(pg_get_functiondef('forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'::regprocedure))
   ='a9fc198168c29fd5d80041b05337017e'
  AND (SELECT x=1 AND y=1 FROM public.map_tokens
   WHERE id='00000000-0000-4000-8000-000000000101'::uuid)
  AND (SELECT count(*)=6 FROM pg_trigger t WHERE t.tgrelid='public.map_tokens'::regclass
      AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16)
  AND (SELECT count(*)=4 FROM pg_trigger t WHERE t.tgrelid='public.campaign_tool_issues'::regclass
      AND NOT t.tgisinternal AND t.tgenabled='O' AND (t.tgtype & 16)=16),
  'R86-14 all four independent candidate modes, 192 complete frames, eight signed Commits, live source restored before global rollback');
 RAISE NOTICE 'R18-86 PASS: original/R57/R77/combined, eight viewers, 192 independently frozen complete frames, 6+4 full triggers, unchanged private ACL, outer rollback; NOT real browser speed or production RLS';
END $r86_finish$;

-- R87 fifth isolated pass: AFTER R86's four-mode full-frame parity, run
-- an additional 24 balanced original-signed forward Commit samples plus 24
-- signed reversals with R57/R77 sealed source+inverse between every phase.
-- The R86 fourth-pass file remains functionally unchanged when flag omitted.
\if :{?r87_balanced}
\i tests/world-v2-b10-postgres/r87-balanced-signed-candidate-cost.sql
\endif

-- Only aggregate variant labels and synthetic SQL execution timings; no
-- sight JSON, geometry, actor/token identifiers or private frame values.
SELECT variant,affected_viewers,full_frame_pairs,signed_commits,ray_calls,
 round(commit_ms::numeric,3) AS local_single_commit_ms
FROM pg_temp.r86_matrix_samples
ORDER BY CASE variant WHEN 'original' THEN 1 WHEN 'r57' THEN 2
 WHEN 'r77' THEN 3 ELSE 4 END;
