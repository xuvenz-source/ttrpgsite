#!/usr/bin/env bash
# R18-148: disposable, fictional postgres:17 only. Never point at hosted Supabase.
set -euo pipefail
fail(){ echo "R148 ISOLATION/SECURITY FAIL: $*" >&2; exit 64; }
[[ "$GITHUB_ACTIONS" == "true" && "$R148_ISOLATED" == "yes" ]] || fail "Actions flag required"
[[ "$PGHOST" == "127.0.0.1" && "$PGPORT" == "5432" && "$PGUSER" == "postgres" &&
 "$PGDATABASE" == "world_v2_r18_148" && "$PGPASSWORD" == "r148_disposable_only" ]] ||
 fail "disposable PG17 only"
for var in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$var" || true)" ]] || fail "hosted configuration forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-148-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
sql(){ psql -X -v ON_ERROR_STOP=1 "$@"; }
deny(){
 local label="$1" pattern="$2" statement="$3"
 if sql -c "$statement" > "$scratch/$label" 2>&1;then
   fail "$label unexpectedly permitted"
 fi
 grep -q "$pattern" "$scratch/$label" || { cat "$scratch/$label" >&2; fail "$label wrong denial"; }
}
sql -q -f tests/world-v2-r18-120-postgres/setup.sql > "$scratch/setup"
# Service-role dummy is deliberately BYPASSRLS and has the original-like grants.
sql -q -c "CREATE ROLE service_role NOLOGIN BYPASSRLS; GRANT USAGE ON SCHEMA public TO service_role; GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON public.campaign_members TO service_role;" > "$scratch/service"
sql -q -f staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql > "$scratch/r120"
sql -q -f staging/world-v2-b10-r18-122-dm-membership-admin-contract/unapplied-dm-revoked-roster.sql > "$scratch/r122"
sql -q -c "BEGIN;SET LOCAL ROLE authenticated;SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);SELECT public.join_campaign('a1b2c3d4e5f60708');COMMIT;" > "$scratch/seed"
[[ "$(sql -qAt -c "SELECT has_table_privilege('service_role','public.campaign_members','TRUNCATE')")" == "t" ]] ||
 fail "privileged TRUNCATE negative control missing"
# Prior to R148, role-only promotion succeeds despite R122 key guard. Roll back.
sql -c "BEGIN;SET LOCAL ROLE service_role;UPDATE public.campaign_members SET role='dm' WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302';ROLLBACK;" > "$scratch/old-role"
grep -q 'UPDATE 1' "$scratch/old-role" || fail "role UPDATE negative control absent"
sql -q -f staging/world-v2-b10-r18-148-privileged-membership-guards/unapplied-privileged-membership-guards.sql > "$scratch/r148"
[[ "$(sql -qAt -c "SELECT has_table_privilege('service_role','public.campaign_members','TRUNCATE')")" == "f" ]] ||
 fail "service_role TRUNCATE still effective"
deny service-truncate 'permission denied for table campaign_members' \
 "SET ROLE service_role;TRUNCATE public.campaign_members;"
deny owner-truncate 'R148 membership TRUNCATE forbidden' \
 "TRUNCATE public.campaign_members;"
deny owner-truncate-cascade 'R148 membership TRUNCATE forbidden' \
 "TRUNCATE public.campaign_members CASCADE;"
deny service-role-upgrade 'R148 direct membership role change forbidden' \
 "SET ROLE service_role;UPDATE public.campaign_members SET role='dm' WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302';"
deny owner-role-demote 'R148 direct membership role change forbidden' \
 "UPDATE public.campaign_members SET role='player' WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000301';"
deny service-key-flip 'Membership identity immutable' \
 "SET ROLE service_role;UPDATE public.campaign_members SET user_id='00000000-0000-4000-8000-000000000305' WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302';"
sql -c "SET ROLE service_role;UPDATE public.campaign_members SET role=role WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302';" > "$scratch/noop"
grep -q 'UPDATE 1' "$scratch/noop" || fail "no-op role UPDATE wrongly denied"
[[ "$(sql -qAt -c "SELECT count(*) FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND role='dm'")" == "1" ]] ||
 fail "DM membership changed"
sql -q -c "BEGIN;SET LOCAL ROLE authenticated;SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);SELECT public.dm_remove_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302');COMMIT;" > "$scratch/remove"
[[ "$(sql -qAt -c "SELECT count(*) FROM forge_security.campaign_member_revocations WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302'")" == "1" ]] ||
 fail "DM removal failed tombstone"
deny old-invite 'DM reinstatement required' \
 "BEGIN;SET LOCAL ROLE authenticated;SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);SELECT public.join_campaign('a1b2c3d4e5f60708');COMMIT;"
# CRITICAL negative control: new (never revoked) account can still be directly
# inserted with DM privileges under service_role. Roll back the fixture write.
sql -c "BEGIN;SET LOCAL ROLE service_role;INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000305','dm');ROLLBACK;" > "$scratch/new-dm-negative-control"
grep -q 'INSERT 0 1' "$scratch/new-dm-negative-control" ||
 fail "unresolved privileged new DM INSERT negative control not reproduced"
[[ "$(sql -qAt -c "SELECT count(*) FROM public.campaign_members WHERE user_id='00000000-0000-4000-8000-000000000305'")" == "0" ]] ||
 fail "negative-control rollback failed"
echo 'R148 synthetic PG17: TRUNCATE/role flips denied, normal DM removal/old invite guarded.'
echo 'R148 remaining new-DM privileged INSERT bypass reproduced and rolled back. NO_GO.'
