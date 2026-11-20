#!/usr/bin/env bash
# R143 disposable synthetic Postgres17 only. NO hosted Supabase or migration.
set -euo pipefail
fail(){ echo "R143 ISOLATION FAILURE: $*" >&2;exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" &&
 "${R138_ISOLATED:-}" == "yes" &&
 "${R140_ISOLATED:-}" == "yes" &&
 "${R142_ISOLATED:-}" == "yes" &&
 "${R143_ISOLATED:-}" == "yes" ]] || fail "requires explicit disposable GH Actions flags"
[[ "${PGHOST:-}" == "127.0.0.1" &&
 "${PGPORT:-}" == "5432" &&
 "${PGUSER:-}" == "postgres" &&
 "${PGDATABASE:-}" == "world_v2_r18_138" &&
 "${PGPASSWORD:-}" == "r138_disposable_only" ]] || fail "loopback PG17 fixture only"
for k in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$k" || true)" ]] || fail "found hosted DB credential/connection"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-143-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
bash tests/world-v2-r18-142-postgres/run.sh > "$scratch/r142.log" ||
 { tail -n 80 "$scratch/r142.log" >&2;fail "R142 prerequisite fixture failed"; }
psql -X -q -v ON_ERROR_STOP=1 \
 -f tests/world-v2-r18-143-postgres/setup-original-mutation-stubs.sql \
 > "$scratch/fixture.log"
psql -X -q -v ON_ERROR_STOP=1 \
 -f staging/world-v2-b10-r18-143-narrow-mutation-contracts/unapplied-closed-mutation-v3.sql \
 > "$scratch/candidate.log"
deny(){
 local name="$1" expected="$2" statement="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$statement" > "$scratch/$name.log" 2>&1; then
   fail "$name succeeded unexpectedly"
 fi
 grep -Eiq "$expected" "$scratch/$name.log" || {
   tail -n 12 "$scratch/$name.log" >&2
   fail "$name failed for an unrelated reason"
 }
}
ch='00000000-0000-4000-8000-000000000501'
note='00000000-0000-4000-8000-000000000602'
pin='00000000-0000-4000-8000-000000000611'
deny no-browser-character 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.patch_authorized_character_v3('$ch','{}','2026-01-01T00:00:00Z');"
deny no-browser-handout 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.edit_authorized_handout_v3('$note','x','y',true,'2026-01-01T00:00:00Z');"
deny no-browser-collect 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.collect_authorized_pin_v3('$pin');"
deny no-anon-mutation 'permission denied for schema forge_v3_api' \
 "SET ROLE anon;SELECT forge_v3_api.collect_authorized_pin_v3('$pin');"
deny old-public-rpc 'permission denied for schema public' \
 "SET ROLE authenticated;SELECT public.collect_campaign_map_pin('$pin');"
psql -X -q -v ON_ERROR_STOP=1 \
 -f tests/world-v2-r18-143-postgres/verify-closed-mutation.sql \
 > "$scratch/verify.log"
cat "$scratch/verify.log"
echo 'R143 NO_GO: this passed fictional PG17 actors, not original Supabase Auth/RLS/Realtime/Storage.'
