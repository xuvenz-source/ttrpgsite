#!/usr/bin/env bash
# R150 standalone synthetic PG17 only; no hosting URL, credentials or actual data.
set -euo pipefail
fail(){ echo "R150 SYNTHETIC NO_GO: $*" >&2;exit 64; }
[[ "$GITHUB_ACTIONS" == "true" && "$R150_ISOLATED" == "yes" ]] || fail "Actions required"
[[ "$PGHOST" == "127.0.0.1" && "$PGPORT" == "5432" &&
 "$PGUSER" == "postgres" && "$PGDATABASE" == "world_v2_r18_150" &&
 "$PGPASSWORD" == "r150_disposable_only" ]] || fail "wrong loopback target"
for x in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL \
 SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$x" || true)" ]] || fail "remote environment forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-150-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
sql(){ psql -X -v ON_ERROR_STOP=1 "$@"; }
deny(){
 local name="$1" match="$2" query="$3"
 if sql -c "$query" > "$scratch/$name.log" 2>&1;then
  fail "$name unexpectedly allowed"
 fi
 grep -q "$match" "$scratch/$name.log" ||
  { cat "$scratch/$name.log" >&2;fail "$name unexpectedly denied"; }
}
sql -q -f tests/world-v2-r18-120-postgres/setup.sql > "$scratch/setup.log"
sql -q -c "CREATE ROLE service_role NOLOGIN BYPASSRLS;GRANT USAGE ON SCHEMA public TO service_role;GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON public.campaign_members TO service_role;GRANT SELECT,INSERT,UPDATE,DELETE ON public.campaigns TO service_role;" > "$scratch/grants.log"
sql -q -f staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql > "$scratch/r120.log"
sql -q -f staging/world-v2-b10-r18-122-dm-membership-admin-contract/unapplied-dm-revoked-roster.sql > "$scratch/r122.log"
sql -q -f staging/world-v2-b10-r18-148-privileged-membership-guards/unapplied-privileged-membership-guards.sql > "$scratch/r148.log"
sql -q -f tests/world-v2-r18-150-postgres/synthetic-create-campaign.sql > "$scratch/creator.log"
# Pre-candidate reproduction: direct privileged DM INSERT is possible.
[[ "$(sql -qAt -c "SELECT has_table_privilege('service_role','public.campaign_members','INSERT')")" == "t" ]] ||
 fail "baseline service_role INSERT unexpectedly absent"
sql -c "BEGIN;SET LOCAL ROLE service_role;INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000305','dm');ROLLBACK;" > "$scratch/baseline.log"
grep -q 'INSERT 0 1' "$scratch/baseline.log" || fail "original-like privileged DM negative control missing"
# Isolated R150 candidate REVOKE only; no remote database.
sql -q -f staging/world-v2-b10-r18-150-service-insert-privilege/unapplied-revoke-service-role-insert.sql > "$scratch/candidate.log"
[[ "$(sql -qAt -c "SELECT has_table_privilege('service_role','public.campaign_members','INSERT')")" == "f" ]] ||
 fail "service_role still has INSERT"
deny service-direct-dm 'permission denied for table campaign_members' \
 "SET ROLE service_role;INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000305','dm');"
deny service-direct-player 'permission denied for table campaign_members' \
 "SET ROLE service_role;INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000305','player');"
deny browser-direct 'permission denied for table campaign_members' \
 "SET ROLE authenticated;INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000305','dm');"
# SECURITY DEFINER is owned by postgres, so safe creator/join can still write.
sql -q -c "BEGIN;SET LOCAL ROLE authenticated;SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000305',true);SELECT public.synthetic_create_campaign('00000000-0000-4000-8000-000000000103','ccdd001122334455');COMMIT;" > "$scratch/create.log"
[[ "$(sql -qAt -c "SELECT count(*) FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000103' AND user_id='00000000-0000-4000-8000-000000000305' AND role='dm'")" == "1" ]] ||
 fail "legitimate DM creator denied"
sql -q -c "BEGIN;SET LOCAL ROLE authenticated;SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);SELECT public.join_campaign('a1b2c3d4e5f60708');COMMIT;" > "$scratch/join.log"
[[ "$(sql -qAt -c "SELECT role FROM public.campaign_members WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302'")" == "player" ]] ||
 fail "safe join denied or escalated"
# DM removal still works through privileged original-shaped definer; stamps revocation.
sql -q -c "BEGIN;SET LOCAL ROLE authenticated;SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);SELECT public.dm_remove_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302');COMMIT;" > "$scratch/remove.log"
[[ "$(sql -qAt -c "SELECT count(*) FROM forge_security.campaign_member_revocations WHERE campaign_id='00000000-0000-4000-8000-000000000101' AND user_id='00000000-0000-4000-8000-000000000302'")" == "1" ]] ||
 fail "DM removal lost tombstone"
deny revoked-rejoin 'DM reinstatement required' \
 "BEGIN;SET LOCAL ROLE authenticated;SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);SELECT public.join_campaign('a1b2c3d4e5f60708');COMMIT;"
# Existing R148 guarded TRUNCATE/role UPDATE remain blocked.
[[ "$(sql -qAt -c "SELECT has_table_privilege('service_role','public.campaign_members','TRUNCATE')")" == "f" ]] ||
 fail "R148 TRUNCATE regression"
echo 'R150 PG17 PASS: direct privileged INSERT revoked; isolated owner-create/player-join/DM-remove still work.'
echo 'R150 NO_GO: no original 83-history or real admin service workflow/signed client testing.'
