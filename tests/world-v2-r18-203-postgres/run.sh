#!/usr/bin/env bash
# R203 — only disposable PG17; proof that R203 root-bucket classifier rejects
# an otherwise root-AND fictional policy with a dangerous nested OR bucket arm.
set -euo pipefail
fail(){ echo "R203 SCRATCH NO_GO: $*" >&2; exit 64; }
[[ "$(printenv GITHUB_ACTIONS || true)" == "true" ]] || fail "Actions only"
for marker in R201_ISOLATED R202_ISOLATED R203_ISOLATED;do
 [[ "$(printenv "$marker" || true)" == "yes" ]] || fail "missing $marker marker"
done
[[ "$(printenv PGHOST || true)" == "127.0.0.1" &&
   "$(printenv PGPORT || true)" == "5432" &&
   "$(printenv PGDATABASE || true)" == "world_v2_r18_201" &&
   "$(printenv PGUSER || true)" == "postgres" &&
   "$(printenv PGPASSWORD || true)" == "r201_disposable_only" ]] ||
 fail "non-disposable PostgreSQL connection"
for k in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR \
 PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$k" || true)" ]] || fail "hosted connection override $k"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-203-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT

# Unchanged R202 synthetic fixture includes unchanged R201 source contract.
bash tests/world-v2-r18-202-postgres/run.sh > "$scratch/fixture.log"
query=scripts/release/r203_readonly_storage_bucket_root_guards.sql
psql -X -q -v ON_ERROR_STOP=1 -A -t -F '|' -f "$query" \
 > "$scratch/baseline.txt"
awk -F'|' '
 NF==8 && $2=="t" && $4=="t" && $5=="f" && $7=="t" && $8=="3" {good++}
 END {if (NR!=3 || good!=3) exit 1}' "$scratch/baseline.txt" ||
 fail "safe original-like synthetic policies lack independent top-level bucket equality"
# Do not trust rows based on anonymous sorting: classify only 2 good/1
# weakened after the deliberately unsafe fictional policy modification.
cat > "$scratch/negative.sql" <<'SQL'
BEGIN;
ALTER POLICY fictional_personal_owner ON storage.objects USING (
  (bucket_id='fictional-user-art' OR owner_id=public.synthetic_actor())
  AND (name LIKE 'users/%' OR name LIKE 'campaign/%')
);
\i scripts/release/r203_readonly_storage_bucket_root_guards.sql
ROLLBACK;
SQL
psql -X -q -v ON_ERROR_STOP=1 -A -t -F '|' -f "$scratch/negative.sql" \
 > "$scratch/negative.txt"
awk -F'|' '
 NF==8 && $2=="t" && $4=="t" && $5=="f" && $7=="t" && $8=="3" {good++}
 NF==8 && $2=="t" && $4=="f" && $7=="t" && $8=="3" {bad++}
 END {if (NR!=3 || good!=2 || bad!=1) exit 1}' "$scratch/negative.txt" ||
 fail "R203 strict root bucket classifier did NOT detect injected nested OR guard weakening"
# Confirm immediate rollback restored the independent top-level bucket guard.
psql -X -q -v ON_ERROR_STOP=1 -A -t -F '|' -f "$query" \
 > "$scratch/restored.txt"
cmp -s "$scratch/baseline.txt" "$scratch/restored.txt" ||
 fail "synthetic policy alteration not safely rolled back"
echo "R203 SCRATCH PG17 PASS: three independent bucket equality CONST root AND children; deliberately unsafe nested OR fails guard; rollback restores exact synthetic policy classification."
echo "R203 HOSTED NO_GO: original current policy SQL and real signed Auth/Storage session authorization not executed."
