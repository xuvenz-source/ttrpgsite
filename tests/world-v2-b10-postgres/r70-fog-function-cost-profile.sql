-- B10-R18-70: DISPOSABLE PostgreSQL 17 ONLY.
-- Included in R18-57's existing source-real BEGIN/ROLLBACK AFTER R18-69
-- parity and BEFORE the original R18-57 signed Commit/negative gate suite.
-- PostgreSQL's transaction-local pg_stat_xact_user_functions attributes
-- per-family CALLS/SELF TIME without changing the original or candidate.
-- NO production Supabase execution, no private frames/IDs in output.
\set ON_ERROR_STOP on

DO $r70_guard$
BEGIN
 PERFORM public.b08_assert(
  current_database()='world_v2_b10_r05'
  AND current_user='postgres'
  AND current_setting('track_functions')='none'
  AND (SELECT count(*)=91 FROM supabase_migrations.schema_migrations)
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
  'R70-01 isolated source-sealed 8-viewer fixture; function tracking still OFF');
END $r70_guard$;

-- Enable only in the isolated superuser transaction. Restore to 'none'
-- below BEFORE the original R18-57 timings, so the comparison isn't skewed.
SET LOCAL track_functions='all';
CREATE TEMP TABLE r70_function_samples(
 scenario text NOT NULL CHECK(scenario IN ('open','wall-heavy')),
 variant text NOT NULL CHECK(variant IN ('original','fastpath')),
 iteration integer NOT NULL CHECK(iteration BETWEEN 1 AND 2),
 viewer_count integer NOT NULL CHECK(viewer_count=8),
 frame_elapsed_ms double precision NOT NULL CHECK(frame_elapsed_ms>=0),
 ray_calls bigint NOT NULL CHECK(ray_calls>=0),
 ray_self_ms double precision NOT NULL CHECK(ray_self_ms>=0),
 lighting_calls bigint NOT NULL CHECK(lighting_calls>=0),
 lighting_self_ms double precision NOT NULL CHECK(lighting_self_ms>=0),
 PRIMARY KEY(scenario,variant,iteration)
);
DO $r70_measure$
DECLARE
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 cfg record;variant text;person uuid;frame jsonb;iter integer;
 t0 timestamptz;elapsed double precision;viewers integer;
 ray0 bigint;ray1 bigint;lit0 bigint;lit1 bigint;
 ray_ms0 double precision;ray_ms1 double precision;
 lit_ms0 double precision;lit_ms1 double precision;
BEGIN
 PERFORM public.b08_assert(current_setting('track_functions')='all',
  'R70-02 dedicated local function tracking enabled only for profiling');
 FOR iter IN 1..2 LOOP
  FOR cfg IN SELECT label,scene FROM pg_temp.r57_scenes
   WHERE label IN ('open','wall-heavy')
   ORDER BY CASE WHEN iter=1 THEN label
     ELSE CASE WHEN label='open' THEN 'z' ELSE 'a' END END LOOP
   UPDATE public.map_environments SET live=cfg.scene
    WHERE map_id=test_map;
   -- Alternate original/candidate order across repetitions to reduce
   -- warm-cache advantage. No synthetic auth identities are created.
   FOREACH variant IN ARRAY (
    CASE WHEN iter=1 THEN ARRAY['original','fastpath']::text[]
         ELSE ARRAY['fastpath','original']::text[] END)
   LOOP
    SELECT
     coalesce(sum(calls) FILTER(WHERE schemaname='forge_visibility'
       AND funcname='ray_blocked'),0)::bigint,
     coalesce(sum(self_time) FILTER(WHERE schemaname='forge_visibility'
       AND funcname='ray_blocked'),0)::double precision,
     coalesce(sum(calls) FILTER(WHERE schemaname='forge_visibility'
       AND funcname='is_lit'),0)::bigint,
     coalesce(sum(self_time) FILTER(WHERE schemaname='forge_visibility'
       AND funcname='is_lit'),0)::double precision
    INTO ray0,ray_ms0,lit0,lit_ms0
    FROM pg_stat_xact_user_functions;
    viewers:=0;
    t0:=clock_timestamp();
    FOR person IN SELECT user_id FROM public.campaign_members
     WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
       AND role='player'
     ORDER BY user_id LOOP
     IF variant='original' THEN
      frame:=forge_visibility.r57_unmodified_fog_frame(test_map,person);
     ELSE
      frame:=forge_visibility.authorized_viewer_fog_frame(test_map,person);
     END IF;
     PERFORM public.b08_assert(
      jsonb_typeof(frame)='object'
       AND jsonb_typeof(frame->'visible')='array'
       AND jsonb_typeof(frame->'explored')='array',
      'R70-03 original/fastpath generates complete signed per-viewer frame');
     viewers:=viewers+1;
    END LOOP;
    elapsed:=extract(epoch FROM clock_timestamp()-t0)*1000;
    SELECT
     coalesce(sum(calls) FILTER(WHERE schemaname='forge_visibility'
       AND funcname='ray_blocked'),0)::bigint,
     coalesce(sum(self_time) FILTER(WHERE schemaname='forge_visibility'
       AND funcname='ray_blocked'),0)::double precision,
     coalesce(sum(calls) FILTER(WHERE schemaname='forge_visibility'
       AND funcname='is_lit'),0)::bigint,
     coalesce(sum(self_time) FILTER(WHERE schemaname='forge_visibility'
       AND funcname='is_lit'),0)::double precision
    INTO ray1,ray_ms1,lit1,lit_ms1
    FROM pg_stat_xact_user_functions;
    PERFORM public.b08_assert(viewers=8
      AND ray1>=ray0 AND lit1>=lit0
      AND ray_ms1>=ray_ms0 AND lit_ms1>=lit_ms0,
      'R70-04 eight-viewer xact counters are monotonic');
    INSERT INTO pg_temp.r70_function_samples
     VALUES(cfg.label,variant,iter,viewers,elapsed,
      ray1-ray0,greatest(0,ray_ms1-ray_ms0),
      lit1-lit0,greatest(0,lit_ms1-lit_ms0));
   END LOOP;
  END LOOP;
 END LOOP;
 UPDATE public.map_environments SET live=
  '{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
 WHERE map_id=test_map;
 PERFORM public.b08_assert(
  (SELECT count(*)=8 FROM pg_temp.r70_function_samples)
  AND (SELECT min(viewer_count)=8 FROM pg_temp.r70_function_samples)
  AND (SELECT count(DISTINCT (s.scenario,s.variant))=4
       FROM pg_temp.r70_function_samples AS s)
  AND (SELECT live='{"objects":[],"ambient":25,"fog":{"partyShared":false}}'::jsonb
       FROM public.map_environments WHERE map_id=test_map),
  'R70-05 2x2x2 isolated function attribution samples and scene restored');
 RAISE NOTICE 'R18-70 PASS: exact 8-viewer original/fastpath wall/open function call and self-time attribution; source/ACL untouched';
END $r70_measure$;

-- Local instrumented timings are diagnostic ONLY. Built-in tracking adds
-- overhead, so these figures cannot be compared directly to R57's untracked
-- Commit timings or used as hosted Supabase/browser p95 predictions.
SELECT scenario,variant,count(*) AS iterations,
 min(viewer_count) AS viewers_per_iteration,
 round(avg(frame_elapsed_ms)::numeric,3) AS mean_8_frame_elapsed_ms,
 round(avg(ray_calls)::numeric,1) AS mean_ray_calls,
 round(avg(ray_self_ms)::numeric,3) AS mean_ray_self_ms,
 round(avg(lighting_calls)::numeric,1) AS mean_lighting_calls,
 round(avg(lighting_self_ms)::numeric,3) AS mean_lighting_self_ms
FROM pg_temp.r70_function_samples
GROUP BY scenario,variant ORDER BY scenario,variant;

SET LOCAL track_functions='none';
DO $r70_tracking_restored$
BEGIN
 PERFORM public.b08_assert(
  current_setting('track_functions')='none'
  AND (SELECT count(*)=8 FROM pg_temp.r70_function_samples)
  AND (SELECT count(*)=8 FROM public.campaign_members
    WHERE campaign_id='00000000-0000-4000-8000-000000000001'::uuid
    AND role='player'),
  'R70-06 original function tracking and authorized roster restored');
END $r70_tracking_restored$;
