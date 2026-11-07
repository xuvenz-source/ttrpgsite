-- STAGING ONLY. DM Map setting layer storage. Do not apply to the live database
-- until the map-environment release has been reviewed.
-- Requires battle_maps(campaign_id,id) unique key and is_campaign_dm(uuid).
create table if not exists public.map_environments (
 map_id uuid primary key,
 campaign_id uuid not null,
 prepared jsonb not null default '{"version":1,"ambient":25,"fog":{"automatic":true,"partyShared":true},"effects":{"weather":"none","intensity":0},"objects":[]}'::jsonb,
 live jsonb not null default '{}'::jsonb,
 revision bigint not null default 1 check (revision>=1),
 updated_at timestamptz not null default now(),
 foreign key (campaign_id,map_id) references public.battle_maps(campaign_id,id) on delete cascade,
 constraint map_environments_prepared_object check (jsonb_typeof(prepared)='object'),
 constraint map_environments_live_object check (jsonb_typeof(live)='object')
);
create index if not exists map_environments_campaign_idx
 on public.map_environments(campaign_id);
alter table public.map_environments enable row level security;
revoke all on public.map_environments from anon,public;
grant select,insert,update,delete on public.map_environments to authenticated;
-- Players receive no raw environment rows: hidden walls and unexplored geometry
-- must only be evaluated by later server-side movement/vision functions.
create policy "dm reads prepared map environments" on public.map_environments
 for select to authenticated using (public.is_campaign_dm(campaign_id));
create policy "dm inserts prepared map environments" on public.map_environments
 for insert to authenticated with check (public.is_campaign_dm(campaign_id));
create policy "dm updates prepared map environments" on public.map_environments
 for update to authenticated using (public.is_campaign_dm(campaign_id))
 with check (public.is_campaign_dm(campaign_id));
create policy "dm removes prepared map environments" on public.map_environments
 for delete to authenticated using (public.is_campaign_dm(campaign_id));
-- Realtime subscribers remain protected by the same RLS checks.
alter publication supabase_realtime add table public.map_environments;
