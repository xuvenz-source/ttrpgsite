-- R18-138 TEST FIXTURE ONLY: synthetic V2 source with actor checks.
-- NEVER use this fixture as a reconstruction of original Supabase SQL.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE forge_world_v2.r138_mock_motion(
 session_id uuid PRIMARY KEY,
 map_id uuid NOT NULL,
 actor uuid NOT NULL,
 last_seq bigint NOT NULL DEFAULT 0,
 committed boolean NOT NULL DEFAULT false
);
REVOKE ALL ON forge_world_v2.r138_mock_motion FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_world_scene_v2(p_map uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fixture$
DECLARE actor uuid:=auth.uid();camp uuid;role_name text;
BEGIN
 SELECT campaign_id INTO camp FROM public.battle_maps WHERE id=p_map;
 IF actor IS NULL OR camp IS NULL OR
  NOT public.can_view_campaign_map(camp,p_map) THEN RETURN NULL;END IF;
 SELECT role INTO role_name FROM public.campaign_members
  WHERE campaign_id=camp AND user_id=actor;
 RETURN jsonb_build_object('version',2,'mapId',p_map,
  'scope',CASE WHEN role_name='dm' THEN 'dm' ELSE 'viewer' END,
  'environment',CASE WHEN role_name='dm'
   THEN '{"syntheticPrivateScene":true}'::jsonb ELSE NULL::jsonb END);
END $fixture$;
CREATE FUNCTION public.get_world_visibility_v2(p_map uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fixture$
DECLARE actor uuid:=auth.uid();camp uuid;
BEGIN
 SELECT campaign_id INTO camp FROM public.battle_maps WHERE id=p_map;
 IF actor IS NULL OR camp IS NULL OR
  NOT public.can_view_campaign_map(camp,p_map) THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('version',2,'mapId',p_map,'viewerId',actor,
  'visible','[]'::jsonb,'explored','[]'::jsonb,'visiblePieces','[]'::jsonb);
END $fixture$;
CREATE FUNCTION public.get_world_observer_cursor_v2(p_map uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fixture$
DECLARE actor uuid:=auth.uid();camp uuid;
BEGIN
 SELECT campaign_id INTO camp FROM public.battle_maps WHERE id=p_map;
 IF actor IS NULL OR camp IS NULL OR
  NOT public.can_view_campaign_map(camp,p_map) THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('version',2,'mapId',p_map,'viewerId',actor,'cursor',0);
END $fixture$;
CREATE FUNCTION public.begin_world_motion_v2(
 p_map uuid,p_selection jsonb,p_origin jsonb,p_mode text,
 p_environment_revision bigint,p_permission_generation bigint,
 p_collision_override boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fixture$
DECLARE actor uuid:=auth.uid();camp uuid;new_id uuid;
BEGIN
 SELECT campaign_id INTO camp FROM public.battle_maps WHERE id=p_map;
 IF actor IS NULL OR camp IS NULL OR
  NOT public.can_view_campaign_map(camp,p_map) OR
  p_selection IS NULL OR jsonb_typeof(p_selection)<>'array' OR
  jsonb_array_length(p_selection)<>1 OR p_mode NOT IN
   ('drag','touch','keyboard','preview') OR
  p_collision_override IS DISTINCT FROM false THEN RETURN NULL;END IF;
 new_id:=pg_catalog.gen_random_uuid();
 INSERT INTO forge_world_v2.r138_mock_motion(session_id,map_id,actor)
 VALUES(new_id,p_map,actor);
 RETURN jsonb_build_object('version',2,'sessionId',new_id);
END $fixture$;
CREATE FUNCTION public.advance_world_motion_v2(
 p_session uuid,p_seq bigint,p_from jsonb,p_targets jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fixture$
DECLARE cur forge_world_v2.r138_mock_motion%rowtype;
BEGIN
 SELECT * INTO cur FROM forge_world_v2.r138_mock_motion
  WHERE session_id=p_session AND actor=auth.uid() FOR UPDATE;
 IF NOT FOUND OR cur.committed OR p_seq<>cur.last_seq+1
 OR jsonb_typeof(p_targets)<>'array'
 OR jsonb_array_length(p_targets)<1 THEN RETURN NULL;END IF;
 UPDATE forge_world_v2.r138_mock_motion
 SET last_seq=p_seq WHERE session_id=p_session;
 RETURN jsonb_build_object('version',2,'seq',p_seq,'accepted',p_targets);
END $fixture$;
CREATE FUNCTION public.commit_world_motion_v2(
 p_session uuid,p_seq bigint,p_endpoint jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fixture$
DECLARE cur forge_world_v2.r138_mock_motion%rowtype;
BEGIN
 SELECT * INTO cur FROM forge_world_v2.r138_mock_motion
  WHERE session_id=p_session AND actor=auth.uid() FOR UPDATE;
 IF NOT FOUND OR cur.committed OR p_seq<>cur.last_seq+1
 THEN RETURN NULL;END IF;
 UPDATE forge_world_v2.r138_mock_motion
 SET committed=true,last_seq=p_seq WHERE session_id=p_session;
 RETURN jsonb_build_object('version',2,'seq',p_seq,'sessionId',p_session);
END $fixture$;
CREATE FUNCTION public.cancel_world_motion_v2(p_session uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fixture$
BEGIN
 DELETE FROM forge_world_v2.r138_mock_motion
 WHERE session_id=p_session AND actor=auth.uid() AND NOT committed;
 RETURN FOUND;
END $fixture$;
REVOKE ALL ON FUNCTION
 public.get_world_scene_v2(uuid),
 public.get_world_visibility_v2(uuid),
 public.get_world_observer_cursor_v2(uuid),
 public.begin_world_motion_v2(uuid,jsonb,jsonb,text,bigint,bigint,boolean),
 public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint),
 public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint),
 public.cancel_world_motion_v2(uuid)
 FROM PUBLIC,anon,authenticated;
COMMIT;
