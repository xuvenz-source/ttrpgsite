#!/usr/bin/env bash
set -euo pipefail
# R18-22 third, fresh disposable Postgres service database.
# R05 is installed and LEFT ACTIVE inside this local DB so that subsequent
# candidate SQL is tested in the actual order, unlike the recovery rehearsal.
# This script is not an approval to run SQL against a Supabase project.
[[ "${WORLD_V2_B10_ISOLATED:-}" == "yes" ]] || { echo "R18-22: isolated marker missing" >&2;exit 64; }
[[ "${PGHOST:-}" == "localhost" || "${PGHOST:-}" == "127.0.0.1" ]] || { echo "R18-22: remote database refused" >&2;exit 64; }
[[ "${PGDATABASE:-}" == "world_v2_b10" ]] || { echo "R18-22: non-fixture caller refused" >&2;exit 64; }
r22_db=world_v2_b10_r18_22
# Exclude external/project-supplied PGSERVICE/URI, even if PGHOST is local.
[[ -z "${PGSERVICE:-}" && -z "${PGSERVICEFILE:-}" && -z "${DATABASE_URL:-}" && -z "${SUPABASE_DB_URL:-}" ]] || {
 echo "R18-22: unsafe connection override" >&2;exit 64;
}
createdb "${r22_db}"
r22_psql(){ PGDATABASE="${r22_db}" psql -X -v ON_ERROR_STOP=1 "$@"; }
sed -e '/^CREATE ROLE anon NOLOGIN;$/d' -e '/^CREATE ROLE authenticated NOLOGIN;$/d' \
 tests/world-v2-b04-postgres/schema.sql > /tmp/world_v2_b10_r18_22_schema.sql
r22_psql -f /tmp/world_v2_b10_r18_22_schema.sql
r22_psql -f tests/world-v2-b07-postgres/schema.sql
r22_psql -f tests/world-v2-b08-postgres/schema.sql

# Source-replay current deployed V2 core and private observer visibility
# from frozen original shipped migration, not stubbed authority.
python3 tests/world-v2-b04-postgres/extract_real_v2_functions.py > /tmp/world_v2_b10_r18_22_core.sql
python3 tests/world-v2-b07-postgres/extract_viewer_authority.py > /tmp/world_v2_b10_r18_22_viewers.sql
python3 tests/world-v2-b10-postgres/extract_original_commit_r05.py > /tmp/world_v2_b10_r18_22_original_commit.sql
python3 tests/world-v2-b10-postgres/extract_real_collision_triggers_r18_18.py > /tmp/world_v2_b10_r18_22_orig_collisions.sql
python3 tests/world-v2-b10-postgres/extract_latest_trajectory_r18_19.py > /tmp/world_v2_b10_r18_22_trajectory.sql

r22_psql -f /tmp/world_v2_b10_r18_22_core.sql
r22_psql -f /tmp/world_v2_b10_r18_22_viewers.sql
r22_psql -f tests/world-v2-b10-postgres/ordered-stack-r18-22.sql
# R18-26 overlay AFTER the full installed R05->wall->map->affinity stack.
# The overlay test itself uses BEGIN / ROLLBACK and verifies original source
# and client schema/function grants remain untouched. Never run on live.
r22_psql -f tests/world-v2-b10-postgres/step-bbox-r18-26.sql
# R18-27: after R26 restores its original function, apply the R05
# Commit empty-work fast-path in BEGIN/ROLLBACK. This test covers real
# post-R05 token+mount commit, private queued hides, exact ACK retry and ACL.
r22_psql -f tests/world-v2-b10-postgres/commit-empty-r18-27.sql
# R18-28 optional 1-RTT final Advance + Commit, same trusted
# existing RPCs and private queue. Fully isolated BEGIN/ROLLBACK only.
r22_psql -f tests/world-v2-b10-postgres/atomic-finalize-r18-28.sql
# R18-30: candidate overlay on the exact source-real R18-28 backend.
# Export FIXTURE-ONLY wire ACK data to /tmp and have the ACTUAL JS V2
# controller+validator parse it, before the CI disposable DB is removed.
r22_psql -f tests/world-v2-b10-postgres/blocked-final-r18-30.sql
node tests/world-v2-b10-postgres/verify-blocked-final-r18-30.mjs /tmp/world_v2_b10_r18_30_wire.jsonl
# R18-33: compare actual R05 and integrated R26+R27+R28+R30 flows
# on this disposable local PG17 only. Full BEGIN/ROLLBACK; timings advisory.
r22_psql -f tests/world-v2-b10-postgres/performance-r18-33.sql
echo 'B10-R18-22 PASS: R05->wall->checkpoint-aware map guards->affinity in one fresh local PG17, live R05 authority retained'
