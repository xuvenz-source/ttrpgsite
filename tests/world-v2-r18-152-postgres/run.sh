#!/usr/bin/env bash
# R18-152 fictional PostgreSQL17-only campaign file access study.
set -euo pipefail
fail(){ echo "R152 FICTIONAL PG17 NO_GO: $*" >&2; exit 64; }
[[ "$GITHUB_ACTIONS" == "true" && "$R152_ISOLATED" == "yes" ]] || fail "isolated GitHub Actions only"
[[ "$PGHOST" == "127.0.0.1" && "$PGPORT" == "5432" &&
 "$PGUSER" == "postgres" && "$PGDATABASE" == "world_v2_r18_152" &&
 "$PGPASSWORD" == "r152_disposable_only" ]] || fail "wrong disposable target"
for k in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL \
 SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY SUPABASE_ACCESS_TOKEN \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$k" || true)" ]] || fail "external/hosted config forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-152-XXXXXXXX)"
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

sql -q -f tests/world-v2-r18-120-postgres/setup.sql > "$scratch/setup.log"
sql -q -f staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql > "$scratch/r120.log"
sql -q -f tests/world-v2-r18-152-postgres/synthetic-storage-permissions.sql > "$scratch/fixture.log"

# This JWT claim setting is exclusively a synthetic mock, not real Auth.
actor_count(){
 local actor="$1" filter="$2" output
 output="$(q -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$actor',true);
 SELECT count(*) FROM forge_test.file_objects WHERE $filter;COMMIT;")"
 printf '%s\n' "$output" | tail -n 1
}
expect_count(){
 local label="$1" actor="$2" filter="$3" expected="$4" actual
 actual="$(actor_count "$actor" "$filter")"
 [[ "$actual" == "$expected" ]] ||
  fail "$label: expected $expected visible objects, got $actual"
 printf 'PASS %s\n' "$label"
}
as_actor(){
 local actor="$1" statement="$2"
 q -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$actor',true);
 $statement;COMMIT;" > /dev/null
}
deny(){
 local label="$1" expected="$2" statement="$3"
 if sql -c "$statement" > "$scratch/$label.log" 2>&1;then
   fail "$label unexpectedly succeeded"
 fi
 grep -Eiq "$expected" "$scratch/$label.log" ||
  { cat "$scratch/$label.log" >&2;fail "$label failed for a different reason"; }
 printf 'PASS %s (denied)\n' "$label"
}

as_actor "$P1" "SELECT public.join_campaign('a1b2c3d4e5f60708')"
as_actor "$P2" "SELECT public.join_campaign('b1c2d3e4f5a60708')"
[[ "$(q -c "SELECT count(*) FROM public.campaign_members WHERE campaign_id='$A' AND user_id='$P1'")" == "1" ]] || fail "P1 not seeded"
[[ "$(q -c "SELECT count(*) FROM public.campaign_members WHERE campaign_id='$B' AND user_id='$P2'")" == "1" ]] || fail "P2 not seeded"

expect_count dm-A-own-shared "$DM_A" "object_id='a-shared'" 1
expect_count dm-A-own-dm "$DM_A" "object_id='a-dm'" 1
expect_count dm-A-other-campaign "$DM_A" "campaign_id='$B'" 0
expect_count player-A-shared "$P1" "object_id='a-shared'" 1
expect_count player-A-dm-denied "$P1" "object_id='a-dm'" 0
expect_count player-A-other-campaign "$P1" "campaign_id='$B'" 0
expect_count dm-B-own-dm "$DM_B" "object_id='b-dm'" 1
expect_count player-B-own-shared "$P2" "object_id='b-shared'" 1
expect_count player-B-own-dm-denied "$P2" "object_id='b-dm'" 0
expect_count player-B-campaign-A-denied "$P2" "campaign_id='$A'" 0
expect_count outsider-A-denied "$OUTSIDER" "campaign_id='$A'" 0
expect_count outsider-B-denied "$OUTSIDER" "campaign_id='$B'" 0
deny anon-direct-table 'permission denied for schema forge_test' \
 "SET ROLE anon; SELECT * FROM forge_test.file_objects;"

# Canonical campaign_id, NOT an attacker-controlled asset-path prefix, owns access.
sql -q -c "UPDATE forge_test.file_objects SET object_path='b/spoofed-from-A.png' WHERE object_id='a-shared';"
expect_count path-spoof-does-not-rebind-campaign "$P2" "object_id='a-shared'" 0
expect_count dm-A-still-sees-canonical-object "$DM_A" "object_id='a-shared'" 1

# Intentionally unsafe permissive OR policy. RLS permissive policies OR together;
# a "member of any campaign" branch exposes an unrelated campaign file.
sql -q -c "CREATE POLICY r152_intentionally_unsafe_or ON forge_test.file_objects
 FOR SELECT TO authenticated
 USING (public.synthetic_is_campaign_member(campaign_id)
        OR public.synthetic_is_campaign_member('$B'::uuid));"
expect_count unsafe-OR-leaks-cross-campaign "$P2" "object_id='a-shared'" 1
sql -q -c "DROP POLICY r152_intentionally_unsafe_or ON forge_test.file_objects;"
expect_count unsafe-OR-removal-restores-denial "$P2" "object_id='a-shared'" 0

# Illustrative DM-only upload policy, not a proposed product upload rule.
deny player-direct-upload 'row-level security policy' \
 "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$P1',true);
 INSERT INTO forge_test.file_objects(object_id,campaign_id,object_path,access_class)
 VALUES('p1-unauthorized-upload','$A','a/unapproved.png','shared');COMMIT;"
as_actor "$DM_A" "INSERT INTO forge_test.file_objects(object_id,campaign_id,object_path,access_class)
 VALUES('dm-a-upload','$A','a/allowed.png','shared')"
[[ "$(q -c "SELECT count(*) FROM forge_test.file_objects WHERE object_id='dm-a-upload'")" == "1" ]] ||
 fail "authorized synthetic DM upload failed"
sql -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$DM_B',true);
 DELETE FROM forge_test.file_objects WHERE object_id='a-shared';COMMIT;" > "$scratch/foreign-delete.log"
grep -q 'DELETE 0' "$scratch/foreign-delete.log" || fail "foreign DM DELETE unexpectedly had access"
[[ "$(q -c "SELECT count(*) FROM forge_test.file_objects WHERE object_id='a-shared'")" == "1" ]] ||
 fail "foreign DM deleted unrelated asset"
echo 'PASS foreign DM DELETE denied by RLS'

# R120 revocation checks the DB row; no stale JWT permissions are accepted.
as_actor "$DM_A" "SELECT public.dm_remove_campaign_player('$A','$P1')"
[[ "$(q -c "SELECT count(*) FROM forge_security.campaign_member_revocations WHERE campaign_id='$A' AND user_id='$P1'")" == "1" ]] ||
 fail "revocation tombstone missing"
expect_count revoked-P1-loses-new-storage-access "$P1" "campaign_id='$A'" 0
deny revoked-P1-cannot-reuse-old-invite 'DM reinstatement required' \
 "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$P1',true);
 SELECT public.join_campaign('a1b2c3d4e5f60708');COMMIT;"

# UNRESOLVED risk, intentionally reproduced only with fake URL token.
[[ "$(q -c "SET ROLE anon;SELECT public.synthetic_preissued_bearer_valid('R152-TEST-TOKEN-NOT-REAL');")" == "t" ]] ||
 fail "preissued bearer persistence negative control absent"
echo 'PASS negative control: synthetic preissued bearer survives removal; NEVER claim instant URL revocation'

as_actor "$DM_A" "SELECT public.dm_reinstate_campaign_player('$A','$P1')"
expect_count reinstated-P1-shared-access "$P1" "object_id='a-shared'" 1
expect_count reinstated-P1-no-DM-assets "$P1" "object_id='a-dm'" 0
expect_count reinstated-P1-no-B-assets "$P1" "campaign_id='$B'" 0

echo 'R152 synthetic PG17 PASS: cross-campaign matrix, OR leakage, revocation/reinstatement and bearer negative control.'
echo 'R152 NO_GO: fictional policies and mocked GUC, not original Storage/83 migrations, signed Supabase Auth, old Realtime or CDN.'
