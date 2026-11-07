-- Staged only: apply to the existing Supabase database before deploying held-tool UI.
-- Do not recreate schemas or bulk-replay old migrations.
alter table public.campaign_tool_issues
 add column if not exists held_by_token_id uuid references public.map_tokens(id) on delete set null;
create index if not exists campaign_tool_issues_carrier_idx
 on public.campaign_tool_issues(held_by_token_id)
 where held_by_token_id is not null;

alter table public.campaign_tool_map_tokens
 add column if not exists held_by_token_id uuid references public.map_tokens(id) on delete set null;

-- Existing tool configs without holdable remain valid and are not holdable by default.
do $checks$ begin
 if not exists(select 1 from pg_constraint where conname='campaign_tool_templates_holdable_bool'
  and conrelid='public.campaign_tool_templates'::regclass) then
  alter table public.campaign_tool_templates add constraint campaign_tool_templates_holdable_bool
   check(not (config ? 'holdable') or jsonb_typeof(config->'holdable')='boolean');
 end if;
 if not exists(select 1 from pg_constraint where conname='campaign_tool_issues_holdable_bool'
  and conrelid='public.campaign_tool_issues'::regclass) then
  alter table public.campaign_tool_issues add constraint campaign_tool_issues_holdable_bool
   check(not (config ? 'holdable') or jsonb_typeof(config->'holdable')='boolean');
 end if;
end $checks$;

-- Keep carrier authorization in the database, not just in client drag handlers.
create or replace function public.validate_campaign_tool_write()
returns trigger language plpgsql security definer set search_path='' as $write$
declare v_map record;v_carrier record;v_old_carrier record;v_span int;v_dm boolean;
begin
 v_dm:=public.is_campaign_dm(new.campaign_id);
 if tg_op='UPDATE' then
  if new.id<>old.id or new.campaign_id<>old.campaign_id then
   raise exception 'Tool identity cannot change';end if;
  if not v_dm then
   if (to_jsonb(new)-'state'-'map_id'-'x'-'y'-'held_by_token_id'-'updated_at'-'revision')
    is distinct from
    (to_jsonb(old)-'state'-'map_id'-'x'-'y'-'held_by_token_id'-'updated_at'-'revision') then
    raise exception 'Players may not reconfigure or reassign issued tools';end if;
   if new.state->'attrs' is distinct from old.state->'attrs' then
    raise exception 'Only the DM may change mount attributes';end if;
   if old.held_by_token_id is not null then
    select t.owner_id into v_old_carrier
     from public.map_tokens t where t.id=old.held_by_token_id;
    if found and v_old_carrier.owner_id is distinct from (select auth.uid()) then
     if new.held_by_token_id is distinct from old.held_by_token_id
      or new.map_id is distinct from old.map_id
      or new.x is distinct from old.x or new.y is distinct from old.y then
      raise exception 'Only the current carrier or DM can drop a held tool';
     end if;
    end if;
   end if;
  end if;
  new.revision:=old.revision+1;
 else
  if not v_dm then raise exception 'Only DMs may issue tools';end if;
  new.revision:=0;
 end if;
 if tg_op='INSERT' then
  if not new.party_shared and not exists(
   select 1 from public.campaign_members cm
   where cm.campaign_id=new.campaign_id and cm.user_id=new.owner_id
  ) then raise exception 'Tool recipient must belong to campaign';end if;
 elsif new.owner_id is distinct from old.owner_id or
       new.party_shared is distinct from old.party_shared then
  if not new.party_shared and not exists(
   select 1 from public.campaign_members cm
   where cm.campaign_id=new.campaign_id and cm.user_id=new.owner_id
  ) then raise exception 'Tool recipient must belong to campaign';end if;
 end if;
 if new.template_id is not null and not exists(
  select 1 from public.campaign_tool_templates t
  where t.id=new.template_id and t.campaign_id=new.campaign_id
 ) then raise exception 'Tool template belongs to another campaign';end if;
 if new.map_id is not null then
  select m.id,m.campaign_id,m.width,m.height,m.grid_size into v_map
   from public.battle_maps m where m.id=new.map_id;
  if not found or v_map.campaign_id<>new.campaign_id then
   raise exception 'Tool map must belong to campaign';end if;
  if not v_dm and not public.can_view_campaign_map(new.campaign_id,new.map_id) then
   raise exception 'Cannot place a tool on an unauthorized map';end if;
  v_span:=case when new.kind='mount' then (new.config->>'span')::int else 1 end;
  if v_map.grid_size<=0 or new.x<0 or new.y<0
   or new.x+v_span>floor(v_map.width/nullif(v_map.grid_size,0))
   or new.y+v_span>floor(v_map.height/nullif(v_map.grid_size,0))
   then raise exception 'Tool position is outside map bounds';end if;
 end if;
 if new.held_by_token_id is not null then
  if jsonb_typeof(new.config->'holdable') is distinct from 'boolean'
   or new.config->>'holdable'<>'true' then
   raise exception 'This tool is not configured to be held';end if;
  select t.campaign_id,t.map_id,t.owner_id,t.visible into v_carrier
   from public.map_tokens t where t.id=new.held_by_token_id;
  if not found or v_carrier.campaign_id is distinct from new.campaign_id
   or v_carrier.map_id is distinct from new.map_id then
   raise exception 'Tool carrier must be on the same campaign map';end if;
  if not v_dm and (v_carrier.owner_id is distinct from (select auth.uid())
    or v_carrier.visible is not true) then
   raise exception 'You cannot attach a tool to that token';end if;
 end if;
 new.updated_at:=now();
 return new;
end $write$;
revoke all on function public.validate_campaign_tool_write() from public,anon,authenticated;

-- The sanitized map projection retains light metadata but not private inventory.
-- While held, the client draws its glow at the carrier token instead of an extra tool icon.
create or replace function public.sync_campaign_tool_map_token()
returns trigger language plpgsql security definer set search_path='' as $sync$
begin
 if tg_op='DELETE' then
  delete from public.campaign_tool_map_tokens where issue_id=old.id;
  return old;
 end if;
 if tg_op='UPDATE'
  and new.map_id is not distinct from old.map_id
  and new.x=old.x and new.y=old.y
  and new.kind=old.kind and new.name=old.name and new.icon=old.icon
  and new.config is not distinct from old.config
  and new.state->'lit' is not distinct from old.state->'lit'
  and new.held_by_token_id is not distinct from old.held_by_token_id
 then return new; end if;
 if new.map_id is null then
  delete from public.campaign_tool_map_tokens where issue_id=new.id;
 else
  insert into public.campaign_tool_map_tokens(
   issue_id,campaign_id,map_id,name,icon,kind,x,y,span,
   light_bright,light_dim,light_color,light_intensity,light_enabled,
   held_by_token_id,updated_at
  ) values (
   new.id,new.campaign_id,new.map_id,new.name,new.icon,new.kind,new.x,new.y,
   case when new.kind='mount' then (new.config->>'span')::int else 1 end,
   case when new.kind='torch' then (new.config->>'bright')::int else 0 end,
   case when new.kind='torch' then (new.config->>'dim')::int else 0 end,
   coalesce(new.config->>'color','#ffce7a'),
   case when new.kind='torch' then (new.config->>'intensity')::int else 0 end,
   new.kind='torch' and (new.state->>'lit')::boolean,
   new.held_by_token_id,now()
  ) on conflict(issue_id) do update set
   campaign_id=excluded.campaign_id,map_id=excluded.map_id,
   name=excluded.name,icon=excluded.icon,kind=excluded.kind,
   x=excluded.x,y=excluded.y,span=excluded.span,
   light_bright=excluded.light_bright,light_dim=excluded.light_dim,
   light_color=excluded.light_color,light_intensity=excluded.light_intensity,
   light_enabled=excluded.light_enabled,
   held_by_token_id=excluded.held_by_token_id,updated_at=now();
 end if;
 return new;
end $sync$;
revoke all on function public.sync_campaign_tool_map_token() from public,anon,authenticated;

-- A carrier is a moved light source, not a tool left at its old map position.
-- Without this change the authoritative fog calculation still illuminates
-- the original pickup square even after the player walks away.
create or replace function forge_visibility.is_lit(p_map uuid,scene jsonb,
 viewer_x double precision,viewer_y double precision,
 target_x double precision,target_y double precision,
 grid_size integer)
returns boolean language plpgsql stable security definer set search_path='' as $lit$
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
  select case when t.id is null then p.x+0.5 else t.x+t.span_x/2.0 end as cx,
   case when t.id is null then p.y+0.5 else t.y+t.span_y/2.0 end as cy,
   p.light_bright,p.light_dim
  from public.campaign_tool_map_tokens p
  left join public.map_tokens t on t.id=p.held_by_token_id
   and t.map_id=p_map and t.visible
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
end $lit$;

-- An attached token is visible at the carrier's *current* position. Never
-- reveal its old pickup coordinates in RLS when the carrier has moved.
drop policy if exists "viewers see only observed map tools" on public.campaign_tool_map_tokens;
create policy "viewers see only observed map tools"
 on public.campaign_tool_map_tokens for select to authenticated
 using(
  public.can_view_campaign_map(campaign_id,map_id) and
  ((held_by_token_id is null and
    public.can_observe_map_position(map_id,x+span::double precision/2,
     y+span::double precision/2))
   or (held_by_token_id is not null and exists(
    select 1 from public.map_tokens carrier
    where carrier.id=held_by_token_id
     and carrier.map_id=campaign_tool_map_tokens.map_id
     and carrier.campaign_id=campaign_tool_map_tokens.campaign_id
     and carrier.visible
     and public.can_observe_map_position(carrier.map_id,
      carrier.x+carrier.span_x::double precision/2,
      carrier.y+carrier.span_y::double precision/2)
   )))
 );

-- An attachment/detachment is carried in a hand; it is not a separate
-- ground token traversing the intervening wall. All non-held tool movement
-- continues to use swept collision enforcement.
create or replace function forge_visibility.enforce_tool_collision()
returns trigger language plpgsql volatile security definer set search_path='' as $collision$
declare
 scene jsonb;m record;item jsonb;pts jsonb;a jsonb;b jsonb;i integer;
 span double precision;w double precision;h double precision;
 attrs jsonb;
begin
 if auth.uid() is null or public.is_campaign_dm(new.campaign_id) then return new;end if;
 if new.held_by_token_id is not null or old.held_by_token_id is not null
 then return new;end if;
 if new.map_id is null then return new;end if;
 if not exists(select 1 from forge_visibility.map_rules r where r.map_id=new.map_id
  and (r.collision_enforced or r.fog_enforced)) then return new;end if;
 if old.map_id is null or old.map_id is distinct from new.map_id
 then raise exception 'Ask the DM to place this tool on a published map';end if;
 if old.x=new.x and old.y=new.y then return new;end if;
 if not exists(select 1 from forge_visibility.map_rules r where r.map_id=new.map_id
  and r.collision_enforced) then return new;end if;
 select live into scene from public.map_environments where map_id=new.map_id;
 select bm.width,bm.height,bm.grid_size into m from public.battle_maps bm where bm.id=new.map_id;
 if scene is null or jsonb_typeof(scene->'objects')<>'array' or m.grid_size<=0
 then raise exception 'Published collision configuration unavailable';end if;
 span:=case when new.kind='mount' then (new.config->>'span')::double precision else 1.0 end;
 w:=floor(m.width/m.grid_size);h:=floor(m.height/m.grid_size);
 if span<1 or span>4 or new.x<0 or new.y<0 or
    new.x+span>w or new.y+span>h
 then raise exception 'Tool movement leaves the map bounds';end if;
 attrs:=coalesce(new.state->'attrs','{}'::jsonb);
 for item in select value from jsonb_array_elements(scene->'objects') loop
  if item->>'type' not in ('wall','door','window') or
    item->>'state'='broken' then continue;end if;
  if forge_visibility.wall_passes(item,attrs,'movement') then continue;end if;
  pts:=item->'points';
  for i in 1..jsonb_array_length(pts)-1 loop
   a:=pts->(i-1);b:=pts->i;
   if forge_visibility.swept_hits_segment(
     old.x,old.y,span,span,new.x,new.y,
     (a->>'x')::double precision,(a->>'y')::double precision,
     (b->>'x')::double precision,
     (b->>'y')::double precision)
   then raise exception 'Tool movement blocked by a wall or closed portal';end if;
  end loop;
 end loop;
 return new;
end $collision$;
