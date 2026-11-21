#!/usr/bin/env bash
# B10-R18-179 scratch-only CI; NO original/QA Supabase access.
set -euo pipefail
fail(){ echo "R179 NO_GO: $*" >&2; exit 64; }
[[ "$(printenv GITHUB_ACTIONS || true)" == "true" &&
   "$(printenv R179_ISOLATED || true)" == "yes" ]] || fail "GitHub synthetic isolation only"
[[ "$(printenv PGHOST || true)" == "127.0.0.1" &&
   "$(printenv PGPORT || true)" == "5432" &&
   "$(printenv PGDATABASE || true)" == "world_v2_r18_179" &&
   "$(printenv PGUSER || true)" == "postgres" &&
   "$(printenv PGPASSWORD || true)" == "r179_disposable_only" ]] || fail "unexpected DB target"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "remote environment forbidden"
done
command -v psql >/dev/null || fail "psql not available"
umask 077
tmp="$(mktemp -d /tmp/world-v2-r18-179-XXXXXXXX)"
trap 'rm -rf -- "$tmp"' EXIT
sql(){ psql -X -q -v ON_ERROR_STOP=1 -v statement_timeout=10000 "$@" >> "$tmp/synthetic.log" 2>&1 || {
 tail -n 20 "$tmp/synthetic.log" >&2; fail "fictional PG17 failed";
};}
sql -f tests/world-v2-r18-120-postgres/setup.sql
sql -f tests/world-v2-r18-172-postgres/auth-user-cascade-fixture.sql
sql -c "CREATE ROLE service_role NOLOGIN BYPASSRLS;
 GRANT USAGE ON SCHEMA public TO service_role;
 GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON public.campaign_members TO service_role;"
sql -f staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql
sql -f staging/world-v2-b10-r18-122-dm-membership-admin-contract/unapplied-dm-revoked-roster.sql
sql -f staging/world-v2-b10-r18-148-privileged-membership-guards/unapplied-privileged-membership-guards.sql
sql -f staging/world-v2-b10-r18-150-service-insert-privilege/unapplied-revoke-service-role-insert.sql
sql -f staging/world-v2-b10-r18-173-auth-deletion-ledger-cascade/unapplied-auth-identity-cleanup.sql
sql -f tests/world-v2-r18-179-postgres/combined.sql
echo "R179 PASS: fictional combined revoked-owner, stale-invite, reinstatement and account-deletion controls."
echo "R179 NO_GO: no original private SQL, signed hosted sessions, original/QA write or release approval."
