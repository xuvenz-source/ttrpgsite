-- B10-R18-143 synthetic original-function fixtures ONLY.
-- Must follow the fully disposable R142 PG17 runner. No original data.
\set ON_ERROR_STOP on
BEGIN;
-- R142 deliberately revoked P1 in its synthetic terminal test.
INSERT INTO public.campaign_members(campaign_id,user_id,role)
 VALUES('00000000-0000-4000-8000-000000000101',
 '00000000-0000-4000-8000-000000000303','player')
 ON CONFLICT DO NOTHING;

ALTER TABLE public.campaigns ADD COLUMN sheet_template jsonb;
UPDATE public.campaigns SET sheet_template=
 '{"tabs":[{"fields":[{"id":"hp","type":"number"},
 {"id":"notes","type":"text"},{"id":"inventory","type":"inventory"}]}]}'::jsonb;

ALTER TABLE public.campaign_map_pins ADD COLUMN collectable boolean NOT NULL DEFAULT false;
UPDATE public.campaign_map_pins SET collectable=true
 WHERE id IN ('00000000-0000-4000-8000-000000000611',
              '00000000-0000-4000-8000-000000000612',
              '00000000-0000-4000-8000-000000000613');
-- DM can reveal then hide a handout with an existing pin.
INSERT INTO public.campaign_map_pins(id,campaign_id,map_id,handout_id,visible,collectable)
 VALUES('00000000-0000-4000-8000-000000000614',
        '00000000-0000-4000-8000-000000000101',
        '00000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000602',true,true);

CREATE FUNCTION r140_fiction.r143_touch_character() RETURNS trigger
 LANGUAGE plpgsql SET search_path=''
AS $fixture$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR
    NEW.campaign_id IS DISTINCT FROM OLD.campaign_id OR
    NEW.user_id IS DISTINCT FROM OLD.user_id
 THEN RAISE EXCEPTION 'Synthetic character identity immutable';END IF;
 NEW.updated_at:=pg_catalog.now();
 RETURN NEW;
END $fixture$;
CREATE TRIGGER r143_character_touch BEFORE UPDATE ON public.characters
 FOR EACH ROW EXECUTE FUNCTION r140_fiction.r143_touch_character();

CREATE FUNCTION r140_fiction.r143_validate_handout() RETURNS trigger
 LANGUAGE plpgsql SET search_path=''
AS $fixture$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR
    NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
 THEN RAISE EXCEPTION 'Synthetic handout identity immutable';END IF;
 NEW.updated_at:=pg_catalog.now();
 RETURN NEW;
END $fixture$;
CREATE TRIGGER r143_handout_validate BEFORE UPDATE ON public.campaign_handouts
 FOR EACH ROW EXECUTE FUNCTION r140_fiction.r143_validate_handout();

CREATE FUNCTION r140_fiction.r143_hide_handout_pins() RETURNS trigger
 LANGUAGE plpgsql SET search_path=''
AS $fixture$
BEGIN
 IF OLD.revealed AND NOT NEW.revealed THEN
  UPDATE public.campaign_map_pins SET visible=false
  WHERE handout_id=NEW.id AND visible;
 END IF;
 RETURN NEW;
END $fixture$;
CREATE TRIGGER r143_hide_handout_pins AFTER UPDATE OF revealed
 ON public.campaign_handouts FOR EACH ROW
 EXECUTE FUNCTION r140_fiction.r143_hide_handout_pins();

CREATE FUNCTION public.can_edit_campaign_sheet(
 p_campaign uuid,p_source text,p_source_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fixture$
 SELECT auth.uid() IS NOT NULL AND p_source='character' AND EXISTS(
  SELECT 1 FROM public.characters c
  WHERE c.id=p_source_id AND c.campaign_id=p_campaign
  AND (c.user_id=auth.uid() OR public.is_campaign_dm(p_campaign))
 )
$fixture$;
REVOKE ALL ON FUNCTION public.can_edit_campaign_sheet(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;

-- Synthetic equivalent of V2's character branch including full-row return
-- to test that new R143 projection NEVER passes it through to the browser.
CREATE FUNCTION public.patch_campaign_sheet_noninventory(
 p_campaign uuid,p_source text,p_source_id uuid,p_values jsonb,p_meta jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fixture$
DECLARE value jsonb;
BEGIN
 IF NOT public.can_edit_campaign_sheet(p_campaign,p_source,p_source_id)
 THEN RAISE EXCEPTION 'Mock unauthorized sheet patch';END IF;
 IF pg_catalog.jsonb_typeof(p_values)<>'object'
 OR pg_catalog.jsonb_typeof(p_meta)<>'object' OR p_meta <> '{}'::jsonb
 THEN RAISE EXCEPTION 'Mock malformed sheet patch';END IF;
 UPDATE public.characters c SET
  field_values=coalesce(c.field_values,'{}'::jsonb)
   || (p_values - ARRAY['inventory']::text[])
 WHERE c.id=p_source_id AND c.campaign_id=p_campaign
 RETURNING pg_catalog.to_jsonb(c) INTO value;
 IF value IS NULL THEN RAISE EXCEPTION 'Mock character missing';END IF;
 RETURN value;
END $fixture$;
REVOKE ALL ON FUNCTION
 public.patch_campaign_sheet_noninventory(uuid,text,uuid,jsonb,jsonb)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.collect_campaign_map_pin(p_pin uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fixture$
DECLARE item record;viewer uuid:=auth.uid();
BEGIN
 IF viewer IS NULL THEN RAISE EXCEPTION 'Mock sign in first';END IF;
 SELECT p.id,p.handout_id,p.campaign_id,p.map_id,p.visible,p.collectable
 INTO item FROM public.campaign_map_pins p WHERE p.id=p_pin FOR UPDATE;
 IF NOT FOUND OR NOT item.visible OR NOT item.collectable
 THEN RAISE EXCEPTION 'Mock note is not collectable';END IF;
 IF NOT public.is_campaign_member(item.campaign_id)
 OR NOT public.can_view_campaign_map(item.campaign_id,item.map_id)
 THEN RAISE EXCEPTION 'Mock no current map rights';END IF;
 UPDATE public.campaign_handouts h SET collected=true,revealed=true
 WHERE h.id=item.handout_id AND h.campaign_id=item.campaign_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mock note missing';END IF;
 RETURN item.handout_id;
END $fixture$;
REVOKE ALL ON FUNCTION public.collect_campaign_map_pin(uuid)
 FROM PUBLIC,anon,authenticated;
COMMIT;
