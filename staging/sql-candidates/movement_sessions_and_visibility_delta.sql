-- STAGING ONLY. Full architectural server candidate. Never run before release approval.
-- Dependencies: 20261108091818 (per-viewer ticks and observer paths).
-- Pair with viewer_light_masks_v2.sql; leave legacy RPCs and saved trajectory intact.
-- Private storage is not exposed via PostgREST. All public RPCs require auth.uid.

create table if not exists forge_visibility.movement_sessions (
 id uuid primary key default pg_catalog.gen_random_uuid(),
 actor_id uuid not null,
 piece_id uuid not null,
 kind text not null check (kind in ('token','tool')),
 map_id uuid not null,
 campaign_id uuid not null,
 base_x integer not null, base_y integer not null,
 last_x integer not null, last_y integer not null,
 last_seq bigint not null default 0,
 map_width integer not null, map_height integer not null,
 span_x double precision not null, span_y double precision not null,
 scene jsonb not null,
 attributes jsonb not null default '{}'::jsonb,
 environment_revision bigint not null,
 rules_updated_at timestamptz,
 collision_enforced boolean not null,
 ignore_collision boolean not null default false,
 token_visible boolean not null default true,
 base_updated_at timestamptz,
 base_tool_revision bigint,
 last_sent timestamptz,
 expires_at timestamptz not null,
 unique (actor_id,piece_id)
);
alter table forge_visibility.movement_sessions enable row level security;
revoke all on table forge_visibility.movement_sessions from public,anon,authenticated;
create index if not exists movement_sessions_expiry_idx
 on forge_visibility.movement_sessions(expires_at);

-- Only one compact authorized frame per (map, viewer). A different epoch is
-- generated if the record is ever recreated. No client can read this cache.
create table if not exists forge_visibility.viewer_fog_snapshots (
 map_id uuid not null,
 user_id uuid not null,
 epoch uuid not null default pg_catalog.gen_random_uuid(),
 revision bigint not null default 0,
 sequence bigint not null default 0,
 frame jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),
 primary key(map_id,user_id)
);
alter table forge_visibility.viewer_fog_snapshots enable row level security;
revoke all on table forge_visibility.viewer_fog_snapshots from public,anon,authenticated;

-- Begin returns an opaque short-lived gesture identity, never scene data.
create or replace function public.begin_map_motion_session(
 p_map uuid,p_kind text,p_piece uuid,p_ignore_collision boolean default false)
 returns jsonb language plpgsql volatile security definer set search_path='' as $begin_motion$
declare
 actor uuid:=auth.uid();m record;row_token record;row_tool record;
 dm boolean;fw double precision;fh double precision;bx integer;by integer;
 attrs jsonb:='{}'::jsonb;scene jsonb;environment_revision bigint:=0;
 rules_updated timestamptz;collision_on boolean:=false;shown boolean:=true;
 base_updated timestamptz;tool_rev bigint;new_id uuid;
begin
 if actor is null or p_map is null or p_piece is null or
    p_kind not in ('token','tool') or p_ignore_collision is null
 then raise exception 'Invalid motion session';end if;
 select b.campaign_id,b.width,b.height,b.grid_size into m
 from public.battle_maps b where b.id=p_map;
 if not found or m.grid_size<=0 or
    not public.can_view_campaign_map(m.campaign_id,p_map)
 then raise exception 'Map unavailable';end if;
 dm:=public.is_campaign_dm(m.campaign_id);
 if p_ignore_collision and not dm then raise exception 'Only a DM may bypass collision';end if;
 if p_kind='token' then
  select t.* into row_token from public.map_tokens t
   where t.id=p_piece and t.map_id=p_map and t.campaign_id=m.campaign_id;
  if not found or (not dm and (row_token.owner_id is distinct from actor or
       row_token.visible is distinct from true))
  then raise exception 'Token unavailable';end if;
  bx:=row_token.x;by:=row_token.y;fw:=row_token.span_x;fh:=row_token.span_y;
  shown:=row_token.visible;base_updated:=row_token.updated_at;
  attrs:=coalesce(row_token.npc_values,'{}'::jsonb);
  if row_token.character_id is not null then
   select coalesce(c.field_values,'{}'::jsonb) into attrs
   from public.characters c where c.id=row_token.character_id
    and c.campaign_id=m.campaign_id;
  end if;
 else
  select t.* into row_tool from public.campaign_tool_issues t
   where t.id=p_piece and t.map_id=p_map and t.campaign_id=m.campaign_id;
  if not found or row_tool.held_by_token_id is not null or
    (not dm and row_tool.owner_id is distinct from actor and
      row_tool.party_shared is distinct from true)
  then raise exception 'Tool unavailable';end if;
  bx:=row_tool.x;by:=row_tool.y;tool_rev:=row_tool.revision;
  fw:=case when row_tool.kind='mount' then
   coalesce((row_tool.config->>'span')::double precision,2) else 1 end;
  fh:=fw;attrs:=coalesce(row_tool.state->'attrs','{}'::jsonb);
 end if;
 if fw<=0 or fh<=0 or fw>12 or fh>12 then raise exception 'Invalid footprint';end if;
 select coalesce(e.live,'{}'::jsonb),coalesce(e.revision,0) into
 scene,environment_revision from public.map_environments e where e.map_id=p_map;
 scene:=coalesce(scene,'{}'::jsonb);
 environment_revision:=coalesce(environment_revision,0);
 select r.collision_enforced,r.updated_at into collision_on,rules_updated
 from forge_visibility.map_rules r where r.map_id=p_map;
 collision_on:=coalesce(collision_on,false);
 if collision_on and not p_ignore_collision and
    (pg_catalog.jsonb_typeof(scene->'objects')<>'array' or
     pg_catalog.jsonb_array_length(scene->'objects')>120)
 then raise exception 'Collision environment unavailable';end if;
 -- Starting a new drag atomically retires an earlier session for this actor/piece.
 delete from forge_visibility.movement_sessions s
 where s.actor_id=actor and s.piece_id=p_piece;
 delete from forge_visibility.movement_preview_rates r
 where r.actor_id=actor and r.piece_id=p_piece;
 insert into forge_visibility.movement_sessions(
 actor_id,piece_id,kind,map_id,campaign_id,base_x,base_y,last_x,last_y,
 map_width,map_height,span_x,span_y,scene,attributes,environment_revision,
 rules_updated_at,collision_enforced,ignore_collision,token_visible,
 base_updated_at,base_tool_revision,expires_at)
 values(actor,p_piece,p_kind,p_map,m.campaign_id,bx,by,bx,by,
 floor(m.width/m.grid_size),floor(m.height/m.grid_size),
 fw,fh,scene,coalesce(attrs,'{}'::jsonb),environment_revision,
 rules_updated,collision_on,p_ignore_collision,shown,
 base_updated,tool_rev,clock_timestamp()+interval '6 seconds')
 returning id into new_id;
 return pg_catalog.jsonb_build_object('sessionId',new_id,'mapId',p_map,
  'kind',p_kind,'pieceId',p_piece);
end $begin_motion$;

-- Every sample is collision checked on the server against a cached, versioned
-- *published* scene. Current ownership/assignment/geometry are still checked.
-- The recipient/LOS computation remains server-only. No per-sample map_tokens
-- writes, and fog-on movement never uses public client broadcasts.
create or replace function public.advance_map_motion_session(
 p_session uuid,p_x integer,p_y integer,p_seq bigint)
 returns boolean language plpgsql volatile security definer set search_path='' as $advance_motion$
declare
 actor uuid:=auth.uid();s forge_visibility.movement_sessions%rowtype;
 t record;u record;env_rev bigint;rule_stamp timestamptz;collision_on boolean;
 obstacle jsonb;pts jsonb;a jsonb;b jsonb;i integer;accepted bigint;
 recipient record;probe integer;steps integer;packet jsonb;now_at timestamptz;
begin
 if actor is null or p_session is null or p_x is null or p_y is null
 or p_seq is null or p_seq<=0 or p_seq>9000000000000000 then return false;end if;
 select * into s from forge_visibility.movement_sessions
 where id=p_session and actor_id=actor for update;
 if not found or s.expires_at<clock_timestamp() or p_seq<=s.last_seq
 or p_x<0 or p_y<0 or p_x+s.span_x>s.map_width
 or p_y+s.span_y>s.map_height then return false;end if;
 now_at:=clock_timestamp();
 if s.last_sent is not null and now_at-s.last_sent<interval '90 milliseconds'
 then return false;end if;
 if not public.can_view_campaign_map(s.campaign_id,s.map_id)
 or (s.ignore_collision and not public.is_campaign_dm(s.campaign_id))
 then return false;end if;
 select coalesce(e.revision,0) into env_rev from public.map_environments e
 where e.map_id=s.map_id;
 if coalesce(env_rev,0)<>s.environment_revision then return false;end if;
 select r.updated_at,coalesce(r.collision_enforced,false) into rule_stamp,collision_on
 from forge_visibility.map_rules r where r.map_id=s.map_id;
 if rule_stamp is distinct from s.rules_updated_at or
    coalesce(collision_on,false)<>s.collision_enforced then return false;end if;
 if s.kind='token' then
  select t.map_id,t.campaign_id,t.x,t.y,t.owner_id,t.visible,t.updated_at
   into t from public.map_tokens t where t.id=s.piece_id;
  if not found or t.map_id is distinct from s.map_id or
   t.campaign_id is distinct from s.campaign_id or t.x<>s.base_x or
   t.y<>s.base_y or t.updated_at is distinct from s.base_updated_at or
   (not public.is_campaign_dm(s.campaign_id) and
    (t.owner_id is distinct from actor or t.visible is distinct from true))
  then return false;end if;
 else
  select t.map_id,t.campaign_id,t.x,t.y,t.owner_id,t.party_shared,
    t.held_by_token_id,t.revision into u
  from public.campaign_tool_issues t where t.id=s.piece_id;
  if not found or u.map_id is distinct from s.map_id or
   u.campaign_id is distinct from s.campaign_id or
   u.x<>s.base_x or u.y<>s.base_y or
   u.revision is distinct from s.base_tool_revision or
   u.held_by_token_id is not null or
   (not public.is_campaign_dm(s.campaign_id) and
    u.owner_id is distinct from actor and u.party_shared is distinct from true)
  then return false;end if;
 end if;
 if s.collision_enforced and not s.ignore_collision then
  if pg_catalog.jsonb_typeof(s.scene->'objects')<>'array' or
    pg_catalog.jsonb_array_length(s.scene->'objects')>120 then return false;end if;
  for obstacle in select value from pg_catalog.jsonb_array_elements(s.scene->'objects') loop
   if obstacle->>'type' not in ('wall','door','window') then continue;end if;
   if obstacle->>'type' in ('door','window') and obstacle->>'state'='broken'
   then continue;end if;
   if forge_visibility.wall_passes(obstacle,s.attributes,'movement') then continue;end if;
   pts:=obstacle->'points';
   if pg_catalog.jsonb_typeof(pts)<>'array' or
     pg_catalog.jsonb_array_length(pts) not between 2 and 80 then return false;end if;
   for i in 1..pg_catalog.jsonb_array_length(pts)-1 loop
    a:=pts->(i-1);b:=pts->i;
    if forge_visibility.swept_hits_segment(s.last_x,s.last_y,s.span_x,s.span_y,
      p_x,p_y,(a->>'x')::double precision,(a->>'y')::double precision,
      (b->>'x')::double precision,(b->>'y')::double precision)
    then return false;end if;
   end loop;
  end loop;
 end if;
 -- Existing visibility and lighting functions consume this trusted last step.
 insert into forge_visibility.movement_preview_rates(
 actor_id,piece_id,last_sent,last_seq,map_id,kind,
 base_x,base_y,last_x,last_y
 ) values(actor,s.piece_id,now_at,p_seq,s.map_id,s.kind,
 s.base_x,s.base_y,p_x,p_y)
 on conflict(actor_id,piece_id) do update set
 last_sent=excluded.last_sent,last_seq=excluded.last_seq,
 map_id=excluded.map_id,kind=excluded.kind,
 base_x=excluded.base_x,base_y=excluded.base_y,
 last_x=excluded.last_x,last_y=excluded.last_y
 where p_seq>forge_visibility.movement_preview_rates.last_seq
 returning last_seq into accepted;
 if accepted is null then return false;end if;
 update forge_visibility.movement_sessions
 set last_x=p_x,last_y=p_y,last_seq=p_seq,last_sent=now_at,
 expires_at=now_at+interval '6 seconds' where id=s.id;
 steps:=pg_catalog.ceil(pg_catalog.greatest(
  pg_catalog.abs(p_x-s.last_x),pg_catalog.abs(p_y-s.last_y)))::int;
 for recipient in
  select cm.user_id,cm.role from public.campaign_members cm
   where cm.campaign_id=s.campaign_id and cm.user_id<>actor
   order by cm.user_id limit 32
 loop
  if s.kind='token' and not s.token_visible and recipient.role<>'dm'
  then continue;end if;
  -- Private recipients are validated by the existing current-LOS routine.
  -- No direct client send or public map topic can bypass this gate.
  probe:=forge_visibility.observer_path_status_cached(
   s.map_id,recipient.user_id,s.campaign_id,s.scene,
   (select b.grid_size from public.battle_maps b where b.id=s.map_id),
   s.map_width,s.map_height,
   s.last_x+s.span_x/2,s.last_y+s.span_y/2,
   p_x+s.span_x/2,p_y+s.span_y/2,steps);
  if probe=0 then continue;end if;
  if probe=1 then
   packet:=pg_catalog.jsonb_build_object('kind',s.kind,'id',s.piece_id,
    'mapId',s.map_id,'actor',actor,'seq',p_seq,
    'action','move','x',p_x,'y',p_y);
  else
   packet:=pg_catalog.jsonb_build_object('kind',s.kind,'id',s.piece_id,
    'mapId',s.map_id,'actor',actor,'seq',p_seq,'action','hide');
  end if;
  perform realtime.send(packet,'motion',
   'forge-observer:'||s.map_id::text||':'||recipient.user_id::text,true);
 end loop;
 return true;
exception when others then
 -- A failed broadcast, malformed scene or unexpected backend error NEVER
 -- downgrades to an unsafe direct client preview.
 return false;
end $advance_motion$;

create or replace function public.end_map_motion_sessions(
 p_map uuid,p_token_ids uuid[],p_tool_issue_ids uuid[])
 returns integer language plpgsql volatile security definer set search_path='' as $end_motion$
declare actor uuid:=auth.uid();n integer;
begin
 if actor is null or p_map is null or
 p_token_ids is null or p_tool_issue_ids is null or
 pg_catalog.cardinality(p_token_ids)+pg_catalog.cardinality(p_tool_issue_ids)>48
 then raise exception 'Invalid motion cleanup';end if;
 delete from forge_visibility.movement_sessions s
 where s.actor_id=actor and s.map_id=p_map and
 ((s.kind='token' and s.piece_id=any(p_token_ids)) or
  (s.kind='tool' and s.piece_id=any(p_tool_issue_ids)));
 get diagnostics n=row_count;
 -- Fog previews/held lights may otherwise be sourced from old stored steps.
 perform public.end_map_motion_previews(p_map,p_token_ids,p_tool_issue_ids);
 return n;
end $end_motion$;

-- Bounded set difference: all cells in new source are recomputed inside trusted
-- public.get_authorized_map_fog_v2, never accepted as a client-authored mask.
create or replace function forge_visibility.fog_cells_diff(
 p_old jsonb,p_new jsonb) returns jsonb language sql stable
 security invoker set search_path='' as $fog_diff$
 select pg_catalog.jsonb_build_object(
 'add',coalesce((
  select pg_catalog.jsonb_agg(v order by v) from (
   select value::integer as v from pg_catalog.jsonb_array_elements_text(p_new)
   except select value::integer from pg_catalog.jsonb_array_elements_text(p_old)
  ) additions
 ),'[]'::jsonb),
 'remove',coalesce((
  select pg_catalog.jsonb_agg(v order by v) from (
   select value::integer as v from pg_catalog.jsonb_array_elements_text(p_old)
   except select value::integer from pg_catalog.jsonb_array_elements_text(p_new)
  ) removals
 ),'[]'::jsonb))
$fog_diff$;

create or replace function public.get_authorized_map_fog_delta(
 p_map uuid,p_base_epoch uuid default null,p_base_revision bigint default null,
 p_base_sequence bigint default null)
 returns jsonb language plpgsql volatile security definer set search_path='' as $viewer_delta$
declare actor uuid:=auth.uid();current_frame jsonb;old forge_visibility.viewer_fog_snapshots%rowtype;
 now_rev bigint;next_seq bigint;v jsonb;e jsonb;can_delta boolean;
begin
 if actor is null or p_map is null then raise exception 'Map unavailable';end if;
 current_frame:=public.get_authorized_map_fog_v2(p_map);
 if current_frame->>'protocolVersion'<>'2' or current_frame->>'mapId'<>p_map::text
 then raise exception 'Invalid current authorized visibility';end if;
 now_rev:=(current_frame->>'revision')::bigint;
 insert into forge_visibility.viewer_fog_snapshots(map_id,user_id)
 values(p_map,actor) on conflict(map_id,user_id) do nothing;
 select * into old from forge_visibility.viewer_fog_snapshots
 where map_id=p_map and user_id=actor for update;
 can_delta:=p_base_epoch is not null and p_base_epoch=old.epoch and
  p_base_revision=old.revision and p_base_sequence=old.sequence and
  old.frame ? 'visible' and old.frame ? 'explored' and
  old.frame->>'width'=current_frame->>'width' and
  old.frame->>'height'=current_frame->>'height' and
  old.frame->>'enabled'=current_frame->>'enabled' and
  old.frame->>'partyShared'=current_frame->>'partyShared';
 -- The server returns NOOP only for a client which already holds this very
 -- snapshot/epoch/sequence. Other clients get a complete authorized frame.
 if current_frame=old.frame and can_delta then
  return pg_catalog.jsonb_build_object('mode','noop','deltaProtocolVersion',1,
    'mapId',p_map,'protocolVersion',2,'revision',now_rev,
    'epoch',old.epoch,'sequence',old.sequence);
 end if;
 if current_frame=old.frame then
  return current_frame||pg_catalog.jsonb_build_object(
   'mode','snapshot','deltaProtocolVersion',1,
   'epoch',old.epoch,'sequence',old.sequence,'entitiesChanged',false);
 end if;
 next_seq:=old.sequence+1;
 if can_delta then
  v:=forge_visibility.fog_cells_diff(old.frame->'visible',current_frame->'visible');
  e:=forge_visibility.fog_cells_diff(old.frame->'explored',current_frame->'explored');
 end if;
 update forge_visibility.viewer_fog_snapshots set
 frame=current_frame,revision=now_rev,sequence=next_seq,updated_at=now()
 where map_id=p_map and user_id=actor;
 if can_delta then
  return pg_catalog.jsonb_build_object(
   'mode','delta','deltaProtocolVersion',1,'protocolVersion',2,'mapId',p_map,
   'width',current_frame->'width','height',current_frame->'height',
   'enabled',current_frame->'enabled','partyShared',current_frame->'partyShared',
   'collisionEnabled',current_frame->'collisionEnabled',
   'epoch',old.epoch,'revision',now_rev,'sequence',next_seq,
   'baseRevision',old.revision,'baseSequence',old.sequence,
   'visibleAdd',v->'add','visibleRemove',v->'remove',
   'exploredAdd',e->'add','exploredRemove',e->'remove',
   'entitiesChanged',true);
 end if;
 return current_frame||pg_catalog.jsonb_build_object(
  'mode','snapshot','deltaProtocolVersion',1,
  'epoch',old.epoch,'sequence',next_seq,'entitiesChanged',true);
end $viewer_delta$;

-- Ownership isolation: private storage is not in an exposed API schema;
-- authenticated users may ONLY execute constrained public wrappers.
revoke all on function public.begin_map_motion_session(uuid,text,uuid,boolean)
 from public,anon;
revoke all on function public.advance_map_motion_session(uuid,integer,integer,bigint)
 from public,anon;
revoke all on function public.end_map_motion_sessions(uuid,uuid[],uuid[])
 from public,anon;
revoke all on function public.get_authorized_map_fog_delta(uuid,uuid,bigint,bigint)
 from public,anon;
revoke all on function forge_visibility.fog_cells_diff(jsonb,jsonb)
 from public,anon,authenticated;
grant execute on function public.begin_map_motion_session(uuid,text,uuid,boolean)
 to authenticated;
grant execute on function public.advance_map_motion_session(uuid,integer,integer,bigint)
 to authenticated;
grant execute on function public.end_map_motion_sessions(uuid,uuid[],uuid[])
 to authenticated;
grant execute on function public.get_authorized_map_fog_delta(uuid,uuid,bigint,bigint)
 to authenticated;
