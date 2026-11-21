#!/usr/bin/env bash
# R18-158 fictional PG17 only. No remote Supabase or real Storage objects.
set -euo pipefail
fail(){ echo "R158 FICTIONAL PG17 NO_GO: $*" >&2; exit 64; }
[[ "$GITHUB_ACTIONS" == "true" && "$R158_ISOLATED" == "yes" ]] ||
 fail "GitHub Actions synthetic isolation required"
[[ "$PGHOST" == "127.0.0.1" && "$PGPORT" == "5432" &&
   "$PGUSER" == "postgres" && "$PGDATABASE" == "world_v2_r18_158" &&
   "$PGPASSWORD" == "r158_disposable_only" ]] ||
 fail "wrong disposable PostgreSQL target"
for k in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL \
 SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY SUPABASE_ACCESS_TOKEN \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$k" || true)" ]] || fail "external/hosted configuration forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-158-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
sql(){ psql -X -v ON_ERROR_STOP=1 "$@"; }
q(){ psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
A="00000000-0000-4000-8000-000000000101"
B="00000000-0000-4000-8000-000000000102"
DM_A="00000000-0000-4000-8000-000000000301"
P1="00000000-0000-4000-8000-000000000302"
P2="00000000-0000-4000-8000-000000000306"
OUTSIDER="00000000-0000-4000-8000-000000000305"

sql -q -f tests/world-v2-r18-120-postgres/setup.sql > "$scratch/setup.log"
sql -q -f staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql > "$scratch/revocation.log"
sql -q -f tests/world-v2-r18-152-postgres/synthetic-storage-permissions.sql > "$scratch/storage.log"
sql -q -f tests/world-v2-r18-156-postgres/synthetic-map-visibility.sql > "$scratch/maps.log"
sql -q -f tests/world-v2-r18-157-postgres/synthetic-three-bucket-policies.sql > "$scratch/buckets.log"
sql -q -f tests/world-v2-r18-158-postgres/synthetic-storage-writes.sql > "$scratch/write-fixture.log"

as_actor(){
 local actor="$1" statement="$2"
 q -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$actor',true);
 $statement;COMMIT;" > /dev/null
}
deny(){
 local label="$1" matcher="$2" actor="$3" statement="$4"
 if sql -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$actor',true);
 $statement;COMMIT;" > "$scratch/$label.log" 2>&1;then
  fail "$label unexpectedly allowed"
 fi
 grep -Eiq "$matcher" "$scratch/$label.log" ||
  { cat "$scratch/$label.log" >&2;fail "$label unrelated denial"; }
 echo "PASS $label denied"
}
count(){
 local object="$1" expected="$2" actual
 actual="$(q -c "SELECT count(*) FROM forge_test.file_objects WHERE object_id='$object'")"
 [[ "$actual" == "$expected" ]] || fail "$object count expected=$expected got=$actual"
}

as_actor "$P1" "SELECT public.join_campaign('a1b2c3d4e5f60708')"
as_actor "$P2" "SELECT public.join_campaign('b1c2d3e4f5a60708')"

# DM may create own campaign map but not another campaign's map.
as_actor "$DM_A" "INSERT INTO forge_test.file_objects
 (object_id,campaign_id,object_path,access_class,bucket_id)
 VALUES('a-new-map','$A','$A/new-map.png','shared','MAPS')"
count 'a-new-map' 1
echo 'PASS current campaign DM creates map'
deny foreign-DM-map-upload 'row-level security policy' "$DM_A" \
 "INSERT INTO forge_test.file_objects(object_id,campaign_id,object_path,access_class,bucket_id)
 VALUES('foreign-dm-map','$B','$B/new-map.png','shared','MAPS')"
deny player-cannot-map-upload 'row-level security policy' "$P1" \
 "INSERT INTO forge_test.file_objects(object_id,campaign_id,object_path,access_class,bucket_id)
 VALUES('player-map','$A','$A/player-map.png','shared','MAPS')"
deny map-path-cannot-be-other-campaign 'row-level security policy' "$DM_A" \
 "INSERT INTO forge_test.file_objects(object_id,campaign_id,object_path,access_class,bucket_id)
 VALUES('spoofed-map','$A','$B/spoofed.png','shared','MAPS')"

# Synthetic map metadata makes the fresh map visible to its authorized DM,
# so the separate DELETE policy can be tested with full RLS SELECT gating.
sql -q -c "INSERT INTO forge_test.visible_maps(id,campaign_id,storage_path)
 VALUES('00000000-0000-4000-8000-000000000405','$A','$A/new-map.png');"
out="$(sql -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$DM_A',true);
 DELETE FROM forge_test.file_objects WHERE object_id='a-new-map';
 ROLLBACK;")"
grep -q 'DELETE 1' <<< "$out" || fail "DM delete same-campaign map failed"
echo 'PASS current DM delete same-campaign map'
out="$(sql -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$P1',true);
 DELETE FROM forge_test.file_objects WHERE object_id='a-new-map';
 ROLLBACK;")"
grep -q 'DELETE 0' <<< "$out" || fail "player deleted DM map"
echo 'PASS player map delete denied'

# Player's own portrait namespace is permitted, but DM namespace is not.
as_actor "$P1" "INSERT INTO forge_test.file_objects
 (object_id,campaign_id,object_path,access_class,bucket_id,owner_id)
 VALUES('p1-new-portrait','$A','$A/player/$P1/new.png','shared','TOKENS','$P1')"
count 'p1-new-portrait' 1
echo 'PASS member uploads own portrait'
deny player-cannot-write-dm-token-namespace 'row-level security policy' "$P1" \
 "INSERT INTO forge_test.file_objects(object_id,campaign_id,object_path,access_class,bucket_id)
 VALUES('p1-dm-token','$A','$A/dm/new.png','shared','TOKENS')"
deny player-cannot-spoof-other-owner-folder 'row-level security policy' "$P1" \
 "INSERT INTO forge_test.file_objects(object_id,campaign_id,object_path,access_class,bucket_id)
 VALUES('p1-spoof-owner','$A','$A/player/$OUTSIDER/new.png','shared','TOKENS')"
deny member-cannot-insert-foreign-token 'row-level security policy' "$P1" \
 "INSERT INTO forge_test.file_objects(object_id,campaign_id,object_path,access_class,bucket_id)
 VALUES('p1-foreign-token','$B','$B/player/$P1/new.png','shared','TOKENS')"
as_actor "$DM_A" "INSERT INTO forge_test.file_objects
 (object_id,campaign_id,object_path,access_class,bucket_id,owner_id)
 VALUES('dm-new-token','$A','$A/dm/new.png','shared','TOKENS','$DM_A')"
count 'dm-new-token' 1
echo 'PASS DM uploads own DM namespace token'

# No DELETE policy exists for token bucket, even for same-campaign DM.
out="$(sql -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$DM_A',true);
 DELETE FROM forge_test.file_objects WHERE object_id='a-hidden-token';
 ROLLBACK;")"
grep -q 'DELETE 0' <<< "$out" || fail "token DELETE unexpectedly succeeded"
echo 'PASS token deletion denied without bucket DELETE policy'

# Owner-only personal bucket behaves independently of campaign membership.
as_actor "$P1" "INSERT INTO forge_test.file_objects
 (object_id,campaign_id,object_path,access_class,bucket_id,owner_id)
 VALUES('p1-new-personal','$A','$P1/fresh.png','shared','USER','$P1')"
count 'p1-new-personal' 1
echo 'PASS owner can upload personal file'
deny foreign-user-personal-upload 'row-level security policy' "$P2" \
 "INSERT INTO forge_test.file_objects(object_id,campaign_id,object_path,access_class,bucket_id,owner_id)
 VALUES('p2-fakes-p1-file','$A','$P1/evil.png','shared','USER','$P2')"
out="$(sql -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$P1',true);
 DELETE FROM forge_test.file_objects WHERE object_id='p1-new-personal';
 ROLLBACK;")"
grep -q 'DELETE 1' <<< "$out" || fail "personal owner delete denied"
echo 'PASS owner can delete personal file'

# RLS UPDATE has no policy despite table-level UPDATE grant.
out="$(sql -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$DM_A',true);
 UPDATE forge_test.file_objects SET body_marker='changed'
 WHERE object_id='a-new-map';
 ROLLBACK;")"
grep -q 'UPDATE 0' <<< "$out" || fail "UPDATE succeeded without RLS UPDATE policy"
echo 'PASS absent UPDATE policy denies authenticated write'

# SCRATCH-ONLY optional candidate proves a safe DM map update needs USING
# and WITH CHECK to forbid changing campaign identity or path prefix.
sql -q -c "CREATE POLICY r158_scrap_update_candidate ON forge_test.file_objects
 FOR UPDATE TO authenticated
 USING (bucket_id='MAPS' AND split_part(object_path,'/',1)=campaign_id::text
        AND public.synthetic_is_campaign_dm(campaign_id))
 WITH CHECK (bucket_id='MAPS' AND split_part(object_path,'/',1)=campaign_id::text
             AND public.synthetic_is_campaign_dm(campaign_id));"
out="$(sql -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$DM_A',true);
 UPDATE forge_test.file_objects SET body_marker='changed'
 WHERE object_id='a-new-map';ROLLBACK;")"
grep -q 'UPDATE 1' <<< "$out" || fail "scratch DM update candidate failed"
echo 'PASS scratch-only DM UPDATE candidate permits own map'
out="$(sql -c "BEGIN;SET LOCAL ROLE authenticated;
 SELECT pg_catalog.set_config('request.jwt.claim.sub','$P1',true);
 UPDATE forge_test.file_objects SET body_marker='player-change'
 WHERE object_id='a-new-map';ROLLBACK;")"
grep -q 'UPDATE 0' <<< "$out" || fail "scratch player update succeeded"
echo 'PASS scratch-only player UPDATE denied'
deny scratch-candidate-prevents-cross-campaign-path-change 'row-level security policy' "$DM_A" \
 "UPDATE forge_test.file_objects SET object_path='$B/steal.png' WHERE object_id='a-new-map'"
sql -q -c "DROP POLICY r158_scrap_update_candidate ON forge_test.file_objects;"

# Revocation prevents fresh member portrait uploads, not separate account files.
as_actor "$DM_A" "SELECT public.dm_remove_campaign_player('$A','$P1')"
deny revoked-portrait-upload 'row-level security policy' "$P1" \
 "INSERT INTO forge_test.file_objects(object_id,campaign_id,object_path,access_class,bucket_id,owner_id)
 VALUES('revoked-token','$A','$A/player/$P1/after.png','shared','TOKENS','$P1')"
as_actor "$P1" "INSERT INTO forge_test.file_objects
 (object_id,campaign_id,object_path,access_class,bucket_id,owner_id)
 VALUES('revoked-personal-still-owned','$A','$P1/post-remove.png','shared','USER','$P1')"
count 'revoked-personal-still-owned' 1
echo 'PASS revoked member retains separately owned account file'

echo 'R158 fictional PG17 PASS: 3-bucket insert, 2-bucket delete, missing UPDATE policy and scratch-only constrained UPDATE candidate.'
echo 'R158 NO_GO: no original SQL applied, no signed Supabase Auth, no issued URL/old Realtime verification, no production approval.'
