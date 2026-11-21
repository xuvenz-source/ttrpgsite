#!/usr/bin/env bash
# R207 fictional editable-display-name vs membership authorization only.
# Disposable PostgreSQL17 on loopback, GitHub Actions. No hosted DB.
set -euo pipefail
fail(){ echo "R207 SCRATCH_NO_GO: $*" >&2; exit 64; }
[[ "$(printenv GITHUB_ACTIONS || true)" == "true" &&
   "$(printenv R207_ISOLATED || true)" == "yes" ]] ||
 fail "disposable GitHub Actions marker required"
[[ "$(printenv PGHOST || true)" == "127.0.0.1" &&
   "$(printenv PGPORT || true)" == "5432" &&
   "$(printenv PGDATABASE || true)" == "world_v2_r18_207" &&
   "$(printenv PGUSER || true)" == "postgres" &&
   "$(printenv PGPASSWORD || true)" == "r207_disposable_only" ]] ||
 fail "disposable PostgreSQL17 expected"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS; do
 [[ -z "$(printenv "$key" || true)" ]] || fail "external DB override $key"
done
[[ "$(psql -X -A -t -v ON_ERROR_STOP=1 -c 'SHOW server_version_num')" =~ ^17[0-9]{4}$ ]] ||
 fail "PostgreSQL17 required"
umask 077
scratch="$(mktemp -d /tmp/r207-fictitious-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
cat > "$scratch/fixture.sql" <<'SQL'
-- Every identity, campaign, metadata field and SQL function is fabricated.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE TABLE public.fake_account (
 id uuid PRIMARY KEY, raw_user_meta_data jsonb NOT NULL
);
CREATE TABLE public.fake_membership (
 campaign_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES public.fake_account,
 PRIMARY KEY(campaign_id,user_id)
);
CREATE FUNCTION public.fake_actor() RETURNS uuid LANGUAGE sql STABLE
 SECURITY INVOKER SET search_path='' AS $q$
 SELECT NULLIF(current_setting('app.fixture_actor',true),'')::uuid
$q$;
CREATE FUNCTION public.fake_is_campaign_member(campaign_arg uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $q$
 SELECT EXISTS(
  SELECT 1 FROM public.fake_membership m
  WHERE m.campaign_id=campaign_arg AND m.user_id=public.fake_actor())
$q$;
CREATE FUNCTION public.fake_campaign_account_names(campaign_arg uuid)
RETURNS TABLE(display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $q$
 SELECT COALESCE(a.raw_user_meta_data->>'display_name','Unknown')
 FROM public.fake_account a
 JOIN public.fake_membership m ON m.user_id=a.id
 WHERE m.campaign_id=campaign_arg
 AND public.fake_is_campaign_member(campaign_arg)
 ORDER BY a.id
$q$;
REVOKE ALL ON FUNCTION public.fake_is_campaign_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fake_campaign_account_names(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fake_campaign_account_names(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fake_actor() TO authenticated;
INSERT INTO public.fake_account VALUES
 ('00000000-0000-4000-8000-000000000701','{"display_name":"Active GM"}'),
 ('00000000-0000-4000-8000-000000000702','{"display_name":"Active Player"}'),
 ('00000000-0000-4000-8000-000000000703','{"display_name":"Outsider","campaign_member":"untrusted"}');
INSERT INTO public.fake_membership VALUES
 ('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000701'),
 ('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000702');
DO $t$
BEGIN
 IF has_function_privilege('anon','public.fake_campaign_account_names(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'anonymous role unexpectedly executable'; END IF;
END $t$;
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/fixture.sql" > "$scratch/setup.log"
actor(){
 local id="$1" cmd="$2"
 psql -X -A -t -q -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL app.fixture_actor='$id';
$cmd
ROLLBACK;
SQL
}
campaign='00000000-0000-4000-8000-000000000801'
dm='00000000-0000-4000-8000-000000000701'
player='00000000-0000-4000-8000-000000000702'
outsider='00000000-0000-4000-8000-000000000703'
getcount="SELECT count(*) FROM public.fake_campaign_account_names('$campaign'::uuid);"
[[ "$(actor "$dm" "$getcount")" == "2" ]] || fail "DM should read two fictitious names"
[[ "$(actor "$player" "$getcount")" == "2" ]] || fail "member should read two fictitious names"
[[ "$(actor "$outsider" "$getcount")" == "0" ]] || fail "outsider must not read invented names"
# Model an editable display_name AND forged campaign membership in the actor's
# metadata: only direct campaign_members table membership should authorize.
psql -X -q -v ON_ERROR_STOP=1 -c "
 UPDATE public.fake_account SET raw_user_meta_data=jsonb_build_object(
  'display_name','Active GM',
  'campaign_member','$campaign')
 WHERE id='$outsider'::uuid;"
[[ "$(actor "$outsider" "$getcount")" == "0" ]] ||
 fail "spoofing editable metadata unexpectedly granted membership"
psql -X -q -v ON_ERROR_STOP=1 -c "
 UPDATE public.fake_account SET raw_user_meta_data=jsonb_build_object(
  'display_name','Changed Label')
 WHERE id='$player'::uuid;"
[[ "$(actor "$player" "SELECT count(*) FROM public.fake_campaign_account_names('$campaign'::uuid) WHERE display_name='Changed Label';")" == "1" ]] ||
 fail "fictitious display-name change should show for current members"
psql -X -q -v ON_ERROR_STOP=1 -c "
 DELETE FROM public.fake_membership WHERE user_id='$player'::uuid;"
[[ "$(actor "$player" "$getcount")" == "0" ]] ||
 fail "removed actor must not see campaign display names"
[[ "$(actor "$dm" "$getcount")" == "1" ]] ||
 fail "DM must see current member after revocation"
# DELIBERATELY UNSAFE invented SQL in an immediately rolled-back transaction.
cat > "$scratch/unsafe.sql" <<'SQL'
BEGIN;
CREATE OR REPLACE FUNCTION public.fake_campaign_account_names(campaign_arg uuid)
RETURNS TABLE(display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $q$
 SELECT COALESCE(a.raw_user_meta_data->>'display_name','Unknown')
 FROM public.fake_account a
 WHERE (public.fake_is_campaign_member(campaign_arg)
   OR EXISTS(SELECT 1 FROM public.fake_account claimed
    WHERE claimed.id=public.fake_actor()
      AND claimed.raw_user_meta_data->>'campaign_member'=campaign_arg::text))
 AND (a.id=public.fake_actor()
   OR EXISTS(SELECT 1 FROM public.fake_membership m
    WHERE m.user_id=a.id AND m.campaign_id=campaign_arg))
$q$;
SET LOCAL ROLE authenticated;
SET LOCAL app.fixture_actor='00000000-0000-4000-8000-000000000703';
DO $t$
BEGIN
 IF (SELECT count(*) FROM public.fake_campaign_account_names(
  '00000000-0000-4000-8000-000000000801'::uuid))=0
 THEN RAISE EXCEPTION 'synthetic metadata authorization bypass missing'; END IF;
END $t$;
ROLLBACK;
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/unsafe.sql" > "$scratch/negative.log"
[[ "$(actor "$outsider" "$getcount")" == "0" ]] ||
 fail "unsafe invented SQL survived rollback"
[[ "$(actor "$dm" "$getcount")" == "1" ]] ||
 fail "legitimate member view failed after rollback"
echo "R207 SCRATCH PG17 PASS: editable labels never grant membership; revocation denies; invented unsafe metadata OR leaked only inside ROLLBACK."
echo "R207 HOSTED NO_GO: invented Auth metadata and authorization function, never original source or signed user."
