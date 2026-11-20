#!/usr/bin/env bash
# R145 SOURCE ONLY: disposable PG17 never hosted QA or original.
set -euo pipefail
fail(){ echo "R145 ISOLATION FAILURE: $*" >&2;exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" &&
 "${R138_ISOLATED:-}" == "yes" &&
 "${R140_ISOLATED:-}" == "yes" &&
 "${R142_ISOLATED:-}" == "yes" &&
 "${R143_ISOLATED:-}" == "yes" &&
 "${R145_ISOLATED:-}" == "yes" ]] || fail "requires explicit isolated Actions flags"
[[ "${PGHOST:-}" == "127.0.0.1" &&
 "${PGPORT:-}" == "5432" &&
 "${PGUSER:-}" == "postgres" &&
 "${PGDATABASE:-}" == "world_v2_r18_138" &&
 "${PGPASSWORD:-}" == "r138_disposable_only" ]] || fail "expected loopback synthetic DB"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "hosted DB credentials forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-145-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
bash tests/world-v2-r18-143-postgres/run.sh > "$scratch/r143.log" ||
 { tail -n 100 "$scratch/r143.log" >&2;fail "R143 prerequisite synthetic actor tests"; }
psql -X -q -v ON_ERROR_STOP=1 \
 -f staging/world-v2-b10-r18-145-monotonic-mutation-revisions/unapplied-revisioned-mutations-v3.sql \
 > "$scratch/r145-candidate.log"
deny(){
 local name="$1" expected="$2" sql="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$sql" > "$scratch/$name.log" 2>&1;then
  fail "$name unexpectedly callable"
 fi
 grep -Eiq "$expected" "$scratch/$name.log" || {
   tail -n 12 "$scratch/$name.log" >&2;fail "$name unrelated database error"
 }
}
ch='00000000-0000-4000-8000-000000000501'
note='00000000-0000-4000-8000-000000000602'
pin='00000000-0000-4000-8000-000000000611'
deny no-auth-character-read 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.get_authorized_character_sheet_revision_v3('$ch');"
deny no-auth-handout-read 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.get_authorized_handout_revision_v3('$note');"
deny no-auth-character-edit 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.patch_authorized_character_revision_v3('$ch','{}',0);"
deny no-auth-handout-edit 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.edit_authorized_handout_revision_v3('$note','a','b',true,0);"
deny no-auth-collect 'permission denied for function' \
 "SET ROLE authenticated;SELECT forge_v3_api.collect_authorized_pin_once_v3('$pin');"
deny no-anon-read 'permission denied for schema forge_v3_api' \
 "SET ROLE anon;SELECT forge_v3_api.get_authorized_character_sheet_revision_v3('$ch');"
deny legacy-public-still-closed 'permission denied for schema public' \
 "SET ROLE authenticated;SELECT public.collect_campaign_map_pin('$pin');"
psql -X -q -v ON_ERROR_STOP=1 \
 -f tests/world-v2-r18-145-postgres/verify-revisioned-mutations.sql \
 > "$scratch/verification.log"
cat "$scratch/verification.log"
echo 'R145 NO_GO: synthetic PG17 proofs do NOT establish original-schema compatibility, free-tier DDL or signed browser rollout readiness.'
