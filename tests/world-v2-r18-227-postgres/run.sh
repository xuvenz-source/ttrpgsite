#!/usr/bin/env bash
# R227 fictional PG17-only dry-run of proposed read-only aggregate SELECT.
set -euo pipefail
fail(){ echo "R227_SCRATCH_NO_GO: $*" >&2;exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" ]] || fail "must run in disposable GitHub Actions"
[[ "${R227_ISOLATED:-}" == "yes" ]] || fail "scratch sentinel absent"
[[ "${PGHOST:-}" == "127.0.0.1" ]] || fail "not loopback host"
[[ "${PGPORT:-}" == "5432" ]] || fail "wrong port"
[[ "${PGDATABASE:-}" == "world_v2_r18_227" ]] || fail "wrong database"
[[ "${PGUSER:-}" == "postgres" ]] || fail "wrong user"
[[ "${PGPASSWORD:-}" == "r227_disposable_only" ]] || fail "wrong scratch password"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR \
 PGOPTIONS PGSERVICE PGSERVICEFILE PGPASSFILE;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "external connection override not allowed"
done
umask 077
tmp="$(mktemp -d /tmp/r227-synthetic-XXXXXXXX)"
trap 'rm -rf -- "$tmp"' EXIT
q(){ psql -X -q -t -A -v ON_ERROR_STOP=1 -c "$1"; }
[[ "$(q 'SHOW server_version_num')" == 17* ]] || fail "PostgreSQL17 required"
psql -X -q -v ON_ERROR_STOP=1 \
 -f tests/world-v2-r18-227-postgres/fictional-records.sql \
 > "$tmp/fixture.log"
result="$(psql -X -q -t -A -F '|' -v ON_ERROR_STOP=1 \
 -f scripts/release/r227_PROPOSED_readonly_original_aggregate_only.sql)"
[[ "$result" == "5|2|2|1" ]] ||
 fail "aggregate count mismatch (no source data disclosed)"
[[ "$(q 'SELECT count(*) FROM public.map_tokens')" == "5" ]] ||
 fail "read-only proposed query somehow modified fixture"
echo "R227_SYNTHETIC_PG17_PASS: 5 fictional tokens, 2 wrong map, 2 wrong character, 1 foreign active-map pointer; zero real data."
echo "R227_NO_GO: the proposed aggregate-only SQL was NOT run against original or QA Supabase."
