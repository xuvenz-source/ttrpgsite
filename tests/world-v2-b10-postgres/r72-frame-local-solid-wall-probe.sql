-- B10-R18-72: DISPOSABLE PG17 ONLY. Validated frame-local exact-duplicate
-- plain solid wall reduction, never a deployed candidate. No migrations/grants.
-- R57's original BEGIN/ROLLBACK contains this entire SAVEPOINT experiment.
\set ON_ERROR_STOP on

DO $r72_guard$
BEGIN
 PERFORM public.b08_assert(
  current_database()='world_v2_b10_r05'
  AND current_user='postgres'
  AND current_setting('track_functions')='none'
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
  AND (SELECT count(*)=12 FROM pg_temp.r71_samples)
  AND (SELECT count(*)=8 FROM public.campaign_members WHERE role='player')
  AND to_regprocedure('forge_visibility.r57_unmodified_fog_frame(uuid,uuid)') IS NOT NULL
  AND md5(pg_get_functiondef(to_regprocedure(
    'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))
    ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND md5(pg_get_functiondef(to_regprocedure(
    'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
    ='a9fc198168c29fd5d80041b05337017e'
  AND (SELECT proacl::text='{postgres=X/postgres}'
   FROM pg_proc WHERE oid=to_regprocedure(
    'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'))
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE')
  AND NOT has_function_privilege('authenticated',
    'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon',
    'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE'),
  'R72-01 sealed isolated private source, 91-history and 8-viewer fixture');
END $r72_guard$;

-- No test-only object reduction is ever persisted to authored map data.
-- The test candidate will receive one of these ORIGINAL scenes and
-- compute a reduced private local copy, strictly for vision ray evaluation.
CREATE TEMP TABLE r72_scenes(
 label text PRIMARY KEY, scene jsonb NOT NULL
);
INSERT INTO pg_temp.r72_scenes
 SELECT 'shape-'||shape,scene FROM pg_temp.r71_shapes;
INSERT INTO pg_temp.r72_scenes
 SELECT 'hostile-'||label,scene FROM pg_temp.r69_scenes;
INSERT INTO pg_temp.r72_scenes
 SELECT 'baseline-'||label,scene FROM pg_temp.r57_scenes;

INSERT INTO pg_temp.r72_scenes
SELECT 'duplicate-shared',
 pg_catalog.jsonb_set(scene,'{fog,partyShared}','true'::jsonb,false)
FROM pg_temp.r71_shapes WHERE shape='repeated-24';
INSERT INTO pg_temp.r72_scenes
SELECT 'duplicate-dark',pg_catalog.jsonb_set(scene,'{ambient}','0'::jsonb,false)
FROM pg_temp.r71_shapes WHERE shape='repeated-24';
INSERT INTO pg_temp.r72_scenes
SELECT 'duplicate-with-light',
 pg_catalog.jsonb_set(scene,'{objects}',scene->'objects'||
  '[{"type":"light","enabled":true,"x":6,"y":6,"bright":35,"dim":20}]'::jsonb,false)
FROM pg_temp.r71_shapes WHERE shape='repeated-24';
INSERT INTO pg_temp.r72_scenes
SELECT 'duplicate-with-conditional',
 pg_catalog.jsonb_set(scene,'{objects}',scene->'objects'||
  '[{"type":"wall","vision":"one-way","oneWay":"a-to-b",
  "points":[{"x":4.5,"y":0},{"x":4.5,"y":15}]}]'::jsonb,false)
FROM pg_temp.r71_shapes WHERE shape='repeated-24';
INSERT INTO pg_temp.r72_scenes
SELECT 'duplicate-with-null',
 pg_catalog.jsonb_set(scene,'{objects}',scene->'objects'||'[null]'::jsonb,false)
FROM pg_temp.r71_shapes WHERE shape='repeated-24';
INSERT INTO pg_temp.r72_scenes
SELECT 'duplicate-with-invalid-points',
 pg_catalog.jsonb_set(scene,'{objects}',scene->'objects'||
  '[{"type":"wall","points":"bad"}]'::jsonb,false)
FROM pg_temp.r71_shapes WHERE shape='repeated-24';
INSERT INTO pg_temp.r72_scenes
SELECT 'duplicate-with-nonnumeric-point',
 pg_catalog.jsonb_set(scene,'{objects}',scene->'objects'||
  '[{"type":"wall","points":[{"x":"NaN","y":0},{"x":7,"y":10}]}]'::jsonb,false)
FROM pg_temp.r71_shapes WHERE shape='repeated-24';
INSERT INTO pg_temp.r72_scenes
SELECT 'duplicate-over-120',
 pg_catalog.jsonb_set(scene,'{objects}',(
  SELECT jsonb_agg(item ORDER BY n)
  FROM generate_series(1,121) n
  CROSS JOIN LATERAL (SELECT
   '{"type":"wall","points":[{"x":5.5,"y":0},{"x":5.5,"y":15}]}'::jsonb AS item) w
 ),false)
FROM pg_temp.r71_shapes WHERE shape='repeated-24';

DO $r72_scenes_guard$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=23 FROM pg_temp.r72_scenes)
  AND (SELECT jsonb_array_length(scene->'objects')=121
   FROM pg_temp.r72_scenes WHERE label='duplicate-over-120')
  AND (SELECT jsonb_array_length(scene->'objects')=24
   FROM pg_temp.r72_scenes WHERE label='shape-repeated-24')
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
   FROM public.map_environments
   WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid),
  'R72-02 complete hard-case scenes constructed without authored changes');
END $r72_scenes_guard$;

CREATE TEMP TABLE r72_samples(
 shape text NOT NULL,
 iteration integer NOT NULL CHECK(iteration BETWEEN 1 AND 2),
 viewers integer NOT NULL CHECK(viewers=8),
 eight_frame_elapsed_ms double precision NOT NULL CHECK(eight_frame_elapsed_ms>=0),
 ray_calls bigint NOT NULL CHECK(ray_calls>=0),
 ray_self_ms double precision NOT NULL CHECK(ray_self_ms>=0),
 PRIMARY KEY(shape,iteration)
);
SAVEPOINT r72_candidate_only;

-- Derive a test-only replacement of the EXACT sealed R57 private frame
-- function from the PostgreSQL catalog. No self-contained guessed clone.
-- The three anchor strings must each occur exactly once in that digest.
DO $r72_patch$
DECLARE
 fn regprocedure:=to_regprocedure('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)');
 original text:=pg_get_functiondef(to_regprocedure(
  'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'));
 patched text;
 a text:='r56_no_lights boolean:=false;r56_ambient double precision;';
 b text:=' with sources as materialized (';
 c text:='forge_visibility.ray_blocked(scene,';
 declarations text:=$r72_decl$
 r72_ray_scene jsonb;
 r72_valid boolean;
 r72_item jsonb;r72_point jsonb;r72_short jsonb;
$r72_decl$;
 preparation text:=$r72_prepare$
 -- R72 local probe: never modify published scene. Only an ENTIRE scene
 -- of plain static exact-duplicate solid walls is eligible. Mixed scenes,
 -- conditionals, doors, windows, malformed objects and >120 elements
 -- follow the original, unmodified ray function with the original scene.
 r72_ray_scene:=scene;
 BEGIN
  r72_valid:=false;
  IF jsonb_typeof(scene->'objects')='array'
    AND jsonb_array_length(scene->'objects') BETWEEN 2 AND 120 THEN
   r72_valid:=true;
   FOR r72_item IN SELECT value FROM jsonb_array_elements(scene->'objects')
    LOOP
    IF jsonb_typeof(r72_item) IS DISTINCT FROM 'object'
      OR r72_item->>'type' IS DISTINCT FROM 'wall' THEN
      r72_valid:=false;EXIT;
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(r72_item))<>2
      OR jsonb_typeof(r72_item->'points') IS DISTINCT FROM 'array' THEN
      r72_valid:=false;EXIT;
    END IF;
    IF jsonb_array_length(r72_item->'points') NOT BETWEEN 2 AND 80 THEN
      r72_valid:=false;EXIT;
    END IF;
    FOR r72_point IN SELECT value
      FROM jsonb_array_elements(r72_item->'points') LOOP
      IF jsonb_typeof(r72_point) IS DISTINCT FROM 'object' THEN
       r72_valid:=false;EXIT;
      END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(r72_point))<>2
       OR jsonb_typeof(r72_point->'x') IS DISTINCT FROM 'number'
       OR jsonb_typeof(r72_point->'y') IS DISTINCT FROM 'number' THEN
       r72_valid:=false;EXIT;
      END IF;
    END LOOP;
    IF NOT r72_valid THEN EXIT; END IF;
   END LOOP;
  END IF;
  IF r72_valid THEN
   SELECT coalesce(jsonb_agg(object_value ORDER BY first_ordinal),'[]'::jsonb)
   INTO r72_short FROM (
    SELECT DISTINCT ON (object_value) object_value,
      ordinal AS first_ordinal
    FROM jsonb_array_elements(scene->'objects')
      WITH ORDINALITY AS objects(object_value,ordinal)
    ORDER BY object_value,ordinal
   ) AS exact_first;
   IF jsonb_array_length(r72_short)<jsonb_array_length(scene->'objects') THEN
    r72_ray_scene:=jsonb_set(scene,'{objects}',r72_short,false);
   END IF;
  END IF;
 EXCEPTION WHEN OTHERS THEN
  -- On any validation failure or unexpected cast, retain original
  -- scene and the original fail-closed private ray implementation.
  r72_ray_scene:=scene;
 END;
$r72_prepare$;
BEGIN
 PERFORM public.b08_assert(md5(original)='f37c8d13e8d48bea123b4c811ae6de4d',
  'R72-03 source-exact private R57 patch precondition');
 IF position(a in original)=0 OR position(a in replace(original,a,''))>0 OR
    position(b in original)=0 OR position(b in replace(original,b,''))>0 OR
    position(c in original)=0 OR position(c in replace(original,c,''))>0 THEN
  RAISE EXCEPTION 'R72 refuses ambiguous or drifted private source anchors';
 END IF;
 patched:=replace(original,a,a||declarations);
 patched:=replace(patched,b,preparation||b);
 patched:=replace(patched,c,'forge_visibility.ray_blocked(r72_ray_scene,');
 EXECUTE patched;
 PERFORM public.b08_assert(
  md5(pg_get_functiondef(fn))<>'f37c8d13e8d48bea123b4c811ae6de4d'
  AND position('forge_visibility.ray_blocked(r72_ray_scene,'
   in pg_get_functiondef(fn))>0
  AND (SELECT prosecdef AND proacl::text='{postgres=X/postgres}'
   AND proconfig @> ARRAY['search_path=""']::text[]
   FROM pg_proc WHERE oid=fn)
  AND NOT has_function_privilege('authenticated',fn,'EXECUTE')
  AND NOT has_function_privilege('anon',fn,'EXECUTE'),
  'R72-04 private source probe installed only under rollback SAVEPOINT');
END $r72_patch$;

-- Absolute timings in this phase may not be compared to production, and
-- the R71 baseline was earlier in this transaction (warm-cache bias).
SET LOCAL track_functions='all';
DO $r72_sample$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 row_ record;person uuid;frame jsonb;iteration integer;
 before_calls bigint;after_calls bigint;
 before_ms double precision;after_ms double precision;
 measured timestamptz;elapsed double precision;num integer;
BEGIN
 FOR iteration IN 1..2 LOOP
  FOR row_ IN SELECT label,scene FROM pg_temp.r72_scenes
   WHERE label IN ('shape-repeated-24','shape-distinct-8','shape-reversed-24')
   ORDER BY CASE WHEN iteration=1 THEN label
     ELSE CASE WHEN label='shape-repeated-24' THEN 'z' ELSE label END END LOOP
   UPDATE public.map_environments SET live=row_.scene WHERE map_id=test_map;
   SELECT coalesce(sum(calls),0)::bigint,coalesce(sum(self_time),0)::double precision
   INTO before_calls,before_ms FROM pg_stat_xact_user_functions
   WHERE schemaname='forge_visibility' AND funcname='ray_blocked';
   num:=0;measured:=clock_timestamp();
   FOR person IN SELECT user_id FROM public.campaign_members
    WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
     AND role='player' ORDER BY user_id LOOP
     frame:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
     PERFORM public.b08_assert(
      jsonb_typeof(frame)='object'
      AND jsonb_typeof(frame->'visible')='array'
      AND jsonb_typeof(frame->'explored')='array',
      'R72-05 signed private source probe emits complete frame');
     num:=num+1;
   END LOOP;
   elapsed:=extract(epoch FROM clock_timestamp()-measured)*1000;
   SELECT coalesce(sum(calls),0)::bigint,coalesce(sum(self_time),0)::double precision
   INTO after_calls,after_ms FROM pg_stat_xact_user_functions
   WHERE schemaname='forge_visibility' AND funcname='ray_blocked';
   PERFORM public.b08_assert(num=8 AND after_calls>=before_calls
     AND after_ms>=before_ms, 'R72-06 eight-viewer ray counters monotonic');
   INSERT INTO pg_temp.r72_samples VALUES(row_.label,iteration,num,elapsed,
     after_calls-before_calls,greatest(0,after_ms-before_ms));
  END LOOP;
 END LOOP;
 PERFORM public.b08_assert(
   (SELECT count(*)=6 FROM pg_temp.r72_samples)
   AND (SELECT min(viewers)=8 FROM pg_temp.r72_samples),
   'R72-07 six original-source ray cost observations retained for logs only');
END $r72_sample$;
SET LOCAL track_functions='none';

-- Complete privacy parity; check all hostile original scenes and custom
-- strict eligibility/fallback scenes across EVERY simulated viewer, not
-- merely counts, hashes or visible-cell subsets.
DO $r72_private_parity$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 row_ record;person uuid;reference jsonb;probed jsonb;counted integer;
 scenes integer:=0;frames integer:=0;denied_original boolean;denied_probe boolean;
BEGIN
 FOR row_ IN SELECT label,scene FROM pg_temp.r72_scenes ORDER BY label LOOP
  UPDATE public.map_environments SET live=row_.scene WHERE map_id=test_map;
  counted:=0;
  FOR person IN SELECT user_id FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player' ORDER BY user_id LOOP
   reference:=forge_visibility.r57_unmodified_fog_frame(test_map,person);
   probed:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
   PERFORM public.b08_assert(reference IS NOT DISTINCT FROM probed,
    'R72-08 complete original/probe private fog equality '||row_.label);
   counted:=counted+1;
  END LOOP;
  PERFORM public.b08_assert(counted=8,
   'R72-09 all eight independently modeled viewer members checked');
  scenes:=scenes+1;frames:=frames+counted;
 END LOOP;
 PERFORM public.b08_assert(
  scenes=23 AND frames=184,
  'R72-10 23 scene types x 8 full private frames original equality');

 -- Authorization revocation must always run before any value is returned.
 UPDATE public.campaign_members SET role='spectator'
 WHERE user_id='00000000-0000-4000-8000-000000000019'::uuid;
 denied_original:=false;denied_probe:=false;
 BEGIN
  PERFORM forge_visibility.r57_unmodified_fog_frame(test_map,
   '00000000-0000-4000-8000-000000000019'::uuid);
 EXCEPTION WHEN OTHERS THEN denied_original:=true;
 END;
 BEGIN
  PERFORM forge_visibility.authorized_viewer_fog_frame(test_map,
   '00000000-0000-4000-8000-000000000019'::uuid);
 EXCEPTION WHEN OTHERS THEN denied_probe:=true;
 END;
 PERFORM public.b08_assert(denied_original AND denied_probe,
  'R72-11 both original and source probe deny revoked viewer');
 RAISE NOTICE 'R18-72 PASS: 184 full private original/probe frames, revocation and exact fallback, all disposable';
END $r72_private_parity$;

-- Report only aggregate cost, NEVER private scene JSON, player IDs or
-- visible/explored arrays. R71 and R72 were sequenced (not randomized);
-- comparisons are exploratory, not accepted speedup benchmarks.
SELECT replace(shape,'shape-','') AS control_shape,
 count(*) AS iterations,min(viewers) AS viewers_per_iteration,
 round(avg(eight_frame_elapsed_ms)::numeric,3) AS probe_8_frame_elapsed_ms,
 round(avg(ray_calls)::numeric,1) AS probe_ray_calls,
 round(avg(ray_self_ms)::numeric,3) AS probe_ray_self_ms
FROM pg_temp.r72_samples
GROUP BY shape ORDER BY shape;

ROLLBACK TO SAVEPOINT r72_candidate_only;
RELEASE SAVEPOINT r72_candidate_only;

DO $r72_no_residue$
BEGIN
 PERFORM public.b08_assert(
  current_setting('track_functions')='none'
  AND md5(pg_get_functiondef(to_regprocedure(
    'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))
    ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND md5(pg_get_functiondef(to_regprocedure(
    'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
    ='a9fc198168c29fd5d80041b05337017e'
  AND (SELECT count(*)=8 FROM public.campaign_members WHERE role='player')
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
   FROM public.map_environments
   WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid)
  AND (SELECT proacl::text='{postgres=X/postgres}' FROM pg_proc
   WHERE oid=to_regprocedure('forge_visibility.authorized_viewer_fog_frame(uuid,uuid)'))
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE'),
  'R72-12 exact sealed R57 source, private ACL, roster and original environment restored');
END $r72_no_residue$;
