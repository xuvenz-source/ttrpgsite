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
# B10-R01 installs a replacement PRIVATE Core AFTER the complete stack.
# Run the source-real B08 hostile tests against the installed new core. The
# B04 legacy test deliberately expects its original inert broadcaster and an
# unfixed H39 replay (both replaced by B07/B08), so it is run BEFORE those
# candidates only; this order must not be changed just to fabricate passes.
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b10_r01_core_path_integration.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b08-postgres/hostile.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b10-postgres/integrated.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b10-postgres/core-path-r01.sql
# R03 changes the B08 terminal-queue disposition, so keep the historical B08
# suite BEFORE this explicit replacement. A fresh cross-layer R03 hostile
# suite below verifies exact retry cannot replay old pending paths after a
# canonical commit (including the equal-origin stale frame case).
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b10_r03_terminal_queue_retirement.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b10-postgres/terminal-r03.sql

# Privilege checks after ALL three SQL candidates coexist.
for role in anon authenticated;do
 if psql -X -v ON_ERROR_STOP=1 -c "SET ROLE ${role}; SELECT forge_world_v2.validate_motion_path_batch_b03(gen_random_uuid(),1,'{}','[]',1,1);" >"/tmp/b10_${role}_deny.log" 2>&1;then
  echo "B10 SECURITY FAILURE: ${role} called private validator" >&2;exit 1
 fi
 grep -qi 'permission denied' "/tmp/b10_${role}_deny.log" || {
  cat "/tmp/b10_${role}_deny.log" >&2;exit 1
 }
done
echo 'B10-R03 PASS: B03+B07+B08+R01 canonical core and terminal queue-retirement hostile regressions'
echo 'B10 RELEASE GATE STILL BLOCKED: nonapplied candidate, observer-budget recovery and live Auth/LOS QA remain.'
