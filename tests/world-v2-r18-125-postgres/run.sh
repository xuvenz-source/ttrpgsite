#!/usr/bin/env bash
# R18-125: wholly synthetic PostgreSQL 17 localhost fixture. Never hosted.
set -euo pipefail
fail(){ echo "R125 SCRATCH-ONLY FAILURE: $*" >&2;exit 64; }
[[ "$GITHUB_ACTIONS" == "true" && "$R125_ISOLATED" == "yes" ]] || fail "CI isolation absent"
[[ "$PGHOST" == "127.0.0.1" && "$PGPORT" == "5432" ]] || fail "loopback only"
[[ "$PGDATABASE" == "world_v2_r18_125" && "$PGUSER" == "postgres" ]] || fail "wrong synthetic database"
[[ "$PGPASSWORD" == "r125_disposable_only" ]] || fail "wrong synthetic password"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "remote database env is forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-125-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-125-postgres/setup.sql > "$scratch/setup.log"
psql -X -v ON_ERROR_STOP=1 -q -f \
 staging/world-v2-b10-r18-125-private-scene-revocation/unapplied-scene-v3-prototype.sql > "$scratch/prototype.log"
psql -X -v ON_ERROR_STOP=1 -q -f \
 tests/world-v2-r18-125-postgres/verify-contract.sql > "$scratch/verify.log"
deny(){
 local label="$1" pattern="$2" query="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$query" > "$scratch/$label.log" 2>&1;then
  fail "$label unexpectedly succeeded"
 fi
 grep -Eiq "$pattern" "$scratch/$label.log" || fail "$label failed for unrelated reason"
}
deny "anon-create-topic" 'permission denied for function' \
 "SET ROLE anon; SELECT public.get_authorized_scene_channel_v3('00000000-0000-4000-8000-000000000201');"
deny "auth-read-epoch-table" 'permission denied for table' \
 "SET ROLE authenticated; SELECT * FROM forge_scene_revoke.member_scene_epochs;"
deny "auth-call-server-publisher" 'permission denied for function' \
 "SET ROLE authenticated; SELECT forge_scene_revoke.current_recipient_scene_topic_v3('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000302');"
deny "anon-call-private-predicate" 'permission denied for schema' \
 "SET ROLE anon; SELECT forge_scene_revoke.can_receive_scene_topic_v3('bad');"
echo 'R125 SYNTHETIC PG17 PASS: 4 direct ACL denials, recipient-epoch lifecycle, and map authorization.'
echo 'R125 NO_GO: legacy V2 map-wide sender is live; no realtime.messages policy, hosted SQL, connected socket ejection, signed URL repair, or deployment.'
