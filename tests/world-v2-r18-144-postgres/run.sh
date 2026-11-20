#!/usr/bin/env bash
# B10-R18-144: fenced, disposable PostgreSQL 17 risk proof.
set -euo pipefail
die(){ echo "R144 DENIED: $*" >&2; exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" &&
  "${R138_ISOLATED:-}" == "yes" &&
  "${R140_ISOLATED:-}" == "yes" &&
  "${R142_ISOLATED:-}" == "yes" &&
  "${R143_ISOLATED:-}" == "yes" &&
  "${R144_ISOLATED:-}" == "yes" ]] || die "isolated Actions guards missing"
[[ "${PGHOST:-}" == "127.0.0.1" &&
  "${PGPORT:-}" == "5432" &&
  "${PGUSER:-}" == "postgres" &&
  "${PGDATABASE:-}" == "world_v2_r18_138" &&
  "${PGPASSWORD:-}" == "r138_disposable_only" ]] ||
 die "only exact disposable loopback fixture allowed"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
  SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
  PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || die "hosted connection forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-144-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
bash tests/world-v2-r18-143-postgres/run.sh > "$scratch/r143.log" ||
 { tail -n 90 "$scratch/r143.log" >&2;die "R143 prerequisite failed"; }
psql -X -q -v ON_ERROR_STOP=1 \
 -f tests/world-v2-r18-144-postgres/prove-timestamp-cas-and-collect-risk.sql \
 > "$scratch/result.log"
cat "$scratch/result.log"
echo 'R144 NO_GO: only demonstrates risk in fictional PG17, never original database.'
