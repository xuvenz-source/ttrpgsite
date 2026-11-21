#!/usr/bin/env bash
# R149 fictional PostgreSQL17 only: owner-matching DM insert is NOT a full boundary.
set -euo pipefail
fail(){ echo "R149 ISOLATION / EXPECTATION FAIL: $*" >&2; exit 64; }
[[ "$GITHUB_ACTIONS" == "true" && "$R149_ISOLATED" == "yes" ]] || fail "isolated Actions required"
[[ "$PGHOST" == "127.0.0.1" && "$PGPORT" == "5432" && "$PGDATABASE" == "world_v2_r18_149" &&
 "$PGUSER" == "postgres" && "$PGPASSWORD" == "r149_disposable_only" ]] || fail "wrong disposable target"
for var in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$var" || true)" ]] || fail "hosted config forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-149-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
sql(){ psql -X -v ON_ERROR_STOP=1 "$@"; }
sql -q -f tests/world-v2-r18-120-postgres/setup.sql > "$scratch/setup.log"
sql -q -c "CREATE ROLE service_role NOLOGIN BYPASSRLS; GRANT USAGE ON SCHEMA public TO service_role; GRANT SELECT,UPDATE,INSERT,DELETE ON public.campaigns,public.campaign_members TO service_role;" > "$scratch/grant.log"
# Synthetic example ONLY, not an implementation candidate or original source.
# A tempting owner-only INSERT guard protects against a direct non-owner DM
# insert but CANNOT protect against a privileged writer changing the owner.
sql -q -f tests/world-v2-r18-149-postgres/owner-match-negative-control.sql > "$scratch/fixture.log"
# 1. Invented SECURITY DEFINER creator establishes new campaign+DM legitimately.
sql -q -c "BEGIN;SET LOCAL ROLE authenticated; SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true); SELECT public.synthetic_create_campaign('00000000-0000-4000-8000-000000000103','ccdd001122334455'); COMMIT;" > "$scratch/create.log"
[[ "$(sql -qAt -c "SELECT count(*) FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000103' AND user_id='00000000-0000-4000-8000-000000000305' AND role='dm'")" == "1" ]] || fail "invented legitimate creator DM bootstrap failed"
# 2. Privileged DM insert for non-owner is blocked by this simplified guard.
if sql -c "SET ROLE service_role;INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','dm');" > "$scratch/denied.log" 2>&1;then
 fail "simple owner-match guard did not deny direct non-owner DM"
fi
grep -q 'R149 owner-match DM insert denied' "$scratch/denied.log" || fail "wrong owner-match denial"
# 3. FATAL LIMITATION: a privileged service can change owner_id, then INSERT
# the same DM, defeating the simplistic check. Never apply this as a fix.
sql -c "BEGIN;SET LOCAL ROLE service_role; UPDATE public.campaigns SET owner_id='00000000-0000-4000-8000-000000000302' WHERE id='00000000-0000-4000-8000-000000000101'; INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','dm'); ROLLBACK;" > "$scratch/privileged-bypass.log"
grep -q 'UPDATE 1' "$scratch/privileged-bypass.log" || fail "privileged owner update not demonstrated"
grep -q 'INSERT 0 1' "$scratch/privileged-bypass.log" || fail "privileged owner spoof + DM INSERT bypass not demonstrated"
[[ "$(sql -qAt -c "SELECT owner_id::text FROM public.campaigns WHERE id='00000000-0000-4000-8000-000000000101'")" == "00000000-0000-4000-8000-000000000301" ]] ||
 fail "privileged owner spoof did not roll back"
[[ "$(sql -qAt -c "SELECT count(*) FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302'")" == "0" ]] ||
 fail "forged DM did not roll back"
# 4. Old invitation still creates player instead of DM under the simplified guard.
sql -q -c "BEGIN;SET LOCAL ROLE authenticated;SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);SELECT public.join_campaign('a1b2c3d4e5f60708');COMMIT;" > "$scratch/join.log"
[[ "$(sql -qAt -c "SELECT role FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302'")" == "player" ]] ||
 fail "player join unexpectedly elevated"
echo 'R149 PG17 PASS: synthetic campaign bootstrap succeeds; direct nonowner DM denied; owner-reassignment privileged bypass reproduced and rolled back.'
echo 'R149 WARNING: simplistic owner-match is INSUFFICIENT. Service role not a browser role. NO_GO, zero hosted SQL.'
