#!/usr/bin/env bash
# R18-128 maintenance fence: disposable PostgreSQL 17 only.
set -euo pipefail
fail(){ echo "R128 ISOLATION/ASSERTION FAILURE: $*" >&2;exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${R128_ISOLATED:-}" == "yes" ]] || fail "isolated CI required"
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" ]] || fail "localhost only"
[[ "${PGDATABASE:-}" == "world_v2_r18_128" && "${PGUSER:-}" == "postgres" ]] || fail "wrong fake DB"
[[ "${PGPASSWORD:-}" == "r128_disposable_only" ]] || fail "wrong fake password"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$key" || true)" ]] || fail "remote database variable forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-128-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-125-postgres/setup.sql > "$scratch/fixture-members.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-126-postgres/setup-scene.sql > "$scratch/fixture-messages.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-128-postgres/setup-legacy.sql > "$scratch/fixture-legacy.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-128-postgres/verify-before.sql > "$scratch/before.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-128-server-maintenance-fence/unapplied-maintenance-freeze-candidate.sql > "$scratch/freeze.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-128-postgres/verify-after.sql > "$scratch/after.log"
deny(){
 local label="$1" pattern="$2" query="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$query" > "$scratch/$label.log" 2>&1;then
  fail "$label unexpectedly succeeded despite the maintenance fence"
 fi
 grep -Eiq "$pattern" "$scratch/$label.log" || fail "$label failed for unrelated reason"
}
deny "p1-legacy-sheet-rpc" "permission denied for schema public" \
 "SET ROLE authenticated; SELECT public.r128_legacy_sheet_rpc('00000000-0000-4000-8000-000000000101');"
deny "p1-legacy-movement-rpc" "permission denied for schema public" \
 "SET ROLE authenticated; SELECT public.r128_legacy_motion_rpc('00000000-0000-4000-8000-000000000201');"
deny "p1-owner-table" "permission denied for schema public" \
 "SET ROLE authenticated; SELECT * FROM public.r128_private_sheet;"
deny "anon-campaign-table" "permission denied for schema public" \
 "SET ROLE anon; SELECT * FROM public.campaigns;"
deny "p1-old-membership-rpc" "permission denied for schema public" \
 "SET ROLE authenticated; SELECT public.can_view_campaign_map('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000201');"
echo 'R128 PASS: synthetic schema hard freeze denies 5 old client routes and silences the shared scene sender.'
echo 'R128 NO_GO: private SECURITY DEFINER bypass, old Realtime receiver, other sends, Storage URLs, in-flight SQL and every privileged RPC remain out of scope.'
