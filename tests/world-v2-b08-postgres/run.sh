#!/usr/bin/env bash
set -euo pipefail
[[ "${WORLD_V2_B08_ISOLATED:-}" == "yes" ]] || { echo 'B08 isolated marker required' >&2;exit 64; }
[[ "${PGHOST:-}" == "127.0.0.1" || "${PGHOST:-}" == "localhost" ]] || { echo 'B08 non-local host blocked' >&2;exit 64; }
[[ "${PGDATABASE:-}" == "world_v2_b08" ]] || { echo 'B08 unsafe database target' >&2;exit 64; }
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b04-postgres/schema.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b07-postgres/schema.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b08-postgres/schema.sql
python3 tests/world-v2-b04-postgres/extract_real_v2_functions.py > /tmp/world_v2_b08_core.sql
psql -X -v ON_ERROR_STOP=1 -f /tmp/world_v2_b08_core.sql
python3 tests/world-v2-b07-postgres/extract_viewer_authority.py > /tmp/world_v2_b08_viewers.sql
psql -X -v ON_ERROR_STOP=1 -f /tmp/world_v2_b08_viewers.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b07_private_observer_budget.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b08_commit_reconciliation.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b08-postgres/hostile.sql
for role in anon authenticated; do
 if psql -X -v ON_ERROR_STOP=1 -c "SET ROLE ${role}; SELECT forge_world_v2.drain_committed_observers_b08(gen_random_uuid());" >"/tmp/b08_${role}_denied.log" 2>&1;then
  echo "B08 SECURITY FAIL: ${role} invoked private helper" >&2;exit 1
 fi
 grep -qi 'permission denied' "/tmp/b08_${role}_denied.log" || { cat "/tmp/b08_${role}_denied.log";exit 1; }
done
echo 'B08 isolated PostgreSQL security/replay/commit fixture finished'