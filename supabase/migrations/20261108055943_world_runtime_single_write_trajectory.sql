-- Approved and applied to the existing Supabase project as migration 20261108055943.
-- Replace repeated per-waypoint database writes with one final group update.
-- Movement permission stays in SECURITY INVOKER move_map_group and existing
-- collision triggers themselves enforce every authorized swept route leg.
-- No new tables, workers, paid services or browser-available RPC entry points.

-- Called ONLY by the pre-existing SECURITY DEFINER collision triggers.
-- Geometry and movement permission are checked server-side. No writes here.
create or replace function forge_visibility.validate_piece_trajectory(
 p_scene jsonb,p_attrs jsonb,p_start_x double precision,p_start_y double precision,
 p_width double precision,p_height double precision,p_cells_w double precision,
 p_cells_h double precision,p_steps jsonb
) returns jsonb language plpgsql volatile security invoker set search_path='' as $route$
declare
 leg jsonb;barrier jsonb;points jsonb;a jsonb;b jsonb;i integer;
 sx double precision:=p_start_x;sy double precision:=p_start_y;
 tx double precision;ty double precision;dx integer;dy integer;
 sum_x integer:=0;sum_y integer:=0;any_step boolean:=false;
begin
 if jsonb_typeof(p_scene->'objects')<>'array' or
    jsonb_array_length(p_scene->'objects')>120 or
    jsonb_typeof(p_steps)<>'array' or
    jsonb_array_length(p_steps) not between 1 and 64 or
    p_width<=0 or p_height<=0 or p_width>12 or p_height>12 or
    p_cells_w<=0 or p_cells_h<=0 then
  raise exception 'Invalid published trajectory environment';
 end if;
 for leg in select value from jsonb_array_elements(p_steps) loop
  if jsonb_typeof(leg)<>'object' or
     jsonb_typeof(leg->'dx')<>'number' or
     jsonb_typeof(leg->'dy')<>'number' or
     (leg->>'dx')::numeric<>trunc((leg->>'dx')::numeric) or
     (leg->>'dy')::numeric<>trunc((leg->>'dy')::numeric) or
     abs((leg->>'dx')::numeric)>128 or abs((leg->>'dy')::numeric)>128
  then raise exception 'Invalid movement step';end if;
  dx:=(leg->>'dx')::integer;dy:=(leg->>'dy')::integer;
  sum_x:=sum_x+dx;sum_y:=sum_y+dy;
  if abs(sum_x)>128 or abs(sum_y)>128 then
   raise exception 'Movement route exceeds bounds';end if;
  if dx=0 and dy=0 then continue;end if;
  any_step:=true;
  tx:=sx+dx;ty:=sy+dy;
  if tx<0 or ty<0 or tx+p_width>p_cells_w or
     ty+p_height>p_cells_h then
   raise exception 'Trajectory leaves the map bounds';
  end if;
  for barrier in select value from jsonb_array_elements(p_scene->'objects') loop
   if barrier->>'type' not in ('wall','door','window') then continue;end if;
   if barrier->>'type' in ('door','window') and
      barrier->>'state'='broken' then continue;end if;
   if forge_visibility.wall_passes(barrier,p_attrs,'movement') then continue;end if;
   points:=barrier->'points';
   if jsonb_typeof(points)<>'array' or
      jsonb_array_length(points) not between 2 and 80 then
    raise exception 'Invalid published barrier geometry';end if;
   for i in 1..jsonb_array_length(points)-1 loop
    a:=points->(i-1);b:=points->i;
    if forge_visibility.swept_hits_segment(
      sx,sy,p_width,p_height,tx,ty,
      (a->>'x')::double precision,(a->>'y')::double precision,
      (b->>'x')::double precision,(b->>'y')::double precision)
       or forge_visibility.swept_hits_segment(
      tx,ty,p_width,p_height,tx,ty,
      (a->>'x')::double precision,(a->>'y')::double precision,
      (b->>'x')::double precision,(b->>'y')::double precision)
    then raise exception 'Trajectory blocked by a wall or closed portal';end if;
   end loop;
  end loop;
  sx:=tx;sy:=ty;
 end loop;
 if not any_step then raise exception 'Movement route is empty';end if;
 return jsonb_build_object('x',sx,'y',sy);
end $route$;

revoke all on function forge_visibility.validate_piece_trajectory(
 jsonb,jsonb,double precision,double precision,double precision,
 double precision,double precision,double precision,jsonb)
 from public,anon,authenticated;

create or replace function forge_visibility.enforce_collision()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare
 scene jsonb; m record; obstacle jsonb; points jsonb; a jsonb; b jsonb; i integer;
 attrs jsonb; cells_w double precision; cells_h double precision;
 actor uuid:=auth.uid(); dm boolean;
 collision_on boolean;route_text text;route_end jsonb;
begin
 if actor is null then
  -- Trusted service work is not the player movement API.
  if current_setting('request.jwt.claim.role',true)='service_role' then return new; end if;
  raise exception 'Sign in to move tokens';
 end if;
 if old.x is not distinct from new.x and old.y is not distinct from new.y and
    old.span_x is not distinct from new.span_x and
    old.span_y is not distinct from new.span_y and
    old.map_id is not distinct from new.map_id then return new;end if;
 dm:=public.is_campaign_dm(new.campaign_id);
 if new.map_id is distinct from old.map_id and not dm then
  raise exception 'Players cannot move tokens between maps';
 end if;
 select r.collision_enforced into collision_on
 from forge_visibility.map_rules r where r.map_id=new.map_id;
 if coalesce(collision_on,false)=false then return new;end if;
 -- The DM never bypasses collision accidentally. Only the authenticated DM
 -- using the explicit move_map_group override may request a bypass.
 if dm and current_setting('forge.collision_override',true)='on' then return new;end if;
 select live into scene from public.map_environments where map_id=new.map_id;
 select bm.width,bm.height,bm.grid_size into m from public.battle_maps bm
  where bm.id=new.map_id and bm.campaign_id=new.campaign_id;
 if not found or scene is null or jsonb_typeof(scene->'objects')<>'array' or
   m.grid_size is null or m.grid_size<=0 or
   jsonb_array_length(scene->'objects')>120 then
  raise exception 'Published collision configuration unavailable';
 end if;
 cells_w:=floor(m.width/m.grid_size);cells_h:=floor(m.height/m.grid_size);
 if new.x<0 or new.y<0 or new.x+new.span_x>cells_w or
    new.y+new.span_y>cells_h or
    new.span_x<=0 or new.span_y<=0 or new.span_x>12 or new.span_y>12
 then raise exception 'Movement leaves the map bounds';end if;
 attrs:=coalesce(new.npc_values,'{}'::jsonb);
 if new.character_id is not null then
  select ch.field_values into attrs from public.characters ch
   where ch.id=new.character_id and ch.campaign_id=new.campaign_id;
  attrs:=coalesce(attrs,'{}'::jsonb);
 end if;
 -- For approved trajectories the trigger itself checks every bent segment.
 route_text:=current_setting('forge.trajectory_steps',true);
 if coalesce(route_text,'')<>'' and
    current_setting('forge.trajectory_map',true)=new.map_id::text and
    current_setting('forge.trajectory_actor',true)=actor::text then
  route_end:=forge_visibility.validate_piece_trajectory(
   scene,attrs,old.x,old.y,new.span_x,new.span_y,
   cells_w,cells_h,route_text::jsonb);
  if (route_end->>'x')::double precision is distinct from new.x or
     (route_end->>'y')::double precision is distinct from new.y
  then raise exception 'Movement destination does not match validated route';end if;
  return new;
 end if;
 for obstacle in select value from jsonb_array_elements(scene->'objects') loop
  if obstacle->>'type' not in ('wall','door','window') then continue;end if;
  if obstacle->>'type' in ('door','window') and obstacle->>'state'='broken'
   then continue;end if;
  if forge_visibility.wall_passes(obstacle,attrs,'movement') then continue;end if;
  points:=obstacle->'points';
  if jsonb_typeof(points)<>'array' or jsonb_array_length(points) not between 2 and 80
   then raise exception 'Invalid published barrier geometry';end if;
  for i in 1..jsonb_array_length(points)-1 loop
   a:=points->(i-1);b:=points->i;
   if forge_visibility.swept_hits_segment(
    old.x,old.y,old.span_x,old.span_y,new.x,new.y,
    (a->>'x')::double precision,(a->>'y')::double precision,
    (b->>'x')::double precision,(b->>'y')::double precision)
    or forge_visibility.swept_hits_segment(
    new.x,new.y,new.span_x,new.span_y,new.x,new.y,
    (a->>'x')::double precision,(a->>'y')::double precision,
    (b->>'x')::double precision,(b->>'y')::double precision)
   then raise exception 'Movement blocked by a wall or closed portal';end if;
  end loop;
 end loop;
 return new;
end $$;
create or replace function forge_visibility.enforce_tool_collision()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare
 scene jsonb; m record; item jsonb; pts jsonb; a jsonb; b jsonb; i integer;
 span double precision; old_span double precision; w double precision; h double precision;
 attrs jsonb; actor uuid:=auth.uid();route_text text;route_end jsonb;
begin
 if actor is null then
  if current_setting('request.jwt.claim.role',true)='service_role' then return new;end if;
  raise exception 'Sign in to move tools';
 end if;
 if new.held_by_token_id is not null or old.held_by_token_id is not null
 then return new;end if;
 if new.map_id is null then return new;end if;
 if not exists(select 1 from forge_visibility.map_rules r where r.map_id=new.map_id
  and (r.collision_enforced or r.fog_enforced))then return new;end if;
 if old.map_id is null or old.map_id is distinct from new.map_id then
  if not public.is_campaign_dm(new.campaign_id) then
   raise exception 'Ask the DM to place this tool on a published map';
  end if;
  return new;
 end if;
 if old.x=new.x and old.y=new.y and old.config is not distinct from new.config
 then return new;end if;
 if not exists(select 1 from forge_visibility.map_rules r where r.map_id=new.map_id
  and r.collision_enforced)then return new;end if;
 if public.is_campaign_dm(new.campaign_id) and
  current_setting('forge.collision_override',true)='on' then return new;end if;
 select live into scene from public.map_environments where map_id=new.map_id;
 select bm.width,bm.height,bm.grid_size into m from public.battle_maps bm
  where bm.id=new.map_id and bm.campaign_id=new.campaign_id;
 if not found or scene is null or jsonb_typeof(scene->'objects')<>'array'
    or m.grid_size<=0 or jsonb_array_length(scene->'objects')>120
 then raise exception 'Published collision configuration unavailable';end if;
 span:=case when new.kind='mount' then
  coalesce((new.config->>'span')::double precision,2) else 1.0 end;
 old_span:=case when old.kind='mount' then
  coalesce((old.config->>'span')::double precision,2) else 1.0 end;
 w:=floor(m.width/m.grid_size);h:=floor(m.height/m.grid_size);
 if span<1 or span>4 or new.x<0 or new.y<0 or
  new.x+span>w or new.y+span>h then
   raise exception 'Tool movement leaves the map bounds';end if;
 attrs:=coalesce(new.state->'attrs','{}'::jsonb);
 route_text:=current_setting('forge.trajectory_steps',true);
 if coalesce(route_text,'')<>'' and
    current_setting('forge.trajectory_map',true)=new.map_id::text and
    current_setting('forge.trajectory_actor',true)=actor::text then
  route_end:=forge_visibility.validate_piece_trajectory(
   scene,attrs,old.x,old.y,old_span,old_span,
   w,h,route_text::jsonb);
  if (route_end->>'x')::double precision is distinct from new.x or
     (route_end->>'y')::double precision is distinct from new.y
  then raise exception 'Tool destination does not match validated route';end if;
  return new;
 end if;
 for item in select value from jsonb_array_elements(scene->'objects') loop
  if item->>'type' not in ('wall','door','window') then continue;end if;
  if item->>'type' in ('door','window') and item->>'state'='broken'
  then continue;end if;
  if forge_visibility.wall_passes(item,attrs,'movement') then continue;end if;
  pts:=item->'points';
  if jsonb_typeof(pts)<>'array' or jsonb_array_length(pts) not between 2 and 80
   then raise exception 'Invalid published barrier geometry';end if;
  for i in 1..jsonb_array_length(pts)-1 loop
   a:=pts->(i-1);b:=pts->i;
   if forge_visibility.swept_hits_segment(
    old.x,old.y,old_span,old_span,new.x,new.y,
    (a->>'x')::double precision,(a->>'y')::double precision,
    (b->>'x')::double precision,(b->>'y')::double precision)
    or forge_visibility.swept_hits_segment(
    new.x,new.y,span,span,new.x,new.y,
    (a->>'x')::double precision,(a->>'y')::double precision,
    (b->>'x')::double precision,(b->>'y')::double precision)
   then raise exception 'Tool movement blocked by a wall or closed portal';end if;
  end loop;
 end loop;
 return new;
end $$;

-- Same public RPC interface. The existing move_map_group keeps RLS,
-- ownership, membership, lock ordering, max group size and DM-only override.
create or replace function public.commit_map_trajectory(
 p_map uuid,p_token_ids uuid[],p_tool_issue_ids uuid[],
 p_steps jsonb,p_ignore_collision boolean default false
) returns jsonb language plpgsql volatile security invoker set search_path='' as $commit$
declare
 actor uuid:=auth.uid();step jsonb;dx integer;dy integer;
 total_x integer:=0;total_y integer:=0;any_step boolean:=false;
 result jsonb;
begin
 if actor is null then raise exception 'Sign in to move units';end if;
 if p_map is null or p_token_ids is null or p_tool_issue_ids is null or
    p_ignore_collision is null or jsonb_typeof(p_steps)<>'array' or
    jsonb_array_length(p_steps) not between 1 and 64
 then raise exception 'Movement requires a bounded route';end if;
 for step in select value from jsonb_array_elements(p_steps) loop
  if jsonb_typeof(step)<>'object' or
     jsonb_typeof(step->'dx')<>'number' or
     jsonb_typeof(step->'dy')<>'number' or
     (step->>'dx')::numeric<>trunc((step->>'dx')::numeric) or
     (step->>'dy')::numeric<>trunc((step->>'dy')::numeric) or
     abs((step->>'dx')::numeric)>128 or abs((step->>'dy')::numeric)>128
  then raise exception 'Invalid movement waypoint';end if;
  dx:=(step->>'dx')::integer;dy:=(step->>'dy')::integer;
  total_x:=total_x+dx;total_y:=total_y+dy;
  if abs(total_x)>128 or abs(total_y)>128 then
   raise exception 'Route exceeds map bounds';end if;
  if dx<>0 or dy<>0 then any_step:=true;end if;
 end loop;
 if not any_step then raise exception 'Movement route is empty';end if;
 -- SET LOCAL cannot outlive the RPC transaction. The triggers don't bypass
 -- collision: they validate every leg using the private validator above.
 perform set_config('forge.trajectory_steps',p_steps::text,true);
 perform set_config('forge.trajectory_map',p_map::text,true);
 perform set_config('forge.trajectory_actor',actor::text,true);
 -- One atomic final persistent mutation for the whole requested gesture.
 result:=public.move_map_group(
  p_map,p_token_ids,p_tool_issue_ids,total_x,total_y,p_ignore_collision);
 perform set_config('forge.trajectory_steps','',true);
 perform set_config('forge.trajectory_map','',true);
 perform set_config('forge.trajectory_actor','',true);
 return result;
end $commit$;

revoke all on function public.commit_map_trajectory(
 uuid,uuid[],uuid[],jsonb,boolean) from public,anon;
grant execute on function public.commit_map_trajectory(
 uuid,uuid[],uuid[],jsonb,boolean) to authenticated;

