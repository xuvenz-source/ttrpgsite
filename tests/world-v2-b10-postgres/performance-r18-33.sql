-- B10-R18-33: advisory, source-real canonical-movement timings.
-- Disposable PG17 ONLY, invoked from rehearsed guarded R18-22 runner.
-- This test executes actual authenticated fixture Begin/Advance/Commit,
-- blocked wall and 8-step burst, then overlays R26/R27/R28/R30 and repeats.
-- No numeric performance threshold: isolated SQL timing cannot measure
-- browser HTTP RTT, multiplayer LOS, or production tail latency.
-- All candidate DDL, token positions and recorded samples ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE r33_samples(
 variant text NOT NULL, scenario text NOT NULL, iteration int NOT NULL,
 duration_ms double precision NOT NULL CHECK (duration_ms>=0),
 PRIMARY KEY(variant,scenario,iteration));
-- The ordered fixture retains R05 + R18-17/19/20, but not these overlays.
DO $r33_pre$
BEGIN
 PERFORM public.b08_assert(
  to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NULL
  AND (SELECT x=1 AND y=1 FROM public.map_tokens
       WHERE id='00000000-0000-4000-8000-000000000101'::uuid),
  'R33-01 isolated benchmark starts on original non-atomic R05 authority');
END $r33_pre$;
-- Place the same shallow wall used by R18-17, R18-28 and R18-30.
-- x3 is permitted (5% outer-edge overlap); x4 is solidly blocked.
UPDATE public.map_environments SET
 live='{"objects":[{"type":"wall","points":[{"x":3.95,"y":0},{"x":3.95,"y":16}],"blocksMovement":true}]}'::jsonb
WHERE map_id='00000000-0000-4000-8000-000000000021'::uuid;
DO $r33_baseline$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 pieces jsonb:=jsonb_build_array(jsonb_build_object('kind','token','id',token));
 sid uuid;a jsonb;r jsonb;from_pt jsonb;to_pt jsonb;
 started timestamptz;i integer;j integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 FOR i IN 1..6 LOOP
  -- Accepted near-wall route, measured with Begin and terminal request(s).
  started:=clock_timestamp();
  a:=public.begin_world_motion_v2(test_map,pieces,'{"x":1,"y":1}'::jsonb,
   'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  PERFORM public.b08_assert(sid IS NOT NULL,'R33 valid actor-owned Begin');
  r:=public.advance_world_motion_v2(sid,1,'{"x":1,"y":1}'::jsonb,
    '[{"x":3,"y":1}]'::jsonb,1,1);
   PERFORM public.b08_assert(r->'accepted'='[{"x":2,"y":1},{"x":3,"y":1}]'::jsonb
    AND r->'blocked'='false'::jsonb,'R33 baseline accepted route');
   r:=public.commit_world_motion_v2(sid,2,'{"x":3,"y":1}'::jsonb,1,1);
   PERFORM public.b08_assert(r->'endpoint'='{"x":3,"y":1}'::jsonb,
    'R33 baseline canonical Commit');
  PERFORM public.b08_assert(
   (SELECT x=3 AND y=1 FROM public.map_tokens WHERE id=token),
   'R33 actual authorized token position becomes x3');
  INSERT INTO pg_temp.r33_samples VALUES
   ('baseline','approved-near-wall',i,
    extract(epoch FROM clock_timestamp()-started)*1000);

  -- Immediate solid wall: no canonical movement and no unapproved cell.
  started:=clock_timestamp();
  a:=public.begin_world_motion_v2(test_map,pieces,'{"x":3,"y":1}'::jsonb,
   'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  PERFORM public.b08_assert(sid IS NOT NULL,'R33 blocked Begin');
  r:=public.advance_world_motion_v2(sid,1,'{"x":3,"y":1}'::jsonb,
    '[{"x":4,"y":1}]'::jsonb,1,1);
   PERFORM public.b08_assert(r->'blocked'='true'::jsonb
    AND r->'accepted'='[]'::jsonb,'R33 baseline wall rejects first crossing');
   PERFORM public.cancel_world_motion_v2(sid);
  PERFORM public.b08_assert(
   (SELECT x=3 AND y=1 FROM public.map_tokens WHERE id=token),
   'R33 wall never moves token into x4');
  INSERT INTO pg_temp.r33_samples VALUES
   ('baseline','blocked-first-step',i,
    extract(epoch FROM clock_timestamp()-started)*1000);

  -- Real authenticated return, not a privileged fixture-only UPDATE.
  started:=clock_timestamp();
  a:=public.begin_world_motion_v2(test_map,pieces,'{"x":3,"y":1}'::jsonb,
   'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  PERFORM public.b08_assert(sid IS NOT NULL,'R33 reverse Begin');
  r:=public.advance_world_motion_v2(sid,1,'{"x":3,"y":1}'::jsonb,
    '[{"x":1,"y":1}]'::jsonb,1,1);
   PERFORM public.b08_assert(r->'accepted'='[{"x":2,"y":1},{"x":1,"y":1}]'::jsonb,
    'R33 baseline reverse accepted');
   r:=public.commit_world_motion_v2(sid,2,'{"x":1,"y":1}'::jsonb,1,1);
   PERFORM public.b08_assert(r->'endpoint'='{"x":1,"y":1}'::jsonb,
    'R33 baseline reverse committed');
  PERFORM public.b08_assert(
   (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
   'R33 real authorized reverse restores x1');
  INSERT INTO pg_temp.r33_samples VALUES
   ('baseline','reversal',i,
    extract(epoch FROM clock_timestamp()-started)*1000);

  -- Eight consecutive approved batches inside ONE session, ending at the
  -- exact starting cell. Source-real Commit still rechecks all eight legs.
  started:=clock_timestamp();
  a:=public.begin_world_motion_v2(test_map,pieces,'{"x":1,"y":1}'::jsonb,
   'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  PERFORM public.b08_assert(sid IS NOT NULL,'R33 sustained Begin');
  FOR j IN 1..8 LOOP
   IF mod(j,2)=1 THEN
    from_pt:='{"x":1,"y":1}'::jsonb;
    to_pt:='{"x":2,"y":1}'::jsonb;
   ELSE
    from_pt:='{"x":2,"y":1}'::jsonb;
    to_pt:='{"x":1,"y":1}'::jsonb;
   END IF;
   r:=public.advance_world_motion_v2(sid,j,from_pt,
     jsonb_build_array(to_pt),1,1);
   PERFORM public.b08_assert(r->'accepted'=jsonb_build_array(to_pt)
    AND r->'blocked'='false'::jsonb,
    'R33 each sustained crossing is signed and approved');
  END LOOP;
  r:=public.commit_world_motion_v2(sid,9,'{"x":1,"y":1}'::jsonb,1,1);
   PERFORM public.b08_assert(r->'endpoint'='{"x":1,"y":1}'::jsonb,
    'R33 baseline 8-step canonical Commit');
  PERFORM public.b08_assert(
   (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
   'R33 sustained route has exact canonical endpoint');
  INSERT INTO pg_temp.r33_samples VALUES
   ('baseline','eight-advance-burst',i,
    extract(epoch FROM clock_timestamp()-started)*1000);
 END LOOP;
END $r33_baseline$;

-- All candidates are overlaid only inside this disposable transaction.
\i supabase/candidates/world_v2_r18_26_step_bbox_prefilter.sql
\i supabase/candidates/world_v2_r18_27_commit_empty_work.sql
\i supabase/candidates/world_v2_r18_28_atomic_finalize.sql
\i supabase/candidates/world_v2_r18_30_blocked_final_semantics.sql
DO $r33_staged$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000011';
 test_map uuid:='00000000-0000-4000-8000-000000000021';
 token uuid:='00000000-0000-4000-8000-000000000101';
 pieces jsonb:=jsonb_build_array(jsonb_build_object('kind','token','id',token));
 sid uuid;a jsonb;r jsonb;from_pt jsonb;to_pt jsonb;
 started timestamptz;i integer;j integer;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 FOR i IN 1..6 LOOP
  -- Accepted near-wall route, measured with Begin and terminal request(s).
  started:=clock_timestamp();
  a:=public.begin_world_motion_v2(test_map,pieces,'{"x":1,"y":1}'::jsonb,
   'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  PERFORM public.b08_assert(sid IS NOT NULL,'R33 valid actor-owned Begin');
  r:=public.finalize_world_motion_v2(sid,1,'{"x":1,"y":1}'::jsonb,
    '[{"x":3,"y":1}]'::jsonb,1,1);
   PERFORM public.b08_assert(r->>'finalized'='true' AND
    r->'accepted'='[{"x":2,"y":1},{"x":3,"y":1}]'::jsonb
    AND r->'endpoint'='{"x":3,"y":1}'::jsonb,
    'R33 staged approved path signed canonical');
  PERFORM public.b08_assert(
   (SELECT x=3 AND y=1 FROM public.map_tokens WHERE id=token),
   'R33 actual authorized token position becomes x3');
  INSERT INTO pg_temp.r33_samples VALUES
   ('staged','approved-near-wall',i,
    extract(epoch FROM clock_timestamp()-started)*1000);

  -- Immediate solid wall: no canonical movement and no unapproved cell.
  started:=clock_timestamp();
  a:=public.begin_world_motion_v2(test_map,pieces,'{"x":3,"y":1}'::jsonb,
   'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  PERFORM public.b08_assert(sid IS NOT NULL,'R33 blocked Begin');
  r:=public.finalize_world_motion_v2(sid,1,'{"x":3,"y":1}'::jsonb,
    '[{"x":4,"y":1}]'::jsonb,1,1);
   PERFORM public.b08_assert(r->'blocked'='true'::jsonb
    AND r->'noMotion'='true'::jsonb
    AND r->'accepted'='[]'::jsonb
    AND r->'endpoint'='{"x":3,"y":1}'::jsonb,
    'R33 staged wall blocked with zero canonical motion');
  PERFORM public.b08_assert(
   (SELECT x=3 AND y=1 FROM public.map_tokens WHERE id=token),
   'R33 wall never moves token into x4');
  INSERT INTO pg_temp.r33_samples VALUES
   ('staged','blocked-first-step',i,
    extract(epoch FROM clock_timestamp()-started)*1000);

  -- Real authenticated return, not a privileged fixture-only UPDATE.
  started:=clock_timestamp();
  a:=public.begin_world_motion_v2(test_map,pieces,'{"x":3,"y":1}'::jsonb,
   'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  PERFORM public.b08_assert(sid IS NOT NULL,'R33 reverse Begin');
  r:=public.finalize_world_motion_v2(sid,1,'{"x":3,"y":1}'::jsonb,
    '[{"x":1,"y":1}]'::jsonb,1,1);
   PERFORM public.b08_assert(r->'endpoint'='{"x":1,"y":1}'::jsonb
    AND r->>'finalized'='true','R33 staged canonical reversal');
  PERFORM public.b08_assert(
   (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
   'R33 real authorized reverse restores x1');
  INSERT INTO pg_temp.r33_samples VALUES
   ('staged','reversal',i,
    extract(epoch FROM clock_timestamp()-started)*1000);

  -- Eight consecutive approved batches inside ONE session, ending at the
  -- exact starting cell. Source-real Commit still rechecks all eight legs.
  started:=clock_timestamp();
  a:=public.begin_world_motion_v2(test_map,pieces,'{"x":1,"y":1}'::jsonb,
   'drag',1,1,false);
  sid:=(a->>'sessionId')::uuid;
  PERFORM public.b08_assert(sid IS NOT NULL,'R33 sustained Begin');
  FOR j IN 1..8 LOOP
   IF mod(j,2)=1 THEN
    from_pt:='{"x":1,"y":1}'::jsonb;
    to_pt:='{"x":2,"y":1}'::jsonb;
   ELSE
    from_pt:='{"x":2,"y":1}'::jsonb;
    to_pt:='{"x":1,"y":1}'::jsonb;
   END IF;
   IF j=8 THEN
      r:=public.finalize_world_motion_v2(sid,j,from_pt,
       jsonb_build_array(to_pt),1,1);
      PERFORM public.b08_assert(r->>'finalized'='true'
       AND r->'endpoint'='{"x":1,"y":1}'::jsonb,
       'R33 staged last burst step atomically committed');
     ELSE
      r:=public.advance_world_motion_v2(sid,j,from_pt,
       jsonb_build_array(to_pt),1,1);
     END IF;
   PERFORM public.b08_assert(r->'accepted'=jsonb_build_array(to_pt)
    AND r->'blocked'='false'::jsonb,
    'R33 each sustained crossing is signed and approved');
  END LOOP;
  
  PERFORM public.b08_assert(
   (SELECT x=1 AND y=1 FROM public.map_tokens WHERE id=token),
   'R33 sustained route has exact canonical endpoint');
  INSERT INTO pg_temp.r33_samples VALUES
   ('staged','eight-advance-burst',i,
    extract(epoch FROM clock_timestamp()-started)*1000);
 END LOOP;
END $r33_staged$;
-- Advisory only: do not interpret local SQL calls as HTTP round trips,
-- or fail CI based on noisy speed ratios. Every variant has six repetitions.
SELECT variant,scenario,count(*) AS samples,
 round(avg(duration_ms)::numeric,2) AS mean_ms,
 round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)::numeric,2) AS p50_ms,
 round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric,2) AS p95_ms,
 round(max(duration_ms)::numeric,2) AS worst_ms
FROM pg_temp.r33_samples
GROUP BY variant,scenario ORDER BY scenario,variant;
DO $r33_terminal$
BEGIN
 PERFORM public.b08_assert(
  (SELECT count(*)=48 FROM pg_temp.r33_samples)
  AND (SELECT x=1 AND y=1 FROM public.map_tokens
       WHERE id='00000000-0000-4000-8000-000000000101'::uuid)
  AND NOT has_function_privilege('anon',
   'public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)',
   'EXECUTE')
  AND NOT has_schema_privilege('authenticated','forge_world_v2','USAGE'),
  'R33 all 48 samples, canonical endpoints and private RPC protections intact');
END $r33_terminal$;
ROLLBACK;
DO $r33_rollback$
BEGIN
 PERFORM public.b08_assert(
  to_regprocedure('public.finalize_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NULL
  AND to_regclass('pg_temp.r33_samples') IS NULL
  AND (SELECT x=1 AND y=1 FROM public.map_tokens
       WHERE id='00000000-0000-4000-8000-000000000101'::uuid)
  AND (SELECT count(*)=0 FROM forge_world_v2.motion_sessions),
  'R33 candidate RPC, receipt fields, private timings and all data rolled back');
 RAISE NOTICE 'R18-33 PASS: source-real baseline and staged 4-scenario comparison (48 samples), no performance claim or production DB write';
END $r33_rollback$;
