#!/usr/bin/env bash
# R18-138 entirely disposable PG17 only; no hosted Supabase access.
set -euo pipefail
fail(){ echo "R138 PG17 ISOLATION/SECURITY FAILURE: $*" >&2;exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${R138_ISOLATED:-}" == "yes" ]] || fail "isolated GitHub Actions required"
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" ]] || fail "loopback Postgres only"
[[ "${PGDATABASE:-}" == "world_v2_r18_138" && "${PGUSER:-}" == "postgres" ]] || fail "disposable database only"
[[ "${PGPASSWORD:-}" == "r138_disposable_only" ]] || fail "disposable password only"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "hosted DB environmental variable forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-138-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-125-postgres/setup.sql > "$scratch/members.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-126-postgres/setup-scene.sql > "$scratch/realtime.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-128-postgres/setup-legacy.sql > "$scratch/old-functions.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-125-private-scene-revocation/unapplied-scene-v3-prototype.sql > "$scratch/v3-epoch.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-126-scene-v3-cutover-contract/unapplied-atomic-v3-scene-candidate.sql > "$scratch/v3-scene.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-128-server-maintenance-fence/unapplied-maintenance-freeze-candidate.sql > "$scratch/freeze.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-136-v3-isolated-api-fence/unapplied-v3-api-bridge-after-r128.sql > "$scratch/v3-topic.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-132-scene-publisher-drain/unapplied-scene-publication-drain.sql > "$scratch/fenced-scene.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-138-postgres/setup-original-world-stubs.sql > "$scratch/fictional-world-source.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-138-primary-v3-facade/unapplied-closed-world-v3-facade.sql > "$scratch/closed-facade.log"

deny(){
 local title="$1" reason="$2" code="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$code" > "$scratch/$title.log" 2>&1;then
  fail "$title unexpectedly succeeded"
 fi
 grep -Eiq "$reason" "$scratch/$title.log" || {
  tail -n 12 "$scratch/$title.log" >&2
  fail "$title rejected for unrelated reason"
 }
}
deny no-player-scene 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.get_authorized_world_scene_v3('00000000-0000-4000-8000-000000000201');"
deny no-player-sight 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.get_authorized_world_sight_v3('00000000-0000-4000-8000-000000000201');"
deny no-player-begin 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.begin_world_motion_v3('00000000-0000-4000-8000-000000000201','[]','{}','drag',0,0,false);"
deny no-player-advance 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.advance_world_motion_v3('00000000-0000-4000-8000-000000000301',1,'{}','[]',0,0);"
deny no-player-commit 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.commit_world_motion_v3('00000000-0000-4000-8000-000000000301',1,'{}',0,0);"
deny no-player-cancel 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.cancel_world_motion_v3('00000000-0000-4000-8000-000000000301');"
deny no-anon-scene 'permission denied for schema forge_v3_api' \
 "SET ROLE anon;SELECT forge_v3_api.get_authorized_world_scene_v3('00000000-0000-4000-8000-000000000201');"
deny still-no-old-public 'permission denied for schema public' \
 "SET ROLE authenticated;SELECT public.get_world_scene_v2('00000000-0000-4000-8000-000000000201');"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-138-postgres/verify-closed-primary-facade.sql > "$scratch/verify.log"
echo 'R138 synthetic PG17 PASS: 7 experimental routes uncallable by browser roles; original V2 scene/LOS/owner-session delegation only under fictional owner; maintenance fence blocks motion.'
echo 'R138 production NO_GO: full original 83 migrations and 67 definer bodies, signed QA, old sockets, actual collision and free-tier latency still unproven.'
