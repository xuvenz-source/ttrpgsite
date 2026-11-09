-- World Engine V2 / Phase 7 — source roster invalidation
-- STAGING ONLY. Run after V2 visibility epochs and snapshot functions.
-- Rare DM token visibility changes and map reassignments must refresh sight
-- WITHOUT changing the static map or sending hidden NPC identities.

CREATE OR REPLACE FUNCTION forge_world_v2.notify_roster_change_v2(
 p_campaign uuid,p_map uuid,p_owner uuid,
 p_x double precision,p_y double precision,p_shown boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE scene jsonb;share boolean;recipient record;
 sources jsonb;lights jsonb;affected boolean;notifications integer:=0;
BEGIN
 IF p_map IS NULL OR p_campaign IS NULL OR NOT EXISTS(
  SELECT 1 FROM forge_visibility.map_rules r
  WHERE r.map_id=p_map AND r.campaign_id=p_campaign AND r.fog_enforced)
 THEN RETURN 0;END IF;
 SELECT e.live INTO scene FROM public.map_environments e
 WHERE e.map_id=p_map AND e.campaign_id=p_campaign;
 IF jsonb_typeof(scene->'objects')<>'array' THEN RETURN 0;END IF;
 share:=coalesce((scene->'fog'->>'partyShared')::boolean,false);
 FOR recipient IN SELECT cm.user_id FROM public.campaign_members cm
  WHERE cm.campaign_id=p_campaign AND cm.role='player'
  ORDER BY cm.user_id LIMIT 32
 LOOP
  IF forge_world_v2.viewer_on_map(p_campaign,p_map,recipient.user_id)
    IS DISTINCT FROM 'player' THEN CONTINUE;END IF;
  affected:=p_owner IS NOT NULL AND recipient.user_id=p_owner;
  IF NOT affected AND share AND p_owner IS NOT NULL AND
   forge_world_v2.viewer_on_map(p_campaign,p_map,p_owner)='player'
  THEN affected:=true;END IF;
  -- A visible NPC/tool appearing or disappearing in CURRENT authorized
  -- vision changes the roster even though it isn't a player's sight source.
  IF NOT affected AND p_shown AND p_x IS NOT NULL AND p_y IS NOT NULL THEN
   sources:=forge_world_v2.vision_sources_v2(
    p_map,p_campaign,recipient.user_id,scene);
   lights:=forge_world_v2.light_sources_v2(p_map,p_campaign,scene);
   affected:=forge_world_v2.is_seen_v2(
    scene,sources,lights,p_x,p_y);
  END IF;
  IF affected THEN
   PERFORM forge_world_v2.bump_vision_epoch_v2(
    p_campaign,p_map,recipient.user_id);
   notifications:=notifications+1;
  END IF;
 END LOOP;
 RETURN notifications;
EXCEPTION WHEN others THEN RETURN 0;
END $$;

CREATE OR REPLACE FUNCTION forge_world_v2.notify_party_source_change_v2(
 p_campaign uuid,p_map uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE scene jsonb;recipient record;count_sent integer:=0;
BEGIN
 IF p_map IS NULL OR p_campaign IS NULL OR
  NOT EXISTS(SELECT 1 FROM forge_visibility.map_rules r
   WHERE r.map_id=p_map AND r.campaign_id=p_campaign AND r.fog_enforced)
 THEN RETURN 0;END IF;
 SELECT e.live INTO scene FROM public.map_environments e
 WHERE e.map_id=p_map AND e.campaign_id=p_campaign;
 IF coalesce((scene->'fog'->>'partyShared')::boolean,false) IS DISTINCT FROM true
 THEN RETURN 0;END IF;
 FOR recipient IN SELECT cm.user_id FROM public.campaign_members cm
  WHERE cm.campaign_id=p_campaign AND cm.role='player'
  ORDER BY cm.user_id LIMIT 32
 LOOP
  IF forge_world_v2.viewer_on_map(p_campaign,p_map,recipient.user_id)
   ='player' THEN
   PERFORM forge_world_v2.bump_vision_epoch_v2(
    p_campaign,p_map,recipient.user_id);
   count_sent:=count_sent+1;
  END IF;
 END LOOP;
 RETURN count_sent;
END $$;

-- Only creation/removal and genuine visibility/ownership/map/footprint
-- edits use this trigger. Pure x/y movement is already signalled by the
-- versioned Phase 4 authority once per approved batch, avoiding duplicate
-- per-row WAL traffic on group movement commits.
CREATE OR REPLACE FUNCTION forge_world_v2.token_roster_change_trigger_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF TG_OP='UPDATE' AND
  NEW.visible IS NOT DISTINCT FROM OLD.visible AND
  NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id AND
  NEW.map_id IS NOT DISTINCT FROM OLD.map_id AND
  NEW.span_x IS NOT DISTINCT FROM OLD.span_x AND
  NEW.span_y IS NOT DISTINCT FROM OLD.span_y AND
  NEW.character_id IS NOT DISTINCT FROM OLD.character_id
 THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND
  NEW.campaign_id IS NOT DISTINCT FROM OLD.campaign_id AND
  NEW.map_id IS NOT DISTINCT FROM OLD.map_id AND
  NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
  -- A visibility toggle/footprint edit on the same map is one change,
  -- not one invalidation for OLD and another for NEW.
  PERFORM forge_world_v2.notify_roster_change_v2(
   NEW.campaign_id,NEW.map_id,NEW.owner_id,
   NEW.x+NEW.span_x/2.0,NEW.y+NEW.span_y/2.0,
   coalesce(OLD.visible,false) OR coalesce(NEW.visible,false));
  RETURN NEW;
 END IF;
 IF TG_OP IN ('DELETE','UPDATE') THEN
  PERFORM forge_world_v2.notify_roster_change_v2(
   OLD.campaign_id,OLD.map_id,OLD.owner_id,
   OLD.x+OLD.span_x/2.0,OLD.y+OLD.span_y/2.0,OLD.visible);
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
  PERFORM forge_world_v2.notify_roster_change_v2(
   NEW.campaign_id,NEW.map_id,NEW.owner_id,
   NEW.x+NEW.span_x/2.0,NEW.y+NEW.span_y/2.0,NEW.visible);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER world_v2_token_roster_changed
AFTER INSERT OR DELETE OR UPDATE OF
 visible,owner_id,map_id,span_x,span_y,character_id
ON public.map_tokens
FOR EACH ROW EXECUTE FUNCTION forge_world_v2.token_roster_change_trigger_v2();

-- Player map assignment changes must invalidate any party-shared vision
-- sourced from tokens belonging to the player who has left the map.
CREATE OR REPLACE FUNCTION forge_world_v2.player_map_change_trigger_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE campaign uuid;active uuid;old_map uuid;new_map uuid;
BEGIN
 campaign:=CASE WHEN TG_OP='DELETE' THEN OLD.campaign_id ELSE NEW.campaign_id END;
 SELECT c.active_map_id INTO active FROM public.campaigns c WHERE c.id=campaign;
 IF TG_OP IN ('UPDATE','DELETE') THEN
  old_map:=coalesce(OLD.map_id,active);
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
  new_map:=coalesce(NEW.map_id,active);
 END IF;
 IF old_map IS NOT NULL THEN
  PERFORM forge_world_v2.notify_party_source_change_v2(campaign,old_map);
 END IF;
 IF new_map IS NOT NULL AND new_map IS DISTINCT FROM old_map THEN
  PERFORM forge_world_v2.notify_party_source_change_v2(campaign,new_map);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER world_v2_player_map_changed
AFTER INSERT OR DELETE OR UPDATE OF map_id
ON public.campaign_player_maps
FOR EACH ROW EXECUTE FUNCTION forge_world_v2.player_map_change_trigger_v2();

-- Campaign default-map switches can affect multiple non-overridden players.
CREATE OR REPLACE FUNCTION forge_world_v2.campaign_map_change_trigger_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF NEW.active_map_id IS NOT DISTINCT FROM OLD.active_map_id
 THEN RETURN NEW;END IF;
 IF OLD.active_map_id IS NOT NULL THEN
  PERFORM forge_world_v2.notify_party_source_change_v2(
   NEW.id,OLD.active_map_id);
 END IF;
 IF NEW.active_map_id IS NOT NULL THEN
  PERFORM forge_world_v2.notify_party_source_change_v2(
   NEW.id,NEW.active_map_id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER world_v2_campaign_map_changed
AFTER UPDATE OF active_map_id ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION forge_world_v2.campaign_map_change_trigger_v2();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_world_v2
 FROM PUBLIC,anon,authenticated;
