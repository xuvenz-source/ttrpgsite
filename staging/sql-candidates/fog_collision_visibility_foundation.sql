-- SUPERSEDED DESIGN DRAFT. DO NOT APPLY THIS FILE. Use fog_collision_authoritative_release.sql only.
-- STAGING CANDIDATE ONLY — DO NOT APPLY TO PRODUCTION.
-- Foundation for authoritative fog/collision; intentionally NOT activation.
-- The player-readable map_tokens policy must remain unchanged until all
-- observed-token, artwork, monitor and combat paths have been audited.
-- Existing map_environments.live is DM-only; this migration never publishes
-- geometry or changes its RLS/Realtime settings.
begin;

-- This private schema is not in Supabase Data API exposed schemas.
create schema if not exists forge_visibility;
revoke all on schema forge_visibility from public,anon,authenticated;

-- A missing record and every new record mean enforcement is OFF.
-- Application users are not allowed to flip these flags from the Data API.
create table if not exists forge_visibility.map_rules (
 campaign_id uuid not null,
 map_id uuid primary key,
 fog_enforced boolean not null default false,
 collision_enforced boolean not null default false,
 published_revision bigint not null default 0 check(published_revision>=0),
 updated_at timestamptz not null default now(),
 foreign key(campaign_id,map_id)
  references public.battle_maps(campaign_id,id) on delete cascade
);
alter table forge_visibility.map_rules enable row level security;
revoke all on forge_visibility.map_rules from public,anon,authenticated;
comment on table forge_visibility.map_rules is
 'Private feature gates. Defaults off. Only enable after authoritative player visibility, audited RLS, trigger enforcement and DM testing are deployed.';

-- Persisted fog memory is per user and per map. No player can INSERT,
-- SELECT or UPDATE another person's visibility data through PostgREST.
-- Visible cells must be computed on demand; do not persist them here.
create table if not exists forge_visibility.exploration (
 campaign_id uuid not null,
 map_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 explored_cells jsonb not null default '[]'::jsonb,
 revision bigint not null default 0 check(revision>=0),
 updated_at timestamptz not null default now(),
 primary key(map_id,user_id),
 foreign key(campaign_id,map_id)
  references public.battle_maps(campaign_id,id) on delete cascade,
 constraint explored_cells_array check(
  jsonb_typeof(explored_cells)='array' and
  jsonb_array_length(explored_cells)<=65536
 )
);
create index if not exists fog_exploration_actor
 on forge_visibility.exploration(campaign_id,user_id);
alter table forge_visibility.exploration enable row level security;
revoke all on forge_visibility.exploration from public,anon,authenticated;
comment on table forge_visibility.exploration is
 'Private server-maintained exploration. Never expose directly: party-shared exploration must be authorized and merged on the server.';

-- For this stage no trigger, RPC or RLS policy turns on either feature.
-- A later reviewed migration must atomically install:
-- 1. published live environment validation and explicit DM publish/reset,
-- 2. geometry collision checks in ALL token movement write paths,
-- 3. player-specific observed-token reads with strict Data API/Realtime RLS,
-- 4. server-produced fog masks and exploration cache refresh/invalidation,
-- 5. authorized sanitized combat/monitor/artwork surfaces,
-- 6. controlled activation after live DM + player validation.
commit;
