#!/usr/bin/env bash
# R142 PG17-only synthetic integration. Never use on hosted Supabase.
set -euo pipefail
fail(){ echo "R142 DISPOSABLE PG17 DENIED: $*" >&2; exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" &&
   "${R138_ISOLATED:-}" == "yes" &&
   "${R140_ISOLATED:-}" == "yes" &&
   "${R142_ISOLATED:-}" == "yes" ]] ||
 fail "explicit 138/140/142 isolated Actions flags required"
[[ "${PGHOST:-}" == "127.0.0.1" &&
   "${PGPORT:-}" == "5432" &&
   "${PGUSER:-}" == "postgres" &&
   "${PGDATABASE:-}" == "world_v2_r18_138" &&
   "${PGPASSWORD:-}" == "r138_disposable_only" ]] ||
 fail "loopback fictional database only"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] ||
 fail "hosted DB access variable forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-142-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
bash tests/world-v2-r18-140-postgres/run.sh > "$scratch/r140.log" ||
 { tail -n 80 "$scratch/r140.log" >&2; fail "inherited R140 fixture"; }
psql -X -q -v ON_ERROR_STOP=1 \
 -f tests/world-v2-r18-142-postgres/setup-projected-original-fixture.sql \
 > "$scratch/original-fixture.log"
psql -X -q -v ON_ERROR_STOP=1 \
 -f staging/world-v2-b10-r18-142-projected-read-api/unapplied-private-projected-read-v3.sql \
 > "$scratch/candidate.log"
deny(){
 local title="$1" expected="$2" statement="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$statement" > "$scratch/$title.log" 2>&1;then
  fail "$title unexpectedly succeeded"
 fi
 grep -Eiq "$expected" "$scratch/$title.log" || {
  tail -n 12 "$scratch/$title.log" >&2
  fail "$title denied for unrelated error"
 }
}
ch='00000000-0000-4000-8000-000000000501'
h='00000000-0000-4000-8000-000000000601'
tool='00000000-0000-4000-8000-000000000701'
map='00000000-0000-4000-8000-000000000201'
deny closed-character 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.get_authorized_character_sheet_v3('$ch');"
deny closed-handout 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.get_authorized_handout_v3('$h');"
deny closed-tool 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.get_authorized_tool_issue_v3('$tool');"
deny closed-map 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.get_authorized_map_metadata_v3('$map');"
deny closed-anon 'permission denied for schema forge_v3_api' \
 "SET ROLE anon;SELECT forge_v3_api.get_authorized_character_sheet_v3('$ch');"
deny closed-original 'permission denied for schema public' \
 "SET ROLE authenticated;SELECT public.can_view_campaign_map('$map','$map');"
psql -X -q -v ON_ERROR_STOP=1 \
 -f tests/world-v2-r18-142-postgres/verify-projected-private-read.sql \
 > "$scratch/verify.log"
cat "$scratch/verify.log"
echo 'R142 stays NO_GO: original functions, genuine Auth roles, WebSocket packets, Storage and free-tier performance untested.'
