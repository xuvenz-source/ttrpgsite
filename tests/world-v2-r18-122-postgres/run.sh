#!/usr/bin/env bash
# R18-122 synthetic PostgreSQL17 runner. No real credentials, hosted DB or real data.
set -euo pipefail
fail(){ echo "R122 SCRATCH NO_GO: $*" >&2;exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${R122_ISOLATED:-}" == "yes" ]] || fail "CI isolation required"
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" ]] || fail "loopback only"
[[ "${PGDATABASE:-}" == "world_v2_r18_122" && "${PGUSER:-}" == "postgres" ]] || fail "wrong synthetic DB"
[[ "${PGPASSWORD:-}" == "r122_disposable_only" ]] || fail "wrong synthetic password"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "hosted database environment forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-122-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-120-postgres/setup.sql > "$scratch/setup.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql > "$scratch/base.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-122-dm-membership-admin-contract/unapplied-dm-revoked-roster.sql > "$scratch/r122.log"
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-122-postgres/verify-dm-removed-roster.sql

deny(){
 local label="$1" expected="$2" query="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$query" > "$scratch/$label.log" 2>&1;then
  fail "$label unexpectedly succeeded"
 fi
 grep -q "$expected" "$scratch/$label.log" || fail "$label denied for unexpected reason"
}
deny "anon-list" "permission denied for function" \
 "SET ROLE anon;SELECT * FROM public.dm_list_removed_campaign_players('00000000-0000-4000-8000-000000000101');"
deny "auth-private-ledger-read" "permission denied for schema" \
 "SET ROLE authenticated;SELECT * FROM forge_security.campaign_member_revocations;"
deny "auth-direct-membership-update" "permission denied for table" \
 "SET ROLE authenticated;UPDATE public.campaign_members SET user_id='00000000-0000-4000-8000-000000000302' WHERE campaign_id='00000000-0000-4000-8000-000000000101';"
echo "R122 SCRATCH PG17 PASS: DM-only removed roster, role/identity boundaries, update guard, and 3 direct ACL denials."
echo "R122 NO_GO: no signed hosted user, no current original SQL, no migration, no Supabase mutation."
