-- B10-R18-26. DISPOSABLE postgres:17 ONLY, after ordered R05 + R18-17/19/20.
-- Exact live-original step_allowed is copied by pg_get_functiondef into a
-- parallel private reference function; the candidate is tested in one
-- transaction and ROLLED BACK. Never invoked on connected Supabase.
\set ON_ERROR_STOP on
BEGIN;
DO $r26_initial$
DECLARE original regprocedure:=
 'forge_world_v2.step_allowed(jsonb,jsonb,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer,boolean)'::regprocedure;
BEGIN
 PERFORM public.b08_assert(
  md5(pg_get_functiondef(original))='6dcd75ce4719cd0bf6173f77f75fdf32',
  'R26-01 exact original LIVE step_allowed source is unchanged in ordered PG17 fixture');
END $r26_initial$;

-- Freeze the unmodified source in an independent internal name BEFORE the
-- candidate replaces it. This is not a permissive shim.
SELECT replace(pg_get_functiondef(
 'forge_world_v2.step_allowed(jsonb,jsonb,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer,boolean)'::regprocedure),
 'FUNCTION forge_world_v2.step_allowed(',
 'FUNCTION forge_world_v2.step_allowed_reference_r18_26(') AS source
\gexec
\i supabase/candidates/world_v2_r18_26_step_bbox_prefilter.sql

DO $r26_parity$
DECLARE
 empty_scene jsonb:='{"objects":[]}'::jsonb;
 far_scene jsonb;
 crossing jsonb:='{"objects":[{"type":"wall","blocksMovement":true,"points":[{"x":2.5,"y":0},{"x":2.5,"y":30}]}]}'::jsonb;
 shallow jsonb:='{"objects":[{"type":"wall","blocksMovement":true,"points":[{"x":2.95,"y":0},{"x":2.95,"y":30}]}]}'::jsonb;
 deep jsonb:='{"objects":[{"type":"wall","blocksMovement":true,"points":[{"x":2.8,"y":0},{"x":2.8,"y":30}]}]}'::jsonb;
 open_door jsonb:='{"objects":[{"type":"door","state":"open","blocksMovement":true,"points":[{"x":2.5,"y":0},{"x":2.5,"y":30}]}]}'::jsonb;
 shut_door jsonb:='{"objects":[{"type":"door","state":"closed","blocksMovement":true,"points":[{"x":2.5,"y":0},{"x":2.5,"y":30}]}]}'::jsonb;
 special_wall jsonb:='{"objects":[{"type":"wall","blocksMovement":true,"attributeField":"STR","movementAt":14,"points":[{"x":2.5,"y":0},{"x":2.5,"y":30}]}]}'::jsonb;
 malformed jsonb:='{"objects":[{"type":"wall","blocksMovement":true,"points":[{"x":"invalid","y":1},{"x":2,"y":2}]}]}'::jsonb;
 invalid_count jsonb:='{"objects":[{"type":"wall","blocksMovement":true,"points":[{"x":4,"y":4}]}]}'::jsonb;
 terrains jsonb[]; terrain jsonb;
 i integer;j integer;dx integer;dy integer;width integer;checked integer:=0;
 reference_result boolean;candidate_result boolean;
 exception_before text;exception_after text;
 start_time timestamptz;original_ms numeric;candidate_ms numeric;
 elapsed interval;
BEGIN
 SELECT jsonb_build_object('objects',jsonb_agg(
  jsonb_build_object('type','wall','blocksMovement',true,
   'points',jsonb_build_array(
    jsonb_build_object('x',60+n,'y',0),
    jsonb_build_object('x',60+n,'y',30)))))
 INTO far_scene FROM generate_series(1,100) AS n;
 terrains:=ARRAY[empty_scene,far_scene,crossing,shallow,deep,
  open_door,shut_door,special_wall,invalid_count];
 -- Every valid test compares TRUE/FALSE/NULL of the installed source and
 -- candidate for the same scene and full sweep.
 FOREACH terrain IN ARRAY terrains LOOP
  FOR i IN 1..5 LOOP
   FOR j IN 1..4 LOOP
    FOR dx IN -1..1 LOOP
     FOR dy IN -1..1 LOOP
      FOREACH width IN ARRAY ARRAY[1,2,4] LOOP
       reference_result:=forge_world_v2.step_allowed_reference_r18_26(
        terrain,'{"STR":15}'::jsonb,i::float8,j::float8,
        (i+dx)::float8,(j+dy)::float8,
        width::float8,width::float8,40,40,true);
       candidate_result:=forge_world_v2.step_allowed(
        terrain,'{"STR":15}'::jsonb,i::float8,j::float8,
        (i+dx)::float8,(j+dy)::float8,
        width::float8,width::float8,40,40,true);
       IF reference_result IS DISTINCT FROM candidate_result THEN
        RAISE EXCEPTION 'R26-02 geometry parity mismatch at %/% (%/%, %/% width %)',
         array_position(terrains,terrain),checked,i,j,dx,dy,width;
       END IF;
       checked:=checked+1;
      END LOOP;
     END LOOP;
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
 PERFORM public.b08_assert(checked=4860,
  'R26-02 original and bounded prefilter agree on 4860 deterministic wall/door/span/edge/corner/movement cases');
 PERFORM public.b08_assert(
  forge_world_v2.step_allowed(empty_scene,'{}',1,1,2,1,1,1,40,40,true)
  AND NOT forge_world_v2.step_allowed(crossing,'{}',1,1,2,1,1,1,40,40,true),
  'R26-03 clear ground stays walkable and centered solid wall stays blocked');
 PERFORM public.b08_assert(
  forge_world_v2.step_allowed(shallow,'{}',1,1,2,1,1,1,40,40,true)
  AND NOT forge_world_v2.step_allowed(deep,'{}',1,1,2,1,1,1,40,40,true),
  'R26-04 R18-17 0.10-cell shallow clearance retained; deeper wall remains solid');
 PERFORM public.b08_assert(
  forge_world_v2.step_allowed(open_door,'{}',1,1,2,1,1,1,40,40,true)
  AND NOT forge_world_v2.step_allowed(shut_door,'{}',1,1,2,1,1,1,40,40,true),
  'R26-05 open/closed portal rules unchanged');
 PERFORM public.b08_assert(
  forge_world_v2.step_allowed(special_wall,'{"STR":15}',1,1,2,1,1,1,40,40,true)
  AND NOT forge_world_v2.step_allowed(special_wall,'{"STR":12}',1,1,2,1,1,1,40,40,true),
  'R26-06 character attribute wall permissions unchanged');
 PERFORM public.b08_assert(
  NOT forge_world_v2.step_allowed(empty_scene,'{}',0,0,39,39,2,2,40,40,true)
  AND NOT forge_world_v2.step_allowed(empty_scene,'{}',1,1,2,1,0,1,40,40,false),
  'R26-07 bounds and malformed footprints remain fail closed even when collision disabled');
 PERFORM public.b08_assert(
  forge_world_v2.step_allowed(invalid_count,'{}',1,1,2,1,1,1,40,40,true)
    IS NOT DISTINCT FROM
   forge_world_v2.step_allowed_reference_r18_26(
    invalid_count,'{}',1,1,2,1,1,1,40,40,true),
  'R26-08 invalid barrier-point cardinality retains exact original result');
 -- Malformed segment coordinate: BOTH functions must throw the same SQLSTATE.
 exception_before:=null;exception_after:=null;
 BEGIN
  PERFORM forge_world_v2.step_allowed_reference_r18_26(
   malformed,'{}',1,1,2,1,1,1,40,40,true);
 EXCEPTION WHEN OTHERS THEN exception_before:=SQLSTATE;END;
 BEGIN
  PERFORM forge_world_v2.step_allowed(
   malformed,'{}',1,1,2,1,1,1,40,40,true);
 EXCEPTION WHEN OTHERS THEN exception_after:=SQLSTATE;END;
 PERFORM public.b08_assert(exception_before='22P02' AND
  exception_after=exception_before,
  'R26-09 malformed wall-coordinate exception is never hidden by AABB');
 PERFORM public.b08_assert(
  forge_world_v2.step_allowed_reference_r18_26(
   far_scene,'{}',1,1,2,1,1,1,40,40,false)
  IS NOT DISTINCT FROM forge_world_v2.step_allowed(
   far_scene,'{}',1,1,2,1,1,1,40,40,false),
  'R26-10 no-collision flag semantics unchanged');
 PERFORM public.b08_assert(
  NOT has_schema_privilege('anon','forge_world_v2','USAGE') AND
  NOT has_schema_privilege('authenticated','forge_world_v2','USAGE') AND
  NOT has_function_privilege('anon',
   'forge_world_v2.step_allowed(jsonb,jsonb,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer,boolean)',
   'EXECUTE') AND
  NOT has_function_privilege('authenticated',
   'forge_world_v2.step_allowed(jsonb,jsonb,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer,boolean)',
   'EXECUTE'),
  'R26-11 private schema and function ACL remain closed to direct clients');
 -- BENCHMARK IS INFORMATIONAL. CI host noise and simplified PG fixture
 -- prevent claiming a verified production improvement from these timings.
 start_time:=clock_timestamp();
 FOR i IN 1..40 LOOP
  PERFORM forge_world_v2.step_allowed_reference_r18_26(
   far_scene,'{}',1,1,2,1,1,1,40,40,true);
 END LOOP;
 elapsed:=clock_timestamp()-start_time;
 original_ms:=round((extract(epoch from elapsed)*1000)::numeric,2);
 start_time:=clock_timestamp();
 FOR i IN 1..40 LOOP
  PERFORM forge_world_v2.step_allowed(
   far_scene,'{}',1,1,2,1,1,1,40,40,true);
 END LOOP;
 elapsed:=clock_timestamp()-start_time;
 candidate_ms:=round((extract(epoch from elapsed)*1000)::numeric,2);
 RAISE NOTICE 'R26-12 isolated 40-call 100-remote-barrier baseline=%ms prefilter=%ms (advisory only)',
  original_ms,candidate_ms;
END $r26_parity$;
ROLLBACK;
-- The installed R18-22 stack is untouched after the comparison transaction.
DO $r26_end$
BEGIN
 PERFORM public.b08_assert(
  to_regprocedure(
   'forge_world_v2.step_allowed_reference_r18_26(jsonb,jsonb,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer,boolean)') IS NULL AND
  md5(pg_get_functiondef(
   'forge_world_v2.step_allowed(jsonb,jsonb,double precision,double precision,double precision,double precision,double precision,double precision,integer,integer,boolean)'::regprocedure))
    ='6dcd75ce4719cd0bf6173f77f75fdf32',
  'R26-13 candidate and reference both ROLLED BACK; original ordered-stack source untouched');
 RAISE NOTICE 'R18-26: 13 gates PASS including 4860 baseline parity cases; performance result remains advisory';
END $r26_end$;
