#!/usr/bin/env bash
# R173 synthetic-only PostgreSQL17 regression. No network to original or QA.
set -euo pipefail
fail(){ echo "R173 SYNTHETIC NO_GO: $*" >&2;exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${R173_ISOLATED:-}" == "yes" ]] || fail "CI isolation required"
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" &&
   "${PGDATABASE:-}" == "world_v2_r18_173" && "${PGUSER:-}" == "postgres" &&
   "${PGPASSWORD:-}" == "r173_disposable_only" ]] || fail "wrong target"
for k in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$k" || true)" ]] || fail "remote environment forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-173-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
sql(){ psql -X -q -v ON_ERROR_STOP=1 "$@"; }
scalar(){ sql -At -c "$1"; }
C='00000000-0000-4000-8000-000000000101'
C2='00000000-0000-4000-8000-000000000102'
DM='00000000-0000-4000-8000-000000000301'
P1='00000000-0000-4000-8000-000000000302'
P2='00000000-0000-4000-8000-000000000303'
DM2='00000000-0000-4000-8000-000000000304'
P3='00000000-0000-4000-8000-000000000305'
INV='a1b2c3d4e5f60708'
join_as(){
 local uid="$1"
 sql -c "BEGIN;SET LOCAL ROLE authenticated;SELECT pg_catalog.set_config('request.jwt.claim.sub','$uid',true);SELECT public.join_campaign('$INV');COMMIT;"
}
remove_as_dm(){
 local who="$1"
 sql -c "BEGIN;SET LOCAL ROLE authenticated;SELECT pg_catalog.set_config('request.jwt.claim.sub','$DM',true);SELECT public.dm_remove_campaign_player('$C','$who');COMMIT;"
}
denied(){
 local label="$1" pattern="$2" stmt="$3"
 if sql -c "$stmt" > "$scratch/$label.log" 2>&1;then fail "$label unexpectedly succeeded";fi
 grep -Eiq "$pattern" "$scratch/$label.log" || fail "$label failed for unrelated reason"
}
sql -f tests/world-v2-r18-120-postgres/setup.sql > "$scratch/setup.log"
sql -f tests/world-v2-r18-172-postgres/auth-user-cascade-fixture.sql > "$scratch/auth-users.log"
sql -c "CREATE ROLE service_role NOLOGIN BYPASSRLS;GRANT USAGE ON SCHEMA public TO service_role;GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON public.campaign_members TO service_role;GRANT SELECT,INSERT,UPDATE,DELETE ON public.campaigns TO service_role;" > "$scratch/service.log"
sql -f staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql > "$scratch/r120.log"
sql -f staging/world-v2-b10-r18-122-dm-membership-admin-contract/unapplied-dm-revoked-roster.sql > "$scratch/r122.log"
sql -f staging/world-v2-b10-r18-148-privileged-membership-guards/unapplied-privileged-membership-guards.sql > "$scratch/r148.log"
sql -f staging/world-v2-b10-r18-150-service-insert-privilege/unapplied-revoke-service-role-insert.sql > "$scratch/r150.log"
sql -f staging/world-v2-b10-r18-173-auth-deletion-ledger-cascade/unapplied-auth-identity-cleanup.sql > "$scratch/r173.log"

# DM removal remains durable and denies an unchanged invite while Auth user exists.
join_as "$P1" > "$scratch/p1-joined.log"
remove_as_dm "$P1" > "$scratch/p1-removed.log"
[[ "$(scalar "SELECT count(*) FROM forge_security.campaign_member_revocations WHERE campaign_id='$C' AND user_id='$P1'")" == "1" ]] || fail "DM removal did not stamp tombstone"
denied revoked-old-invite 'DM reinstatement required' \
 "BEGIN;SET LOCAL ROLE authenticated;SELECT pg_catalog.set_config('request.jwt.claim.sub','$P1',true);SELECT public.join_campaign('$INV');COMMIT;"
# Deleting an already-revoked user should clear their retention-ledger FK.
sql -c "SET statement_timeout='8s';DELETE FROM auth.users WHERE id='$P1';" > "$scratch/auth-p1.log"
[[ "$(scalar "SELECT count(*) FROM forge_security.campaign_member_revocations WHERE user_id='$P1'")" == "0" ]] || fail "deleted Auth user still has tombstone"
[[ "$(scalar "SELECT count(*) FROM public.campaign_members WHERE user_id='$P1'")" == "0" ]] || fail "deleted Auth user still has membership"
# A member deleted solely by Auth FK cascade must NOT create a new tombstone.
join_as "$P2" > "$scratch/p2-joined.log"
sql -c "SET statement_timeout='8s';DELETE FROM auth.users WHERE id='$P2';" > "$scratch/auth-p2.log"
[[ "$(scalar "SELECT count(*) FROM forge_security.campaign_member_revocations WHERE user_id='$P2'")" == "0" ]] || fail "Auth cascade created new tombstone"
[[ "$(scalar "SELECT count(*) FROM public.campaign_members WHERE user_id='$P2'")" == "0" ]] || fail "Auth cascade retained membership"

# A normal DM removal remains tracked for another user; cascade deletion of
# its campaign owner must clear both campaign and its revocation data.
join_as "$P3" > "$scratch/p3-joined.log"
remove_as_dm "$P3" > "$scratch/p3-removed.log"
[[ "$(scalar "SELECT count(*) FROM forge_security.campaign_member_revocations WHERE user_id='$P3'")" == "1" ]] || fail "another DM tombstone missing"
sql -c "SET statement_timeout='8s';DELETE FROM auth.users WHERE id='$DM';" > "$scratch/auth-owner.log"
[[ "$(scalar "SELECT count(*) FROM public.campaigns WHERE id='$C'")" == "0" ]] || fail "DM Auth cascade did not remove campaign"
[[ "$(scalar "SELECT count(*) FROM forge_security.campaign_member_revocations WHERE campaign_id='$C'")" == "0" ]] || fail "campaign deletion retained tombstone"
[[ "$(scalar "SELECT count(*) FROM public.campaign_members WHERE campaign_id='$C'")" == "0" ]] || fail "campaign deletion retained members"
[[ "$(scalar "SELECT count(*) FROM public.campaign_members WHERE campaign_id='$C2' AND user_id='$DM2' AND role='dm'")" == "1" ]] || fail "unrelated campaign mutated"
# Existing direct service_role membership INSERT and TRUNCATE remain revoked.
[[ "$(scalar "SELECT has_table_privilege('service_role','public.campaign_members','INSERT')")" == "f" ]] || fail "service INSERT restored"
[[ "$(scalar "SELECT has_table_privilege('service_role','public.campaign_members','TRUNCATE')")" == "f" ]] || fail "service TRUNCATE restored"
echo 'R173 SCRATCH PG17 PASS: Auth deletion clears old tombstones, cascaded membership creates none, DM removal remains durable until Auth/campaign deletion.'
echo 'R173 NO_GO: proposed Auth FK and definer replacement need exact original schema review, migration locking and privacy approval; no hosted SQL or signed QA.'
