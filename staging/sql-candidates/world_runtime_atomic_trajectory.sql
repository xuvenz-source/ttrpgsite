-- STAGING CANDIDATE ONLY. Do not run without designer-approved release.
-- The gesture is validated as a route, rather than as one diagonal teleport.
-- Requires world_runtime_collision_and_group_move.sql first.
-- Every step is checked by the same RLS-invoker and swept-wall transaction.
-- One function call = one Postgres transaction: all waypoints or none.
begin;
create or replace function public.commit_map_trajectory(
 p_map uuid,p_token_ids uuid[],p_tool_issue_ids uuid[],
 p_steps jsonb,p_ignore_collision boolean default false
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 step jsonb;dx integer;dy integer;total_x integer:=0;total_y integer:=0;
 result jsonb;any_step boolean:=false;
begin
 if auth.uid() is null then raise exception 'Sign in to move units';end if;
 if jsonb_typeof(p_steps)<>'array' or
  jsonb_array_length(p_steps) not between 1 and 64
 then raise exception 'Movement requires a bounded route';end if;
 for step in select value from jsonb_array_elements(p_steps) loop
  if jsonb_typeof(step)<>'object' or
   jsonb_typeof(step->'dx')<>'number' or
   jsonb_typeof(step->'dy')<>'number'
  then raise exception 'Invalid movement waypoint';end if;
  if (step->>'dx')::numeric<>trunc((step->>'dx')::numeric) or
     (step->>'dy')::numeric<>trunc((step->>'dy')::numeric) then
   raise exception 'Waypoints must use whole grid cells';
  end if;
  dx:=(step->>'dx')::integer;dy:=(step->>'dy')::integer;
  if abs(dx)>128 or abs(dy)>128 then
   raise exception 'Waypoint exceeds map movement limit';end if;
  total_x:=total_x+dx;total_y:=total_y+dy;
  if abs(total_x)>128 or abs(total_y)>128 then
   raise exception 'Route exceeds map bounds';end if;
  if dx=0 and dy=0 then continue;end if;
  any_step:=true;
  result:=public.move_map_group(p_map,p_token_ids,p_tool_issue_ids,
   dx,dy,p_ignore_collision);
 end loop;
 if not any_step then raise exception 'Movement route is empty';end if;
 return result;
end $$;
revoke all on function public.commit_map_trajectory(
 uuid,uuid[],uuid[],jsonb,boolean) from public,anon;
grant execute on function public.commit_map_trajectory(
 uuid,uuid[],uuid[],jsonb,boolean) to authenticated;
commit;
