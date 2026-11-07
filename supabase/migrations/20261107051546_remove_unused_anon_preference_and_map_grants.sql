-- Applied to production Supabase via official migration tool, version 20261107051546.
-- Remove SQL privileges that anonymous users did not need. This does NOT
-- modify signed-in member or DM policies, grants, or existing data.
DO $check$
BEGIN
  IF EXISTS(
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public'
      AND p.tablename IN('campaign_map_views','campaign_player_maps','tabletop_menu_preferences')
      AND ('anon'::name=ANY(p.roles) OR 'public'::name=ANY(p.roles))
  ) THEN
    RAISE EXCEPTION 'Refusing to revoke: an anonymous/public RLS policy exists';
  END IF;
END
$check$;

REVOKE ALL PRIVILEGES ON TABLE
 public.campaign_map_views,
 public.campaign_player_maps,
 public.tabletop_menu_preferences
FROM anon;

DO $verify$
BEGIN
  IF EXISTS(
    SELECT 1 FROM pg_class c
    WHERE c.oid IN(
      'public.campaign_map_views'::regclass,
      'public.campaign_player_maps'::regclass,
      'public.tabletop_menu_preferences'::regclass
    )
    AND (
      has_table_privilege('anon',c.oid,'SELECT')
      OR has_table_privilege('anon',c.oid,'INSERT')
      OR has_table_privilege('anon',c.oid,'UPDATE')
      OR has_table_privilege('anon',c.oid,'DELETE')
      OR NOT has_table_privilege('authenticated',c.oid,'SELECT')
      OR NOT c.relrowsecurity
    )
  ) THEN
    RAISE EXCEPTION 'Anonymous privilege cleanup validation failed';
  END IF;
END
$verify$;
