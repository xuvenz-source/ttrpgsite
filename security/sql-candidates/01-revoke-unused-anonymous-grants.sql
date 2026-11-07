-- REVIEW CANDIDATE ONLY. Not deployed or part of supabase/migrations.
-- Three tables contain personal menu/map preferences or per-user map selection.
-- Their existing RLS policies explicitly target authenticated. 'anon'
-- table grants serve no current login flow and should be removed as defense in depth.
--
-- Preconditions:
--   * All policies on these three tables have roles = {authenticated}.
--   * Authenticated user operations still function during a browser/role test.
--   * A migration file must be generated through the Supabase CLI after review.
--
-- Exact SQL recommended for reviewed migration:
do $preflight$
begin
  if exists (
    select 1
    from pg_policies p
    where p.schemaname='public'
      and p.tablename in (
        'campaign_map_views',
        'campaign_player_maps',
        'tabletop_menu_preferences'
      )
      and ('anon'::name = any(p.roles)
           or 'public'::name = any(p.roles))
  ) then
    raise exception 'Found a public/anon RLS policy: aborting privilege change';
  end if;
end
$preflight$;

revoke all privileges on table
  public.campaign_map_views,
  public.campaign_player_maps,
  public.tabletop_menu_preferences
from anon;

-- Verify after migration:
-- select relname, has_table_privilege('anon',oid,'select') anon_can_select
-- from pg_class where oid in (
-- 'public.campaign_map_views'::regclass,
-- 'public.campaign_player_maps'::regclass,
-- 'public.tabletop_menu_preferences'::regclass);
