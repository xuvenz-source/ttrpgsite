#!/usr/bin/env bash
# R18-114: ONLY ephemeral GitHub Actions PostgreSQL17 / NO hosted SQL.
set -euo pipefail
fail(){ echo "R114 DISPOSABLE PG17 NO-GO: $*" >&2; exit 64; }

[[ "$(printenv GITHUB_ACTIONS || true)" == 'true' ]] || fail 'CI only'
[[ "$(printenv R114_ISOLATED || true)" == 'yes' ]] || fail 'explicit isolation marker required'
[[ "$(printenv PGHOST || true)" == '127.0.0.1' ]] || fail 'client must use loopback'
[[ "$(printenv PGPORT || true)" == '5432' ]] || fail 'expected disposable port'
[[ "$(printenv PGDATABASE || true)" == 'world_v2_r18_114' ]] || fail 'wrong scratch DB'
[[ "$(printenv PGUSER || true)" == 'postgres' ]] || fail 'wrong scratch DB user'
[[ "$(printenv PGPASSWORD || true)" == 'r114_disposable_only' ]] || fail 'not the synthetic temporary credential'

for envvar in DATABASE_URL DIRECT_URL SUPABASE_DB_URL SUPABASE_URL \
 SUPABASE_DATABASE_URL PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$envvar" || true)" ]] || fail "external database option forbidden"
done
command -v psql >/dev/null || fail 'psql unavailable'
command -v python3 >/dev/null || fail 'python3 unavailable'
version="$(psql -X -A -t -v ON_ERROR_STOP=1 -c 'SHOW server_version_num')"
[[ "$version" =~ ^17[0-9]{4}$ ]] || fail "wrong PostgreSQL version"
db="$(psql -X -A -t -v ON_ERROR_STOP=1 -c 'SELECT current_database()')"
[[ "$db" == 'world_v2_r18_114' ]] || fail "unexpected database identity"

scratch="$(mktemp -d /tmp/world-v2-r18-114-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
python3 tests/world-v2-r18-114-postgres/extract_source.py "$scratch"

psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-114-postgres/schema.sql
psql -X -v ON_ERROR_STOP=1 -f "$scratch/verified-sheet.sql"
psql -X -v ON_ERROR_STOP=1 -f "$scratch/verified-movement.sql"
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-114-postgres/probes.sql

deny(){
 local label="$1" pattern="$2" statement="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$statement" >"$scratch/$label.log" 2>&1; then
  fail "$label unexpectedly executed"
 fi
 grep -qi "$pattern" "$scratch/$label.log" ||
  fail "$label rejected for an unexpected reason"
}
deny "anon-sheet" 'permission denied for function' \
 "SET ROLE anon; SELECT * FROM public.get_campaign_sheet_inventory('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501','bag');"
deny "anon-movement" 'permission denied for function' \
 "SET ROLE anon; SELECT public.r114_movement_probe('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401',3,2,1,false);"
deny "auth-direct-sheet-table" 'permission denied for table' \
 "SET ROLE authenticated; SELECT field_values FROM public.characters LIMIT 1;"
deny "auth-direct-private-helper" 'permission denied' \
 "SET ROLE authenticated; SELECT public.can_edit_campaign_sheet('00000000-0000-4000-8000-000000000101','character','00000000-0000-4000-8000-000000000501');"
deny "auth-direct-private-movement" 'permission denied' \
 "SET ROLE authenticated; SELECT forge_visibility.dispatch_movement_preview('00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401',3,2,1,false);"

# Preserve and execute the exact original reader first to prove the
# historical UUID churn. Apply repair candidate ONLY in scratch PG17.
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-114-postgres/verify-inventory-uuid-baseline.sql
psql -X -v ON_ERROR_STOP=1 -f staging/world-v2-b10-r18-114-inventory-uuid-guard/unapplied-inventory-uuid-five-segment-guard.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-114-postgres/verify-sheet.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-114-postgres/verify-inventory-uuid-candidate.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-114-postgres/verify-movement.sql

echo 'R114 PG17 PASS: source-exact original UUID churn reproduced; scratch-only candidate and sheet/movement authorization tested.'
echo 'R114 NO_GO: synthetic DM/identity and viewer stubs, no hosted signed users, no original/QA SQL or deployment.'
