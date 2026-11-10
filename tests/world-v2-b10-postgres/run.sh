#!/usr/bin/env bash
set -euo pipefail
# Postgres is a GitHub Actions throwaway service ONLY. Abort rather than
# touch any internet-facing or user-supplied database.
[[ "${WORLD_V2_B10_ISOLATED:-}" == "yes" ]] || { echo 'B10 isolated marker required' >&2;exit 64; }
[[ "${PGHOST:-}" == '127.0.0.1' || "${PGHOST:-}" == 'localhost' ]] || { echo 'B10 nonlocal DB refused' >&2;exit 64; }
[[ "${PGDATABASE:-}" == 'world_v2_b10' ]] || { echo 'B10 non-ephemeral DB refused' >&2;exit 64; }

# Reproduce the actual B03→B07→B08 dependency/order in ONE transaction-
# independent disposable DB; each adversarial test rolls its data back.
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b04-postgres/schema.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b07-postgres/schema.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b08-postgres/schema.sql
python3 tests/world-v2-b04-postgres/extract_real_v2_functions.py > /tmp/world_v2_b10_core.sql
python3 tests/world-v2-b07-postgres/extract_viewer_authority.py > /tmp/world_v2_b10_viewers.sql
psql -X -v ON_ERROR_STOP=1 -f /tmp/world_v2_b10_core.sql
psql -X -v ON_ERROR_STOP=1 -f /tmp/world_v2_b10_viewers.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b03_path_validation.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b04-postgres/hostile.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b07_private_observer_budget.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b07-postgres/hostile.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b08_commit_reconciliation.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b08-postgres/hostile.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b10-postgres/integrated.sql

# Privilege checks after ALL three SQL candidates coexist.
for role in anon authenticated;do
 if psql -X -v ON_ERROR_STOP=1 -c "SET ROLE ${role}; SELECT forge_world_v2.validate_motion_path_batch_b03(gen_random_uuid(),1,'{}','[]',1,1);" >"/tmp/b10_${role}_deny.log" 2>&1;then
  echo "B10 SECURITY FAILURE: ${role} called private validator" >&2;exit 1
 fi
 grep -qi 'permission denied' "/tmp/b10_${role}_deny.log" || {
  cat "/tmp/b10_${role}_deny.log" >&2;exit 1
 }
done
echo 'B10 PASS: B03+B07+B08 PostgreSQL candidate coexistence and hostile regressions'
echo 'B10 RELEASE GATE STILL BLOCKED: B03 validator is not wired to advance_core_v2; no live Auth/LOS QA.'
