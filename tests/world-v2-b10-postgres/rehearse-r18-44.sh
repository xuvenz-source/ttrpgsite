#!/usr/bin/env bash
set -euo pipefail
# R18-44 isolated protocol compatibility gate. NEVER run on a Supabase URL.
# This THIRD PostgreSQL 17 CI DB is destroyed by the ephemeral Actions service.
[[ "${WORLD_V2_B10_ISOLATED:-}" == "yes" ]] || { echo 'R44 missing isolated marker' >&2; exit 64; }
[[ "${PGHOST:-}" == "127.0.0.1" || "${PGHOST:-}" == "localhost" ]] || { echo 'R44 remote host refused' >&2; exit 64; }
[[ "${PGPORT:-}" == "5432" && "${PGUSER:-}" == "postgres" &&
   "${PGDATABASE:-}" == "world_v2_b10" ]] || { echo 'R44 caller database/port/role refused' >&2; exit 64; }
[[ -z "${PGHOSTADDR:-}" && -z "${PGSERVICE:-}" && -z "${PGSERVICEFILE:-}" &&
   -z "${DATABASE_URL:-}" && -z "${SUPABASE_DB_URL:-}" ]] || {
 echo 'R44 external connection override refused' >&2; exit 64;
}
r44db='world_v2_b10_r18_44'
# Explicit transport and cluster-local DB; never inherit an implicit target.
createdb -h 127.0.0.1 -p 5432 -U postgres "$r44db"
r44_psql(){ PGDATABASE="$r44db" psql -X -h 127.0.0.1 -p 5432 -U postgres -v ON_ERROR_STOP=1 "$@"; }
sed -e '/^CREATE ROLE anon NOLOGIN;$/d' -e '/^CREATE ROLE authenticated NOLOGIN;$/d' \
 tests/world-v2-b04-postgres/schema.sql > /tmp/world_v2_b10_r44_schema.sql
r44_psql -f /tmp/world_v2_b10_r44_schema.sql
r44_psql -f tests/world-v2-b07-postgres/schema.sql
r44_psql -f tests/world-v2-b08-postgres/schema.sql

# Source-replay EXACT published migrations (sha-pinned extraction), not stubs.
python3 tests/world-v2-b04-postgres/extract_real_v2_functions.py > /tmp/world_v2_b10_r44_core.sql
python3 tests/world-v2-b07-postgres/extract_viewer_authority.py > /tmp/world_v2_b10_r44_viewers.sql
python3 tests/world-v2-b10-postgres/extract_original_commit_r05.py > /tmp/world_v2_b10_r18_22_original_commit.sql
python3 tests/world-v2-b10-postgres/extract_real_collision_triggers_r18_18.py > /tmp/world_v2_b10_r18_22_orig_collisions.sql
python3 tests/world-v2-b10-postgres/extract_latest_trajectory_r18_19.py > /tmp/world_v2_b10_r18_22_trajectory.sql
r44_psql -f /tmp/world_v2_b10_r44_core.sql
r44_psql -f /tmp/world_v2_b10_r44_viewers.sql

# Install frozen NONLIVE candidates only in this isolated DB, exact ordered
# R05 -> R18-17 wall -> R18-19 trajectory -> R18-20 campaign-identity.
r44_psql -f tests/world-v2-b10-postgres/ordered-stack-r18-22.sql

# Each optional finalizer is created ONLY inside BEGIN/ROLLBACK. First test
# R18-28 original terminal security/commit failure, then R18-30 patched
# blocked-last semantics and export genuine source-authorized JSON receipts.
r44_psql -f tests/world-v2-b10-postgres/atomic-finalize-r18-28.sql
r44_psql -f tests/world-v2-b10-postgres/blocked-final-r18-30.sql
node tests/world-v2-b10-postgres/verify-blocked-final-r18-30.mjs /tmp/world_v2_b10_r18_30_wire.jsonl

# The next adversarial suite proves that existing actor/scene/path permissions
# and canonical state still win against hostile candidate terminal requests.
r44_psql -f tests/world-v2-b10-postgres/authority-bridge-r18-44.sql
echo 'R18-44 PASS: exact R05->wall->guards->affinity source chain, R18-28/30 server terminal, JS wire and adversarial gates, ROLLED BACK'
