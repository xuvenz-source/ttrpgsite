#!/usr/bin/env bash
# R18-197: synthetic public RLS table GRANT, never hosted Supabase SQL.
set -euo pipefail
fail(){ echo "R197 SCRATCH NO_GO: $*" >&2; exit 64; }
[[ "$(printenv GITHUB_ACTIONS || true)" == "true" ]] || fail "not GitHub Actions"
[[ "$(printenv R197_ISOLATED || true)" == "yes" ]] || fail "scratch marker absent"
[[ "$(printenv PGHOST || true)" == "127.0.0.1" ]] || fail "host must be loopback"
[[ "$(printenv PGPORT || true)" == "5432" ]] || fail "wrong scratch port"
[[ "$(printenv PGDATABASE || true)" == "world_v2_r18_197" ]] || fail "wrong scratch database"
[[ "$(printenv PGUSER || true)" == "postgres" ]] || fail "wrong scratch superuser"
[[ "$(printenv PGPASSWORD || true)" == "r197_disposable_only" ]] || fail "wrong scratch-only password"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL \
 SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$key" || true)" ]] || fail "forbidden external connection override: $key"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-197-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT

cat > "$scratch/seed.sql" <<'SQL'
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN INHERIT;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO authenticated,service_role;
CREATE TABLE public.campaign_members (user_id uuid PRIMARY KEY);
INSERT INTO public.campaign_members(user_id)
VALUES('00000000-0000-4000-8000-000000000301');
CREATE TABLE public.campaign_map_views (
 id integer PRIMARY KEY,member_id uuid REFERENCES public.campaign_members(user_id)
);
CREATE TABLE public.campaign_player_maps (
 id integer PRIMARY KEY,member_id uuid REFERENCES public.campaign_members(user_id)
);
CREATE TABLE public.map_environments (id integer PRIMARY KEY);
CREATE TABLE public.tabletop_macros (id integer PRIMARY KEY);
CREATE TABLE public.tabletop_menu_preferences (id integer PRIMARY KEY);
INSERT INTO public.campaign_map_views VALUES(1,'00000000-0000-4000-8000-000000000301');
INSERT INTO public.campaign_player_maps VALUES(1,'00000000-0000-4000-8000-000000000301');
INSERT INTO public.map_environments VALUES(1);
INSERT INTO public.tabletop_macros VALUES(1);
INSERT INTO public.tabletop_menu_preferences VALUES(1);
ALTER TABLE public.campaign_map_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_player_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabletop_macros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabletop_menu_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON
 public.campaign_map_views,public.campaign_player_maps,
 public.map_environments,public.tabletop_macros,
 public.tabletop_menu_preferences
 TO authenticated,service_role;
COMMIT;
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/seed.sql" > "$scratch/seed.log"

q(){ psql -X -A -t -q -v ON_ERROR_STOP=1 -c "$1"; }
for name in campaign_map_views campaign_player_maps map_environments tabletop_macros tabletop_menu_preferences;do
 [[ "$(q "SELECT has_table_privilege('authenticated','public.$name','TRUNCATE')")" == "t" ]] ||
   fail "synthetic authenticated TRUNCATE grant missing: $name"
 [[ "$(q "SELECT has_table_privilege('anon','public.$name','TRUNCATE')")" == "f" ]] ||
   fail "anon should lack TRUNCATE: $name"
 [[ "$(q "SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid='public.$name'::regclass")" == "t" ]] ||
   fail "synthetic RLS disabled: $name"
 [[ "$(q "SELECT count(*) FROM public.$name")" == "1" ]] ||
   fail "synthetic table not seeded: $name"
done

# SELECT is default-denied by RLS while TRUNCATE remains executable by grant.
[[ "$(q "SET ROLE authenticated; SELECT count(*) FROM public.tabletop_macros")" == "0" ]] ||
 fail "RLS failed to default-deny authenticated SELECT"

cat > "$scratch/baseline.sql" <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
TRUNCATE public.campaign_map_views,public.campaign_player_maps,
 public.map_environments,public.tabletop_macros,public.tabletop_menu_preferences;
RESET ROLE;
DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.campaign_map_views)<>0 OR
    (SELECT count(*) FROM public.campaign_player_maps)<>0 OR
    (SELECT count(*) FROM public.map_environments)<>0 OR
    (SELECT count(*) FROM public.tabletop_macros)<>0 OR
    (SELECT count(*) FROM public.tabletop_menu_preferences)<>0 THEN
  RAISE EXCEPTION 'synthetic authenticated TRUNCATE unexpectedly blocked';
 END IF;
END
$verify$;
ROLLBACK;
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/baseline.sql" > "$scratch/baseline.log"

# Candidate is still UNAPPLIED to hosted DB, installed only in scratch.
psql -X -q -v ON_ERROR_STOP=1 -f \
 staging/world-v2-b10-r18-197-authenticated-truncate/unapplied-five-table-revoke.sql \
 > "$scratch/candidate.log"

deny_truncate(){
 local name="$1"
 if psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate \
   -c "SET ROLE authenticated; TRUNCATE public.$name;" \
   > "$scratch/deny-$name.log" 2>&1; then
  fail "authenticated could still TRUNCATE $name"
 fi
 grep -q "42501" "$scratch/deny-$name.log" ||
   fail "authenticated denied for wrong SQLSTATE: $name"
}
for name in campaign_map_views campaign_player_maps map_environments tabletop_macros tabletop_menu_preferences;do
 [[ "$(q "SELECT has_table_privilege('authenticated','public.$name','TRUNCATE')")" == "f" ]] ||
   fail "revocation failed: $name"
 [[ "$(q "SELECT has_table_privilege('service_role','public.$name','TRUNCATE')")" == "t" ]] ||
   fail "service role unexpectedly lost TRUNCATE: $name"
 for kind in SELECT INSERT UPDATE DELETE;do
   [[ "$(q "SELECT has_table_privilege('authenticated','public.$name','$kind')")" == "t" ]] ||
     fail "ordinary $kind grant lost: $name"
 done
 [[ "$(q "SELECT count(*) FROM public.$name")" == "1" ]] ||
   fail "synthetic data changed: $name"
 deny_truncate "$name"
done

# Simulate future inherited grant. Direct REVOKE must fail closed if an
# inherited privilege keeps TRUNCATE effective after candidate execution.
psql -X -q -v ON_ERROR_STOP=1 -c \
 "CREATE ROLE r197_inherited NOLOGIN; GRANT TRUNCATE ON public.tabletop_macros TO r197_inherited; GRANT r197_inherited TO authenticated;" \
 > "$scratch/inherited-grant.log"
[[ "$(q "SELECT has_table_privilege('authenticated','public.tabletop_macros','TRUNCATE')")" == "t" ]] ||
 fail "inherited counterexample not exercised"
if psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate \
  -f staging/world-v2-b10-r18-197-authenticated-truncate/unapplied-five-table-revoke.sql \
  > "$scratch/inherited-rejection.log" 2>&1;then
 fail "candidate silently accepted inherited TRUNCATE"
fi
grep -q "42501" "$scratch/inherited-rejection.log" ||
 fail "inherited grant not rejected with expected SQLSTATE"
psql -X -q -v ON_ERROR_STOP=1 -c "REVOKE r197_inherited FROM authenticated;" \
 > "$scratch/cleanup.log"
[[ "$(q "SELECT has_table_privilege('authenticated','public.tabletop_macros','TRUNCATE')")" == "f" ]] ||
 fail "inherited role cleanup failed"

echo "R197 SCRATCH PG17 PASS: five RLS-enabled authenticated TRUNCATE baselines rolled back; narrow revokes preserve CRUD and service-role grants; inherited privilege drift denied."
echo "R197 NO_GO: no original/QA SQL changed; no signed API exploit proven; external SQL paths require independent review."
