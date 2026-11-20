#!/usr/bin/env bash
# R140 disposable GitHub Actions Postgres 17 only. NO hosted commands.
set -euo pipefail
fail(){ echo "R140 ISOLATION/SECURITY FAILURE: $*" >&2; exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" &&
   "${R138_ISOLATED:-}" == "yes" &&
   "${R140_ISOLATED:-}" == "yes" ]] || fail "dedicated isolated Actions required"
[[ "${PGHOST:-}" == "127.0.0.1" &&
   "${PGPORT:-}" == "5432" &&
   "${PGUSER:-}" == "postgres" &&
   "${PGDATABASE:-}" == "world_v2_r18_138" &&
   "${PGPASSWORD:-}" == "r138_disposable_only" ]] ||
 fail "PG17 localhost fixture credentials only"
for k in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$k" || true)" ]] || fail "hosted DB connection variable forbidden"
done
umask 077
tmp="$(mktemp -d /tmp/world-v2-r18-140-XXXXXXXX)"
trap 'rm -rf -- "$tmp"' EXIT
bash tests/world-v2-r18-138-postgres/run.sh > "$tmp/r138-base.log" ||
 { cat "$tmp/r138-base.log" >&2;fail "inherited R138 setup failed"; }
psql -X -q -v ON_ERROR_STOP=1 -f \
 tests/world-v2-r18-140-postgres/setup-original-viewer-stubs.sql > "$tmp/mock.log"
psql -X -q -v ON_ERROR_STOP=1 -f \
 staging/world-v2-b10-r18-140-private-vision-navigation/unapplied-private-vision-navigation-v3.sql > "$tmp/candidate.log"
deny(){
 local name="$1" expected="$2" stmt="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$stmt" > "$tmp/$name.log" 2>&1;then
  fail "$name unexpectedly succeeded"
 fi
 grep -Eiq "$expected" "$tmp/$name.log" || {
   tail -n 10 "$tmp/$name.log" >&2
   fail "$name rejected for unrelated error"
 }
}
map='00000000-0000-4000-8000-000000000201'
p1='00000000-0000-4000-8000-000000000303'
tok='00000000-0000-4000-8000-000000000404'
deny p1-preview 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.get_authorized_world_preview_v3('$map','$p1');"
deny p1-virtual 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.get_authorized_world_preview_at_v3('$map','$p1','$tok',1,1);"
deny p1-fog 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.get_authorized_world_fog_delta_v3('$map',NULL,NULL,NULL);"
deny p1-light 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.get_authorized_world_light_masks_v3('$map');"
deny p1-navigation 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.get_authorized_world_navigation_v3('$map','token','$tok');"
deny anon-preview 'permission denied for schema forge_v3_api' \
 "SET ROLE anon;SELECT forge_v3_api.get_authorized_world_preview_v3('$map','$p1');"
deny old-public 'permission denied for schema public' \
 "SET ROLE authenticated;SELECT public.preview_world_visibility_v2('$map','$p1');"
psql -X -q -v ON_ERROR_STOP=1 -f \
 tests/world-v2-r18-140-postgres/verify-closed-vision-navigation.sql > "$tmp/verify.log"
cat "$tmp/verify.log"
echo "R140 NO_GO: fictional PG17 only; original DM/LOS, 83 migrations, old sockets, signed Storage URLs and true multiplayer latency NOT tested."
