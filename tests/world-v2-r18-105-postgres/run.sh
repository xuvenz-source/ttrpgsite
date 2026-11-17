#!/usr/bin/env bash
# R18-105: disposable PostgreSQL 17 regression of EXACT R18-104 fog candidate.
# NEVER RUN against any hosted/linked/Supabase/production database.
set -euo pipefail
fail(){ echo "R105 DISPOSABLE PG17 NO-GO: $*" >&2; exit 64; }
[[ "$(printenv GITHUB_ACTIONS || true)" == 'true' ]] || fail 'GitHub Actions-only harness'
[[ "$(printenv R105_ISOLATED || true)" == 'yes' ]] || fail 'isolated workflow marker missing'
[[ "$(printenv PGHOST || true)" == '127.0.0.1' ]] || fail 'host MUST be loopback'
[[ "$(printenv PGPORT || true)" == '5432' ]] || fail 'port MUST be disposable 5432'
[[ "$(printenv PGDATABASE || true)" == 'world_v2_r18_105' ]] || fail 'database name does not identify scratch R105 DB'
[[ "$(printenv PGUSER || true)" == 'postgres' ]] || fail 'requires disposable postgres service user'
[[ "$(printenv PGPASSWORD || true)" == 'r105_disposable_only' ]] || fail 'expected CI-ephemeral credential only'
for name in DATABASE_URL DIRECT_URL SUPABASE_DB_URL SUPABASE_URL SUPABASE_DATABASE_URL \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$name" || true)" ]] || fail "forbidden external connection override: $name"
done
command -v psql >/dev/null || fail 'psql client unavailable'
command -v python3 >/dev/null || fail 'Python fixture extractor unavailable'
version="$(psql -X -A -t -v ON_ERROR_STOP=1 -c 'SHOW server_version_num')"
[[ "$version" =~ ^17[0-9]{4}$ ]] || fail "expected PostgreSQL 17, not $version"
scratch="$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT current_database()")"
[[ "$scratch" == 'world_v2_r18_105' ]] || fail 'scratch DB identity check failed'
source_dir="$(mktemp -d /tmp/world-v2-r18-105-XXXXXXXX)"
trap 'rm -rf -- "$source_dir"' EXIT

python3 tests/world-v2-r18-105-postgres/extract_sources.py "$source_dir"

psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-105-postgres/schema.sql
psql -X -v ON_ERROR_STOP=1 -f "$source_dir/original-functions.sql"
psql -X -v ON_ERROR_STOP=1 -f "$source_dir/combat-policy.sql"
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-105-postgres/baseline.sql

# Authentic "anon" role call must FAIL. Checking grants alone is insufficient.
if psql -X -v ON_ERROR_STOP=1 -c \
 "SET ROLE anon; SELECT public.is_map_fog_published('00000000-0000-4000-8000-000000000201');" \
 >"$source_dir/anon-denied.log" 2>&1; then
  fail 'anon executed SECURITY DEFINER fog RPC on historical baseline'
fi
grep -qi 'permission denied for function' "$source_dir/anon-denied.log" ||
  fail 'baseline anon call was denied for an unexpected reason'

# Install the real staged SQL candidate into the LOCAL scratch DB only.
psql -X -v ON_ERROR_STOP=1 -f staging/world-v2-b10-r18-104-fog-guard/unapplied-fog-status-guard.sql
if psql -X -v ON_ERROR_STOP=1 -c \
 "SET ROLE anon; SELECT public.is_map_fog_published('00000000-0000-4000-8000-000000000201');" \
 >"$source_dir/anon-denied-after.log" 2>&1; then
  fail 'candidate incorrectly granted anon direct execution'
fi
grep -qi 'permission denied for function' "$source_dir/anon-denied-after.log" ||
  fail 'candidate anon call denied for an unexpected reason'
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-105-postgres/post-candidate.sql

# SOURCE ROLLBACK REHEARSAL ON SCRATCH DB ONLY.
# Restoring the original definition intentionally REINTRODUCES the leak.
# This is NOT a recommendation or automated production rollback path.
psql -X -v ON_ERROR_STOP=1 -f "$source_dir/restore-fog.sql"
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-105-postgres/rollback-observation.sql

# Reinstall the exact approved-for-REHEARSAL candidate and repeat access checks.
psql -X -v ON_ERROR_STOP=1 -f staging/world-v2-b10-r18-104-fog-guard/unapplied-fog-status-guard.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-105-postgres/reapply-observation.sql

echo 'R105 DISPOSABLE PG17 PASS: real source baseline, original RLS, fog candidate, simulated 12-case access matrix, actor cleanup and rollback/re-apply.'
echo 'R105 NO_GO: Auth sessions not exercised, original 83 migration bodies not recovered, no hosted SQL writes, no deployment.'
