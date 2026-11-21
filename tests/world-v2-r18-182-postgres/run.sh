#!/usr/bin/env bash
set -euo pipefail
fail(){ echo "R182 NO_GO: $*" >&2; exit 64; }
[[ "$(printenv GITHUB_ACTIONS || true)" == "true" &&
   "$(printenv R182_ISOLATED || true)" == "yes" ]] || fail "GitHub synthetic only"
[[ "$(printenv PGHOST || true)" == "127.0.0.1" && "$(printenv PGPORT || true)" == "5432" &&
   "$(printenv PGUSER || true)" == "postgres" &&
   "$(printenv PGDATABASE || true)" == "world_v2_r18_182" &&
   "$(printenv PGPASSWORD || true)" == "r182_disposable_only" ]] || fail "unexpected database"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "remote env forbidden"
done
umask 077
tmp="$(mktemp -d /tmp/world-v2-r18-182-XXXXXXXX)"
trap 'rm -rf -- "$tmp"' EXIT
sql(){ psql -X -q -v ON_ERROR_STOP=1 -v statement_timeout=12000 "$@" >> "$tmp/synthetic.log" 2>&1 || { tail -n 25 "$tmp/synthetic.log" >&2;fail "fictional PG17 failed";};}
sql -f tests/world-v2-r18-182-postgres/schema.sql
sql -f tests/world-v2-r18-182-postgres/verify-before.sql
sql -f tests/world-v2-r18-182-postgres/rewrite-model.sql
sql -f tests/world-v2-r18-182-postgres/verify-after.sql
# The exact-match monitor guard makes whole-block re-application fail.
if psql -X -q -v ON_ERROR_STOP=1 -f tests/world-v2-r18-182-postgres/rewrite-model.sql > "$tmp/replay.log" 2>&1;then
 fail "second application unexpectedly succeeded"
fi
grep -q "Expected monitor map check not found" "$tmp/replay.log" ||
 fail "replay denied for unrelated reason"
echo "R182 PG17 PASS: original-shaped guarded function rewrites and permission invariants, replay fail-closed."
echo "R182 NO_GO: source-shaped model, not original private function bodies or signed hosted users."
