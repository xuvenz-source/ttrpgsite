-- B10-R18-199 — read-only original Storage authorization aggregates.
-- Never returns policy SQL, bucket names, object paths, user records or URLs.
-- No TRUNCATE, DDL, data writes, object downloads or signed URL issuance.
WITH object_table AS (
 SELECT c.oid,c.relrowsecurity,c.relforcerowsecurity
 FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='storage' AND c.relname='objects'
   AND c.relkind IN ('r','p')
), policies AS (
 SELECT p.polcmd,p.polpermissive,p.polroles,
   COALESCE(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'') AS using_expr,
   COALESCE(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'') AS check_expr
 FROM pg_catalog.pg_policy p
 JOIN object_table o ON o.oid=p.polrelid
)
SELECT
 (SELECT count(*) FROM storage.buckets)::int AS storage_buckets_total,
 (SELECT count(*) FROM storage.buckets WHERE public)::int AS storage_buckets_public,
 (SELECT count(*) FROM storage.buckets WHERE NOT public)::int AS storage_buckets_private,
 (SELECT count(*) FROM object_table)::int AS storage_objects_tables,
 (SELECT bool_and(relrowsecurity) FROM object_table) AS objects_rls_enabled,
 (SELECT bool_and(relforcerowsecurity) FROM object_table) AS objects_force_rls,
 (SELECT bool_and(has_table_privilege('authenticated',oid,'SELECT'))
  FROM object_table) AS authenticated_select_grant,
 (SELECT bool_and(has_table_privilege('anon',oid,'SELECT'))
  FROM object_table) AS anon_select_grant,
 (SELECT count(*) FROM policies)::int AS total_policies,
 (SELECT count(*) FROM policies WHERE polcmd IN ('r','*'))::int AS select_applicable_policies,
 (SELECT count(*) FROM policies WHERE polcmd IN ('r','*')
    AND polpermissive)::int AS permissive_select_applicable,
 (SELECT count(*) FROM policies WHERE polcmd IN ('r','*')
    AND NOT polpermissive)::int AS restrictive_select_applicable,
 (SELECT count(*) FROM policies WHERE polcmd IN ('r','*')
    AND ('authenticated'::regrole::oid=ANY(polroles)
      OR 0::oid=ANY(polroles)))::int AS authenticated_or_public_select_policies,
 (SELECT count(*) FROM policies WHERE polcmd IN ('r','*')
    AND (using_expr||check_expr) ~* '\mcampaign_members\M')::int
    AS direct_membership_marker_select_policies,
 (SELECT count(*) FROM policies WHERE polcmd IN ('r','*')
    AND (using_expr||check_expr) ~* 'auth\s*\.\s*uid\s*\(')::int
    AS direct_auth_uid_marker_select_policies,
 (SELECT count(*) FROM policies WHERE polcmd IN ('r','*')
    AND (using_expr||check_expr) ~* '\mcan_view_campaign_map\M')::int
    AS map_view_helper_marker_select_policies,
 (SELECT count(*) FROM policies WHERE polcmd IN ('r','*')
    AND (using_expr||check_expr) ~* '\mbucket_id\M')::int
    AS bucket_marker_select_policies;
