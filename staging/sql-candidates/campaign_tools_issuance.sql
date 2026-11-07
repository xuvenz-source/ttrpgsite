-- STAGING CANDIDATE ONLY. DO NOT APPLY TO PRODUCTION.
-- Convert into a versioned Supabase migration with the CLI and run role tests
-- before a coordinated backend/frontend release. This candidate costs no
-- additional hosting tier and creates no background workers.

create or replace function public.valid_campaign_tool_config(p_kind text,p_config jsonb)
returns boolean language plpgsql immutable set search_path='' as $config$
declare v jsonb;v_attr record;
begin
 if p_kind not in ('torch','mount','inventory') or
  jsonb_typeof(p_config)<>'object' or octet_length(p_config::text)>4096 then return false;end if;
 if p_kind='torch' then
  if (p_config ?& array['bright','dim','color','intensity']) is false then return false;end if;
  if (p_config->>'bright') !~ '^([0-9]|[1-9][0-9]|1[01][0-9]|120)$'
   or (p_config->>'dim') !~ '^([0-9]|[1-9][0-9]|1[01][0-9]|120)$'
   or (p_config->>'intensity') !~ '^([0-9]|[1-9][0-9]|100)$'
   or (p_config->>'color') !~ '^#[0-9a-fA-F]{6}$'
  then return false;end if;
 else
  if p_config->>'inventoryMode' not in ('list','grid') then return false;end if;
  if (p_config->>'columns') !~ '^([2-9]|1[0-9]|20)$'
   or (p_config->>'rows') !~ '^([2-9]|1[0-9]|20)$' then return false;end if;
  if p_kind='mount' then
   if (p_config->>'span') !~ '^[1-4]$' then return false;end if;
   v:=p_config->'attributes';
   if jsonb_typeof(v)<>'object' or (select count(*) from jsonb_object_keys(v))>16 then return false;end if;
   for v_attr in select key,value from jsonb_each(v) loop
    if v_attr.key !~ '^[a-z][a-z0-9_]{0,31}$'
     or jsonb_typeof(v_attr.value)<>'number' or
     abs((v_attr.value #>> '{}')::numeric)>10000 then return false;end if;
   end loop;
  end if;
 end if;
 return true;
exception when others then return false;
end $config$;

create or replace function public.valid_campaign_tool_state(p_state jsonb)
returns boolean language plpgsql immutable set search_path='' as $state$
declare v_item jsonb;v_stat record;v_items jsonb;v_attrs jsonb;
begin
 if jsonb_typeof(p_state)<>'object' or octet_length(p_state::text)>120000
  or (p_state - 'items' - 'attrs' - 'lit') <> '{}'::jsonb then return false;end if;
 v_items:=p_state->'items';v_attrs:=p_state->'attrs';
 if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)>250
  or jsonb_typeof(v_attrs)<>'object' or (select count(*) from jsonb_object_keys(v_attrs))>16
  or jsonb_typeof(p_state->'lit')<>'boolean' then return false;end if;
 for v_item in select value from jsonb_array_elements(v_items) loop
  if jsonb_typeof(v_item)<>'object' or octet_length(v_item::text)>4096 then return false;end if;
 end loop;
 for v_stat in select key,value from jsonb_each(v_attrs) loop
  if v_stat.key !~ '^[a-z][a-z0-9_]{0,31}$'
   or jsonb_typeof(v_stat.value)<>'number'
   or abs((v_stat.value #>> '{}')::numeric)>10000 then return false;end if;
 end loop;
 return true;
exception when others then return false;
end $state$;
revoke all on function public.valid_campaign_tool_config(text,jsonb) from public,anon;
revoke all on function public.valid_campaign_tool_state(jsonb) from public,anon;
grant execute on function public.valid_campaign_tool_config(text,jsonb) to authenticated;
grant execute on function public.valid_campaign_tool_state(jsonb) to authenticated;

create table if not exists public.campaign_tool_templates(
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80),
 kind text not null check(kind in ('torch','mount','inventory')),
 icon text not null check(length(icon) between 1 and 12),
 config jsonb not null,
 created_at timestamptz not null default now(),
 constraint campaign_tool_templates_valid_config
  check(public.valid_campaign_tool_config(kind,config))
);
create index if not exists campaign_tool_templates_campaign_idx
 on public.campaign_tool_templates(campaign_id,created_at);
-- Keep templates within their original campaign even if a DM manages several.
create or replace function public.protect_campaign_tool_template_identity()
returns trigger language plpgsql set search_path='' as $identity$
begin
 if new.id is distinct from old.id or new.campaign_id is distinct from old.campaign_id
 then raise exception 'Tool template identity cannot change'; end if;
 return new;
end $identity$;
revoke all on function public.protect_campaign_tool_template_identity()
 from public,anon,authenticated;
create trigger campaign_tool_template_identity
before update on public.campaign_tool_templates
for each row execute function public.protect_campaign_tool_template_identity();


create table if not exists public.campaign_tool_issues(
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 template_id uuid references public.campaign_tool_templates(id) on delete set null,
 owner_id uuid references auth.users(id) on delete cascade,
 party_shared boolean not null default false,
 name text not null check(length(trim(name)) between 1 and 80),
 kind text not null check(kind in ('torch','mount','inventory')),
 icon text not null check(length(icon) between 1 and 12),
 config jsonb not null,
 state jsonb not null default '{"items":[],"attrs":{},"lit":true}'::jsonb,
 map_id uuid references public.battle_maps(id) on delete set null,
 x integer not null default 0,y integer not null default 0,
 revision bigint not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint campaign_tool_issues_recipient
  check ((party_shared and owner_id is null) or
         (not party_shared and owner_id is not null)),
 constraint campaign_tool_issues_config
  check(public.valid_campaign_tool_config(kind,config)),
 constraint campaign_tool_issues_state
  check(public.valid_campaign_tool_state(state))
);
create index if not exists campaign_tool_issues_campaign_idx
 on public.campaign_tool_issues(campaign_id,owner_id);
create index if not exists campaign_tool_issues_map_idx
 on public.campaign_tool_issues(campaign_id,map_id) where map_id is not null;

-- This table contains only player-safe visual fields. It intentionally lacks
-- private inventory rows, attributes, template IDs and recipient metadata.
create table if not exists public.campaign_tool_map_tokens(
 issue_id uuid primary key references public.campaign_tool_issues(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 map_id uuid not null references public.battle_maps(id) on delete cascade,
 name text not null,icon text not null,kind text not null,
 x integer not null,y integer not null,span integer not null default 1,
 light_bright integer not null default 0,light_dim integer not null default 0,
 light_color text not null default '#ffce7a',
 light_intensity integer not null default 0,
 light_enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
create index if not exists campaign_tool_map_tokens_map_idx
 on public.campaign_tool_map_tokens(campaign_id,map_id);

-- Trigger rejects mismatched campaigns, map coordinates and player attempts
-- to reassign a tool, edit its configuration, or change a mount's attributes.
create or replace function public.validate_campaign_tool_write()
returns trigger language plpgsql security definer set search_path='' as $write$
declare v_map record;v_span int;v_dm boolean;
begin
 v_dm:=public.is_campaign_dm(new.campaign_id);
 if tg_op='UPDATE' then
  if new.id<>old.id or new.campaign_id<>old.campaign_id then
   raise exception 'Tool identity cannot change';end if;
  if not v_dm then
   if (to_jsonb(new)-'state'-'map_id'-'x'-'y'-'updated_at'-'revision')
    is distinct from
    (to_jsonb(old)-'state'-'map_id'-'x'-'y'-'updated_at'-'revision') then
    raise exception 'Players may not reconfigure or reassign issued tools';end if;
   if new.state->'attrs' is distinct from old.state->'attrs' then
    raise exception 'Only the DM may change mount attributes';end if;
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
   or new.x+v_span>floor(v_map.width/v_map.grid_size)
   or new.y+v_span>floor(v_map.height/v_map.grid_size)
   then raise exception 'Tool position is outside map bounds';end if;
 end if;
 new.updated_at:=now();
 return new;
end $write$;
revoke all on function public.validate_campaign_tool_write() from public,anon,authenticated;
create trigger campaign_tool_validate_issue
before insert or update on public.campaign_tool_issues
for each row execute function public.validate_campaign_tool_write();

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
 then return new; end if;
 if new.map_id is null then
  delete from public.campaign_tool_map_tokens where issue_id=new.id;
 else
  insert into public.campaign_tool_map_tokens(
   issue_id,campaign_id,map_id,name,icon,kind,x,y,span,
   light_bright,light_dim,light_color,light_intensity,light_enabled,updated_at
  ) values (
   new.id,new.campaign_id,new.map_id,new.name,new.icon,new.kind,new.x,new.y,
   case when new.kind='mount' then (new.config->>'span')::int else 1 end,
   case when new.kind='torch' then (new.config->>'bright')::int else 0 end,
   case when new.kind='torch' then (new.config->>'dim')::int else 0 end,
   coalesce(new.config->>'color','#ffce7a'),
   case when new.kind='torch' then (new.config->>'intensity')::int else 0 end,
   new.kind='torch' and (new.state->>'lit')::boolean,
   now()
  ) on conflict(issue_id) do update set
   campaign_id=excluded.campaign_id,map_id=excluded.map_id,
   name=excluded.name,icon=excluded.icon,kind=excluded.kind,
   x=excluded.x,y=excluded.y,span=excluded.span,
   light_bright=excluded.light_bright,light_dim=excluded.light_dim,
   light_color=excluded.light_color,light_intensity=excluded.light_intensity,
   light_enabled=excluded.light_enabled,updated_at=now();
 end if;
 return new;
end $sync$;
revoke all on function public.sync_campaign_tool_map_token() from public,anon,authenticated;
create trigger campaign_tool_sync_map
after insert or update or delete on public.campaign_tool_issues
for each row execute function public.sync_campaign_tool_map_token();

alter table public.campaign_tool_templates enable row level security;
alter table public.campaign_tool_issues enable row level security;
alter table public.campaign_tool_map_tokens enable row level security;
revoke all on public.campaign_tool_templates from anon,authenticated;
revoke all on public.campaign_tool_issues from anon,authenticated;
revoke all on public.campaign_tool_map_tokens from anon,authenticated;
grant select,insert,update,delete on public.campaign_tool_templates to authenticated;
grant select,insert,update,delete on public.campaign_tool_issues to authenticated;
grant select on public.campaign_tool_map_tokens to authenticated;

create policy "dm read tool library" on public.campaign_tool_templates
 for select to authenticated using(public.is_campaign_dm(campaign_id));
create policy "dm create tool templates" on public.campaign_tool_templates
 for insert to authenticated with check(public.is_campaign_dm(campaign_id));
create policy "dm edit tool templates" on public.campaign_tool_templates
 for update to authenticated using(public.is_campaign_dm(campaign_id))
 with check(public.is_campaign_dm(campaign_id));
create policy "dm delete tool templates" on public.campaign_tool_templates
 for delete to authenticated using(public.is_campaign_dm(campaign_id));

create policy "recipient or dm read issued tool" on public.campaign_tool_issues
 for select to authenticated using(
  public.is_campaign_dm(campaign_id) or
  (public.is_campaign_member(campaign_id) and
   (party_shared or owner_id=(select auth.uid())))
 );
create policy "dm issue tools" on public.campaign_tool_issues
 for insert to authenticated with check(public.is_campaign_dm(campaign_id));
create policy "recipient or dm edit issued state and position" on public.campaign_tool_issues
 for update to authenticated
 using(public.is_campaign_dm(campaign_id) or
  (public.is_campaign_member(campaign_id) and
   (party_shared or owner_id=(select auth.uid()))))
 with check(public.is_campaign_dm(campaign_id) or
  (public.is_campaign_member(campaign_id) and
   (party_shared or owner_id=(select auth.uid()))));
create policy "dm withdraw tools" on public.campaign_tool_issues
 for delete to authenticated using(public.is_campaign_dm(campaign_id));

create policy "authorized viewers see sanitized tool map tokens"
 on public.campaign_tool_map_tokens for select to authenticated
 using(public.can_view_campaign_map(campaign_id,map_id));

-- Player clients have no INSERT/UPDATE/DELETE privileges on map tokens.
-- Only the validated issued-tool trigger maintains public visual state.
-- Realtime notifications are advisory: clients re-fetch RLS-scoped snapshots.
do $publication$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables
   where pubname='supabase_realtime' and schemaname='public'
     and tablename='campaign_tool_issues') then
   alter publication supabase_realtime add table public.campaign_tool_issues;
  end if;
  if not exists(select 1 from pg_publication_tables
   where pubname='supabase_realtime' and schemaname='public'
     and tablename='campaign_tool_map_tokens') then
   alter publication supabase_realtime add table public.campaign_tool_map_tokens;
  end if;
  if not exists(select 1 from pg_publication_tables
   where pubname='supabase_realtime' and schemaname='public'
     and tablename='campaign_tool_templates') then
   alter publication supabase_realtime add table public.campaign_tool_templates;
  end if;
 end if;
end $publication$;
