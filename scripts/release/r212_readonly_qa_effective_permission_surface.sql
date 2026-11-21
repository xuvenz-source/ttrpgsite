-- R212: Same original and isolated QA live effective permission profile.
-- SELECT ONLY from PostgreSQL catalogs, no raw SQL, role names, policies,
-- identities, private migration filenames, object names, JWTs, SQL bodies,
-- signed URLs, table rows or secrets returned.
-- Important: TRUNCATE is a table privilege, not gated by row-level security.
-- ALTER/GRANT ALL can establish it without a literal GRANT TRUNCATE token.
WITH app_tables AS (
 SELECT c.oid,c.relrowsecurity,c.relforcerowsecurity
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
), app_functions AS (
 SELECT p.oid,p.prosecdef,
  COALESCE('search_path=""'=ANY(p.proconfig),false) AS empty_path
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f'
), app_policies AS (
 SELECT p.oid,p.polrelid,p.polpermissive,p.polcmd
 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
), storage_policies AS (
 SELECT p.oid,p.polpermissive,p.polcmd
 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='storage' AND c.relname='objects'
)
SELECT
 (SELECT count(*)::int FROM app_tables) AS public_tables,
 (SELECT count(*)::int FROM app_tables WHERE relrowsecurity) AS public_rls_enabled_tables,
 (SELECT count(*)::int FROM app_tables WHERE relforcerowsecurity) AS public_force_rls_tables,
 (SELECT count(*)::int FROM app_tables WHERE NOT relrowsecurity) AS public_rls_disabled_tables,
 (SELECT count(*)::int FROM app_tables t WHERE has_table_privilege('anon', t.oid,'SELECT')) AS public_anon_select_granted_tables,
 (SELECT count(*)::int FROM app_tables t WHERE has_table_privilege('authenticated', t.oid,'SELECT')) AS public_authenticated_select_granted_tables,
 (SELECT count(*)::int FROM app_tables t WHERE has_table_privilege('authenticated', t.oid,'INSERT')) AS public_authenticated_insert_granted_tables,
 (SELECT count(*)::int FROM app_tables t WHERE has_table_privilege('authenticated', t.oid,'UPDATE')) AS public_authenticated_update_granted_tables,
 (SELECT count(*)::int FROM app_tables t WHERE has_table_privilege('authenticated', t.oid,'DELETE')) AS public_authenticated_delete_granted_tables,
 (SELECT count(*)::int FROM app_tables t WHERE has_table_privilege('authenticated', t.oid,'TRUNCATE')) AS public_authenticated_truncate_granted_tables,
 (SELECT count(*)::int FROM app_policies) AS public_policy_count,
 (SELECT count(*)::int FROM app_policies WHERE polpermissive) AS public_permissive_policies,
 (SELECT count(*)::int FROM app_policies WHERE NOT polpermissive) AS public_restrictive_policies,
 (SELECT count(*)::int FROM app_policies WHERE polcmd='r') AS public_select_policies,
 (SELECT count(*)::int FROM app_policies WHERE polcmd='w') AS public_update_policies,
 (SELECT count(*)::int FROM app_policies WHERE polcmd='a') AS public_insert_policies,
 (SELECT count(*)::int FROM app_policies WHERE polcmd='d') AS public_delete_policies,
 (SELECT count(*)::int FROM app_functions) AS public_functions,
 (SELECT count(*)::int FROM app_functions WHERE prosecdef) AS public_security_definer_functions,
 (SELECT count(*)::int FROM app_functions WHERE prosecdef AND has_function_privilege('authenticated',oid,'EXECUTE')) AS public_authenticated_callable_definers,
 (SELECT count(*)::int FROM app_functions WHERE prosecdef AND has_function_privilege('anon',oid,'EXECUTE')) AS public_anon_callable_definers,
 (SELECT count(*)::int FROM app_functions WHERE prosecdef AND empty_path) AS public_empty_path_definers,
 (SELECT count(*)::int FROM storage_policies) AS storage_object_policies,
 (SELECT count(*)::int FROM storage_policies WHERE polpermissive) AS storage_object_permissive_policies,
 (SELECT count(*)::int FROM storage_policies WHERE polcmd='r') AS storage_object_select_policies,
 (SELECT count(*)::int FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) AS public_noninternal_triggers,
 (SELECT count(*)::int FROM pg_catalog.pg_extension) AS installed_extension_count,
 (SELECT count(*)::int FROM pg_catalog.pg_publication_rel) AS publication_relation_count
;
