-- B10-R18-76: ORDER-BALANCED, source-exact inlining evaluation.
-- PostgreSQL 17 DISPOSABLE LOCAL SOURCE-REAL HARNESS ONLY. NO DEPLOYMENT.
-- Runs inside R57's original BEGIN/ROLLBACK, after R75 source restored.
-- All temporary CREATE OR REPLACE FUNCTION changes occur in one SAVEPOINT.
-- Never print authored geometry, map/user IDs, private frame JSON or tokens.
\set ON_ERROR_STOP on
DO $r76_entry$
BEGIN
 PERFORM public.b08_assert(
  current_database()='world_v2_b10_r05'
  AND current_user='postgres'
  AND current_setting('track_functions')='none'
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
  AND (SELECT count(*)=8 FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
     AND role='player')
  AND (SELECT count(*)=33 FROM pg_temp.r75_scenes)
  AND (SELECT count(*)=528 FROM pg_temp.r75_expected_frames)
  AND (SELECT count(*)=2376 FROM pg_temp.r75_expected_rays)
  AND (SELECT count(*)=16 FROM pg_temp.r75_expected_torch)
  AND (SELECT count(*)=6 FROM pg_temp.r75_cost)
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
   ='a9fc198168c29fd5d80041b05337017e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.cross2(double precision,double precision,double precision,double precision)')))
   ='65c4bff8aaa6ecf38e335a44e95d874e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))
   ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.is_lit(uuid,jsonb,double precision,double precision,double precision,double precision,integer)')))
   ='cec916b326a14937ceee2e170619cca2'
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
   FROM public.map_environments
   WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid)
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE')
  AND NOT has_function_privilege('authenticated',
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon',
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE'),
  'R76-01 exact R75 restored private-source fixture and ACL');
END $r76_entry$;

-- Reuse only original synthetic source-real scenes; add 8 independently
-- constructed epsilon, degeneracy, conditional and malformed test scenes.
CREATE TEMP TABLE r76_scenes(
 label text PRIMARY KEY,scene jsonb NOT NULL
);
INSERT INTO pg_temp.r76_scenes SELECT label,scene FROM pg_temp.r75_scenes;
INSERT INTO pg_temp.r76_scenes(label,scene)
SELECT 'edge-'||v.case_name,
 jsonb_set(s.scene,'{objects,0}',v.wall,false)
FROM (VALUES
 ('west-epsilon','{"type":"wall","points":[{"x":6.4999999999,"y":0},{"x":6.4999999999,"y":16}]}'::jsonb),
 ('east-epsilon','{"type":"wall","points":[{"x":6.5000000001,"y":0},{"x":6.5000000001,"y":16}]}'::jsonb),
 ('near-parallel','{"type":"wall","points":[{"x":-1000000,"y":7.500000000001},{"x":1000000,"y":7.500000000002}]}'::jsonb),
 ('zero-length','{"type":"wall","points":[{"x":6.5,"y":8},{"x":6.5,"y":8}]}'::jsonb),
 ('conditional','{"type":"wall","attributeField":"STR","visionAt":"9","movementAt":"12","points":[{"x":6.5,"y":0},{"x":6.5,"y":16}]}'::jsonb),
 ('one-way-window','{"type":"window","state":"closed","vision":"one-way","oneWay":"b-to-a","curtains":true,"points":[{"x":6.5,"y":0},{"x":6.5,"y":16}]}'::jsonb),
 ('invalid-points','{"type":"wall","points":"not-an-array"}'::jsonb),
 ('invalid-coordinate','{"type":"wall","points":[{"x":"bad","y":0},{"x":6.5,"y":16}]}'::jsonb)
) v(case_name,wall)
JOIN pg_temp.r75_scenes s ON s.label='r74-mixed-wall-dark';

CREATE TEMP TABLE r76_rays AS
 SELECT ray_case,sx,sy,tx,ty FROM pg_temp.r75_rays;
INSERT INTO pg_temp.r76_rays VALUES
 (13,0,0,6.5,8),(14,6.5,8,0,0),
 (15,6.4999999999,8,6.5000000001,8),
 (16,6.5000000001,8,6.4999999999,8),
 (17,0,0,0.0000001,0.0000001),
 (18,0,0,-0.0000001,-0.0000001),
 (19,6.5,-1,6.5,17),(20,6.5,17,6.5,-1),
 (21,0,0.000000000001,12,0.000000000001),
 (22,12,0.000000000001,0,0.000000000001),
 (23,0,15.999999999,12,15.999999999),
 (24,12,16.000000001,0,16.000000001),
 (25,1000000000,1000000000,1000000012,1000000012),
 (26,-1000000000,-1000000000,-999999988,-999999988),
 (27,0,0,0,0),(28,-0.00001,0.00001,0.00001,-0.00001),
 (29,6.5,0.00001,6.5,15.99999),
 (30,6.5,15.99999,6.5,0.00001),
 (31,0,0,0.000000001,0.000000000000001),
 (32,0.000000001,0.000000000000001,0,0);
ALTER TABLE pg_temp.r76_rays ADD PRIMARY KEY(ray_case);
CREATE TEMP TABLE r76_vals(vals_case integer PRIMARY KEY,vals jsonb NOT NULL);
INSERT INTO pg_temp.r76_vals VALUES
 (1,'{}'::jsonb),(2,'{"STR":{"current":10}}'::jsonb),
 (3,'{"STR":8}'::jsonb),(4,'{"STR":"malformed"}'::jsonb);

DO $r76_fixture$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=41 FROM pg_temp.r76_scenes)
  AND (SELECT count(*)=8 FROM pg_temp.r76_scenes WHERE label LIKE 'edge-%')
  AND (SELECT count(*)=32 FROM pg_temp.r76_rays)
  AND (SELECT count(*)=4 FROM pg_temp.r76_vals)
  AND (SELECT count(*)=8 FROM public.campaign_members
    WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player'),
  'R76-02 41 scenes, 32 boundary rays, four attribute cases, eight viewers');
END $r76_fixture$;

-- Capture absolute original booleans and COMPLETE private frames before
-- the candidate SAVEPOINT. This reference is never logged or exported.
CREATE TEMP TABLE r76_expected_rays AS
 SELECT s.label,r.ray_case,m.mode,v.vals_case,
 forge_visibility.ray_blocked(
  s.scene,r.sx,r.sy,r.tx,r.ty,m.mode,v.vals) AS expected
 FROM pg_temp.r76_scenes s
 CROSS JOIN pg_temp.r76_rays r
 CROSS JOIN (VALUES ('vision'),('light'),('movement')) m(mode)
 CROSS JOIN pg_temp.r76_vals v;
ALTER TABLE pg_temp.r76_expected_rays
 ADD PRIMARY KEY(label,ray_case,mode,vals_case);

CREATE TEMP TABLE r76_expected_frames AS
 SELECT label,variant,viewer,expected FROM pg_temp.r75_expected_frames;
ALTER TABLE pg_temp.r76_expected_frames
 ADD PRIMARY KEY(label,variant,viewer);
DO $r76_extra_reference$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 s record;person uuid;original_frame jsonb;fast_frame jsonb;
 n integer:=0;
BEGIN
 FOR s IN SELECT label,scene FROM pg_temp.r76_scenes
  WHERE label LIKE 'edge-%' ORDER BY label LOOP
  UPDATE public.map_environments SET live=s.scene WHERE map_id=test_map;
  FOR person IN SELECT user_id FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player' ORDER BY user_id LOOP
   original_frame:=forge_visibility.r57_unmodified_fog_frame(test_map,person);
   fast_frame:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
   IF original_frame IS DISTINCT FROM fast_frame THEN
    RAISE EXCEPTION 'R76 original and sealed private fog disagree on extra fixture';
   END IF;
   INSERT INTO pg_temp.r76_expected_frames VALUES
    (s.label,'original',person,original_frame),
    (s.label,'fastpath',person,fast_frame);
   n:=n+2;
  END LOOP;
 END LOOP;
 PERFORM public.b08_assert(n=128
  AND (SELECT count(*)=656 FROM pg_temp.r76_expected_frames)
  AND (SELECT count(*)=15744 FROM pg_temp.r76_expected_rays),
  'R76-03 15744 reference direct rays and 656 original private frame references');
END $r76_extra_reference$;

UPDATE public.map_environments
 SET live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;

CREATE TEMP TABLE r76_security_original AS SELECT
 oid,proowner,proacl,prosecdef,proconfig,provolatile,proparallel
 FROM pg_proc WHERE oid=to_regprocedure(
 'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)');

CREATE TEMP TABLE r76_versions(
 variant text PRIMARY KEY CHECK(variant IN ('source','inlined')),
 definition text NOT NULL
);
DO $r76_prepare_exact_source$
DECLARE
 original text:=pg_get_functiondef(to_regprocedure(
 'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'));
 patched text;
 a text:='forge_visibility.cross2(bx-ax,b_y-ay,sx-ax,sy-ay)';
 b text:='forge_visibility.cross2(tx-sx,ty-sy,bx-ax,b_y-ay)';
 c text:='forge_visibility.cross2(ax-sx,ay-sy,bx-ax,b_y-ay)';
 d text:='forge_visibility.cross2(ax-sx,ay-sy,tx-sx,ty-sy)';
BEGIN
 PERFORM public.b08_assert(
  md5(original)='a9fc198168c29fd5d80041b05337017e',
  'R76-04 only original sealed ray source may be optimized');
 IF (length(original)-length(replace(original,a,'')))<>length(a)
 OR (length(original)-length(replace(original,b,'')))<>length(b)
 OR (length(original)-length(replace(original,c,'')))<>length(c)
 OR (length(original)-length(replace(original,d,'')))<>length(d) THEN
  RAISE EXCEPTION 'R76 source has drifted or any cross-product anchor is ambiguous';
 END IF;
 patched:=replace(original,a,'((bx-ax)*(sy-ay)-(b_y-ay)*(sx-ax))');
 patched:=replace(patched,b,'((tx-sx)*(b_y-ay)-(ty-sy)*(bx-ax))');
 patched:=replace(patched,c,'((ax-sx)*(b_y-ay)-(ay-sy)*(bx-ax))');
 patched:=replace(patched,d,'((ax-sx)*(ty-sy)-(ay-sy)*(tx-sx))');
 INSERT INTO pg_temp.r76_versions VALUES
 ('source',original),('inlined',patched);
 PERFORM public.b08_assert(position('forge_visibility.cross2(' in patched)=0
  AND (SELECT count(*)=2 FROM pg_temp.r76_versions),
  'R76-05 source-exact four inline replacements and original source preserved');
END $r76_prepare_exact_source$;

CREATE TEMP TABLE r76_balance(
 phase_no integer PRIMARY KEY CHECK(phase_no BETWEEN 1 AND 8),
 variant text NOT NULL CHECK(variant IN ('source','inlined'))
);
-- ABBA + BAAB: four independent measured phases per source, symmetrical
-- by block, avoiding the fixed source-first bias in R18-75.
INSERT INTO pg_temp.r76_balance VALUES
 (1,'source'),(2,'inlined'),(3,'inlined'),(4,'source'),
 (5,'inlined'),(6,'source'),(7,'source'),(8,'inlined');
CREATE TEMP TABLE r76_cost(
 phase_no integer NOT NULL REFERENCES pg_temp.r76_balance(phase_no),
 variant text NOT NULL CHECK(variant IN ('source','inlined')),
 scene_label text NOT NULL CHECK(scene_label IN
  ('r74-mixed-wall-dark','r74-mixed-wall-dim','r74-mixed-door-closed-dark')),
 viewer_count integer NOT NULL CHECK(viewer_count=8),
 eight_frame_elapsed_ms double precision NOT NULL CHECK(eight_frame_elapsed_ms>=0),
 ray_calls bigint NOT NULL CHECK(ray_calls>=0),
 ray_self_ms double precision NOT NULL CHECK(ray_self_ms>=0),
 cross_calls bigint NOT NULL CHECK(cross_calls>=0),
 cross_self_ms double precision NOT NULL CHECK(cross_self_ms>=0),
 PRIMARY KEY(phase_no,scene_label)
);

SAVEPOINT r76_balanced_probe;
DO $r76_initial_inline$
DECLARE candidate text;
BEGIN
 SELECT v.definition INTO candidate FROM pg_temp.r76_versions v
 WHERE v.variant='inlined';
 EXECUTE candidate;
 PERFORM public.b08_assert(
  md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
    <>'a9fc198168c29fd5d80041b05337017e'
  AND position('forge_visibility.cross2(' in pg_get_functiondef(to_regprocedure(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))=0
  AND (SELECT p.proowner=g.proowner
   AND p.proacl IS NOT DISTINCT FROM g.proacl
   AND p.prosecdef IS NOT DISTINCT FROM g.prosecdef
   AND p.proconfig IS NOT DISTINCT FROM g.proconfig
   AND p.provolatile IS NOT DISTINCT FROM g.provolatile
   AND p.proparallel IS NOT DISTINCT FROM g.proparallel
   FROM pg_proc p CROSS JOIN pg_temp.r76_security_original g
   WHERE p.oid=to_regprocedure(
    'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')),
  'R76-06 temporary source-derived candidate retains original private properties');
END $r76_initial_inline$;

-- Aggregate-only mismatch handling: never expose which private map or
-- viewer had differing geometry/visibility. No lossy hash or cell counts.
DO $r76_equivalence$
DECLARE
 ray record;blocked boolean;ray_n integer:=0;
 fixture_row record;reference record;actual jsonb;frame_n integer:=0;
 test_map uuid:='00000000-0000-4000-8000-000000000021';
BEGIN
 FOR ray IN SELECT e.expected,s.scene,r.sx,r.sy,r.tx,r.ty,
   e.mode,v.vals FROM pg_temp.r76_expected_rays e
   JOIN pg_temp.r76_scenes s ON s.label=e.label
   JOIN pg_temp.r76_rays r ON r.ray_case=e.ray_case
   JOIN pg_temp.r76_vals v ON v.vals_case=e.vals_case
   ORDER BY e.label,e.ray_case,e.mode,e.vals_case LOOP
  blocked:=forge_visibility.ray_blocked(
   ray.scene,ray.sx,ray.sy,ray.tx,ray.ty,ray.mode,ray.vals);
  IF blocked IS DISTINCT FROM ray.expected THEN
   RAISE EXCEPTION 'R76 fail-closed direct ray source equivalence FAILED';
  END IF;
  ray_n:=ray_n+1;
 END LOOP;
 PERFORM public.b08_assert(ray_n=15744,
  'R76-07 all 15744 original vs inline ray booleans including exact epsilon boundaries');

 FOR fixture_row IN SELECT label,scene FROM pg_temp.r76_scenes ORDER BY label LOOP
  UPDATE public.map_environments SET live=fixture_row.scene WHERE map_id=test_map;
  FOR reference IN SELECT e.variant,e.viewer,e.expected
   FROM pg_temp.r76_expected_frames e
   WHERE e.label=fixture_row.label ORDER BY e.variant,e.viewer LOOP
   IF reference.variant='original' THEN
    actual:=forge_visibility.r57_unmodified_fog_frame(test_map,reference.viewer);
   ELSE
    actual:=forge_visibility.authorized_viewer_fog_frame(test_map,reference.viewer);
   END IF;
   IF actual IS DISTINCT FROM reference.expected THEN
    RAISE EXCEPTION 'R76 complete protected original/inlined fog parity FAILED';
   END IF;
   frame_n:=frame_n+1;
  END LOOP;
 END LOOP;
 PERFORM public.b08_assert(frame_n=656,
  'R76-08 41 original/conditional/malformed/light scenes x 8 viewers x 2 complete frames');
END $r76_equivalence$;

-- Source-derived inline ray also covers combined equipped torch and
-- authored map lights, exactly as the original R75 protected references.
UPDATE public.map_environments SET live=(
 SELECT scene FROM pg_temp.r76_scenes WHERE label='r74-mixed-wall-dark')
WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;
INSERT INTO public.campaign_tool_map_tokens(
 issue_id,campaign_id,map_id,name,icon,kind,x,y,
 light_bright,light_dim,light_enabled)
VALUES('00000000-0000-4000-8000-000000000907'::uuid,
 '00000000-0000-4000-8000-000000000001'::uuid,
 '00000000-0000-4000-8000-000000000021'::uuid,
 'fixture torch','torch','torch',8,8,40,20,true);
DO $r76_torch$
DECLARE ref record;actual jsonb;n integer:=0;
BEGIN
 FOR ref IN SELECT variant,viewer,expected FROM pg_temp.r75_expected_torch
  ORDER BY variant,viewer LOOP
  IF ref.variant='original' THEN
   actual:=forge_visibility.r57_unmodified_fog_frame(
    '00000000-0000-4000-8000-000000000021'::uuid,ref.viewer);
  ELSE
   actual:=forge_visibility.authorized_viewer_fog_frame(
    '00000000-0000-4000-8000-000000000021'::uuid,ref.viewer);
  END IF;
  IF actual IS DISTINCT FROM ref.expected THEN
   RAISE EXCEPTION 'R76 original/inlined combined torch-and-map-light fog mismatch';
  END IF;
  n:=n+1;
 END LOOP;
 PERFORM public.b08_assert(n=16,
  'R76-09 all 16 private torch+authored-light frames exactly matched');
END $r76_torch$;
DELETE FROM public.campaign_tool_map_tokens
 WHERE issue_id='00000000-0000-4000-8000-000000000907'::uuid;

SAVEPOINT r76_revoke;
UPDATE public.campaign_members SET role='spectator'
 WHERE user_id='00000000-0000-4000-8000-000000000019'::uuid;
DO $r76_revoke_gate$
DECLARE a boolean:=false;b boolean:=false;
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
  'R76-10 revoked viewer denied by both unchanged protected frame wrappers');
END $r76_revoke_gate$;
ROLLBACK TO SAVEPOINT r76_revoke;
RELEASE SAVEPOINT r76_revoke;

UPDATE public.map_environments SET live=
 '{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;

-- The 8 phases alternate ABBA/BAAB. Every transition is checked against
-- the EXACT source digest, and both variants preserve original pg_proc ACL.
-- One warm-up frame per scene/phase is excluded from measured elapsed time
-- and function deltas to reduce function-plan compilation order effects.
SET LOCAL track_functions='all';
DO $r76_profile$
DECLARE
 fn regprocedure:=to_regprocedure(
  'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)');
 round record;cfg record;person uuid;warm_viewer uuid;frame jsonb;
 code text;last_variant text:='inlined';inline_digest text;
 calls0 bigint[];calls1 bigint[];ms0 double precision[];ms1 double precision[];
 t timestamptz;elapsed double precision;viewers integer;
 test_map uuid:='00000000-0000-4000-8000-000000000021';
BEGIN
 inline_digest:=md5(pg_get_functiondef(fn));
 SELECT c.user_id INTO warm_viewer FROM public.campaign_members c
 WHERE c.campaign_id='00000000-0000-4000-8000-000000000001'::uuid
  AND c.role='player' ORDER BY c.user_id LIMIT 1;
 PERFORM public.b08_assert(warm_viewer IS NOT NULL,
  'R76-11 warm-up authorized viewer exists in isolated fixture');

 FOR round IN SELECT b.phase_no,b.variant FROM pg_temp.r76_balance b
  ORDER BY b.phase_no LOOP
  IF round.variant IS DISTINCT FROM last_variant THEN
   SELECT v.definition INTO code FROM pg_temp.r76_versions v
   WHERE v.variant=round.variant;
   EXECUTE code;
   last_variant:=round.variant;
  END IF;
  PERFORM public.b08_assert(
   md5(pg_get_functiondef(fn))=CASE
    WHEN round.variant='source' THEN 'a9fc198168c29fd5d80041b05337017e'
    ELSE inline_digest END
   AND (SELECT p.proowner=g.proowner
    AND p.proacl IS NOT DISTINCT FROM g.proacl
    AND p.prosecdef IS NOT DISTINCT FROM g.prosecdef
    AND p.proconfig IS NOT DISTINCT FROM g.proconfig
    AND p.provolatile IS NOT DISTINCT FROM g.provolatile
    AND p.proparallel IS NOT DISTINCT FROM g.proparallel
    FROM pg_proc p CROSS JOIN pg_temp.r76_security_original g
    WHERE p.oid=fn),
   'R76-12 alternating variant exact source hash and private function properties');

  FOR cfg IN SELECT s.label,s.scene FROM pg_temp.r76_scenes s
   WHERE s.label IN ('r74-mixed-wall-dark','r74-mixed-wall-dim',
    'r74-mixed-door-closed-dark') ORDER BY s.label LOOP
   UPDATE public.map_environments SET live=cfg.scene WHERE map_id=test_map;
   -- Not in timed interval; avoids first-call planning skew in each phase.
   PERFORM forge_visibility.authorized_viewer_fog_frame(test_map,warm_viewer);
   SELECT ARRAY[
     coalesce(sum(c.calls) FILTER(WHERE c.funcname='ray_blocked'),0),
     coalesce(sum(c.calls) FILTER(WHERE c.funcname='cross2'),0)
    ]::bigint[],ARRAY[
     coalesce(sum(c.self_time) FILTER(WHERE c.funcname='ray_blocked'),0),
     coalesce(sum(c.self_time) FILTER(WHERE c.funcname='cross2'),0)
    ]::double precision[]
    INTO calls0,ms0 FROM pg_stat_xact_user_functions c
    WHERE c.schemaname='forge_visibility';

   viewers:=0;t:=clock_timestamp();
   FOR person IN SELECT c.user_id FROM public.campaign_members c
    WHERE c.campaign_id='00000000-0000-4000-8000-000000000001'::uuid
     AND c.role='player' ORDER BY c.user_id LOOP
    frame:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
    IF jsonb_typeof(frame) IS DISTINCT FROM 'object'
     OR jsonb_typeof(frame->'visible') IS DISTINCT FROM 'array'
     OR jsonb_typeof(frame->'explored') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'R76 protected measured fog frame invalid';
    END IF;
    viewers:=viewers+1;
   END LOOP;
   elapsed:=extract(epoch FROM clock_timestamp()-t)*1000;

   SELECT ARRAY[
     coalesce(sum(c.calls) FILTER(WHERE c.funcname='ray_blocked'),0),
     coalesce(sum(c.calls) FILTER(WHERE c.funcname='cross2'),0)
    ]::bigint[],ARRAY[
     coalesce(sum(c.self_time) FILTER(WHERE c.funcname='ray_blocked'),0),
     coalesce(sum(c.self_time) FILTER(WHERE c.funcname='cross2'),0)
    ]::double precision[]
    INTO calls1,ms1 FROM pg_stat_xact_user_functions c
    WHERE c.schemaname='forge_visibility';
   IF viewers<>8 OR calls1[1]<calls0[1] OR calls1[2]<calls0[2]
    OR ms1[1]<ms0[1] OR ms1[2]<ms0[2] THEN
    RAISE EXCEPTION 'R76 transaction-local function counters invalid';
   END IF;
   INSERT INTO pg_temp.r76_cost VALUES(
    round.phase_no,round.variant,cfg.label,viewers,elapsed,
    calls1[1]-calls0[1],greatest(0,ms1[1]-ms0[1]),
    calls1[2]-calls0[2],greatest(0,ms1[2]-ms0[2]));
  END LOOP;
 END LOOP;
 PERFORM public.b08_assert(
  (SELECT count(*)=24 FROM pg_temp.r76_cost)
  AND (SELECT count(*)=12 FROM pg_temp.r76_cost c WHERE c.variant='source')
  AND (SELECT count(*)=12 FROM pg_temp.r76_cost c WHERE c.variant='inlined')
  AND (SELECT count(*)=12 FROM pg_temp.r76_cost c
   WHERE c.variant='inlined' AND c.cross_calls=0)
  AND (SELECT count(*)=12 FROM pg_temp.r76_cost c
   WHERE c.variant='source' AND c.cross_calls>0)
  AND (SELECT min(c.viewer_count)=8 FROM pg_temp.r76_cost c)
  AND (SELECT count(DISTINCT c.ray_calls)=1 FROM pg_temp.r76_cost c
   WHERE c.scene_label='r74-mixed-wall-dark'),
  'R76-13 exact ABBA/BAAB balanced 24 full frame sets, original ray count retained');
END $r76_profile$;
SET LOCAL track_functions='none';

-- Only source-labeled aggregate metrics. No private frames, IDs or geometry.
SELECT c.scene_label,c.variant,count(*) AS phases,
 round(avg(c.eight_frame_elapsed_ms)::numeric,3) AS mean_8_frame_ms,
 round((percentile_cont(0.5) WITHIN GROUP(
  ORDER BY c.eight_frame_elapsed_ms))::numeric,3) AS median_8_frame_ms,
 round(min(c.eight_frame_elapsed_ms)::numeric,3) AS min_8_frame_ms,
 round(max(c.eight_frame_elapsed_ms)::numeric,3) AS max_8_frame_ms,
 round(avg(c.ray_calls)::numeric,1) AS mean_ray_calls,
 round(avg(c.ray_self_ms)::numeric,3) AS mean_ray_self_ms,
 round(avg(c.cross_calls)::numeric,1) AS mean_cross_calls,
 round(avg(c.cross_self_ms)::numeric,3) AS mean_cross_self_ms
FROM pg_temp.r76_cost c GROUP BY c.scene_label,c.variant
ORDER BY c.scene_label,c.variant;

ROLLBACK TO SAVEPOINT r76_balanced_probe;
RELEASE SAVEPOINT r76_balanced_probe;

DO $r76_restored$
BEGIN
 PERFORM public.b08_assert(
  current_setting('track_functions')='none'
  AND (SELECT count(*)=0 FROM pg_temp.r76_cost)
  AND (SELECT count(*)=41 FROM pg_temp.r76_scenes)
  AND (SELECT count(*)=15744 FROM pg_temp.r76_expected_rays)
  AND (SELECT count(*)=656 FROM pg_temp.r76_expected_frames)
  AND (SELECT count(*)=8 FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player')
  AND NOT EXISTS(SELECT 1 FROM public.campaign_tool_map_tokens
   WHERE issue_id='00000000-0000-4000-8000-000000000907'::uuid)
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
   FROM public.map_environments
   WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid)
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
   ='a9fc198168c29fd5d80041b05337017e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.cross2(double precision,double precision,double precision,double precision)')))
   ='65c4bff8aaa6ecf38e335a44e95d874e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))
   ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND (SELECT p.proowner=g.proowner
   AND p.proacl IS NOT DISTINCT FROM g.proacl
   AND p.prosecdef IS NOT DISTINCT FROM g.prosecdef
   AND p.proconfig IS NOT DISTINCT FROM g.proconfig
   AND p.provolatile IS NOT DISTINCT FROM g.provolatile
   AND p.proparallel IS NOT DISTINCT FROM g.proparallel
   FROM pg_proc p CROSS JOIN pg_temp.r76_security_original g
   WHERE p.oid=to_regprocedure(
    'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'))
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE'),
  'R76-14 sealed original function, ACL, roster, scene and profiling restored');
 RAISE NOTICE 'R18-76 PASS: 15744 exact rays, 656 private frames, 16 torch frames, ABBA/BAAB balanced geometry profile, revoked viewer and full original source rollback';
END $r76_restored$;
