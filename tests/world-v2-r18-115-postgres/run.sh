#!/usr/bin/env bash
# R18-115 reuses only the R114 disposable PostgreSQL17 GitHub Actions fixture.
set -euo pipefail
fail(){ echo "R115 PG17 NO-GO: $*" >&2; exit 64; }

[[ "$(printenv GITHUB_ACTIONS || true)" == 'true' ]] || fail 'GitHub CI only'
[[ "$(printenv R115_ISOLATED || true)" == 'yes' ]] || fail 'missing R115 guard'
[[ "$(printenv R114_ISOLATED || true)" == 'yes' ]] || fail 'missing R114 original source guard'
[[ "$(printenv PGHOST || true)" == '127.0.0.1' ]] || fail 'requires localhost'
[[ "$(printenv PGPORT || true)" == '5432' ]] || fail 'wrong scratch port'
[[ "$(printenv PGDATABASE || true)" == 'world_v2_r18_114' ]] || fail 'wrong scratch DB'
[[ "$(printenv PGUSER || true)" == 'postgres' ]] || fail 'wrong scratch role'
[[ "$(printenv PGPASSWORD || true)" == 'r114_disposable_only' ]] || fail 'wrong scratch credential'
for envvar in DATABASE_URL DIRECT_URL SUPABASE_DB_URL SUPABASE_URL \
 SUPABASE_DATABASE_URL PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$envvar" || true)" ]] || fail "forbidden external DB setting"
done
command -v psql >/dev/null || fail 'psql missing'
command -v python3 >/dev/null || fail 'python3 missing'

# This reconstructs the R114 source-hash-bound PG17 fixture, tests the
# original inventory churn and scratch repair, and runs movement tests.
# It never contacts the original or QA Supabase projects.
bash tests/world-v2-r18-114-postgres/run.sh

scratch="$(mktemp -d /tmp/world-v2-r18-115-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
python3 tests/world-v2-r18-115-postgres/extract-lease-source.py \
 "$scratch/source-exact-lease-functions.sql"
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-115-postgres/setup.sql
psql -X -v ON_ERROR_STOP=1 -f "$scratch/source-exact-lease-functions.sql"
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-115-postgres/verify-lease-and-revocation-baseline.sql

# The candidate SQL is NOT a migration or a Supabase write. It runs only
# after the original source has proved the stale-owner authorization defect.
psql -X -v ON_ERROR_STOP=1 -f staging/world-v2-b10-r18-115-revocation-guard/unapplied-campaign-membership-required.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-115-postgres/verify-revocation-candidate.sql

echo 'R115 PG17 PASS: original lease RPC behavior and revoked-owner access reproduced; scratch-only membership candidate tested.'
echo 'R115 NO_GO: synthetic actors/DM and no signed Supabase users; no original/QA SQL, migrations or deployment.'
