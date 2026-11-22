#!/usr/bin/env bash
# R228: local-only, invented R226 PG17 fixture. NEVER hosted Supabase.
set -euo pipefail
fail(){ echo "R228_SCRATCH_NO_GO: $*" >&2; exit 64; }
[[ "${GITHUB_ACTIONS:-}" == "true" ]] || fail "GitHub Actions runner required"
[[ "${R228_ISOLATED:-}" == "yes" ]] || fail "isolated scratch sentinel missing"
[[ "${PGHOST:-}" == "127.0.0.1" ]] || fail "loopback host required"
[[ "${PGPORT:-}" == "5432" ]] || fail "unexpected scratch port"
[[ "${PGDATABASE:-}" == "world_v2_r18_228" ]] || fail "unexpected scratch database"
[[ "${PGUSER:-}" == "postgres" ]] || fail "unexpected scratch role"
[[ "${PGPASSWORD:-}" == "r228_disposable_only" ]] || fail "unexpected scratch password"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR PGOPTIONS \
 PGSERVICE PGSERVICEFILE PGPASSFILE; do
 [[ -z "$(printenv "$key" || true)" ]] || fail "external DB connection override: $key"
done
umask 077
scratch="$(mktemp -d /tmp/r228-active-map-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
q(){ psql -X -q -A -t -v ON_ERROR_STOP=1 -c "$1"; }
[[ "$(q 'SHOW server_version_num')" == 17* ]] || fail "PostgreSQL 17 required"
psql -X -q -v ON_ERROR_STOP=1 \
 -f tests/world-v2-r18-226-postgres/fictional-tenant-fixture.sql \
 > "$scratch/fixture.log"
# R226's generic fake schema used a default NO ACTION active-map deletion,
# while the read-only actual relation metadata has ON DELETE SET NULL.
# Reproduce that known live deletion behavior in this disposable fake fixture;
# no original Supabase DDL, records or migration SQL is used.
psql -X -q -v ON_ERROR_STOP=1 -c "
ALTER TABLE public.campaigns DROP CONSTRAINT synthetic_active_map_single_id;
ALTER TABLE public.campaigns
 ADD CONSTRAINT synthetic_active_map_single_id
 FOREIGN KEY(active_map_id) REFERENCES public.battle_maps(id)
 ON DELETE SET NULL;
" > "$scratch/legacy-deletion-shape.log"

# Coexistence check: R226 also stages independent token/character/map composite FKs.
psql -X -q -v ON_ERROR_STOP=1 \
 -f staging/world-v2-b10-r18-226-cross-campaign-integrity/unapplied-composite-campaign-keys.sql \
 > "$scratch/r226-composite.log"

C1=00000000-0000-4000-8000-000000000101
C2=00000000-0000-4000-8000-000000000102
M1=00000000-0000-4000-8000-000000000201
M2=00000000-0000-4000-8000-000000000202
P1=00000000-0000-4000-8000-000000000301
CH1=00000000-0000-4000-8000-000000000401

# With only old one-column active-map FK, C1 can point at C2's map.
psql -X -q -v ON_ERROR_STOP=1 \
 -c "BEGIN; UPDATE public.campaigns SET active_map_id='$M2' WHERE id='$C1'; ROLLBACK;" \
 > "$scratch/unsafe-baseline.log" ||
 fail "baseline didn't reproduce cross-campaign active map pointer"

# Apply new independently authored R228 FK ONLY in the disposable PG17 fixture.
psql -X -q -v ON_ERROR_STOP=1 \
 -f staging/world-v2-b10-r18-228-active-map-integrity/unapplied-active-map-composite-fk.sql \
 > "$scratch/guard.log"

[[ "$(q "SELECT count(*) FROM pg_catalog.pg_constraint
 WHERE conrelid='public.campaigns'::regclass AND contype='f'
 AND conname='campaigns_active_map_campaign_r228_fk'
 AND NOT convalidated AND confdeltype='n'
 AND array_length(confdelsetcols,1)=1")" == "1" ]] ||
 fail "no matching NOT VALID column-specific active-map FK"

if psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate \
 -c "BEGIN; UPDATE public.campaigns SET active_map_id='$M2' WHERE id='$C1'; ROLLBACK;" \
 > "$scratch/reject-cross-campaign.log" 2>&1; then
 fail "foreign-campaign active map was accepted"
fi
grep -q '23503' "$scratch/reject-cross-campaign.log" ||
 fail "incorrect SQLSTATE for foreign-campaign map"

# Legitimate active-map self-campaign, null/clear and other campaign unaffected.
psql -X -q -v ON_ERROR_STOP=1 -c "
BEGIN;
UPDATE public.campaigns SET active_map_id='$M1' WHERE id='$C1';
UPDATE public.campaigns SET active_map_id=NULL WHERE id='$C1';
UPDATE public.campaigns SET active_map_id='$M1' WHERE id='$C1';
DO \$r228_ok\$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.campaigns
  WHERE id='$C1' AND active_map_id='$M1') THEN
  RAISE EXCEPTION 'R228_VALID_ACTIVE_MAP_REJECTED';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.campaigns
  WHERE id='$C2' AND active_map_id='$M2') THEN
  RAISE EXCEPTION 'R228_OTHER_CAMPAIGN_CHANGED';
 END IF;
END
\$r228_ok\$;
ROLLBACK;
" > "$scratch/legitimate.log" ||
 fail "valid same-campaign active map or explicit NULL failed"

# Deleting referenced map must set active_map_id NULL, but NEVER campaign id.
psql -X -q -v ON_ERROR_STOP=1 -c "
BEGIN;
DELETE FROM public.battle_maps WHERE id='$M1';
DO \$r228_delete\$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.campaigns
  WHERE id='$C1' AND active_map_id IS NULL) THEN
  RAISE EXCEPTION 'R228_DELETE_DID_NOT_NULL_ONLY_POINTER';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.campaigns
  WHERE id='$C2' AND active_map_id='$M2') THEN
  RAISE EXCEPTION 'R228_DELETE_CHANGED_FOREIGN_CAMPAIGN';
 END IF;
END
\$r228_delete\$;
ROLLBACK;
" > "$scratch/delete.log" ||
 fail "map deletion failed to preserve campaign and clear only active_map_id"

# R226 fake authenticated player INSERT still works with both constraints staged.
psql -X -q -v ON_ERROR_STOP=1 -c "
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL r226.actor='$P1';
INSERT INTO public.map_tokens(id,campaign_id,map_id,character_id,owner_id,image_path)
VALUES(
 '00000000-0000-4000-8000-000000000901',
 '$C1','$M1','$CH1','$P1','invented/player-a.webp'
);
ROLLBACK;
" > "$scratch/player.log" ||
 fail "R228 broke unrelated R226 legitimate player token insert"

[[ "$(q "SELECT count(*) FROM pg_catalog.pg_constraint
 WHERE conrelid='public.campaigns'::regclass
 AND conname='campaigns_active_map_campaign_r228_fk'
 AND convalidated")" == "0" ]] ||
 fail "new active map FK incorrectly claims historic validation"

echo 'R228_SYNTHETIC_PG17_PASS: cross-campaign active map denied; legitimate/null/map-delete and R226 player writes preserved.'
echo 'R228_NO_GO: only invented local PG17 fixture touched; original and QA Supabase untouched; NOT VALID remains.'
