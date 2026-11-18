#!/usr/bin/env bash
# R18-121: ephemeral local PostgreSQL17 in GitHub Actions only.
set -euo pipefail
fail(){ echo "R121 SCRATCH NO_GO: $*" >&2; exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${R121_ISOLATED:-}" == "yes" ]] || fail "isolation required"
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" ]] || fail "nonlocal Postgres forbidden"
[[ "${PGDATABASE:-}" == "world_v2_r18_121" && "${PGUSER:-}" == "postgres" ]] || fail "wrong synthetic target"
[[ "${PGPASSWORD:-}" == "r121_disposable_only" ]] || fail "wrong synthetic password"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "remote configuration forbidden"
done

umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-121-XXXXXXXX)"
cleanup(){ rm -rf -- "$scratch"; }
trap cleanup EXIT
export R121_MARKER_ROOT="$scratch"
uuid_campaign='00000000-0000-4000-8000-000000000101'
uuid_dm='00000000-0000-4000-8000-000000000301'
uuid_p1='00000000-0000-4000-8000-000000000302'
uuid_p2='00000000-0000-4000-8000-000000000303'
invite='a1b2c3d4e5f60708'

psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-120-postgres/setup.sql > "$scratch/setup.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql > "$scratch/prototype.log"

# The first challenge: a real FK cascading campaign DELETE must not be blocked.
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-121-postgres/campaign-cascade.sql

# Actor helper: only fixed synthetic UUIDs, no user-controlled input.
as_actor(){
 local actor="$1" expr="$2"
 psql -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c "BEGIN; SET LOCAL ROLE authenticated; SELECT pg_catalog.set_config('request.jwt.claim.sub','$actor',true); SELECT $expr; COMMIT;"
}
count_query(){ psql -X -A -t -q -v ON_ERROR_STOP=1 -c "$1"; }
wait_marker(){
 local file="$1" i
 for i in $(seq 1 100);do
  [[ -f "$scratch/$file" ]] && return 0
  sleep .1
 done
 fail "timed out before $file"
}

as_actor "$uuid_p1" "public.join_campaign('$invite')" > "$scratch/first-join.log"

# RACE 1: DM removal locks the campaign and deletes membership, but holds its
# transaction open. A simultaneous old-invite join must wait, then fail 42501.
cat > "$scratch/removing.sql" <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','$uuid_dm',true);
SELECT public.dm_remove_campaign_player('$uuid_campaign','$uuid_p1');
\! sh -c 'printf 1 > "$R121_MARKER_ROOT/remove-ready"'
SELECT pg_catalog.pg_sleep(2);
COMMIT;
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/removing.sql" > "$scratch/removing.log" 2>&1 &
remove_pid=$!
wait_marker "remove-ready"
if as_actor "$uuid_p1" "public.join_campaign('$invite')" > "$scratch/rejoin.log" 2>&1;then
 fail "rejoin succeeded during/after committed DM removal"
fi
grep -q "42501" "$scratch/rejoin.log" || fail "rejoin denied for wrong reason"
wait "$remove_pid" || fail "remove transaction failed"
[[ "$(count_query "SELECT count(*) FROM public.campaign_members WHERE campaign_id='$uuid_campaign' AND user_id='$uuid_p1'")" == "0" ]] || fail "removed player membership remains"
[[ "$(count_query "SELECT count(*) FROM forge_security.campaign_member_revocations WHERE campaign_id='$uuid_campaign' AND user_id='$uuid_p1'")" == "1" ]] || fail "revocation missing after concurrent remove"

# RACE 2: player joins FIRST but holds campaign lock through open transaction.
# DM removal starts while join is in flight; final committed state must be
# removed+tombstoned, not a stale rejoined player.
cat > "$scratch/joining.sql" <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','$uuid_p2',true);
SELECT public.join_campaign('$invite');
\! sh -c 'printf 1 > "$R121_MARKER_ROOT/join-ready"'
SELECT pg_catalog.pg_sleep(2);
COMMIT;
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/joining.sql" > "$scratch/joining.log" 2>&1 &
join_pid=$!
wait_marker "join-ready"
as_actor "$uuid_dm" "public.dm_remove_campaign_player('$uuid_campaign','$uuid_p2')" > "$scratch/remove-p2.log" || fail "DM remove after concurrent join failed"
wait "$join_pid" || fail "join transaction failed"
[[ "$(count_query "SELECT count(*) FROM public.campaign_members WHERE campaign_id='$uuid_campaign' AND user_id='$uuid_p2'")" == "0" ]] || fail "P2 still member after DM removal"
[[ "$(count_query "SELECT count(*) FROM forge_security.campaign_member_revocations WHERE campaign_id='$uuid_campaign' AND user_id='$uuid_p2'")" == "1" ]] || fail "P2 revocation missing"
echo "R121 SCRATCH CONCURRENCY PASS: DM-remove-first and join-first orderings both enforce revocation."
echo "R121 NO_GO: synthetic representative RPC only; no original source or hosted SQL executed."
