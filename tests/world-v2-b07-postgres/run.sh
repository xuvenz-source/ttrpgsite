#!/usr/bin/env bash
set -euo pipefail
# B07 is NEVER run against Supabase or a project-provided database.
[[ "${WORLD_V2_B07_ISOLATED:-}" == "yes" ]] || {
 echo 'B07 blocked: explicit isolated-db marker missing' >&2;exit 64;
}
[[ "${PGHOST:-}" == "127.0.0.1" || "${PGHOST:-}" == "localhost" ]] || {
 echo 'B07 blocked: non-local PostgreSQL host' >&2;exit 64;
}
[[ "${PGDATABASE:-}" == "world_v2_b07" ]] || {
 echo 'B07 blocked: unsafe database name' >&2;exit 64;
}
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b04-postgres/schema.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b07-postgres/schema.sql
python3 tests/world-v2-b04-postgres/extract_real_v2_functions.py  > /tmp/world_v2_b07_original_motion.sql
psql -X -v ON_ERROR_STOP=1 -f /tmp/world_v2_b07_original_motion.sql
python3 tests/world-v2-b07-postgres/extract_viewer_authority.py  > /tmp/world_v2_b07_real_recipients.sql
psql -X -v ON_ERROR_STOP=1 -f /tmp/world_v2_b07_real_recipients.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b07_private_observer_budget.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b07-postgres/hostile.sql
for role in anon authenticated; do
 if psql -X -v ON_ERROR_STOP=1 -c   "SET ROLE ${role}; SELECT forge_world_v2.merge_observer_items_b07('[]'::jsonb,'[]'::jsonb);"   >"/tmp/world_v2_b07_${role}_denied.log" 2>&1;then
  echo "B07 SECURITY FAILURE: ${role} invoked private function" >&2;exit 1
 fi
 grep -qi 'permission denied' "/tmp/world_v2_b07_${role}_denied.log" || {
  echo "B07 SECURITY FAILURE: ${role} unexpected denial reason" >&2
  cat "/tmp/world_v2_b07_${role}_denied.log" >&2;exit 1
 }
 echo "PASS: ${role} cannot invoke private observer queue"
done
echo 'B07 isolated PostgreSQL 17 candidate/hostile regression complete'
