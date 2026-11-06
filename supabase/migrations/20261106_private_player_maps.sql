-- STAGING ONLY: private per-player map assignments and map-scoped chat.
-- Apply after 20261106_token_reference_codes.sql and multiple-character migration.
-- No live DDL is applied until the batch is approved.

-- Enforce map/campaign consistency in both assignments and chat.
alter table public.battle_maps
 add constraint battle_maps_campaign_id_id_key unique(campaign_id,id);

create table public.campaign_player_maps (
 campaign_id uuid not null,
 user_id uuid not null,
 map_id uuid,
 primary key(campaign_id,user_id),
 foreign key(campaign_id,user_id) references public.campaign_members(campaign_id,user_id) on delete cascade,
 foreign key(campaign_id,map_id) references public.battle_maps(campaign_id,id) on delete set null (map_id)
);
alter table public.campaign_player_maps enable row level security;
grant select,insert,update,delete on public.campaign_player_maps to authenticated;
create policy "read own or dm map assignments" on public.campaign_player_maps
 for select to authenticated
 using (public.is_campaign_dm(campaign_id)
  or (user_id=(select auth.uid()) and public.is_campaign_member(campaign_id)));
create policy "dm controls player map assignments" on public.campaign_player_maps
 for all to authenticated
 using (public.is_campaign_dm(campaign_id))
 with check (public.is_campaign_dm(campaign_id));

-- The DM's own current map is persisted for map-scoped dice and spell chat.
create table public.campaign_map_views (
 campaign_id uuid not null,
 user_id uuid not null,
 map_id uuid not null,
 primary key(campaign_id,user_id),
 foreign key(campaign_id,user_id) references public.campaign_members(campaign_id,user_id) on delete cascade,
 foreign key(campaign_id,map_id) references public.battle_maps(campaign_id,id) on delete cascade
);
alter table public.campaign_map_views enable row level security;
grant select,insert,update,delete on public.campaign_map_views to authenticated;
create policy "dm controls own viewed map" on public.campaign_map_views
 for all to authenticated
 using (user_id=(select auth.uid()) and public.is_campaign_dm(campaign_id))
 with check (user_id=(select auth.uid()) and public.is_campaign_dm(campaign_id));

-- Access is always checked on the server. Unassigned players follow the
-- campaign's published party map; assigned players see ONLY their own map.
create or replace function public.can_view_campaign_map(p_campaign uuid,p_map uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_map is not null and auth.uid() is not null and exists(
  select 1 from public.campaign_members member
  join public.campaigns c on c.id=member.campaign_id
  left join public.campaign_player_maps override
    on override.campaign_id=member.campaign_id and override.user_id=member.user_id
  where member.campaign_id=p_campaign and member.user_id=auth.uid()
    and (member.role='dm' or p_map=coalesce(override.map_id,c.active_map_id))
 );
$$;
revoke all on function public.can_view_campaign_map(uuid,uuid) from public,anon;
grant execute on function public.can_view_campaign_map(uuid,uuid) to authenticated;

drop policy if exists "published map or dm" on public.battle_maps;
create policy "published map or dm" on public.battle_maps
 for select to authenticated
 using (public.can_view_campaign_map(campaign_id,id));

drop policy if exists "members view visible tokens" on public.map_tokens;
create policy "members view visible tokens" on public.map_tokens
 for select to authenticated
 using (public.is_campaign_dm(campaign_id)
  or (visible and public.can_view_campaign_map(campaign_id,map_id)));

drop policy if exists "dm or owner update tokens" on public.map_tokens;
create policy "dm or owner update tokens" on public.map_tokens
 for update to authenticated
 using (public.is_campaign_dm(campaign_id)
  or (owner_id=(select auth.uid()) and visible
   and public.can_view_campaign_map(campaign_id,map_id)))
 with check (public.is_campaign_dm(campaign_id)
  or (owner_id=(select auth.uid()) and visible
   and public.can_view_campaign_map(campaign_id,map_id)));

drop policy if exists "player creates own character token on active map" on public.map_tokens;
create policy "player creates own character token on assigned map" on public.map_tokens
 for insert to authenticated
 with check (
  owner_id=(select auth.uid()) and character_id is not null
  and npc_template_id is null and visible=true and npc_values='{}'::jsonb
  and public.can_view_campaign_map(campaign_id,map_id)
  and exists (
   select 1 from public.characters ch
   where ch.id=map_tokens.character_id
    and ch.campaign_id=map_tokens.campaign_id
    and ch.user_id=(select auth.uid())
    and map_tokens.image_path is not distinct from ch.token_path
  )
 );

-- Map image bytes must follow the same access rules as the map row.
drop policy if exists "dm read maps" on storage.objects;
create policy "dm read maps" on storage.objects
 for select to authenticated
 using (bucket_id='battlemap-assets'
  and name ~ '^[0-9a-f-]{36}/'
  and exists(select 1 from public.battle_maps bm
   where bm.storage_path=objects.name and
    public.can_view_campaign_map(bm.campaign_id,bm.id)));

-- Even RPC-produced dice/spell/macro messages are scoped to the current map.
alter table public.chat_messages add column map_id uuid;
alter table public.chat_messages
 add constraint chat_messages_campaign_map_fk
 foreign key(campaign_id,map_id) references public.battle_maps(campaign_id,id) on delete set null (map_id);
update public.chat_messages msg
 set map_id=c.active_map_id
 from public.campaigns c where msg.campaign_id=c.id
  and msg.map_id is null and c.active_map_id is not null;
create index chat_messages_campaign_map_created_idx
 on public.chat_messages(campaign_id,map_id,created_at desc);

create or replace function public.scope_campaign_chat_map()
returns trigger language plpgsql security definer set search_path='' as $$
declare assigned uuid; view_map uuid; party_map uuid; is_dm boolean;
begin
 if auth.uid() is null or new.user_id is distinct from auth.uid() then
  raise exception 'Chat sender must be the signed-in member';
 end if;
 if not public.is_campaign_member(new.campaign_id) then
  raise exception 'You are not a campaign member';
 end if;
 select c.active_map_id,public.is_campaign_dm(c.id) into party_map,is_dm
 from public.campaigns c where c.id=new.campaign_id;
 if is_dm then
  select v.map_id into view_map from public.campaign_map_views v
  where v.campaign_id=new.campaign_id and v.user_id=auth.uid();
 else
  select a.map_id into assigned from public.campaign_player_maps a
  where a.campaign_id=new.campaign_id and a.user_id=auth.uid();
 end if;
 new.map_id:=coalesce(new.map_id,
   case when is_dm then coalesce(view_map,party_map)
        else coalesce(assigned,party_map) end);
 if new.map_id is not null and not public.can_view_campaign_map(new.campaign_id,new.map_id) then
  raise exception 'Not allowed to write to this map';
 end if;
 -- A player may not post a map-less message after a party map is published.
 if not is_dm and new.map_id is null and party_map is not null then
  raise exception 'A map is required for campaign chat';
 end if;
 return new;
end $$;
drop trigger if exists scope_campaign_chat_map on public.chat_messages;
create trigger scope_campaign_chat_map before insert on public.chat_messages
 for each row execute function public.scope_campaign_chat_map();
revoke all on function public.scope_campaign_chat_map() from public,anon,authenticated;

drop policy if exists "members read chat" on public.chat_messages;
create policy "members read chat" on public.chat_messages
 for select to authenticated
 using (public.is_campaign_dm(campaign_id)
  or (public.is_campaign_member(campaign_id)
   and (map_id is null or public.can_view_campaign_map(campaign_id,map_id))));

drop policy if exists "members post text" on public.chat_messages;
create policy "members post text" on public.chat_messages
 for insert to authenticated
 with check (public.is_campaign_member(campaign_id)
  and user_id=(select auth.uid()) and kind='text'
  and result is null
  and (map_id is null or public.can_view_campaign_map(campaign_id,map_id)));

-- Existing privileged monitor/reference RPCs must also validate assignment,
-- not the campaign's globally published map. Keep their signatures unchanged.
do $patch$
declare definition text; amended text;
begin
 select pg_get_functiondef(p.oid) into definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='get_token_monitor_values'
  and pg_get_function_identity_arguments(p.oid)='p_map uuid';
 if definition is null then raise exception 'Missing token monitor function';end if;
 amended:=replace(definition,'c.active_map_id=p_map',
  'public.can_view_campaign_map(c.id,p_map)');
 if amended=definition then raise exception 'Expected monitor map check not found';end if;
 execute amended;

 select pg_get_functiondef(p.oid) into definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='post_token_reference'
  and pg_get_function_identity_arguments(p.oid)='p_token uuid, p_code text';
 if definition is null then raise exception 'Apply token reference migration first';end if;
 amended:=replace(definition,'v_token.owner_id=auth.uid()',
  'v_token.owner_id=auth.uid() and public.can_view_campaign_map(v_token.campaign_id,v_token.map_id)');
 if amended=definition then raise exception 'Expected reference ownership guard not found';end if;
 execute amended;
end $patch$;

-- Restrict map folder names to the DM: players only need assigned map data.
-- The existing map-folder SELECT policy is already DM-only.
