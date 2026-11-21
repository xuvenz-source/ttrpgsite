-- R18-210: original vs separate QA schema-readiness counts. SELECT ONLY.
-- Run independently against each already-linked Supabase project via
-- read-only metadata. No project refs, tables names, function SQL bodies,
-- identities, service credentials, migration SQL or Auth records exported.
-- Source-only readiness evidence, NOT authorization to install SQL.
SELECT
 count(*) FILTER(WHERE n.nspname='public' AND c.relkind IN('r','p'))::int
   AS public_tables,
 count(*) FILTER(WHERE n.nspname='public' AND c.relkind IN('v','m'))::int
   AS public_views,
 (SELECT count(*)::int FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace fn ON fn.oid=p.pronamespace
   WHERE fn.nspname='public' AND p.prokind='f') AS public_functions,
 (SELECT count(*)::int FROM pg_catalog.pg_namespace
    WHERE nspname='auth') AS auth_schema_present,
 (SELECT count(*)::int FROM pg_catalog.pg_namespace
    WHERE nspname='storage') AS storage_schema_present,
 (SELECT count(*)::int FROM pg_catalog.pg_namespace
    WHERE nspname='public') AS public_schema_present,
 (SELECT count(*)::int FROM pg_catalog.pg_tables
   WHERE schemaname='supabase_migrations'
    AND tablename='schema_migrations') AS migration_ledger_present
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace;
