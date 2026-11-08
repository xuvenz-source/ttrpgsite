-- READ-ONLY checks after the approved v2 SQL has been installed.
-- Do not run these until rollout approval; these queries are not a migration.
-- Audit the browser Data API separately with actual DM and two player JWTs.
-- Do not expose campaign IDs, user IDs, maps, sight or hidden NPC data.

select to_regclass('public.map_viewer_visibility_ticks') is not null as table_exists,
 exists(select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public'
   and tablename='map_viewer_visibility_ticks') as realtime_published,
 (select relrowsecurity from pg_class
  where oid=to_regclass('public.map_viewer_visibility_ticks')) as rls_enabled,
 has_table_privilege('anon','public.map_viewer_visibility_ticks','SELECT')
  as anon_can_select,
 has_table_privilege('authenticated','public.map_viewer_visibility_ticks','SELECT')
  as authenticated_can_select,
 has_table_privilege('authenticated','public.map_viewer_visibility_ticks','INSERT')
  as authenticated_can_insert,
 has_table_privilege('authenticated','public.map_viewer_visibility_ticks','UPDATE')
  as authenticated_can_update,
 has_table_privilege('authenticated','public.map_viewer_visibility_ticks','DELETE')
  as authenticated_can_delete;

select has_function_privilege(
 'anon','public.get_authorized_map_fog_v2(uuid)','EXECUTE') as anon_can_read_v2,
 has_function_privilege(
 'authenticated','public.get_authorized_map_fog_v2(uuid)','EXECUTE') as authenticated_can_read_v2,
 has_function_privilege(
 'authenticated','forge_visibility.bump_tick_scoped(uuid,uuid[])','EXECUTE') as player_can_bump,
 has_function_privilege(
 'authenticated','forge_visibility.viewers_affected_by_token_move(public.map_tokens,public.map_tokens)','EXECUTE')
 as player_can_select_viewers;

select policyname,cmd,roles,qual from pg_policies
where schemaname='public' and tablename='map_viewer_visibility_ticks';

-- No per-player visibility values, only aggregate revision counts.
select count(*) as viewer_revision_rows,
 count(distinct map_id) as maps_tracked,
 count(*) filter(where fog_enforced) as rows_with_fog_enabled
from public.map_viewer_visibility_ticks;

-- Follow up with actual role-scoped UI tests:
-- * Player A sees only their own map_id/user_id row; player B sees none of A.
-- * A distant unrelated NPC move does NOT increment player A's revision.
-- * The moving owner's revision increments; shared-party viewers increment.
-- * NPC entering/leaving A's sight increments A, immediately conceals if lost.
-- * Light-carrying token, doors, walls, vision-attribute and reset exploration
--   conservatively invalidate every player who can view that map.
-- * DM continues to use legacy map_visibility_ticks; unknown-v2 clients too.
-- * No stale sight on disconnect, tab hidden, map reassignment and restart.
-- * Compare RLS select results and actual fog masks with legacy to verify
--   authorization equality. Record request and memory deltas on matching load.
