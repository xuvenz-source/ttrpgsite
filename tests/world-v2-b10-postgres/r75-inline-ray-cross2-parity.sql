-- B10-R18-75: DISPOSABLE PG17 SOURCE-REAL CROSS-PRODUCT PROBE ONLY.
-- Runs inside R18-57's existing BEGIN/ROLLBACK, after full R74 source restore.
-- Captures original protected frames and direct ray outcomes BEFORE a
-- temporary SAVEPOINT-local replacement of ray_blocked; restores exact source.
-- Never install on Supabase, use as a migration, or emit private frame JSON.
\set ON_ERROR_STOP on

DO $r75_entry$
BEGIN
 PERFORM public.b08_assert(
  current_database()='world_v2_b10_r05'
  AND current_user='postgres'
  AND current_setting('track_functions')='none'
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
  AND (SELECT count(*)=8 FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player')
  AND (SELECT count(*)=10 FROM pg_temp.r74_scenes)
  AND (SELECT count(*)=24 FROM pg_temp.r74_cost)
  AND (SELECT count(*)=23 FROM pg_temp.r72_scenes)
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
   ='a9fc198168c29fd5d80041b05337017e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.cross2(double precision,double precision,double precision,double precision)')))
   ='65c4bff8aaa6ecf38e335a44e95d874e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.is_lit(uuid,jsonb,double precision,double precision,double precision,double precision,integer)')))
   ='cec916b326a14937ceee2e170619cca2'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))
   ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE')
  AND NOT has_function_privilege('authenticated',
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon',
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
   FROM public.map_environments
   WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid),
  'R75-01 exact pre-R75 source, 91-history fixture, private ACL and roster');
END $r75_entry$;

-- Reuse original source-real synthetic scenes only. Names are bounded fixture
-- labels, not production map IDs. Never export scene JSON or private cells.
CREATE TEMP TABLE r75_scenes(
 label text PRIMARY KEY,scene jsonb NOT NULL
);
INSERT INTO pg_temp.r75_scenes SELECT 'r72-'||label,scene
 FROM pg_temp.r72_scenes;
INSERT INTO pg_temp.r75_scenes SELECT 'r74-'||label,scene
 FROM pg_temp.r74_scenes;
DO $r75_scene_assert$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=33 FROM pg_temp.r75_scenes)
  AND (SELECT count(*)=23 FROM pg_temp.r75_scenes WHERE label LIKE 'r72-%')
  AND (SELECT count(*)=10 FROM pg_temp.r75_scenes WHERE label LIKE 'r74-%')
  AND (SELECT count(*)=1 FROM pg_temp.r75_scenes
   WHERE label='r74-mixed-wall-dark'),
  'R75-02 original 33 source-real and hostile synthetic fixture scenes');
END $r75_scene_assert$;

CREATE TEMP TABLE r75_expected_frames(
 label text NOT NULL REFERENCES pg_temp.r75_scenes(label),
 variant text NOT NULL CHECK(variant IN ('original','fastpath')),
 viewer uuid NOT NULL,
 expected jsonb NOT NULL,
 PRIMARY KEY(label,variant,viewer)
);
CREATE TEMP TABLE r75_expected_rays(
 label text NOT NULL REFERENCES pg_temp.r75_scenes(label),
 ray_case integer NOT NULL,
 mode text NOT NULL,
 vals_case integer NOT NULL,
 expected boolean NOT NULL,
 PRIMARY KEY(label,ray_case,mode,vals_case)
);
CREATE TEMP TABLE r75_expected_torch(
 variant text NOT NULL CHECK(variant IN ('original','fastpath')),
 viewer uuid NOT NULL,expected jsonb NOT NULL,
 PRIMARY KEY(variant,viewer)
);
CREATE TEMP TABLE r75_original_ray_security AS
 SELECT oid,proowner,proacl,prosecdef,proconfig,provolatile
 FROM pg_proc WHERE oid=to_regprocedure(
 'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)');

-- Direct original ray outcomes on near-parallel, same-point, reversed,
-- one-way/door/window and epsilon-border inputs, in all three ray modes
-- with both empty and field-bearing character attributes. NO rounding.
CREATE TEMP TABLE r75_rays(
 ray_case integer PRIMARY KEY,sx double precision,sy double precision,
 tx double precision,ty double precision
);
INSERT INTO pg_temp.r75_rays VALUES
 (1,0,0,12,12),(2,12,12,0,0),
 (3,6.5,0,6.5,16),(4,5.5,7.5,7.5,7.5),
 (5,7.5,7.5,5.5,7.5),(6,5.5,0,7.5,16),
 (7,1,1,1,1),(8,0,7.5,12,7.5),
 (9,5.5,7.5,6.5,7.5),(10,6.5,7.5,7.5,7.5),
 (11,6.49999,7.5,6.50001,7.5),
 (12,6.50001,7.5,6.49999,7.5);

INSERT INTO pg_temp.r75_expected_rays(label,ray_case,mode,vals_case,expected)
SELECT s.label,r.ray_case,m.mode,v.vals_case,
 forge_visibility.ray_blocked(s.scene,r.sx,r.sy,r.tx,r.ty,m.mode,v.vals)
FROM pg_temp.r75_scenes s
CROSS JOIN pg_temp.r75_rays r
CROSS JOIN (VALUES ('vision'),('light'),('movement')) AS m(mode)
CROSS JOIN (VALUES (1,'{}'::jsonb),
 (2,'{"STR":{"current":10}}'::jsonb)) AS v(vals_case,vals);

-- Preserve the COMPLETE private reference frame, not hashes or cell counts.
-- Eight fixture viewers per scene, both source-original and sealed R57 fog.
DO $r75_capture_original$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 s record;person uuid;a jsonb;b jsonb;n integer:=0;
BEGIN
 FOR s IN SELECT label,scene FROM pg_temp.r75_scenes ORDER BY label LOOP
  UPDATE public.map_environments SET live=s.scene WHERE map_id=test_map;
  FOR person IN SELECT user_id FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player' ORDER BY user_id LOOP
   a:=forge_visibility.r57_unmodified_fog_frame(test_map,person);
   b:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
   PERFORM public.b08_assert(a IS NOT DISTINCT FROM b,
    'R75-03 original ray unchanged: source and R57 private frame equality');
   INSERT INTO pg_temp.r75_expected_frames VALUES
    (s.label,'original',person,a),(s.label,'fastpath',person,b);
   n:=n+2;
  END LOOP;
 END LOOP;
 PERFORM public.b08_assert(
  n=528
  AND (SELECT count(*)=528 FROM pg_temp.r75_expected_frames)
  AND (SELECT count(*)=2376 FROM pg_temp.r75_expected_rays),
  'R75-04 528 exact reference private frames and 2376 direct rays captured');
END $r75_capture_original$;

-- Baseline torch frames; all data is synthetic and deleted inside the
-- already-disposable outer transaction before the probe.
UPDATE public.map_environments SET live=(
 SELECT scene FROM pg_temp.r75_scenes
 WHERE label='r74-mixed-wall-dark')
WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;
INSERT INTO public.campaign_tool_map_tokens(
 issue_id,campaign_id,map_id,name,icon,kind,x,y,
 light_bright,light_dim,light_enabled)
VALUES('00000000-0000-4000-8000-000000000908'::uuid,
 '00000000-0000-4000-8000-000000000001'::uuid,
 '00000000-0000-4000-8000-000000000021'::uuid,
 'fixture torch','torch','torch',8,8,40,20,true);
INSERT INTO pg_temp.r75_expected_torch(variant,viewer,expected)
SELECT v.variant,c.user_id,
 CASE WHEN v.variant='original'
  THEN forge_visibility.r57_unmodified_fog_frame(
   '00000000-0000-4000-8000-000000000021'::uuid,c.user_id)
  ELSE forge_visibility.authorized_viewer_fog_frame(
   '00000000-0000-4000-8000-000000000021'::uuid,c.user_id)
 END
FROM public.campaign_members c
CROSS JOIN (VALUES ('original'),('fastpath')) v(variant)
WHERE c.campaign_id='00000000-0000-4000-8000-000000000001'::uuid
 AND c.role='player';
DELETE FROM public.campaign_tool_map_tokens
 WHERE issue_id='00000000-0000-4000-8000-000000000908'::uuid;
UPDATE public.map_environments SET live=
 '{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;

DO $r75_baseline_guard$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=16 FROM pg_temp.r75_expected_torch)
  AND NOT EXISTS(SELECT 1 FROM public.campaign_tool_map_tokens
   WHERE issue_id='00000000-0000-4000-8000-000000000908'::uuid),
  'R75-05 sixteen sealed torch references captured without fixture residue');
END $r75_baseline_guard$;

CREATE TEMP TABLE r75_cost(
 variant text NOT NULL CHECK(variant IN ('source','inlined')),
 scenario text NOT NULL CHECK(scenario IN (
  'r74-mixed-wall-dark','r74-mixed-wall-dim','r74-mixed-door-closed-dark')),
 iteration integer NOT NULL CHECK(iteration IN (1,2)),
 viewer_count integer NOT NULL CHECK(viewer_count=8),
 elapsed_ms double precision NOT NULL CHECK(elapsed_ms>=0),
 ray_calls bigint NOT NULL CHECK(ray_calls>=0),
 ray_self_ms double precision NOT NULL CHECK(ray_self_ms>=0),
 cross_calls bigint NOT NULL CHECK(cross_calls>=0),
 cross_self_ms double precision NOT NULL CHECK(cross_self_ms>=0),
 PRIMARY KEY(variant,scenario,iteration)
);

-- Source baseline, measured only after full expected-frame capture.
SET LOCAL track_functions='all';
DO $r75_original_cost$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 s record;person uuid;f jsonb;i integer;n integer;
 call0 bigint[];call1 bigint[];ms0 double precision[];ms1 double precision[];
 t timestamptz;elapsed double precision;
BEGIN
 FOR i IN 1..2 LOOP
  FOR s IN SELECT label,scene FROM pg_temp.r75_scenes WHERE label IN
   ('r74-mixed-wall-dark','r74-mixed-wall-dim','r74-mixed-door-closed-dark')
   ORDER BY label LOOP
   UPDATE public.map_environments SET live=s.scene WHERE map_id=test_map;
   SELECT ARRAY[
    coalesce(sum(calls) FILTER(WHERE funcname='ray_blocked'),0),
    coalesce(sum(calls) FILTER(WHERE funcname='cross2'),0)
   ]::bigint[],ARRAY[
    coalesce(sum(self_time) FILTER(WHERE funcname='ray_blocked'),0),
    coalesce(sum(self_time) FILTER(WHERE funcname='cross2'),0)
   ]::double precision[]
   INTO call0,ms0 FROM pg_stat_xact_user_functions
   WHERE schemaname='forge_visibility';
   n:=0;t:=clock_timestamp();
   FOR person IN SELECT user_id FROM public.campaign_members
    WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
     AND role='player' ORDER BY user_id LOOP
    f:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
    PERFORM public.b08_assert(jsonb_typeof(f)='object'
      AND jsonb_typeof(f->'visible')='array',
      'R75-06 source local performance frames complete');
    n:=n+1;
   END LOOP;
   elapsed:=extract(epoch FROM clock_timestamp()-t)*1000;
   SELECT ARRAY[
    coalesce(sum(calls) FILTER(WHERE funcname='ray_blocked'),0),
    coalesce(sum(calls) FILTER(WHERE funcname='cross2'),0)
   ]::bigint[],ARRAY[
    coalesce(sum(self_time) FILTER(WHERE funcname='ray_blocked'),0),
    coalesce(sum(self_time) FILTER(WHERE funcname='cross2'),0)
   ]::double precision[]
   INTO call1,ms1 FROM pg_stat_xact_user_functions
   WHERE schemaname='forge_visibility';
   PERFORM public.b08_assert(n=8 AND call1[1]>=call0[1]
    AND call1[2]>=call0[2] AND ms1[1]>=ms0[1] AND ms1[2]>=ms0[2],
    'R75-07 monotonic original transaction-local ray/cross2 counters');
   INSERT INTO pg_temp.r75_cost VALUES('source',s.label,i,n,elapsed,
    call1[1]-call0[1],greatest(0,ms1[1]-ms0[1]),
    call1[2]-call0[2],greatest(0,ms1[2]-ms0[2]));
  END LOOP;
 END LOOP;
 PERFORM public.b08_assert(
  (SELECT count(*)=6 FROM pg_temp.r75_cost)
  AND (SELECT bool_and(c.cross_calls>0) FROM pg_temp.r75_cost c),
  'R75-08 six original source samples have actual cross2 work');
END $r75_original_cost$;
SET LOCAL track_functions='none';
UPDATE public.map_environments SET live=
 '{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;

-- EVERYTHING following is reverted by this dedicated SAVEPOINT, including
-- the temporary source-replaced ray function and candidate timing rows.
SAVEPOINT r75_inline_ray_probe;
DO $r75_patch_ray$
DECLARE
 fn regprocedure:=to_regprocedure(
  'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)');
 original text:=pg_get_functiondef(to_regprocedure(
  'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'));
 patched text;
 a text:='forge_visibility.cross2(bx-ax,b_y-ay,sx-ax,sy-ay)';
 b text:='forge_visibility.cross2(tx-sx,ty-sy,bx-ax,b_y-ay)';
 c text:='forge_visibility.cross2(ax-sx,ay-sy,bx-ax,b_y-ay)';
 d text:='forge_visibility.cross2(ax-sx,ay-sy,tx-sx,ty-sy)';
BEGIN
 PERFORM public.b08_assert(md5(original)='a9fc198168c29fd5d80041b05337017e'
  AND (SELECT count(*)=1 FROM pg_temp.r75_original_ray_security),
  'R75-09 exact original ray digest and security record before inlining');
 IF (length(original)-length(replace(original,a,'')))<>length(a)
 OR (length(original)-length(replace(original,b,'')))<>length(b)
 OR (length(original)-length(replace(original,c,'')))<>length(c)
 OR (length(original)-length(replace(original,d,'')))<>length(d) THEN
  RAISE EXCEPTION 'R75 refuses original ray source drift or ambiguous anchors';
 END IF;
 -- Inlined expressions reproduce exact cross2(ax,ay,bx,by) source:
 -- SELECT ax*by-ay*bx, with unchanged operand order, side, epsilon,
 -- early-out, door/window checks and fail-closed exception return.
 patched:=replace(original,a,'((bx-ax)*(sy-ay)-(b_y-ay)*(sx-ax))');
 patched:=replace(patched,b,'((tx-sx)*(b_y-ay)-(ty-sy)*(bx-ax))');
 patched:=replace(patched,c,'((ax-sx)*(b_y-ay)-(ay-sy)*(bx-ax))');
 patched:=replace(patched,d,'((ax-sx)*(ty-sy)-(ay-sy)*(tx-sx))');
 EXECUTE patched;
 PERFORM public.b08_assert(
  md5(pg_get_functiondef(fn))<>'a9fc198168c29fd5d80041b05337017e'
  AND position('forge_visibility.cross2(' in pg_get_functiondef(fn))=0
  AND (SELECT p.proowner=g.proowner
   AND p.proacl IS NOT DISTINCT FROM g.proacl
   AND p.prosecdef IS NOT DISTINCT FROM g.prosecdef
   AND p.proconfig IS NOT DISTINCT FROM g.proconfig
   AND p.provolatile IS NOT DISTINCT FROM g.provolatile
   FROM pg_proc p CROSS JOIN pg_temp.r75_original_ray_security g
   WHERE p.oid=fn)
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.cross2(double precision,double precision,double precision,double precision)')))
   ='65c4bff8aaa6ecf38e335a44e95d874e',
  'R75-10 source-derived inline ray has identical owner, ACL and volatility');
END $r75_patch_ray$;

-- Actual original vs inlined boolean outcomes for all three ray modes.
DO $r75_direct_ray_parity$
DECLARE
 rec record;result_blocked boolean;n integer:=0;
BEGIN
 FOR rec IN SELECT e.label,e.ray_case,e.mode,e.vals_case,e.expected,
   s.scene,r.sx,r.sy,r.tx,r.ty,
   CASE WHEN e.vals_case=1 THEN '{}'::jsonb
    ELSE '{"STR":{"current":10}}'::jsonb END AS vals
  FROM pg_temp.r75_expected_rays e
  JOIN pg_temp.r75_scenes s ON s.label=e.label
  JOIN pg_temp.r75_rays r ON r.ray_case=e.ray_case
  ORDER BY e.label,e.ray_case,e.mode,e.vals_case LOOP
  result_blocked:=forge_visibility.ray_blocked(
   rec.scene,rec.sx,rec.sy,rec.tx,rec.ty,rec.mode,rec.vals);
  PERFORM public.b08_assert(result_blocked IS NOT DISTINCT FROM rec.expected,
   'R75-11 exact unrounded source/inlined boolean ray parity');
  n:=n+1;
 END LOOP;
 PERFORM public.b08_assert(n=2376,
  'R75-12 33 source-real scenes x 12 rays x 3 modes x 2 attributes');
END $r75_direct_ray_parity$;

-- Source alias and sealed R18-57 frames both require exact all-field JSONB
-- equality with their BEFORE-patch references; no hashing/vision-only checks.
DO $r75_private_frame_parity$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 s record;reference record;current_frame jsonb;n int:=0;
BEGIN
 FOR s IN SELECT label,scene FROM pg_temp.r75_scenes ORDER BY label LOOP
  UPDATE public.map_environments SET live=s.scene WHERE map_id=test_map;
  FOR reference IN SELECT e.variant,e.viewer,e.expected AS ref_frame
   FROM pg_temp.r75_expected_frames e
   WHERE e.label=s.label ORDER BY e.variant,e.viewer LOOP
   IF reference.variant='original' THEN
    current_frame:=forge_visibility.r57_unmodified_fog_frame(
     test_map,reference.viewer);
   ELSE
    current_frame:=forge_visibility.authorized_viewer_fog_frame(
     test_map,reference.viewer);
   END IF;
   PERFORM public.b08_assert(
    current_frame IS NOT DISTINCT FROM reference.ref_frame,
    'R75-13 complete source/inlined private fog JSONB equality');
   n:=n+1;
  END LOOP;
 END LOOP;
 PERFORM public.b08_assert(n=528,
  'R75-14 33 hostile/source-real scenes x 8 viewers x 2 frame variants');
END $r75_private_frame_parity$;

-- Mixed authored lights + disposable tool torch under inlined intersections.
UPDATE public.map_environments SET live=(
 SELECT scene FROM pg_temp.r75_scenes
 WHERE label='r74-mixed-wall-dark')
WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;
INSERT INTO public.campaign_tool_map_tokens(
 issue_id,campaign_id,map_id,name,icon,kind,x,y,
 light_bright,light_dim,light_enabled)
VALUES('00000000-0000-4000-8000-000000000908'::uuid,
 '00000000-0000-4000-8000-000000000001'::uuid,
 '00000000-0000-4000-8000-000000000021'::uuid,
 'fixture torch','torch','torch',8,8,40,20,true);
DO $r75_torch_parity$
DECLARE
 r record;actual jsonb;n integer:=0;
BEGIN
 FOR r IN SELECT variant,viewer,expected FROM pg_temp.r75_expected_torch
  ORDER BY variant,viewer LOOP
  IF r.variant='original' THEN
   actual:=forge_visibility.r57_unmodified_fog_frame(
    '00000000-0000-4000-8000-000000000021'::uuid,r.viewer);
  ELSE
   actual:=forge_visibility.authorized_viewer_fog_frame(
    '00000000-0000-4000-8000-000000000021'::uuid,r.viewer);
  END IF;
  PERFORM public.b08_assert(actual IS NOT DISTINCT FROM r.expected,
   'R75-15 full inlined mixed authored/torch private frame parity');
  n:=n+1;
 END LOOP;
 PERFORM public.b08_assert(n=16,
  'R75-16 16 complete original/inlined torch protected frames');
END $r75_torch_parity$;
DELETE FROM public.campaign_tool_map_tokens
 WHERE issue_id='00000000-0000-4000-8000-000000000908'::uuid;

SAVEPOINT r75_revocation;
UPDATE public.campaign_members SET role='spectator'
 WHERE user_id='00000000-0000-4000-8000-000000000019'::uuid;
DO $r75_revoke_assert$
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
  'R75-17 both protected original and inlined frames deny revoked viewer');
END $r75_revoke_assert$;
ROLLBACK TO SAVEPOINT r75_revocation;
RELEASE SAVEPOINT r75_revocation;

SET LOCAL track_functions='all';
DO $r75_inlined_cost$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 s record;person uuid;f jsonb;i integer;n integer;
 call0 bigint[];call1 bigint[];ms0 double precision[];ms1 double precision[];
 t timestamptz;elapsed double precision;
BEGIN
 FOR i IN 1..2 LOOP
  FOR s IN SELECT label,scene FROM pg_temp.r75_scenes WHERE label IN
   ('r74-mixed-wall-dark','r74-mixed-wall-dim','r74-mixed-door-closed-dark')
   ORDER BY label LOOP
   UPDATE public.map_environments SET live=s.scene WHERE map_id=test_map;
   SELECT ARRAY[
    coalesce(sum(calls) FILTER(WHERE funcname='ray_blocked'),0),
    coalesce(sum(calls) FILTER(WHERE funcname='cross2'),0)
   ]::bigint[],ARRAY[
    coalesce(sum(self_time) FILTER(WHERE funcname='ray_blocked'),0),
    coalesce(sum(self_time) FILTER(WHERE funcname='cross2'),0)
   ]::double precision[]
   INTO call0,ms0 FROM pg_stat_xact_user_functions
   WHERE schemaname='forge_visibility';
   n:=0;t:=clock_timestamp();
   FOR person IN SELECT user_id FROM public.campaign_members
    WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
     AND role='player' ORDER BY user_id LOOP
    f:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
    PERFORM public.b08_assert(jsonb_typeof(f)='object'
      AND jsonb_typeof(f->'visible')='array',
      'R75-18 inlined local performance frames complete');
    n:=n+1;
   END LOOP;
   elapsed:=extract(epoch FROM clock_timestamp()-t)*1000;
   SELECT ARRAY[
    coalesce(sum(calls) FILTER(WHERE funcname='ray_blocked'),0),
    coalesce(sum(calls) FILTER(WHERE funcname='cross2'),0)
   ]::bigint[],ARRAY[
    coalesce(sum(self_time) FILTER(WHERE funcname='ray_blocked'),0),
    coalesce(sum(self_time) FILTER(WHERE funcname='cross2'),0)
   ]::double precision[]
   INTO call1,ms1 FROM pg_stat_xact_user_functions
   WHERE schemaname='forge_visibility';
   PERFORM public.b08_assert(n=8 AND call1[1]>=call0[1]
    AND call1[2]>=call0[2] AND ms1[1]>=ms0[1] AND ms1[2]>=ms0[2],
    'R75-19 monotonic inlined transaction-local ray/cross2 counters');
   INSERT INTO pg_temp.r75_cost VALUES('inlined',s.label,i,n,elapsed,
    call1[1]-call0[1],greatest(0,ms1[1]-ms0[1]),
    call1[2]-call0[2],greatest(0,ms1[2]-ms0[2]));
  END LOOP;
 END LOOP;
 PERFORM public.b08_assert(
  (SELECT count(*)=12 FROM pg_temp.r75_cost)
  AND (SELECT count(*)=6 FROM pg_temp.r75_cost
   WHERE variant='inlined' AND cross_calls=0),
  'R75-20 ray inlining removes helper calls in all six measured frames');
END $r75_inlined_cost$;
SET LOCAL track_functions='none';

-- Only variant labels and aggregate counters are printed. This cannot
-- establish a true browser p95, a production win or variance significance.
SELECT scenario,variant,count(*) AS iterations,
 min(viewer_count) AS viewers_per_iteration,
 round(avg(elapsed_ms)::numeric,3) AS mean_8_frame_elapsed_ms,
 round(avg(ray_calls)::numeric,1) AS mean_ray_calls,
 round(avg(ray_self_ms)::numeric,3) AS mean_ray_self_ms,
 round(avg(cross_calls)::numeric,1) AS mean_cross2_calls,
 round(avg(cross_self_ms)::numeric,3) AS mean_cross2_self_ms
FROM pg_temp.r75_cost
GROUP BY scenario,variant ORDER BY scenario,variant;

ROLLBACK TO SAVEPOINT r75_inline_ray_probe;
RELEASE SAVEPOINT r75_inline_ray_probe;

DO $r75_restored$
BEGIN
 PERFORM public.b08_assert(
  current_setting('track_functions')='none'
  AND (SELECT count(*)=6 FROM pg_temp.r75_cost)
  AND (SELECT count(*)=528 FROM pg_temp.r75_expected_frames)
  AND (SELECT count(*)=2376 FROM pg_temp.r75_expected_rays)
  AND (SELECT count(*)=16 FROM pg_temp.r75_expected_torch)
  AND (SELECT count(*)=8 FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player')
  AND NOT EXISTS(SELECT 1 FROM public.campaign_tool_map_tokens
   WHERE issue_id='00000000-0000-4000-8000-000000000908'::uuid)
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
   ='a9fc198168c29fd5d80041b05337017e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.cross2(double precision,double precision,double precision,double precision)')))
   ='65c4bff8aaa6ecf38e335a44e95d874e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))
   ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
   FROM public.map_environments
   WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid)
  AND (SELECT p.proowner=g.proowner
   AND p.proacl IS NOT DISTINCT FROM g.proacl
   AND p.prosecdef IS NOT DISTINCT FROM g.prosecdef
   AND p.proconfig IS NOT DISTINCT FROM g.proconfig
   AND p.provolatile IS NOT DISTINCT FROM g.provolatile
   FROM pg_proc p CROSS JOIN pg_temp.r75_original_ray_security g
   WHERE p.oid=to_regprocedure(
    'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)'))
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE'),
  'R75-21 original ray, frames, ACL, roster, light, fog and tracking restored');
 RAISE NOTICE 'R18-75 PASS: 2376 exact ray comparisons, 528 private frames, 16 torch frames, revocation and full original source rollback';
END $r75_restored$;
