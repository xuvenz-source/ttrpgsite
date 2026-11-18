#!/usr/bin/env bash
# R18-116: strict, disposable GitHub Actions PostgreSQL17 ONLY. Never linked.
set -euo pipefail
fail(){ echo "R116 ISOLATED SECURITY NO-GO: $*" >&2; exit 64; }

[[ "$(printenv GITHUB_ACTIONS || true)" == 'true' ]] || fail 'CI only'
[[ "$(printenv R116_ISOLATED || true)" == 'yes' ]] || fail 'missing R116 marker'
[[ "$(printenv R115_ISOLATED || true)" == 'yes' ]] || fail 'missing R115 marker'
[[ "$(printenv R114_ISOLATED || true)" == 'yes' ]] || fail 'missing R114 marker'
[[ "$(printenv PGHOST || true)" == '127.0.0.1' ]] || fail 'localhost only'
[[ "$(printenv PGPORT || true)" == '5432' ]] || fail 'wrong disposable PG port'
[[ "$(printenv PGDATABASE || true)" == 'world_v2_r18_114' ]] || fail 'wrong disposable DB'
[[ "$(printenv PGUSER || true)" == 'postgres' ]] || fail 'wrong disposable role'
[[ "$(printenv PGPASSWORD || true)" == 'r114_disposable_only' ]] || fail 'wrong fixed synthetic credential'
for key in DATABASE_URL DIRECT_URL SUPABASE_DB_URL SUPABASE_URL \
 SUPABASE_DATABASE_URL PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$key" || true)" ]] || fail 'external DB override detected'
done

# Re-run existing source-verified R114 and R115 acceptance fixture in scratch.
# Neither runner has credentials or access to either real Supabase project.
bash tests/world-v2-r18-115-postgres/run.sh

scratch="$(mktemp -d /tmp/world-v2-r18-116-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
python3 tests/world-v2-r18-116-postgres/extract-source.py "$scratch"
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-116-postgres/setup.sql
psql -X -v ON_ERROR_STOP=1 -f "$scratch/source-exact-tool-claim.sql"
psql -X -v ON_ERROR_STOP=1 -f "$scratch/source-exact-npc-reader.sql"

deny(){
 local name="$1" pattern="$2" sql="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$sql" >"$scratch/$name.log" 2>&1; then
  fail "$name unexpectedly executed"
 fi
 grep -qi "$pattern" "$scratch/$name.log" || fail "$name failed for unrelated reason"
}
deny "anon-tool-claim" 'permission denied for function' \
 "SET ROLE anon; SELECT * FROM public.claim_campaign_tool_item('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701',false);"
deny "anon-npc-reader" 'permission denied for function' \
 "SET ROLE anon; SELECT * FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');"
deny "auth-tool-lease-update" 'permission denied for table' \
 "SET ROLE authenticated; UPDATE public.campaign_tool_item_leases SET expires_at=now();"

psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-116-postgres/verify-tool-npc-revocation.sql

echo 'R116 DISPOSABLE PG17 PASS: 28 synthetic role/claim/NPC revocation scenarios and 3 ACL negatives.'
echo 'R116 NO_GO: membership and DM helper are synthetic; no real signed-user testing, QA migration or production deploy.'
