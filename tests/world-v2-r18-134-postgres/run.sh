#!/usr/bin/env bash
# R18-134 synthetic PostgreSQL 17 ONLY; never hosted Supabase.
set -euo pipefail
fail(){ echo "R134 PG17 ISOLATION/SECURITY FAILURE: $*" >&2;exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${R134_ISOLATED:-}" == "yes" ]] || fail "isolated CI is required"
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" ]] || fail "loopback-only Postgres"
[[ "${PGDATABASE:-}" == "world_v2_r18_134" && "${PGUSER:-}" == "postgres" ]] || fail "disposable DB only"
[[ "${PGPASSWORD:-}" == "r134_disposable_only" ]] || fail "disposable password only"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "remote database environment forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-134-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-125-postgres/setup.sql > "$scratch/r125-members.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-126-postgres/setup-scene.sql > "$scratch/r126-realtime.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-125-private-scene-revocation/unapplied-scene-v3-prototype.sql > "$scratch/r125-epochs.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-126-scene-v3-cutover-contract/unapplied-atomic-v3-scene-candidate.sql > "$scratch/r126-v3.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-132-scene-publisher-drain/unapplied-scene-publication-drain.sql > "$scratch/r132-gate.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-133-observer-v3-relay/unapplied-v3-observer-relay.sql > "$scratch/r133-recipient.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-134-postgres/setup-stubs.sql > "$scratch/r134-schema-stubs.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-134-six-sender-v3-cutover/unapplied-six-legacy-observer-replacements.sql > "$scratch/r134-replacements.log"

# Inspect only local function definitions; none of the six may still directly
# emit to original V2 topics.
psql -XAt -v ON_ERROR_STOP=1 -c "
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE
 ((n.nspname='forge_visibility' AND p.proname IN('dispatch_movement_preview','publish_approved_navigation_batch'))
 OR (n.nspname='public' AND p.proname IN('advance_map_motion_session','advance_map_motion_session_path'))
 OR (n.nspname='forge_world_v2' AND p.proname IN('bump_vision_epoch_v2','publish_approved_observers')))
 AND pg_get_functiondef(p.oid) ILIKE '%realtime.send%';" > "$scratch/direct-legacy-senders.log"
grep -Fxq 0 "$scratch/direct-legacy-senders.log" || fail "one of six functions still contains direct realtime.send"
psql -XAt -v ON_ERROR_STOP=1 -c "
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE
 ((n.nspname='forge_visibility' AND p.proname IN('dispatch_movement_preview','publish_approved_navigation_batch'))
 OR (n.nspname='public' AND p.proname IN('advance_map_motion_session','advance_map_motion_session_path'))
 OR (n.nspname='forge_world_v2' AND p.proname IN('bump_vision_epoch_v2','publish_approved_observers')))
 AND pg_get_functiondef(p.oid) ILIKE '%forge_observer_v3.dispatch_%';" > "$scratch/v3-covered.log"
grep -Fxq 6 "$scratch/v3-covered.log" || fail "six full server sender definitions not replaced in disposable DB"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-134-postgres/verify-six-senders.sql > "$scratch/r134-verification.log"

deny(){
 local name="$1" expected="$2" statement="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$statement" > "$scratch/$name.log" 2>&1;then
  fail "$name unexpectedly succeeded"
 fi
 grep -Eiq "$expected" "$scratch/$name.log" || fail "$name failed for unrelated reason"
}
deny authenticated-system-relay 'permission denied for function' \
 "SET ROLE authenticated; SELECT forge_observer_v3.dispatch_trusted_vision_v3('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000303','{}');"
deny anon-system-relay 'permission denied for schema' \
 "SET ROLE anon; SELECT forge_observer_v3.dispatch_trusted_vision_v3('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000303','{}');"
deny authenticated-gate 'permission denied for schema' \
 "SET ROLE authenticated; SELECT * FROM forge_scene_drain.scene_publication_gate;"
echo 'R134 SYNTHETIC PG17 PASS: all six full original server bodies compile; no old observer send; no-JWT system V3 sight, private ACL and current epoch.'
echo 'R134 STILL NO_GO: no live SQL, signed Realtime WebSockets, V3 client, post-revocation socket ejection or all-routes server fence.'
