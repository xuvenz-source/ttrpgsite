-- STAGING SQL CANDIDATE ONLY — DO NOT APPLY TO THE LIVE DATABASE.
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
 map_id uuid not null references public.battle_maps(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 revision bigint not null default 0 check (revision>=0),
 fog_enforced boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(map_id,user_id)
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
