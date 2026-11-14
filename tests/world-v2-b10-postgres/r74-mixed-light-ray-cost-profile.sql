-- B10-R18-74: DISPOSABLE PG17 ONLY. Joint original ray/lighting source
-- attribution under mixed wall/door/window + two scene lights.
-- Invoked inside R18-57's already-open BEGIN/ROLLBACK, AFTER R18-72
-- has restored the exact private source and BEFORE original signed Commit.
-- NOT a migration, release candidate, published environment rewrite or grant.
\set ON_ERROR_STOP on

DO $r74_guard$
BEGIN
 PERFORM public.b08_assert(
  current_database()='world_v2_b10_r05'
  AND current_user='postgres'
  AND current_setting('track_functions')='none'
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
  AND (SELECT count(*)=8 FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player')
  AND (SELECT count(*)=6 FROM pg_temp.r72_samples)
  AND to_regprocedure('forge_visibility.r57_unmodified_fog_frame(uuid,uuid)') IS NOT NULL
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))
   ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
   ='a9fc198168c29fd5d80041b05337017e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.is_lit(uuid,jsonb,double precision,double precision,double precision,double precision,integer)')))
   ='cec916b326a14937ceee2e170619cca2'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.wall_passes(jsonb,jsonb,text,text)')))
   ='5c52255db93f2a9ed892e684dd11f898'
  AND (SELECT proacl::text='{postgres=X/postgres}'
   AND prosecdef AND proconfig @> ARRAY['search_path=""']::text[]
   FROM pg_proc WHERE oid=to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'))
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE')
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_function_privilege('anon',
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated',
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
   FROM public.map_environments
   WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid),
  'R74-01 exact sealed source, role, geometry, lighting and isolated fixture');
END $r74_guard$;

CREATE TEMP TABLE r74_scenes(
 label text PRIMARY KEY,
 scene jsonb NOT NULL,
 profiled boolean NOT NULL DEFAULT true
);
-- Real production data is NOT copied. This is a small synthetic category
-- analogue only: 1 opaque blocking wall object + 2 authored point lights.
INSERT INTO pg_temp.r74_scenes(label,scene)
VALUES('mixed-wall-dark',
 '{"objects":[
 {"type":"wall","points":[{"x":6.5,"y":0},{"x":6.5,"y":16}]},
 {"type":"light","enabled":true,"x":4,"y":8,"bright":35,"dim":25},
 {"type":"light","enabled":true,"x":11,"y":8,"bright":35,"dim":25}
 ],"ambient":0,"fog":{"partyShared":false}}'::jsonb);

INSERT INTO pg_temp.r74_scenes(label,scene)
SELECT 'mixed-wall-dim',jsonb_set(scene,'{ambient}','25'::jsonb,false)
FROM pg_temp.r74_scenes WHERE label='mixed-wall-dark';
INSERT INTO pg_temp.r74_scenes(label,scene)
SELECT 'mixed-wall-bright',jsonb_set(scene,'{ambient}','60'::jsonb,false)
FROM pg_temp.r74_scenes WHERE label='mixed-wall-dark';
INSERT INTO pg_temp.r74_scenes(label,scene)
SELECT 'mixed-door-closed-dark',
 jsonb_set(scene,'{objects,0}',
  jsonb_build_object('type','door','state','closed',
   'points',scene->'objects'->0->'points'),false)
FROM pg_temp.r74_scenes WHERE label='mixed-wall-dark';
INSERT INTO pg_temp.r74_scenes(label,scene)
SELECT 'mixed-door-open-dark',
 jsonb_set(scene,'{objects,0}',
  jsonb_build_object('type','door','state','open',
   'points',scene->'objects'->0->'points'),false)
FROM pg_temp.r74_scenes WHERE label='mixed-wall-dark';
INSERT INTO pg_temp.r74_scenes(label,scene)
SELECT 'mixed-lights-disabled-dark',
 jsonb_set(jsonb_set(scene,'{objects,1,enabled}','false'::jsonb,false),
  '{objects,2,enabled}','false'::jsonb,false)
FROM pg_temp.r74_scenes WHERE label='mixed-wall-dark';

-- Extra hostile/private parity only: conditional, curtain, broken JSON,
-- and party-shared. These never mutate the 1-wall/2-light original baseline.
INSERT INTO pg_temp.r74_scenes(label,scene,profiled)
SELECT 'mixed-one-way-dark',
 jsonb_set(scene,'{objects,0}',
  jsonb_build_object('type','wall','vision','one-way','oneWay','a-to-b',
   'points',scene->'objects'->0->'points'),false),false
FROM pg_temp.r74_scenes WHERE label='mixed-wall-dark';
INSERT INTO pg_temp.r74_scenes(label,scene,profiled)
SELECT 'mixed-curtained-window-dark',
 jsonb_set(scene,'{objects,0}',
  jsonb_build_object('type','window','curtains',true,'state','closed',
   'points',scene->'objects'->0->'points'),false),false
FROM pg_temp.r74_scenes WHERE label='mixed-wall-dark';
INSERT INTO pg_temp.r74_scenes(label,scene,profiled)
SELECT 'mixed-malformed-light-dark',
 jsonb_set(scene,'{objects,1,x}','"not-a-number"'::jsonb,false),false
FROM pg_temp.r74_scenes WHERE label='mixed-wall-dark';
INSERT INTO pg_temp.r74_scenes(label,scene,profiled)
SELECT 'mixed-wall-shared-dark',
 jsonb_set(scene,'{fog,partyShared}','true'::jsonb,false),false
FROM pg_temp.r74_scenes WHERE label='mixed-wall-dark';

DO $r74_scene_guard$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=10 FROM pg_temp.r74_scenes)
  AND (SELECT count(*)=6 FROM pg_temp.r74_scenes WHERE profiled)
  AND (SELECT count(*)=4 FROM pg_temp.r74_scenes WHERE NOT profiled)
  AND (SELECT jsonb_array_length(scene->'objects')=3
   FROM pg_temp.r74_scenes WHERE label='mixed-wall-dark')
  AND (SELECT count(*)=2 FROM jsonb_array_elements(
   (SELECT scene->'objects' FROM pg_temp.r74_scenes
    WHERE label='mixed-wall-dark')) o(value)
   WHERE o.value->>'type'='light')
  AND (SELECT count(*)=1 FROM jsonb_array_elements(
   (SELECT scene->'objects' FROM pg_temp.r74_scenes
    WHERE label='mixed-wall-dark')) o(value)
   WHERE o.value->>'type'='wall'),
  'R74-02 exactly six synthetic cost and four hostile/private parity scenes');
END $r74_scene_guard$;

CREATE TEMP TABLE r74_cost(
 label text NOT NULL REFERENCES pg_temp.r74_scenes(label),
 variant text NOT NULL CHECK(variant IN ('original','fastpath')),
 iteration integer NOT NULL CHECK(iteration IN (1,2)),
 viewer_count integer NOT NULL CHECK(viewer_count=8),
 elapsed_ms double precision NOT NULL CHECK(elapsed_ms>=0),
 ray_calls bigint NOT NULL CHECK(ray_calls>=0),
 ray_self_ms double precision NOT NULL CHECK(ray_self_ms>=0),
 is_lit_calls bigint NOT NULL CHECK(is_lit_calls>=0),
 is_lit_self_ms double precision NOT NULL CHECK(is_lit_self_ms>=0),
 wall_passes_calls bigint NOT NULL CHECK(wall_passes_calls>=0),
 wall_passes_self_ms double precision NOT NULL CHECK(wall_passes_self_ms>=0),
 cross2_calls bigint NOT NULL CHECK(cross2_calls>=0),
 cross2_self_ms double precision NOT NULL CHECK(cross2_self_ms>=0),
 PRIMARY KEY(label,variant,iteration)
);

-- PostgreSQL's function xact counters are transaction-local and cumulative.
-- Compare before/after for the exact same private functions and variant.
-- self_time excludes tracked nested function time; don't sum as global cost.
SET LOCAL track_functions='all';
DO $r74_profile$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 cfg record;person uuid;variant text;frame jsonb;i int;n int;
 calls_before bigint[];calls_after bigint[];
 self_before double precision[];self_after double precision[];
 t0 timestamptz;ms double precision;
BEGIN
 PERFORM public.b08_assert(current_setting('track_functions')='all',
  'R74-03 disposable transaction-local function tracking enabled');
 FOR i IN 1..2 LOOP
  FOR cfg IN SELECT label,scene FROM pg_temp.r74_scenes
   WHERE profiled ORDER BY label LOOP
   UPDATE public.map_environments SET live=cfg.scene WHERE map_id=test_map;
   FOREACH variant IN ARRAY (
    CASE WHEN i=1 THEN ARRAY['original','fastpath']::text[]
     ELSE ARRAY['fastpath','original']::text[] END) LOOP
    SELECT ARRAY[
     coalesce(sum(calls) FILTER(WHERE funcname='ray_blocked'),0),
     coalesce(sum(calls) FILTER(WHERE funcname='is_lit'),0),
     coalesce(sum(calls) FILTER(WHERE funcname='wall_passes'),0),
     coalesce(sum(calls) FILTER(WHERE funcname='cross2'),0)
    ]::bigint[],
    ARRAY[
     coalesce(sum(self_time) FILTER(WHERE funcname='ray_blocked'),0),
     coalesce(sum(self_time) FILTER(WHERE funcname='is_lit'),0),
     coalesce(sum(self_time) FILTER(WHERE funcname='wall_passes'),0),
     coalesce(sum(self_time) FILTER(WHERE funcname='cross2'),0)
    ]::double precision[]
    INTO calls_before,self_before
    FROM pg_stat_xact_user_functions WHERE schemaname='forge_visibility';
    n:=0;t0:=clock_timestamp();
    FOR person IN SELECT user_id FROM public.campaign_members
     WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
     AND role='player' ORDER BY user_id LOOP
     IF variant='original' THEN
      frame:=forge_visibility.r57_unmodified_fog_frame(test_map,person);
     ELSE
      frame:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
     END IF;
     PERFORM public.b08_assert(
      jsonb_typeof(frame)='object'
       AND jsonb_typeof(frame->'visible')='array'
       AND jsonb_typeof(frame->'explored')='array',
      'R74-04 original/fastpath protected complete frame');
     n:=n+1;
    END LOOP;
    ms:=extract(epoch FROM clock_timestamp()-t0)*1000;
    SELECT ARRAY[
     coalesce(sum(calls) FILTER(WHERE funcname='ray_blocked'),0),
     coalesce(sum(calls) FILTER(WHERE funcname='is_lit'),0),
     coalesce(sum(calls) FILTER(WHERE funcname='wall_passes'),0),
     coalesce(sum(calls) FILTER(WHERE funcname='cross2'),0)
    ]::bigint[],
    ARRAY[
     coalesce(sum(self_time) FILTER(WHERE funcname='ray_blocked'),0),
     coalesce(sum(self_time) FILTER(WHERE funcname='is_lit'),0),
     coalesce(sum(self_time) FILTER(WHERE funcname='wall_passes'),0),
     coalesce(sum(self_time) FILTER(WHERE funcname='cross2'),0)
    ]::double precision[]
    INTO calls_after,self_after
    FROM pg_stat_xact_user_functions WHERE schemaname='forge_visibility';
    PERFORM public.b08_assert(n=8
     AND calls_after[1]>=calls_before[1]
     AND calls_after[2]>=calls_before[2]
     AND calls_after[3]>=calls_before[3]
     AND calls_after[4]>=calls_before[4]
     AND self_after[1]>=self_before[1]
     AND self_after[2]>=self_before[2]
     AND self_after[3]>=self_before[3]
     AND self_after[4]>=self_before[4],
     'R74-05 four original source-function counters monotonic');
    INSERT INTO pg_temp.r74_cost VALUES(
     cfg.label,variant,i,n,ms,
     calls_after[1]-calls_before[1],
     greatest(0,self_after[1]-self_before[1]),
     calls_after[2]-calls_before[2],
     greatest(0,self_after[2]-self_before[2]),
     calls_after[3]-calls_before[3],
     greatest(0,self_after[3]-self_before[3]),
     calls_after[4]-calls_before[4],
     greatest(0,self_after[4]-self_before[4]));
   END LOOP;
  END LOOP;
 END LOOP;
 PERFORM public.b08_assert(
  (SELECT count(*)=24 FROM pg_temp.r74_cost)
  AND (SELECT count(DISTINCT (label,variant))=12 FROM pg_temp.r74_cost)
  AND (SELECT min(viewer_count)=8 FROM pg_temp.r74_cost)
  AND (SELECT count(*)=4 FROM pg_temp.r74_cost
   WHERE label='mixed-wall-dark' AND is_lit_calls>0)
  AND (SELECT count(*)=2 FROM pg_temp.r74_cost
   WHERE label='mixed-wall-bright' AND variant='fastpath'
   AND is_lit_calls=0),
  'R74-06 6x2x2 eight-viewer samples and dark/bright lighting calls');
END $r74_profile$;
SET LOCAL track_functions='none';

-- Source fidelity, not output size: compare exact entire JSONB including
-- visible, explored, revisions and metadata for every private fixture viewer.
DO $r74_full_parity$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 cfg record;person uuid;original_frame jsonb;fast_frame jsonb;
 scenes int:=0;frames int:=0;n int;
BEGIN
 FOR cfg IN SELECT label,scene FROM pg_temp.r74_scenes ORDER BY label LOOP
  UPDATE public.map_environments SET live=cfg.scene WHERE map_id=test_map;
  n:=0;
  FOR person IN SELECT user_id FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player' ORDER BY user_id LOOP
   original_frame:=forge_visibility.r57_unmodified_fog_frame(test_map,person);
   fast_frame:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
   PERFORM public.b08_assert(original_frame IS NOT DISTINCT FROM fast_frame,
    'R74-07 complete private original/fastpath fog parity '||cfg.label);
   n:=n+1;
  END LOOP;
  PERFORM public.b08_assert(n=8,
   'R74-08 all eight independently authorized fixture viewers included');
  scenes:=scenes+1;frames:=frames+n;
 END LOOP;
 PERFORM public.b08_assert(scenes=10 AND frames=80,
  'R74-09 ten mixed and hostile scenes x eight complete private frames');
END $r74_full_parity$;

-- Test owned-tool torch path, including the extra nested lighting ray,
-- without allowing data or permissions to survive the local savepoint.
SAVEPOINT r74_torch_probe;
UPDATE public.map_environments SET live=(
 SELECT scene FROM pg_temp.r74_scenes WHERE label='mixed-wall-dark')
WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;
INSERT INTO public.campaign_tool_map_tokens(
 issue_id,campaign_id,map_id,name,icon,kind,x,y,
 light_bright,light_dim,light_enabled)
VALUES('00000000-0000-4000-8000-000000000909'::uuid,
 '00000000-0000-4000-8000-000000000001'::uuid,
 '00000000-0000-4000-8000-000000000021'::uuid,
 'fixture torch','torch','torch',8,8,40,20,true);
DO $r74_torch_parity$
DECLARE
 person uuid;a jsonb;b jsonb;n int:=0;
BEGIN
 FOR person IN SELECT user_id FROM public.campaign_members
  WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
   AND role='player' ORDER BY user_id LOOP
  a:=forge_visibility.r57_unmodified_fog_frame(
   '00000000-0000-4000-8000-000000000021'::uuid,person);
  b:=forge_visibility.authorized_viewer_fog_frame(
   '00000000-0000-4000-8000-000000000021'::uuid,person);
  PERFORM public.b08_assert(a IS NOT DISTINCT FROM b,
   'R74-10 torch and mixed authored light exact original/fastpath parity');
  n:=n+1;
 END LOOP;
 PERFORM public.b08_assert(n=8,'R74-11 all eight torch-afflicted viewer frames');
END $r74_torch_parity$;
ROLLBACK TO SAVEPOINT r74_torch_probe;
RELEASE SAVEPOINT r74_torch_probe;

-- Revocation is tested with the same source functions and a rollback, not
-- inferred from comparing only previously-authorized frames.
SAVEPOINT r74_revoke;
UPDATE public.campaign_members SET role='spectator'
WHERE user_id='00000000-0000-4000-8000-000000000019'::uuid;
DO $r74_revoke_assert$
DECLARE
 a boolean:=false;b boolean:=false;
BEGIN
 BEGIN
  PERFORM forge_visibility.r57_unmodified_fog_frame(
   '00000000-0000-4000-8000-000000000021'::uuid,
   '00000000-0000-4000-8000-000000000019'::uuid);
 EXCEPTION WHEN others THEN a:=true;
 END;
 BEGIN
  PERFORM forge_visibility.authorized_viewer_fog_frame(
   '00000000-0000-4000-8000-000000000021'::uuid,
   '00000000-0000-4000-8000-000000000019'::uuid);
 EXCEPTION WHEN others THEN b:=true;
 END;
 PERFORM public.b08_assert(a AND b,
  'R74-12 source original/fastpath both deny revoked player');
END $r74_revoke_assert$;
ROLLBACK TO SAVEPOINT r74_revoke;
RELEASE SAVEPOINT r74_revoke;

UPDATE public.map_environments
 SET live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;

-- Diagnostic only: each ray call may be 'vision' or nested 'light'.
-- pg_stat_xact_user_functions cannot split those call modes; do NOT report
-- per-mode counts or pretend these are browser p95 or production wall time.
SELECT label AS scenario,variant,count(*) AS repetitions,
 min(viewer_count) AS viewers_per_iteration,
 round(avg(elapsed_ms)::numeric,3) AS mean_8_frame_elapsed_ms,
 round(avg(ray_calls)::numeric,1) AS mean_ray_calls,
 round(avg(ray_self_ms)::numeric,3) AS mean_ray_self_ms,
 round(avg(is_lit_calls)::numeric,1) AS mean_lighting_calls,
 round(avg(is_lit_self_ms)::numeric,3) AS mean_lighting_self_ms,
 round(avg(wall_passes_calls)::numeric,1) AS mean_wall_passes_calls,
 round(avg(wall_passes_self_ms)::numeric,3) AS mean_wall_passes_self_ms,
 round(avg(cross2_calls)::numeric,1) AS mean_cross2_calls,
 round(avg(cross2_self_ms)::numeric,3) AS mean_cross2_self_ms
FROM pg_temp.r74_cost GROUP BY label,variant ORDER BY label,variant;

DO $r74_no_residue$
BEGIN
 PERFORM public.b08_assert(
  current_setting('track_functions')='none'
  AND (SELECT count(*)=24 FROM pg_temp.r74_cost)
  AND (SELECT count(*)=8 FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player')
  AND NOT EXISTS(SELECT 1 FROM public.campaign_tool_map_tokens
   WHERE issue_id='00000000-0000-4000-8000-000000000909'::uuid)
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
   FROM public.map_environments
   WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid)
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))
   ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
   ='a9fc198168c29fd5d80041b05337017e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.is_lit(uuid,jsonb,double precision,double precision,double precision,double precision,integer)')))
   ='cec916b326a14937ceee2e170619cca2'
  AND (SELECT proacl::text='{postgres=X/postgres}'
   FROM pg_proc WHERE oid=to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'))
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE'),
  'R74-13 exact source/ACL, light, scene and authorized fixture restored');
 RAISE NOTICE 'R18-74 PASS: mixed light/LOS function attribution, 80 full private frame pairs, 8 torch frames, revoked viewer; all disposable';
END $r74_no_residue$;
