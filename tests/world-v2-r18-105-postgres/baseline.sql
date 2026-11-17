-- R18-105: BASELINE historical source behavior, disposable PostgreSQL only.
-- Security test MUST reproduce signed-user cross-campaign fog metadata exposure.
\set ON_ERROR_STOP on
DO $baseline_acl$ BEGIN
 IF has_function_privilege('anon','public.is_map_fog_published(uuid)','EXECUTE') OR
    NOT has_function_privilege('authenticated','public.is_map_fog_published(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'R105 original fog RPC role grants do not match live ACL';
 END IF;
 IF has_table_privilege('authenticated','forge_visibility.map_rules','SELECT') OR
    has_schema_privilege('authenticated','forge_visibility','USAGE') THEN
  RAISE EXCEPTION 'R105 fixture accidentally granted direct fog rules access';
 END IF;
END $baseline_acl$;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);
DO $original_leak$ BEGIN
 IF public.is_map_fog_published('00000000-0000-4000-8000-000000000201') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'R105 historical cross-campaign fog metadata exposure was NOT reproduced';
 END IF;
 IF public.is_map_fog_published('00000000-0000-4000-8000-000000000205') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'R105 historical mismatched-rule fog status was NOT reproduced';
 END IF;
 IF public.is_map_fog_published('00000000-0000-4000-8000-000000000202') IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'R105 original fog-off map should report false';
 END IF;
 IF (SELECT count(*) FROM public.map_combats) <> 0 THEN
  RAISE EXCEPTION 'R105 nonmember could read combat roster through RLS';
 END IF;
END $original_leak$;
COMMIT;
\echo 'R105 ORIGINAL SOURCE BASELINE PASS: signed nonmember can infer private fog status; roster policy still denies nonmember'
