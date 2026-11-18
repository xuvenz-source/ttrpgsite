#!/usr/bin/env bash
# R18-120: standalone disposable CI postgres:17, NEVER hosted Supabase.
set -euo pipefail
fail(){ echo "R120 SCRATCH ONLY NO_GO: $*" >&2; exit 64; }

[[ "${GITHUB_ACTIONS:-}" == "true" ]] || fail "GitHub Actions only"
[[ "${R120_ISOLATED:-}" == "yes" ]] || fail "missing isolation marker"
[[ "${PGHOST:-}" == "127.0.0.1" ]] || fail "loopback required"
[[ "${PGPORT:-}" == "5432" ]] || fail "wrong port"
[[ "${PGDATABASE:-}" == "world_v2_r18_120" ]] || fail "wrong database"
[[ "${PGUSER:-}" == "postgres" ]] || fail "wrong DB user"
[[ "${PGPASSWORD:-}" == "r120_disposable_only" ]] || fail "wrong synthetic-only password"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR \
 PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$key" || true)" ]] || fail "remote configuration forbidden"
done

scratch="$(mktemp -d /tmp/world-v2-r18-120-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-120-postgres/setup.sql
psql -X -v ON_ERROR_STOP=1 -f \
  staging/world-v2-b10-r18-120-revocation-contract/unapplied-prototype.sql

deny(){
 local label="$1" pattern="$2" query="$3"
 if psql -X -v ON_ERROR_STOP=1 -c "$query" > "$scratch/$label" 2>&1;then
   fail "$label unexpectedly succeeded"
 fi
 if ! grep -Eiq "$pattern" "$scratch/$label";then
   fail "$label failed for an unrelated reason"
 fi
}
deny "anon-join" 'permission denied for function' \
 "SET ROLE anon; SELECT public.join_campaign('a1b2c3d4e5f60708');"
deny "anon-remove" 'permission denied for function' \
 "SET ROLE anon; SELECT public.dm_remove_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302');"
deny "anon-reinstate" 'permission denied for function' \
 "SET ROLE anon; SELECT public.dm_reinstate_campaign_player('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302');"
deny "anon-voluntary" 'permission denied for function' \
 "SET ROLE anon; SELECT public.leave_campaign('00000000-0000-4000-8000-000000000101');"
deny "auth-delete-direct" 'permission denied for table' \
 "SET ROLE authenticated; DELETE FROM public.campaign_members;"
deny "auth-insert-direct" 'permission denied for table' \
 "SET ROLE authenticated; INSERT INTO public.campaign_members VALUES ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000305','player');"
deny "auth-tombstone-read" 'permission denied for schema' \
 "SET ROLE authenticated; SELECT * FROM forge_security.campaign_member_revocations;"
deny "auth-tombstone-delete" 'permission denied for schema' \
 "SET ROLE authenticated; DELETE FROM forge_security.campaign_member_revocations;"
deny "auth-private-trigger" 'permission denied for schema' \
 "SET ROLE authenticated; SELECT forge_security.stamp_campaign_member_deletion();"

psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-120-postgres/verify-contract.sql
echo 'R120 SCRATCH PG17 PASS: 35 scenario statements; 9 SQL permission denials.'
echo 'R120 NO_GO: no original SQL, signed Supabase Auth, migration replay, hosted test or release approval.'
