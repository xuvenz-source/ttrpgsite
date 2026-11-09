-- WP2: Additive, hidden-world-safe batched movement authorization.
-- REVIEW/STAGING ONLY: never apply without explicit designer approval.
-- Existing adjacent-step RPC remains available for a frontend-first rollback.
ALTER TABLE forge_visibility.navigation_gestures
 ADD COLUMN IF NOT EXISTS batch_count integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS validated_cells integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS attempted_cells integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS last_fog_sent timestamptz;

-- A private actor/map budget limits arbitrary hidden-wall probes across
-- repeated short-lived gesture sessions. DM editing remains unrestricted.
CREATE TABLE IF NOT EXISTS forge_visibility.navigation_gesture_budgets(
 actor_id uuid NOT NULL,map_id uuid NOT NULL,
 window_started timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 PRIMARY KEY(actor_id,map_id)
);
ALTER TABLE forge_visibility.navigation_gesture_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_visibility.navigation_gesture_budgets
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION forge_visibility.throttle_navigation_gesture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $budget$
DECLARE
 now_at timestamptz:=clock_timestamp();
 n integer;
BEGIN
 IF auth.uid() IS NULL OR NEW.actor_id IS DISTINCT FROM auth.uid()
 THEN RAISE EXCEPTION 'Navigation gesture unavailable';END IF;
 IF public.is_campaign_dm(NEW.campaign_id) THEN RETURN NEW;END IF;
 INSERT INTO forge_visibility.navigation_gesture_budgets(
  actor_id,map_id,window_started,attempts)
 VALUES(NEW.actor_id,NEW.map_id,now_at,1)
 ON CONFLICT(actor_id,map_id) DO UPDATE SET
  window_started=CASE
   WHEN now_at-forge_visibility.navigation_gesture_budgets.window_started>=interval '60 seconds'
   THEN now_at ELSE forge_visibility.navigation_gesture_budgets.window_started END,
  attempts=CASE
   WHEN now_at-forge_visibility.navigation_gesture_budgets.window_started>=interval '60 seconds'
   THEN 1 ELSE forge_visibility.navigation_gesture_budgets.attempts+1 END
 RETURNING attempts INTO n;
 IF n>120 THEN RAISE EXCEPTION 'Navigation gesture unavailable';END IF;
 RETURN NEW;
END $budget$;
DROP TRIGGER IF EXISTS forge_navigation_gesture_budget
 ON forge_visibility.navigation_gestures;
CREATE TRIGGER forge_navigation_gesture_budget
 BEFORE INSERT ON forge_visibility.navigation_gestures
 FOR EACH ROW EXECUTE FUNCTION forge_visibility.throttle_navigation_gesture();
REVOKE ALL ON FUNCTION forge_visibility.throttle_navigation_gesture()
 FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION public.advance_authorized_navigation_gesture_batch(
 p_session uuid, p_targets jsonb, p_seq bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $batch$
DECLARE
 actor uuid:=auth.uid();
 s forge_visibility.navigation_gestures%rowtype;
 scene jsonb;scene_revision bigint;permission_revision bigint;
 rule_stamp timestamptz;collision_on boolean;map_w integer;map_h integer;
 piece jsonb;token_row record;tool_row record;attrs jsonb;
 tokens jsonb:='[]'::jsonb;tools jsonb:='[]'::jsonb;
 approved jsonb:='[]'::jsonb;
 target jsonb;part jsonb;check_end jsonb;
 requested_dx integer;requested_dy integer;
 delta_x integer;delta_y integer;steps integer;step integer;
 next_dx integer;next_dy integer;current_dx integer;current_dy integer;
 used integer:=0;tested_cells integer:=0;blocked boolean:=false;
 valid boolean;fast_legal boolean;w double precision;
 refresh_fog boolean:=false;
BEGIN
 -- A batch follows a real, bounded gesture cursor, never an arbitrary origin.
 IF actor IS NULL OR p_session IS NULL OR p_seq IS NULL OR p_seq<=0 OR
    p_seq>9000000000000000 OR jsonb_typeof(p_targets)<>'array' OR
    jsonb_array_length(p_targets) NOT BETWEEN 1 AND 12 THEN RETURN NULL;END IF;
 SELECT * INTO s FROM forge_visibility.navigation_gestures
  WHERE id=p_session AND actor_id=actor FOR UPDATE;
 IF NOT FOUND OR s.expires_at<clock_timestamp() OR p_seq<=s.last_seq OR
    s.batch_count>=64 OR s.validated_cells>=128 OR
    s.attempted_cells>=128 THEN RETURN NULL;END IF;
 IF NOT public.can_view_campaign_map(s.campaign_id,s.map_id)
 THEN RETURN NULL;END IF;
 SELECT coalesce(e.live,'{}'::jsonb),coalesce(e.revision,0)
 INTO scene,scene_revision FROM public.map_environments e WHERE e.map_id=s.map_id;
 IF coalesce(scene_revision,0) IS DISTINCT FROM s.environment_revision OR
    jsonb_typeof(scene->'objects')<>'array' OR
    jsonb_array_length(scene->'objects')>120 THEN RETURN NULL;END IF;
 SELECT coalesce(r.collision_enforced,false),r.updated_at
 INTO collision_on,rule_stamp FROM forge_visibility.map_rules r WHERE r.map_id=s.map_id;
 IF collision_on IS DISTINCT FROM true OR
    rule_stamp IS DISTINCT FROM s.rules_updated_at THEN RETURN NULL;END IF;
 SELECT coalesce(g.generation,0) INTO permission_revision
 FROM forge_visibility.navigation_permission_generations g WHERE g.map_id=s.map_id;
 IF coalesce(permission_revision,0) IS DISTINCT FROM s.permission_generation
 THEN RETURN NULL;END IF;
 SELECT floor(m.width/m.grid_size),floor(m.height/m.grid_size)
 INTO map_w,map_h FROM public.battle_maps m
 WHERE m.id=s.map_id AND m.campaign_id=s.campaign_id AND m.grid_size>0;
 IF map_w IS NULL OR map_h IS NULL THEN RETURN NULL;END IF;

 -- Snapshot every member's server-owned footprint, attributes and origin ONCE
 -- per batch, not once per cell. Any change revokes the whole request.
 FOR piece IN SELECT value FROM jsonb_array_elements(s.token_origins) LOOP
  SELECT t.* INTO token_row FROM public.map_tokens t
   WHERE t.id=(piece->>'id')::uuid AND t.map_id=s.map_id
    AND t.campaign_id=s.campaign_id;
  IF NOT FOUND OR
    (NOT public.is_campaign_dm(s.campaign_id) AND
     (token_row.owner_id IS DISTINCT FROM actor OR
      token_row.visible IS DISTINCT FROM true)) OR
    token_row.x IS DISTINCT FROM (piece->>'x')::integer OR
    token_row.y IS DISTINCT FROM (piece->>'y')::integer OR
    token_row.span_x IS DISTINCT FROM (piece->>'spanX')::numeric OR
    token_row.span_y IS DISTINCT FROM (piece->>'spanY')::numeric OR
    token_row.character_id IS DISTINCT FROM (piece->>'characterId')::uuid
  THEN RETURN NULL;END IF;
  attrs:=coalesce(token_row.npc_values,'{}'::jsonb);
  IF token_row.character_id IS NOT NULL THEN
   SELECT coalesce(c.field_values,'{}'::jsonb) INTO attrs
   FROM public.characters c WHERE c.id=token_row.character_id
    AND c.campaign_id=s.campaign_id
    AND (public.is_campaign_dm(s.campaign_id) OR c.user_id=actor);
   IF NOT FOUND THEN RETURN NULL;END IF;
  END IF;
  tokens:=tokens||jsonb_build_array(jsonb_build_object(
   'x',token_row.x,'y',token_row.y,'w',token_row.span_x,
   'h',token_row.span_y,'attrs',attrs));
 END LOOP;
 FOR piece IN SELECT value FROM jsonb_array_elements(s.tool_origins) LOOP
  SELECT u.* INTO tool_row FROM public.campaign_tool_issues u
   WHERE u.id=(piece->>'id')::uuid AND u.map_id=s.map_id
    AND u.campaign_id=s.campaign_id AND u.held_by_token_id IS NULL;
  IF NOT FOUND OR
    (NOT public.is_campaign_dm(s.campaign_id) AND
     tool_row.owner_id IS DISTINCT FROM actor AND
     tool_row.party_shared IS DISTINCT FROM true) OR
    tool_row.x IS DISTINCT FROM (piece->>'x')::integer OR
    tool_row.y IS DISTINCT FROM (piece->>'y')::integer OR
    (CASE WHEN tool_row.kind='mount' THEN
       coalesce((tool_row.config->>'span')::double precision,2)
     ELSE 1 END) IS DISTINCT FROM (piece->>'span')::double precision
  THEN RETURN NULL;END IF;
  w:=(piece->>'span')::double precision;
  tools:=tools||jsonb_build_array(jsonb_build_object(
   'x',tool_row.x,'y',tool_row.y,'w',w,'h',w,
   'attrs',coalesce(tool_row.state->'attrs','{}'::jsonb)));
 END LOOP;
 current_dx:=s.last_dx;current_dy:=s.last_dy;
 <<targets_loop>>
 FOR target IN SELECT value FROM jsonb_array_elements(p_targets) LOOP
  IF jsonb_typeof(target)<>'object' OR
     jsonb_typeof(target->'dx')<>'number' OR
     jsonb_typeof(target->'dy')<>'number' OR
     (target->>'dx')::numeric<>trunc((target->>'dx')::numeric) OR
     (target->>'dy')::numeric<>trunc((target->>'dy')::numeric) OR
     abs((target->>'dx')::numeric)>128 OR
     abs((target->>'dy')::numeric)>128 THEN RETURN NULL;END IF;
  requested_dx:=(target->>'dx')::integer;
  requested_dy:=(target->>'dy')::integer;
  delta_x:=requested_dx-current_dx;
  delta_y:=requested_dy-current_dy;
  steps:=greatest(abs(delta_x),abs(delta_y));
  IF steps=0 THEN CONTINUE;END IF;
  IF steps>48 OR used+steps>48 OR
     s.validated_cells+used+steps>128 OR
     s.attempted_cells+tested_cells+steps>128 THEN RETURN NULL;END IF;
  tested_cells:=tested_cells+steps;
  -- Cheap secure fast path: one full swept-footprint validation per piece
  -- is sufficient for an unobstructed straight corridor. The private
  -- validator checks the entire continuous segment, not just its endpoint.
  -- Fall back to adjacent checks on collision so accepted-prefix semantics
  -- and opaque hidden-wall denial remain exactly the same.
  IF delta_x=0 OR delta_y=0 THEN
   fast_legal:=true;
   FOR part IN SELECT value FROM jsonb_array_elements(tokens||tools) LOOP
    BEGIN
     PERFORM forge_visibility.validate_piece_trajectory(
      scene,part->'attrs',
      (part->>'x')::double precision+current_dx,
      (part->>'y')::double precision+current_dy,
      (part->>'w')::double precision,(part->>'h')::double precision,
      map_w,map_h,
      jsonb_build_array(jsonb_build_object('dx',delta_x,'dy',delta_y)));
    EXCEPTION WHEN others THEN fast_legal:=false;EXIT;
    END;
   END LOOP;
   IF fast_legal THEN
    FOR step IN 1..steps LOOP
     approved:=approved||jsonb_build_array(jsonb_build_object(
      'dx',current_dx+sign(delta_x)::integer*step,
      'dy',current_dy+sign(delta_y)::integer*step));
    END LOOP;
    used:=used+steps;current_dx:=requested_dx;current_dy:=requested_dy;
    CONTINUE targets_loop;
   END IF;
  END IF;
  -- Every remaining swept adjacent crossing is independently tested.
  -- A multi-cell drag remains one RPC, never a multi-cell teleport.
  FOR step IN 1..steps LOOP
   next_dx:=current_dx+round(delta_x*step::numeric/steps)::integer;
   next_dy:=current_dy+round(delta_y*step::numeric/steps)::integer;
   IF approved='[]'::jsonb THEN
    -- At first substep use the database cursor, not a client origin.
    check_end:=jsonb_build_object('dx',s.last_dx,'dy',s.last_dy);
   ELSE
    check_end:=approved->(jsonb_array_length(approved)-1);
   END IF;
   IF next_dx=(check_end->>'dx')::integer AND
      next_dy=(check_end->>'dy')::integer THEN CONTINUE;END IF;
   valid:=true;
   FOR part IN SELECT value FROM jsonb_array_elements(tokens||tools) LOOP
    BEGIN
     check_end:=forge_visibility.validate_piece_trajectory(
      scene,part->'attrs',
      (part->>'x')::double precision+
        CASE WHEN approved='[]'::jsonb THEN s.last_dx ELSE
         (approved->(jsonb_array_length(approved)-1)->>'dx')::integer END,
      (part->>'y')::double precision+
        CASE WHEN approved='[]'::jsonb THEN s.last_dy ELSE
         (approved->(jsonb_array_length(approved)-1)->>'dy')::integer END,
      (part->>'w')::double precision,(part->>'h')::double precision,
      map_w,map_h,jsonb_build_array(jsonb_build_object(
       'dx',next_dx-CASE WHEN approved='[]'::jsonb THEN s.last_dx ELSE
        (approved->(jsonb_array_length(approved)-1)->>'dx')::integer END,
       'dy',next_dy-CASE WHEN approved='[]'::jsonb THEN s.last_dy ELSE
        (approved->(jsonb_array_length(approved)-1)->>'dy')::integer END)));
    EXCEPTION WHEN others THEN valid:=false;EXIT;
    END;
   END LOOP;
   IF NOT valid THEN blocked:=true;EXIT targets_loop;END IF;
   approved:=approved||jsonb_build_array(jsonb_build_object(
    'dx',next_dx,'dy',next_dy));
   used:=used+1;
  END LOOP;
  current_dx:=requested_dx;current_dy:=requested_dy;
 END LOOP;
 IF jsonb_array_length(approved)>0 THEN
  current_dx:=(approved->(jsonb_array_length(approved)-1)->>'dx')::integer;
  current_dy:=(approved->(jsonb_array_length(approved)-1)->>'dy')::integer;
 END IF;
 refresh_fog:=used>0 AND (s.last_fog_sent IS NULL OR
  clock_timestamp()-s.last_fog_sent>=interval '115 milliseconds');
 UPDATE forge_visibility.navigation_gestures
 SET last_dx=current_dx,last_dy=current_dy,last_seq=p_seq,
  batch_count=s.batch_count+1,validated_cells=s.validated_cells+used,
  attempted_cells=s.attempted_cells+tested_cells,
  last_fog_sent=CASE WHEN refresh_fog THEN clock_timestamp()
   ELSE s.last_fog_sent END,
  expires_at=clock_timestamp()+interval '8 seconds'
 WHERE id=s.id;
 IF used>0 THEN
  BEGIN
   -- Preview emission is entirely derived from the verified prefix.
   -- A realtime delivery error must never grant new cells or skip the final
   -- canonical trajectory validator. It also must not leak SQL geometry.
   PERFORM forge_visibility.publish_approved_navigation_batch(
    s.id,s.last_dx,s.last_dy,approved,scene,refresh_fog);
  EXCEPTION WHEN others THEN
   NULL; -- final persistence remains independently fail-closed
  END;
 END IF;
 RETURN jsonb_build_object('version',1,'seq',p_seq,
  'approved',approved,'blocked',blocked);
EXCEPTION WHEN others THEN
 -- Never return internal barrier/character/scene errors to an untrusted viewer.
 RETURN NULL;
END $batch$;

REVOKE ALL ON FUNCTION public.advance_authorized_navigation_gesture_batch(uuid,jsonb,bigint)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.advance_authorized_navigation_gesture_batch(uuid,jsonb,bigint)
 TO authenticated,service_role;
