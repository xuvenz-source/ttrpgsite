#!/usr/bin/env bash
# R18-132: fictional PostgreSQL 17 only. No hosted DB or external network.
set -euo pipefail
fail(){ echo "R132 PG17 SECURITY FAILURE: $*" >&2;exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${R132_ISOLATED:-}" == "yes" ]] || fail "requires isolated GitHub CI"
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" ]] || fail "loopback DB required"
[[ "${PGDATABASE:-}" == "world_v2_r18_132" && "${PGUSER:-}" == "postgres" ]] || fail "synthetic database required"
[[ "${PGPASSWORD:-}" == "r132_disposable_only" ]] || fail "synthetic password required"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$key" || true)" ]] || fail "remote database environment forbidden: $key"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-132-XXXXXXXX)"
holder_pid=''
cleanup(){
 if [[ -n "$holder_pid" ]];then
  kill "$holder_pid" 2>/dev/null || true
  wait "$holder_pid" 2>/dev/null || true
 fi
 rm -rf -- "$scratch"
}
trap cleanup EXIT

psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-125-postgres/setup.sql > "$scratch/setup-members.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-126-postgres/setup-scene.sql > "$scratch/setup-realtime.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-125-private-scene-revocation/unapplied-scene-v3-prototype.sql > "$scratch/setup-epochs.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-126-scene-v3-cutover-contract/unapplied-atomic-v3-scene-candidate.sql > "$scratch/setup-v3-receiver.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-132-scene-publisher-drain/unapplied-scene-publication-drain.sql > "$scratch/setup-fence.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-132-postgres/verify-scene-drain.sql > "$scratch/verify-drain.log"

deny(){
 local name="$1" expected="$2" sql="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$sql" > "$scratch/$name.log" 2>&1;then
  fail "$name unexpectedly succeeded"
 fi
 grep -Eiq "$expected" "$scratch/$name.log" || fail "$name failed for unrelated reason"
}
deny auth-gate-select "permission denied for schema forge_scene_drain" \
 "SET ROLE authenticated; SELECT * FROM forge_scene_drain.scene_publication_gate;"
deny auth-gate-call "permission denied for schema forge_scene_drain" \
 "SET ROLE authenticated; SELECT forge_scene_drain.scene_v3_publish_allowed();"
deny anon-gate-read "permission denied for schema forge_scene_drain" \
 "SET ROLE anon; SELECT * FROM forge_scene_drain.scene_publication_gate;"
deny unreviewed-v2-mode "violates check constraint" \
 "UPDATE forge_scene_drain.scene_publication_gate SET mode='v2' WHERE singleton=true;"

# Verify transaction-level fencing: a source transaction holds FOR SHARE
# until commit; a concurrent maintenance transition must NOT sneak past it.
psql -X -v ON_ERROR_STOP=1 -q -c \
 "UPDATE forge_scene_drain.scene_publication_gate SET mode='v3-only' WHERE singleton=true;" > "$scratch/reopen-fixture.log"
(
 psql -XAt -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT CASE WHEN forge_scene_drain.scene_v3_publish_allowed()
 THEN 'R132_GATE_LOCK_ACQUIRED' ELSE 'R132_WRONG_MODE' END;
SELECT pg_sleep(2);
COMMIT;
SQL
) > "$scratch/holder.log" 2>&1 &
holder_pid=$!
ready=false
for _ in $(seq 1 50);do
 if grep -q 'R132_GATE_LOCK_ACQUIRED' "$scratch/holder.log";then ready=true;break;fi
 kill -0 "$holder_pid" 2>/dev/null || fail "gate lock holder exited prematurely"
 sleep 0.1
done
[[ "$ready" == true ]] || fail "gate lock was not observed"
deny concurrent-fence-jump "canceling statement due to lock timeout" \
 "SET lock_timeout = '250ms'; UPDATE forge_scene_drain.scene_publication_gate SET mode='fenced' WHERE singleton=true;"
wait "$holder_pid" || fail "gate lock holder failed"
holder_pid=''
psql -X -v ON_ERROR_STOP=1 -q -c \
 "UPDATE forge_scene_drain.scene_publication_gate SET mode='fenced' WHERE singleton=true;" > "$scratch/close-after-drain.log"
psql -XAt -v ON_ERROR_STOP=1 -c \
 "SELECT mode FROM forge_scene_drain.scene_publication_gate WHERE singleton=true;" > "$scratch/final-mode.log"
grep -Fxq fenced "$scratch/final-mode.log" || fail "final gate not fenced"

echo 'R132 SYNTHETIC PG17 PASS: scene gate initial fence, V3-only fanout, member removal, epoch rotation and row-lock drain.'
echo 'R132 NEGATIVE CONTROL: a trusted unguarded realtime.send STILL publishes to an old topic; total server stream cutoff NOT PROVED.'
echo 'R132 NO_GO: 6 other SQL senders, external/client Broadcast, existing WebSockets, Postgres Changes, signed URLs and full release gating remain.'
