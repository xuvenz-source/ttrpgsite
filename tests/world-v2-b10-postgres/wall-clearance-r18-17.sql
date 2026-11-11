-- B10-R18-17: disposable PG17 ONLY, sourced original World V2 helper
-- is present from B04 extraction. The direct-write swept helper below is
-- copied from staging/sql-candidates/fog_collision_authoritative_release.sql.
-- Everything in THIS FILE rolls back: no candidate SQL persists.
BEGIN;

CREATE OR REPLACE FUNCTION forge_visibility.swept_hits_segment(
 x0 double precision,y0 double precision,w double precision,h double precision,
 x1 double precision,y1 double precision,
 ax double precision,ay double precision,bx double precision,b_y double precision)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $original$
DECLARE
 xs double precision[]:=array[x0,x0+w,x0+w,x0,x1,x1+w,x1+w,x1];
 ys double precision[]:=array[y0,y0,y0+h,y0+h,y1,y1,y1+h,y1+h];
 axes double precision[][]:=array[
  array[1.0::double precision,0.0::double precision],
  array[0.0::double precision,1.0::double precision],
  array[-(y1-y0),(x1-x0)],
  array[-(b_y-ay),(bx-ax)]];
 i int;j int;p double precision;q double precision;
 min1 double precision;max1 double precision;min2 double precision;max2 double precision;
BEGIN
 FOR i IN 1..4 LOOP
  IF abs(axes[i][1])+abs(axes[i][2])<0.0000001 THEN CONTINUE;END IF;
  min1:='Infinity'::double precision;max1:='-Infinity'::double precision;
  FOR j IN 1..8 LOOP
   p:=xs[j]*axes[i][1]+ys[j]*axes[i][2];
   min1:=least(min1,p);max1:=greatest(max1,p);
  END LOOP;
  p:=ax*axes[i][1]+ay*axes[i][2];
  q:=bx*axes[i][1]+b_y*axes[i][2];
  min2:=least(p,q);max2:=greatest(p,q);
  IF max1<=min2+0.000001 OR max2<=min1+0.000001 THEN RETURN false;END IF;
 END LOOP;
 RETURN true;
END $original$;

-- Before/after ACL check: candidate must not grant any extra execution.
CREATE TEMP TABLE r18_17_acl_before ON COMMIT DROP AS
SELECT n.nspname AS schema,p.proacl AS acl,p.prosecdef AS security_definer,
 p.provolatile AS volatility,p.proparallel AS parallel,
 pg_get_functiondef(p.oid) AS body
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('forge_world_v2','forge_visibility')
 AND p.proname='swept_hits_segment';
DO $baseline$
DECLARE wall_5 boolean;
BEGIN
 IF (SELECT count(*) FROM r18_17_acl_before)<>2
 THEN RAISE EXCEPTION 'Missing original predicates';END IF;
 wall_5:=forge_world_v2.swept_hits_segment(
  0,0,1,1,1,0,1.95,0,1.95,1);
 IF wall_5 IS DISTINCT FROM true OR
    forge_visibility.swept_hits_segment(
     0,0,1,1,1,0,1.95,0,1.95,1) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Strict baseline unexpectedly has wall clearance';END IF;
END $baseline$;

-- The actual, staged, uninstalled SQL candidate.
\i supabase/candidates/world_v2_r18_17_wall_clearance_parity.sql

DO $parity$
DECLARE
 a boolean;b boolean;
 v numeric[]:=ARRAY[1.95,1.8,1.05,2.0,1.5];
 i integer;
 expected boolean[]:=ARRAY[false,true,true,false,true];
 strict_orig jsonb:=jsonb_build_object(
  'objects',jsonb_build_array(jsonb_build_object(
   'type','wall','blocksMovement',true,
   'points',jsonb_build_array(
    jsonb_build_object('x',1.95,'y',0),
    jsonb_build_object('x',1.95,'y',1)))));
BEGIN
 IF EXISTS(
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   JOIN r18_17_acl_before old ON old.schema=n.nspname
  WHERE p.proname='swept_hits_segment' AND
   (p.proacl IS DISTINCT FROM old.acl OR
    p.prosecdef IS DISTINCT FROM old.security_definer OR
    p.provolatile IS DISTINCT FROM old.volatility OR
    p.proparallel IS DISTINCT FROM old.parallel OR
    p.prosecdef IS DISTINCT FROM false)
 ) THEN RAISE EXCEPTION 'Geometry candidate changed routine ACL or privilege attributes';END IF;
 FOR i IN 1..array_length(v,1) LOOP
  a:=forge_world_v2.swept_hits_segment(
   0,0,1,1,1,0,v[i]::double precision,0,v[i]::double precision,1);
  b:=forge_visibility.swept_hits_segment(
   0,0,1,1,1,0,v[i]::double precision,0,v[i]::double precision,1);
  IF a IS DISTINCT FROM expected[i] OR b IS DISTINCT FROM expected[i]
  THEN RAISE EXCEPTION 'R18-17 wall mismatch at x=%; v2=% direct=% expected=%',
   v[i],a,b,expected[i];END IF;
 END LOOP;
 IF forge_world_v2.step_allowed(
  strict_orig,'{}',0,0,1,0,1,1,10,10,true) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Actual V2 step_allowed did not accept shallow far-edge graze';END IF;
 -- The same attempted destination with >10% intrusion remains blocked.
 strict_orig:=jsonb_set(strict_orig,'{objects,0,points}',
  '[{"x":1.8,"y":0},{"x":1.8,"y":1}]');
 IF forge_world_v2.step_allowed(
  strict_orig,'{}',0,0,1,0,1,1,10,10,true) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'V2 permitted deep wall intrusion';END IF;
 -- A real interior crossing and fast repeated multi-cell move stay blocked.
 IF forge_world_v2.swept_hits_segment(
  0,0,1,1,8,0,2.5,0,2.5,10) IS DISTINCT FROM true OR
  forge_visibility.swept_hits_segment(
  0,0,1,1,8,0,2.5,0,2.5,10) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'High-speed wall tunnelling detected';END IF;
 -- Zero/negative/malformed dimensions must BLOCK rather than allow.
 IF forge_world_v2.swept_hits_segment(
  0,0,0,1,1,0,1.5,0,1.5,1) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Invalid footprint incorrectly passes geometry';END IF;
 -- Direct-write and V2 use the same trusted wall_passes (untouched here).
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n
  ON n.oid=p.pronamespace WHERE n.nspname IN
   ('forge_world_v2','forge_visibility') AND
   p.proname='swept_hits_segment')<>2
 THEN RAISE EXCEPTION 'Geometry candidate added unexpected overloads';END IF;
END $parity$;

ROLLBACK;
-- Original core function is source restored by PostgreSQL rollback.
DO $restored$
BEGIN
 IF forge_world_v2.swept_hits_segment(
  0,0,1,1,1,0,1.95,0,1.95,1) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Candidate left strict V2 geometry changed after rollback';END IF;
 IF to_regprocedure('forge_visibility.swept_hits_segment(double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision)') IS NOT NULL
 THEN RAISE EXCEPTION 'Test-only direct-write fixture escaped rollback';END IF;
END $restored$;
SELECT 'R18-17-collision-parity-staged-SQL-rolled-back' AS result;
