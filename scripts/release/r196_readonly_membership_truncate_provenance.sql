-- R18-196 read-only original Supabase catalog provenance.
-- Only fixed aggregate numeric/boolean fields; no table rows, SQL body or secrets.
-- Re-run only on independently confirmed original project as SELECT-only.
WITH target AS (
 SELECT c.oid,c.relowner,c.relacl,c.relrowsecurity
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='campaign_members' AND c.relkind IN ('r','p')
), acl AS (
 SELECT a.grantee,a.grantor,a.privilege_type,a.is_grantable
 FROM target t CROSS JOIN LATERAL
   pg_catalog.aclexplode(COALESCE(t.relacl,pg_catalog.acldefault('r',t.relowner))) a
), service AS (
 SELECT r.oid,r.rolsuper,r.rolinherit,r.rolbypassrls
 FROM pg_catalog.pg_roles r WHERE r.rolname='service_role'
), inbound AS (
 SELECT DISTINCT fk.conrelid
 FROM pg_catalog.pg_constraint fk JOIN target t ON t.oid=fk.confrelid
 WHERE fk.contype='f'
), f AS (
 SELECT p.prosrc
 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','forge_visibility','forge_security') AND p.prokind='f'
)
SELECT
 (SELECT count(*) FROM target)::int AS membership_tables,
 (SELECT count(*) FROM service)::int AS service_roles,
 (SELECT bool_and(rolsuper) FROM service) AS service_role_superuser,
 (SELECT bool_and(rolinherit) FROM service) AS service_role_inherits,
 (SELECT bool_and(rolbypassrls) FROM service) AS service_role_bypasses_rls,
 (SELECT bool_and(relrowsecurity) FROM target) AS campaign_members_rls,
 (SELECT bool_and(pg_catalog.pg_has_role(s.oid,t.relowner,'USAGE'))
    FROM target t CROSS JOIN service s) AS service_inherits_table_owner,
 (SELECT count(*) FROM acl a JOIN service s ON a.grantee=s.oid
    WHERE a.privilege_type='TRUNCATE')::int AS direct_service_truncate_grant_entries,
 (SELECT count(*) FROM acl a WHERE a.grantee=0 AND a.privilege_type='TRUNCATE')::int
    AS public_truncate_grant_entries,
 (SELECT count(*) FROM acl a JOIN service s ON true
    WHERE a.privilege_type='TRUNCATE' AND a.grantee NOT IN (s.oid,0)
      AND pg_catalog.pg_has_role(s.oid,a.grantee,'USAGE'))::int
    AS inherited_other_role_truncate_grants,
 (SELECT count(*) FROM acl
    WHERE privilege_type='TRUNCATE' AND is_grantable)::int AS truncate_grant_options_count,
 (SELECT count(*) FROM pg_catalog.pg_trigger g JOIN target t ON t.oid=g.tgrelid
    WHERE NOT g.tgisinternal AND (g.tgtype & 32)<>0 AND g.tgenabled IN ('O','A'))::int
    AS enabled_user_truncate_triggers,
 (SELECT count(*) FROM pg_catalog.pg_trigger g JOIN target t ON t.oid=g.tgrelid
    WHERE NOT g.tgisinternal AND (g.tgtype & 8)<>0 AND g.tgenabled IN ('O','A'))::int
    AS enabled_user_delete_triggers,
 (SELECT count(*) FROM inbound)::int AS inbound_referencing_tables,
 (SELECT count(*) FROM inbound
    WHERE has_table_privilege('service_role',conrelid,'TRUNCATE'))::int
    AS service_role_truncate_on_referencing_tables,
 (SELECT count(*) FROM inbound
    WHERE has_table_privilege('authenticated',conrelid,'TRUNCATE'))::int
    AS authenticated_truncate_on_referencing_tables,
 (SELECT count(*) FROM f)::int AS function_source_total_in_scanned_schemas,
 (SELECT count(*) FROM f WHERE prosrc ~* '\mTRUNCATE\M')::int AS any_truncate_word,
 (SELECT count(*) FROM f WHERE prosrc ~* '\mTRUNCATE\M'
    AND prosrc ~* '\mcampaign_members\M')::int AS both_truncate_and_campaign_members_words,
 (SELECT count(*) FROM f WHERE prosrc ~* '\mEXECUTE\M'
    AND prosrc ~* '\mcampaign_members\M')::int AS any_execute_and_membership_words,
 (SELECT count(*) FROM f WHERE prosrc ~* '\mcampaign_members\M')::int AS any_membership_words;
