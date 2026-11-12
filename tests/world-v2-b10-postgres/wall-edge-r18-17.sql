-- B10-R18-17 source-real PostgreSQL17 clearance parity, disposable ONLY.
-- Called from B10 isolated run.sh after R05-compatible B03/R01/R03.
-- DDL and all tests rollback; never run on live Supabase.
BEGIN;
\i supabase/candidates/world_v2_r18_17_wall_edge_clearance.sql

DO $r18_17_test$
DECLARE
 scene jsonb;
 segment_template jsonb:='{"type":"wall","points":[{"x":1.95,"y":0},{"x":1.95,"y":1}],"blocksMovement":true}'::jsonb;
BEGIN
 PERFORM public.b08_assert(
  NOT forge_world_v2.swept_hits_segment(0,0,1,1,1,0,1.95,0,1.95,1)
  AND NOT forge_visibility.swept_hits_segment(0,0,1,1,1,0,1.95,0,1.95,1),
  'E01 shallow 5-percent far-edge overlap permits an entire legal 1-step sweep in both engines');
 PERFORM public.b08_assert(
  forge_world_v2.swept_hits_segment(0,0,1,1,1,0,1.8,0,1.8,1)
  AND forge_visibility.swept_hits_segment(0,0,1,1,1,0,1.8,0,1.8,1),
  'E02 20-percent far-edge overlap is still blocked by both engines');
 PERFORM public.b08_assert(
  forge_world_v2.swept_hits_segment(0,0,1,1,1,0,1.05,0,1.05,1)
  AND forge_visibility.swept_hits_segment(0,0,1,1,1,0,1.05,0,1.05,1),
  'E03 actual wall crossing at near edge remains blocked by both engines');
 PERFORM public.b08_assert(
  NOT forge_world_v2.swept_hits_segment(0,0,1,1,1,0,2,0,2,1)
  AND NOT forge_visibility.swept_hits_segment(0,0,1,1,1,0,2,0,2,1),
  'E04 boundary-only contact is still legal');
 PERFORM public.b08_assert(
  forge_world_v2.swept_hits_segment(0,0,1,1,3,0,1.95,0,1.95,1)
  AND forge_visibility.swept_hits_segment(0,0,1,1,3,0,1.95,0,1.95,1),
  'E05 high-speed multi-cell sweep cannot tunnel through thin wall');
 PERFORM public.b08_assert(
  forge_world_v2.swept_hits_segment(0,0,1,1,1,1,1.5,0,1.5,2)
  AND forge_visibility.swept_hits_segment(0,0,1,1,1,1,1.5,0,1.5,2),
  'E06 diagonal corner crossing remains blocked');
 PERFORM public.b08_assert(
  NOT forge_world_v2.swept_hits_segment(0,0,2,2,1,0,2.95,0,2.95,2)
  AND NOT forge_visibility.swept_hits_segment(0,0,2,2,1,0,2.95,0,2.95,2)
  AND forge_world_v2.swept_hits_segment(0,0,2,2,1,0,2.75,0,2.75,2),
  'E07 fixed grid-unit margin handles large token without 10% of entire 2x2 area');
 PERFORM public.b08_assert(
  forge_world_v2.swept_hits_segment(0,0,-1,1,1,0,1.95,0,1.95,1)
  AND forge_visibility.swept_hits_segment(0,0,0,1,1,0,1.95,0,1.95,1),
  'E08 malformed footprints fail closed');
 scene:=jsonb_build_object('objects',jsonb_build_array(segment_template));
 PERFORM public.b08_assert(
  forge_world_v2.step_allowed(scene,'{}'::jsonb,0,0,1,0,1,1,10,10,true),
  'E09 V2 authoritative step_allowed now accepts the shallow 5-percent outer band');
 scene:=jsonb_build_object('objects',jsonb_build_array(
  jsonb_set(segment_template,'{points}',
   '[{"x":1.8,"y":0},{"x":1.8,"y":1}]'::jsonb)));
 PERFORM public.b08_assert(
  NOT forge_world_v2.step_allowed(scene,'{}'::jsonb,0,0,1,0,1,1,10,10,true),
  'E10 V2 authoritative step_allowed rejects deeper solid intersection');
 scene:=jsonb_build_object('objects',jsonb_build_array(
  jsonb_set(segment_template,'{points}',
   '[{"x":1.05,"y":0},{"x":1.05,"y":1}]'::jsonb)));
 PERFORM public.b08_assert(
  NOT forge_world_v2.step_allowed(scene,'{}'::jsonb,0,0,1,0,1,1,10,10,true),
  'E11 V2 authoritative step_allowed refuses true crossing');
 -- Door state and conditional numeric permeability remain BEFORE geometry.
 scene:=jsonb_build_object('objects',jsonb_build_array(
  jsonb_set(jsonb_set(segment_template,'{type}','"door"'::jsonb),
   '{state}','"open"'::jsonb)));
 PERFORM public.b08_assert(
  forge_world_v2.step_allowed(scene,'{}'::jsonb,0,0,3,0,1,1,10,10,true),
  'E12 signed published open door remains passable');
 PERFORM public.b08_assert(
  NOT has_schema_privilege('anon','forge_world_v2','USAGE')
  AND NOT has_schema_privilege('authenticated','forge_world_v2','USAGE'),
  'E13 private V2 geometry helper schema stays inaccessible to untrusted roles');
 PERFORM public.b08_assert(
  (SELECT p.provolatile='i' AND p.prosecdef=false
    FROM pg_proc p WHERE p.oid=
   'forge_world_v2.swept_hits_segment(double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision)'::regprocedure),
  'E14 V2 primitive remains immutable and invoker-security');
 RAISE NOTICE 'B10-R18-17 candidate geometry parity tests PASSED in rolled-back isolation';
END $r18_17_test$;
ROLLBACK;
