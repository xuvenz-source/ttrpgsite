-- Disposable PostgreSQL 17 only. Synthetic identities and rows; NEVER point at production.
-- The 13 affected CREATE POLICY expressions were read from live pg_policies
-- on 10 November 2026, before any staged migration was applied.
create role authenticated nologin;
create role anon nologin;
create schema if not exists auth;
create schema if not exists realtime;
create schema if not exists test;
grant usage on schema public,auth,realtime to authenticated;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function realtime.topic() returns text language sql stable as $$
 select current_setting('request.realtime_topic',true)
$$;
create table public.campaigns(
 id uuid primary key, owner_id uuid, name text
);
create table public.campaign_members(
 campaign_id uuid,user_id uuid,role text
);
create table public.battle_maps(
 id uuid primary key,campaign_id uuid,name text
);
create table public.characters(
 id uuid primary key,campaign_id uuid,user_id uuid,name text,token_path text
);
create table public.map_tokens(
 id uuid primary key,campaign_id uuid,map_id uuid,owner_id uuid,
 character_id uuid,npc_template_id uuid,visible boolean default true,
 npc_values jsonb default '{}'::jsonb,image_path text,
 x integer default 1,y integer default 1,
 span_x numeric default 1,span_y numeric default 1
);
create table public.tabletop_macros(
 id uuid primary key,campaign_id uuid,user_id uuid,name text
);
create table public.tabletop_menu_preferences(
 campaign_id uuid,user_id uuid,expanded jsonb default '{}'::jsonb
);
create table realtime.messages(topic text,extension text,payload jsonb);
create function public.is_campaign_member(p_campaign uuid) returns boolean
 language sql stable as $$
 select exists(select 1 from public.campaign_members m
   where m.campaign_id=p_campaign and m.user_id=auth.uid())
$$;
create function public.is_campaign_dm(p_campaign uuid) returns boolean
 language sql stable as $$
 select exists(select 1 from public.campaign_members m
   where m.campaign_id=p_campaign and m.user_id=auth.uid() and m.role='dm')
$$;
create function public.can_view_campaign_map(p_campaign uuid,p_map uuid) returns boolean
 language sql stable as $$
 select public.is_campaign_member(p_campaign) and exists(
 select 1 from public.battle_maps m
 where m.id=p_map and m.campaign_id=p_campaign)
$$;
create function public.can_player_place_map_piece(p_map uuid,px double precision,py double precision)
 returns boolean language sql stable as $$
 select exists(select 1 from public.battle_maps m where m.id=p_map)
   and px between 0 and 50 and py between 0 and 50
$$;
grant select on public.campaign_members,public.battle_maps to authenticated;
grant select,insert,update,delete on public.campaigns,public.characters,
 public.map_tokens,public.tabletop_macros,public.tabletop_menu_preferences,
 realtime.messages to authenticated;
-- Seed under fixture owner so synthetic setup never depends on RLS.
insert into public.campaigns values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Test'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','Private');
insert into public.campaign_members values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','dm'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','player'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','dm');
insert into public.battle_maps values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Main'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Private');
insert into public.characters values
 ('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','DM','dm.png'),
 ('55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','Hero','hero.png');
insert into public.tabletop_macros values
 ('66666666-6666-4666-8666-666666666666','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','DM macro'),
 ('77777777-7777-4777-8777-777777777777','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','Player macro');
insert into public.tabletop_menu_preferences(campaign_id,user_id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222');
insert into realtime.messages values
 ('ignored-by-policy','broadcast','{}'),
 ('ignored-by-policy','presence','{}');
alter table public.campaigns enable row level security;
alter table public.characters enable row level security;
alter table public.map_tokens enable row level security;
alter table public.tabletop_macros enable row level security;
alter table public.tabletop_menu_preferences enable row level security;
alter table realtime.messages enable row level security;
-- SELECT is required for UPDATE in PostgreSQL; production has broader SELECT
-- policies, preserved as this fixture-only prerequisite.
create policy "fixture dm reads campaigns" on public.campaigns
 for select to authenticated using (public.is_campaign_member(id));
create policy "dm edit campaigns" on "public"."campaigns"
 as permissive for update to authenticated
 using (is_campaign_dm(id))
 with check ((is_campaign_dm(id) AND (owner_id = auth.uid())));

create policy "owner or dm read characters" on "public"."characters"
 as permissive for select to authenticated
 using ((is_campaign_member(campaign_id) AND ((user_id = auth.uid()) OR is_campaign_dm(campaign_id))));

create policy "owners or dm edit characters" on "public"."characters"
 as permissive for update to authenticated
 using ((((user_id = auth.uid()) OR is_campaign_dm(campaign_id)) AND is_campaign_member(campaign_id)))
 with check ((((user_id = auth.uid()) OR is_campaign_dm(campaign_id)) AND is_campaign_member(campaign_id)));

create policy "player creates owned character only where already observed" on "public"."map_tokens"
 as permissive for insert to authenticated
 with check (((owner_id = auth.uid()) AND (character_id IS NOT NULL) AND (npc_template_id IS NULL) AND (visible = true) AND (npc_values = '{}'::jsonb) AND can_view_campaign_map(campaign_id, map_id) AND (EXISTS ( SELECT 1
   FROM characters ch
  WHERE ((ch.id = map_tokens.character_id) AND (ch.campaign_id = ch.campaign_id) AND (ch.user_id = auth.uid()) AND (NOT (map_tokens.image_path IS DISTINCT FROM ch.token_path))))) AND can_player_place_map_piece(map_id, ((x)::double precision + ((span_x)::double precision / (2)::double precision)), ((y)::double precision + ((span_y)::double precision / (2)::double precision)))));

create policy "owner creates campaign macros" on "public"."tabletop_macros"
 as permissive for insert to authenticated
 with check (((user_id = auth.uid()) AND is_campaign_member(campaign_id)));

create policy "owner edits campaign macros" on "public"."tabletop_macros"
 as permissive for update to authenticated
 using (((user_id = auth.uid()) AND is_campaign_member(campaign_id)))
 with check (((user_id = auth.uid()) AND is_campaign_member(campaign_id)));

create policy "owner reads campaign macros" on "public"."tabletop_macros"
 as permissive for select to authenticated
 using (((user_id = auth.uid()) AND is_campaign_member(campaign_id)));

create policy "owner removes campaign macros" on "public"."tabletop_macros"
 as permissive for delete to authenticated
 using (((user_id = auth.uid()) AND is_campaign_member(campaign_id)));

create policy "Members create own sidebar menus" on "public"."tabletop_menu_preferences"
 as permissive for insert to authenticated
 with check (((auth.uid() = user_id) AND is_campaign_member(campaign_id)));

create policy "Members edit own sidebar menus" on "public"."tabletop_menu_preferences"
 as permissive for update to authenticated
 using (((auth.uid() = user_id) AND is_campaign_member(campaign_id)))
 with check (((auth.uid() = user_id) AND is_campaign_member(campaign_id)));

create policy "Members read own sidebar menus" on "public"."tabletop_menu_preferences"
 as permissive for select to authenticated
 using (((auth.uid() = user_id) AND is_campaign_member(campaign_id)));

create policy "World V2 private observers receive only their map stream" on "realtime"."messages"
 as permissive for select to authenticated
 using (((extension = 'broadcast'::text) AND
CASE
    WHEN (( SELECT realtime.topic() AS topic) ~ '^forge-world-v2:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) THEN (((split_part(( SELECT realtime.topic() AS topic), ':'::text, 3))::uuid = auth.uid()) AND (EXISTS ( SELECT 1
       FROM battle_maps bm
      WHERE ((bm.id = (split_part(( SELECT realtime.topic() AS topic), ':'::text, 2))::uuid) AND can_view_campaign_map(bm.campaign_id, bm.id)))))
    ELSE false
END));

create policy "forge observer motion receive" on "realtime"."messages"
 as permissive for select to authenticated
 using (((extension = 'broadcast'::text) AND
CASE
    WHEN (( SELECT realtime.topic() AS topic) ~ '^forge-observer:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text) THEN (((split_part(( SELECT realtime.topic() AS topic), ':'::text, 3))::uuid = auth.uid()) AND (EXISTS ( SELECT 1
       FROM battle_maps m
      WHERE ((m.id = (split_part(( SELECT realtime.topic() AS topic), ':'::text, 2))::uuid) AND can_view_campaign_map(m.campaign_id, m.id)))))
    ELSE false
END));

-- Immutable policy contract: command, roles, permissiveness, and USING/CHECK
-- presence must be unchanged after initPlan rewrite.
create table test.baseline_policies as
select schemaname,tablename,policyname,permissive,roles,cmd,
 qual is not null as has_using,with_check is not null as has_check
from pg_policies where policyname <> 'fixture dm reads campaigns';
do $$
begin
 if (select count(*) from test.baseline_policies)<>13
 then raise exception 'Expected all 13 real policies in isolated fixture';
 end if;
end $$;
