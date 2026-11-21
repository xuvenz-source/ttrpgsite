#!/usr/bin/env bash
# R18-202: re-use unchanged R201 SCRATCH-ONLY PG17 fixture and test nested OR.
# Never connects to original or QA Supabase; fabricates every policy/actor.
set -euo pipefail
fail(){ echo "R202 SCRATCH NO_GO: $*" >&2; exit 64; }
[[ "$(printenv GITHUB_ACTIONS || true)" == "true" &&
   "$(printenv R202_ISOLATED || true)" == "yes" &&
   "$(printenv R201_ISOLATED || true)" == "yes" ]] ||
  fail "isolated GitHub Actions evidence required"
[[ "$(printenv PGHOST || true)" == "127.0.0.1" &&
   "$(printenv PGPORT || true)" == "5432" &&
   "$(printenv PGDATABASE || true)" == "world_v2_r18_201" &&
   "$(printenv PGUSER || true)" == "postgres" &&
   "$(printenv PGPASSWORD || true)" == "r201_disposable_only" ]] ||
  fail "wrong loopback-only PG17 fixture"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR \
 PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "external connection override: $key"
done

# Baseline R201 fixture and tests unchanged, after which scratch DB remains.
bash tests/world-v2-r18-201-postgres/run.sh

q(){ psql -X -q -A -t -v ON_ERROR_STOP=1 -c "$1"; }
p2='00000000-0000-4000-8000-000000000302'
# Both the correctly scoped and intentionally broken policy can have an AST
# root AND. Thus root AND alone cannot prove bucket-isolation safety.
[[ "$(q "SELECT polqual::text ~ '^\{BOOLEXPR :boolop and(\s|$)' FROM pg_catalog.pg_policy WHERE polrelid='storage.objects'::regclass AND polname='fictional_personal_owner'")" == "t" ]] ||
 fail "correctly scoped synthetic owner policy does not have AST AND root"

umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-202-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
cat > "$scratch/negative-nested-or.sql" <<'SQL'
BEGIN;
-- DELIBERATELY INSECURE, FICTIONAL and immediately ROLLED BACK:
-- A top-level AND policy with owner OR within its first argument, so the
-- required bucket scope does NOT apply to the owner branch.
ALTER POLICY fictional_personal_owner ON storage.objects USING (
 (bucket_id='fictional-user-art' OR owner_id=public.synthetic_actor())
 AND (name LIKE 'users/%' OR name LIKE 'campaign/%')
);
DO $assert_ast$
BEGIN
  IF NOT (SELECT polqual::text ~ '^\{BOOLEXPR :boolop and(\s|$)'
          FROM pg_catalog.pg_policy
          WHERE polrelid='storage.objects'::regclass
            AND polname='fictional_personal_owner') THEN
    RAISE EXCEPTION 'nested OR counterexample lost top-level AST AND';
  END IF;
END $assert_ast$;
SET LOCAL ROLE authenticated;
SET LOCAL app.synthetic_actor='00000000-0000-4000-8000-000000000302';
DO $assert_bypass$
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE id=1) <> 1 THEN
    RAISE EXCEPTION 'nested OR owner bypass of synthetic map membership not reproduced';
  END IF;
  IF (SELECT count(*) FROM storage.objects WHERE id=2) <> 1 THEN
    RAISE EXCEPTION 'synthetic personal art unexpectedly denied';
  END IF;
END $assert_bypass$;
ROLLBACK;
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/negative-nested-or.sql" \
 > "$scratch/negative.log"

# Confirm rollback returned exactly to the originally bucket-scoped policy.
viewer(){
  psql -X -q -A -t -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL app.synthetic_actor = '$p2';
$1
ROLLBACK;
SQL
}
[[ "$(viewer "SELECT count(*) FROM storage.objects WHERE id=1;")" == "0" ]] ||
 fail "rollback did not restore synthetic revoked actor's map denial"
[[ "$(viewer "SELECT count(*) FROM storage.objects WHERE id IN (2,3);")" == "2" ]] ||
 fail "rollback failed to retain independent personal assets"
echo "R202 SCRATCH PG17 PASS: actual pg_node_tree root AND in both safe and deliberately unsafe nested OR synthetic policies; accidental cross-bucket owner arm bypass rolled back, original fixture authorization restored."
echo "R202 HOSTED NO_GO: the synthetic counterexample does NOT reproduce current original Storage policy SQL or any signed URL."
