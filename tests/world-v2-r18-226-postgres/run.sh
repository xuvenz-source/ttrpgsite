#!/usr/bin/env bash
# R226: FICTIONAL PG17 tenant linkage reproduction; NEVER hosted Supabase.
set -euo pipefail
fail(){ echo "R226_SCRATCH_NO_GO: $*" >&2; exit 64; }

[[ "${GITHUB_ACTIONS:-}" == "true" ]] || fail "requires disposable Actions runner"
[[ "${R226_ISOLATED:-}" == "yes" ]] || fail "isolated sentinel missing"
[[ "${PGHOST:-}" == "127.0.0.1" ]] || fail "must be loopback"
[[ "${PGPORT:-}" == "5432" ]] || fail "unexpected port"
[[ "${PGDATABASE:-}" == "world_v2_r18_226" ]] || fail "unexpected database"
[[ "${PGUSER:-}" == "postgres" ]] || fail "unexpected scratch actor"
[[ "${PGPASSWORD:-}" == "r226_disposable_only" ]] || fail "unexpected scratch password"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR \
 PGOPTIONS PGSERVICE PGSERVICEFILE PGPASSFILE;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "forbidden external connection variable: $key"
done

umask 077
scratch="$(mktemp -d /tmp/r226-tenant-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
psql -X -q -v ON_ERROR_STOP=1 \
 -f tests/world-v2-r18-226-postgres/fictional-tenant-fixture.sql \
 > "$scratch/setup.log"

q(){ psql -X -q -A -t -v ON_ERROR_STOP=1 -c "$1"; }
server_version="$(q 'SHOW server_version_num')"
[[ "$server_version" == 17* ]] || fail "not PostgreSQL17: $server_version"
P1=00000000-0000-4000-8000-000000000301
DM=00000000-0000-4000-8000-000000000302
P2=00000000-0000-4000-8000-000000000303
C1=00000000-0000-4000-8000-000000000101
C2=00000000-0000-4000-8000-000000000102
M1=00000000-0000-4000-8000-000000000201
M2=00000000-0000-4000-8000-000000000202
CH1=00000000-0000-4000-8000-000000000401
CH2=00000000-0000-4000-8000-000000000402

token_insert(){
 local token="$1" campaign="$2" map="$3" character="$4" owner="$5" image="$6"
 local char_val="'$character'"
 [[ "$character" == "NULL" ]] && char_val="NULL"
 printf "INSERT INTO public.map_tokens(id,campaign_id,map_id,character_id,owner_id,image_path) VALUES('%s','%s','%s',%s,'%s','%s');" \
 "$token" "$campaign" "$map" "$char_val" "$owner" "$image"
}
attempt(){
 local who="$1" sql="$2" output="$3"
 # All synthetic inserts run INSIDE ROLLBACK, never persist.
 psql -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate \
  -c "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL r226.actor='$who'; $sql ROLLBACK;" \
  > "$output" 2>&1
}
expect_allowed(){
 attempt "$1" "$2" "$scratch/allowed.log" ||
  fail "expected synthetic valid/negative-control insert, was denied"
}
expect_denied(){
 local who="$1" sql="$2" expected_code="$3"
 if attempt "$who" "$sql" "$scratch/denied.log"; then
  fail "unexpected synthetic authorization / FK success"
 fi
 grep -q "$expected_code" "$scratch/denied.log" ||
  fail "unexpected denial SQLSTATE, wanted $expected_code"
}

admin_override_attempt(){
 local who="$1" sql="$2" output="$3"
 # The controlled fake admin changes the fictional active-map pointer
 # before the authenticated actor makes a separate RLS-gated INSERT.
 psql -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate \
  -c "BEGIN; UPDATE public.campaigns SET active_map_id='$M2' WHERE id='$C1'; SET LOCAL ROLE authenticated; SET LOCAL r226.actor='$who'; $sql ROLLBACK;" \
  > "$output" 2>&1
}

# Baseline counterexample 1: fictional player owns character in C1 and is a
# member of C2, but old tautological 'ch.campaign_id=ch.campaign_id'
# allows attaching C1's character to a C2 token.
expect_allowed "$P1" "$(token_insert \
  00000000-0000-4000-8000-000000000501 "$C2" "$M2" "$CH1" \
  "$P1" invented/player-a.webp)"

# Baseline counterexample 2: absent composite map FK lets C1 declare
# C2's map its active map even though map belongs to another campaign.
admin_override_attempt "$P1" "$(token_insert 00000000-0000-4000-8000-000000000502 \
 "$C1" "$M2" "$CH1" "$P1" invented/player-a.webp)" "$scratch/unsafe-map.log" ||
 fail "fictional missing campaign-map FK counterexample did not reproduce"

# Guard is not altogether absent: a different fake non-member cannot insert.
expect_denied "$P2" "$(token_insert \
  00000000-0000-4000-8000-000000000503 "$C2" "$M2" "$CH1" \
  "$P1" invented/player-a.webp)" 42501

# Apply new independently authored candidate ONLY to synthetic PG17 fixture.
psql -X -q -v ON_ERROR_STOP=1 \
 -f staging/world-v2-b10-r18-226-cross-campaign-integrity/unapplied-composite-campaign-keys.sql \
 > "$scratch/candidate.log"

[[ "$(q "SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid='public.map_tokens'::regclass AND contype='f' AND conname IN('map_tokens_campaign_map_r226_fk','map_tokens_campaign_character_r226_fk') AND NOT convalidated")" == "2" ]] ||
 fail "expected two new NOT VALID composite foreign keys"

# Old policy can still evaluate true, but new FK rejects cross-campaign link.
expect_denied "$P1" "$(token_insert \
  00000000-0000-4000-8000-000000000504 "$C2" "$M2" "$CH1" \
  "$P1" invented/player-a.webp)" 23503

# After temporarily moving the fictional active-map pointer to C2's map,
# the composite map FK independently blocks a C1 token pointing at C2 map.
if admin_override_attempt "$P1" "$(token_insert 00000000-0000-4000-8000-000000000505 \
 "$C1" "$M2" "$CH1" "$P1" invented/player-a.webp)" "$scratch/denied-map.log"; then
 fail "composite map FK accepted fictional foreign-campaign map"
fi
grep -q "23503" "$scratch/denied-map.log" ||
 fail "composite map FK produced wrong SQLSTATE"

# In-campaign player writes still function with original guard unchanged.
expect_allowed "$P1" "$(token_insert \
  00000000-0000-4000-8000-000000000506 "$C1" "$M1" "$CH1" \
  "$P1" invented/player-a.webp)"

# A legitimate same-campaign DM token may intentionally lack a character.
expect_allowed "$DM" "$(token_insert \
  00000000-0000-4000-8000-000000000507 "$C1" "$M1" "NULL" \
  "$DM" invented/monster.webp)"

# PG17 ON DELETE SET NULL (character_id) must not NULL out campaign_id.
psql -X -q -v ON_ERROR_STOP=1 -c "
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL r226.actor='$P1';
$(token_insert 00000000-0000-4000-8000-000000000508 \
 "$C2" "$M2" "$CH2" "$P1" invented/player-b.webp)
RESET ROLE;
DELETE FROM public.characters WHERE id='$CH2';
DO \$check\$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.map_tokens WHERE id=
    '00000000-0000-4000-8000-000000000508'
    AND character_id IS NULL AND campaign_id='$C2'
 ) THEN RAISE EXCEPTION 'R226_DELETE_SCOPE_REGRESSION';END IF;
END
\$check\$;
ROLLBACK;
" > "$scratch/delete-scope.log" ||
 fail "PG17 nullable character FK delete action changed campaign_id"

# Existing rows remain unverified until separately authorized validation.
[[ "$(q "SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid='public.map_tokens'::regclass AND conname IN('map_tokens_campaign_map_r226_fk','map_tokens_campaign_character_r226_fk') AND convalidated")" == "0" ]] ||
 fail "candidate incorrectly claimed historical row validation"

echo "R226_SYNTHETIC_PG17_PASS: two foreign-campaign counterexamples reproduced pre-guard and rejected by composite FKs; valid player/DM paths retained."
echo "R226_NO_GO: all original/QA data uninspected; no hosted SQL changes, no policy replacement or historical constraint validation."
