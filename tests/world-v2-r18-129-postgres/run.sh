#!/usr/bin/env bash
# R18-129: isolated, fictional PostgreSQL 17 only. NEVER hosted Supabase.
set -euo pipefail
fail(){ echo "R129 PG17 ISOLATION/ASSERTION FAILURE: $*" >&2; exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${R129_ISOLATED:-}" == "yes" ]] || fail "CI isolation absent"
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" ]] || fail "loopback only"
[[ "${PGUSER:-}" == "postgres" && "${PGDATABASE:-}" == "world_v2_r18_129" ]] || fail "synthetic DB only"
[[ "${PGPASSWORD:-}" == "r129_disposable_only" ]] || fail "synthetic password only"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "remote database environment forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-129-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-125-postgres/setup.sql > "$scratch/setup-members.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-129-postgres/setup-fog.sql > "$scratch/setup-fog.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-129-postgres/verify-before.sql > "$scratch/oracle-before.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-129-rpc-stream-fog-audit/unapplied-fog-published-auth-guard.sql > "$scratch/guard.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-129-postgres/verify-after.sql > "$scratch/guard-after.log"

deny(){
 local label="$1" pattern="$2" query="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$query" > "$scratch/$label.log" 2>&1;then
  fail "$label unexpectedly succeeded"
 fi
 grep -Eiq "$pattern" "$scratch/$label.log" || fail "$label failed for unrelated reason"
}
deny anon-fog-helper 'permission denied for function' \
 "SET ROLE anon; SELECT public.is_map_fog_published('00000000-0000-4000-8000-000000000201');"
deny signed-direct-private-rules 'permission denied for schema' \
 "SET ROLE authenticated; SELECT * FROM forge_visibility.map_rules;"
deny signed-direct-membership 'permission denied for table' \
 "SET ROLE authenticated; SELECT * FROM public.campaign_members;"
echo 'R129 SYNTHETIC PG17 PASS: fog bit oracle reproduced and repaired for membership, role, map, NULL and reinstatement.'
echo 'R129 NO_GO: no hosted SQL, no real signed browser users, 67-RPC transitive review, 17 Postgres Changes feeds, or streaming fence.'
