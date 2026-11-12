-- R18-19 PRE-RELEASE CROSS-MAP AUTHORITY HARDENING CANDIDATE.
-- NEVER APPLY DIRECTLY TO SUPABASE. NOT A VERSIONED MIGRATION.
-- Exact prior live function bodies from 20261108055943, amended only to
-- validate map-transfer scope BEFORE pre-existing legacy early-return paths.
-- Production SQL, frozen R05 and R18-17 candidates remain untouched.
-- No new RPC surface, grants, policy or trigger is created.
--
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
 -- R18-19: even the DM may only transfer a token to a map in its campaign.
 if new.map_id is distinct from old.map_id and
    not exists (
     select 1 from public.battle_maps bm
     where bm.id=new.map_id and bm.campaign_id=new.campaign_id
    ) then
  raise exception 'Token destination map outside campaign';
 end if;
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
 -- R18-19: verify map-transfer authority BEFORE every held-item,
 -- unpublished-map or missing-map-rules early return.
 if new.map_id is distinct from old.map_id then
  if not public.is_campaign_dm(new.campaign_id) then
   raise exception 'Only the DM can transfer issued tools between maps';
  end if;
  if new.map_id is not null and not exists (
   select 1 from public.battle_maps bm
   where bm.id=new.map_id and bm.campaign_id=new.campaign_id
  ) then
   raise exception 'Tool destination map outside campaign';
  end if;
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
