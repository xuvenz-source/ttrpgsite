#!/usr/bin/env bash
# B10-R18-201 scratch-only PostgreSQL17 proof of 3 permissive RLS branches.
# Purely invented objects, bucket IDs, paths, member UUIDs and SQL. Never host.
set -euo pipefail
fail(){ echo "R201 SCRATCH NO_GO: $*" >&2; exit 64; }
[[ "$(printenv GITHUB_ACTIONS || true)" == "true" ]] || fail "Actions required"
[[ "$(printenv R201_ISOLATED || true)" == "yes" ]] || fail "isolation required"
[[ "$(printenv PGHOST || true)" == "127.0.0.1" && "$(printenv PGPORT || true)" == "5432" ]] || fail "non-local PostgreSQL forbidden"
[[ "$(printenv PGDATABASE || true)" == "world_v2_r18_201" && "$(printenv PGUSER || true)" == "postgres" ]] || fail "wrong disposable DB role"
[[ "$(printenv PGPASSWORD || true)" == "r201_disposable_only" ]] || fail "wrong scratch-only password"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL SUPABASE_DATABASE_URL \
 SUPABASE_SERVICE_ROLE_KEY PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$key" || true)" ]] || fail "external override prohibited: $key"
done
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-201-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
cat > "$scratch/fictional-three-branches.sql" <<'SQL'
BEGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO authenticated;
CREATE TABLE public.fictional_membership (
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY(campaign_id,user_id)
);
CREATE TABLE storage.objects (
  id integer PRIMARY KEY,
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner_id uuid,
  campaign_id uuid
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON storage.objects TO authenticated;
CREATE FUNCTION public.synthetic_actor() RETURNS uuid
LANGUAGE sql STABLE SET search_path='' AS $f$
  SELECT NULLIF(current_setting('app.synthetic_actor',true),'')::uuid
$f$;
REVOKE ALL ON FUNCTION public.synthetic_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.synthetic_actor() TO authenticated;
CREATE FUNCTION public.synthetic_can_view_map(target_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
  SELECT EXISTS (
    SELECT 1 FROM public.fictional_membership m
    WHERE m.campaign_id=target_campaign
      AND m.user_id=public.synthetic_actor()
  )
$f$;
REVOKE ALL ON FUNCTION public.synthetic_can_view_map(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.synthetic_can_view_map(uuid) TO authenticated;
-- These are REPRESENTATIVE policies. They are NOT the original Storage SQL.
CREATE POLICY fictional_campaign_map ON storage.objects AS PERMISSIVE FOR SELECT
TO authenticated USING (
  bucket_id='fictional-campaign-assets'
  AND name LIKE 'campaign/%'
  AND public.synthetic_can_view_map(campaign_id)
);
CREATE POLICY fictional_personal_owner ON storage.objects AS PERMISSIVE FOR SELECT
TO authenticated USING (
  bucket_id='fictional-user-art'
  AND owner_id=public.synthetic_actor()
  AND (name LIKE 'users/%' OR name LIKE 'gallery/%')
);
CREATE POLICY fictional_personal_path ON storage.objects AS PERMISSIVE FOR SELECT
TO authenticated USING (
  bucket_id='fictional-user-profile'
  AND name LIKE (public.synthetic_actor()::text || '/%')
);
INSERT INTO public.fictional_membership(campaign_id,user_id)
VALUES ('00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000301');
INSERT INTO storage.objects(id,bucket_id,name,owner_id,campaign_id) VALUES
  (1,'fictional-campaign-assets','campaign/map.png',
    '00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000101'),
  (2,'fictional-user-art','users/art.png',
    '00000000-0000-4000-8000-000000000302',NULL),
  (3,'fictional-user-profile','00000000-0000-4000-8000-000000000302/avatar.png',
    '00000000-0000-4000-8000-000000000302',NULL),
  (4,'fictional-campaign-assets','campaign/other-map.png',
    '00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000102');
COMMIT;
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/fictional-three-branches.sql" > "$scratch/setup.log"

q(){ psql -X -q -A -t -v ON_ERROR_STOP=1 -c "$1"; }
viewer(){
 local actor="$1" sql="$2"
 psql -X -q -A -t -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL app.synthetic_actor = '$actor';
$sql
ROLLBACK;
SQL
}
p2='00000000-0000-4000-8000-000000000302'
dm='00000000-0000-4000-8000-000000000301'
outsider='00000000-0000-4000-8000-000000000303'
[[ "$(q "SELECT count(*) FROM pg_catalog.pg_policy
 WHERE polrelid='storage.objects'::regclass AND polcmd='r' AND polpermissive")" == "3" ]] ||
  fail "expected exactly three synthetic permissive SELECT policies"
[[ "$(q "SELECT has_table_privilege('anon','storage.objects','SELECT')")" == "f" ]] ||
  fail "anon synthetic object grant not denied"
[[ "$(viewer "$dm" "SELECT count(*) FROM storage.objects WHERE id=1;")" == "1" ]] ||
  fail "synthetic active DM cannot read authorized map"
[[ "$(viewer "$p2" "SELECT count(*) FROM storage.objects WHERE id=1;")" == "0" ]] ||
  fail "removed synthetic member can see campaign map despite member helper"
[[ "$(viewer "$outsider" "SELECT count(*) FROM storage.objects WHERE id=1;")" == "0" ]] ||
  fail "synthetic outsider sees campaign map"
[[ "$(viewer "$p2" "SELECT count(*) FROM storage.objects WHERE id=2;")" == "1" ]] ||
  fail "removed actor lost independently owned art"
[[ "$(viewer "$p2" "SELECT count(*) FROM storage.objects WHERE id=3;")" == "1" ]] ||
  fail "removed actor lost independently owned personal profile"
[[ "$(viewer "$outsider" "SELECT count(*) FROM storage.objects WHERE id=2;")" == "0" ]] ||
  fail "synthetic outsider can see another account's personal art"
[[ "$(viewer "" "SELECT count(*) FROM storage.objects;")" == "0" ]] ||
  fail "null identity should not authorize any synthetic object"
# IMPORTANT: an OR outside the bucket/identity boundary can override the
# otherwise sound campaign map helper. This deliberately BROKEN policy is
# installed ONLY inside an immediately rolled-back scratch transaction.
cat > "$scratch/intentional-bleed-rollback.sql" <<'SQL'
BEGIN;
ALTER POLICY fictional_personal_owner ON storage.objects USING (
 (bucket_id='fictional-user-art'
   AND owner_id=public.synthetic_actor()
   AND name LIKE 'users/%')
 OR (owner_id=public.synthetic_actor() AND name LIKE 'campaign/%')
);
SET LOCAL ROLE authenticated;
SET LOCAL app.synthetic_actor='00000000-0000-4000-8000-000000000302';
DO $block$
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE id=1) <> 1 THEN
    RAISE EXCEPTION 'representative accidental cross-bucket OR bypass not reproduced';
  END IF;
END
$block$;
ROLLBACK;
SQL
# DO with actor role might not have CREATE/function access in other cases.
# Here it is a top-level disposable scratch statement and only performs a SELECT.
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/intentional-bleed-rollback.sql" > "$scratch/negative.log"
[[ "$(viewer "$p2" "SELECT count(*) FROM storage.objects WHERE id=1;")" == "0" ]] ||
  fail "ROLLBACK failed to restore strong bucket-scoped policy"
[[ "$(viewer "$p2" "SELECT count(*) FROM storage.objects WHERE id=2;")" == "1" ]] ||
  fail "strong policy harmed independently owned art"
echo "R201 SCRATCH PG17 PASS: correct bucket-scoped OR authorizes active map members and personal assets independently; intentionally misplaced OR bypasses map membership in a rolled-back negative test."
echo "R201 NO_GO: all policies here are FICTIONAL; actual hosted Storage SQL expressions and revoked signed URL issuance not exercised."
