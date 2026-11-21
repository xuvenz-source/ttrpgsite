#!/usr/bin/env bash
# R18-156 fictional PG17 only; not real Supabase SQL or signed identity.
set -euo pipefail
fail(){ echo "R156 SYNTHETIC PG17 NO_GO: $*" >&2; exit 64; }
[[ "$GITHUB_ACTIONS" == "true" && "$R156_ISOLATED" == "yes" ]] || fail "isolated Actions only"
[[ "$PGHOST" == "127.0.0.1" && "$PGPORT" == "5432" &&
 "$PGUSER" == "postgres" && "$PGDATABASE" == "world_v2_r18_156" &&
 "$PGPASSWORD" == "r156_disposable_only" ]] || fail "incorrect disposable database"
for k in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL \
 SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY SUPABASE_ACCESS_TOKEN \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$k" || true)" ]] || fail "external configuration forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-156-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
sql(){ psql -X -v ON_ERROR_STOP=1 "$@"; }
q(){ psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
A="00000000-0000-4000-8000-000000000101"
B="00000000-0000-4000-8000-000000000102"
DM_A="00000000-0000-4000-8000-000000000301"
P1="00000000-0000-4000-8000-000000000302"
DM_B="00000000-0000-4000-8000-000000000304"
P2="00000000-0000-4000-8000-000000000306"
OUTSIDER="00000000-0000-4000-8000-000000000305"
MAP_A1="00000000-0000-4000-8000-000000000401"
MAP_A2="00000000-0000-4000-8000-000000000402"
MAP_B1="00000000-0000-4000-8000-000000000403"

sql -q -f tests/world-v2-r18-120-postgres/setup.sql > "$scratch/r120-setup.log"
sql -q -f staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql > "$scratch/revocation.log"
sql -q -f tests/world-v2-r18-152-postgres/synthetic-storage-permissions.sql > "$scratch/storage.log"
sql -q -f tests/world-v2-r18-156-postgres/synthetic-map-visibility.sql > "$scratch/map-fixture.log"
as_actor(){
 local actor="$1" statement="$2"
 q -c "BEGIN; SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$actor',true);
 $statement; COMMIT;" > /dev/null
}
actor_count(){
 local actor="$1" filter="$2" out
 out="$(q -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$actor',true);
 SELECT count(*) FROM forge_test.file_objects WHERE $filter;COMMIT;")"
 printf '%s\n' "$out" | tail -n 1
}
expect_count(){
 local label="$1" actor="$2" filter="$3" expected="$4" actual
 actual="$(actor_count "$actor" "$filter")"
 [[ "$actual" == "$expected" ]] || fail "$label expected=$expected got=$actual"
 echo "PASS $label"
}
deny(){
 local label="$1" pattern="$2" statement="$3"
 if sql -c "$statement" > "$scratch/$label.log" 2>&1;then
  fail "$label unexpectedly succeeded"
 fi
 grep -Eiq "$pattern" "$scratch/$label.log" ||
  { cat "$scratch/$label.log" >&2; fail "$label failed for unexpected reason"; }
 echo "PASS $label denied"
}
as_actor "$P1" "SELECT public.join_campaign('a1b2c3d4e5f60708')"
as_actor "$P2" "SELECT public.join_campaign('b1c2d3e4f5a60708')"

expect_count DM-A-sees-active-map "$DM_A" "object_id='a-shared'" 1
expect_count DM-A-sees-inactive-map "$DM_A" "object_id='a-other-map'" 1
expect_count player-A-sees-active-map "$P1" "object_id='a-shared'" 1
expect_count player-A-cannot-see-inactive-map "$P1" "object_id='a-other-map'" 0
expect_count DM-B-cannot-see-A "$DM_B" "campaign_id='$A'" 0
expect_count P2-cannot-see-A "$P2" "campaign_id='$A'" 0
expect_count P2-sees-own-B-active "$P2" "object_id='b-shared'" 1
expect_count outsider-cannot-see-A "$OUTSIDER" "campaign_id='$A'" 0
deny anonymous-map-table-access 'permission denied for schema' \
 "SET ROLE anon; SELECT * FROM forge_test.visible_maps;"

sql -q -c "INSERT INTO forge_test.player_map_overrides(campaign_id,user_id,map_id)
 VALUES('$A','$P1','$MAP_A2');"
expect_count P1-sees-own-overridden-map "$P1" "object_id='a-other-map'" 1
expect_count P1-loses-prior-active-map-on-override "$P1" "object_id='a-shared'" 0
expect_count DM-A-retains-both-after-override "$DM_A" "campaign_id='$A' AND object_id IN ('a-shared','a-other-map')" 2
expect_count P1-still-no-B-after-override "$P1" "campaign_id='$B'" 0

deny storage-path-duplicate-prohibited 'duplicate key value' \
 "INSERT INTO forge_test.visible_maps(id,campaign_id,storage_path)
 VALUES('00000000-0000-4000-8000-000000000404','$B','a/shared-map.png');"

sql -q -c "UPDATE forge_test.player_map_overrides SET map_id='$MAP_B1'
 WHERE campaign_id='$A' AND user_id='$P1';"
expect_count foreign-map-override-no-B-access "$P1" "object_id='b-shared'" 0
expect_count foreign-map-override-no-A-access "$P1" "campaign_id='$A'" 0

# This intentionally bad permissive policy authorizes a B file from A's
# authenticated override without binding campaign/map to that file.
sql -q -c "CREATE POLICY r156_intentionally_unsafe_override ON forge_test.file_objects
 FOR SELECT TO authenticated
 USING (public.synthetic_can_view_campaign_map('$A'::uuid,'$MAP_B1'::uuid));"
expect_count unsafe-unbound-map-id-leaks-foreign-file "$P1" "object_id='b-shared'" 1
sql -q -c "DROP POLICY r156_intentionally_unsafe_override ON forge_test.file_objects;"
expect_count removing-unbound-map-policy-denies-foreign-file "$P1" "object_id='b-shared'" 0

sql -q -c "UPDATE forge_test.player_map_overrides SET map_id='$MAP_A2'
 WHERE campaign_id='$A' AND user_id='$P1';"
expect_count legitimate-override-restored "$P1" "object_id='a-other-map'" 1
as_actor "$DM_A" "SELECT public.dm_remove_campaign_player('$A','$P1')"
expect_count revoked-player-loses-map-access "$P1" "object_id='a-other-map'" 0
deny revoked-player-old-invite-cannot-rejoin 'DM reinstatement required' \
 "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$P1',true);
 SELECT public.join_campaign('a1b2c3d4e5f60708'); COMMIT;"
as_actor "$DM_A" "SELECT public.dm_reinstate_campaign_player('$A','$P1')"
expect_count reinstated-player-restores-scoped-map "$P1" "object_id='a-other-map'" 1
expect_count reinstated-player-no-foreign-map "$P1" "object_id='b-shared'" 0

echo 'R156 synthetic PG17 PASS: active-map, override, canonical campaign boundary, duplicate path, revoked and unsafe OR negative control.'
echo 'R156 NO_GO: no original SQL replay, signed Supabase Auth, issued URL/Realtime tests, independent review or hosted change.'
