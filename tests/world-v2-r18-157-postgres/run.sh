#!/usr/bin/env bash
# R18-157: fictional 3-bucket Storage policy OR-composition, PostgreSQL17 only.
set -euo pipefail
fail(){ echo "R157 FICTIONAL PG17 NO_GO: $*" >&2; exit 64; }
[[ "$GITHUB_ACTIONS" == "true" && "$R157_ISOLATED" == "yes" ]] ||
 fail "isolated GitHub Actions required"
[[ "$PGHOST" == "127.0.0.1" && "$PGPORT" == "5432" &&
   "$PGUSER" == "postgres" && "$PGDATABASE" == "world_v2_r18_157" &&
   "$PGPASSWORD" == "r157_disposable_only" ]] ||
 fail "wrong disposable PostgreSQL target"
for k in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL \
 SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY SUPABASE_ACCESS_TOKEN \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$k" || true)" ]] || fail "external/hosted configuration forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-157-XXXXXXXX)"
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
sql -q -f staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql > "$scratch/revocation.log"
sql -q -f tests/world-v2-r18-152-postgres/synthetic-storage-permissions.sql > "$scratch/storage.log"
sql -q -f tests/world-v2-r18-156-postgres/synthetic-map-visibility.sql > "$scratch/map.log"
sql -q -f tests/world-v2-r18-157-postgres/synthetic-three-bucket-policies.sql > "$scratch/buckets.log"

as_actor(){
 local actor="$1" statement="$2"
 q -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$actor',true);
 $statement;COMMIT;" > /dev/null
}
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
 fail "$label: expected $expected, got $actual"
 echo "PASS $label"
}
deny(){
 local label="$1" matcher="$2" statement="$3"
 if sql -c "$statement" > "$scratch/$label.log" 2>&1;then
  fail "$label unexpectedly succeeded"
 fi
 grep -Eiq "$matcher" "$scratch/$label.log" ||
  { cat "$scratch/$label.log" >&2; fail "$label unrelated denial"; }
 echo "PASS $label denied"
}

as_actor "$P1" "SELECT public.join_campaign('a1b2c3d4e5f60708')"
as_actor "$P2" "SELECT public.join_campaign('b1c2d3e4f5a60708')"

# Three independent buckets: no policy may authorize data from another.
expect_count P1-allowed-active-map "$P1" "bucket_id='MAPS' AND object_id='a-shared'" 1
expect_count P1-denied-inactive-map "$P1" "bucket_id='MAPS' AND object_id='a-other-map'" 0
expect_count DM-A-allowed-inactive-map "$DM_A" "bucket_id='MAPS' AND object_id='a-other-map'" 1
expect_count P2-denied-campaign-A-map "$P2" "bucket_id='MAPS' AND campaign_id='$A'" 0
expect_count outsider-denied-campaign-maps "$OUTSIDER" "bucket_id='MAPS'" 0
expect_count P1-owned-portrait "$P1" "bucket_id='TOKENS' AND object_id='a-owned-portrait'" 1
expect_count P1-hidden-other-token-denied "$P1" "bucket_id='TOKENS' AND object_id='a-hidden-token'" 0
expect_count P1-visible-in-sight-token "$P1" "bucket_id='TOKENS' AND object_id='a-visible-token'" 1
expect_count P1-cross-campaign-token-denied "$P1" "bucket_id='TOKENS' AND object_id='b-visible-token'" 0
expect_count DM-A-visible-own-hidden-token "$DM_A" "bucket_id='TOKENS' AND object_id='a-hidden-token'" 1
expect_count P2-visible-own-campaign-token "$P2" "bucket_id='TOKENS' AND object_id='b-visible-token'" 1
expect_count P2-cross-campaign-portrait-denied "$P2" "bucket_id='TOKENS' AND object_id='a-owned-portrait'" 0
expect_count outsider-denied-campaign-token "$OUTSIDER" "bucket_id='TOKENS'" 0
expect_count P1-personal-avatar-only "$P1" "bucket_id='USER' AND object_id='a-personal-avatar'" 1
expect_count P1-denied-other-personal-avatar "$P1" "bucket_id='USER' AND object_id='b-personal-avatar'" 0
expect_count DM-A-denied-player-avatar "$DM_A" "bucket_id='USER' AND object_id='a-personal-avatar'" 0
expect_count outsider-denied-other-personal-assets "$OUTSIDER" "bucket_id='USER'" 0
deny anonymous-storage-no-schema 'permission denied for schema forge_test' \
 "SET ROLE anon;SELECT * FROM forge_test.file_objects;"

# A player-specific map override removes active-map sight and assets.
sql -q -c "INSERT INTO forge_test.player_map_overrides(campaign_id,user_id,map_id)
 VALUES('$A','$P1','00000000-0000-4000-8000-000000000402');"
expect_count P1-player-override-removes-active-map "$P1" "bucket_id='MAPS' AND object_id='a-shared'" 0
expect_count P1-player-override-gets-target-map "$P1" "bucket_id='MAPS' AND object_id='a-other-map'" 1
expect_count P1-player-override-removes-token-sight "$P1" "bucket_id='TOKENS' AND object_id='a-visible-token'" 0
expect_count P1-portrait-remains-with-campaign-membership "$P1" "bucket_id='TOKENS' AND object_id='a-owned-portrait'" 1
sql -q -c "DELETE FROM forge_test.player_map_overrides WHERE campaign_id='$A' AND user_id='$P1';"
expect_count P1-after-override-removed-visible-token "$P1" "bucket_id='TOKENS' AND object_id='a-visible-token'" 1

# PERMISSIVE policies OR-compose. An extra row-wide membership branch is
# unsafe even while all three original modeled policies remain bucket scoped.
sql -q -c "CREATE POLICY r157_intentionally_unsafe_unscoped ON forge_test.file_objects
 FOR SELECT TO authenticated USING (public.synthetic_is_campaign_member(campaign_id));"
expect_count unsafe-unscoped-policy-leaks-hidden-token "$P1" "object_id='a-hidden-token'" 1
expect_count unsafe-unscoped-policy-leaks-inactive-map "$P1" "object_id='a-other-map'" 1
sql -q -c "DROP POLICY r157_intentionally_unsafe_unscoped ON forge_test.file_objects;"
expect_count removing-unscoped-policy-restores-hidden-denial "$P1" "object_id='a-hidden-token'" 0
expect_count removing-unscoped-policy-restores-inactive-denial "$P1" "object_id='a-other-map'" 0

# Revocation removes new campaign-authorized files; personal assets remain
# owned by the account and are NOT campaign-scoped (intentional distinction).
as_actor "$DM_A" "SELECT public.dm_remove_campaign_player('$A','$P1')"
expect_count revoked-P1-cannot-use-campaign-portrait "$P1" "object_id='a-owned-portrait'" 0
expect_count revoked-P1-cannot-use-map "$P1" "object_id='a-shared'" 0
expect_count revoked-P1-cannot-use-visible-token "$P1" "object_id='a-visible-token'" 0
expect_count revoked-P1-retains-personal-avatar "$P1" "object_id='a-personal-avatar'" 1
deny revoked-P1-old-invite-still-denied 'DM reinstatement required' \
 "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$P1',true);
 SELECT public.join_campaign('a1b2c3d4e5f60708');COMMIT;"

# An erroneously broad owner-only token policy bypasses revocation.
sql -q -c "CREATE POLICY r157_intentionally_unsafe_old_owner ON forge_test.file_objects
 FOR SELECT TO authenticated USING (bucket_id='TOKENS' AND owner_id=auth.uid());"
expect_count unsafe-owner-only-policy-after-revocation "$P1" "object_id='a-owned-portrait'" 1
sql -q -c "DROP POLICY r157_intentionally_unsafe_old_owner ON forge_test.file_objects;"
expect_count removing-owner-only-policy-restores-revocation "$P1" "object_id='a-owned-portrait'" 0

as_actor "$DM_A" "SELECT public.dm_reinstate_campaign_player('$A','$P1')"
expect_count reinstated-P1-authorized-map "$P1" "object_id='a-shared'" 1
expect_count reinstated-P1-authorized-token "$P1" "object_id='a-visible-token'" 1
expect_count reinstated-P1-denied-hidden-token "$P1" "object_id='a-hidden-token'" 0
expect_count reinstated-P1-denied-B-campaign-assets "$P1" "campaign_id='$B' AND bucket_id='TOKENS'" 0

echo 'R157 isolated PG17 PASS: three distinct bucket RLS, map/token/user asset differences, sight, override and revocation; two unsafe OR controls.'
echo 'R157 NO_GO: no real original Storage policies, real signed Auth, previously issued URL or joined Realtime validation.'
