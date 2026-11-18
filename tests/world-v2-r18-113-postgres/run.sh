#!/usr/bin/env bash
# R18-113: hosted SQL is absolutely forbidden. Scratch PostgreSQL 17 ONLY.
set -euo pipefail
fail(){ echo "R113 ISOLATED PG17 NO-GO: $*" >&2; exit 64; }

[[ "${GITHUB_ACTIONS:-}" == 'true' ]] || fail "GitHub Actions required"
[[ "${R113_ISOLATED:-}" == 'yes' ]] || fail "isolation marker missing"
[[ "${PGHOST:-}" == '127.0.0.1' ]] || fail "non-loopback host"
[[ "${PGPORT:-}" == '5432' ]] || fail "non-disposable port"
[[ "${PGDATABASE:-}" == 'world_v2_r18_113' ]] || fail "unapproved database"
[[ "${PGUSER:-}" == 'postgres' ]] || fail "wrong synthetic user"
[[ "${PGPASSWORD:-}" == 'r113_disposable_only' ]] || fail "wrong synthetic credential"

for envvar in DATABASE_URL DIRECT_URL SUPABASE_DB_URL SUPABASE_URL \
 SUPABASE_DATABASE_URL PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$envvar" || true)" ]] || fail "forbidden external connection configuration"
done
command -v psql >/dev/null || fail "psql missing"
command -v python3 >/dev/null || fail "python3 missing"

version="$(psql -X -A -t -v ON_ERROR_STOP=1 -c 'SHOW server_version_num')"
[[ "$version" =~ ^17[0-9]{4}$ ]] || fail "not PostgreSQL 17"
name="$(psql -X -A -t -v ON_ERROR_STOP=1 -c 'SELECT current_database()')"
[[ "$name" == 'world_v2_r18_113' ]] || fail "unrecognized scratch DB"

scratch="$(mktemp -d /tmp/world-v2-r18-113-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
python3 tests/world-v2-r18-113-postgres/extract_npc_source.py \
 "$scratch/verified-npc-source.sql"

psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-113-postgres/schema.sql
psql -X -v ON_ERROR_STOP=1 -f "$scratch/verified-npc-source.sql"

# Prove actual role-based denials, not only ACL metadata checks.
if psql -X -v ON_ERROR_STOP=1 -c \
 "SET ROLE anon; SELECT * FROM public.get_dm_map_npc_values('00000000-0000-4000-8000-000000000201');" \
 >"$scratch/anon-denied.log" 2>&1; then
 fail "anonymous direct RPC unexpectedly succeeded"
fi
grep -qi 'permission denied for function' "$scratch/anon-denied.log" || \
 fail "anonymous RPC failed for unexpected reason"

if psql -X -v ON_ERROR_STOP=1 -c \
 "SET ROLE authenticated; SELECT npc_values FROM public.map_tokens LIMIT 1;" \
 >"$scratch/direct-table-denied.log" 2>&1; then
 fail "direct authenticated private NPC column SELECT unexpectedly succeeded"
fi
grep -qi 'permission denied for table' "$scratch/direct-table-denied.log" || \
 fail "private NPC table SELECT failed for unexpected reason"

psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-r18-113-postgres/verify-npc-access.sql

echo 'R113 PG17 SOURCE-EXACT NPC FIXTURE PASS: actor, campaign, DM, isolation, revocation and anon/table ACL tests.'
echo 'R113 NO_GO: synthetic GUC claims not signed hosted Auth, synthetic DM helper, original/QA SQL unchanged.'
