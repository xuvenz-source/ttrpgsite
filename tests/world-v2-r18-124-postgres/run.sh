#!/usr/bin/env bash
# R18-124: PG17 disposable localhost only. Fail closed if remote environment exists.
set -euo pipefail
fail(){ echo "R124 SCRATCH-ONLY FAILURE: $*" >&2; exit 64; }
[[ "$GITHUB_ACTIONS" == "true" && "$R124_ISOLATED" == "yes" ]] || fail "CI isolation absent"
[[ "$PGHOST" == "127.0.0.1" && "$PGPORT" == "5432" ]] || fail "loopback only"
[[ "$PGDATABASE" == "world_v2_r18_124" && "$PGUSER" == "postgres" ]] || fail "unexpected database"
[[ "$PGPASSWORD" == "r124_disposable_only" ]] || fail "unexpected synthetic password"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "remote database env forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-124-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-124-postgres/setup.sql > "$scratch/setup.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-124-postgres/verify-before.sql > "$scratch/before.log"
psql -X -v ON_ERROR_STOP=1 -q -f \
 staging/world-v2-b10-r18-115-revocation-guard/unapplied-campaign-membership-required.sql > "$scratch/patch.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-124-postgres/verify-after.sql > "$scratch/after.log"
deny(){
 local label="$1" pattern="$2" query="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$query" > "$scratch/$label.log" 2>&1;then
  fail "$label unexpectedly succeeded"
 fi
 grep -Eiq "$pattern" "$scratch/$label.log" || fail "$label failed for unrelated reason"
}
deny "anon-helper" 'permission denied for function' \
 "SET ROLE anon; SELECT public.can_edit_campaign_sheet('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000401');"
deny "authenticated-helper" 'permission denied for function' \
 "SET ROLE authenticated; SELECT public.can_edit_campaign_sheet('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000401');"
deny "anon-wrapper" 'permission denied for function' \
 "SET ROLE anon; SELECT public.synthetic_sheet_edit_guard('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000401');"
deny "auth-direct-membership" 'permission denied for table' \
 "SET ROLE authenticated; SELECT * FROM public.campaign_members;"
echo 'R124 SCRATCH PG17 PASS: prior issue reproduced, R115 guard corrected, 4 permission denials.'
echo 'R124 NO_GO: no hosted Supabase change, live signed users, existing Realtime disconnect, signed URL invalidation, or deployment.'
