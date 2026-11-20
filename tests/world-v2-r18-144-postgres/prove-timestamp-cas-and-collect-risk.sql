-- B10-R18-144: intentionally demonstrates R143 candidate risk in fictional PG17.
-- Must run ONLY after R143 disposable fixture runner, never hosted.
\set ON_ERROR_STOP on
BEGIN;
-- R143 ended fenced and revoked P1. Restore only in this disposable rollback.
INSERT INTO public.campaign_members(campaign_id,user_id,role)
VALUES('00000000-0000-4000-8000-000000000101',
       '00000000-0000-4000-8000-000000000303','player')
ON CONFLICT DO NOTHING;
UPDATE forge_scene_drain.scene_publication_gate SET mode='v3-only'
WHERE singleton=true;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-000000000303',true);

-- Original handout bump trigger is absent from fictional R143 fixture.
-- This additional synthetic AFTER UPDATE counter shows *why* a repeated
-- legacy update could produce repeated events; not proof of live event count.
CREATE TABLE r140_fiction.r144_update_count(
 handout_id uuid PRIMARY KEY, updates integer NOT NULL DEFAULT 0
);
CREATE FUNCTION r140_fiction.r144_count_handout_update()
RETURNS trigger LANGUAGE plpgsql VOLATILE SET search_path=''
AS $f$
BEGIN
 INSERT INTO r140_fiction.r144_update_count(handout_id,updates)
 VALUES(NEW.id,1)
 ON CONFLICT(handout_id) DO UPDATE
  SET updates=r144_update_count.updates+1;
 RETURN NEW;
END $f$;
CREATE TRIGGER r144_count_repeated_collect
AFTER UPDATE ON public.campaign_handouts FOR EACH ROW
EXECUTE FUNCTION r140_fiction.r144_count_handout_update();

DO $r144_same_transaction$
DECLARE character_id uuid:='00000000-0000-4000-8000-000000000501';
 previous timestamptz;first_response jsonb;second_response jsonb;
 third_response jsonb;stamp timestamptz;
BEGIN
 SELECT updated_at INTO previous FROM public.characters WHERE id=character_id;
 first_response:=forge_v3_api.patch_authorized_character_v3(
  character_id,'{"hp":41}'::jsonb,previous);
 IF first_response->>'result' IS DISTINCT FROM 'patched'
 THEN RAISE EXCEPTION 'R144 synthetic first patch failed unexpectedly';END IF;
 stamp:=(first_response->>'updatedAt')::timestamptz;
 second_response:=forge_v3_api.patch_authorized_character_v3(
  character_id,'{"hp":42}'::jsonb,stamp);
 IF second_response->>'result' IS DISTINCT FROM 'patched'
 THEN RAISE EXCEPTION 'R144 second patch should succeed on fresh timestamp';END IF;
 -- BUG proof: client retaining the token from the FIRST response can still
 -- overwrite after SECOND edit because now() never changed during transaction.
 third_response:=forge_v3_api.patch_authorized_character_v3(
  character_id,'{"hp":43}'::jsonb,stamp);
 IF third_response->>'result' IS DISTINCT FROM 'patched' OR
    second_response->>'updatedAt' IS DISTINCT FROM first_response->>'updatedAt' OR
    third_response->>'updatedAt' IS DISTINCT FROM first_response->>'updatedAt' OR
    (SELECT field_values->>'hp' FROM public.characters WHERE
     id='00000000-0000-4000-8000-000000000501') IS DISTINCT FROM '43'
 THEN RAISE EXCEPTION 'R144 expected timestamp-only stale-CAS ambiguity not observed';END IF;
 RAISE NOTICE 'R144 CONFIRMED synthetic timestamp-CAS ambiguity: 3 patches share the same now() token';
END $r144_same_transaction$;

DO $r144_collect_twice$
DECLARE pin uuid:='00000000-0000-4000-8000-000000000611';
 note uuid:='00000000-0000-4000-8000-000000000603';
 first_response jsonb;second_response jsonb;ticks integer;
BEGIN
 first_response:=forge_v3_api.collect_authorized_pin_v3(pin);
 second_response:=forge_v3_api.collect_authorized_pin_v3(pin);
 SELECT updates INTO ticks FROM r140_fiction.r144_update_count
 WHERE handout_id=note;
 IF first_response->>'result' IS DISTINCT FROM 'collected' OR
    second_response->>'result' IS DISTINCT FROM 'collected' OR
    ticks IS DISTINCT FROM 2
 THEN RAISE EXCEPTION 'R144 expected duplicate synthetic handout update not observed';END IF;
 RAISE NOTICE 'R144 CONFIRMED fictional repeated collection writes twice: source revision tick risk';
END $r144_collect_twice$;
ROLLBACK;
\echo 'R144 RISK PROOF PASS: synthetic same-transaction now() stale CAS and repeated collection writes observed.'
\echo 'NO_GO: demonstrated risk is a blocker, NOT an approved design; original 83-migration triggers and real signed sessions were NOT executed.'
