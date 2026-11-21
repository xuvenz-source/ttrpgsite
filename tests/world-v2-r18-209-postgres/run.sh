#!/usr/bin/env bash
# R209: invented World V2 session races, PostgreSQL17 localhost ONLY.
# This is NOT original installed SQL, policy or signed identity testing.
set -euo pipefail
fail(){ echo "R209 SCRATCH NO_GO: $*" >&2; exit 64; }
[[ "$(printenv GITHUB_ACTIONS || true)" == "true" &&
   "$(printenv R209_ISOLATED || true)" == "yes" ]] ||
  fail "GitHub-only disposable marker missing"
[[ "$(printenv PGHOST || true)" == "127.0.0.1" &&
   "$(printenv PGPORT || true)" == "5432" &&
   "$(printenv PGDATABASE || true)" == "world_v2_r18_209" &&
   "$(printenv PGUSER || true)" == "postgres" &&
   "$(printenv PGPASSWORD || true)" == "r209_disposable_only" ]] ||
  fail "refusing non-disposable database connection"
for key in DATABASE_URL DIRECT_URL SUPABASE_URL SUPABASE_DB_URL \
 SUPABASE_DATABASE_URL SUPABASE_SERVICE_ROLE_KEY \
 PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS;do
 [[ -z "$(printenv "$key" || true)" ]] || fail "external override $key"
done
[[ "$(psql -X -A -t -v ON_ERROR_STOP=1 -c 'SHOW server_version_num')" =~ ^17[0-9]{4}$ ]] ||
 fail "PostgreSQL17 required"
umask 077
scratch="$(mktemp -d /tmp/world-v2-r18-209-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
cat > "$scratch/fixture.sql" <<'SQL'
-- Entire schema, account IDs, campaign, token and session are fabricated.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE TABLE public.fake_world_members(
 campaign_id uuid NOT NULL, actor_id uuid NOT NULL, member_role text NOT NULL,
 PRIMARY KEY(campaign_id,actor_id)
);
CREATE TABLE public.fake_world_tokens(
 token_id uuid PRIMARY KEY, campaign_id uuid NOT NULL, step integer NOT NULL DEFAULT 0
);
CREATE TABLE public.fake_world_sessions(
 session_id uuid PRIMARY KEY, campaign_id uuid NOT NULL,
 actor_id uuid NOT NULL, token_id uuid NOT NULL, staged_step integer NOT NULL DEFAULT 0
);
CREATE FUNCTION public.fake_world_uid() RETURNS uuid LANGUAGE sql STABLE
 SECURITY INVOKER SET search_path='' AS $q$
 SELECT NULLIF(current_setting('app.fake_world_uid',true),'')::uuid
$q$;
CREATE FUNCTION public.fake_world_can_view(camp uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $q$
 SELECT EXISTS (SELECT 1 FROM public.fake_world_members m
   WHERE m.campaign_id=camp AND m.actor_id=public.fake_world_uid())
$q$;
CREATE FUNCTION public.fake_world_begin(camp uuid,tok uuid,sid uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q$
BEGIN
 IF public.fake_world_uid() IS NULL OR
    NOT public.fake_world_can_view(camp) THEN RETURN FALSE; END IF;
 INSERT INTO public.fake_world_sessions(session_id,campaign_id,actor_id,token_id)
 SELECT sid,camp,public.fake_world_uid(),t.token_id
 FROM public.fake_world_tokens t
 WHERE t.token_id=tok AND t.campaign_id=camp;
 RETURN FOUND;
END
$q$;
CREATE FUNCTION public.fake_world_advance(sid uuid,delta integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q$
BEGIN
 UPDATE public.fake_world_sessions s SET staged_step=s.staged_step+delta
 WHERE s.session_id=sid AND s.actor_id=public.fake_world_uid();
 RETURN FOUND;
END
$q$;
CREATE FUNCTION public.fake_world_commit(sid uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q$
DECLARE changed integer;
BEGIN
 UPDATE public.fake_world_tokens t SET step=s.staged_step
 FROM public.fake_world_sessions s
 WHERE s.session_id=sid
   AND s.actor_id=public.fake_world_uid()
   AND s.token_id=t.token_id
   AND s.campaign_id=t.campaign_id
   AND public.fake_world_can_view(s.campaign_id);
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed!=1 THEN RETURN FALSE; END IF;
 DELETE FROM public.fake_world_sessions s
 WHERE s.session_id=sid AND s.actor_id=public.fake_world_uid();
 RETURN TRUE;
END
$q$;
CREATE FUNCTION public.fake_world_cancel(sid uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q$
BEGIN
 DELETE FROM public.fake_world_sessions s
 WHERE s.session_id=sid AND s.actor_id=public.fake_world_uid();
 RETURN FOUND;
END
$q$;
REVOKE ALL ON FUNCTION public.fake_world_uid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fake_world_can_view(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fake_world_begin(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fake_world_advance(uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fake_world_commit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fake_world_cancel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fake_world_uid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fake_world_can_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fake_world_begin(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fake_world_advance(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fake_world_commit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fake_world_cancel(uuid) TO authenticated;
INSERT INTO public.fake_world_members VALUES
 ('00000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000000911','player'),
 ('00000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000000912','dm');
INSERT INTO public.fake_world_tokens VALUES
 ('00000000-0000-4000-8000-000000000921',
  '00000000-0000-4000-8000-000000000901',0),
 ('00000000-0000-4000-8000-000000000922',
  '00000000-0000-4000-8000-000000000902',0);
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/fixture.sql" > "$scratch/setup.log"
[[ "$(psql -X -A -t -v ON_ERROR_STOP=1 -c "
SELECT has_function_privilege('anon','public.fake_world_commit(uuid)','EXECUTE')")" == "f" ]] ||
 fail "anon could commit synthetic movement"
actor(){
 local person="$1" statement="$2"
 psql -X -A -t -q -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL app.fake_world_uid='$person';
$statement
ROLLBACK;
SQL
}
campaign='00000000-0000-4000-8000-000000000901'
other_campaign='00000000-0000-4000-8000-000000000902'
token='00000000-0000-4000-8000-000000000921'
other_token='00000000-0000-4000-8000-000000000922'
player='00000000-0000-4000-8000-000000000911'
dm='00000000-0000-4000-8000-000000000912'
outsider='00000000-0000-4000-8000-000000000913'
player_session='00000000-0000-4000-8000-000000000931'
dm_session='00000000-0000-4000-8000-000000000932'
# Persistent fixture action helper uses COMMIT; no hosted connection.
persist(){
 local person="$1" statement="$2"
 psql -X -A -t -q -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL app.fake_world_uid='$person';
$statement
COMMIT;
SQL
}
[[ "$(persist "$player" "SELECT public.fake_world_begin('$campaign'::uuid,'$token'::uuid,'$player_session'::uuid);")" == "t" ]] ||
 fail "current player cannot begin"
[[ "$(persist "$player" "SELECT public.fake_world_advance('$player_session'::uuid,1);")" == "t" ]] ||
 fail "current player cannot advance"
# Revocation occurs BETWEEN beginning, staging and committing.
psql -X -q -v ON_ERROR_STOP=1 -c "
DELETE FROM public.fake_world_members WHERE actor_id='$player'::uuid;"
[[ "$(persist "$player" "SELECT public.fake_world_advance('$player_session'::uuid,1);")" == "t" ]] ||
 fail "expected actor-only in-progress staging after revocation not reproduced"
[[ "$(persist "$player" "SELECT public.fake_world_commit('$player_session'::uuid);")" == "f" ]] ||
 fail "revoked player committed fake token after losing membership"
[[ "$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c "
 SELECT step FROM public.fake_world_tokens WHERE token_id='$token'::uuid;")" == "0" ]] ||
 fail "fake final token changed after revoked commit"
[[ "$(actor "$dm" "SELECT public.fake_world_advance('$player_session'::uuid,1);")" == "f" ]] ||
 fail "another member advanced player's in-progress session"
[[ "$(actor "$dm" "SELECT public.fake_world_cancel('$player_session'::uuid);")" == "f" ]] ||
 fail "another member deleted player's pending session"
[[ "$(actor "$outsider" "SELECT public.fake_world_commit('$player_session'::uuid);")" == "f" ]] ||
 fail "outsider committed someone else's session"
[[ "$(actor "$outsider" "SELECT public.fake_world_begin('$campaign'::uuid,'$token'::uuid,'00000000-0000-4000-8000-000000000933'::uuid);")" == "f" ]] ||
 fail "outsider began campaign movement"
[[ "$(actor "$dm" "SELECT public.fake_world_begin('$other_campaign'::uuid,'$other_token'::uuid,'00000000-0000-4000-8000-000000000934'::uuid);")" == "f" ]] ||
 fail "DM crossed campaign boundary"
# An unsafe commit that accepts stale sessions on actor-only OR is intentionally
# substituted in a disposable transaction, then immediately rolled back.
cat > "$scratch/unsafe-commit.sql" <<'SQL'
BEGIN;
CREATE OR REPLACE FUNCTION public.fake_world_commit(sid uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $q$
DECLARE changed integer;
BEGIN
 UPDATE public.fake_world_tokens t SET step=s.staged_step
 FROM public.fake_world_sessions s
 WHERE s.session_id=sid
   AND s.actor_id=public.fake_world_uid()
   AND s.token_id=t.token_id
   AND s.campaign_id=t.campaign_id
   AND (public.fake_world_can_view(s.campaign_id) OR s.staged_step>0);
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END
$q$;
SET LOCAL ROLE authenticated;
SET LOCAL app.fake_world_uid='00000000-0000-4000-8000-000000000911';
DO $t$
BEGIN
 IF NOT public.fake_world_commit('00000000-0000-4000-8000-000000000931'::uuid)
 THEN RAISE EXCEPTION 'fictional unsafe commit was not reproduced'; END IF;
END $t$;
-- Return from the fabricated authenticated role to disposable postgres so
-- the fixture can inspect token data without granting direct table SELECT.
RESET ROLE;
DO $t$
DECLARE moved integer;
BEGIN
 SELECT step INTO moved FROM public.fake_world_tokens
 WHERE token_id='00000000-0000-4000-8000-000000000921'::uuid;
 IF moved!=2 THEN RAISE EXCEPTION 'unsafe state not modified'; END IF;
END $t$;
ROLLBACK;
SQL
psql -X -q -v ON_ERROR_STOP=1 -f "$scratch/unsafe-commit.sql" > "$scratch/negative.log"
[[ "$(actor "$player" "SELECT public.fake_world_commit('$player_session'::uuid);")" == "f" ]] ||
 fail "unsafe synthetic commit survived transaction rollback"
[[ "$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c "
 SELECT step FROM public.fake_world_tokens WHERE token_id='$token'::uuid;")" == "0" ]] ||
 fail "unsafe fake token state survived rollback"
[[ "$(persist "$player" "SELECT public.fake_world_cancel('$player_session'::uuid);")" == "t" ]] ||
 fail "revoked player cannot cancel only their own pending movement"
[[ "$(actor "$player" "SELECT public.fake_world_cancel('$player_session'::uuid);")" == "f" ]] ||
 fail "session cleanup not idempotent"
[[ "$(persist "$dm" "SELECT public.fake_world_begin('$campaign'::uuid,'$token'::uuid,'$dm_session'::uuid);")" == "t" ]] ||
 fail "current DM cannot begin after another player revoked"
[[ "$(persist "$dm" "SELECT public.fake_world_advance('$dm_session'::uuid,3);")" == "t" ]] ||
 fail "current DM cannot advance"
[[ "$(persist "$dm" "SELECT public.fake_world_commit('$dm_session'::uuid);")" == "t" ]] ||
 fail "current DM cannot commit"
[[ "$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c "
 SELECT step FROM public.fake_world_tokens WHERE token_id='$token'::uuid;")" == "3" ]] ||
 fail "legitimate current DM commit not applied"
echo "R209 DISPOSABLE PG17 PASS: revoked actor can stage own session but cannot commit final token; own cancellation preserved, cross actor/campaign denied, deliberately unsafe OR reverted by ROLLBACK."
echo "R209 HOSTED NO_GO: fictional functions/roles, NOT source-exact original phases or signed actor acceptance."
