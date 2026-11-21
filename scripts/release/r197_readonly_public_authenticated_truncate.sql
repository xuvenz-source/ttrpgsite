-- R18-197 original Supabase PG17 read-only role/ACL evidence.
-- Returns aggregate counts/booleans only; never returns records or function SQL.
-- Only issue #306's five known public table names, no original private migration SQL.
WITH published AS (
 SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity,n.nspname
 FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
), chosen AS (
 SELECT * FROM published
 WHERE relname IN ('campaign_map_views','campaign_player_maps',
                   'map_environments','tabletop_macros',
                   'tabletop_menu_preferences')
), grants AS (
 SELECT c.oid,a.grantee,a.grantor,a.privilege_type,a.is_grantable
 FROM chosen c
 CROSS JOIN LATERAL pg_catalog.aclexplode(
   COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
), auth AS (
 SELECT oid,rolsuper,rolinherit,rolbypassrls
 FROM pg_catalog.pg_roles WHERE rolname='authenticated'
)
SELECT
 (SELECT count(*) FROM published)::int AS public_tables,
 (SELECT count(*) FROM published WHERE has_table_privilege('authenticated',oid,'TRUNCATE'))::int
   AS authenticated_effective_truncate_tables,
 (SELECT count(*) FROM chosen)::int AS chosen_tables,
 (SELECT count(*) FROM chosen WHERE relrowsecurity)::int AS chosen_rls_enabled,
 (SELECT count(*) FROM chosen WHERE pg_get_userbyid(relowner)='postgres')::int
   AS chosen_postgres_owned,
 (SELECT count(*) FROM chosen WHERE has_schema_privilege('authenticated',nspname,'USAGE'))::int
   AS chosen_authenticated_schema_usage,
 (SELECT count(*) FROM chosen WHERE has_table_privilege('authenticated',oid,'TRUNCATE'))::int
   AS chosen_effective_auth_truncate,
 (SELECT count(*) FROM chosen WHERE has_table_privilege('authenticated',oid,'SELECT'))::int
   AS chosen_effective_auth_select,
 (SELECT count(*) FROM chosen WHERE has_table_privilege('authenticated',oid,'INSERT'))::int
   AS chosen_effective_auth_insert,
 (SELECT count(*) FROM chosen WHERE has_table_privilege('authenticated',oid,'UPDATE'))::int
   AS chosen_effective_auth_update,
 (SELECT count(*) FROM chosen WHERE has_table_privilege('authenticated',oid,'DELETE'))::int
   AS chosen_effective_auth_delete,
 (SELECT count(*) FROM grants g JOIN auth a ON a.oid=g.grantee
   WHERE g.privilege_type='TRUNCATE')::int AS direct_auth_truncate_entries,
 (SELECT count(*) FROM grants WHERE grantee=0 AND privilege_type='TRUNCATE')::int
   AS public_truncate_entries,
 (SELECT count(*) FROM grants g JOIN auth a ON true
   WHERE g.privilege_type='TRUNCATE' AND g.grantee NOT IN (a.oid,0)
     AND pg_catalog.pg_has_role(a.oid,g.grantee,'USAGE'))::int
   AS inherited_auth_truncate_entries,
 (SELECT count(*) FROM chosen c JOIN auth a
   ON pg_catalog.pg_has_role(a.oid,c.relowner,'USAGE'))::int
   AS inherits_owner_on_chosen,
 (SELECT count(*) FROM grants g WHERE g.privilege_type='TRUNCATE'
   AND g.is_grantable)::int AS any_truncate_grant_option_entries,
 (SELECT bool_and(rolsuper) FROM auth) AS auth_superuser,
 (SELECT bool_and(rolbypassrls) FROM auth) AS auth_bypassrls,
 (SELECT bool_and(rolinherit) FROM auth) AS auth_inherits_roles,
 (SELECT count(*) FROM published
   WHERE has_table_privilege('anon',oid,'TRUNCATE'))::int AS anon_truncate_public_tables,
 (SELECT count(*) FROM published
   WHERE has_table_privilege('service_role',oid,'TRUNCATE'))::int
   AS service_role_truncate_public_tables;
