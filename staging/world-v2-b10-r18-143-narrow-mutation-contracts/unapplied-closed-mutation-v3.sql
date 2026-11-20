-- B10-R18-143: SOURCE-ONLY, UNAPPLIED, NEVER ON HOSTED SUPABASE.
-- Parent R142 #250 at 282927baca1f11014cfc03d10524546ea203f299.
-- Three explicit mutating operations; no generic action/SQL router.
-- Three private SECURITY DEFINER helpers plus three API SECURITY INVOKER
-- forwarders. ALL SIX EXECUTE-REVOKED from browser roles. No grants.
-- Original V2 mutation and trigger semantics are authoritative.
BEGIN;
DO $r143_preflight$
DECLARE api_count integer;internal_count integer;
BEGIN
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE') OR
    pg_catalog.has_schema_privilege('anon','public','USAGE')
 THEN RAISE EXCEPTION 'R143 R128 legacy schema fence absent';END IF;
 IF pg_catalog.to_regprocedure('forge_scene_drain.scene_v3_publish_allowed()') IS NULL
 OR pg_catalog.to_regprocedure('public.can_edit_campaign_sheet(uuid,text,uuid)') IS NULL
 OR pg_catalog.to_regprocedure('public.patch_campaign_sheet_noninventory(uuid,text,uuid,jsonb,jsonb)') IS NULL
 OR pg_catalog.to_regprocedure('public.collect_campaign_map_pin(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('public.can_view_campaign_map(uuid,uuid)') IS NULL
 OR pg_catalog.to_regprocedure('public.is_campaign_member(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('public.is_campaign_dm(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('forge_v3_api.get_authorized_character_sheet_v3(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('forge_v3_internal.get_authorized_handout_v3(uuid)') IS NULL
 THEN RAISE EXCEPTION 'R143 original scoped mutations / inherited V3 API absent';END IF;
 SELECT count(*) INTO api_count FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_api';
 SELECT count(*) INTO internal_count FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_internal';
 IF api_count<>17 OR internal_count<>17
 THEN RAISE EXCEPTION 'R143 requires exact 17+17 inherited deny state';END IF;
 IF EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('forge_v3_api','forge_v3_internal')
  AND p.proname<>'get_authorized_scene_channel_v3'
  AND (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
   OR pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'))
 ) THEN RAISE EXCEPTION 'R143 inherited experimental API leaked EXECUTE';END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
 WHERE a.attrelid='public.characters'::regclass AND a.attname='updated_at'
 AND a.atttypid='timestamp with time zone'::regtype)
 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
 WHERE a.attrelid='public.campaign_handouts'::regclass AND a.attname='updated_at'
 AND a.atttypid='timestamp with time zone'::regtype)
 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
 WHERE a.attrelid='public.campaign_map_pins'::regclass AND a.attname='collectable'
 AND a.atttypid='boolean'::regtype)
 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
 WHERE a.attrelid='public.campaigns'::regclass AND a.attname='sheet_template'
 AND a.atttypid='jsonb'::regtype)
 THEN RAISE EXCEPTION 'R143 original revision, collectible or template columns drifted';END IF;
END $r143_preflight$;

-- Signed owner/DM only; allow only non-inventory template field IDs.
-- The original patch function performs all V2 sheet validation/mutation.
-- Row lock plus exact expected updated_at prevents stale writes.
-- Return a sanitized receipt, NEVER the original full to_jsonb(row).
CREATE FUNCTION forge_v3_internal.patch_authorized_character_v3(
 p_character uuid,p_values jsonb,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r143_character$
DECLARE actor uuid:=auth.uid();item record;template jsonb;
 updated jsonb;keys jsonb;field_count integer;
BEGIN
 IF actor IS NULL OR p_character IS NULL OR p_expected_updated_at IS NULL
 OR p_values IS NULL OR pg_catalog.jsonb_typeof(p_values)<>'object'
 OR pg_catalog.octet_length(p_values::text)>16384
 OR NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 SELECT count(*) INTO field_count FROM pg_catalog.jsonb_object_keys(p_values) k;
 IF field_count NOT BETWEEN 1 AND 32 THEN RETURN NULL;END IF;
 SELECT c.id,c.campaign_id,c.user_id,c.updated_at INTO item
 FROM public.characters c WHERE c.id=p_character FOR UPDATE;
 IF NOT FOUND OR item.updated_at IS DISTINCT FROM p_expected_updated_at
 OR NOT public.is_campaign_member(item.campaign_id) OR
 (item.user_id IS DISTINCT FROM actor AND NOT public.is_campaign_dm(item.campaign_id))
 OR NOT public.can_edit_campaign_sheet(item.campaign_id,'character',p_character)
 THEN RETURN NULL;END IF;
 SELECT c.sheet_template INTO template FROM public.campaigns c
 WHERE c.id=item.campaign_id;
 IF template IS NULL OR pg_catalog.jsonb_typeof(template->'tabs')<>'array'
 THEN RETURN NULL;END IF;
 IF EXISTS (
  SELECT 1 FROM pg_catalog.jsonb_object_keys(p_values) AS k(field_id)
  WHERE NOT EXISTS (
   SELECT 1 FROM pg_catalog.jsonb_array_elements(template->'tabs') AS t(tab)
   CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
    coalesce(t.tab->'fields','[]'::jsonb)) AS f(field)
   WHERE f.field->>'id'=k.field_id AND
         f.field->>'type' IS DISTINCT FROM 'inventory' AND
         nullif(f.field->>'type','') IS NOT NULL
  )
 ) THEN RETURN NULL;END IF;
 -- Strictly empty metadata object disallows art path, ownership, name and
 -- NPC bar changes, and the original function strips inventory fields.
 updated:=public.patch_campaign_sheet_noninventory(
  item.campaign_id,'character',p_character,p_values,'{}'::jsonb);
 IF pg_catalog.jsonb_typeof(updated)<>'object' OR
    updated->>'id' IS DISTINCT FROM item.id::text OR
    updated->>'campaign_id' IS DISTINCT FROM item.campaign_id::text OR
    updated->>'user_id' IS DISTINCT FROM item.user_id::text OR
    pg_catalog.jsonb_typeof(updated->'field_values')<>'object' OR
    updated->>'updated_at' IS NULL
 THEN RAISE EXCEPTION 'R143 original sheet patch returned invalid revision';END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(k.field_id ORDER BY k.field_id),'[]'::jsonb)
 INTO keys FROM pg_catalog.jsonb_object_keys(p_values) AS k(field_id);
 RETURN pg_catalog.jsonb_build_object(
  'version',3,'result','patched','id',item.id,
  'campaignId',item.campaign_id,'changedKeys',keys,
  'updatedAt',updated->>'updated_at');
END $r143_character$;
REVOKE ALL ON FUNCTION
 forge_v3_internal.patch_authorized_character_v3(uuid,jsonb,timestamptz)
 FROM PUBLIC,anon,authenticated;

-- DM authoring uses the ORIGINAL campaign_handouts table and its
-- validate/tick/hide-pins triggers; no exposure of folder, map or pin edits.
-- Exact updated_at is an optimistic concurrency precondition.
CREATE FUNCTION forge_v3_internal.edit_authorized_handout_v3(
 p_handout uuid,p_title text,p_body text,p_revealed boolean,
 p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r143_handout$
DECLARE actor uuid:=auth.uid();item record;changed record;
BEGIN
 IF actor IS NULL OR p_handout IS NULL OR p_expected_updated_at IS NULL
 OR p_title IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_title)) NOT BETWEEN 1 AND 160
 OR p_body IS NULL OR pg_catalog.octet_length(p_body)>16000 OR
 p_revealed IS NULL OR NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 SELECT h.id,h.campaign_id,h.updated_at INTO item
 FROM public.campaign_handouts h WHERE h.id=p_handout FOR UPDATE;
 IF NOT FOUND OR item.updated_at IS DISTINCT FROM p_expected_updated_at
 OR NOT public.is_campaign_dm(item.campaign_id)
 THEN RETURN NULL;END IF;
 -- Original BEFORE validation touches updated_at; AFTER triggers
 -- publish revision and conceal pinned notes on reveal->hidden.
 UPDATE public.campaign_handouts h SET
  title=pg_catalog.btrim(p_title),body=p_body,revealed=p_revealed
 WHERE h.id=item.id AND h.campaign_id=item.campaign_id
 RETURNING h.id,h.campaign_id,h.updated_at,h.revealed INTO changed;
 IF NOT FOUND OR changed.id IS DISTINCT FROM item.id
 THEN RAISE EXCEPTION 'R143 handout edit failed atomic identity check';END IF;
 RETURN pg_catalog.jsonb_build_object(
  'version',3,'result','edited','id',changed.id,
  'campaignId',changed.campaign_id,
  'revealed',changed.revealed,'updatedAt',changed.updated_at);
END $r143_handout$;
REVOKE ALL ON FUNCTION
 forge_v3_internal.edit_authorized_handout_v3(uuid,text,text,boolean,timestamptz)
 FROM PUBLIC,anon,authenticated;

-- Original collect_campaign_map_pin() keeps the visibility/collectability,
-- signed campaign/map checks and atomic reveal trigger chain.
-- FOR UPDATE pins the verified pin while the legacy scoped RPC executes.
CREATE FUNCTION forge_v3_internal.collect_authorized_pin_v3(p_pin uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r143_collect$
DECLARE actor uuid:=auth.uid();item record;collected uuid;
BEGIN
 IF actor IS NULL OR p_pin IS NULL
 OR NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 SELECT p.id,p.campaign_id,p.map_id,p.handout_id,p.visible,p.collectable
 INTO item FROM public.campaign_map_pins p WHERE p.id=p_pin FOR UPDATE;
 IF NOT FOUND OR item.visible IS DISTINCT FROM TRUE
 OR item.collectable IS DISTINCT FROM TRUE
 OR item.handout_id IS NULL
 OR NOT public.is_campaign_member(item.campaign_id)
 OR NOT public.can_view_campaign_map(item.campaign_id,item.map_id)
 THEN RETURN NULL;END IF;
 collected:=public.collect_campaign_map_pin(p_pin);
 IF collected IS DISTINCT FROM item.handout_id
 THEN RAISE EXCEPTION 'R143 original collectible returned unexpected handout';END IF;
 RETURN pg_catalog.jsonb_build_object(
  'version',3,'result','collected','handoutId',collected);
END $r143_collect$;
REVOKE ALL ON FUNCTION forge_v3_internal.collect_authorized_pin_v3(uuid)
 FROM PUBLIC,anon,authenticated;

-- No new browser grant. Public-surface functions remain SECURITY INVOKER.
CREATE FUNCTION forge_v3_api.patch_authorized_character_v3(
 p_character uuid,p_values jsonb,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r143_api$
 SELECT forge_v3_internal.patch_authorized_character_v3(
 p_character,p_values,p_expected_updated_at)
$r143_api$;
REVOKE ALL ON FUNCTION forge_v3_api.patch_authorized_character_v3(uuid,jsonb,timestamptz)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.edit_authorized_handout_v3(
 p_handout uuid,p_title text,p_body text,p_revealed boolean,
 p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r143_api$
 SELECT forge_v3_internal.edit_authorized_handout_v3(
 p_handout,p_title,p_body,p_revealed,p_expected_updated_at)
$r143_api$;
REVOKE ALL ON FUNCTION forge_v3_api.edit_authorized_handout_v3(uuid,text,text,boolean,timestamptz)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.collect_authorized_pin_v3(p_pin uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r143_api$
 SELECT forge_v3_internal.collect_authorized_pin_v3(p_pin)
$r143_api$;
REVOKE ALL ON FUNCTION forge_v3_api.collect_authorized_pin_v3(uuid)
 FROM PUBLIC,anon,authenticated;

DO $r143_postflight$
DECLARE a integer;i integer;
BEGIN
 SELECT count(*) INTO a FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_api';
 SELECT count(*) INTO i FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_internal';
 IF a<>20 OR i<>20
 THEN RAISE EXCEPTION 'R143 requires exactly 20 private + 20 API functions';END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='forge_v3_api' AND (
   p.prosecdef OR (p.proname<>'get_authorized_scene_channel_v3' AND
    (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') OR
     pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')))))
 THEN RAISE EXCEPTION 'R143 V3 browser mutation API privilege leak';END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='forge_v3_internal' AND (
   NOT p.prosecdef OR (p.proname<>'get_authorized_scene_channel_v3' AND
   (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') OR
    pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')))))
 THEN RAISE EXCEPTION 'R143 private mutation function privilege leak';END IF;
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE')
 OR pg_catalog.has_table_privilege('authenticated','public.map_tokens','SELECT')
 THEN RAISE EXCEPTION 'R143 original unsafe API/schema re-opened';END IF;
END $r143_postflight$;
COMMIT;
-- NO_GO: original 83-migration signed QA, old socket revocation, R127
-- human release approval, 67 public definers and Storage bearer URLs unresolved.
