-- STAGING ONLY. Coordinated release with fog-aware frontend. DO NOT RUN UNTIL APPROVED.
-- Additive schema plus opt-in map rules. No paid services/background workers.
begin;
create schema if not exists forge_visibility;
revoke all on schema forge_visibility from public,anon,authenticated;
create table if not exists forge_visibility.map_rules(
 campaign_id uuid not null,
 map_id uuid primary key,
 fog_enforced boolean not null default false,
 collision_enforced boolean not null default false,
 published_revision bigint not null default 0 check(published_revision>=0),
 updated_at timestamptz not null default now(),
 foreign key(campaign_id,map_id) references public.battle_maps(campaign_id,id) on delete cascade
);
alter table forge_visibility.map_rules enable row level security;
revoke all on forge_visibility.map_rules from public,anon,authenticated;
create table if not exists forge_visibility.exploration(
 campaign_id uuid not null,
 map_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 explored_cells jsonb not null default '[]'::jsonb,
 revision bigint not null default 0 check(revision>=0),
 updated_at timestamptz not null default now(),
 primary key(map_id,user_id),
 foreign key(campaign_id,map_id) references public.battle_maps(campaign_id,id) on delete cascade,
 constraint explored_cells_array check(jsonb_typeof(explored_cells)='array' and jsonb_array_length(explored_cells)<=16384)
);
create index if not exists fog_exploration_actor on forge_visibility.exploration(campaign_id,user_id);
alter table forge_visibility.exploration enable row level security;
revoke all on forge_visibility.exploration from public,anon,authenticated;

-- Public revision notifications carry no vision polygons, map geometry, token
-- names or artwork. Reading a tick only discloses that the map changed.
create table if not exists public.map_visibility_ticks(
 map_id uuid primary key,
 campaign_id uuid not null,
 revision bigint not null default 0,
 updated_at timestamptz not null default now(),
 foreign key(campaign_id,map_id) references public.battle_maps(campaign_id,id) on delete cascade
);
alter table public.map_visibility_ticks enable row level security;
revoke all on public.map_visibility_ticks from public,anon,authenticated;
grant select on public.map_visibility_ticks to authenticated;
create policy "authorized map viewers see revision only" on public.map_visibility_ticks
 for select to authenticated using(public.can_view_campaign_map(campaign_id,map_id));
create or replace function forge_visibility.bump_tick(p_map uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
 insert into public.map_visibility_ticks(map_id,campaign_id,revision,updated_at)
 select m.id,m.campaign_id,1,now() from public.battle_maps m where m.id=p_map
 on conflict(map_id) do update set revision=public.map_visibility_ticks.revision+1,
  updated_at=now();
end $$;
revoke all on function forge_visibility.bump_tick(uuid) from public,anon,authenticated;

-- Geometry helpers use only published live documents. Never export these
-- functions through the Supabase Data API or grant the private schema.
create or replace function forge_visibility.cross2(ax double precision,ay double precision,
 bx double precision,by double precision)
returns double precision language sql immutable set search_path='' as $$
 select ax*by-ay*bx
$$;
create or replace function forge_visibility.wall_passes(o jsonb,vals jsonb,
 mode text,side text default 'a')
returns boolean language plpgsql stable set search_path='' as $$
declare
 field text:=o->>'attributeField';
 threshold text; raw text;
begin
 threshold:=case when mode='movement' then o->>'movementAt' else o->>'visionAt' end;
 if mode<>'light' and coalesce(field,'')<>'' and
    coalesce(threshold,'') ~ '^[-]?[0-9]{1,5}([.][0-9]{1,3})?$' then
  raw:=case when jsonb_typeof(vals->field)='object'
    then vals->field->>'current' else vals->>field end;
  if coalesce(raw,'')~'^[-]?[0-9]{1,5}([.][0-9]{1,3})?$'
     and raw::numeric>=threshold::numeric then return true; end if;
 end if;
 if o->>'type' in ('door','window') and o->>'state' in ('open','broken')
 then return true;end if;
 if mode='movement' then return o->>'blocksMovement'='false';end if;
 if mode='light' then return o->>'blocksLight'='false';end if;
 if o->>'type'='window' and o->>'curtains'='true' then return false;end if;
 if o->>'vision'='pass' then return true;end if;
 if o->>'vision'='one-way' then
  return o->>'oneWay'=case when side='a' then 'a-to-b' else 'b-to-a' end;
 end if;
 return false;
end $$;
create or replace function forge_visibility.ray_blocked(scene jsonb,
 sx double precision,sy double precision,tx double precision,ty double precision,
 mode text,vals jsonb default '{}'::jsonb)
returns boolean language plpgsql stable set search_path='' as $$
declare o jsonb; pts jsonb;a jsonb;b jsonb; i integer;
 ax double precision;ay double precision;bx double precision;by double precision;
 denominator double precision;param double precision;edgeparam double precision;
 side text;
begin
 if jsonb_typeof(scene->'objects')<>'array' or
    jsonb_array_length(scene->'objects')>120 then return true;end if;
 for o in select value from jsonb_array_elements(scene->'objects') loop
  if o->>'type' not in ('wall','door','window') then continue;end if;
  pts:=o->'points';
  if jsonb_typeof(pts)<>'array' or jsonb_array_length(pts) not between 2 and 80
  then return true;end if;
  for i in 1..jsonb_array_length(pts)-1 loop
   a:=pts->(i-1);b:=pts->i;
   ax:=(a->>'x')::double precision;ay:=(a->>'y')::double precision;
   bx:=(b->>'x')::double precision;by:=(b->>'y')::double precision;
   side:=case when forge_visibility.cross2(bx-ax,by-ay,sx-ax,sy-ay)>=0
    then 'a' else 'b' end;
   if forge_visibility.wall_passes(o,vals,mode,side) then continue;end if;
   denominator:=forge_visibility.cross2(tx-sx,ty-sy,bx-ax,by-ay);
   if abs(denominator)<0.0000001 then continue;end if;
   param:=forge_visibility.cross2(ax-sx,ay-sy,bx-ax,by-ay)/denominator;
   edgeparam:=forge_visibility.cross2(ax-sx,ay-sy,tx-sx,ty-sy)/denominator;
   if param>0.00001 and param<0.99999 and
      edgeparam>=-0.00001 and edgeparam<=1.00001 then return true;end if;
  end loop;
 end loop;
 return false;
exception when others then
 -- Invalid published geometry must never give a player extra visibility.
 return true;
end $$;
create or replace function forge_visibility.is_lit(p_map uuid,scene jsonb,
 viewer_x double precision,viewer_y double precision,
 target_x double precision,target_y double precision,
 grid_size integer)
returns boolean language plpgsql stable security definer set search_path='' as $$
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
 for light in select x,y,light_bright,light_dim from public.campaign_tool_map_tokens
  where map_id=p_map and light_enabled and kind='torch' limit 50 loop
  sx:=light.x+0.5;sy:=light.y+0.5;
  reach:=(light.light_bright+light.light_dim)/5.0;
  if reach>0 and (target_x-sx)^2+(target_y-sy)^2<=reach^2 and
   not forge_visibility.ray_blocked(scene,sx,sy,target_x,target_y,'light')
  then return true;end if;
 end loop;
 return false;
exception when others then return false;
end $$;

-- Actor's authorized point visibility, including party vision mode.
-- A missing enabled scene is fail-closed. A map not yet opted-in keeps
-- existing token visibility behavior without requiring any new records.
create or replace function forge_visibility.point_visible(p_map uuid,
 target_x double precision,target_y double precision,actor uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare m record;scene jsonb;enabled boolean;party boolean;viewer record;
 sx double precision;sy double precision;val jsonb;dx double precision;dy double precision;
begin
 if actor is null or actor is distinct from auth.uid() then return false;end if;
 select campaign_id,width, height,grid_size into m from public.battle_maps where id=p_map;
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
  select t.x,t.y,t.span_x,t.span_y,t.npc_values,ch.field_values
  from public.map_tokens t
  left join public.characters ch on ch.id=t.character_id and ch.campaign_id=m.campaign_id
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

-- A public function is referenced by RLS, but is a non-disclosing boolean.
-- It does not return unseen token IDs, names, positions or image paths.
create or replace function public.can_observe_map_token(p_token uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare t record;actor uuid:=auth.uid();
begin
 if actor is null then return false;end if;
 select id,campaign_id,map_id,owner_id,visible,x,y,span_x,span_y into t
  from public.map_tokens where id=p_token;
 if not found or not public.can_view_campaign_map(t.campaign_id,t.map_id)
 then return false;end if;
 if public.is_campaign_dm(t.campaign_id) then return true;end if;
 if not t.visible then return false;end if;
 if t.owner_id=actor then return true;end if;
 return forge_visibility.point_visible(t.map_id,
  t.x+t.span_x/2.0,t.y+t.span_y/2.0,actor);
end $$;
revoke all on function public.can_observe_map_token(uuid) from public,anon;
grant execute on function public.can_observe_map_token(uuid) to authenticated;
create or replace function public.can_observe_map_position(p_map uuid,
 px double precision,py double precision)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare campaign uuid;
begin
 if auth.uid() is null then return false;end if;
 select campaign_id into campaign from public.battle_maps where id=p_map;
 if campaign is null or not public.can_view_campaign_map(campaign,p_map) then return false;end if;
 if public.is_campaign_dm(campaign) then return true;end if;
 return forge_visibility.point_visible(p_map,px,py,auth.uid());
end $$;
revoke all on function public.can_observe_map_position(uuid,double precision,double precision) from public,anon;
grant execute on function public.can_observe_map_position(uuid,double precision,double precision) to authenticated;

-- Separation axis test: intersection of a barrier with the entire swept
-- footprint, not only final x/y. Touching an outer edge is permitted.
create or replace function forge_visibility.swept_hits_segment(
 x0 double precision,y0 double precision,w double precision,h double precision,
 x1 double precision,y1 double precision,
 ax double precision,ay double precision,bx double precision,by double precision)
returns boolean language plpgsql immutable set search_path='' as $$
declare
 xs double precision[]:=array[x0,x0+w,x0+w,x0,x1,x1+w,x1+w,x1];
 ys double precision[]:=array[y0,y0,y0+h,y0+h,y1,y1,y1+h,y1+h];
 axes double precision[][]:=array[
  array[1.0::double precision,0.0::double precision],
  array[0.0::double precision,1.0::double precision],
  array[-(y1-y0),(x1-x0)],
  array[-(by-ay),(bx-ax)]];
 i int;j int;p double precision;q double precision;
 min1 double precision;max1 double precision;min2 double precision;max2 double precision;
begin
 for i in 1..4 loop
  if abs(axes[i][1])+abs(axes[i][2])<0.0000001 then continue;end if;
  min1:='Infinity'::double precision;max1:='-Infinity'::double precision;
  for j in 1..8 loop
   p:=xs[j]*axes[i][1]+ys[j]*axes[i][2];
   min1:=least(min1,p);max1:=greatest(max1,p);
  end loop;
  p:=ax*axes[i][1]+ay*axes[i][2];
  q:=bx*axes[i][1]+by*axes[i][2];
  min2:=least(p,q);max2:=greatest(p,q);
  if max1<=min2+0.000001 or max2<=min1+0.000001 then return false;end if;
 end loop;
 return true;
end $$;
create or replace function forge_visibility.enforce_collision()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare
 scene jsonb;m record;item jsonb;pts jsonb;a jsonb;b jsonb;i integer;
 val jsonb;required text;raw text; actor uuid:=auth.uid();
 width double precision;height double precision;
begin
 if actor is null or public.is_campaign_dm(new.campaign_id) then return new;end if;
 if new.x=old.x and new.y=old.y then return new;end if;
 if not exists(select 1 from forge_visibility.map_rules
  where map_id=new.map_id and collision_enforced) then return new;end if;
 select live into scene from public.map_environments where map_id=new.map_id;
 select width,height,grid_size into m from public.battle_maps where id=new.map_id;
 if scene is null or jsonb_typeof(scene->'objects')<>'array' or m.grid_size<=0
 then raise exception 'Published collision configuration unavailable';end if;
 width:=floor(m.width/m.grid_size);height:=floor(m.height/m.grid_size);
 if new.x<0 or new.y<0 or new.x+new.span_x>width or
   new.y+new.span_y>height or
   new.span_x<=0 or new.span_y<=0 or new.span_x>12 or new.span_y>12
 then raise exception 'Movement leaves the map bounds';end if;
 val:=coalesce(new.npc_values,'{}'::jsonb);
 if new.character_id is not null then
  select field_values into val from public.characters where id=new.character_id;
  val:=coalesce(val,'{}'::jsonb);
 end if;
 for item in select value from jsonb_array_elements(scene->'objects') loop
  if item->>'type' not in ('wall','door','window') then continue;end if;
  if item->>'type' in ('door','window') and item->>'state'='broken' then continue;end if;
  if forge_visibility.wall_passes(item,val,'movement') then continue;end if;
  pts:=item->'points';
  for i in 1..jsonb_array_length(pts)-1 loop
   a:=pts->(i-1);b:=pts->i;
   if forge_visibility.swept_hits_segment(
     old.x,old.y,old.span_x,old.span_y,new.x,new.y,
     (a->>'x')::double precision,(a->>'y')::double precision,
     (b->>'x')::double precision,(b->>'y')::double precision)
   then raise exception 'Movement blocked by a wall or closed portal';end if;
  end loop;
 end loop;
 return new;
end $$;
drop trigger if exists forge_player_collision on public.map_tokens;
create trigger forge_player_collision before update of x,y on public.map_tokens
 for each row execute function forge_visibility.enforce_collision();
-- No INSERT trigger: the revised INSERT policy below denies unobserved player
-- placements while fog is active; when fog is off existing placement remains.

-- Require observations on every direct Data API / Realtime row read.
drop policy if exists "members view visible tokens" on public.map_tokens;
create policy "members view only observed tokens" on public.map_tokens
 for select to authenticated using(
  public.is_campaign_dm(campaign_id) or
  (visible and public.can_view_campaign_map(campaign_id,map_id)
   and public.can_observe_map_token(id))
 );
-- Owners can still move their own tokens, subject to the collision trigger.
drop policy if exists "player creates own character token on assigned map" on public.map_tokens;
create policy "player creates owned character only where already observed" on public.map_tokens
 for insert to authenticated with check(
  owner_id=auth.uid() and character_id is not null and npc_template_id is null
  and visible=true and npc_values='{}'::jsonb
  and public.can_view_campaign_map(campaign_id,map_id)
  and exists(select 1 from public.characters ch where ch.id=character_id
   and ch.campaign_id=campaign_id and ch.user_id=auth.uid()
   and image_path is not distinct from ch.token_path)
  and public.can_observe_map_position(map_id,x+span_x::double precision/2,
    y+span_y::double precision/2)
 );
drop policy if exists "authorized viewers see sanitized tool map tokens" on public.campaign_tool_map_tokens;
create policy "viewers see only observed map tools" on public.campaign_tool_map_tokens
 for select to authenticated using(
  public.can_view_campaign_map(campaign_id,map_id)
  and public.can_observe_map_position(map_id,x+span::double precision/2,
    y+span::double precision/2)
 );

-- Server-maintained revision updates invalidate *all* player snapshots, even
-- when a newly revealed token was absent from their old RLS-visible stream.
create or replace function forge_visibility.tick_tokens()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
 if tg_op='INSERT' then perform forge_visibility.bump_tick(new.map_id);return new;end if;
 if tg_op='DELETE' then perform forge_visibility.bump_tick(old.map_id);return old;end if;
 if old.x is distinct from new.x or old.y is distinct from new.y or
    old.map_id is distinct from new.map_id or
    old.visible is distinct from new.visible or
    old.span_x is distinct from new.span_x or old.span_y is distinct from new.span_y or
    old.owner_id is distinct from new.owner_id or
    old.npc_values is distinct from new.npc_values then
  perform forge_visibility.bump_tick(new.map_id);
  if old.map_id is distinct from new.map_id then
   perform forge_visibility.bump_tick(old.map_id);
  end if;
 end if;
 return new;
end $$;
drop trigger if exists forge_visibility_token_tick on public.map_tokens;
create trigger forge_visibility_token_tick after insert or update or delete on public.map_tokens
 for each row execute function forge_visibility.tick_tokens();

create or replace function forge_visibility.tick_tools()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
 if tg_op='INSERT' then perform forge_visibility.bump_tick(new.map_id);return new;end if;
 if tg_op='DELETE' then perform forge_visibility.bump_tick(old.map_id);return old;end if;
 if to_jsonb(new)-'updated_at' is distinct from to_jsonb(old)-'updated_at' then
  perform forge_visibility.bump_tick(new.map_id);
  if old.map_id is distinct from new.map_id then
   perform forge_visibility.bump_tick(old.map_id);
  end if;
 end if;
 return new;
end $$;
drop trigger if exists forge_visibility_tool_tick on public.campaign_tool_map_tokens;
create trigger forge_visibility_tool_tick after insert or update or delete on public.campaign_tool_map_tokens
 for each row execute function forge_visibility.tick_tools();
create or replace function forge_visibility.tick_combat()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
 perform forge_visibility.bump_tick(case when tg_op='DELETE' then old.map_id else new.map_id end);
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;
drop trigger if exists forge_visibility_combat_tick on public.map_combats;
create trigger forge_visibility_combat_tick after insert or update or delete on public.map_combats
 for each row execute function forge_visibility.tick_combat();

-- Roll initiative and share a per-viewer roster without exposing private
-- map_combat_entries or the shared participants column to players.
drop policy if exists "members see current map turn tracker" on public.map_combats;
create policy "only dm reads private combat roster" on public.map_combats
 for select to authenticated using(public.is_campaign_dm(campaign_id));
create or replace function public.get_authorized_map_combat(p_map uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.map_combats%rowtype;entries jsonb;who uuid:=auth.uid();
begin
 if who is null then raise exception 'Sign in first';end if;
 select * into c from public.map_combats where map_id=p_map;
 if not found then return null;end if;
 if not public.can_view_campaign_map(c.campaign_id,p_map)
 then raise exception 'Map unavailable';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',e.entry_id,'token_id',t.id,'name',left(t.name,80),
   'kind',case when t.character_id is null then 'npc' else 'character' end,
   'score',e.score
 ) order by e.sort_index,e.entry_id),'[]'::jsonb)
 into entries
 from public.map_combat_entries e
 join public.map_tokens t on t.id=e.token_id
 where e.map_id=p_map and
   (public.is_campaign_dm(c.campaign_id) or
    (t.visible and public.can_observe_map_token(t.id)));
 return jsonb_build_object('map_id',c.map_id,'campaign_id',c.campaign_id,
  'encounter_id',c.encounter_id,'active',c.active,'round',c.round,
  'current_entry_id',case when public.is_campaign_dm(c.campaign_id)
   or exists(select 1 from jsonb_array_elements(entries) entry
     where entry->>'id'=c.current_entry_id::text)
   then c.current_entry_id else null end,
  'initiative_field',c.initiative_field,'initiative_mode',c.initiative_mode,
  'participants',entries,'revision',c.revision);
end $$;
revoke all on function public.get_authorized_map_combat(uuid) from public,anon;
grant execute on function public.get_authorized_map_combat(uuid) to authenticated;

-- Persist only explored cell indices; party sharing joins authorized memory
-- server-side. No player receives other users' individual exploration records.
create or replace function public.get_authorized_map_fog(p_map uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 m record;scene jsonb;is_dm boolean;actor uuid:=auth.uid();
 fog_on boolean;shared boolean;rev bigint;w int;h int;
 seen jsonb:='[]'::jsonb;memory jsonb:='[]'::jsonb;
begin
 if actor is null then raise exception 'Sign in first';end if;
 select campaign_id,width,height,grid_size into m from public.battle_maps where id=p_map;
 if not found or not public.can_view_campaign_map(m.campaign_id,p_map)
 then raise exception 'Map unavailable';end if;
 if m.grid_size<=0 then raise exception 'Invalid map grid';end if;
 w:=floor(m.width/m.grid_size);h:=floor(m.height/m.grid_size);
 select r.fog_enforced into fog_on from forge_visibility.map_rules r where r.map_id=p_map;
 fog_on:=coalesce(fog_on,false);
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
   'revision',rev,'enabled',fog_on,'partyShared',shared,
   'visible',seen,'explored',memory);
 end if;
 with sources as (
  select t.x,t.y,t.span_x,t.span_y from public.map_tokens t
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
  where forge_visibility.point_visible(p_map,cx+0.5,cy+0.5,actor)
 )
 select coalesce(jsonb_agg(cell order by cell),'[]'::jsonb) into seen
 from visible_indices;
 insert into forge_visibility.exploration(campaign_id,map_id,user_id,explored_cells)
 values(m.campaign_id,p_map,actor,seen)
 on conflict(map_id,user_id) do update
  set explored_cells=(select coalesce(jsonb_agg(v order by v),'[]'::jsonb)
   from(select distinct value::integer v from jsonb_array_elements_text(
     forge_visibility.exploration.explored_cells || excluded.explored_cells)) unique_cells),
   revision=forge_visibility.exploration.revision+1,updated_at=now();
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
  'revision',rev,'enabled',true,'partyShared',shared,
  'visible',seen,'explored',coalesce(memory,'[]'::jsonb));
end $$;
revoke all on function public.get_authorized_map_fog(uuid) from public,anon;
grant execute on function public.get_authorized_map_fog(uuid) to authenticated;

-- The DM alone can promote the prepared document to the authoritative live
-- state, disable the published rules, or explicitly erase exploration memory.
create or replace function public.publish_map_environment(p_map uuid,
 p_action text default 'publish')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare m record;scene jsonb;object jsonb;points jsonb;point jsonb;
 width integer;height integer;count_points integer:=0;
 fog_enabled boolean;collision_enabled boolean;rev bigint;
begin
 select campaign_id,width,height,grid_size into m from public.battle_maps where id=p_map;
 if not found or not public.is_campaign_dm(m.campaign_id)
 then raise exception 'DM access required';end if;
 if p_action not in ('publish','disable','reset_exploration')
 then raise exception 'Unsupported map publication action';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_map::text,19221));
 if p_action='reset_exploration' then
  delete from forge_visibility.exploration where map_id=p_map;
  perform forge_visibility.bump_tick(p_map);
  return jsonb_build_object('action',p_action,'mapId',p_map);
 end if;
 if p_action='disable' then
  update forge_visibility.map_rules set fog_enforced=false,
   collision_enforced=false,updated_at=now() where map_id=p_map;
  perform forge_visibility.bump_tick(p_map);
  return jsonb_build_object('action',p_action,'mapId',p_map);
 end if;
 select prepared into scene from public.map_environments where map_id=p_map for update;
 if scene is null or jsonb_typeof(scene->'objects')<>'array' or
    jsonb_array_length(scene->'objects')>120
 then raise exception 'Save a valid map with at most 120 environment objects';end if;
 if m.grid_size<=0 then raise exception 'Invalid grid size';end if;
 width:=floor(m.width/m.grid_size);height:=floor(m.height/m.grid_size);
 fog_enabled:=coalesce((scene->'fog'->>'automatic')::boolean,false);
 collision_enabled:=coalesce((scene->'collision'->>'enabled')::boolean,false);
 if fog_enabled and (width not between 1 and 128 or height not between 1 and 128)
 then raise exception 'Automatic fog supports maps up to 128 grid cells per axis';end if;
 for object in select value from jsonb_array_elements(scene->'objects') loop
  if object->>'type' not in ('wall','door','window','light')
  then raise exception 'Invalid map object type';end if;
  if object->>'type'='light' then
   if jsonb_typeof(object->'x')<>'number' or jsonb_typeof(object->'y')<>'number'
    or (object->>'x')::numeric not between 0 and width
    or (object->>'y')::numeric not between 0 and height
   then raise exception 'Light position outside map';end if;
  else
   points:=object->'points';
   if jsonb_typeof(points)<>'array' or jsonb_array_length(points) not between 2 and 80
   then raise exception 'Invalid wall/portal path';end if;
   count_points:=count_points+jsonb_array_length(points);
   if count_points>2500 then raise exception 'Too many barrier points';end if;
   if object->>'vision' not in ('block','pass','one-way') or
      object->>'oneWay' not in ('a-to-b','b-to-a')
   then raise exception 'Invalid barrier visibility setting';end if;
   for point in select value from jsonb_array_elements(points) loop
    if jsonb_typeof(point->'x')<>'number' or jsonb_typeof(point->'y')<>'number'
     or (point->>'x')::numeric not between 0 and width
     or (point->>'y')::numeric not between 0 and height
    then raise exception 'Barrier path outside map';end if;
   end loop;
  end if;
 end loop;
 update public.map_environments set live=scene,revision=revision+1,
  updated_at=now() where map_id=p_map;
 insert into forge_visibility.map_rules(campaign_id,map_id,fog_enforced,
  collision_enforced,published_revision,updated_at)
 values(m.campaign_id,p_map,fog_enabled,collision_enabled,1,now())
 on conflict(map_id) do update set fog_enforced=excluded.fog_enforced,
  collision_enforced=excluded.collision_enforced,
  published_revision=forge_visibility.map_rules.published_revision+1,updated_at=now();
 perform forge_visibility.bump_tick(p_map);
 return jsonb_build_object('action','publish','mapId',p_map,'fog',fog_enabled,
  'collision',collision_enabled);
end $$;
revoke all on function public.publish_map_environment(uuid,text) from public,anon;
grant execute on function public.publish_map_environment(uuid,text) to authenticated;

-- Removed previously overbroad surface: player-visible combat data is now
-- returned only by get_authorized_map_combat, with per-viewer token checks.
-- Monitor RPCs and Storage artwork policies are further narrowed below.
-- Production function definitions copied and augmented for visibility filtering.
-- Keep existing semantics but deny hidden-token output with fog on.
CREATE OR REPLACE FUNCTION public.get_token_encumbrance_badges(p_map uuid)
 RETURNS TABLE(token_id uuid, icon text, label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select t.id,x.badge->>'icon',x.badge->>'label'
 from public.battle_maps map
 join public.campaigns c on c.id=map.campaign_id
 join public.map_tokens t on t.map_id=map.id and t.campaign_id=c.id
 left join public.characters ch on ch.id=t.character_id and ch.campaign_id=c.id
 cross join lateral (select public.inventory_encumbrance_badge(
   c.sheet_template,
   case when t.character_id is not null then coalesce(ch.field_values,'{}'::jsonb)
        else coalesce(t.npc_values,'{}'::jsonb) end
 ) badge) x
 where map.id=p_map and auth.uid() is not null
  and public.can_view_campaign_map(c.id,map.id)
  and (public.is_campaign_dm(c.id) or (t.visible and public.can_observe_map_token(t.id)))
  and x.badge is not null;
$function$;

-- Keep existing semantics but deny hidden-token output with fog on.
CREATE OR REPLACE FUNCTION public.get_token_monitor_values(p_map uuid)
 RETURNS TABLE(token_id uuid, fields jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with settings as (
 select c.id campaign_id,c.token_display_config cfg,c.sheet_template template,
        public.is_campaign_dm(c.id) dm
 from public.battle_maps m
 join public.campaigns c on c.id=m.campaign_id
 where m.id=p_map
   and (public.is_campaign_dm(c.id)
        or (public.is_campaign_member(c.id) and public.can_view_campaign_map(c.id,p_map)))
), field_keys as (
 select distinct coalesce(w->>'field','') k
 from settings s,lateral jsonb_array_elements(coalesce(s.cfg->'widgets','[]'::jsonb)) w
 union
 select distinct coalesce(w->>'maxField','') k
 from settings s,lateral jsonb_array_elements(coalesce(s.cfg->'widgets','[]'::jsonb)) w
)
select t.id,
 coalesce((
  select jsonb_object_agg(v.key,v.value)
  from (
   select e.key,
          case when jsonb_typeof(e.value)='object' then e.value->'current'
               else e.value end as value
   from jsonb_each(
    case when t.character_id is not null then coalesce(ch.field_values,'{}'::jsonb)
         else coalesce(t.npc_values,'{}'::jsonb) end
   ) e
   where e.key in (select k from field_keys)
   union all
   select e.key||'__max' as key,e.value->'max' as value
   from jsonb_each(
    case when t.character_id is not null then coalesce(ch.field_values,'{}'::jsonb)
         else coalesce(t.npc_values,'{}'::jsonb) end
   ) e
   where e.key||'__max' in (select k from field_keys)
     and jsonb_typeof(e.value)='object'
   union all
   select r->>'code' as key,
    public.token_reference_value(
     s.cfg,s.template,
     case when t.character_id is not null then coalesce(ch.field_values,'{}'::jsonb)
       else coalesce(t.npc_values,'{}'::jsonb) end,
     r->>'code'
    ) as value
   from jsonb_array_elements(
     case when jsonb_typeof(s.cfg->'references')='array'
      then s.cfg->'references' else '[]'::jsonb end) r
   where r->>'code' in (select k from field_keys)
  ) v
  where jsonb_typeof(v.value)='number'
     or (jsonb_typeof(v.value)='string'
         and v.value #>> '{}' ~ '^-?[0-9]{1,7}(\.[0-9]{1,3})?
commit;)
 ),'{}'::jsonb) as fields
from settings s
join public.map_tokens t on t.campaign_id=s.campaign_id and t.map_id=p_map
left join public.characters ch on ch.id=t.character_id and ch.campaign_id=s.campaign_id
where (s.dm or (t.visible and public.can_observe_map_token(t.id)))
  and (
   s.dm
   or (t.character_id is not null
       and (t.owner_id=auth.uid() or s.cfg->>'playerVisibility'='everyone'))
   or (t.character_id is null
       and (s.cfg->>'npcVisibility'='everyone' or t.npc_bars_public))
  );
$function$;

-- Keep existing semantics but deny hidden-token output with fog on.
CREATE OR REPLACE FUNCTION public.roll_map_combat_initiative(p_map uuid, p_entry uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_combat public.map_combats%rowtype;
 v_entry public.map_combat_entries%rowtype;
 v_token public.map_tokens%rowtype;
 v_template jsonb;v_values jsonb:='{}'::jsonb;v_fallback jsonb;
 v_raw text;v_score numeric:=0;v_base numeric:=10;v_step numeric:=2;
 v_has_score boolean:=false;
 v_bonus integer;v_nat integer;v_total integer;v_result jsonb;
 v_is_dm boolean;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select * into v_combat from public.map_combats where map_id=p_map for update;
 if not found or not v_combat.active or
  not public.can_view_campaign_map(v_combat.campaign_id,p_map)
 then raise exception 'Encounter unavailable';end if;
 v_is_dm:=public.is_campaign_dm(v_combat.campaign_id);
 select * into v_entry from public.map_combat_entries
  where map_id=p_map and entry_id=p_entry for update;
 if not found then raise exception 'Combatant not in encounter';end if;
 select * into v_token from public.map_tokens where id=v_entry.token_id;
 if not found or v_token.map_id<>p_map then raise exception 'Token unavailable';end if;
 if not v_is_dm and (not coalesce(v_token.visible,false) or
  v_token.owner_id is distinct from auth.uid())
 then raise exception 'You can only roll for your visible owned token';end if;
 if v_entry.score is not null and not v_is_dm
 then raise exception 'Your initiative has already been rolled';end if;
 select sheet_template into v_template from public.campaigns
  where id=v_combat.campaign_id;
 if v_token.character_id is not null then
  select field_values into v_values from public.characters
   where id=v_token.character_id and campaign_id=v_combat.campaign_id;
  if not found then raise exception 'Character unavailable';end if;
 else
  v_values:=coalesce(v_token.npc_values,'{}'::jsonb);
  if v_values->v_combat.initiative_field is null and v_token.npc_template_id is not null then
   select field_values into v_fallback from public.npc_templates
    where id=v_token.npc_template_id and campaign_id=v_combat.campaign_id;
   v_values:=coalesce(v_fallback,'{}'::jsonb)||v_values;
  end if;
 end if;
 if jsonb_typeof(v_values)<>'object' then v_values:='{}'::jsonb;end if;
 if jsonb_typeof(v_values->v_combat.initiative_field)='object' then
  v_raw:=v_values->v_combat.initiative_field->>'current';
 else v_raw:=v_values->>v_combat.initiative_field;end if;
 if coalesce(v_raw,'')~'^[-]?[0-9]{1,5}([.][0-9]{1,3})?
commit;
 then v_score:=greatest(-1000,least(1000,v_raw::numeric));v_has_score:=true;end if;
 if coalesce(v_template->'modifierRules'->>'base','')~'^[0-9]{1,3}
commit;
 then v_base:=least(100,(v_template->'modifierRules'->>'base')::numeric);end if;
 if coalesce(v_template->'modifierRules'->>'step','')~'^[1-9][0-9]?
commit;
 then v_step:=least(20,(v_template->'modifierRules'->>'step')::numeric);end if;
 v_bonus:=case when v_combat.initiative_mode='modifier'
  then case when v_has_score then floor((v_score-v_base)/v_step)::integer else 0 end
  else round(v_score)::integer end;
 v_bonus:=greatest(-500,least(500,v_bonus));
 v_nat:=floor(random()*20)::integer+1;
 v_total:=v_nat+v_bonus;
 update public.map_combat_entries
 set die_roll=v_nat,modifier=v_bonus,score=v_total where entry_id=p_entry;
 -- Use the existing dice-chat presentation, not a client-selected number.
 v_result:=jsonb_build_object('expression','1d20'||case when v_bonus>=0 then '+' else '' end||v_bonus::text,
  'dice',jsonb_build_array(v_nat),'modifier',v_bonus,'total',v_total);
 insert into public.chat_messages(campaign_id,user_id,map_id,body,kind,result)
 values(v_combat.campaign_id,auth.uid(),p_map,
  'Initiative · '||case when coalesce(v_token.visible,false)
   and not exists(select 1 from forge_visibility.map_rules r
    where r.map_id=p_map and r.fog_enforced)
   then left(coalesce(nullif(v_token.name,''),'Combatant'),60)
   else 'Unknown combatant' end,
  'roll',v_result);
 -- Before the first turn, automatically rank rolled combatants while keeping
 -- unresolved entries last; the DM can re-sort manually during combat later.
 if v_combat.current_entry_id is null then
  with ranked as (
   select entry_id,row_number() over(order by score desc nulls last,sort_index,entry_id)-1 as idx
   from public.map_combat_entries where map_id=p_map
  )
  update public.map_combat_entries e set sort_index=r.idx from ranked r
   where e.entry_id=r.entry_id;
  if not exists(select 1 from public.map_combat_entries where map_id=p_map and score is null) then
   update public.map_combats set current_entry_id=(
    select entry_id from public.map_combat_entries where map_id=p_map
     order by sort_index,entry_id limit 1) where map_id=p_map;
  end if;
 end if;
 perform public.combat_publish(p_map);
 return jsonb_build_object('natural',v_nat,'bonus',v_bonus,'total',v_total);
end $function$;

-- Storage signing must not permit guessing a hidden NPC artwork path.
-- Previously every campaign member could sign ANY tabletop-artwork file.
drop policy if exists "campaign members access artwork" on storage.objects;
create policy "artwork only for dm owned characters and observed map tokens"
 on storage.objects for select to authenticated using (
  bucket_id='tabletop-artwork'
  and exists(
   select 1 from public.campaigns c
   where c.id::text=split_part(name,'/',1)
    and public.is_campaign_member(c.id)
    and (
     public.is_campaign_dm(c.id)
     or exists(
      select 1 from public.characters ch
      where ch.campaign_id=c.id and ch.user_id=auth.uid()
       and (ch.portrait_path=storage.objects.name or ch.token_path=storage.objects.name)
     )
     or exists(
      select 1 from public.map_tokens t
      where t.campaign_id=c.id and t.image_path=storage.objects.name
       and public.can_observe_map_token(t.id)
     )
    )
  )
);

-- No map geometry becomes player-readable.
alter publication supabase_realtime add table public.map_visibility_ticks;
commit;