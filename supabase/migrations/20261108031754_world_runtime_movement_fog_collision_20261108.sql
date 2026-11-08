-- Atomic release world runtime
-- collision_and_group_move
-- STAGING CANDIDATE ONLY. Do not execute against Supabase without designer approval.
-- Phase 2: one authoritative collision rule and atomic mixed token/tool moves.
-- SECURITY INVOKER RPC deliberately retains the existing map_token and tool
-- issue RLS policies. No new external service, table or paid infrastructure.

create or replace function forge_visibility.enforce_collision()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare
 scene jsonb; m record; obstacle jsonb; points jsonb; a jsonb; b jsonb; i integer;
 attrs jsonb; cells_w double precision; cells_h double precision;
 actor uuid:=auth.uid(); dm boolean;
 collision_on boolean;
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

-- Includes resizing and map transfer, not only x/y changes.
drop trigger if exists forge_player_collision on public.map_tokens;
create trigger forge_player_collision
 before update of x,y,span_x,span_y,map_id on public.map_tokens
 for each row execute function forge_visibility.enforce_collision();

create or replace function forge_visibility.enforce_tool_collision()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare
 scene jsonb; m record; item jsonb; pts jsonb; a jsonb; b jsonb; i integer;
 span double precision; old_span double precision; w double precision; h double precision;
 attrs jsonb; actor uuid:=auth.uid();
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

drop trigger if exists forge_tool_collision on public.campaign_tool_issues;
create trigger forge_tool_collision before update of map_id,x,y,config
 on public.campaign_tool_issues
 for each row execute function forge_visibility.enforce_tool_collision();

-- A single map movement for multiple tokens and issued tools. Either all
-- changes pass RLS/collision and commit, or none of them changes position.
-- SECURITY INVOKER is intentional; switching to DEFINER would bypass RLS.
create or replace function public.move_map_group(
 p_map uuid,
 p_token_ids uuid[],
 p_tool_issue_ids uuid[],
 p_dx integer,
 p_dy integer,
 p_ignore_collision boolean default false
) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare
 actor uuid:=auth.uid(); campaign uuid; dm boolean; count_expected int;
 count_allowed int;
begin
 if actor is null then raise exception 'Sign in to move units';end if;
 select bm.campaign_id into campaign from public.battle_maps bm where bm.id=p_map;
 if campaign is null or not public.can_view_campaign_map(campaign,p_map)
 then raise exception 'Map unavailable';end if;
 dm:=public.is_campaign_dm(campaign);
 if p_ignore_collision and not dm then
  raise exception 'Only a DM may bypass collision';
 end if;
 if p_dx is null or p_dy is null or
   p_dx not between -128 and 128 or p_dy not between -128 and 128
 then raise exception 'Movement out of range';end if;
 if p_token_ids is null or p_tool_issue_ids is null or
    cardinality(p_token_ids)>48 or cardinality(p_tool_issue_ids)>48 or
    cardinality(p_token_ids)+cardinality(p_tool_issue_ids) not between 1 and 48 or
    cardinality(p_token_ids)<>(
     select count(distinct id) from unnest(p_token_ids) as id) or
    cardinality(p_tool_issue_ids)<>(
     select count(distinct id) from unnest(p_tool_issue_ids) as id)
 then raise exception 'Invalid movement group';end if;
 count_expected:=cardinality(p_token_ids);
 if count_expected>0 then
  select count(*) into count_allowed from(
   select t.id from public.map_tokens t
   where t.id=any(p_token_ids) and t.campaign_id=campaign and
    t.map_id=p_map and (dm or (t.owner_id=actor and t.visible))
   order by t.id for update
  ) authorized;
  if count_allowed<>count_expected then
   raise exception 'A token is no longer controllable';end if;
 end if;
 count_expected:=cardinality(p_tool_issue_ids);
 if count_expected>0 then
  select count(*) into count_allowed from(
   select t.id from public.campaign_tool_issues t
   where t.id=any(p_tool_issue_ids) and t.campaign_id=campaign and
    t.map_id=p_map and t.held_by_token_id is null and
    (dm or t.owner_id=actor or t.party_shared)
   order by t.id for update
  ) authorized;
  if count_allowed<>count_expected then
   raise exception 'A tool is no longer controllable';end if;
 end if;
 if p_ignore_collision then
  perform set_config('forge.collision_override','on',true);
 end if;
 update public.map_tokens t set x=t.x+p_dx,y=t.y+p_dy
 where t.id=any(p_token_ids) and t.campaign_id=campaign and t.map_id=p_map;
 update public.campaign_tool_issues t set x=t.x+p_dx,y=t.y+p_dy
 where t.id=any(p_tool_issue_ids) and t.campaign_id=campaign and t.map_id=p_map;
 return jsonb_build_object(
  'mapId',p_map,
  'tokens',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',t.id,'x',t.x,'y',t.y) order by t.id),'[]'::jsonb)
   from public.map_tokens t where t.id=any(p_token_ids) and
    t.campaign_id=campaign and t.map_id=p_map),
  'tools',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',t.id,'x',t.x,'y',t.y) order by t.id),'[]'::jsonb)
   from public.campaign_tool_issues t where t.id=any(p_tool_issue_ids) and
    t.campaign_id=campaign and t.map_id=p_map)
 );
end $$;
revoke all on function public.move_map_group(
 uuid,uuid[],uuid[],integer,integer,boolean) from public,anon;
grant execute on function public.move_map_group(
 uuid,uuid[],uuid[],integer,integer,boolean) to authenticated;

-- dm_footprint_override
-- STAGING CANDIDATE ONLY; explicit designer release approval required.
-- Scope: resizing is collision-checked for all users by the movement trigger,
-- and the DM can deliberately override wall collision for a token's footprint.
-- Depends on world_runtime_collision_and_group_move.sql.

create or replace function public.resize_map_token(
 p_token uuid,p_span_x numeric,p_span_y numeric,
 p_ignore_collision boolean default false
) returns public.map_tokens
language plpgsql volatile security invoker set search_path='' as $$
declare
 actor uuid:=auth.uid(); row public.map_tokens%rowtype;
begin
 if actor is null then raise exception 'Sign in first';end if;
 select * into row from public.map_tokens t where t.id=p_token for update;
 if not found or not public.is_campaign_dm(row.campaign_id) or
  not public.can_view_campaign_map(row.campaign_id,row.map_id) then
  raise exception 'Only the map DM may resize that token';end if;
 if p_span_x is null or p_span_y is null or
  p_span_x<0.25 or p_span_y<0.25 or
  p_span_x>12 or p_span_y>12 then
   raise exception 'Token footprint out of range';end if;
 if p_ignore_collision then
  perform set_config('forge.collision_override','on',true);
 end if;
 update public.map_tokens t set span_x=p_span_x,span_y=p_span_y
 where t.id=p_token returning * into row;
 return row;
end $$;
revoke all on function public.resize_map_token(uuid,numeric,numeric,boolean)
 from public,anon;
grant execute on function public.resize_map_token(uuid,numeric,numeric,boolean)
 to authenticated;

-- atomic_trajectory
-- STAGING CANDIDATE ONLY. Do not run without designer-approved release.
-- The gesture is validated as a route, rather than as one diagonal teleport.
-- Requires world_runtime_collision_and_group_move.sql first.
-- Every step is checked by the same RLS-invoker and swept-wall transaction.
-- One function call = one Postgres transaction: all waypoints or none.

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

-- private_observer_motion
-- STAGING CANDIDATE ONLY. DO NOT APPLY UNTIL DESIGNER APPROVES A LIVE RELEASE.
-- Observer-specific, server-verified, ephemeral movement on Supabase Free.
-- Depends on world_runtime_collision_and_group_move.sql.
--
-- Threat model:
-- * the server derives sender from auth.uid(), never from a client payload;
-- * users may only subscribe to their own observer topic;
-- * no client INSERT permission on observer topics;
-- * no movement to a concealed observer unless both endpoints are visible;
-- * preview coordinates are checked against the published collision scene;
-- * preview RPC never updates map_tokens or visibility ticks.

create table if not exists forge_visibility.movement_preview_rates(
 actor_id uuid not null references auth.users(id) on delete cascade,
 piece_id uuid not null,
 last_sent timestamptz not null default now(),
 last_seq bigint not null,
 map_id uuid not null,
 kind text not null check(kind in ('token','tool')),
 base_x integer not null,
 base_y integer not null,
 last_x integer not null,
 last_y integer not null,
 primary key(actor_id,piece_id)
);
alter table forge_visibility.movement_preview_rates enable row level security;
revoke all on forge_visibility.movement_preview_rates from public,anon,authenticated;
revoke all on function forge_visibility.bump_tick(uuid) from public,anon,authenticated;

-- This helper is private and only called from the server-authenticated
-- broadcast function. It intentionally accepts a recipient other than the
-- request actor; unlike public.point_visible it is never Data API exposed.
create or replace function forge_visibility.observer_can_see(
 p_map uuid,p_recipient uuid,p_x double precision,p_y double precision
) returns boolean language plpgsql stable security definer set search_path='' as $$
declare
 m record; member_role text; assigned uuid; active uuid;
 scene jsonb; party boolean; viewer record;
 sx double precision; sy double precision; sheet_values jsonb;
begin
 if p_recipient is null then return false;end if;
 select bm.campaign_id,bm.width,bm.height,bm.grid_size into m
 from public.battle_maps bm where bm.id=p_map;
 if not found then return false;end if;
 select cm.role into member_role from public.campaign_members cm
  where cm.campaign_id=m.campaign_id and cm.user_id=p_recipient;
 if member_role is null then return false;end if;
 if member_role='dm' then return true;end if;
 select c.active_map_id into active from public.campaigns c where c.id=m.campaign_id;
 select pm.map_id into assigned from public.campaign_player_maps pm
  where pm.campaign_id=m.campaign_id and pm.user_id=p_recipient;
 if p_map is distinct from coalesce(assigned,active) then return false;end if;
 if not exists(select 1 from forge_visibility.map_rules r
  where r.map_id=p_map and r.fog_enforced)then return true;end if;
 if p_x<0 or p_y<0 or p_x>m.width/m.grid_size or
    p_y>m.height/m.grid_size then return false;end if;
 select e.live into scene from public.map_environments e where e.map_id=p_map;
 if scene is null or jsonb_typeof(scene->'objects')<>'array' or
    m.grid_size<=0 then return false;end if;
 party:=coalesce((scene->'fog'->>'partyShared')::boolean,false);
 for viewer in
  select coalesce(rate.last_x,t.x) as x,
   coalesce(rate.last_y,t.y) as y,t.span_x,t.span_y,
   coalesce(ch.field_values,t.npc_values,'{}'::jsonb) as sheet_values
  from public.map_tokens t
  left join public.characters ch on ch.id=t.character_id
   and ch.campaign_id=m.campaign_id
  left join forge_visibility.movement_preview_rates rate
   on rate.piece_id=t.id and rate.actor_id=t.owner_id
    and rate.kind='token' and rate.map_id=p_map
    and rate.base_x=t.x and rate.base_y=t.y
    and rate.last_sent>statement_timestamp()-interval '2 seconds'
  where t.map_id=p_map and t.campaign_id=m.campaign_id and t.visible
   and (t.owner_id=p_recipient or
    (party and t.owner_id is not null and exists(
     select 1 from public.campaign_members cm
     where cm.campaign_id=m.campaign_id and cm.user_id=t.owner_id
      and cm.role='player')))
  order by t.id limit 8
 loop
  sx:=viewer.x+viewer.span_x/2.0; sy:=viewer.y+viewer.span_y/2.0;
  if (p_x-sx)^2+(p_y-sy)^2>144 then continue;end if;
  sheet_values:=viewer.sheet_values;
  if not forge_visibility.ray_blocked(scene,sx,sy,p_x,p_y,'vision',sheet_values)
   and forge_visibility.is_lit(p_map,scene,sx,sy,p_x,p_y,m.grid_size)
  then return true;end if;
 end loop;
 return false;
exception when others then return false;
end $$;
revoke all on function forge_visibility.observer_can_see(
 uuid,uuid,double precision,double precision) from public,anon,authenticated;

-- Only the owning signed-in user can RECEIVE this topic. No client SEND
-- policy exists for forge-observer topics; the trusted DB emits the packet.
drop policy if exists "forge observer motion receive" on realtime.messages;
create policy "forge observer motion receive"
on realtime.messages for select to authenticated using (
 extension='broadcast' and
 case when (select realtime.topic()) ~
 '^forge-observer:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then
  split_part((select realtime.topic()),':',3)::uuid=auth.uid()
  and exists(
   select 1 from public.battle_maps m
   where m.id=split_part((select realtime.topic()),':',2)::uuid
    and public.can_view_campaign_map(m.campaign_id,m.id)
  )
 else false end
);

-- Private implementation; movement is checked against the same published
-- wall passability and swept hull as persisted positions, never prepared DM
-- geometry. Accepts 'token' or 'tool' only.
create or replace function forge_visibility.dispatch_movement_preview(
 p_map uuid,p_kind text,p_piece uuid,p_x integer,p_y integer,p_seq bigint,
 p_ignore_collision boolean
) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); camp uuid; m record; dm boolean;
 bx double precision; start_y double precision; footprint double precision;
 fw double precision;fh double precision;attrs jsonb:='{}'::jsonb;
 token public.map_tokens%rowtype; tool public.campaign_tool_issues%rowtype;
 scene jsonb; obstacle jsonb;pts jsonb;a jsonb;b jsonb;i integer;
 recipient record; saw_old boolean;saw_new boolean; packet jsonb;
 token_visible boolean:=true; accepted bigint;
 canonical_x integer;canonical_y integer;history record;
 route_steps integer;probe integer;probe_x double precision;probe_y double precision;
begin
 if actor is null or p_kind not in ('token','tool') or p_piece is null or
    p_seq is null or p_seq<=0 or p_seq>9000000000000000 or
    p_x is null or p_y is null or p_ignore_collision is null
 then return false;end if;
 select bm.campaign_id,bm.width,bm.height,bm.grid_size into m
 from public.battle_maps bm where bm.id=p_map;
 if not found or not public.can_view_campaign_map(m.campaign_id,p_map)
  or m.grid_size<=0 then return false;end if;
 camp:=m.campaign_id;
 dm:=public.is_campaign_dm(camp);
 if p_ignore_collision and not dm then return false;end if;
 if p_kind='token' then
  select * into token from public.map_tokens t where t.id=p_piece
   and t.campaign_id=camp and t.map_id=p_map;
  if not found or (not dm and (token.owner_id is distinct from actor
   or not token.visible)) then return false;end if;
  bx:=token.x;start_y:=token.y;fw:=token.span_x;fh:=token.span_y;
  token_visible:=token.visible;
  attrs:=coalesce(token.npc_values,'{}'::jsonb);
  if token.character_id is not null then
   select coalesce(ch.field_values,'{}'::jsonb) into attrs
    from public.characters ch where ch.id=token.character_id
     and ch.campaign_id=camp;
  end if;
 else
  select * into tool from public.campaign_tool_issues t where t.id=p_piece
   and t.campaign_id=camp and t.map_id=p_map;
  if not found or tool.held_by_token_id is not null or
    (not dm and tool.owner_id is distinct from actor and not tool.party_shared)
   then return false;end if;
  bx:=tool.x;start_y:=tool.y;
  footprint:=case when tool.kind='mount' then
   coalesce((tool.config->>'span')::double precision,2) else 1.0 end;
  fw:=footprint;fh:=footprint;
  attrs:=coalesce(tool.state->'attrs','{}'::jsonb);
 end if;
 canonical_x:=bx;canonical_y:=start_y;
 -- The last accepted waypoint is trusted only while the persisted origin
 -- is unchanged and the preview is recent. A resumed drag never reuses an
 -- arbitrary stale user-supplied starting coordinate.
 select h.* into history from forge_visibility.movement_preview_rates h
 where h.actor_id=actor and h.piece_id=p_piece;
 if found and history.map_id=p_map and history.kind=p_kind and
  history.base_x=canonical_x and history.base_y=canonical_y and
  history.last_sent>clock_timestamp()-interval '3 seconds' and
  history.last_seq<p_seq then
   bx:=history.last_x;start_y:=history.last_y;
 end if;
 if fw<=0 or fh<=0 or fw>12 or fh>12 or
    p_x<0 or p_y<0 or p_x+fw>floor(m.width/m.grid_size) or
    p_y+fh>floor(m.height/m.grid_size) then return false;end if;
 if not (dm and p_ignore_collision) and exists(
   select 1 from forge_visibility.map_rules r
   where r.map_id=p_map and r.collision_enforced
 )then
  select live into scene from public.map_environments where map_id=p_map;
  if scene is null or jsonb_typeof(scene->'objects')<>'array' or
    jsonb_array_length(scene->'objects')>120 then return false;end if;
  for obstacle in select value from jsonb_array_elements(scene->'objects') loop
   if obstacle->>'type' not in ('wall','door','window') then continue;end if;
   if obstacle->>'type' in ('door','window') and obstacle->>'state'='broken'
    then continue;end if;
   if forge_visibility.wall_passes(obstacle,attrs,'movement') then continue;end if;
   pts:=obstacle->'points';
   if jsonb_typeof(pts)<>'array' or
    jsonb_array_length(pts) not between 2 and 80 then return false;end if;
   for i in 1..jsonb_array_length(pts)-1 loop
    a:=pts->(i-1);b:=pts->i;
    if forge_visibility.swept_hits_segment(
      bx,start_y,fw,fh,p_x,p_y,
      (a->>'x')::double precision,(a->>'y')::double precision,
      (b->>'x')::double precision,(b->>'y')::double precision)
    then return false;end if;
   end loop;
  end loop;
 end if;
 -- DB-level per actor/piece rate limit survives reconnect and malicious
 -- client spam. Each accepted preview updates ONLY this private rate row,
 -- not map_tokens or any map visibility tick.
 insert into forge_visibility.movement_preview_rates(
  actor_id,piece_id,last_sent,last_seq,
  map_id,kind,base_x,base_y,last_x,last_y
 )values(actor,p_piece,clock_timestamp(),p_seq,
  p_map,p_kind,canonical_x,canonical_y,p_x,p_y)
 on conflict(actor_id,piece_id)do update set
  last_sent=excluded.last_sent,last_seq=excluded.last_seq,
  map_id=excluded.map_id,kind=excluded.kind,
  base_x=excluded.base_x,base_y=excluded.base_y,
  last_x=excluded.last_x,last_y=excluded.last_y
 where forge_visibility.movement_preview_rates.last_sent<=
  excluded.last_sent-interval '100 milliseconds'
  and p_seq>forge_visibility.movement_preview_rates.last_seq
 returning last_seq into accepted;
 if accepted is null then return false;end if;
 for recipient in
  select cm.user_id,cm.role from public.campaign_members cm
  where cm.campaign_id=camp and cm.user_id<>actor
  order by cm.user_id limit 32
 loop
  if p_kind='token' and not token_visible and recipient.role<>'dm'
   then continue;end if;
  saw_old:=forge_visibility.observer_can_see(
   p_map,recipient.user_id,bx+fw/2,start_y+fh/2);
  if not saw_old then continue;end if;
  saw_new:=forge_visibility.observer_can_see(
   p_map,recipient.user_id,p_x+fw/2,p_y+fh/2);
  if saw_new then
   -- The endpoints may both be visible even when the path between them is
   -- hidden. Never animate a private corridor into an observer's map.
   route_steps:=ceil(greatest(abs(p_x-bx),abs(p_y-start_y)))::int;
   if route_steps>12 then saw_new:=false;end if;
   if saw_new and route_steps>1 then
    for probe in 1..route_steps-1 loop
     probe_x:=bx+(p_x-bx)*probe::double precision/route_steps+fw/2;
     probe_y:=start_y+(p_y-start_y)*probe::double precision/route_steps+fh/2;
     if not forge_visibility.observer_can_see(
       p_map,recipient.user_id,probe_x,probe_y)then
      saw_new:=false;exit;
     end if;
    end loop;
   end if;
  end if;
  if saw_new then
   packet:=jsonb_build_object('kind',p_kind,'id',p_piece,'mapId',p_map,
    'actor',actor,'seq',p_seq,'action','move','x',p_x,'y',p_y);
  else
   -- No undiscovered position is ever included in a conceal message.
   packet:=jsonb_build_object('kind',p_kind,'id',p_piece,'mapId',p_map,
    'actor',actor,'seq',p_seq,'action','hide');
  end if;
  perform realtime.send(packet,'motion',
   'forge-observer:'||p_map::text||':'||recipient.user_id::text,true);
 end loop;
 return true;
exception when others then
 -- An unavailable broadcast is not authorization to weaken privacy.
 return false;
end $$;
revoke all on function forge_visibility.dispatch_movement_preview(
 uuid,text,uuid,integer,integer,bigint,boolean) from public,anon,authenticated;

-- Public narrow authenticated entry point. No freeform actor, recipient,
-- map membership, or visibility arrays can be supplied by the browser.
create or replace function public.preview_map_motion(
 p_map uuid,p_kind text,p_piece uuid,p_x integer,p_y integer,p_seq bigint,
 p_ignore_collision boolean default false
)returns boolean language sql volatile security definer
set search_path='' as $$
 select forge_visibility.dispatch_movement_preview(
  p_map,p_kind,p_piece,p_x,p_y,p_seq,p_ignore_collision)
$$;
revoke all on function public.preview_map_motion(
 uuid,text,uuid,integer,integer,bigint,boolean) from public,anon;
grant execute on function public.preview_map_motion(
 uuid,text,uuid,integer,integer,bigint,boolean) to authenticated;

-- Clear only the caller's own temporary, server-verified preview after a
-- committed movement or canceled drag; never delete another actor's rate.
create or replace function public.end_map_motion_previews(
 p_map uuid,p_token_ids uuid[],p_tool_issue_ids uuid[]
)returns integer language plpgsql volatile security definer
set search_path='' as $$
declare deleted integer;
begin
 if auth.uid() is null or p_map is null or
    p_token_ids is null or p_tool_issue_ids is null or
    cardinality(p_token_ids)+cardinality(p_tool_issue_ids)>48
 then raise exception 'Invalid preview cleanup request';end if;
 delete from forge_visibility.movement_preview_rates r
 where r.actor_id=auth.uid() and r.map_id=p_map and
   ((r.kind='token' and r.piece_id=any(p_token_ids)) or
    (r.kind='tool' and r.piece_id=any(p_tool_issue_ids)));
 get diagnostics deleted=row_count;
 return deleted;
end $$;
revoke all on function public.end_map_motion_previews(uuid,uuid[],uuid[])
 from public,anon;
grant execute on function public.end_map_motion_previews(uuid,uuid[],uuid[])
 to authenticated;

-- preview_visibility
-- STAGING CANDIDATE ONLY. Do not apply without designer's release approval.
-- Prerequisite: world_runtime_private_observer_motion.sql.
-- Existing RLS authorization and eight-source visibility are preserved.
-- A player's validated fresh movement preview may stand in for that player's
-- canonical coordinates ONLY while its base is still the saved token location.
-- This updates sight/exploration without updating map_tokens or ticking map
-- visibility on every pointer movement. Authentication comes from the RPC.
-- A failed or expired preview reverts to the authoritative saved token row.

-- Keep holder-carried torch light synchronized with validated preview positions.
CREATE OR REPLACE FUNCTION forge_visibility.is_lit(p_map uuid, scene jsonb, viewer_x double precision, viewer_y double precision, target_x double precision, target_y double precision, grid_size integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 ambient double precision; source jsonb;
 sx double precision;sy double precision;reach double precision;
 light record;
begin
 ambient:=coalesce((scene->>'ambient')::double precision,25);
 if ambient>=50 then return true;end if;
 if ambient>0 and sqrt((target_x-viewer_x)^2+(target_y-viewer_y)^2)<=6
 then return true;end if;
 if sqrt((target_x-viewer_x)^2+(target_y-viewer_y)^2)<=1.5
 then return true;end if;
 for source in select value from jsonb_array_elements(scene->'objects')
  where value->>'type'='light' and value->>'enabled'<>'false' limit 60 loop
  sx:=(source->>'x')::double precision;sy:=(source->>'y')::double precision;
  reach:=(coalesce((source->>'bright')::double precision,0)+
   coalesce((source->>'dim')::double precision,0))/5;
  if reach>0 and (target_x-sx)^2+(target_y-sy)^2<=reach^2 and
   not forge_visibility.ray_blocked(scene,sx,sy,target_x,target_y,'light')
  then return true;end if;
 end loop;
 for light in
  select case when t.id is null then coalesce(tool_rate.last_x,p.x)+0.5
    else coalesce(rate.last_x,t.x)+t.span_x/2.0 end as cx,
   case when t.id is null then coalesce(tool_rate.last_y,p.y)+0.5
    else coalesce(rate.last_y,t.y)+t.span_y/2.0 end as cy,
   p.light_bright,p.light_dim
  from public.campaign_tool_map_tokens p
  left join public.map_tokens t on t.id=p.held_by_token_id
   and t.map_id=p_map and t.visible
  left join forge_visibility.movement_preview_rates rate
   on rate.piece_id=t.id and rate.actor_id=t.owner_id
    and rate.kind='token' and rate.map_id=p_map
    and rate.base_x=t.x and rate.base_y=t.y
    and rate.last_sent>statement_timestamp()-interval '2 seconds'
  left join lateral(
   select r.last_x,r.last_y from forge_visibility.movement_preview_rates r
   where r.piece_id=p.issue_id and r.map_id=p_map and r.kind='tool'
    and r.base_x=p.x and r.base_y=p.y
    and r.last_sent>statement_timestamp()-interval '2 seconds'
   order by r.last_sent desc limit 1
  )tool_rate on true
  where p.map_id=p_map and p.light_enabled and p.kind='torch'
   and (p.held_by_token_id is null or t.id is not null)
  limit 50
 loop
  sx:=light.cx;sy:=light.cy;
  reach:=(light.light_bright+light.light_dim)/5.0;
  if reach>0 and (target_x-sx)^2+(target_y-sy)^2<=reach^2 and
   not forge_visibility.ray_blocked(scene,sx,sy,target_x,target_y,'light')
  then return true;end if;
 end loop;
 return false;
exception when others then return false;
end $function$;

create or replace function forge_visibility.point_visible(p_map uuid,
 target_x double precision,target_y double precision,actor uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare m record;scene jsonb;enabled boolean;party boolean;viewer record;
 sx double precision;sy double precision;val jsonb;dx double precision;dy double precision;
begin
 if actor is null or actor is distinct from auth.uid() then return false;end if;
 select bm.campaign_id,bm.width,bm.height,bm.grid_size into m from public.battle_maps bm where bm.id=p_map;
 if not found or not public.can_view_campaign_map(m.campaign_id,p_map) then return false;end if;
 if not exists(select 1 from forge_visibility.map_rules r
  where r.map_id=p_map and r.fog_enforced) then return true;end if;
 select live into scene from public.map_environments where map_id=p_map;
 if scene is null or jsonb_typeof(scene->'objects')<>'array' or
   m.grid_size<=0 then return false;end if;
 if target_x<0 or target_y<0 or target_x>m.width/m.grid_size or
   target_y>m.height/m.grid_size then return false;end if;
 party:=coalesce((scene->'fog'->>'partyShared')::boolean,false);
 for viewer in
  select coalesce(rate.last_x,t.x) as x,
   coalesce(rate.last_y,t.y) as y,t.span_x,t.span_y,
   t.npc_values,ch.field_values
  from public.map_tokens t
  left join public.characters ch on ch.id=t.character_id and ch.campaign_id=m.campaign_id
  left join forge_visibility.movement_preview_rates rate
   on rate.piece_id=t.id and rate.actor_id=t.owner_id
    and rate.kind='token' and rate.map_id=p_map
    and rate.base_x=t.x and rate.base_y=t.y
    and rate.last_sent>statement_timestamp()-interval '2 seconds'
  where t.map_id=p_map and t.campaign_id=m.campaign_id and t.visible
   and (t.owner_id=actor or
    (party and t.owner_id is not null and exists(
      select 1 from public.campaign_members cm
      where cm.campaign_id=m.campaign_id and cm.user_id=t.owner_id and cm.role='player')))
  order by t.id limit 8
 loop
  sx:=viewer.x+viewer.span_x/2.0;sy:=viewer.y+viewer.span_y/2.0;
  dx:=target_x-sx;dy:=target_y-sy;
  if dx*dx+dy*dy>144 then continue;end if;
  val:=coalesce(viewer.field_values,viewer.npc_values,'{}'::jsonb);
  if not forge_visibility.ray_blocked(scene,sx,sy,target_x,target_y,'vision',val)
    and forge_visibility.is_lit(p_map,scene,sx,sy,target_x,target_y,m.grid_size)
  then return true;end if;
 end loop;
 return false;
exception when others then return false;
end $$;

CREATE OR REPLACE FUNCTION public.get_authorized_map_fog(p_map uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 m record;scene jsonb;is_dm boolean;actor uuid:=auth.uid();
 fog_on boolean;collision_on boolean;shared boolean;rev bigint;w int;h int;
 seen jsonb:='[]'::jsonb;memory jsonb:='[]'::jsonb;
begin
 if actor is null then raise exception 'Sign in first';end if;
 select bm.campaign_id,bm.width,bm.height,bm.grid_size into m from public.battle_maps bm where bm.id=p_map;
 if not found or not public.can_view_campaign_map(m.campaign_id,p_map)
 then raise exception 'Map unavailable';end if;
 if m.grid_size<=0 then raise exception 'Invalid map grid';end if;
 w:=floor(m.width/m.grid_size);h:=floor(m.height/m.grid_size);
 select r.fog_enforced,r.collision_enforced into fog_on,collision_on from forge_visibility.map_rules r where r.map_id=p_map;
 fog_on:=coalesce(fog_on,false);collision_on:=coalesce(collision_on,false);
 if fog_on and (w not between 1 and 128 or h not between 1 and 128)
 then raise exception 'Fog maps support at most 128 cells per axis';end if;
 if not fog_on then w:=greatest(1,least(128,w));h:=greatest(1,least(128,h));end if;
 select coalesce(t.revision,0) into rev from public.map_visibility_ticks t where t.map_id=p_map;
 rev:=coalesce(rev,0);
 select live into scene from public.map_environments where map_id=p_map;
 shared:=coalesce((scene->'fog'->>'partyShared')::boolean,false);
 is_dm:=public.is_campaign_dm(m.campaign_id);
 if fog_on and (scene is null or jsonb_typeof(scene->'objects')<>'array')
 then raise exception 'Published fog unavailable';end if;
 if not fog_on or is_dm then
  return jsonb_build_object('mapId',p_map,'width',w,'height',h,
   'revision',rev,'enabled',fog_on,'collisionEnabled',collision_on,'partyShared',shared,
   'visible',seen,'explored',memory);
 end if;
 -- Materialize only the eight permitted viewers once per snapshot. The
 -- old per-cell point_visible() reloaded map, membership, scene and
 -- viewer rows repeatedly for every candidate fog cell.
 -- Preserve the original fail-closed behavior on malformed sight inputs.
 -- A bad ray or lighting evaluation must never disclose unauthorized cells.
 begin
 with sources as materialized (
  select coalesce(rate.last_x,t.x) as x,
   coalesce(rate.last_y,t.y) as y,t.span_x,t.span_y,
   coalesce(ch.field_values,t.npc_values,'{}'::jsonb) as viewer_values
  from public.map_tokens t
  left join public.characters ch
   on ch.id=t.character_id and ch.campaign_id=m.campaign_id
  left join forge_visibility.movement_preview_rates rate
   on rate.piece_id=t.id and rate.actor_id=t.owner_id
    and rate.kind='token' and rate.map_id=p_map
    and rate.base_x=t.x and rate.base_y=t.y
    and rate.last_sent>statement_timestamp()-interval '2 seconds'
  where t.map_id=p_map and t.visible and t.campaign_id=m.campaign_id
   and (t.owner_id=actor or
    (shared and t.owner_id is not null and exists(
      select 1 from public.campaign_members cm
      where cm.campaign_id=m.campaign_id and cm.user_id=t.owner_id and cm.role='player')))
  order by t.id limit 8
 ), nearby as (
  select distinct gx.x as cx,gy.y as cy from sources src
  cross join lateral generate_series(
   greatest(0,src.x-12),least(w-1,src.x+src.span_x::int+12)) as gx(x)
  cross join lateral generate_series(
   greatest(0,src.y-12),least(h-1,src.y+src.span_y::int+12)) as gy(y)
 ), visible_indices as (
  select (cx+cy*w) as cell from nearby
  where exists (
   select 1 from sources src
   where power(cx+0.5-(src.x+src.span_x/2.0),2)
       + power(cy+0.5-(src.y+src.span_y/2.0),2)<=144
    and not forge_visibility.ray_blocked(scene,
     src.x+src.span_x/2.0,src.y+src.span_y/2.0,
     cx+0.5,cy+0.5,'vision',src.viewer_values)
    and forge_visibility.is_lit(p_map,scene,
     src.x+src.span_x/2.0,src.y+src.span_y/2.0,
     cx+0.5,cy+0.5,m.grid_size)
  )
 )
 select coalesce(jsonb_agg(cell order by cell),'[]'::jsonb) into seen
 from visible_indices;
 exception when others then
  seen:='[]'::jsonb;
 end;
 -- Skip idempotent exploration writes: moving within already explored
 -- territory must not generate an UPDATE/WAL entry per fog refresh.
 -- JSONB @> compares the complete numeric array, not string keys.
 if jsonb_array_length(seen)>0 and not exists(
  select 1 from forge_visibility.exploration e
  where e.map_id=p_map and e.user_id=actor and e.explored_cells @> seen
 ) then
  insert into forge_visibility.exploration(campaign_id,map_id,user_id,explored_cells)
  values(m.campaign_id,p_map,actor,seen)
  on conflict(map_id,user_id) do update
   set explored_cells=(select coalesce(jsonb_agg(v order by v),'[]'::jsonb)
    from(select distinct value::integer v from jsonb_array_elements_text(
      forge_visibility.exploration.explored_cells || excluded.explored_cells)) unique_cells),
    revision=forge_visibility.exploration.revision+1,updated_at=now();
 end if;
 if shared then
  select coalesce(jsonb_agg(cell order by cell),'[]'::jsonb) into memory
  from (
   select distinct value::integer as cell
   from forge_visibility.exploration e
   join public.campaign_members cm on cm.campaign_id=e.campaign_id and cm.user_id=e.user_id
   cross join lateral jsonb_array_elements_text(e.explored_cells) value
   where e.map_id=p_map and e.campaign_id=m.campaign_id
  ) all_cells;
 else
  select explored_cells into memory from forge_visibility.exploration
   where map_id=p_map and user_id=actor;
 end if;
 return jsonb_build_object('mapId',p_map,'width',w,'height',h,
  'revision',rev,'enabled',true,'collisionEnabled',collision_on,'partyShared',shared,
  'visible',seen,'explored',coalesce(memory,'[]'::jsonb));
end $function$;

-- authorized_light_masks
-- STAGING CANDIDATE ONLY. Never apply without explicit designer approval.
-- Per-viewer, server-authorized wall-clipped torch masks. No private wall
-- coordinates, light source details, or hidden cells are returned.
-- Depends on existing published map environments + authoritative fog RPC.

create or replace function public.get_authorized_map_light_masks(p_map uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();map_row record;scene jsonb;fog_on boolean;
 frame jsonb;seen jsonb;revision bigint;
 width integer;height integer;source record;
 cx double precision;cy double precision;radius double precision;
 lit_cells jsonb; sources jsonb:='[]'::jsonb;
begin
 if actor is null then raise exception 'Sign in first';end if;
 select bm.campaign_id,bm.width,bm.height,bm.grid_size into map_row
  from public.battle_maps bm where bm.id=p_map;
 if not found or not public.can_view_campaign_map(map_row.campaign_id,p_map)
 then raise exception 'Map unavailable';end if;
 if map_row.grid_size is null or map_row.grid_size<=0
 then raise exception 'Invalid map grid';end if;
 width:=floor(map_row.width/map_row.grid_size);
 height:=floor(map_row.height/map_row.grid_size);
 if width not between 1 and 128 or height not between 1 and 128
 then raise exception 'Light maps support at most 128 cells per axis';end if;
 select coalesce(r.fog_enforced,false) into fog_on
  from forge_visibility.map_rules r where r.map_id=p_map;
 fog_on:=coalesce(fog_on,false);
 select e.live into scene from public.map_environments e where e.map_id=p_map;
 select coalesce(t.revision,0) into revision
  from public.map_visibility_ticks t where t.map_id=p_map;
 revision:=coalesce(revision,0);
 if scene is null or jsonb_typeof(scene->'objects')<>'array' or
   jsonb_array_length(scene->'objects')>120 then
  return jsonb_build_object('mapId',p_map,'revision',revision,
   'width',width,'height',height,'masks',sources);
 end if;
 -- The DM uses local prepared artwork, not this player-only sanitized feed.
 if public.is_campaign_dm(map_row.campaign_id) then
  return jsonb_build_object('mapId',p_map,'revision',revision,
   'width',width,'height',height,'masks',sources);
 end if;
 if fog_on then
  -- Own authorized snapshot: any returned torch shadow is intersected with
  -- server-calculated LOS, even when source light extends around wall ends.
  frame:=public.get_authorized_map_fog(p_map);
  if frame->>'enabled'<>'true' then raise exception 'Fog unavailable';end if;
  seen:=coalesce(frame->'visible','[]'::jsonb);
 else
  seen:='[]'::jsonb;
 end if;
 for source in
  select p.issue_id,p.map_id,p.kind,p.light_enabled,p.light_bright,
   p.light_dim,p.span,
   case when holder.id is null then coalesce(tool_rate.last_x,p.x)+0.5
    else coalesce(rate.last_x,holder.x)+holder.span_x/2.0 end as cx,
   case when holder.id is null then coalesce(tool_rate.last_y,p.y)+0.5
    else coalesce(rate.last_y,holder.y)+holder.span_y/2.0 end as cy
  from public.campaign_tool_map_tokens p
  left join public.map_tokens holder on holder.id=p.held_by_token_id
   and holder.map_id=p_map and holder.visible
  left join forge_visibility.movement_preview_rates rate
   on rate.piece_id=holder.id and rate.actor_id=holder.owner_id
    and rate.kind='token' and rate.map_id=p_map
    and rate.base_x=holder.x and rate.base_y=holder.y
    and rate.last_sent>statement_timestamp()-interval '2 seconds'
  left join lateral(
   select r.last_x,r.last_y from forge_visibility.movement_preview_rates r
   where r.piece_id=p.issue_id and r.map_id=p_map and r.kind='tool'
    and r.base_x=p.x and r.base_y=p.y
    and r.last_sent>statement_timestamp()-interval '2 seconds'
   order by r.last_sent desc limit 1
  )tool_rate on true
  where p.map_id=p_map and p.campaign_id=map_row.campaign_id
   and p.kind='torch' and p.light_enabled
   and (p.held_by_token_id is null or holder.id is not null)
  order by p.issue_id limit 16
 loop
  cx:=source.cx;cy:=source.cy;
  radius:=(source.light_bright+source.light_dim)/5.0;
  if radius<=0 or radius>48 or
   not forge_visibility.point_visible(p_map,cx,cy,actor) then continue;end if;
  select coalesce(jsonb_agg(index_cell order by index_cell),'[]'::jsonb)
  into lit_cells
  from (
   select x+y*width as index_cell,x,y
   from generate_series(greatest(0,floor(cx-radius)::int),
    least(width-1,ceil(cx+radius)::int)) x
   cross join generate_series(greatest(0,floor(cy-radius)::int),
    least(height-1,ceil(cy+radius)::int)) y
  ) nearby
  where (not fog_on or seen @> jsonb_build_array(index_cell))
   and (x+0.5-cx)^2+(y+0.5-cy)^2<=radius^2
   and not forge_visibility.ray_blocked(scene,cx,cy,
     x+0.5,y+0.5,'light');
  sources:=sources||jsonb_build_array(jsonb_build_object(
   'id',source.issue_id,'cells',lit_cells));
 end loop;
 return jsonb_build_object('mapId',p_map,'revision',revision,
  'width',width,'height',height,'masks',sources);
exception when others then
 -- Never silently fall back to the unoccluded client radial gradient.
 return jsonb_build_object('mapId',p_map,'revision',coalesce(revision,0),
  'width',coalesce(width,1),'height',coalesce(height,1),'masks','[]'::jsonb);
end $$;
revoke all on function public.get_authorized_map_light_masks(uuid)
 from public,anon;
grant execute on function public.get_authorized_map_light_masks(uuid)
 to authenticated;

-- visibility_tick_metadata
-- STAGING CANDIDATE ONLY. Apply only with the approved coordinated release.
-- Distinguish fog-on authorization revocations from harmless fog-off ticks.
-- Prevents nonfog tool movement from blanking the board while retaining
-- immediate fail-closed sight revocation when fog is enabled.

alter table public.map_visibility_ticks
 add column if not exists fog_enforced boolean not null default false;
update public.map_visibility_ticks ticks set fog_enforced=coalesce(
 (select r.fog_enforced from forge_visibility.map_rules r
  where r.map_id=ticks.map_id),false);

create or replace function forge_visibility.bump_tick(p_map uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
 insert into public.map_visibility_ticks(
  map_id,campaign_id,revision,updated_at,fog_enforced
 )
 select m.id,m.campaign_id,1,now(),coalesce(r.fog_enforced,false)
 from public.battle_maps m
 left join forge_visibility.map_rules r on r.map_id=m.id
 where m.id=p_map
 on conflict(map_id)do update set
  revision=public.map_visibility_ticks.revision+1,
  updated_at=now(),
  fog_enforced=excluded.fog_enforced;
end $$;
revoke all on function forge_visibility.bump_tick(uuid)
 from public,anon,authenticated;
