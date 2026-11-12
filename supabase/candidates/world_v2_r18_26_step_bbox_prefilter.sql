-- B10-R18-26 UNVERSIONED POST-R05 PERFORMANCE CANDIDATE. NOT FOR LIVE SQL.
-- Replace only the existing private, STABLE / SECURITY INVOKER V2 collision
-- helper after authenticated CLI history and explicit migration approval.
-- Tested as a BEGIN / ROLLBACK overlay on the fully staged R18-22 PG17 stack.
--
-- Source: read-only live pg_get_functiondef(2026-11-12), MD5
-- forge_world_v2.step_allowed(...) = 6dcd75ce4719cd0bf6173f77f75fdf32
-- This preserves the exact auth/collision/portal, span and invalid-barrier
-- behavior, and leaves the existing swept_hits_segment helper intact.
-- A far-away wall segment cannot intersect the full rectangular footprint
-- swept from (x0,y0) to (x1,y1). Reject strictly separated bounding boxes
-- with a conservative 0.0001-cell pad BEFORE invoking the costly SAT solver.
-- No local player collision authority, RLS/GRANT, RPC, or fog change.
CREATE OR REPLACE FUNCTION forge_world_v2.step_allowed(
 p_scene jsonb,p_attrs jsonb,
 x0 double precision,y0 double precision,
 x1 double precision,y1 double precision,
 span_x double precision,span_y double precision,
 cells_w integer,cells_h integer,p_collision boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path TO ''
AS $r18_26_step$
DECLARE
 obj jsonb;pts jsonb;a jsonb;b jsonb;i integer;
 ax double precision;ay double precision;bx double precision;by_ double precision;
 sweep_min_x double precision;sweep_min_y double precision;
 sweep_max_x double precision;sweep_max_y double precision;
 finite_sweep boolean;
BEGIN
 -- Original exact validation order and fail-closed scene checks.
 IF span_x<=0 OR span_y<=0 OR span_x>12 OR span_y>12
  OR x1<0 OR y1<0 OR x1+span_x>cells_w OR y1+span_y>cells_h
 THEN RETURN false;END IF;
 IF NOT p_collision THEN RETURN true;END IF;
 IF jsonb_typeof(p_scene->'objects')<>'array' OR
  jsonb_array_length(p_scene->'objects')>120 THEN RETURN false;END IF;
 -- Only enable the AABB skip for ordinary finite, bounded coordinates.
 -- NULL, NaN, Infinity and out-of-range inputs always fall through to the
 -- original exact swept intersection predicate (never silently permitted).
 finite_sweep:=
  x0 IS NOT NULL AND y0 IS NOT NULL AND
  x1 IS NOT NULL AND y1 IS NOT NULL AND
  abs(x0)<=100000 AND abs(y0)<=100000 AND
  abs(x1)<=100000 AND abs(y1)<=100000;
 IF finite_sweep THEN
  sweep_min_x:=least(x0,x1)-0.0001;
  sweep_min_y:=least(y0,y1)-0.0001;
  sweep_max_x:=greatest(x0,x1)+span_x+0.0001;
  sweep_max_y:=greatest(y0,y1)+span_y+0.0001;
 END IF;
 FOR obj IN SELECT value FROM jsonb_array_elements(p_scene->'objects') LOOP
  IF obj->>'type' NOT IN ('wall','door','window') THEN CONTINUE;END IF;
  IF forge_world_v2.wall_passes(obj,p_attrs) THEN CONTINUE;END IF;
  pts:=obj->'points';
  IF jsonb_typeof(pts)<>'array' OR jsonb_array_length(pts) NOT BETWEEN 2 AND 80
  THEN RETURN false;END IF;
  FOR i IN 1..jsonb_array_length(pts)-1 LOOP
   a:=pts->(i-1);b:=pts->i;
   ax:=(a->>'x')::double precision;
   ay:=(a->>'y')::double precision;
   bx:=(b->>'x')::double precision;
   by_:=(b->>'y')::double precision;
   -- Entire segment lies strictly outside the conservative footprint box.
   -- Geometry casts above are unconditional: a malformed point cannot be
   -- concealed by a fast reject or become an unnoticed pass.
   IF finite_sweep AND ax IS NOT NULL AND ay IS NOT NULL AND
      bx IS NOT NULL AND by_ IS NOT NULL AND
      abs(ax)<=100000 AND abs(ay)<=100000 AND
      abs(bx)<=100000 AND abs(by_)<=100000 AND
      (greatest(ax,bx)<sweep_min_x OR
       least(ax,bx)>sweep_max_x OR
       greatest(ay,by_)<sweep_min_y OR
       least(ay,by_)>sweep_max_y)
   THEN CONTINUE;END IF;
   IF forge_world_v2.swept_hits_segment(x0,y0,span_x,span_y,x1,y1,
      ax,ay,bx,by_)
   THEN RETURN false;END IF;
  END LOOP;
 END LOOP;
 RETURN true;
END $r18_26_step$;

-- Do not GRANT execute or alter the existing R05/observer/visibility SQL.
