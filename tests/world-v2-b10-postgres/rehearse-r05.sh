#!/usr/bin/env bash
set -euo pipefail
# Extra disposable LOCAL database, separate from historical B04/B07/B08/R01/
# R03 fixture. Never accept a Supabase connection string/remote host.
[[ "${WORLD_V2_B10_ISOLATED:-}" == "yes" ]] || { echo "R05 ephemeral marker missing" >&2; exit 64; }
[[ "${PGHOST:-}" == "localhost" || "${PGHOST:-}" == "127.0.0.1" ]] || { echo "R05 remote database refused" >&2; exit 64; }
[[ "${PGDATABASE:-}" == "world_v2_b10" ]] || { echo "R05 caller database refused" >&2;exit 64; }

r05db='world_v2_b10_r05'
# The CI PostgreSQL service is fresh and only for the GitHub Actions job.
createdb "$r05db"
r05_psql(){
 PGDATABASE="$r05db" psql -X -v ON_ERROR_STOP=1 "$@"
}
r05_psql -f tests/world-v2-b04-postgres/schema.sql
r05_psql -f tests/world-v2-b07-postgres/schema.sql
r05_psql -f tests/world-v2-b08-postgres/schema.sql
python3 tests/world-v2-b04-postgres/extract_real_v2_functions.py > /tmp/world_v2_b10_r05_core.sql
python3 tests/world-v2-b07-postgres/extract_viewer_authority.py > /tmp/world_v2_b10_r05_viewers.sql
python3 tests/world-v2-b10-postgres/extract_original_commit_r05.py > /tmp/world_v2_b10_r05_original_commit.sql
r05_psql -f /tmp/world_v2_b10_r05_core.sql
r05_psql -f /tmp/world_v2_b10_r05_viewers.sql
r05_psql -f tests/world-v2-b10-postgres/versioned-release-r05.sql
echo 'B10-R05 PASS: isolated release migration, atomic rollback and manual after-commit restoration'
