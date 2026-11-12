#!/usr/bin/env bash
set -euo pipefail
# R18-46 fourth disposable GitHub Actions postgres:17 DB. NOTHING LIVE.
[[ "${WORLD_V2_B10_ISOLATED:-}" == "yes" ]] || { echo 'R46 isolated marker missing' >&2; exit 64; }
[[ "${PGHOST:-}" == "localhost" || "${PGHOST:-}" == "127.0.0.1" ]] || { echo 'R46 refuses remote host' >&2; exit 64; }
[[ "${PGPORT:-}" == "5432" && "${PGUSER:-}" == "postgres" &&
   "${PGDATABASE:-}" == "world_v2_b10" ]] || { echo 'R46 refuses unapproved user/port/database' >&2; exit 64; }
[[ -z "${PGHOSTADDR:-}" && -z "${PGSERVICE:-}" && -z "${PGSERVICEFILE:-}" &&
   -z "${DATABASE_URL:-}" && -z "${SUPABASE_DB_URL:-}" ]] || {
 echo 'R46 refuses remote override' >&2; exit 64;
}
r46db='world_v2_b10_r18_46'
createdb -h 127.0.0.1 -p 5432 -U postgres "$r46db"
r46_psql(){ PGDATABASE="$r46db" psql -X -h 127.0.0.1 -p 5432 -U postgres -v ON_ERROR_STOP=1 "$@"; }
sed -e '/^CREATE ROLE anon NOLOGIN;$/d' -e '/^CREATE ROLE authenticated NOLOGIN;$/d' \
 tests/world-v2-b04-postgres/schema.sql > /tmp/world_v2_b10_r46_schema.sql
r46_psql -f /tmp/world_v2_b10_r46_schema.sql
r46_psql -f tests/world-v2-b07-postgres/schema.sql
r46_psql -f tests/world-v2-b08-postgres/schema.sql

# Build exact ORIGINAL live-shaped V2 authority and production checkpoint
# collision triggers; reuse source-pinned extraction, never write fake stubs.
python3 tests/world-v2-b04-postgres/extract_real_v2_functions.py > /tmp/world_v2_b10_r46_core.sql
python3 tests/world-v2-b07-postgres/extract_viewer_authority.py > /tmp/world_v2_b10_r46_viewers.sql
python3 tests/world-v2-b10-postgres/extract_original_commit_r05.py > /tmp/world_v2_b10_r18_22_original_commit.sql
python3 tests/world-v2-b10-postgres/extract_real_collision_triggers_r18_18.py > /tmp/world_v2_b10_r18_22_orig_collisions.sql
python3 tests/world-v2-b10-postgres/extract_latest_trajectory_r18_19.py > /tmp/world_v2_b10_r18_22_trajectory.sql
r46_psql -f /tmp/world_v2_b10_r46_core.sql
r46_psql -f /tmp/world_v2_b10_r46_viewers.sql

# Immutable historical R18-22 script installs R05, R17/19/20.
# Produce an EPHEMERAL variant with just ONE insertion point AFTER R05 and
# BEFORE R17: protected capture of exactly five original live SQL functions.
# Hash-pinned input preserves all earlier source-reviewed checks unchanged.
python3 - <<'PY'
from pathlib import Path
import hashlib
source=Path("tests/world-v2-b10-postgres/ordered-stack-r18-22.sql").read_bytes()
blob=hashlib.sha1(b"blob "+str(len(source)).encode()+b"\0"+source).hexdigest()
assert blob=="2e7ccf6c2b3c56b880e96c6bda2762a594f6e428",f"R46 historic install script drift {blob}"
s=source.decode()
anchor="-- 2. Staged dual-geometry helpers. No invented migration timestamp.\n"
assert s.count(anchor)==1,"R46 original source boundary moved"
captured="\\i supabase/candidates/world_v2_r18_46_capture_original_sources.sql\n"
Path("/tmp/world_v2_b10_r46_ordered.sql").write_text(s.replace(anchor,captured+anchor))
PY
r46_psql -f /tmp/world_v2_b10_r46_ordered.sql

# Fourth database installs full stack as COMMITTED transactions only to
# verify post-commit recovery. No linked Supabase databases are touched.
r46_psql -f tests/world-v2-b10-postgres/recoverable-install-r18-46.sql

# Contain the optional RPC, restore R05's 4 bodies, then our 5 originals.
r46_psql -f supabase/release-recovery/world_v2_b10_r18_45_atomic_containment.sql
r46_psql -f supabase/release-recovery/world_v2_b10_r05_restore_original_authority.sql
r46_psql -f supabase/release-recovery/world_v2_b10_r18_46_restore_original_geometry.sql
r46_psql -f tests/world-v2-b10-postgres/verify-recovered-r18-46.sql

echo 'R18-46 PASS: guarded capture BEFORE R17, exact 5+4 restored originals AFTER COMMIT, two safer R20 guard triggers retained; isolated PG17'
