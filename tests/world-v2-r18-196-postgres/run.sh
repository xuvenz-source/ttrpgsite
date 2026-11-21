#!/usr/bin/env bash
# R18-196 loopback-only disposable PostgreSQL17 multi-table TRUNCATE/cascade proof.
# It does NOT connect to Supabase or read original historical migrations.
set -euo pipefail
fail(){ echo "R196 SCRATCH NO_GO: $*" >&2; exit 64; }
[[ "$(printenv GITHUB_ACTIONS || true)" == "true" ]] || fail "only inside GitHub Actions"
[[ "$(printenv R196_ISOLATED || true)" == "yes" ]] || fail "missing isolation marker"
[[ "$(printenv PGHOST || true)" == "127.0.0.1" ]] || fail "PGHOST must be loopback"
[[ "$(printenv PGPORT || true)" == "5432" ]] || fail "wrong port"
[[ "$(printenv PGDATABASE || true)" == "world_v2_r18_196" ]] || fail "wrong scratch DB"
[[ "$(printenv PGUSER || true)" == "postgres" ]] || fail "wrong scratch user"
[[ "$(printenv PGPASSWORD || true)" == "r196_disposable_only" ]] || fail "wrong disposable password"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL \
  SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "hosted connection override forbidden: $key"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-196-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
psql -X -q -v ON_ERROR_STOP=1 -f tests/world-v2-r18-120-postgres/setup.sql > "$scratch/setup.log"
psql -X -q -v ON_ERROR_STOP=1 -f \
  staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql > "$scratch/r120.log"

# Two synthetic inbound FK tables, matching original pg_catalog's *count* of 2.
# Exact original table names, columns and rows are deliberately not imported.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL' > "$scratch/inbound.log"
CREATE TABLE public.fictional_presence_one (
  campaign_id uuid NOT NULL, member_id uuid NOT NULL,
  FOREIGN KEY (campaign_id,member_id)
    REFERENCES public.campaign_members(campaign_id,user_id)
);
CREATE TABLE public.fictional_presence_two (
  campaign_id uuid NOT NULL, member_id uuid NOT NULL,
  FOREIGN KEY (campaign_id,member_id)
    REFERENCES public.campaign_members(campaign_id,user_id)
);
INSERT INTO public.fictional_presence_one VALUES
  ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301');
INSERT INTO public.fictional_presence_two VALUES
  ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000304');
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON public.campaign_members TO service_role;
GRANT SELECT,TRUNCATE ON
  public.campaigns,public.fictional_presence_one,public.fictional_presence_two
  TO service_role;
SQL

query(){ psql -X -q -A -t -v ON_ERROR_STOP=1 -c "$1"; }
[[ "$(query "SELECT count(*) FROM pg_catalog.pg_constraint fk
 WHERE fk.contype='f' AND fk.confrelid='public.campaign_members'::regclass")" == "2" ]] ||
  fail "synthetic exactly-two-inbound-FK count changed"
[[ "$(query "SELECT has_table_privilege('service_role','public.campaign_members','TRUNCATE')")" == "t" ]] ||
  fail "synthetic original-like direct TRUNCATE grant absent"

# The inbound FK constraints mean a NON-CASCADE direct truncate is rejected.
# This does not eliminate the CASCADE bypass; reproduce both outcomes.
if psql -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate \
  -c "SET ROLE service_role; TRUNCATE public.campaign_members;" \
  > "$scratch/noncascade.log" 2>&1;then
  fail "TRUNCATE unexpectedly bypassed synthetic inbound FK restriction"
fi
grep -q "0A000" "$scratch/noncascade.log" ||
  fail "non-CASCADE failure was not the expected FK constraint 0A000"

# A privileged CASCADE bypasses per-row DELETE tombstones and empties dependent
# tables. The transaction is always ROLLED BACK; no real data ever involved.
cat > "$scratch/baseline-cascade.sql" <<'SQL'
BEGIN;
SET LOCAL ROLE service_role;
TRUNCATE public.campaign_members CASCADE;
RESET ROLE;
DO $baseline$
BEGIN
  IF (SELECT count(*) FROM public.campaign_members) <> 0 OR
     (SELECT count(*) FROM public.fictional_presence_one) <> 0 OR
     (SELECT count(*) FROM public.fictional_presence_two) <> 0 THEN
    RAISE EXCEPTION 'synthetic CASCADE did not clear membership and FKs';
  END IF;
  IF (SELECT count(*) FROM forge_security.campaign_member_revocations) <> 0 THEN
    RAISE EXCEPTION 'row DELETE tombstones unexpectedly fired under TRUNCATE';
  END IF;
END $baseline$;
ROLLBACK;
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/baseline-cascade.sql" > "$scratch/cascade.log"

check_untouched(){
 [[ "$(query "SELECT count(*) FROM public.campaign_members")" == "2" ]] ||
   fail "member fixture lost"
 [[ "$(query "SELECT count(*) FROM public.fictional_presence_one")" == "1" ]] ||
   fail "first FK fixture lost"
 [[ "$(query "SELECT count(*) FROM public.fictional_presence_two")" == "1" ]] ||
   fail "second FK fixture lost"
 [[ "$(query "SELECT count(*) FROM forge_security.campaign_member_revocations")" == "0" ]] ||
   fail "fixture tombstone changed"
}
check_untouched

# The unchanged R195 candidate remains staged only, applied to this scratch DB.
psql -X -q -v ON_ERROR_STOP=1 -f \
 staging/world-v2-b10-r18-195-membership-truncate-denial/unapplied-truncate-denial.sql \
 > "$scratch/guard.log"
[[ "$(query "SELECT has_table_privilege('service_role','public.campaign_members','TRUNCATE')")" == "f" ]] ||
 fail "direct TRUNCATE revoke failed to deny synthetic service_role"

deny_42501(){
 local what="$1" sql="$2"
 if psql -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c "$sql" \
    > "$scratch/$what.log" 2>&1;then
   fail "$what unexpectedly permitted cascade TRUNCATE"
 fi
 grep -q "42501" "$scratch/$what.log" || fail "$what denied for unexpected reason"
}

# Direct CASCADE with dependent permissions still refuses TRUNCATE of members.
deny_42501 "service-role-cascade" \
  "SET ROLE service_role; TRUNCATE public.campaign_members CASCADE;"

# Regrant the direct permission: the statement-level guard must still reject.
psql -X -q -v ON_ERROR_STOP=1 -c \
  "GRANT TRUNCATE ON TABLE public.campaign_members TO service_role;"
deny_42501 "service-role-regrant-cascade" \
  "SET ROLE service_role; TRUNCATE public.campaign_members CASCADE;"

# A table-owner TRUNCATE on the parent, cascading *into* campaign_members, is
# also rejected by the R195 BEFORE TRUNCATE statement trigger.
deny_42501 "owner-parent-cascade" "TRUNCATE public.campaigns CASCADE;"
deny_42501 "owner-members-cascade" "TRUNCATE public.campaign_members CASCADE;"
psql -X -q -v ON_ERROR_STOP=1 -c \
  "REVOKE TRUNCATE ON TABLE public.campaign_members FROM service_role;"
check_untouched

# The original 35-case synthetic leave/join/DM remove/reinstate contract must
# still pass with both synthetic FK tables present (referencing immutable DMs).
psql -X -v ON_ERROR_STOP=1 -q \
  -f tests/world-v2-r18-120-postgres/verify-contract.sql \
  > "$scratch/r120-contract.log"
echo "R196 SCRATCH PG17 PASS: 2 inbound FK noncascade denial, CASCADE baseline bypass rolled back, service_role revoke, accidental regrant and owner parent-CASCADE guard, preserved R120 DM contract."
echo "R196 NO_GO: this is synthetic SQL, not a live signed Auth or privileged admin workflow audit."
