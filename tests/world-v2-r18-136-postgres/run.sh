#!/usr/bin/env bash
# B10-R18-136 PostgreSQL 17 fictional authorization schema only.
set -euo pipefail
fail(){ echo "R136 ISOLATION/SECURITY FAILURE: $*" >&2; exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${R136_ISOLATED:-}" == "yes" ]] || fail "isolated Actions runner required"
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" ]] || fail "loopback DB required"
[[ "${PGDATABASE:-}" == "world_v2_r18_136" && "${PGUSER:-}" == "postgres" ]] || fail "disposable fixture DB required"
[[ "${PGPASSWORD:-}" == "r136_disposable_only" ]] || fail "disposable password required"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "remote database variable forbidden: $key"
done
umask 077
tmp="$(mktemp -d /tmp/world-v2-r18-136-XXXXXXXX)"
trap 'rm -rf -- "$tmp"' EXIT
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-125-postgres/setup.sql > "$tmp/members.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-126-postgres/setup-scene.sql > "$tmp/realtime.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-128-postgres/setup-legacy.sql > "$tmp/old-public-rpcs.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-125-private-scene-revocation/unapplied-scene-v3-prototype.sql > "$tmp/r125-scene-epochs.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-126-scene-v3-cutover-contract/unapplied-atomic-v3-scene-candidate.sql > "$tmp/r126-private-topics.log"

# The R136 gateway must NEVER be installable with old public schema access
# still granted. On error the disposable candidate transaction rolls back.
if psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-136-v3-isolated-api-fence/unapplied-v3-api-bridge-after-r128.sql > "$tmp/pre-fence-denial.log" 2>&1;then
 fail "R136 became callable BEFORE the public-schema freeze"
fi
grep -Fq 'R136 preflight: R128 public schema fence not installed' "$tmp/pre-fence-denial.log" || fail "unfenced install rejected for wrong reason"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-128-server-maintenance-fence/unapplied-maintenance-freeze-candidate.sql > "$tmp/r128-fence.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-136-v3-isolated-api-fence/unapplied-v3-api-bridge-after-r128.sql > "$tmp/r136-gateway.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-136-postgres/verify-isolated-v3-api.sql > "$tmp/verified-current-membership.log"

deny(){
 local label="$1" error_pat="$2" sql="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$sql" > "$tmp/$label.log" 2>&1;then
  fail "$label unexpectedly succeeded; R128 public or V3 API fence broken"
 fi
 grep -Eiq "$error_pat" "$tmp/$label.log" || fail "$label rejected for wrong reason"
}
deny "signed-old-sheet" "permission denied for schema public" \
 "SET ROLE authenticated;SELECT public.r128_legacy_sheet_rpc('00000000-0000-4000-8000-000000000101');"
deny "signed-old-motion" "permission denied for schema public" \
 "SET ROLE authenticated;SELECT public.r128_legacy_motion_rpc('00000000-0000-4000-8000-000000000201');"
deny "signed-v3-old-public-rpc" "permission denied for schema public" \
 "SET ROLE authenticated;SELECT public.get_authorized_scene_channel_v3('00000000-0000-4000-8000-000000000201');"
deny "signed-owner-sheet-direct" "permission denied for schema public" \
 "SET ROLE authenticated;SELECT * FROM public.r128_private_sheet;"
deny "anonymous-new-v3-rpc" "permission denied for schema forge_v3_api" \
 "SET ROLE anon;SELECT forge_v3_api.get_authorized_scene_channel_v3('00000000-0000-4000-8000-000000000201');"

# Exposing schemas in PostgREST is not implied by successful PG ACL tests.
# No request to Supabase Management API, Dashboard, Vercel or production.
echo 'R136 SYNTHETIC PG17 PASS: R128 blocks original public RPC/table routes; one current signed-actor V3 custom-schema endpoint works without restoring public USAGE.'
echo 'R136 NO_GO: forge_v3_api is NOT actually exposed to PostgREST, other V3 RPCs still blocked, old sockets/Storage/RPCs unreviewed.'
