#!/usr/bin/env bash
# R212: synthetic GRANT ALL vs TRUNCATE effective privilege, PostgreSQL17 only.
# No original/QA connection, no original 83 historical migration or real data.
set -euo pipefail
fail(){ echo "R212 DISPOSABLE_PERMISSION_NO_GO: $*" >&2; exit 64; }
[[ "$(printenv GITHUB_ACTIONS || true)" == "true" &&
   "$(printenv R212_ISOLATED || true)" == "yes" ]] ||
 fail "must run in disposable GitHub Actions"
[[ "$(printenv PGHOST || true)" == "127.0.0.1" &&
   "$(printenv PGPORT || true)" == "5432" &&
   "$(printenv PGDATABASE || true)" == "world_v2_r18_212" &&
   "$(printenv PGUSER || true)" == "postgres" &&
   "$(printenv PGPASSWORD || true)" == "r212_disposable_only" ]] ||
 fail "refusing unknown DB target"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR \
 PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "external DB override $key"
done
[[ "$(psql -X -A -t -v ON_ERROR_STOP=1 -c 'SHOW server_version_num')" =~ ^17[0-9]{4}$ ]] ||
 fail "PostgreSQL17 required"
umask 077
scratch="$(mktemp -d /tmp/r212-fake-acl-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
cat >"$scratch/fixture.sql" <<'SQL'
-- Entire role, data, SQL and policy are fabricated.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE TABLE public.fake_campaign_members(
 fake_campaign_id integer NOT NULL,
 fake_player_id integer NOT NULL,
 PRIMARY KEY(fake_campaign_id,fake_player_id)
);
ALTER TABLE public.fake_campaign_members ENABLE ROW LEVEL SECURITY;
INSERT INTO public.fake_campaign_members VALUES (42,7);
-- A broad GRANT includes the TRUNCATE table privilege without using
-- the two-word literal GRANT TRUNCATE pattern in the migration statement.
GRANT ALL PRIVILEGES ON TABLE public.fake_campaign_members TO authenticated;
DO $t$
BEGIN
 IF NOT has_table_privilege('authenticated','public.fake_campaign_members','TRUNCATE')
 THEN RAISE EXCEPTION 'broad grant did not produce TRUNCATE'; END IF;
 IF has_table_privilege('anon','public.fake_campaign_members','TRUNCATE')
 THEN RAISE EXCEPTION 'anon unexpectedly inherited TRUNCATE'; END IF;
END $t$;
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/fixture.sql" > "$scratch/setup.log"
# RLS with no SELECT policy hides a fake row from authenticated, but
# table TRUNCATE never evaluates row-level security predicates.
cat >"$scratch/unsafe.sql" <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
DO $t$
DECLARE visible integer;
BEGIN
 SELECT count(*) INTO visible FROM public.fake_campaign_members;
 IF visible<>0 THEN
  RAISE EXCEPTION 'RLS should hide the invented row from authenticated';
 END IF;
END $t$;
TRUNCATE TABLE public.fake_campaign_members;
RESET ROLE;
DO $t$
DECLARE physical_count integer;
BEGIN
 SELECT count(*) INTO physical_count FROM public.fake_campaign_members;
 IF physical_count<>0 THEN
  RAISE EXCEPTION 'privileged TRUNCATE did not remove invented row';
 END IF;
END $t$;
-- No synthetic data or broad grants may persist beyond this negative example.
ROLLBACK;
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/unsafe.sql" > "$scratch/unsafe.log"
[[ "$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.fake_campaign_members;')" == "1" ]] ||
 fail "synthetic RLS-protected row did not recover after ROLLBACK"
# A separately reviewed synthetic corrective privilege:
# remove ONLY TRUNCATE and preserve the rest of the fake app role grants.
psql -X -q -v ON_ERROR_STOP=1 -c \
 "REVOKE TRUNCATE ON TABLE public.fake_campaign_members FROM authenticated;"
[[ "$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c \
 "SELECT has_table_privilege('authenticated','public.fake_campaign_members','TRUNCATE');")" == "f" ]] ||
 fail "TRUNCATE remained after fabricated explicit revoke"
[[ "$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c \
 "SELECT has_table_privilege('authenticated','public.fake_campaign_members','SELECT');")" == "t" ]] ||
 fail "necessary synthetic SELECT grant unexpectedly lost"
# TRUNCATE as role authenticated MUST error; capture stderr to local scratch.
if psql -X -q -v ON_ERROR_STOP=1 -c \
 "SET ROLE authenticated; TRUNCATE TABLE public.fake_campaign_members; RESET ROLE;" \
 >"$scratch/blocked.log" 2>&1; then
 fail "TRUNCATE unexpectedly allowed after explicit synthetic revoke"
fi
[[ "$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.fake_campaign_members;')" == "1" ]] ||
 fail "synthetic table changed after denied TRUNCATE"
echo "R212 SYNTHETIC PG17 PASS: GRANT ALL provides TRUNCATE despite RLS, ROLLBACK restores fake data; explicit synthetic revoke blocks TRUNCATE and retains SELECT."
echo "R212 HOSTED NO_GO: five original table permissions are NOT repaired, no original/QA SQL mutated."
