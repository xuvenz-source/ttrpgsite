#!/usr/bin/env bash
# B10-R18-155 fictional PG17 only. No Supabase, SQL migration, or real storage rows.
set -euo pipefail
fail(){ echo "R155 SYNTHETIC PG17 NO_GO: $*" >&2;exit 64; }
[[ "$GITHUB_ACTIONS" == "true" && "$R155_ISOLATED" == "yes" ]] || fail "GitHub Actions isolation required"
[[ "$PGHOST" == "127.0.0.1" && "$PGPORT" == "5432" &&
 "$PGUSER" == "postgres" && "$PGDATABASE" == "world_v2_r18_155" &&
 "$PGPASSWORD" == "r155_disposable_only" ]] || fail "wrong isolated database"
for k in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL \
 SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY SUPABASE_ACCESS_TOKEN \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$k" || true)" ]] || fail "hosted configuration forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-155-XXXXXXXX)"
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
sql -q -f staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql > "$scratch/revoke.log"
sql -q -f tests/world-v2-r18-152-postgres/synthetic-storage-permissions.sql > "$scratch/file-model.log"
sql -q -f tests/world-v2-r18-155-postgres/synthetic-indirect-policy.sql > "$scratch/maps.log"

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
 [[ "$actual" == "$expected" ]] ||
  fail "$label: expected $expected, got $actual"
 echo "PASS $label"
}
as_actor(){
 local actor="$1" stmt="$2"
 q -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$actor',true);
 $stmt;COMMIT;" > /dev/null
}
deny(){
 local label="$1" error="$2" stmt="$3"
 if sql -c "$stmt" > "$scratch/$label.log" 2>&1;then
  fail "$label unexpectedly allowed"
 fi
 grep -Eiq "$error" "$scratch/$label.log" ||
  { cat "$scratch/$label.log" >&2;fail "$label failed for another reason"; }
 echo "PASS $label (denied)"
}

as_actor "$P1" "SELECT public.join_campaign('a1b2c3d4e5f60708')"
as_actor "$P2" "SELECT public.join_campaign('b1c2d3e4f5a60708')"

expect_count member-A-via-map-rls "$P1" "object_id='a-shared'" 1
expect_count member-A-must-not-see-B "$P1" "object_id='b-shared'" 0
expect_count member-B-via-map-rls "$P2" "object_id='b-shared'" 1
expect_count member-B-must-not-see-A "$P2" "object_id='a-shared'" 0
expect_count foreign-DM-denied-A "$DM_B" "object_id='a-shared'" 0
expect_count outsider-denied-A "$OUTSIDER" "object_id='a-shared'" 0
expect_count DM-A-own-file "$DM_A" "object_id='a-shared'" 1
deny anonymous-map-read 'permission denied for schema forge_test' \
 "SET ROLE anon;SELECT * FROM forge_test.map_catalog;"

# Negative control 1: disabling RLS on the referenced map table leaks files.
sql -q -c "ALTER TABLE forge_test.map_catalog DISABLE ROW LEVEL SECURITY;"
expect_count disabling-map-rls-leaks-A-to-P2 "$P2" "object_id='a-shared'" 1
sql -q -c "ALTER TABLE forge_test.map_catalog ENABLE ROW LEVEL SECURITY;"
expect_count restoring-map-rls-denies-P2 "$P2" "object_id='a-shared'" 0

# Negative control 2: postgres-owned SECURITY DEFINER lookup bypasses map RLS.
# Its permissive policy is OR-composed with the original policy.
sql -q <<'SQL'
CREATE FUNCTION public.synthetic_map_lookup_as_owner(p_campaign uuid,p_path text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
 AS $body$
 SELECT EXISTS (
  SELECT 1 FROM forge_test.map_catalog AS map
  WHERE map.campaign_id=p_campaign AND map.object_path=p_path
 )
 $body$;
REVOKE ALL ON FUNCTION public.synthetic_map_lookup_as_owner(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.synthetic_map_lookup_as_owner(uuid,text) TO authenticated;
CREATE POLICY r155_intentionally_unsafe_definer ON forge_test.file_objects
 FOR SELECT TO authenticated
 USING (public.synthetic_map_lookup_as_owner(campaign_id,object_path));
SQL
expect_count unsafe-definer-bypasses-map-rls "$P2" "object_id='a-shared'" 1
sql -q -c "DROP POLICY r155_intentionally_unsafe_definer ON forge_test.file_objects;"
expect_count removing-definer-policy-denies-P2 "$P2" "object_id='a-shared'" 0

# Negative control 3: an authenticated B-map row with spoofed A object path
# must not satisfy an A asset without the canonical campaign ID equality.
sql -q -c "INSERT INTO forge_test.map_catalog(campaign_id,object_path)
 VALUES('$B','a/shared-map.png');"
expect_count canonical-campaign-binding-denies-forged-path "$P2" "object_id='a-shared'" 0
sql -q <<'SQL'
CREATE POLICY r155_intentionally_unsafe_path_only ON forge_test.file_objects
 FOR SELECT TO authenticated
 USING (EXISTS (
  SELECT 1 FROM forge_test.map_catalog map
  WHERE map.object_path=forge_test.file_objects.object_path
 ));
SQL
expect_count unsafe-path-only-allows-foreign-file "$P2" "object_id='a-shared'" 1
sql -q -c "DROP POLICY r155_intentionally_unsafe_path_only ON forge_test.file_objects;"
expect_count removal-path-only-restores-denial "$P2" "object_id='a-shared'" 0

# Server-side revocation must affect fresh reads through the indirect chain.
as_actor "$DM_A" "SELECT public.dm_remove_campaign_player('$A','$P1')"
expect_count revoked-member-loses-indirect-map-access "$P1" "object_id='a-shared'" 0
deny unchanged-invite-does-not-restore-revoked-access 'DM reinstatement required' \
 "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$P1',true);
 SELECT public.join_campaign('a1b2c3d4e5f60708');COMMIT;"
as_actor "$DM_A" "SELECT public.dm_reinstate_campaign_player('$A','$P1')"
expect_count explicit-reinstatement-restores-indirect-access "$P1" "object_id='a-shared'" 1
expect_count reinstatement-does-not-expose-foreign-campaign "$P1" "object_id='b-shared'" 0

echo 'R155 fictional PG17 PASS: delegated map RLS; disabling RLS, unsafe definer, and path-only negative controls; revocation.'
echo 'R155 NO_GO: original Storage policy and private 83 historical SQL remain unreviewed; signed Auth/URLs and joined Realtime untested.'
