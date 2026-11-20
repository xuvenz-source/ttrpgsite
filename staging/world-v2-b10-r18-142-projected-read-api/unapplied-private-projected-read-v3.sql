-- B10-R18-142 SOURCE-ONLY; NOT A MIGRATION, NEVER APPLY TO HOSTED.
-- Parent R141 draft PR #249. Prereqs: R125/R126/R128/R132/R136/R138/R140.
-- Four narrow, read-only candidate projections. Four private definers, four
-- exposed INVOKER stubs. All EIGHT functions EXECUTE-revoked.
-- R128 public schema freeze, R132 maintenance gate and signed topic are hard
-- preconditions. No grants or browser runtime changes, and no rollout.
BEGIN;
DO $r142_preflight$
DECLARE n integer;
BEGIN
 IF pg_catalog.has_schema_privilege('authenticated','public','USAGE') OR
    pg_catalog.has_schema_privilege('anon','public','USAGE')
 THEN RAISE EXCEPTION 'R142 R128 public freeze absent';END IF;
 IF pg_catalog.to_regprocedure('forge_scene_drain.scene_v3_publish_allowed()') IS NULL
 OR pg_catalog.to_regprocedure('public.get_authorized_scene_channel_v3(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('forge_v3_api.get_authorized_world_navigation_v3(uuid,text,uuid)') IS NULL
 OR pg_catalog.to_regprocedure('forge_v3_internal.get_authorized_world_preview_v3(uuid,uuid)') IS NULL
 OR pg_catalog.to_regprocedure('public.can_view_campaign_map(uuid,uuid)') IS NULL
 OR pg_catalog.to_regprocedure('public.is_campaign_member(uuid)') IS NULL
 OR pg_catalog.to_regprocedure('public.is_campaign_dm(uuid)') IS NULL
 THEN RAISE EXCEPTION 'R142 inherited isolated API or actor authority missing';END IF;
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_api';
 IF n<>13 THEN RAISE EXCEPTION 'R142 expects 13 inherited V3 API routines';END IF;
 SELECT count(*) INTO n FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='forge_v3_internal';
 IF n<>13 THEN RAISE EXCEPTION 'R142 expects 13 inherited V3 private routines';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname IN ('forge_v3_api','forge_v3_internal')
   AND p.proname<>'get_authorized_scene_channel_v3'
   AND (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') OR
        pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')))
 THEN RAISE EXCEPTION 'R142 existing experimental gameplay privilege leak';END IF;
 -- Catalog checks protect both schema and expected original column types.
 IF NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_attribute a
   WHERE a.attrelid='public.characters'::regclass
     AND a.attname='field_values' AND a.atttypid='jsonb'::regtype)
 OR NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_attribute a
   WHERE a.attrelid='public.campaign_handouts'::regclass
     AND a.attname='body' AND a.atttypid='text'::regtype)
 OR NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_attribute a
   WHERE a.attrelid='public.campaign_tool_issues'::regclass
     AND a.attname='config' AND a.atttypid='jsonb'::regtype)
 OR NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_attribute a
   WHERE a.attrelid='public.battle_maps'::regclass
     AND a.attname='grid_size' AND a.atttypid='integer'::regtype)
 THEN RAISE EXCEPTION 'R142 source table projected columns/types drifted';END IF;
END $r142_preflight$;

-- Character full field_values can only go to its current owner or DM.
-- Never return portrait_path, token_path or a generalized characters row.
CREATE FUNCTION forge_v3_internal.get_authorized_character_sheet_v3(
 p_character uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r142_character$
DECLARE actor uuid:=auth.uid();item record;
BEGIN
 IF actor IS NULL OR p_character IS NULL OR
    NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 SELECT c.id,c.campaign_id,c.user_id,c.name,c.field_values,c.updated_at
 INTO item FROM public.characters c WHERE c.id=p_character;
 IF NOT FOUND OR NOT public.is_campaign_member(item.campaign_id) OR
    (item.user_id IS DISTINCT FROM actor AND
     NOT public.is_campaign_dm(item.campaign_id))
 THEN RETURN NULL;END IF;
 -- Existing campaign RLS allows owner/DM. Explicit actor check is essential
 -- because the private definer may bypass RLS.
 RETURN pg_catalog.jsonb_build_object(
  'version',3,'scope','private-sheet','id',item.id,
  'campaignId',item.campaign_id,'userId',item.user_id,
  'name',pg_catalog.left(item.name,120),
  'fieldValues',coalesce(item.field_values,'{}'::jsonb),
  'updatedAt',item.updated_at);
END $r142_character$;
REVOKE ALL ON FUNCTION
 forge_v3_internal.get_authorized_character_sheet_v3(uuid)
 FROM PUBLIC,anon,authenticated;

-- Handout: DM, revealed to current member, or exposed via a VISIBLE pin on
-- a map the signed member is currently assigned. Hidden pin never enough.
CREATE FUNCTION forge_v3_internal.get_authorized_handout_v3(
 p_handout uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r142_handout$
DECLARE actor uuid:=auth.uid();item record;is_dm boolean;exposed boolean;
BEGIN
 IF actor IS NULL OR p_handout IS NULL OR
    NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 SELECT h.id,h.campaign_id,h.title,h.body,h.revealed,
        h.collected,h.updated_at
 INTO item FROM public.campaign_handouts h WHERE h.id=p_handout;
 IF NOT FOUND OR NOT public.is_campaign_member(item.campaign_id)
 THEN RETURN NULL;END IF;
 is_dm:=public.is_campaign_dm(item.campaign_id);
 exposed:=FALSE;
 IF NOT is_dm AND item.revealed IS DISTINCT FROM TRUE THEN
  SELECT EXISTS(SELECT 1 FROM public.campaign_map_pins pin
   WHERE pin.handout_id=item.id AND pin.campaign_id=item.campaign_id
     AND pin.visible IS TRUE
     AND public.can_view_campaign_map(pin.campaign_id,pin.map_id))
    INTO exposed;
 END IF;
 IF NOT is_dm AND item.revealed IS DISTINCT FROM TRUE AND NOT exposed
 THEN RETURN NULL;END IF;
 RETURN pg_catalog.jsonb_build_object(
  'version',3,
  'scope',CASE WHEN is_dm THEN 'dm' WHEN item.revealed THEN 'revealed'
               ELSE 'visible-pin' END,
  'id',item.id,'campaignId',item.campaign_id,
  'title',pg_catalog.left(item.title,200),'body',item.body,
  'revealed',item.revealed,'collected',item.collected,
  'updatedAt',item.updated_at);
END $r142_handout$;
REVOKE ALL ON FUNCTION
 forge_v3_internal.get_authorized_handout_v3(uuid)
 FROM PUBLIC,anon,authenticated;

-- Tool owner/DM can get PRIVATE config/state; party-shared third parties
-- receive only bounded public descriptor (never private config, state,
-- location, held-by token, template ID, sender or hidden geometry).
CREATE FUNCTION forge_v3_internal.get_authorized_tool_issue_v3(
 p_issue uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r142_tool$
DECLARE actor uuid:=auth.uid();item record;is_dm boolean;is_owner boolean;
 result jsonb;
BEGIN
 IF actor IS NULL OR p_issue IS NULL OR
    NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 SELECT t.id,t.campaign_id,t.owner_id,t.party_shared,t.map_id,
 t.name,t.kind,t.icon,t.revision,t.config,t.state
 INTO item FROM public.campaign_tool_issues t WHERE t.id=p_issue;
 IF NOT FOUND OR NOT public.is_campaign_member(item.campaign_id)
 THEN RETURN NULL;END IF;
 is_dm:=public.is_campaign_dm(item.campaign_id);
 is_owner:=item.owner_id IS NOT DISTINCT FROM actor;
 IF NOT is_dm AND NOT is_owner AND item.party_shared IS DISTINCT FROM TRUE
 THEN RETURN NULL;END IF;
 -- A mapped tool is not disclosed to a player assigned to another map,
 -- even when party_shared. DMs retain editor-level campaign access.
 IF NOT is_dm AND item.map_id IS NOT NULL AND
    NOT public.can_view_campaign_map(item.campaign_id,item.map_id)
 THEN RETURN NULL;END IF;
 result:=pg_catalog.jsonb_build_object(
  'version',3,'scope',CASE WHEN is_dm THEN 'dm'
    WHEN is_owner THEN 'owner' ELSE 'shared' END,
  'id',item.id,'campaignId',item.campaign_id,
  'name',pg_catalog.left(item.name,120),'kind',item.kind,
  'icon',item.icon,'partyShared',item.party_shared,'revision',item.revision);
 IF is_dm OR is_owner THEN
  result:=result||pg_catalog.jsonb_build_object(
   'config',coalesce(item.config,'{}'::jsonb),
   'state',coalesce(item.state,'{}'::jsonb));
 END IF;
 RETURN result;
END $r142_tool$;
REVOKE ALL ON FUNCTION
 forge_v3_internal.get_authorized_tool_issue_v3(uuid)
 FROM PUBLIC,anon,authenticated;

-- Map metadata is deliberately NOT map image path, unpublished environment,
-- grid collision geometry, private lights, map-owner token roster, etc.
CREATE FUNCTION forge_v3_internal.get_authorized_map_metadata_v3(
 p_map uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $r142_map$
DECLARE actor uuid:=auth.uid();topic text;item record;
BEGIN
 IF actor IS NULL OR p_map IS NULL OR
    NOT forge_scene_drain.scene_v3_publish_allowed()
 THEN RETURN NULL;END IF;
 SELECT m.id,m.campaign_id,m.name,m.width,m.height,m.grid_size
 INTO item FROM public.battle_maps m WHERE m.id=p_map;
 IF NOT FOUND OR NOT public.can_view_campaign_map(item.campaign_id,p_map) OR
   item.grid_size IS NULL OR item.grid_size<=0 OR
   item.width IS NULL OR item.width<1 OR
   item.height IS NULL OR item.height<1
 THEN RETURN NULL;END IF;
 -- A current server-issued V3 scene recipient epoch is mandatory;
 -- a browser's remembered protocol flag can never substitute.
 topic:=public.get_authorized_scene_channel_v3(p_map);
 IF topic IS NULL OR topic NOT LIKE
  'forge-world-scene-v3:'||p_map::text||':'||actor::text||':%'
 THEN RETURN NULL;END IF;
 RETURN pg_catalog.jsonb_build_object(
  'version',3,'scope','map-metadata','id',item.id,
  'campaignId',item.campaign_id,'name',pg_catalog.left(item.name,120),
  'width',item.width,'height',item.height,'gridSize',item.grid_size);
END $r142_map$;
REVOKE ALL ON FUNCTION
 forge_v3_internal.get_authorized_map_metadata_v3(uuid)
 FROM PUBLIC,anon,authenticated;

-- Zero browser grants. Every exposed-schema API is an ungranted INVOKER;
-- all privileged implementations reside in a non-exposed private schema.
CREATE FUNCTION forge_v3_api.get_authorized_character_sheet_v3(
 p_character uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r142_api$ SELECT forge_v3_internal.get_authorized_character_sheet_v3(p_character) $r142_api$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_character_sheet_v3(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.get_authorized_handout_v3(p_handout uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r142_api$ SELECT forge_v3_internal.get_authorized_handout_v3(p_handout) $r142_api$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_handout_v3(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.get_authorized_tool_issue_v3(p_issue uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r142_api$ SELECT forge_v3_internal.get_authorized_tool_issue_v3(p_issue) $r142_api$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_tool_issue_v3(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION forge_v3_api.get_authorized_map_metadata_v3(p_map uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $r142_api$ SELECT forge_v3_internal.get_authorized_map_metadata_v3(p_map) $r142_api$;
REVOKE ALL ON FUNCTION forge_v3_api.get_authorized_map_metadata_v3(uuid)
 FROM PUBLIC,anon,authenticated;

DO $r142_postflight$
DECLARE api_count integer;internal_count integer;
BEGIN
 SELECT count(*) INTO api_count FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_api';
 SELECT count(*) INTO internal_count FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_internal';
 IF api_count<>17 OR internal_count<>17
 THEN RAISE EXCEPTION 'R142 exactly 17 plus 17 closed V3 routines required';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_api' AND (
  p.prosecdef OR
  (p.proname<>'get_authorized_scene_channel_v3' AND (
   pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') OR
   pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')))))
 THEN RAISE EXCEPTION 'R142 private data API definer or grant leaked';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='forge_v3_internal' AND (
  NOT p.prosecdef OR
  (p.proname<>'get_authorized_scene_channel_v3' AND (
   pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') OR
   pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')))))
 THEN RAISE EXCEPTION 'R142 privileged private routine EXECUTE leaked';END IF;
 IF pg_catalog.has_table_privilege('authenticated','public.map_tokens','SELECT') OR
    pg_catalog.has_schema_privilege('authenticated','public','USAGE')
 THEN RAISE EXCEPTION 'R142 raw V2 token/public schema exposure';END IF;
END $r142_postflight$;
COMMIT;
-- NO_GO: no hosted database execution, no browser access, no production rollout.
-- Actual Supabase Auth/RLS, original 83 migrations, multi-user permissions,
-- Realtime old sockets, Storage signed bearer and free-tier latency still require QA.
