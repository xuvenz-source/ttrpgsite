-- B10-R18-17 candidate ONLY. NOT a versioned Supabase migration and
-- NEVER applied to production without a separate explicit SQL authorization.
-- Install AFTER frozen R05 (20261111023204) and before enabling client
-- VITE_WORLD_V2_WALL_CLEARANCE=1. Never edit R05's frozen SQL body.
--
-- The two pre-existing function signatures are preserved. Thus EVERY
-- caller (World V2 Step Allowed, archived trajectory, direct-write trigger)
-- uses the same geometry without modifying their privileges or RLS policies.
-- Vision, LOS, light and conditional wall_passes are NOT modified.
--
-- Security gate: the installed B03 authority must exist before cutover.
DO $r18_17_preflight$
BEGIN
 IF to_regprocedure('forge_world_v2.validate_motion_path_batch_b03(uuid,bigint,jsonb,jsonb,bigint,bigint)') IS NULL OR
    to_regprocedure('forge_world_v2.swept_hits_segment(double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision)') IS NULL OR
    to_regprocedure('forge_visibility.swept_hits_segment(double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision,double precision)') IS NULL
 THEN RAISE EXCEPTION 'R18-17 wall clearance requires installed V2 path validator and BOTH original collision helpers';
 END IF;
END $r18_17_preflight$;

CREATE OR REPLACE FUNCTION forge_world_v2.swept_hits_segment(
 x0 double precision,y0 double precision,w double precision,h double precision,
 x1 double precision,y1 double precision,
 ax double precision,ay double precision,bx double precision,by_ double precision)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $r18_17$
DECLARE
 -- Never allow invalid/missing collision geometry to become a pass.
 inset_x double precision;inset_y double precision;
 xs double precision[];ys double precision[];
 axes double precision[][];
 i integer;j integer;p double precision;q double precision;
 min1 double precision;max1 double precision;min2 double precision;max2 double precision;
BEGIN
 IF x0 IS NULL OR y0 IS NULL OR x1 IS NULL OR y1 IS NULL OR
    w IS NULL OR h IS NULL OR ax IS NULL OR ay IS NULL OR bx IS NULL OR
    by_ IS NULL OR w<=0 OR h<=0 OR w>12 OR h>12 OR
    abs(x0)>100000 OR abs(y0)>100000 OR
    abs(x1)>100000 OR abs(y1)>100000 OR
    abs(ax)>100000 OR abs(ay)>100000 OR
    abs(bx)>100000 OR abs(by_)>100000
 THEN RETURN true;END IF;
 inset_x:=LEAST(0.10,w/4.0);
 inset_y:=LEAST(0.10,h/4.0);
 -- Inset the COMPLETE swept footprint, including origin, destination,
 -- and the continuous translation. Keep outer map-bounds checks exact
 -- in step_allowed and direct-write trajectory triggers.
 xs:=ARRAY[
  x0+inset_x,x0+w-inset_x,x0+w-inset_x,x0+inset_x,
  x1+inset_x,x1+w-inset_x,x1+w-inset_x,x1+inset_x];
 ys:=ARRAY[
  y0+inset_y,y0+inset_y,y0+h-inset_y,y0+h-inset_y,
  y1+inset_y,y1+inset_y,y1+h-inset_y,y1+h-inset_y];
 axes:=ARRAY[
  ARRAY[1.0::double precision,0.0::double precision],
  ARRAY[0.0::double precision,1.0::double precision],
  ARRAY[-(y1-y0),(x1-x0)],
  ARRAY[-(by_-ay),(bx-ax)]];
 FOR i IN 1..4 LOOP
  IF abs(axes[i][1])+abs(axes[i][2])<1e-8 THEN CONTINUE;END IF;
  min1:='Infinity'::double precision;max1:='-Infinity'::double precision;
  FOR j IN 1..8 LOOP
   p:=xs[j]*axes[i][1]+ys[j]*axes[i][2];
   min1:=LEAST(min1,p);max1:=GREATEST(max1,p);
  END LOOP;
  p:=ax*axes[i][1]+ay*axes[i][2];
  q:=bx*axes[i][1]+by_*axes[i][2];
  min2:=LEAST(p,q);max2:=GREATEST(p,q);
  IF max1<=min2+0.000001 OR max2<=min1+0.000001
  THEN RETURN false;END IF;
 END LOOP;
 RETURN true;
END $r18_17$;

CREATE OR REPLACE FUNCTION forge_visibility.swept_hits_segment(
 x0 double precision,y0 double precision,w double precision,h double precision,
 x1 double precision,y1 double precision,
 ax double precision,ay double precision,bx double precision,b_y double precision)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=''
AS $r18_17$
DECLARE
 -- Never allow invalid/missing collision geometry to become a pass.
 inset_x double precision;inset_y double precision;
 xs double precision[];ys double precision[];
 axes double precision[][];
 i integer;j integer;p double precision;q double precision;
 min1 double precision;max1 double precision;min2 double precision;max2 double precision;
BEGIN
 IF x0 IS NULL OR y0 IS NULL OR x1 IS NULL OR y1 IS NULL OR
    w IS NULL OR h IS NULL OR ax IS NULL OR ay IS NULL OR bx IS NULL OR
    b_y IS NULL OR w<=0 OR h<=0 OR w>12 OR h>12 OR
    abs(x0)>100000 OR abs(y0)>100000 OR
    abs(x1)>100000 OR abs(y1)>100000 OR
    abs(ax)>100000 OR abs(ay)>100000 OR
    abs(bx)>100000 OR abs(b_y)>100000
 THEN RETURN true;END IF;
 inset_x:=LEAST(0.10,w/4.0);
 inset_y:=LEAST(0.10,h/4.0);
 -- Inset the COMPLETE swept footprint, including origin, destination,
 -- and the continuous translation. Keep outer map-bounds checks exact
 -- in step_allowed and direct-write trajectory triggers.
 xs:=ARRAY[
  x0+inset_x,x0+w-inset_x,x0+w-inset_x,x0+inset_x,
  x1+inset_x,x1+w-inset_x,x1+w-inset_x,x1+inset_x];
 ys:=ARRAY[
  y0+inset_y,y0+inset_y,y0+h-inset_y,y0+h-inset_y,
  y1+inset_y,y1+inset_y,y1+h-inset_y,y1+h-inset_y];
 axes:=ARRAY[
  ARRAY[1.0::double precision,0.0::double precision],
  ARRAY[0.0::double precision,1.0::double precision],
  ARRAY[-(y1-y0),(x1-x0)],
  ARRAY[-(b_y-ay),(bx-ax)]];
 FOR i IN 1..4 LOOP
  IF abs(axes[i][1])+abs(axes[i][2])<1e-8 THEN CONTINUE;END IF;
  min1:='Infinity'::double precision;max1:='-Infinity'::double precision;
  FOR j IN 1..8 LOOP
   p:=xs[j]*axes[i][1]+ys[j]*axes[i][2];
   min1:=LEAST(min1,p);max1:=GREATEST(max1,p);
  END LOOP;
  p:=ax*axes[i][1]+ay*axes[i][2];
  q:=bx*axes[i][1]+b_y*axes[i][2];
  min2:=LEAST(p,q);max2:=GREATEST(p,q);
  IF max1<=min2+0.000001 OR max2<=min1+0.000001
  THEN RETURN false;END IF;
 END LOOP;
 RETURN true;
END $r18_17$;

-- Source-read-only grants must remain unchanged by CREATE OR REPLACE.
