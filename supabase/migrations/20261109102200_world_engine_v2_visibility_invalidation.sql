-- World Engine V2 Phase 7: recipient-scoped VISION DIRTY notifications.
-- STAGED ONLY. The event contains NO cells, token IDs or raw map geometry.
-- Runs after Phase 4/5/6 and the two preceding Phase 7 migrations.
--
-- Reuse the one private Phase 5 observer socket per viewer. The server
-- persists a tiny monotonic sight epoch, not an entire per-frame fog image.

CREATE OR REPLACE FUNCTION forge_world_v2.bump_vision_epoch_v2(
 p_campaign uuid,p_map uuid,p_viewer uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE new_epoch bigint;env_rev bigint:=0;
 perm_gen bigint:=0;scene_gen bigint:=0;
BEGIN
 IF forge_world_v2.viewer_on_map(p_campaign,p_map,p_viewer)<>'player'
 THEN RETURN NULL;END IF;
 INSERT INTO forge_world_v2.vision_epochs(
  map_id,viewer_id,campaign_id,epoch,changed_at)
 VALUES(p_map,p_viewer,p_campaign,1,clock_timestamp())
 ON CONFLICT(map_id,viewer_id) DO UPDATE SET
  epoch=forge_world_v2.vision_epochs.epoch+1,
  campaign_id=excluded.campaign_id,
  changed_at=clock_timestamp()
 RETURNING epoch INTO new_epoch;
 SELECT e.revision INTO env_rev FROM public.map_environments e
 WHERE e.map_id=p_map AND e.campaign_id=p_campaign;
 SELECT g.generation INTO perm_gen
 FROM forge_visibility.navigation_permission_generations g WHERE g.map_id=p_map;
 SELECT s.generation INTO scene_gen FROM forge_world_v2.scene_publications s
 WHERE s.map_id=p_map AND s.campaign_id=p_campaign;
 BEGIN
  PERFORM realtime.send(jsonb_build_object(
   'version',2,'mapId',p_map,'viewerId',p_viewer,
   'visionEpoch',new_epoch,
   'environmentRevision',coalesce(env_rev,0),
   'permissionGeneration',coalesce(perm_gen,0),
   'sceneGeneration',coalesce(scene_gen,0)),
   'world-vision-v2',
   'forge-world-v2:'||p_map::text||':'||p_viewer::text,true);
 EXCEPTION WHEN others THEN
  RAISE WARNING 'World V2 sight notification unavailable';
 END;
 RETURN new_epoch;
END $$;

-- A move can change a recipient's sight ONLY when it moves one of the
-- viewer's own/party-shared vision sources or a real emitting torch close
-- enough to intersect that viewer's vision envelope.
-- This deliberately does not notify players about unrelated hidden NPC
-- movement. The DM is already fully visible and needs no fog refresh.
CREATE OR REPLACE FUNCTION forge_world_v2.signal_movement_vision_v2(
 s forge_world_v2.motion_sessions,p_accepted jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE viewer record;part jsonb;scene jsonb;shared boolean;
 affected boolean;lights boolean;source jsonb;
 source_x double precision;source_y double precision;
 torch record;light_x double precision;light_y double precision;
 delta_x integer;delta_y integer;reach double precision;notices integer:=0;
BEGIN
 IF s.status<>'active' OR s.actor_id<>auth.uid() OR
  s.mode='preview' OR NOT forge_world_v2.session_valid(s) OR
  jsonb_typeof(p_accepted)<>'array' OR jsonb_array_length(p_accepted)<1
 THEN RETURN 0;END IF;
 IF NOT EXISTS(SELECT 1 FROM forge_visibility.map_rules r
  WHERE r.map_id=s.map_id AND r.campaign_id=s.campaign_id
   AND r.fog_enforced) THEN RETURN 0;END IF;
 SELECT e.live INTO scene FROM public.map_environments e
 WHERE e.map_id=s.map_id AND e.campaign_id=s.campaign_id;
 shared:=coalesce((scene->'fog'->>'partyShared')::boolean,false);
 -- The wrapper passes the PRE-advance session. Read the approved
 -- endpoint to avoid sending stale-light proximity on later batches.
 delta_x:=(p_accepted->(jsonb_array_length(p_accepted)-1)->>'x')::integer-s.last_x;
 delta_y:=(p_accepted->(jsonb_array_length(p_accepted)-1)->>'y')::integer-s.last_y;
 FOR viewer IN SELECT cm.user_id FROM public.campaign_members cm
  WHERE cm.campaign_id=s.campaign_id AND cm.role='player'
  ORDER BY cm.user_id LIMIT 32 LOOP
  IF forge_world_v2.viewer_on_map(s.campaign_id,s.map_id,viewer.user_id)
   <>'player' THEN CONTINUE;END IF;
  affected:=false;
  FOR part IN SELECT value FROM jsonb_array_elements(s.selection) LOOP
   IF part->>'kind'='token' THEN
    IF EXISTS(SELECT 1 FROM public.map_tokens t
     WHERE t.id=(part->>'id')::uuid AND t.map_id=s.map_id
      AND t.campaign_id=s.campaign_id AND t.visible AND
      (t.owner_id=viewer.user_id OR
       (shared AND t.owner_id IS NOT NULL AND EXISTS(
        SELECT 1 FROM public.campaign_members cm
        WHERE cm.campaign_id=s.campaign_id AND cm.user_id=t.owner_id
         AND cm.role='player'))))
    THEN affected:=true;EXIT;END IF;
   END IF;
  END LOOP;
  IF NOT affected THEN
   -- Remote moving torches can alter the viewer's real lighting.
   -- Check proximity to entitled sources before publishing a sight tick.
   FOR torch IN
    SELECT p.issue_id,p.held_by_token_id,p.x,p.y,p.light_bright,p.light_dim,
     holder.x AS holder_x,holder.y AS holder_y,holder.span_x,holder.span_y
    FROM public.campaign_tool_map_tokens p
    LEFT JOIN public.map_tokens holder ON holder.id=p.held_by_token_id
     AND holder.map_id=s.map_id AND holder.campaign_id=s.campaign_id
    WHERE p.map_id=s.map_id AND p.campaign_id=s.campaign_id
     AND p.kind='torch' AND p.light_enabled
     AND (s.selection @> jsonb_build_array(jsonb_build_object(
       'kind','tool','id',p.issue_id))
      OR (p.held_by_token_id IS NOT NULL AND
       s.selection @> jsonb_build_array(jsonb_build_object(
        'kind','token','id',p.held_by_token_id))))
    ORDER BY p.issue_id LIMIT 25
   LOOP
    reach:=greatest(0,least(200,
      (coalesce(torch.light_bright,0)+coalesce(torch.light_dim,0))/5.0));
    IF torch.held_by_token_id IS NULL THEN
     light_x:=torch.x+0.5;light_y:=torch.y+0.5;
    ELSE
     light_x:=torch.holder_x+torch.span_x/2.0;
     light_y:=torch.holder_y+torch.span_y/2.0;
    END IF;
    -- Include previously approved displacement before this batch.
    light_x:=light_x+s.last_x-s.origin_x;
    light_y:=light_y+s.last_y-s.origin_y;
    FOR source IN SELECT value FROM jsonb_array_elements(
     forge_world_v2.vision_sources_v2(
      s.map_id,s.campaign_id,viewer.user_id,scene)) LOOP
     source_x:=(source->>'x')::double precision+
      (source->>'spanX')::double precision/2.0;
     source_y:=(source->>'y')::double precision+
      (source->>'spanY')::double precision/2.0;
     IF ((light_x-source_x)^2+(light_y-source_y)^2<=
       (14+reach)^2 OR
       (light_x+delta_x-source_x)^2+
       (light_y+delta_y-source_y)^2<=(14+reach)^2)
     THEN affected:=true;EXIT;END IF;
    END LOOP;
    IF affected THEN EXIT;END IF;
   END LOOP;
  END IF;
  IF affected THEN
   PERFORM forge_world_v2.bump_vision_epoch_v2(
    s.campaign_id,s.map_id,viewer.user_id);
   notices:=notices+1;
  END IF;
 END LOOP;
 RETURN notices;
END $$;

-- Phase 5's public wrapper remains the sole authenticated movement ingress.
-- Add ONE visibility-dirty signal after each *new*, approved batch; repeated
-- sequence ACKs and DM preview do not broadcast again.
CREATE OR REPLACE FUNCTION public.advance_world_motion_v2(
 p_session uuid,p_seq bigint,p_from jsonb,p_targets jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE before_seq bigint;current_session forge_world_v2.motion_sessions%rowtype;
 reply jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR p_seq IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO current_session FROM forge_world_v2.motion_sessions
  WHERE id=p_session AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 before_seq:=current_session.last_seq;
 reply:=forge_world_v2.advance_core_v2(
  p_session,p_seq,p_from,p_targets,
  p_environment_revision,p_permission_generation);
 IF reply IS NULL THEN RETURN NULL;END IF;
 IF p_seq>before_seq AND jsonb_typeof(reply->'accepted')='array' AND
  jsonb_array_length(reply->'accepted')>0 AND
  current_session.mode<>'preview'
 THEN
  BEGIN
   PERFORM forge_world_v2.publish_approved_observers(
    current_session,p_from,reply->'accepted');
  EXCEPTION WHEN others THEN
   RAISE WARNING 'V2 recipient motion broadcast unavailable';
  END;
  BEGIN
   PERFORM forge_world_v2.signal_movement_vision_v2(
    current_session,reply->'accepted');
  EXCEPTION WHEN others THEN
   RAISE WARNING 'V2 private sight invalidation unavailable';
  END;
 END IF;
 RETURN reply;
END $$;

-- Dynamic light editor controls can change a torch without moving it:
-- notify only players whose entitled viewer sources are near the old/new
-- light. This does not expose the source identity or position in the event.
CREATE OR REPLACE FUNCTION forge_world_v2.signal_light_edit_v2(
 p_map uuid,p_campaign uuid,p_x double precision,p_y double precision,
 p_reach double precision)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v record;source jsonb;scene jsonb;nearby boolean;
 x double precision;y double precision;notified integer:=0;
BEGIN
 IF p_map IS NULL OR p_campaign IS NULL OR p_x IS NULL OR p_y IS NULL OR
  p_reach IS NULL OR NOT EXISTS(
   SELECT 1 FROM forge_visibility.map_rules r
   WHERE r.map_id=p_map AND r.campaign_id=p_campaign
    AND r.fog_enforced)
 THEN RETURN 0;END IF;
 SELECT e.live INTO scene FROM public.map_environments e
 WHERE e.map_id=p_map AND e.campaign_id=p_campaign;
 FOR v IN SELECT cm.user_id FROM public.campaign_members cm
  WHERE cm.campaign_id=p_campaign AND cm.role='player'
  ORDER BY cm.user_id LIMIT 32
 LOOP
  IF forge_world_v2.viewer_on_map(p_campaign,p_map,v.user_id)
    <>'player' THEN CONTINUE;END IF;
  nearby:=false;
  FOR source IN SELECT value FROM jsonb_array_elements(
   forge_world_v2.vision_sources_v2(p_map,p_campaign,v.user_id,scene))
  LOOP
   x:=(source->>'x')::double precision+
    (source->>'spanX')::double precision/2.0;
   y:=(source->>'y')::double precision+
    (source->>'spanY')::double precision/2.0;
   IF (p_x-x)^2+(p_y-y)^2<=(14+greatest(0,least(200,p_reach)))^2
   THEN nearby:=true;EXIT;END IF;
  END LOOP;
  IF nearby THEN
   PERFORM forge_world_v2.bump_vision_epoch_v2(
    p_campaign,p_map,v.user_id);
   notified:=notified+1;
  END IF;
 END LOOP;
 RETURN notified;
END $$;

CREATE OR REPLACE FUNCTION forge_world_v2.tool_light_edit_trigger_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE old_reach double precision;new_reach double precision;
 old_x double precision;old_y double precision;
 new_x double precision;new_y double precision;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.kind='torch' AND
  OLD.light_enabled THEN
  old_reach:=(coalesce(OLD.light_bright,0)+
    coalesce(OLD.light_dim,0))/5.0;
  old_x:=OLD.x+0.5;old_y:=OLD.y+0.5;
  IF OLD.held_by_token_id IS NOT NULL THEN
   SELECT t.x+t.span_x/2.0,t.y+t.span_y/2.0
    INTO old_x,old_y FROM public.map_tokens t
   WHERE t.id=OLD.held_by_token_id AND
    t.map_id=OLD.map_id AND t.campaign_id=OLD.campaign_id
    AND t.visible;
   IF NOT FOUND THEN old_x:=NULL;END IF;
  END IF;
  IF old_x IS NOT NULL THEN
   PERFORM forge_world_v2.signal_light_edit_v2(
    OLD.map_id,OLD.campaign_id,old_x,old_y,old_reach);
  END IF;
 END IF;
 IF TG_OP IN ('UPDATE','INSERT') AND NEW.kind='torch' AND
  NEW.light_enabled THEN
  new_reach:=(coalesce(NEW.light_bright,0)+
    coalesce(NEW.light_dim,0))/5.0;
  new_x:=NEW.x+0.5;new_y:=NEW.y+0.5;
  IF NEW.held_by_token_id IS NOT NULL THEN
   SELECT t.x+t.span_x/2.0,t.y+t.span_y/2.0
    INTO new_x,new_y FROM public.map_tokens t
   WHERE t.id=NEW.held_by_token_id AND
    t.map_id=NEW.map_id AND t.campaign_id=NEW.campaign_id
    AND t.visible;
   IF NOT FOUND THEN new_x:=NULL;END IF;
  END IF;
  IF new_x IS NOT NULL THEN
   PERFORM forge_world_v2.signal_light_edit_v2(
    NEW.map_id,NEW.campaign_id,new_x,new_y,new_reach);
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER world_v2_tool_light_change
AFTER INSERT OR DELETE OR UPDATE OF
 light_enabled,light_bright,light_dim,held_by_token_id
ON public.campaign_tool_map_tokens
FOR EACH ROW EXECUTE FUNCTION forge_world_v2.tool_light_edit_trigger_v2();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_world_v2
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.advance_world_motion_v2(
 uuid,bigint,jsonb,jsonb,bigint,bigint)
 TO authenticated;
