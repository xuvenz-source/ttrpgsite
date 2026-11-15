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
# R18-84: rerun the SAME source-real signed benchmark in a fresh rolled-back
# transaction, but with all 6 real map-token and 4 issued-tool x/y triggers.
# The original R18-83 two-trigger run and measurements remain unchanged.
r05_psql -v r84_full=1 -f tests/world-v2-b10-postgres/r54-fog-commit-source-real.sql
# R18-85 third independent, rolled-back full-trigger replay with bounded
# four additional signed sessions for per-RPC Begin+Advance vs Commit
# function statistics. The original R83 and R84 passes remain untouched.
r05_psql -v r84_full=1 -v r85_phase=1 -f tests/world-v2-b10-postgres/r54-fog-commit-source-real.sql
# R18-86 fourth independent R54 full-trigger transaction: 8 viewers,
# 4 source-sealed candidate modes and frozen ORIGINAL ray/frame reference.
# Deliberately skips R68/R84/R85 replay in this fourth run: no rate bypass.
r05_psql -v r84_full=1 -v r86_matrix=1 -f tests/world-v2-b10-postgres/r54-fog-commit-source-real.sql
# R18-87 fifth independent disposable full-trigger pass: preserve the R86
# 4-mode complete private frame qualification, add 24 balanced source-sealed
# measured actor-signed Commits plus 24 actor-signed returns (within 120 cap).
# Genuine original R57/R77 operator-gated candidates and inverses only.
r05_psql -v r84_full=1 -v r86_matrix=1 -v r87_balanced=1 -f tests/world-v2-b10-postgres/r54-fog-commit-source-real.sql
# R18-88 sixth independent disposable PG17 run: after original R86 signed
# 8-viewer source parity, prove partial and combined candidate installations
# are atomically undone with SAVEPOINT; do not replay R87 or issue live SQL.
r05_psql -v r84_full=1 -v r86_matrix=1 -v r88_atomic=1 -f tests/world-v2-b10-postgres/r54-fog-commit-source-real.sql
# R18-55: ONLY in same disposable DB, prototype fail-closed dirty fog handoff.
# Real signed Begin/Advance/Commit and original sight functions with rollback.
r05_psql -f tests/world-v2-b10-postgres/r55-dirty-fog-prototype.sql
# R18-56: compare exact source-real authorized fog frames and synchronous Commit
# in another rolled-back test transaction. No unreviewed production mutations.
r05_psql -f tests/world-v2-b10-postgres/r56-synchronous-fog-fastpath-benchmark.sql
# R18-57: guarded 91-migration-history, eight-viewer wall-heavy opt-in
# + exact source restoration, all under disposable BEGIN/ROLLBACK.
r05_psql -f tests/world-v2-b10-postgres/r57-guarded-fog-release-benchmark.sql
r05_psql -f tests/world-v2-b10-postgres/versioned-release-r05.sql
echo 'B10-R05 PASS: isolated release migration, atomic rollback and manual after-commit restoration'
