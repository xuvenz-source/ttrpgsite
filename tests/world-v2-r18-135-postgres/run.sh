#!/usr/bin/env bash
# R135 disposable PG17 only. NO hosted Supabase credentials.
set -euo pipefail
fail(){ echo "R135 ISOLATION/SECURITY FAILURE: $*" >&2;exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" && "${R135_ISOLATED:-}" == "yes" ]] || fail "dedicated CI required"
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGPORT:-}" == "5432" ]] || fail "loopback-only DB"
[[ "${PGDATABASE:-}" == "world_v2_r18_135" && "${PGUSER:-}" == "postgres" ]] || fail "synthetic DB only"
[[ "${PGPASSWORD:-}" == "r135_disposable_only" ]] || fail "synthetic password only"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_SECRET_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "hosted environment variable is forbidden: $key"
done
umask 077
tmp="$(mktemp -d /tmp/world-v2-r18-135-XXXXXXXX)"
trap 'rm -rf -- "$tmp"' EXIT
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-125-postgres/setup.sql > "$tmp/members.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-126-postgres/setup-scene.sql > "$tmp/realtime.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-125-private-scene-revocation/unapplied-scene-v3-prototype.sql > "$tmp/epoch.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-126-scene-v3-cutover-contract/unapplied-atomic-v3-scene-candidate.sql > "$tmp/v3-scene.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-132-scene-publisher-drain/unapplied-scene-publication-drain.sql > "$tmp/scene-fence.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-133-observer-v3-relay/unapplied-v3-observer-relay.sql > "$tmp/v3-observer.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-134-postgres/setup-stubs.sql > "$tmp/legacy-stubs.log"
psql -X -v ON_ERROR_STOP=1 -q -f staging/world-v2-b10-r18-134-six-sender-v3-cutover/unapplied-six-legacy-observer-replacements.sql > "$tmp/six-replacements.log"
psql -X -v ON_ERROR_STOP=1 -q -f tests/world-v2-r18-135-postgres/verify-old-socket-candidate.sql > "$tmp/old-socket-candidate.log"
echo 'R135 SOURCE-ONLY PG17 PASS: converted candidate scene/observer sends never targeted old standing topic strings.'
echo 'R135 NEGATIVE CONTROL: trusted unguarded send still reaches old topic; real already-connected sockets NOT PROVED SAFE.'
