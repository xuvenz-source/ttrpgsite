#!/usr/bin/env bash
# R18-195 disposable PostgreSQL17 only; never point at hosted Supabase.
set -euo pipefail
fail(){ echo "R195 SCRATCH NO_GO: $*" >&2; exit 64; }
[[ "$(printenv GITHUB_ACTIONS || true)" == "true" && "$(printenv R195_ISOLATED || true)" == "yes" ]] || fail "GitHub Actions-only isolation"
[[ "$(printenv PGHOST || true)" == "127.0.0.1" && "$(printenv PGPORT || true)" == "5432" ]] || fail "host must be loopback"
[[ "$(printenv PGDATABASE || true)" == "world_v2_r18_195" && "$(printenv PGUSER || true)" == "postgres" ]] || fail "wrong scratch DB"
[[ "$(printenv PGPASSWORD || true)" == "r195_disposable_only" ]] || fail "wrong scratch-only credential"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$key" || true)" ]] || fail "hosted connection override prohibited: $key"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-195-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT

# Build the existing unchanged representative R120 private revocation model.
psql -X -q -v ON_ERROR_STOP=1 -f tests/world-v2-r18-120-postgres/setup.sql > "$scratch/setup.log"
psql -X -q -v ON_ERROR_STOP=1 -f staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql > "$scratch/revocation.log"

# Model the independently confirmed original project's effective privilege.
# No real campaign/member rows or credentials are used.
psql -X -q -v ON_ERROR_STOP=1 -c "
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT USAGE ON SCHEMA public TO service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON
    public.campaign_members TO service_role;" > "$scratch/grants.log"
[[ "$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT has_table_privilege('service_role','public.campaign_members','TRUNCATE');")" == "t" ]] ||
  fail "baseline effective service_role TRUNCATE not present"

# Baseline TRUNCATE succeeds and does NOT fire row DELETE tombstones.
# It is immediately ROLLED BACK inside the synthetic scratch transaction.
cat > "$scratch/baseline-bypass.sql" <<'SQL'
BEGIN;
SET LOCAL ROLE service_role;
TRUNCATE public.campaign_members;
RESET ROLE;
DO $assert$
BEGIN
  IF (SELECT count(*) FROM public.campaign_members) <> 0 THEN
    RAISE EXCEPTION 'baseline TRUNCATE failed to clear synthetic members';
  END IF;
  IF (SELECT count(*) FROM forge_security.campaign_member_revocations) <> 0 THEN
    RAISE EXCEPTION 'TRUNCATE unexpectedly fired row-level revocation triggers';
  END IF;
END
$assert$;
ROLLBACK;
SQL
psql -X -v ON_ERROR_STOP=1 -q -f "$scratch/baseline-bypass.sql" > "$scratch/baseline.log"
[[ "$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.campaign_members;")" == "2" ]] ||
  fail "baseline rollback did not preserve synthetic members"

# Apply ONLY scratch candidate; no forward migration or hosted schema change.
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-195-membership-truncate-denial/unapplied-truncate-denial.sql > "$scratch/candidate.log"
[[ "$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT has_table_privilege('service_role','public.campaign_members','TRUNCATE');")" == "f" ]] ||
  fail "least-privilege TRUNCATE revoke did not take effect"
[[ "$(psql -X -A -t -v ON_ERROR_STOP=1 -c "
 SELECT has_table_privilege('service_role','public.campaign_members','DELETE')
 AND has_table_privilege('service_role','public.campaign_members','INSERT')
 AND has_table_privilege('service_role','public.campaign_members','UPDATE');")" == "t" ]] ||
  fail "narrow privilege revoke removed ordinary member operations"

expect_denied(){
  local label="$1" sql="$2"
  if psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c "$sql" > "$scratch/$label.log" 2>&1;then
    fail "$label unexpectedly allowed TRUNCATE"
  fi
  grep -q "42501" "$scratch/$label.log" || fail "$label denied for wrong reason"
}
expect_denied "service-role-permission" "SET ROLE service_role; TRUNCATE public.campaign_members;"

# Even after an accidental re-grant, the statement-level trigger rejects TRUNCATE.
psql -X -q -v ON_ERROR_STOP=1 -c "GRANT TRUNCATE ON public.campaign_members TO service_role;"
expect_denied "service-role-trigger" "SET ROLE service_role; TRUNCATE public.campaign_members;"
expect_denied "owner-trigger" "TRUNCATE public.campaign_members;"
psql -X -q -v ON_ERROR_STOP=1 -c "REVOKE TRUNCATE ON public.campaign_members FROM service_role;"

[[ "$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.campaign_members;")" == "2" ]] ||
  fail "denied TRUNCATE deleted members"
[[ "$(psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM forge_security.campaign_member_revocations;")" == "0" ]] ||
  fail "denied TRUNCATE wrote incorrect revocation evidence"

# Existing 35-scenario DM/join/leave/reinstate contract must still pass.
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-120-postgres/verify-contract.sql > "$scratch/r120-regression.log"

echo "R195 SCRATCH PG17 PASS: baseline synthetic TRUNCATE bypass, targeted revoke + statement guard denial, R120 contract preserved."
echo "R195 NO_GO: admins can disable triggers; service-role operational paths, private 83-source semantics and real signed QA require review; no hosted writes."
