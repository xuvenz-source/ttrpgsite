-- R18-08. READ ONLY. NEVER edit migration history or execute migration SQL here.
-- This reconstructs the exact historical SQL files written by pinned
-- Supabase CLI v2.81.3 migration fetch (fetch.go, pkg/migration/history.go).
-- CLI uses strings.Join(statements, ";\n") + ";\n".
-- Query result contains no historic SQL text, only names, counts and digests.
-- Export the resulting JSON locally in the secure release workspace, NOT git.
-- Must be run fresh immediately before the linked read-only CLI dry run.
SELECT
  version,
  name,
  cardinality(statements) AS statement_count,
  md5(array_to_string(statements, E';\n') || E';\n') AS fetched_sql_md5
FROM supabase_migrations.schema_migrations
ORDER BY version;
