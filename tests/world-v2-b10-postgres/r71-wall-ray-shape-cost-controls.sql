-- B10-R18-71: disposable PostgreSQL 17 ONLY; original ray semantics remain authoritative.
-- Requires the R18-70 profiler and runs inside R18-57's existing BEGIN/ROLLBACK.
-- This is a SHAPE COST CONTROL, not a geometry deduplication implementation.
-- No production SQL, raw player frames, coordinates or identifiers are logged.
\set ON_ERROR_STOP on
DO $r71_guard$
BEGIN
 PERFORM public.b08_assert(
  current_database()='world_v2_b10_r05'
  AND current_user='postgres'
  AND current_setting('track_functions')='none'
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
  AND to_regclass('pg_temp.r70_function_samples') IS NOT NULL
  AND (SELECT count(*)=8 FROM pg_temp.r70_function_samples)
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
   ='a9fc198168c29fd5d80041b05337017e'
  AND md5(pg_get_functiondef(to_regprocedure(
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)')))
   ='f37c8d13e8d48bea123b4c811ae6de4d'
  AND to_regprocedure('forge_visibility.r57_unmodified_fog_frame(uuid,uuid)') IS NOT NULL
  AND NOT has_schema_privilege('authenticated','forge_visibility','USAGE')
  AND NOT has_schema_privilege('anon','forge_visibility','USAGE')
  AND NOT has_function_privilege('authenticated',
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon',
   'forge_visibility.authorized_viewer_fog_frame(uuid,uuid)','EXECUTE')
  AND (SELECT count(*)=8 FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player'),
  'R71-01 exact private source and isolated eight-viewer environment');
END $r71_guard$;

-- The original 24-wall fixture contains THREE exact copies of each of
-- eight solid wall JSON objects. The eight-object control is a different
-- disposable TEST SCENE, never a rewrite of an actual published scene.
CREATE TEMP TABLE r71_shapes(
 shape text PRIMARY KEY CHECK(shape IN ('repeated-24','distinct-8','reversed-24')),
 scene jsonb NOT NULL
);
INSERT INTO pg_temp.r71_shapes(shape,scene)
SELECT 'repeated-24',scene FROM pg_temp.r57_scenes WHERE label='wall-heavy';
INSERT INTO pg_temp.r71_shapes(shape,scene)
SELECT 'distinct-8',jsonb_set(s.scene,'{objects}',(
 SELECT jsonb_agg(v ORDER BY v) FROM (
  SELECT DISTINCT value AS v FROM jsonb_array_elements(s.scene->'objects')
 ) AS unique_objects),false)
FROM pg_temp.r57_scenes AS s WHERE s.label='wall-heavy';
INSERT INTO pg_temp.r71_shapes(shape,scene)
SELECT 'reversed-24',jsonb_set(s.scene,'{objects}',(
 SELECT jsonb_agg(value ORDER BY ord DESC)
 FROM jsonb_array_elements(s.scene->'objects') WITH ORDINALITY AS e(value,ord)
),false)
FROM pg_temp.r57_scenes AS s WHERE s.label='wall-heavy';

DO $r71_shapes_guard$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=3 FROM pg_temp.r71_shapes)
  AND (SELECT jsonb_array_length(scene->'objects')=24
    FROM pg_temp.r71_shapes WHERE shape='repeated-24')
  AND (SELECT jsonb_array_length(scene->'objects')=8
    FROM pg_temp.r71_shapes WHERE shape='distinct-8')
  AND (SELECT jsonb_array_length(scene->'objects')=24
    FROM pg_temp.r71_shapes WHERE shape='reversed-24')
  AND (SELECT count(DISTINCT value)=8
    FROM jsonb_array_elements((SELECT scene->'objects'
      FROM pg_temp.r71_shapes WHERE shape='repeated-24')))
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
   FROM public.map_environments
   WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid),
  'R71-02 controls are exactly 24 repeated, 8 unique and 24 reversed walls');
END $r71_shapes_guard$;

CREATE TEMP TABLE r71_samples(
 shape text NOT NULL,
 variant text NOT NULL CHECK(variant IN ('original','fastpath')),
 iteration integer NOT NULL CHECK(iteration BETWEEN 1 AND 2),
 viewer_count integer NOT NULL CHECK(viewer_count=8),
 frame_elapsed_ms double precision NOT NULL CHECK(frame_elapsed_ms>=0),
 ray_calls bigint NOT NULL CHECK(ray_calls>=0),
 ray_self_ms double precision NOT NULL CHECK(ray_self_ms>=0),
 PRIMARY KEY(shape,variant,iteration)
);

SET LOCAL track_functions='all';
DO $r71_measure$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 cfg record;v_kind text;person uuid;frame jsonb;
 i integer;viewers integer;
 before_calls bigint;after_calls bigint;
 before_ms double precision;after_ms double precision;
 started timestamptz;elapsed_ms double precision;
BEGIN
 PERFORM public.b08_assert(current_setting('track_functions')='all',
  'R71-03 transaction-local original ray profiling enabled');
 FOR i IN 1..2 LOOP
  FOR cfg IN SELECT shape,scene FROM pg_temp.r71_shapes ORDER BY shape LOOP
   UPDATE public.map_environments SET live=cfg.scene WHERE map_id=test_map;
   FOREACH v_kind IN ARRAY (CASE WHEN i=1
     THEN ARRAY['original','fastpath']::text[]
     ELSE ARRAY['fastpath','original']::text[] END) LOOP
    SELECT coalesce(sum(calls),0)::bigint,
      coalesce(sum(self_time),0)::double precision
    INTO before_calls,before_ms
    FROM pg_stat_xact_user_functions
    WHERE schemaname='forge_visibility' AND funcname='ray_blocked';
    viewers:=0;
    started:=clock_timestamp();
    FOR person IN SELECT user_id FROM public.campaign_members
     WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
      AND role='player' ORDER BY user_id LOOP
     IF v_kind='original' THEN
      frame:=forge_visibility.r57_unmodified_fog_frame(test_map,person);
     ELSE
      frame:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
     END IF;
     PERFORM public.b08_assert(jsonb_typeof(frame)='object'
       AND jsonb_typeof(frame->'visible')='array'
       AND jsonb_typeof(frame->'explored')='array',
       'R71-04 complete private frame from exact source');
     viewers:=viewers+1;
    END LOOP;
    elapsed_ms:=extract(epoch FROM clock_timestamp()-started)*1000;
    SELECT coalesce(sum(calls),0)::bigint,
      coalesce(sum(self_time),0)::double precision
    INTO after_calls,after_ms
    FROM pg_stat_xact_user_functions
    WHERE schemaname='forge_visibility' AND funcname='ray_blocked';
    PERFORM public.b08_assert(
      viewers=8 AND after_calls>=before_calls AND after_ms>=before_ms,
      'R71-05 monotonic original ray counters across eight viewers');
    INSERT INTO pg_temp.r71_samples
    VALUES(cfg.shape,v_kind,i,viewers,elapsed_ms,
      after_calls-before_calls,greatest(0,after_ms-before_ms));
   END LOOP;
  END LOOP;
 END LOOP;
 PERFORM public.b08_assert(
  (SELECT count(*)=12 FROM pg_temp.r71_samples)
  AND (SELECT count(DISTINCT (s.shape,s.variant))=6
   FROM pg_temp.r71_samples AS s),
  'R71-06 exact 3x2x2 source/candidate cost control samples');
END $r71_measure$;

-- Source-real full JSONB parity is verified separately from timed samples,
-- to avoid charging the source's calls to the candidate's measured interval.
DO $r71_parity$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 cfg record;person uuid;expected jsonb;actual jsonb;n integer;
BEGIN
 FOR cfg IN SELECT shape,scene FROM pg_temp.r71_shapes ORDER BY shape LOOP
  UPDATE public.map_environments SET live=cfg.scene WHERE map_id=test_map;
  n:=0;
  FOR person IN SELECT user_id FROM public.campaign_members
   WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
   AND role='player' ORDER BY user_id LOOP
   expected:=forge_visibility.r57_unmodified_fog_frame(test_map,person);
   actual:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
   PERFORM public.b08_assert(expected IS NOT DISTINCT FROM actual,
    'R71-07 full private original/fastpath frame equality '||cfg.shape);
   n:=n+1;
  END LOOP;
  PERFORM public.b08_assert(n=8,
   'R71-08 all eight original fixture viewers checked');
 END LOOP;
 UPDATE public.map_environments
 SET live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
 WHERE map_id=test_map;
 PERFORM public.b08_assert(
  (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
   FROM public.map_environments WHERE map_id=test_map),
  'R71-09 exact original environment restored');
 RAISE NOTICE 'R18-71 PASS: 24 whole private frames matched, ray-shape attribution recorded in disposable PG17; no runtime changes';
END $r71_parity$;

-- Safe aggregate diagnostic only; no fixture user IDs, frames or geometry.
SELECT shape,variant,count(*) AS iterations,
 min(viewer_count) AS viewers_per_iteration,
 round(avg(frame_elapsed_ms)::numeric,3) AS mean_8_frame_elapsed_ms,
 round(avg(ray_calls)::numeric,1) AS mean_ray_calls,
 round(avg(ray_self_ms)::numeric,3) AS mean_ray_self_ms
FROM pg_temp.r71_samples
GROUP BY shape,variant ORDER BY shape,variant;

SET LOCAL track_functions='none';
DO $r71_restored$
BEGIN
 PERFORM public.b08_assert(
  current_setting('track_functions')='none'
  AND (SELECT count(*)=12 FROM pg_temp.r71_samples)
  AND (SELECT count(*)=8 FROM public.campaign_members WHERE role='player')
  AND md5(pg_get_functiondef(to_regprocedure(
    'forge_visibility.ray_blocked(jsonb,double precision,double precision,double precision,double precision,text,jsonb)')))
    ='a9fc198168c29fd5d80041b05337017e',
  'R71-10 original ray source and untracked R57 benchmark restored');
END $r71_restored$;
