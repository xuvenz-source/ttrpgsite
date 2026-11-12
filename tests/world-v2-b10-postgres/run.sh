#!/usr/bin/env bash
set -euo pipefail
# Postgres is a GitHub Actions throwaway service ONLY. Abort rather than
# touch any internet-facing or user-supplied database.
[[ "${WORLD_V2_B10_ISOLATED:-}" == "yes" ]] || { echo 'B10 isolated marker required' >&2;exit 64; }
[[ "${PGHOST:-}" == '127.0.0.1' || "${PGHOST:-}" == 'localhost' ]] || { echo 'B10 nonlocal DB refused' >&2;exit 64; }
[[ "${PGDATABASE:-}" == 'world_v2_b10' ]] || { echo 'B10 non-ephemeral DB refused' >&2;exit 64; }

# Reproduce the actual B03→B07→B08 dependency/order in ONE transaction-
# independent disposable DB; each adversarial test rolls its data back.
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b04-postgres/schema.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b07-postgres/schema.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b08-postgres/schema.sql
python3 tests/world-v2-b04-postgres/extract_real_v2_functions.py > /tmp/world_v2_b10_core.sql
python3 tests/world-v2-b07-postgres/extract_viewer_authority.py > /tmp/world_v2_b10_viewers.sql
psql -X -v ON_ERROR_STOP=1 -f /tmp/world_v2_b10_core.sql
psql -X -v ON_ERROR_STOP=1 -f /tmp/world_v2_b10_viewers.sql
# R04 PRODUCTION-ORDER REHEARSAL: all five staged SQL candidates are installed
# atomically, ACL/security/source signatures checked, then ROLLED BACK in
# the same disposable postgres:17 connection. Existing source-real hostile
# suites below must still pass when the candidates are installed normally.
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b10-postgres/migration-rehearsal-r04.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b03_path_validation.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b04-postgres/hostile.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b07_private_observer_budget.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b07-postgres/hostile.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b08_commit_reconciliation.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b08-postgres/hostile.sql
# B10-R01 installs a replacement PRIVATE Core AFTER the complete stack.
# Run the source-real B08 hostile tests against the installed new core. The
# B04 legacy test deliberately expects its original inert broadcaster and an
# unfixed H39 replay (both replaced by B07/B08), so it is run BEFORE those
# candidates only; this order must not be changed just to fabricate passes.
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b10_r01_core_path_integration.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b08-postgres/hostile.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b10-postgres/integrated.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b10-postgres/core-path-r01.sql
# R03 changes the B08 terminal-queue disposition, so keep the historical B08
# suite BEFORE this explicit replacement. A fresh cross-layer R03 hostile
# suite below verifies exact retry cannot replay old pending paths after a
# canonical commit (including the equal-origin stale frame case).
psql -X -v ON_ERROR_STOP=1 -f supabase/candidates/world_v2_b10_r03_terminal_queue_retirement.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b10-postgres/terminal-r03.sql
# R18-17 intentionally stages NO live migration: overlay the dual 0.10-cell
# swept-wall candidate inside a disposable BEGIN/ROLLBACK test only. Check
# both V2 and legacy helper parity against strict crossing, then leave the
# historical B10 R05 stack unmodified for its separate rehearsal below.
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b10-postgres/wall-edge-r18-17.sql
# R18-18: use EXACT historic, git-blob-verified legacy trigger definitions
# to exercise actual token/tool UPDATE statements against candidate swept
# collision semantics. Both trigger install and all test writes ROLLBACK.
python3 tests/world-v2-b10-postgres/extract_real_collision_triggers_r18_18.py \
 > /tmp/world_v2_b10_r18_18_legacy_triggers.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b10-postgres/direct-write-wall-r18-18.sql
# R18-19: overwrite the historical 20261108031754 guard source with the
# ACTUAL LATER 20261108055943 trajectory-aware guard source, then validate
# private per-leg geometry, public alternate RPCs, and map-transfer authorization.
# Source extractor and candidate are local-only. All work ROLLBACK.
python3 tests/world-v2-b10-postgres/extract_latest_trajectory_r18_19.py \
 > /tmp/world_v2_b10_r18_19_latest_trajectory.sql
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b10-postgres/trajectory-map-auth-r18-19.sql
# R18-20: full write-path correction. Install live read-only-snapshotted
# token/tool validators AND existing latest triggers in isolated PG17,
# prove old token/map coherent campaign reparent and subsequent denial by
# the NEW, nonapplied campaign-affinity candidate. All DDL/DML ROLLBACK.
psql -X -v ON_ERROR_STOP=1 -f tests/world-v2-b10-postgres/campaign-affinity-r18-20.sql

# Privilege checks after ALL three SQL candidates coexist.
for role in anon authenticated;do
 if psql -X -v ON_ERROR_STOP=1 -c "SET ROLE ${role}; SELECT forge_world_v2.validate_motion_path_batch_b03(gen_random_uuid(),1,'{}','[]',1,1);" >"/tmp/b10_${role}_deny.log" 2>&1;then
  echo "B10 SECURITY FAILURE: ${role} called private validator" >&2;exit 1
 fi
 grep -qi 'permission denied' "/tmp/b10_${role}_deny.log" || {
  cat "/tmp/b10_${role}_deny.log" >&2;exit 1
 }
done
echo 'B10-R01 PASS: source-real B03+B07+B08 integrated private-core and hostile regressions'
echo 'B10-R03 PASS: B03+B07+B08+R01 canonical core and terminal queue-retirement hostile regressions'
# Real versioned release candidate is independently tested in a SECOND
# disposable local database with source-extracted original public Commit.
# It must pass BOTH atomic abort and post-commit four-function recovery.
bash tests/world-v2-b10-postgres/rehearse-r05.sh
echo 'B10 RELEASE GATE STILL BLOCKED: nonapplied candidate, observer-budget recovery and live Auth/LOS QA remain.'
