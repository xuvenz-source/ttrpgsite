#!/usr/bin/env bash
# R204 original-shaped MEMBERSHIP INSIDE OR branching; scratch PG17 ONLY.
# Invented campaigns/users/maps/roles. Original SQL helper never copied to CI.
set -euo pipefail
fail(){ echo "R204 SCRATCH NO_GO: $*" >&2; exit 64; }
[[ "$(printenv GITHUB_ACTIONS || true)" == "true" ]] || fail "Actions only"
for var in R201_ISOLATED R202_ISOLATED R203_ISOLATED R204_ISOLATED;do
 [[ "$(printenv "$var" || true)" == "yes" ]] || fail "missing $var"
done
[[ "$(printenv PGHOST || true)" == "127.0.0.1" &&
   "$(printenv PGPORT || true)" == "5432" &&
   "$(printenv PGDATABASE || true)" == "world_v2_r18_201" &&
   "$(printenv PGUSER || true)" == "postgres" &&
   "$(printenv PGPASSWORD || true)" == "r201_disposable_only" ]] ||
  fail "non-disposable database connection"
for var in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR \
 PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$var" || true)" ]] || fail "external credentials forbidden"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-204-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT

# Re-run source-immutable R201/R202/R203 exact PostgreSQL fixture before work.
bash tests/world-v2-r18-203-postgres/run.sh > "$scratch/baseline.log"
cat > "$scratch/fictional-helper.sql" <<'SQL'
BEGIN;
ALTER TABLE public.fictional_membership ADD COLUMN member_role text NOT NULL DEFAULT 'player';
UPDATE public.fictional_membership
SET member_role='dm'
WHERE user_id='00000000-0000-4000-8000-000000000301';
INSERT INTO public.fictional_membership(campaign_id,user_id,member_role)
VALUES('00000000-0000-4000-8000-000000000101',
       '00000000-0000-4000-8000-000000000303','player');
-- Revoked actor 302 is ABSENT from current membership but has a stale
-- assignment. P1 (303) is an active member with a valid assignment.
CREATE TABLE public.fictional_map_assignments(
 campaign_id uuid NOT NULL,user_id uuid NOT NULL,
 PRIMARY KEY(campaign_id,user_id)
);
INSERT INTO public.fictional_map_assignments VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000303');
CREATE FUNCTION public.synthetic_can_view_map_guard(campaign_arg uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT public.synthetic_actor() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.fictional_membership m
      WHERE m.campaign_id=campaign_arg
        AND m.user_id=public.synthetic_actor()
        AND (
          m.member_role='dm'
          OR EXISTS (
            SELECT 1 FROM public.fictional_map_assignments a
            WHERE a.campaign_id=campaign_arg
              AND a.user_id=m.user_id
          )
        )
    )
$function$;
REVOKE ALL ON FUNCTION public.synthetic_can_view_map_guard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.synthetic_can_view_map_guard(uuid) TO authenticated;
COMMIT;
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/fictional-helper.sql" \
 > "$scratch/setup.log"
q(){ psql -X -q -A -t -v ON_ERROR_STOP=1 -c "$1"; }
[[ "$(q "SELECT has_function_privilege('anon','public.synthetic_can_view_map_guard(uuid)','EXECUTE')")" == "f" ]] ||
 fail "fictional helper improperly callable by anon"
viewer(){
 local actor="$1" campaign="$2"
 psql -X -q -A -t -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL app.synthetic_actor = '$actor';
SELECT public.synthetic_can_view_map_guard('$campaign'::uuid);
ROLLBACK;
SQL
}
campaign='00000000-0000-4000-8000-000000000101'
other='00000000-0000-4000-8000-000000000102'
dm='00000000-0000-4000-8000-000000000301'
removed='00000000-0000-4000-8000-000000000302'
p1='00000000-0000-4000-8000-000000000303'
outsider='00000000-0000-4000-8000-000000000304'
[[ "$(viewer "$dm" "$campaign")" == "t" ]] || fail "active DM cannot see map"
[[ "$(viewer "$p1" "$campaign")" == "t" ]] || fail "assigned current player cannot see map"
[[ "$(viewer "$removed" "$campaign")" == "f" ]] || fail "revoked stale assignee can still see map"
[[ "$(viewer "$outsider" "$campaign")" == "f" ]] || fail "outsider sees map"
[[ "$(viewer "$p1" "$other")" == "f" ]] || fail "cross-campaign current player sees unrelated map"
[[ "$(viewer "" "$campaign")" == "f" ]] || fail "null identity can see map"
# Demonstrate the revocation vulnerability when an assignment OR escapes
# the enclosing current-membership EXISTS; rollback restores safe helper.
cat > "$scratch/unsafe-outer-or.sql" <<'SQL'
BEGIN;
CREATE OR REPLACE FUNCTION public.synthetic_can_view_map_guard(campaign_arg uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 SELECT (public.synthetic_actor() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.fictional_membership m
    WHERE m.campaign_id=campaign_arg
      AND m.user_id=public.synthetic_actor()
      AND m.member_role='dm'
   ))
   OR EXISTS (
     SELECT 1 FROM public.fictional_map_assignments a
     WHERE a.campaign_id=campaign_arg
       AND a.user_id=public.synthetic_actor()
   )
$function$;
SET LOCAL ROLE authenticated;
SET LOCAL app.synthetic_actor='00000000-0000-4000-8000-000000000302';
SELECT public.synthetic_can_view_map_guard(
  '00000000-0000-4000-8000-000000000101'::uuid);
ROLLBACK;
SQL
psql -X -q -A -t -v ON_ERROR_STOP=1 -f "$scratch/unsafe-outer-or.sql" \
 > "$scratch/negative.txt"
[[ "$(cat "$scratch/negative.txt")" == "t" ]] ||
 fail "synthetic stale-assignment OR authorization bypass not reproduced"
[[ "$(viewer "$removed" "$campaign")" == "f" ]] ||
 fail "synthetic unsafe helper modification not rolled back"
[[ "$(viewer "$dm" "$campaign")" == "t" ]] ||
 fail "legitimate DM permission failed to recover"
echo "R204 SCRATCH PG17 PASS: current membership encloses DM/assignment OR, revoked stale assignment denied, intentionally escaped OR leaks in ROLLBACK only."
echo "R204 HOSTED NO_GO: fictional source is NOT actual original map helper body or signed Supabase Storage API."
