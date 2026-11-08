-- STAGING CANDIDATE ONLY: DO NOT APPLY WITHOUT DESIGNER APPROVAL.
-- Based on live SQL definitions inspected 2026-11-08. Requires existing
-- private forge_visibility schema, observer_can_see/ray_blocked/is_lit and
-- authenticated Realtime policies from world-runtime migrations.
-- Preserve current collision sweeps, permission checks, actor identity,
-- trusted server broadcasts, 32-recipient bound and 100ms rate control.
-- No new tables, subscriptions, paid features or client-visible functions.
-- This candidate is NOT a timestamped applied migration.

-- PRIVATE: One security-authorized scene + viewer snapshot for an entire
-- observer movement path. Returns 0 (not visible at origin), 1 (every
-- waypoint visible), or 2 (origin visible, path not fully visible).
-- Never returns viewer coordinates, scene JSON, hidden movement or player data.
create or replace function forge_visibility.observer_path_status(
 p_map uuid, p_recipient uuid,
 p_x0 double precision, p_y0 double precision,
 p_x1 double precision, p_y1 double precision,
 p_steps integer
) returns integer
language plpgsql stable security definer set search_path='' as $path_status$
declare
 m record; member_role text; assigned uuid; active uuid;
 scene jsonb; party boolean; old_visible boolean:=false; path_visible boolean:=false;
begin
 if p_map is null or p_recipient is null or
    p_x0 is null or p_y0 is null or p_x1 is null or p_y1 is null or
    p_steps is null or p_steps<0 then return 0;end if;
 select bm.campaign_id,bm.width,bm.height,bm.grid_size into m
 from public.battle_maps bm where bm.id=p_map;
 if not found then return 0;end if;
 select cm.role into member_role from public.campaign_members cm
 where cm.campaign_id=m.campaign_id and cm.user_id=p_recipient;
 if member_role is null then return 0;end if;
 -- Exactly as observer_can_see: the DM sees regardless of map assignment.
 if member_role='dm' then return case when p_steps<=12 then 1 else 2 end;end if;
 select c.active_map_id into active from public.campaigns c where c.id=m.campaign_id;
 select pm.map_id into assigned from public.campaign_player_maps pm
 where pm.campaign_id=m.campaign_id and pm.user_id=p_recipient;
 if p_map is distinct from coalesce(assigned,active) then return 0;end if;
 -- Fog-disabled players can see any path on their authorized map.
 if not exists(select 1 from forge_visibility.map_rules r
   where r.map_id=p_map and r.fog_enforced)
 then return case when p_steps<=12 then 1 else 2 end;end if;
 if m.grid_size is null or m.grid_size<=0 or
    p_x0<0 or p_y0<0 or
    p_x0>m.width/m.grid_size or p_y0>m.height/m.grid_size
 then return 0;end if;
 select e.live into scene from public.map_environments e where e.map_id=p_map;
 if scene is null or jsonb_typeof(scene->'objects')<>'array' then return 0;end if;
 party:=coalesce((scene->'fog'->>'partyShared')::boolean,false);

 -- Materialize the *same* eight permitted source tokens once and use them
 -- for all path samples. This replaces N full observer_can_see executions.
 -- Always include step zero; a hidden-origin preview may send NOTHING.
 with sources as materialized (
  select coalesce(rate.last_x,t.x)::double precision as x,
   coalesce(rate.last_y,t.y)::double precision as y,
   t.span_x,t.span_y,
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
 ), points as (
  select step,
   p_x0+(p_x1-p_x0)*step::double precision/greatest(p_steps,1) as x,
   p_y0+(p_y1-p_y0)*step::double precision/greatest(p_steps,1) as y
  from pg_catalog.generate_series(0,
    case when p_steps>12 then 0 else p_steps end) as step
 ), samples as (
  select waypoint.step,exists(
   select 1 from sources s
   where (waypoint.x-(s.x+s.span_x/2.0))^2+
         (waypoint.y-(s.y+s.span_y/2.0))^2<=144
    and not forge_visibility.ray_blocked(scene,
     s.x+s.span_x/2.0,s.y+s.span_y/2.0,waypoint.x,waypoint.y,
     'vision',s.sheet_values)
    and forge_visibility.is_lit(p_map,scene,
     s.x+s.span_x/2.0,s.y+s.span_y/2.0,waypoint.x,waypoint.y,m.grid_size)
  ) as visible from points waypoint
 )
 select coalesce(bool_or(visible) filter (where step=0),false),
        coalesce(bool_and(visible),false)
 into old_visible,path_visible from samples;
 if not old_visible then return 0;end if;
 if p_steps>12 or not path_visible then return 2;end if;
 return 1;
exception when others then
 -- On malformed scene or any unexpected error, suppress the preview.
 return 0;
end $path_status$;

revoke all on function forge_visibility.observer_path_status(
 uuid,uuid,double precision,double precision,double precision,double precision,integer
) from public,anon,authenticated;

-- Replace only observer path traversal; all other dispatch steps remain
-- identical to deployed production source. No table-level RLS changes.
CREATE OR REPLACE FUNCTION forge_visibility.dispatch_movement_preview(p_map uuid, p_kind text, p_piece uuid, p_x integer, p_y integer, p_seq bigint, p_ignore_collision boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 actor uuid:=auth.uid(); camp uuid; m record; dm boolean;
 bx double precision; start_y double precision; footprint double precision;
 fw double precision;fh double precision;attrs jsonb:='{}'::jsonb;
 token public.map_tokens%rowtype; tool public.campaign_tool_issues%rowtype;
 scene jsonb; obstacle jsonb;pts jsonb;a jsonb;b jsonb;i integer;
 recipient record; packet jsonb;
 token_visible boolean:=true; accepted bigint;
 canonical_x integer;canonical_y integer;history record;
 route_steps integer;probe integer;
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
  -- Single private query per recipient, rather than scene/viewer SQL once
  -- for each intermediate path probe. The server is still authoritative.
  route_steps:=ceil(greatest(abs(p_x-bx),abs(p_y-start_y)))::int;
  probe:=forge_visibility.observer_path_status(
   p_map,recipient.user_id,
   bx+fw/2,start_y+fh/2,p_x+fw/2,p_y+fh/2,route_steps);
  if probe=0 then continue;end if;
  if probe=1 then
   packet:=jsonb_build_object('kind',p_kind,'id',p_piece,'mapId',p_map,
    'actor',actor,'seq',p_seq,'action','move','x',p_x,'y',p_y);
  else
   -- If the route or destination is concealed, NEVER include coordinates.
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
end $function$;


-- Only the preexisting privileged dispatcher may invoke this private helper.
-- The public wrapper preview_map_motion retains its existing grants.
