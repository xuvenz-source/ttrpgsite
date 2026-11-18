#!/usr/bin/env bash
# R18-117: isolated GitHub Actions PG17, no hosted DB, no CLI credentials.
set -euo pipefail
fail(){ echo "R117 DISPOSABLE NO-GO: $*" >&2; exit 64; }

for key in GITHUB_ACTIONS R114_ISOLATED R115_ISOLATED R116_ISOLATED R117_ISOLATED; do
 expected='yes'
 [[ "$key" == 'GITHUB_ACTIONS' ]] && expected='true'
 [[ "$(printenv "$key" || true)" == "$expected" ]] || fail "missing isolation marker $key"
done
[[ "$(printenv PGHOST || true)" == '127.0.0.1' ]] || fail 'localhost required'
[[ "$(printenv PGPORT || true)" == '5432' ]] || fail 'disposable port required'
[[ "$(printenv PGDATABASE || true)" == 'world_v2_r18_114' ]] || fail 'disposable DB required'
[[ "$(printenv PGUSER || true)" == 'postgres' ]] || fail 'disposable role required'
[[ "$(printenv PGPASSWORD || true)" == 'r114_disposable_only' ]] || fail 'synthetic-only credential required'
for key in DATABASE_URL DIRECT_URL SUPABASE_DB_URL SUPABASE_URL SUPABASE_DATABASE_URL PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$key" || true)" ]] || fail 'external database configuration forbidden'
done

# Existing hardened source-bound tests prepare the disposable database only.
bash tests/world-v2-r18-116-postgres/run.sh

scratch="$(mktemp -d /tmp/world-v2-r18-117-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
python3 tests/world-v2-r18-117-postgres/extract-tool-source.py "$scratch"
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-117-postgres/setup.sql
psql -X -v ON_ERROR_STOP=1 -f "$scratch/source-bound-tool-edits.sql"

deny(){
 local name="$1" pattern="$2" sql="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$sql" >"$scratch/$name.log" 2>&1; then fail "$name executed unexpectedly";fi
 grep -qi "$pattern" "$scratch/$name.log" || fail "$name failed for unrelated reason"
}
deny "anon-mutate" 'permission denied for function' \
 "SET ROLE anon; SELECT public.mutate_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702','{}'::jsonb,false);"
deny "anon-release" 'permission denied for function' \
 "SET ROLE anon; SELECT public.release_campaign_tool_item('00000000-0000-4000-8000-000000000802','00000000-0000-4000-8000-000000000702');"
deny "anon-details" 'permission denied for function' \
 "SET ROLE anon; SELECT public.patch_campaign_tool_details('00000000-0000-4000-8000-000000000804',true,NULL);"
deny "auth-direct-lease-update" 'permission denied for table' \
 "SET ROLE authenticated; DELETE FROM public.campaign_tool_item_leases;"
deny "auth-direct-tool-update" 'permission denied for table' \
 "SET ROLE authenticated; UPDATE public.campaign_tool_issues SET state='{}'::jsonb;"

psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-117-postgres/verify-tool-edits.sql
echo 'R117 DISPOSABLE PG17 PASS: tool mutation/release/metadata permissions, ownership, revocation, stale leases and item state.'
echo 'R117 NO_GO: join_campaign/create_campaign live bodies not reconstructed; signed hosted Auth and QA replay NOT_RUN.'
