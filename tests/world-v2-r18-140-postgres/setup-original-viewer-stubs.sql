-- B10-R18-140 synthetic PG17 only. Not original Supabase implementation.
-- Extends R138 fictional actor/map fixtures without touching production.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA r140_fiction;
REVOKE ALL ON SCHEMA r140_fiction FROM PUBLIC,anon,authenticated;
CREATE TABLE r140_fiction.preview_calls(
 actor uuid NOT NULL, viewer uuid NOT NULL,
 map_id uuid NOT NULL, virtual boolean NOT NULL
);
REVOKE ALL ON r140_fiction.preview_calls FROM PUBLIC,anon,authenticated;
CREATE TABLE public.map_tokens(
 id uuid PRIMARY KEY, map_id uuid NOT NULL,campaign_id uuid NOT NULL,
 owner_id uuid NOT NULL,visible boolean NOT NULL
);
CREATE TABLE public.campaign_tool_issues(
 id uuid PRIMARY KEY, map_id uuid NOT NULL,campaign_id uuid NOT NULL,
 owner_id uuid NOT NULL,party_shared boolean NOT NULL
);
REVOKE ALL ON public.map_tokens,public.campaign_tool_issues
 FROM PUBLIC,anon,authenticated;
INSERT INTO public.map_tokens VALUES
 ('00000000-0000-4000-8000-000000000404',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000303',true),
 ('00000000-0000-4000-8000-000000000405',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000302',true),
 ('00000000-0000-4000-8000-000000000406',
  '00000000-0000-4000-8000-000000000203',
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000304',true);
INSERT INTO public.campaign_tool_issues VALUES
 ('00000000-0000-4000-8000-000000000407',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000303',false);

CREATE FUNCTION public.is_campaign_dm(p_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $mock$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.campaign_members cm
  WHERE cm.user_id=auth.uid() AND cm.campaign_id=p_campaign AND cm.role='dm')
$mock$;
REVOKE ALL ON FUNCTION public.is_campaign_dm(uuid) FROM PUBLIC,anon,authenticated;

-- Preview source synthetic fixture checks DM and assigned viewer role.
-- Original source separately verifies LOS, fog, persistent exploration,
-- per-token width, ownership, map bounds and visibility.
CREATE FUNCTION public.preview_world_visibility_v2(p_map uuid,p_viewer uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $mock$
DECLARE actor uuid:=auth.uid();camp uuid;
BEGIN
 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm WHERE bm.id=p_map;
 IF actor IS NULL OR camp IS NULL OR NOT public.is_campaign_dm(camp) OR
  forge_world_v2.viewer_on_map(camp,p_map,p_viewer) IS DISTINCT FROM 'player'
 THEN RETURN NULL;END IF;
 INSERT INTO r140_fiction.preview_calls VALUES(actor,p_viewer,p_map,false);
 RETURN pg_catalog.jsonb_build_object(
  'version',2,'mapId',p_map,'viewerId',p_viewer,'scope','viewer',
  'visible','[1,2]'::jsonb,'explored','[1,2]'::jsonb,
  'visiblePieces','[]'::jsonb,'cursor',0);
END $mock$;
CREATE FUNCTION public.preview_world_visibility_at_v2(
 p_map uuid,p_viewer uuid,p_token uuid,p_x integer,p_y integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $mock$
DECLARE actor uuid:=auth.uid();camp uuid;
BEGIN
 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm WHERE bm.id=p_map;
 IF actor IS NULL OR camp IS NULL OR NOT public.is_campaign_dm(camp) OR
  forge_world_v2.viewer_on_map(camp,p_map,p_viewer) IS DISTINCT FROM 'player'
  OR p_x IS NULL OR p_y IS NULL OR p_x<0 OR p_y<0 OR p_x>9 OR p_y>9 OR
  NOT EXISTS(SELECT 1 FROM public.map_tokens t WHERE
   t.id=p_token AND t.map_id=p_map AND t.owner_id=p_viewer
   AND t.campaign_id=camp AND t.visible)
 THEN RETURN NULL;END IF;
 INSERT INTO r140_fiction.preview_calls VALUES(actor,p_viewer,p_map,true);
 RETURN pg_catalog.jsonb_build_object(
  'version',2,'mapId',p_map,'viewerId',p_viewer,'scope','viewer',
  'visible','[1,2,3]'::jsonb,'explored','[1,2]'::jsonb,
  'visiblePieces','[]'::jsonb,'cursor',0);
END $mock$;
REVOKE ALL ON FUNCTION
 public.preview_world_visibility_v2(uuid,uuid),
 public.preview_world_visibility_at_v2(uuid,uuid,uuid,integer,integer)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_authorized_map_fog_delta(
 p_map uuid,p_base_epoch uuid DEFAULT NULL,p_base_revision bigint DEFAULT NULL,
 p_base_sequence bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $mock$
DECLARE actor uuid:=auth.uid();camp uuid;
 epoch uuid:='00000000-0000-4000-8000-000000000700';
BEGIN
 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm WHERE bm.id=p_map;
 IF actor IS NULL OR camp IS NULL OR NOT public.can_view_campaign_map(camp,p_map)
 THEN RETURN NULL;END IF;
 IF p_base_epoch=epoch AND p_base_revision=5 AND p_base_sequence=1 THEN
  RETURN pg_catalog.jsonb_build_object(
   'mode','noop','deltaProtocolVersion',1,'protocolVersion',2,
   'mapId',p_map,'revision',5,'epoch',epoch,'sequence',1);
 END IF;
 IF p_base_epoch=epoch AND p_base_revision=4 AND p_base_sequence=0 THEN
  RETURN pg_catalog.jsonb_build_object(
   'mode','delta','deltaProtocolVersion',1,'protocolVersion',2,
   'mapId',p_map,'revision',5,'epoch',epoch,'sequence',1,
   'baseRevision',4,'baseSequence',0,
   'visibleAdd','[2]'::jsonb,'visibleRemove','[]'::jsonb,
   'exploredAdd','[2]'::jsonb,'exploredRemove','[]'::jsonb);
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'mode','snapshot','deltaProtocolVersion',1,'protocolVersion',2,
  'mapId',p_map,'revision',5,'epoch',epoch,'sequence',1,
  'width',10,'height',10,'enabled',true,'partyShared',false,
  'visible','[1,2]'::jsonb,'explored','[1,2]'::jsonb);
END $mock$;
REVOKE ALL ON FUNCTION
 public.get_authorized_map_fog_delta(uuid,uuid,bigint,bigint)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_authorized_map_light_masks_v2(p_map uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $mock$
DECLARE actor uuid:=auth.uid();camp uuid;
BEGIN
 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm WHERE bm.id=p_map;
 IF actor IS NULL OR camp IS NULL OR NOT public.can_view_campaign_map(camp,p_map)
 THEN RETURN NULL;END IF;
 RETURN pg_catalog.jsonb_build_object('mapId',p_map,
  'protocolVersion',2,'revision',5,'width',10,'height',10,'masks','[]'::jsonb);
END $mock$;
REVOKE ALL ON FUNCTION public.get_authorized_map_light_masks_v2(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_authorized_map_navigation(
 p_map uuid,p_kind text,p_piece uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $mock$
DECLARE actor uuid:=auth.uid();camp uuid;dm boolean;
BEGIN
 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm WHERE bm.id=p_map;
 IF actor IS NULL OR camp IS NULL OR NOT public.can_view_campaign_map(camp,p_map)
 OR p_kind NOT IN ('token','tool') THEN RETURN NULL;END IF;
 dm:=public.is_campaign_dm(camp);
 IF p_kind='token' AND NOT EXISTS(
  SELECT 1 FROM public.map_tokens t WHERE t.id=p_piece
  AND t.map_id=p_map AND t.campaign_id=camp
  AND (dm OR (t.owner_id=actor AND t.visible)))
 THEN RETURN NULL;END IF;
 IF p_kind='tool' AND NOT EXISTS(
  SELECT 1 FROM public.campaign_tool_issues t WHERE t.id=p_piece
  AND t.map_id=p_map AND t.campaign_id=camp
  AND (dm OR t.owner_id=actor OR t.party_shared))
 THEN RETURN NULL;END IF;
 RETURN pg_catalog.jsonb_build_object(
  'version',1,'mapId',p_map,'kind',p_kind,'pieceId',p_piece,
  'origin','[0,0]'::jsonb,'footprint','[1,1]'::jsonb,
  'gridWidth',10,'gridHeight',10,'visibilityRevision',5,
  'environmentRevision',1,'permissionGeneration',2,
  'collisionEnabled',true,'nodes','[[0,0]]'::jsonb);
END $mock$;
REVOKE ALL ON FUNCTION public.get_authorized_map_navigation(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;
COMMIT;
