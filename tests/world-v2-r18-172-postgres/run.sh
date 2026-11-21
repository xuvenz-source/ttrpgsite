#!/usr/bin/env bash
# R172 isolated PostgreSQL17 lifecycle experiment. NO hosted Supabase access.
set -euo pipefail
fail(){ echo "R172 SYNTHETIC NO_GO: $*" >&2; exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${R172_ISOLATED:-}" == "yes" ]] || fail "CI isolation required"
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" &&
   "${PGDATABASE:-}" == "world_v2_r18_172" && "${PGUSER:-}" == "postgres" &&
   "${PGPASSWORD:-}" == "r172_disposable_only" ]] || fail "wrong PostgreSQL target"
for k in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$k" || true)" ]] || fail "remote environment forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-172-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
sql(){ psql -X -q -v ON_ERROR_STOP=1 -v statement_timeout=8000 "$@"; }
scalar(){ sql -At -c "$1"; }
deny(){
 local label="$1" pattern="$2" statement="$3"
 if sql -c "$statement" > "$scratch/$label.log" 2>&1;then
   fail "$label unexpectedly succeeded"
 fi
 grep -Eiq "$pattern" "$scratch/$label.log" || fail "$label denied for unrelated reason"
}
C='00000000-0000-4000-8000-000000000101'
C2='00000000-0000-4000-8000-000000000102'
DM='00000000-0000-4000-8000-000000000301'
P1='00000000-0000-4000-8000-000000000302'
P2='00000000-0000-4000-8000-000000000303'
OTHER_DM='00000000-0000-4000-8000-000000000304'
OUTSIDER='00000000-0000-4000-8000-000000000305'
INV='a1b2c3d4e5f60708'

sql -f tests/world-v2-r18-120-postgres/setup.sql > "$scratch/setup.log"
sql -f tests/world-v2-r18-172-postgres/auth-user-cascade-fixture.sql > "$scratch/auth-setup.log"
sql -c "CREATE ROLE service_role NOLOGIN BYPASSRLS;GRANT USAGE ON SCHEMA public TO service_role;GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON public.campaign_members TO service_role;GRANT SELECT,INSERT,UPDATE,DELETE ON public.campaigns TO service_role;" > "$scratch/service-role.log"
sql -f staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql > "$scratch/r120.log"
sql -f staging/world-v2-b10-r18-122-dm-membership-admin-contract/unapplied-dm-revoked-roster.sql > "$scratch/r122.log"
sql -f staging/world-v2-b10-r18-148-privileged-membership-guards/unapplied-privileged-membership-guards.sql > "$scratch/r148.log"
sql -f staging/world-v2-b10-r18-150-service-insert-privilege/unapplied-revoke-service-role-insert.sql > "$scratch/r150.log"

join_as(){
 local actor="$1"
 sql -c "BEGIN;SET LOCAL ROLE authenticated;SELECT pg_catalog.set_config('request.jwt.claim.sub','$actor',true);SELECT public.join_campaign('$INV');COMMIT;"
}

# A01-A03: P1 joins, then Auth deletion cascades membership but retains a
# tombstone tied to a deleted user_id. This is an observation, not approval
# of long-term retention.
join_as "$P1" > "$scratch/p1-join.log"
[[ "$(scalar "SELECT count(*) FROM public.campaign_members WHERE campaign_id='$C' AND user_id='$P1'")" == "1" ]] || fail "P1 join not installed"
sql -c "DELETE FROM auth.users WHERE id='$P1';" > "$scratch/auth-delete-p1.log"
[[ "$(scalar "SELECT count(*) FROM public.campaign_members WHERE campaign_id='$C' AND user_id='$P1'")" == "0" ]] || fail "Auth deletion did not cascade member"
[[ "$(scalar "SELECT count(*) FROM forge_security.campaign_member_revocations WHERE campaign_id='$C' AND user_id='$P1'")" == "1" ]] || fail "Expected retained synthetic tombstone not observed"

# A04: simulate same UUID being seen again; no old invitation re-entry.
sql -c "INSERT INTO auth.users(id) VALUES('$P1');" > "$scratch/recreated-synthetic-user.log"
deny old-invite-rejoin 'DM reinstatement required' \
  "BEGIN;SET LOCAL ROLE authenticated;SELECT pg_catalog.set_config('request.jwt.claim.sub','$P1',true);SELECT public.join_campaign('$INV');COMMIT;"

# A05-A06: privilege regressions: direct service_role INSERT/TRUNCATE blocked.
[[ "$(scalar "SELECT has_table_privilege('service_role','public.campaign_members','INSERT')")" == "f" ]] || fail "service_role INSERT still granted"
[[ "$(scalar "SELECT has_table_privilege('service_role','public.campaign_members','TRUNCATE')")" == "f" ]] || fail "service_role TRUNCATE still granted"
deny direct-service-dm 'permission denied for table' \
  "SET ROLE service_role;INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES('$C','$OUTSIDER','dm');"
deny service-truncate 'permission denied for table' \
  "SET ROLE service_role;TRUNCATE public.campaign_members;"

# A07-A10: deletion of the owner's Auth user must not deadlock or leave
# campaign memberships/revocations orphaned. The second campaign survives.
join_as "$P2" > "$scratch/p2-join.log"
[[ "$(scalar "SELECT count(*) FROM public.campaign_members WHERE campaign_id='$C' AND user_id='$P2'")" == "1" ]] || fail "P2 failed to join"
sql -c "SET statement_timeout='8s';DELETE FROM auth.users WHERE id='$DM';" > "$scratch/auth-delete-owner.log"
[[ "$(scalar "SELECT count(*) FROM public.campaigns WHERE id='$C'")" == "0" ]] || fail "campaign not deleted with owner Auth cascade"
[[ "$(scalar "SELECT count(*) FROM public.campaign_members WHERE campaign_id='$C'")" == "0" ]] || fail "orphaned membership after Auth owner delete"
[[ "$(scalar "SELECT count(*) FROM forge_security.campaign_member_revocations WHERE campaign_id='$C'")" == "0" ]] || fail "orphaned tombstone after campaign cascade"
[[ "$(scalar "SELECT count(*) FROM public.campaign_members WHERE campaign_id='$C2' AND user_id='$OTHER_DM' AND role='dm'")" == "1" ]] || fail "unrelated campaign changed"

echo 'R172 PG17 SYNTHETIC PASS: Auth member/owner cascades, retained tombstone observation, 2 denied service_role operations, old invite denied.'
echo 'R172 NO_GO: retained deleted-user identifier requires privacy review; no exact 83-history or hosted signed tests.'
