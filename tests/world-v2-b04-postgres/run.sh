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
# Real browser-role execution through the ACTUAL public V2 SECURITY DEFINER
# functions. This is isolated SQL role behavior, not live PostgREST middleware.
psql -X -v ON_ERROR_STOP=1 <<'SQL_B04_DIRECT'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',false);
DO $b04_direct$
DECLARE
 r jsonb; sid uuid;
BEGIN
 r:=public.begin_world_motion_v2(
  '00000000-0000-4000-8000-000000000021',
  '[{"kind":"token","id":"00000000-0000-4000-8000-000000000102"}]',
  '{"x":1,"y":9}', 'drag',1,1,false);
 PERFORM public.b04_assert(r IS NULL,
  'H40 actual authenticated role cannot begin moving foreign player token');
 r:=public.begin_world_motion_v2(
  '00000000-0000-4000-8000-000000000021',
  '[{"kind":"token","id":"00000000-0000-4000-8000-000000000101"}]',
  '{"x":1,"y":1}', 'drag',1,1,false);
 PERFORM public.b04_assert(r->>'version'='2' AND r ? 'sessionId',
  'P15 actual authenticated role receives only its actor-bound begin ACK');
 sid:=(r->>'sessionId')::uuid;
 r:=public.advance_world_motion_v2(
  sid,1,'{"x":1,"y":1}','[{"x":2,"y":1}]',1,1);
 PERFORM public.b04_assert(
  r->'accepted'='[{"x":2,"y":1}]'::jsonb AND
  NOT (r ? 'routeSteps') AND NOT (r ? 'wallGeometry'),
  'P16 actual authenticated role accepts private server-validated prefix only');
END
$b04_direct$;
SQL_B04_DIRECT
echo "PASS: authenticated REAL public Begin/Advance direct invocation bounded by JWT ownership"
if psql -X -v ON_ERROR_STOP=1 -c "SET ROLE anon; SELECT public.begin_world_motion_v2('00000000-0000-4000-8000-000000000021','[]','{}','drag',1,1,false);" > /tmp/world_v2_b04_anon_rpc.log 2>&1; then
  echo "SECURITY FAILURE: anon invoked public Begin" >&2
  exit 1
fi
if ! grep -iq "permission denied" /tmp/world_v2_b04_anon_rpc.log; then
  echo "SECURITY FAILURE: anonymous public Begin failed for an unexpected reason" >&2
  cat /tmp/world_v2_b04_anon_rpc.log >&2
  exit 1
fi
echo "PASS: anon public Begin denied by actual DB function ACL"
echo "B04: real PostgreSQL source-compatible V2 geometry, session authorization and SQL candidate checks completed."
