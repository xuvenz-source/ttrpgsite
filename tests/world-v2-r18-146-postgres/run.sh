#!/usr/bin/env bash
# R18-146 fictional Postgres17 only. No hosted Supabase access.
set -euo pipefail
fail(){ echo "R146 ISOLATION FAILURE: $*" >&2;exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" &&
 "${R138_ISOLATED:-}" == "yes" &&
 "${R140_ISOLATED:-}" == "yes" &&
 "${R142_ISOLATED:-}" == "yes" &&
 "${R143_ISOLATED:-}" == "yes" &&
 "${R145_ISOLATED:-}" == "yes" &&
 "${R146_ISOLATED:-}" == "yes" ]] || fail "dedicated isolated Actions flags required"
[[ "${PGHOST:-}" == "127.0.0.1" &&
 "${PGPORT:-}" == "5432" &&
 "${PGUSER:-}" == "postgres" &&
 "${PGDATABASE:-}" == "world_v2_r18_138" &&
 "${PGPASSWORD:-}" == "r138_disposable_only" ]] || fail "disposable loopback PG17 only"
for var in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$var" || true)" ]] || fail "hosted database environment forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-146-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
bash tests/world-v2-r18-145-postgres/run.sh > "$scratch/r145.log" ||
 { tail -n 90 "$scratch/r145.log" >&2;fail "R145 fixture failed"; }
node tests/world-v2-r18-146-postgres/lock-order-races.mjs
echo 'R146 NO_GO: only synthetic original-shaped triggers; live 83 migrations and signed clients NOT tested.'
