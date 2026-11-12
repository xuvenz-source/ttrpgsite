-- B10-R18-17 PRE-RELEASE SQL CANDIDATE ONLY. NOT A VERSIONED MIGRATION.
-- NEVER apply directly to production. It is for isolated PG17 rehearsal
-- AFTER B10 R05 and audited historical SQL have been established.
--
-- Replaces ONLY identical-signature swept geometry helpers; existing ACLs,
-- callers, triggers, function OIDs and schema/search-path semantics persist.
-- The existing forge_world_v2.step_allowed, B03 path validator, V2 core,
-- legacy direct-write guards and tool movement all call these exact helpers.
-- This stage does not change visibility, LOS, light walls or private ACLs.
-- Replace in new versioned migration ONLY after explicit separate approval.
--
-- SECURITY: a 0.10 GRID-CELL inward clearance to each footprint edge
-- removes accidental shallow outer-band contacts. Swept interior collision
-- still blocks every solid wall crossing. Bounds stay full-sized in callers.
-- Open/broken door and attribute permeability remain caller decisions.
--
-- Source-real PostgreSQL17 tests cover both helpers, V2 step_allowed, and
-- strict post-change security; NOT YET production direct-write trigger tests.
--
CREATE OR REPLACE FUNCTION forge_world_v2.swept_hits_segment(
 x0 double precision,y0 double precision,w double precision,h double precision,
 x1 double precision,y1 double precision,ax double precision,ay double precision,
 bx double precision,by_ double precision)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=''
AS $r18_17_wall$
DECLARE
 -- Clearance is measured in GRID CELL units, not tile occupancy or pixel area.
 -- Clamped for narrow pieces so a token can never lose its whole interior.
 inset_x double precision:=least(0.10,w/4.0);
 inset_y double precision:=least(0.10,h/4.0);
 xs double precision[]:=array[
  x0+inset_x,x0+w-inset_x,x0+w-inset_x,x0+inset_x,
  x1+inset_x,x1+w-inset_x,x1+w-inset_x,x1+inset_x];
 ys double precision[]:=array[
  y0+inset_y,y0+inset_y,y0+h-inset_y,y0+h-inset_y,
  y1+inset_y,y1+inset_y,y1+h-inset_y,y1+h-inset_y];
 axes double precision[][]:=array[
  array[1.0::double precision,0.0::double precision],
  array[0.0::double precision,1.0::double precision],
  array[-(y1-y0),(x1-x0)],
  array[-(by_-ay),(bx-ax)]];
 i integer;j integer;p double precision;q double precision;
 min1 double precision;max1 double precision;
 min2 double precision;max2 double precision;
BEGIN
 -- Always BLOCK malformed footprints. Do not turn NaN/invalid coordinates,
 -- spans or map geometry into a broad allow decision.
 IF x0 IS NULL OR y0 IS NULL OR x1 IS NULL OR y1 IS NULL OR
    ax IS NULL OR ay IS NULL OR bx IS NULL OR by_ IS NULL OR
    w IS NULL OR h IS NULL OR w<=0 OR h<=0 OR w>12 OR h>12 OR
    abs(x0)>100000 OR abs(y0)>100000 OR abs(x1)>100000 OR
    abs(y1)>100000 OR abs(ax)>100000 OR abs(ay)>100000 OR
    abs(bx)>100000 OR abs(by_)>100000
 THEN RETURN true; END IF;
 FOR i IN 1..4 LOOP
  IF abs(axes[i][1])+abs(axes[i][2])<1e-8 THEN CONTINUE;END IF;
  min1:='Infinity'::double precision;max1:='-Infinity'::double precision;
  FOR j IN 1..8 LOOP
   p:=xs[j]*axes[i][1]+ys[j]*axes[i][2];
   min1:=least(min1,p);max1:=greatest(max1,p);
  END LOOP;
  p:=ax*axes[i][1]+ay*axes[i][2];
  q:=bx*axes[i][1]+by_*axes[i][2];
  min2:=least(p,q);max2:=greatest(p,q);
  IF max1<=min2+1e-6 OR max2<=min1+1e-6 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $r18_17_wall$;

CREATE OR REPLACE FUNCTION forge_visibility.swept_hits_segment(
 x0 double precision,y0 double precision,w double precision,h double precision,
 x1 double precision,y1 double precision,ax double precision,ay double precision,
 bx double precision,b_y double precision)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=''
AS $r18_17_wall$
DECLARE
 -- Clearance is measured in GRID CELL units, not tile occupancy or pixel area.
 -- Clamped for narrow pieces so a token can never lose its whole interior.
 inset_x double precision:=least(0.10,w/4.0);
 inset_y double precision:=least(0.10,h/4.0);
 xs double precision[]:=array[
  x0+inset_x,x0+w-inset_x,x0+w-inset_x,x0+inset_x,
  x1+inset_x,x1+w-inset_x,x1+w-inset_x,x1+inset_x];
 ys double precision[]:=array[
  y0+inset_y,y0+inset_y,y0+h-inset_y,y0+h-inset_y,
  y1+inset_y,y1+inset_y,y1+h-inset_y,y1+h-inset_y];
 axes double precision[][]:=array[
  array[1.0::double precision,0.0::double precision],
  array[0.0::double precision,1.0::double precision],
  array[-(y1-y0),(x1-x0)],
  array[-(b_y-ay),(bx-ax)]];
 i integer;j integer;p double precision;q double precision;
 min1 double precision;max1 double precision;
 min2 double precision;max2 double precision;
BEGIN
 -- Always BLOCK malformed footprints. Do not turn NaN/invalid coordinates,
 -- spans or map geometry into a broad allow decision.
 IF x0 IS NULL OR y0 IS NULL OR x1 IS NULL OR y1 IS NULL OR
    ax IS NULL OR ay IS NULL OR bx IS NULL OR b_y IS NULL OR
    w IS NULL OR h IS NULL OR w<=0 OR h<=0 OR w>12 OR h>12 OR
    abs(x0)>100000 OR abs(y0)>100000 OR abs(x1)>100000 OR
    abs(y1)>100000 OR abs(ax)>100000 OR abs(ay)>100000 OR
    abs(bx)>100000 OR abs(b_y)>100000
 THEN RETURN true; END IF;
 FOR i IN 1..4 LOOP
  IF abs(axes[i][1])+abs(axes[i][2])<1e-8 THEN CONTINUE;END IF;
  min1:='Infinity'::double precision;max1:='-Infinity'::double precision;
  FOR j IN 1..8 LOOP
   p:=xs[j]*axes[i][1]+ys[j]*axes[i][2];
   min1:=least(min1,p);max1:=greatest(max1,p);
  END LOOP;
  p:=ax*axes[i][1]+ay*axes[i][2];
  q:=bx*axes[i][1]+b_y*axes[i][2];
  min2:=least(p,q);max2:=greatest(p,q);
  IF max1<=min2+1e-6 OR max2<=min1+1e-6 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $r18_17_wall$;

-- No CREATE FUNCTION overloads, role grants, policy changes, or publications.
