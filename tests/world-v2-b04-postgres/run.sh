#!/usr/bin/env bash
set -euo pipefail
# Run only with a disposable, isolated PostgreSQL database; never prod.
if [[ "${WORLD_V2_B04_ISOLATED:-}" != "yes" ]]; then
  echo "Refusing B04 SQL tests without explicit isolated-db marker." >&2
  exit 64
fi
if [[ "${PGHOST:-}" != "127.0.0.1" && "${PGHOST:-}" != "localhost" ]]; then
  echo "Refusing B04 SQL tests on any non-local host." >&2
  exit 64
fi
if [[ "${PGDATABASE:-}" != "world_v2_b04" ]]; then
  echo "Refusing B04 SQL tests on any database other than world_v2_b04." >&2
  exit 64
fi
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b04-postgres/schema.sql
python3 tests/world-v2-b04-postgres/extract_real_v2_functions.py > /tmp/world_v2_b04_actual_helpers.sql
psql -X -v ON_ERROR_STOP=1 -f /tmp/world_v2_b04_actual_helpers.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b03_path_validation.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b04-postgres/hostile.sql

# Direct SQL invocation using the browser role must fail in Postgres itself,
# not merely in a static regex / pg_proc ACL assertion.
if psql -X -v ON_ERROR_STOP=1 -c "SET ROLE authenticated; SELECT forge_world_v2.validate_motion_path_batch_b03('00000000-0000-4000-8000-000000000301',1,'{}','[]',1,1);" > /tmp/world_v2_b04_denied.log 2>&1; then
  echo "SECURITY FAILURE: authenticated role invoked private function" >&2
  exit 1
fi
if ! grep -iq "permission denied" /tmp/world_v2_b04_denied.log; then
  echo "SECURITY FAILURE: unexpected error, not an actual privilege denial" >&2
  cat /tmp/world_v2_b04_denied.log >&2
  exit 1
fi
echo "PASS: authenticated direct SQL call denied by database permissions"
if psql -X -v ON_ERROR_STOP=1 -c "SET ROLE anon; SELECT forge_world_v2.validate_motion_path_batch_b03('00000000-0000-4000-8000-000000000301',1,'{}','[]',1,1);" > /tmp/world_v2_b04_anon_denied.log 2>&1; then
  echo "SECURITY FAILURE: anon role invoked private function" >&2
  exit 1
fi
if ! grep -iq "permission denied" /tmp/world_v2_b04_anon_denied.log; then
  echo "SECURITY FAILURE: unexpected anonymous error" >&2
  cat /tmp/world_v2_b04_anon_denied.log >&2
  exit 1
fi
echo "PASS: anonymous direct SQL call denied by database permissions"
echo "B04: real PostgreSQL source-compatible V2 geometry, session authorization and SQL candidate checks completed."
