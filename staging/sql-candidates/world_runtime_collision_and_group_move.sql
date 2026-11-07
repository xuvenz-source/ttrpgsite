-- STAGING CANDIDATE ONLY. Do not execute against Supabase without designer approval.
-- Phase 2: one authoritative collision rule and atomic mixed token/tool moves.
-- SECURITY INVOKER RPC deliberately retains the existing map_token and tool
-- issue RLS policies. No new external service, table or paid infrastructure.
begin;

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
commit;
