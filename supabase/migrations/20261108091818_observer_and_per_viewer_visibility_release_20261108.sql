-- PR #52 - 2026-11-08, Supabase applied version 20261108091818.
-- Consolidated observer path and per-viewer v2 authorisation.
-- Approved for test-campaign live testing. Run once; all schema statements
-- were applied in a single successful Supabase migration transaction.
-- Previous production collision, fog, and RLS rules remain authoritative.
-- Phase 1: one permitted sight-source snapshot per observer.
-- Authorized release candidate, applied in the approved PR #52 production migration.
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

-- Phase 2: isolated viewer revisions, conservative impact scope and v2 RPC.
-- Authorized release candidate, applied in the approved PR #52 production migration.
-- v2 per-viewer fog revisions. Must be installed atomically with the matching
-- client before the new protocol is enabled. Legacy map_visibility_ticks and
-- get_authorized_map_fog remain supported for existing deployed clients.
-- No new paid infrastructure, background workers, or Realtime Broadcast topic.
--
-- SECURITY: these rows contain ONLY viewer-specific revision metadata.
-- Neither map geometry, private token IDs, nor authorized sight masks are
-- present. Client writes are denied. Every source-of-truth decision is server
-- owned. Unknown/unsafe movement conditions invalidate ALL authorized viewers.

create table if not exists public.map_viewer_visibility_ticks (
 -- Opaque replica identity: even a DELETE event carries no map/user IDs.
 id uuid primary key default pg_catalog.gen_random_uuid(),
 map_id uuid not null references public.battle_maps(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 revision bigint not null default 0 check (revision>=0),
 fog_enforced boolean not null default false,
 updated_at timestamptz not null default now(),
 unique(map_id,user_id)
);
create index if not exists map_viewer_visibility_ticks_user_map_idx
 on public.map_viewer_visibility_ticks(user_id,map_id);
alter table public.map_viewer_visibility_ticks enable row level security;
revoke all on table public.map_viewer_visibility_ticks from public,anon,authenticated;
grant select on table public.map_viewer_visibility_ticks to authenticated;
drop policy if exists "Player reads own authorized viewer revision"
 on public.map_viewer_visibility_ticks;
create policy "Player reads own authorized viewer revision"
 on public.map_viewer_visibility_ticks for select to authenticated
 using (user_id=(select auth.uid()) and
  public.can_view_campaign_map(campaign_id,map_id));

-- Realtime Postgres Changes observes only the RLS-filtered recipient row.
-- Subscribe to this table with user_id=eq.<authenticated user>; the primary
-- key and server-generated row identity cannot be spoofed by a browser.
do $publication$
begin
 if not exists(select 1 from pg_publication
  where pubname='supabase_realtime') then
  raise exception 'Realtime publication is missing';
 end if;
 if not exists(select 1 from pg_publication_tables where
  pubname='supabase_realtime' and schemaname='public' and
  tablename='map_viewer_visibility_ticks') then
  alter publication supabase_realtime
   add table public.map_viewer_visibility_ticks;
 end if;
end $publication$;

-- Shared fan-out for genuinely global changes (published walls, doors,
-- light settings, status/ownership changes, tool lights, source rules).
-- p_viewers NULL means ALL currently assigned players; an empty UUID array
-- means nobody needs a new sight frame. DMs continue using global ticks.
create or replace function forge_visibility.bump_viewer_ticks(
 p_map uuid,p_viewers uuid[] default null
) returns void language plpgsql volatile security definer
set search_path='' as $viewer_bump$
begin
 if p_map is null then return;end if;
 insert into public.map_viewer_visibility_ticks(
  map_id,campaign_id,user_id,revision,fog_enforced,updated_at
 )
 select m.id,m.campaign_id,cm.user_id,1,coalesce(r.fog_enforced,false),now()
 from public.battle_maps m
 join public.campaigns camp on camp.id=m.campaign_id
 join public.campaign_members cm on cm.campaign_id=m.campaign_id
 left join public.campaign_player_maps pm
  on pm.campaign_id=m.campaign_id and pm.user_id=cm.user_id
 left join forge_visibility.map_rules r on r.map_id=m.id
 where m.id=p_map and cm.role='player'
  and coalesce(pm.map_id,camp.active_map_id)=m.id
  and (p_viewers is null or cm.user_id=any(p_viewers))
 on conflict(map_id,user_id) do update set
  revision=public.map_viewer_visibility_ticks.revision+1,
  fog_enforced=excluded.fog_enforced,updated_at=now();
end $viewer_bump$;

-- Preserve the old global revision so older production clients retain
-- their original fail-closed behavior. Also invalidate each active viewer.
create or replace function forge_visibility.bump_tick(p_map uuid)
 returns void language plpgsql security definer set search_path=''
 as $function$
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
  updated_at=now(),fog_enforced=excluded.fog_enforced;
 perform forge_visibility.bump_viewer_ticks(p_map,null);
end $function$;

-- A proven subset of players can receive a new revision without forcing the
-- other viewers to drop already-authorized sight. Global legacy tick remains.
create or replace function forge_visibility.bump_tick_scoped(
 p_map uuid,p_viewers uuid[]
) returns void language plpgsql security definer set search_path=''
 as $scoped_bump$
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
  updated_at=now(),fog_enforced=excluded.fog_enforced;
 perform forge_visibility.bump_viewer_ticks(p_map,p_viewers);
end $scoped_bump$;

-- Conservative server-owned recipient selection for PURE x/y changes.
-- Always bump the moving player's own sight, every player whose shared-party
-- sight can use that source, viewers with ANY permitted sight-source near
-- either old/new footprint, and everyone when a moving piece carries light.
-- If anything cannot be proven, NULL falls back to ALL viewers.
-- No client-authored coordinates or permissions are accepted here: arguments
-- are the database trigger's actual OLD and NEW rows.
create or replace function forge_visibility.viewers_affected_by_token_move(
 p_old public.map_tokens,p_new public.map_tokens
) returns uuid[] language plpgsql stable security definer
set search_path='' as $affected$
declare
 scene jsonb;party_shared boolean;candidate uuid[];
begin
 if p_old is null or p_new is null or
    p_old.campaign_id is distinct from p_new.campaign_id or
    p_old.map_id is distinct from p_new.map_id or
    p_new.map_id is null or
    p_old.span_x is null or p_old.span_y is null or
    p_old.span_x<=0 or p_old.span_y<=0 then return null;end if;
 select e.live into scene from public.map_environments e
  where e.map_id=p_new.map_id;
 if scene is null or jsonb_typeof(scene->'objects')<>'array' then
  return null;end if;
 party_shared:=coalesce((scene->'fog'->>'partyShared')::boolean,false);
 -- A light attached to the moving token may change the illumination of a
 -- remote viewer even if the token never enters their personal 60ft sight.
 if exists(select 1 from public.campaign_tool_map_tokens t
  where t.map_id=p_new.map_id and t.campaign_id=p_new.campaign_id
   and t.held_by_token_id=p_new.id and t.light_enabled and t.kind='torch')
 then return null;end if;

 with viewers as materialized (
  select cm.user_id
  from public.campaign_members cm
  join public.campaigns c on c.id=cm.campaign_id
  left join public.campaign_player_maps pm
   on pm.campaign_id=cm.campaign_id and pm.user_id=cm.user_id
  where cm.campaign_id=p_new.campaign_id and cm.role='player'
   and coalesce(pm.map_id,c.active_map_id)=p_new.map_id
 )
 select pg_catalog.array_agg(v.user_id order by v.user_id) into candidate
 from viewers v
 where
  (p_new.visible and p_new.owner_id=v.user_id)
  or
  (party_shared and p_new.visible and p_new.owner_id is not null
   and exists(select 1 from public.campaign_members src_owner
    where src_owner.campaign_id=p_new.campaign_id
     and src_owner.user_id=p_new.owner_id and src_owner.role='player'))
  or exists (
   select 1 from public.map_tokens src
   left join forge_visibility.movement_preview_rates rate
    on rate.piece_id=src.id and rate.actor_id=src.owner_id
     and rate.kind='token' and rate.map_id=p_new.map_id
     and rate.base_x=src.x and rate.base_y=src.y
     and rate.last_sent>statement_timestamp()-interval '2 seconds'
   where src.map_id=p_new.map_id and src.campaign_id=p_new.campaign_id
    and src.visible and src.owner_id is not null
    and (src.owner_id=v.user_id or
     (party_shared and exists(
      select 1 from public.campaign_members co
      where co.campaign_id=p_new.campaign_id and co.user_id=src.owner_id
       and co.role='player')))
    and (
     (
      abs(p_old.x+p_old.span_x/2.0-(src.x+src.span_x/2.0))
         <=16+p_old.span_x/2.0+src.span_x/2.0
      and
      abs(p_old.y+p_old.span_y/2.0-(src.y+src.span_y/2.0))
         <=16+p_old.span_y/2.0+src.span_y/2.0
     ) or (
      abs(p_new.x+p_new.span_x/2.0-(src.x+src.span_x/2.0))
         <=16+p_new.span_x/2.0+src.span_x/2.0
      and
      abs(p_new.y+p_new.span_y/2.0-(src.y+src.span_y/2.0))
         <=16+p_new.span_y/2.0+src.span_y/2.0
     ) or (
      rate.last_x is not null and
      (
       (
        abs(p_old.x+p_old.span_x/2.0-(rate.last_x+src.span_x/2.0))
          <=16+p_old.span_x/2.0+src.span_x/2.0
        and
        abs(p_old.y+p_old.span_y/2.0-(rate.last_y+src.span_y/2.0))
          <=16+p_old.span_y/2.0+src.span_y/2.0
       ) or (
        abs(p_new.x+p_new.span_x/2.0-(rate.last_x+src.span_x/2.0))
          <=16+p_new.span_x/2.0+src.span_x/2.0
        and
        abs(p_new.y+p_new.span_y/2.0-(rate.last_y+src.span_y/2.0))
          <=16+p_new.span_y/2.0+src.span_y/2.0
       )
      )
     )
    )
  );
 return coalesce(candidate,array[]::uuid[]);
exception when others then
 -- Fail OPEN to invalidating all viewers, never to revealing private NPCs.
 return null;
end $affected$;

-- Only the proven pure-motion case can skip unaffected viewer revisions.
-- All INSERT/DELETE, attributes, token visibility, ownership, footprint,
-- map transfers or unknown non-position modifications keep the global path.
create or replace function forge_visibility.tick_tokens()
 returns trigger language plpgsql security definer set search_path=''
 as $function$
declare pure_movement boolean; impacted uuid[];
begin
 if tg_op='INSERT' then
  perform forge_visibility.bump_tick(new.map_id);
  return new;
 end if;
 if tg_op='DELETE' then
  perform forge_visibility.bump_tick(old.map_id);
  return old;
 end if;
 if old.x is distinct from new.x or old.y is distinct from new.y or
    old.map_id is distinct from new.map_id or
    old.visible is distinct from new.visible or
    old.span_x is distinct from new.span_x or old.span_y is distinct from new.span_y or
    old.owner_id is distinct from new.owner_id or
    old.character_id is distinct from new.character_id or
    old.npc_values is distinct from new.npc_values then
  pure_movement:=
   (old.x is distinct from new.x or old.y is distinct from new.y)
   and (to_jsonb(old)-'x'-'y'-'updated_at')=
       (to_jsonb(new)-'x'-'y'-'updated_at');
  if pure_movement and exists(
   select 1 from forge_visibility.map_rules r
   where r.map_id=new.map_id and r.fog_enforced=true
  ) then
   impacted:=forge_visibility.viewers_affected_by_token_move(old,new);
   perform forge_visibility.bump_tick_scoped(new.map_id,impacted);
  elsif not pure_movement then
   perform forge_visibility.bump_tick(new.map_id);
  end if;
  if old.map_id is distinct from new.map_id then
   perform forge_visibility.bump_tick(old.map_id);
  end if;
 end if;
 return new;
end $function$;

-- v2 always calls the original authoritative visibility RPC; this wrapper
-- never manufactures sight. Revision is a per-user sequence, not the map's
-- global sequence. Reject any event racing the authorized snapshot.
create or replace function public.get_authorized_map_fog_v2(p_map uuid)
 returns jsonb language plpgsql volatile security definer set search_path=''
 as $viewer_frame$
declare
 actor uuid:=auth.uid();before_rev bigint;after_rev bigint;
 result jsonb;
begin
 if actor is null then raise exception 'Sign in first';end if;
 -- A missing publication would silently strand v2 watchers. Never advertise
 -- a protocol that cannot deliver server-owned revocation notifications.
 if not exists(select 1 from pg_publication_tables where
  pubname='supabase_realtime' and schemaname='public' and
  tablename='map_viewer_visibility_ticks') then
  raise exception 'Viewer visibility publication unavailable';
 end if;
 select coalesce(revision,0) into before_rev
 from public.map_viewer_visibility_ticks
 where map_id=p_map and user_id=actor;
 before_rev:=coalesce(before_rev,0);
 result:=public.get_authorized_map_fog(p_map);
 select coalesce(revision,0) into after_rev
 from public.map_viewer_visibility_ticks
 where map_id=p_map and user_id=actor;
 after_rev:=coalesce(after_rev,0);
 if before_rev is distinct from after_rev then
  raise exception 'Visibility changed while authorizing frame';
 end if;
 return result || jsonb_build_object(
  'protocolVersion',2,'revision',after_rev);
end $viewer_frame$;

revoke all on function forge_visibility.bump_viewer_ticks(uuid,uuid[])
 from public,anon,authenticated;
revoke all on function forge_visibility.bump_tick_scoped(uuid,uuid[])
 from public,anon,authenticated;
revoke all on function forge_visibility.viewers_affected_by_token_move(
 public.map_tokens,public.map_tokens) from public,anon,authenticated;
revoke all on function public.get_authorized_map_fog_v2(uuid)
 from public,anon;
grant execute on function public.get_authorized_map_fog_v2(uuid) to authenticated;
