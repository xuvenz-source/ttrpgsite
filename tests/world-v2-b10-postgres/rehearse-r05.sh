#!/usr/bin/env bash
set -euo pipefail
# Extra disposable LOCAL database, separate from historical B04/B07/B08/R01/
# R03 fixture. Never accept a Supabase connection string/remote host.
[[ "${WORLD_V2_B10_ISOLATED:-}" == "yes" ]] || { echo "R05 ephemeral marker missing" >&2; exit 64; }
[[ "${PGHOST:-}" == "localhost" || "${PGHOST:-}" == "127.0.0.1" ]] || { echo "R05 remote database refused" >&2; exit 64; }
[[ "${PGDATABASE:-}" == "world_v2_b10" ]] || { echo "R05 caller database refused" >&2;exit 64; }
# Match the R18-22 fixture's defense against external/project DSNs.
# Only the CI-provided local PostgreSQL 17 service is acceptable.
[[ -z "${PGHOSTADDR:-}" && -z "${PGSERVICE:-}" && -z "${PGSERVICEFILE:-}" &&
   -z "${DATABASE_URL:-}" && -z "${SUPABASE_DB_URL:-}" ]] || {
 echo "R05 unsafe external connection override refused" >&2;exit 64;
}

r05db='world_v2_b10_r05'
# The CI PostgreSQL service is fresh and only for the GitHub Actions job.
createdb "$r05db"
r05_psql(){
 PGDATABASE="$r05db" psql -X -v ON_ERROR_STOP=1 "$@"
}
# Login roles are CLUSTER-global. The preceding historical fixture
# created anon/authenticated in this same disposable service; keep every
# schema/table/function statement identical but omit duplicate role CREATE.
sed -e '/^CREATE ROLE anon NOLOGIN;$/d' \
    -e '/^CREATE ROLE authenticated NOLOGIN;$/d' \
    tests/world-v2-b04-postgres/schema.sql > /tmp/world_v2_b10_r05_schema.sql
r05_psql -f /tmp/world_v2_b10_r05_schema.sql
r05_psql -f tests/world-v2-b07-postgres/schema.sql
r05_psql -f tests/world-v2-b08-postgres/schema.sql
python3 tests/world-v2-b04-postgres/extract_real_v2_functions.py > /tmp/world_v2_b10_r05_core.sql
python3 tests/world-v2-b07-postgres/extract_viewer_authority.py > /tmp/world_v2_b10_r05_viewers.sql
python3 tests/world-v2-b10-postgres/extract_original_commit_r05.py > /tmp/world_v2_b10_r05_original_commit.sql
r05_psql -f /tmp/world_v2_b10_r05_core.sql
r05_psql -f /tmp/world_v2_b10_r05_viewers.sql
# Install the extracted ORIGINAL public Commit into this disposable fixture.
# The existing R05 rehearsal also reloads this exact source independently.
r05_psql -f /tmp/world_v2_b10_r05_original_commit.sql
# R18-42: profile exact LIVE baseline before any R05 SQL is overlaid.
# Benchmark is wrapped in BEGIN / ROLLBACK with a post-rollback assertion.
# The fixture's private observer publisher is intentionally test-only.
r05_psql -f tests/world-v2-b10-postgres/authority-throughput-r18-42.sql
# R18-54: source-real, real-trigger fog-on/off canonical Commit benchmark.
# Runs inside BEGIN/ROLLBACK and checks all test-time DDL/data disappear.
r05_psql -f tests/world-v2-b10-postgres/r54-fog-commit-source-real.sql
# R18-55: ONLY in same disposable DB, prototype fail-closed dirty fog handoff.
# Real signed Begin/Advance/Commit and original sight functions with rollback.
r05_psql -f tests/world-v2-b10-postgres/r55-dirty-fog-prototype.sql
# R18-56: compare exact source-real authorized fog frames and synchronous Commit
# in another rolled-back test transaction. No unreviewed production mutations.
r05_psql -f tests/world-v2-b10-postgres/r56-synchronous-fog-fastpath-benchmark.sql
r05_psql -f tests/world-v2-b10-postgres/versioned-release-r05.sql
echo 'B10-R05 PASS: isolated release migration, atomic rollback and manual after-commit restoration'
