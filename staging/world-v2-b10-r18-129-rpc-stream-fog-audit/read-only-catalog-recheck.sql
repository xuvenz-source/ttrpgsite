-- R18-129 READ ONLY catalog recheck. May be run later after explicit approval
-- against ORIGINAL for metadata drift; not run by CI and no remote credentials.
-- No full function bodies, table rows, JWTs, user IDs, map coordinates,
-- campaign identifiers, signed links, secret values or privileged writes.
-- Results cannot authorize release by themselves.

-- Public authenticated-callable SECURITY DEFINER function signatures and
-- server-side SQL definition MD5. The absence of guard *text* is NOT proof
-- of an authorization vulnerability (delegated/indirect checks may exist).
SELECT 'privileged_public_rpc' AS kind,
 p.proname AS name,
 pg_get_function_identity_arguments(p.oid) AS signature,
 md5(pg_get_functiondef(p.oid)) AS source_md5,
 (pg_get_functiondef(p.oid) ILIKE '%can_view_campaign_map%') AS text_map_guard,
 (pg_get_functiondef(p.oid) ILIKE '%is_campaign_member%') AS text_member_guard,
 (pg_get_functiondef(p.oid) ILIKE '%is_campaign_dm%') AS text_dm_guard,
 (pg_get_functiondef(p.oid) ILIKE '%campaign_members%') AS text_membership_ref
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
 AND has_function_privilege('authenticated',p.oid,'EXECUTE')
ORDER BY p.proname,signature;

-- Direct emitting function catalog covers only three app schemas and known
-- static call tokens. It cannot discover dynamic/external/Edge publishers.
SELECT 'direct_app_realtime_sender' AS kind,
 n.nspname||'.'||p.proname AS name,
 pg_get_function_identity_arguments(p.oid) AS signature,
 md5(pg_get_functiondef(p.oid)) AS source_md5
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prokind='f' AND n.nspname IN ('public','forge_world_v2','forge_visibility')
 AND (pg_get_functiondef(p.oid) ILIKE '%realtime.send%'
      OR pg_get_functiondef(p.oid) ILIKE '%realtime.broadcast_changes%'
      OR pg_get_functiondef(p.oid) ILIKE '%pg_notify%')
ORDER BY name,signature;

-- Published table inventory only; does not read published row data.
SELECT 'published_realtime_table' AS kind,
 pub.schemaname,pub.tablename,c.relrowsecurity AS rls_enabled,
 has_table_privilege('authenticated',c.oid,'SELECT') AS auth_select
FROM pg_publication_tables pub
JOIN pg_namespace n ON n.nspname=pub.schemaname
JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=pub.tablename
WHERE pub.pubname='supabase_realtime'
ORDER BY pub.schemaname,pub.tablename;

-- Channel policy names/counts, and two engine schema exposure flags.
SELECT 'realtime_channel_policy' AS kind,policyname,cmd,permissive,roles
FROM pg_policies WHERE schemaname='realtime' AND tablename='messages'
ORDER BY policyname,cmd;
SELECT 'private_schema_usage' AS kind,n.nspname,
 has_schema_privilege('authenticated',n.oid,'USAGE') AS signed_role_usage,
 has_schema_privilege('anon',n.oid,'USAGE') AS anonymous_role_usage
FROM pg_namespace n WHERE n.nspname IN ('forge_world_v2','forge_visibility')
ORDER BY n.nspname;
