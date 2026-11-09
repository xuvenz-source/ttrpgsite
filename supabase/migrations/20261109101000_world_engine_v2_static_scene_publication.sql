-- World Engine V2 / Phase 6 — STAGING ONLY, NOT APPLIED TO LIVE SUPABASE.
-- Requires Phase 4 and Phase 5 migration order.
-- Persisted truth remains public.map_environments(prepared,live,revision)
-- and forge_visibility.map_rules. No duplicated full scene or token positions.

CREATE TABLE IF NOT EXISTS forge_world_v2.scene_publications(
 map_id uuid PRIMARY KEY REFERENCES public.battle_maps(id) ON DELETE CASCADE,
 campaign_id uuid NOT NULL,
 generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0),
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE forge_world_v2.scene_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_world_v2.scene_publications FROM PUBLIC,anon,authenticated;

-- Sanitized, map-scoped PRIVATE publication notification. A Realtime client
-- may receive only an authorized map's generation, never raw walls/lights.
-- There is no INSERT policy permitting a browser to forge V2 notifications.
CREATE POLICY "World V2 scene publication receive"
ON realtime.messages FOR SELECT TO authenticated
USING (
 extension='broadcast'
 AND CASE WHEN (SELECT realtime.topic()) ~
 '^forge-world-scene-v2:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 THEN EXISTS(
  SELECT 1 FROM public.battle_maps bm
   WHERE bm.id=(split_part((SELECT realtime.topic()),':',2))::uuid
   AND public.can_view_campaign_map(bm.campaign_id,bm.id)
 )
 ELSE false END
);

CREATE OR REPLACE FUNCTION forge_world_v2.bump_scene_publication_v2(p_map uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE camp uuid;next_generation bigint;
BEGIN
 SELECT bm.campaign_id INTO camp FROM public.battle_maps bm WHERE bm.id=p_map;
 IF camp IS NULL THEN RETURN NULL;END IF;
 INSERT INTO forge_world_v2.scene_publications(
  map_id,campaign_id,generation,changed_at)
 VALUES(p_map,camp,1,clock_timestamp())
 ON CONFLICT(map_id) DO UPDATE SET
  generation=forge_world_v2.scene_publications.generation+1,
  campaign_id=excluded.campaign_id,changed_at=clock_timestamp()
 RETURNING generation INTO next_generation;
 -- A Realtime partition outage cannot prevent a DM from publishing a map.
 -- The counter is persisted and re-read after reconnect/focus.
 BEGIN
  PERFORM realtime.send(jsonb_build_object(
   'version',2,'mapId',p_map,'sceneGeneration',next_generation),
   'scene-revision-v2','forge-world-scene-v2:'||p_map::text,true);
 EXCEPTION WHEN others THEN
  RAISE WARNING 'World V2 scene publication notification unavailable';
 END;
 RETURN next_generation;
END $$;

CREATE OR REPLACE FUNCTION forge_world_v2.environment_published_trigger_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 -- Prepared-only DM edits are explicitly excluded from these triggers.
 PERFORM forge_world_v2.bump_scene_publication_v2(NEW.map_id);
 RETURN NEW;
END $$;

CREATE TRIGGER world_v2_environment_published
AFTER UPDATE OF live,revision ON public.map_environments
FOR EACH ROW
WHEN (OLD.live IS DISTINCT FROM NEW.live OR
      OLD.revision IS DISTINCT FROM NEW.revision)
EXECUTE FUNCTION forge_world_v2.environment_published_trigger_v2();

CREATE OR REPLACE FUNCTION forge_world_v2.rules_published_trigger_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE map_uuid uuid;
BEGIN
 IF TG_OP='UPDATE' AND
  NEW.fog_enforced IS NOT DISTINCT FROM OLD.fog_enforced AND
  NEW.collision_enforced IS NOT DISTINCT FROM OLD.collision_enforced
 THEN RETURN NEW;END IF;
 map_uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.map_id ELSE NEW.map_id END;
 PERFORM forge_world_v2.bump_scene_publication_v2(map_uuid);
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER world_v2_rules_published
AFTER INSERT OR DELETE OR UPDATE OF fog_enforced,collision_enforced
ON forge_visibility.map_rules
FOR EACH ROW EXECUTE FUNCTION forge_world_v2.rules_published_trigger_v2();

-- A viewer may request only published, non-secret display metadata.
-- The DM receives the full LIVE scene (not unpublished PREPARED edits).
-- For ordinary players, environment is exactly null: no hidden wall,
-- secret door, static light position, NPC attribute or light occlusion data.
CREATE OR REPLACE FUNCTION public.get_world_scene_v2(p_map uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE actor uuid:=auth.uid();m record;
 full_scene jsonb;environment_rev bigint:=0;scene_gen bigint:=0;
 rules_rev bigint:=0;fog_on boolean:=false;collision_on boolean:=false;
 is_dm boolean;published boolean:=false;ambient_value double precision:=25;
 weather_kind text:='none';effect_intensity double precision:=0;
 raw_text text;
BEGIN
 IF actor IS NULL OR p_map IS NULL THEN RETURN NULL;END IF;
 SELECT bm.id,bm.campaign_id,bm.width,bm.height,bm.grid_size INTO m
 FROM public.battle_maps bm WHERE bm.id=p_map;
 IF NOT FOUND OR NOT public.can_view_campaign_map(m.campaign_id,p_map)
  OR m.grid_size<=0 OR m.width<1 OR m.height<1
 THEN RETURN NULL;END IF;
 is_dm:=public.is_campaign_dm(m.campaign_id);
 SELECT e.live,e.revision INTO full_scene,environment_rev
 FROM public.map_environments e
 WHERE e.map_id=p_map AND e.campaign_id=m.campaign_id;
 SELECT r.fog_enforced,r.collision_enforced,r.published_revision
 INTO fog_on,collision_on,rules_rev
 FROM forge_visibility.map_rules r
 WHERE r.map_id=p_map AND r.campaign_id=m.campaign_id;
 SELECT s.generation INTO scene_gen FROM forge_world_v2.scene_publications s
 WHERE s.map_id=p_map AND s.campaign_id=m.campaign_id;
 published:=CASE WHEN jsonb_typeof(full_scene->'objects')='array'
  THEN jsonb_array_length(full_scene->'objects')<=120 ELSE false END;
 -- A malformed unpublished scene cannot become an empty, visible map
 -- while rules still require collision/fog: clients treat this as invalid.
 fog_on:=coalesce(fog_on,false);
 collision_on:=coalesce(collision_on,false);
 IF published THEN
  raw_text:=full_scene->>'ambient';
  IF coalesce(raw_text,'') ~ '^[0-9]{1,3}([.][0-9]{1,3})?$'
  THEN ambient_value:=greatest(0,least(100,raw_text::double precision));END IF;
  weather_kind:=coalesce(full_scene->'effects'->>'weather','none');
  IF weather_kind NOT IN ('none','rain','snow','fog')
  THEN weather_kind:='none';END IF;
  raw_text:=full_scene->'effects'->>'intensity';
  IF coalesce(raw_text,'') ~ '^[0-9]{1,3}([.][0-9]{1,3})?$'
  THEN effect_intensity:=greatest(0,least(100,raw_text::double precision));END IF;
 END IF;
 RETURN jsonb_build_object(
  'version',2,'mapId',p_map,'scope',CASE WHEN is_dm THEN 'dm' ELSE 'viewer' END,
  'revision',coalesce(environment_rev,0),
  'sceneGeneration',coalesce(scene_gen,0),
  'rulesRevision',coalesce(rules_rev,0),
  'published',published,'fogEnabled',fog_on,
  'collisionEnabled',collision_on,
  'ambient',ambient_value,
  'effects',jsonb_build_object('weather',weather_kind,
   'intensity',effect_intensity),
  'dimensions',jsonb_build_object('width',m.width,'height',m.height,
   'gridSize',m.grid_size),
  'environment',CASE WHEN is_dm AND published THEN full_scene
   ELSE NULL::jsonb END);
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_world_v2
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_world_scene_v2(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_world_scene_v2(uuid) TO authenticated;

-- Never grant a player SELECT on public.map_environments or V2 private
-- scene publications. The existing DM-prepared RLS remains unchanged.
-- No client token updates or movement callbacks touch this migration.
