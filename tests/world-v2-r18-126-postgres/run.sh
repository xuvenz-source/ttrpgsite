#!/usr/bin/env bash
# B10-R18-126 disposable PG17 only; never permit any hosted connection.
set -euo pipefail
fail(){ echo "R126 SCRATCH-ONLY FAILURE: $*" >&2; exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${R126_ISOLATED:-}" == "yes" ]] || fail "CI isolation required"
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" ]] || fail "loopback only"
[[ "${PGDATABASE:-}" == "world_v2_r18_126" && "${PGUSER:-}" == "postgres" ]] || fail "synthetic database only"
[[ "${PGPASSWORD:-}" == "r126_disposable_only" ]] || fail "synthetic password only"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$key" || true)" ]] || fail "remote DB environment forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-126-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-125-postgres/setup.sql > "$scratch/r125-schema.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-126-postgres/setup-scene.sql > "$scratch/mock.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-125-private-scene-revocation/unapplied-scene-v3-prototype.sql > "$scratch/r125-contract.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-126-scene-v3-cutover-contract/unapplied-atomic-v3-scene-candidate.sql > "$scratch/r126-cutover.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-126-postgres/verify-scene.sql > "$scratch/verify.log"

deny(){
 local name="$1" pattern="$2" query="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$query" > "$scratch/$name.log" 2>&1;then
  fail "$name unexpectedly succeeded"
 fi
 grep -Eiq "$pattern" "$scratch/$name.log" || fail "$name unrelated SQL error"
}
deny anon-predicate 'permission denied for schema' \
 "SET ROLE anon;SELECT forge_scene_revoke.can_receive_scene_topic_v3('bad');"
deny authenticated-epoch-read 'permission denied for table' \
 "SET ROLE authenticated;SELECT * FROM forge_scene_revoke.member_scene_epochs;"
deny authenticated-server-publisher 'permission denied for schema' \
 "SET ROLE authenticated;SELECT forge_world_v2.bump_scene_publication_v2('00000000-0000-4000-8000-000000000201');"
deny authenticated-recipient-topic 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_scene_revoke.current_recipient_scene_topic_v3('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000302');"
echo 'R126 SYNTHETIC PG17 PASS: recipient-only scene events, RLS, re-entry, map routing, isolation, generation and 4 ACL denials.'
echo 'R126 NO_GO: no hosted SQL, old V2 sockets still exist on original, signed QA or deployed client.'
