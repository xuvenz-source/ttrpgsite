#!/usr/bin/env bash
# R18-133: disposable PostgreSQL 17 with fictional roles/users ONLY.
set -euo pipefail
fail(){ echo "R133 PG17 ISOLATION/ASSERTION FAILURE: $*" >&2;exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${R133_ISOLATED:-}" == "yes" ]] || fail "CI isolation required"
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" ]] || fail "localhost only"
[[ "${PGDATABASE:-}" == "world_v2_r18_133" && "${PGUSER:-}" == "postgres" ]] || fail "synthetic DB only"
[[ "${PGPASSWORD:-}" == "r133_disposable_only" ]] || fail "synthetic password only"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "hosted connection variable forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-133-XXXXXXXX)"
holder_pid=''
cleanup(){ if [[ -n "$holder_pid" ]];then kill "$holder_pid" 2>/dev/null || true;wait "$holder_pid" 2>/dev/null || true;fi;rm -rf -- "$scratch"; }
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-125-postgres/setup.sql > "$scratch/setup-members.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-126-postgres/setup-scene.sql > "$scratch/setup-realtime.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-125-private-scene-revocation/unapplied-scene-v3-prototype.sql > "$scratch/setup-epochs.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-126-scene-v3-cutover-contract/unapplied-atomic-v3-scene-candidate.sql > "$scratch/setup-scene-v3.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-132-scene-publisher-drain/unapplied-scene-publication-drain.sql > "$scratch/setup-gate.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-133-observer-v3-relay/unapplied-v3-observer-relay.sql > "$scratch/setup-observer.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-133-postgres/verify-observer-relay.sql > "$scratch/observer-regressions.log"

deny(){
 local name="$1" message="$2" statement="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$statement" > "$scratch/$name.log" 2>&1;then fail "$name unexpectedly succeeded";fi
 grep -Eiq "$message" "$scratch/$name.log" || fail "$name failed for unrelated reason"
}
deny no-raw-observer "permission denied for function" \
 "SET ROLE authenticated; SELECT forge_observer_v3.dispatch_authorized_observer_v3('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000303','motion','{}');"
deny no-gate "permission denied for schema forge_scene_drain" \
 "SET ROLE authenticated; SELECT * FROM forge_scene_drain.scene_publication_gate;"
deny no-anon-topic "permission denied for schema forge_observer_v3" \
 "SET ROLE anon; SELECT forge_observer_v3.can_receive_observer_topic_v3('forge-world-observer-v3:arbitrary');"
deny no-v2-mode "violates check constraint" \
 "UPDATE forge_scene_drain.scene_publication_gate SET mode='v2' WHERE singleton;"

# A real call to R133 dispatcher holds the same R132 FOR SHARE lock until
# transaction commit. A concurrent fence UPDATE must wait, not bypass it.
# The DM needs an epoch first; original P2 is off-map by this test point.
psql -X -v ON_ERROR_STOP=1 -q <<'SQL' > "$scratch/prep-drain.log"
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
SELECT public.get_authorized_scene_channel_v3('00000000-0000-4000-8000-000000000201');
COMMIT;
UPDATE forge_scene_drain.scene_publication_gate SET mode='v3-only' WHERE singleton;
SQL
(
 psql -XAt -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',false);
BEGIN;
SELECT CASE WHEN forge_observer_v3.dispatch_authorized_observer_v3(
 '00000000-0000-4000-8000-000000000201',
 '00000000-0000-4000-8000-000000000301','motion',
 '{"mapId":"00000000-0000-4000-8000-000000000201","actor":"00000000-0000-4000-8000-000000000302","seq":7}')
 THEN 'R133_OBSERVER_LOCK_ACQUIRED' ELSE 'R133_OBSERVER_DISPATCH_FAILED' END;
SELECT pg_sleep(2);
COMMIT;
SQL
) > "$scratch/holder.log" 2>&1 &
holder_pid=$!
ready=false
for _ in $(seq 1 50);do
 if grep -q 'R133_OBSERVER_LOCK_ACQUIRED' "$scratch/holder.log";then ready=true;break;fi
 kill -0 "$holder_pid" 2>/dev/null || fail "observer holder exited early"
 sleep 0.1
done
[[ "$ready" == true ]] || fail "observer lock not acquired"
deny concurrent-fence "canceling statement due to lock timeout" \
 "SET lock_timeout='250ms';UPDATE forge_scene_drain.scene_publication_gate SET mode='fenced' WHERE singleton;"
wait "$holder_pid" || fail "observer holder failed"
holder_pid=''
psql -X -v ON_ERROR_STOP=1 -q -c \
 "UPDATE forge_scene_drain.scene_publication_gate SET mode='fenced' WHERE singleton;" > "$scratch/final-fence.log"
psql -XAt -v ON_ERROR_STOP=1 -c \
 "SELECT mode FROM forge_scene_drain.scene_publication_gate WHERE singleton;" > "$scratch/mode.log"
grep -Fxq fenced "$scratch/mode.log" || fail "final state not fenced"
echo 'R133 PASS: V3 observer topic, current signed actor/recipient, revocation, epoch rotation, off-map and transaction-locked maintenance.'
echo 'R133 NEGATIVE CONTROL: unguarded old realtime.send still publishes. Six original SQL senders have NOT been rewritten.'
echo 'R133 NO_GO: old WebSockets, 17 Postgres Changes tables, 67 privileged RPCs, Storage links, Edge and live QA unverified.'
