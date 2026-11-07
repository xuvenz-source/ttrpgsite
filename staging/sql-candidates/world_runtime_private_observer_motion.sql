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
begin;
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
 bx double precision; by double precision; footprint double precision;
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
  bx:=token.x;by:=token.y;fw:=token.span_x;fh:=token.span_y;
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
  bx:=tool.x;by:=tool.y;
  footprint:=case when tool.kind='mount' then
   coalesce((tool.config->>'span')::double precision,2) else 1.0 end;
  fw:=footprint;fh:=footprint;
  attrs:=coalesce(tool.state->'attrs','{}'::jsonb);
 end if;
 canonical_x:=bx;canonical_y:=by;
 -- The last accepted waypoint is trusted only while the persisted origin
 -- is unchanged and the preview is recent. A resumed drag never reuses an
 -- arbitrary stale user-supplied starting coordinate.
 select h.* into history from forge_visibility.movement_preview_rates h
 where h.actor_id=actor and h.piece_id=p_piece;
 if found and history.map_id=p_map and history.kind=p_kind and
  history.base_x=canonical_x and history.base_y=canonical_y and
  history.last_sent>clock_timestamp()-interval '3 seconds' and
  history.last_seq<p_seq then
   bx:=history.last_x;by:=history.last_y;
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
      bx,by,fw,fh,p_x,p_y,
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
   p_map,recipient.user_id,bx+fw/2,by+fh/2);
  if not saw_old then continue;end if;
  saw_new:=forge_visibility.observer_can_see(
   p_map,recipient.user_id,p_x+fw/2,p_y+fh/2);
  if saw_new then
   -- The endpoints may both be visible even when the path between them is
   -- hidden. Never animate a private corridor into an observer's map.
   route_steps:=ceil(greatest(abs(p_x-bx),abs(p_y-by)))::int;
   if route_steps>12 then saw_new:=false;end if;
   if saw_new and route_steps>1 then
    for probe in 1..route_steps-1 loop
     probe_x:=bx+(p_x-bx)*probe::double precision/route_steps+fw/2;
     probe_y:=by+(p_y-by)*probe::double precision/route_steps+fh/2;
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
commit;
