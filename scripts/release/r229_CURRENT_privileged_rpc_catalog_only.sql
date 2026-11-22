-- R229 LIVE ORIGINAL PRIVILEGED-RPC REVIEW: metadata-only SELECT.
-- SOURCE-ONLY, NEVER RUN BY CI AND NEVER AUTHORIZE RELEASE.
-- Evaluates pg_proc.prosrc text INSIDE PostgreSQL only; outputs counts.
-- NO source definitions, real application rows, object identifiers, secrets or URLs.
WITH RECURSIVE catalog_routines AS (
 SELECT p.oid,p.proname,n.nspname,p.prosrc,p.prosecdef,p.prokind,
        p.proconfig,p.proacl,p.proowner,
        o.rolname AS owner_name,o.rolbypassrls AS owner_bypassrls
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_catalog.pg_roles o ON o.oid=p.proowner
 WHERE n.nspname IN ('public','forge_visibility')
), roots AS (
 SELECT *
 FROM catalog_routines p
 WHERE p.nspname='public'
   AND p.prosecdef AND p.prokind='f'
   AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
), edges AS (
 SELECT caller.oid AS source_oid,callee.oid AS dest_oid
 FROM catalog_routines caller JOIN catalog_routines callee ON
    lower(caller.prosrc) ~
      (callee.nspname||'[[:space:]]*[.][[:space:]]*'||
       callee.proname||'[[:space:]]*[(]')
), walk AS (
 SELECT r.oid AS root_oid,r.oid AS node_oid,ARRAY[r.oid]::oid[] AS seen,0 AS depth
 FROM roots r
 UNION ALL
 SELECT w.root_oid,e.dest_oid,w.seen||e.dest_oid,w.depth+1
 FROM walk w
 JOIN edges e ON e.source_oid=w.node_oid
 WHERE w.depth<7 AND NOT e.dest_oid=ANY(w.seen)
), closure AS (
 SELECT w.root_oid,
        bool_or(p.prosrc ~* 'auth[.]uid[[:space:]]*[(]') AS uid_in_static_call_closure,
        bool_or(p.prosrc ~* '(is_campaign_member|is_campaign_dm|can_view_campaign_map)[[:space:]]*[(]')
           AS common_member_guard_in_static_call_closure
 FROM walk w JOIN catalog_routines p ON p.oid=w.node_oid
 GROUP BY w.root_oid
)
SELECT
 count(*)::int AS privileged_public_authenticated_functions,
 count(*) FILTER(WHERE r.owner_name='postgres')::int AS postgres_owned,
 count(*) FILTER(WHERE r.owner_bypassrls)::int AS bypassrls_owned,
 count(*) FILTER(WHERE r.proconfig @> ARRAY['search_path=""']::text[])::int AS empty_search_path,
 count(*) FILTER(WHERE r.proacl::text LIKE '%authenticated=X/%')::int AS explicit_authenticated_acl,
 count(*) FILTER(WHERE pg_catalog.has_function_privilege('anon',r.oid,'EXECUTE'))::int AS anon_execute,
 count(*) FILTER(WHERE r.prosrc ~* 'auth[.]uid[[:space:]]*[(]')::int AS uid_direct_marker,
 count(*) FILTER(WHERE NOT r.prosrc ~* 'auth[.]uid[[:space:]]*[(]')::int AS uid_direct_absent,
 count(*) FILTER(WHERE c.uid_in_static_call_closure)::int AS uid_direct_or_static_callee,
 count(*) FILTER(WHERE NOT c.uid_in_static_call_closure)::int AS uid_static_closure_absent,
 count(*) FILTER(WHERE c.common_member_guard_in_static_call_closure)::int AS common_member_guard_lex,
 count(*) FILTER(WHERE r.prosrc ~* '(insert[[:space:]]+into|update[[:space:]]+|delete[[:space:]]+from|truncate[[:space:]]+)')::int AS write_word_lex,
 count(*) FILTER(WHERE r.prosrc ~* '(execute[[:space:]]+|format[[:space:]]*[(]|quote_ident[[:space:]]*[(])')::int AS dynamic_sql_word_lex,
 count(*) FILTER(WHERE r.prosrc ~* '(raw_user_meta_data|user_metadata)')::int AS editable_metadata_word_lex,
 count(*) FILTER(WHERE r.prosrc ~* 'exception[[:space:]]+when')::int AS exception_word_lex
FROM roots r JOIN closure c ON c.root_oid=r.oid;
