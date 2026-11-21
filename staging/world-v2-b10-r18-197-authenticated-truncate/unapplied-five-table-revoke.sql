-- B10-R18-197: SOURCE-ONLY, UNAPPLIED authenticated TRUNCATE least privilege.
-- NOT a versioned migration, not approved for original/QA/production.
-- Original PG17 catalog independently confirms each of these five
-- postgres-owned, public RLS-enabled tables has exactly one direct TRUNCATE
-- grant to authenticated, no inherited or PUBLIC alternate source.
-- No table rows, RLS policies, other CRUD grants or service_role ACLs change.
-- Applying to an isolated scratch fixture is not signed hosted security QA.
BEGIN;

REVOKE TRUNCATE ON TABLE
  public.campaign_map_views,
  public.campaign_player_maps,
  public.map_environments,
  public.tabletop_macros,
  public.tabletop_menu_preferences
FROM authenticated;

-- Fail closed if any future role inheritance, PUBLIC grant or owner privilege
-- would keep TRUNCATE effective. The transaction must roll back rather than
-- silently imply that the revocation succeeded.
DO $r197_postcondition$
DECLARE still_executable integer;
BEGIN
  SELECT count(*) INTO still_executable
  FROM (VALUES
    ('public.campaign_map_views'::regclass),
    ('public.campaign_player_maps'::regclass),
    ('public.map_environments'::regclass),
    ('public.tabletop_macros'::regclass),
    ('public.tabletop_menu_preferences'::regclass)
  ) AS target(relation_oid)
  WHERE has_table_privilege('authenticated', target.relation_oid, 'TRUNCATE');

  IF still_executable <> 0 THEN
    RAISE EXCEPTION 'authenticated TRUNCATE still executable on % targeted tables',
      still_executable USING ERRCODE='42501';
  END IF;
END
$r197_postcondition$;

COMMIT;
