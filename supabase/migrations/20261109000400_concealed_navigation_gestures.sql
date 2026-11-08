-- Concealed collision protection: never disclose an advance graph of blocked edges.
-- A short-lived gesture authorizes only the NEXT attempted adjacent step.
-- Every group member is checked before the single accepted group offset advances.
-- No user can SELECT or manipulate this private gesture state.
CREATE TABLE IF NOT EXISTS forge_visibility.navigation_gestures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL,
 map_id uuid NOT NULL REFERENCES public.battle_maps(id) ON DELETE CASCADE,
 campaign_id uuid NOT NULL,
 token_origins jsonb NOT NULL DEFAULT '[]'::jsonb,
 tool_origins jsonb NOT NULL DEFAULT '[]'::jsonb,
 environment_revision bigint NOT NULL,
 permission_generation bigint NOT NULL,
 rules_updated_at timestamptz,
 last_dx integer NOT NULL DEFAULT 0,
 last_dy integer NOT NULL DEFAULT 0,
 last_seq bigint NOT NULL DEFAULT 0,
 expires_at timestamptz NOT NULL
);
ALTER TABLE forge_visibility.navigation_gestures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_visibility.navigation_gestures
 FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS forge_navigation_gestures_expiry
 ON forge_visibility.navigation_gestures(expires_at);

CREATE OR REPLACE FUNCTION public.begin_authorized_navigation_gesture(
 p_map uuid,p_token_ids uuid[],p_tool_issue_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $gesture$
DECLARE
 actor uuid:=auth.uid();campaign uuid;dm boolean;
 tokens jsonb;tools jsonb;token_count integer;tool_count integer;
 env_revision bigint;permission_generation bigint;
 rules_stamp timestamptz;collision_on boolean;new_session uuid;
BEGIN
 IF actor IS NULL OR p_map IS NULL OR p_token_ids IS NULL OR
    p_tool_issue_ids IS NULL OR
    cardinality(p_token_ids)+cardinality(p_tool_issue_ids) NOT BETWEEN 1 AND 48 OR
    cardinality(p_token_ids)<>(SELECT count(distinct v.id) FROM unnest(p_token_ids) AS v(id)) OR
    cardinality(p_tool_issue_ids)<>(SELECT count(distinct v.id) FROM unnest(p_tool_issue_ids) AS v(id))
 THEN RAISE EXCEPTION 'Navigation gesture unavailable';END IF;
 SELECT m.campaign_id INTO campaign FROM public.battle_maps m WHERE m.id=p_map;
 IF campaign IS NULL OR NOT public.can_view_campaign_map(campaign,p_map)
 THEN RAISE EXCEPTION 'Navigation gesture unavailable';END IF;
 dm:=public.is_campaign_dm(campaign);
 SELECT r.collision_enforced,r.updated_at INTO collision_on,rules_stamp
 FROM forge_visibility.map_rules r WHERE r.map_id=p_map;
 IF collision_on IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Concealed movement requires enforced collision';END IF;
 SELECT coalesce(e.revision,0) INTO env_revision
 FROM public.map_environments e WHERE e.map_id=p_map;
 env_revision:=coalesce(env_revision,0);
 SELECT coalesce(g.generation,0) INTO permission_generation
 FROM forge_visibility.navigation_permission_generations g WHERE g.map_id=p_map;
 permission_generation:=coalesce(permission_generation,0);
 SELECT count(*),coalesce(jsonb_agg(jsonb_build_object(
   'id',t.id,'x',t.x,'y',t.y,'spanX',t.span_x,'spanY',t.span_y,
   'characterId',t.character_id) ORDER BY t.id),'[]'::jsonb)
 INTO token_count,tokens FROM public.map_tokens t
 WHERE t.id=ANY(p_token_ids) AND t.map_id=p_map AND t.campaign_id=campaign
  AND (dm OR (t.owner_id=actor AND t.visible=true AND
   (t.character_id IS NULL OR EXISTS(
     SELECT 1 FROM public.characters ch WHERE ch.id=t.character_id
     AND ch.campaign_id=campaign AND ch.user_id=actor))));
 IF token_count<>cardinality(p_token_ids)
 THEN RAISE EXCEPTION 'Token no longer controllable';END IF;
 SELECT count(*),coalesce(jsonb_agg(jsonb_build_object(
   'id',u.id,'x',u.x,'y',u.y,
   'span',CASE WHEN u.kind='mount' THEN
     coalesce((u.config->>'span')::double precision,2) ELSE 1 END)
   ORDER BY u.id),'[]'::jsonb)
 INTO tool_count,tools FROM public.campaign_tool_issues u
 WHERE u.id=ANY(p_tool_issue_ids) AND u.map_id=p_map AND u.campaign_id=campaign
  AND u.held_by_token_id IS NULL
  AND (dm OR u.owner_id=actor OR u.party_shared=true);
 IF tool_count<>cardinality(p_tool_issue_ids)
 THEN RAISE EXCEPTION 'Tool no longer controllable';END IF;
 -- Never allow stale gesture rows to accumulate on the Free plan.
 DELETE FROM forge_visibility.navigation_gestures
 WHERE expires_at<clock_timestamp() OR (actor_id=actor AND map_id=p_map);
 INSERT INTO forge_visibility.navigation_gestures(
   actor_id,map_id,campaign_id,token_origins,tool_origins,
   environment_revision,permission_generation,rules_updated_at,expires_at)
 VALUES(actor,p_map,campaign,tokens,tools,env_revision,
   permission_generation,rules_stamp,clock_timestamp()+interval '8 seconds')
 RETURNING id INTO new_session;
 RETURN jsonb_build_object('sessionId',new_session);
END $gesture$;

CREATE OR REPLACE FUNCTION public.advance_authorized_navigation_gesture(
 p_session uuid,p_dx integer,p_dy integer,p_seq bigint)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $gesture$
DECLARE
 actor uuid:=auth.uid();s forge_visibility.navigation_gestures%rowtype;
 scene jsonb;scene_revision bigint;current_permission bigint;
 rule_stamp timestamptz;collision_on boolean;map_w integer;map_h integer;
 piece jsonb;current_token record;current_tool record;attrs jsonb;
 sx double precision;sy double precision;sw double precision;sh double precision;
 step_x integer;step_y integer;verify_end jsonb;
BEGIN
 IF actor IS NULL OR p_session IS NULL OR p_dx IS NULL OR p_dy IS NULL OR
    p_seq IS NULL OR p_seq<=0 OR p_seq>9000000000000000 THEN RETURN false;END IF;
 SELECT * INTO s FROM forge_visibility.navigation_gestures
  WHERE id=p_session AND actor_id=actor FOR UPDATE;
 IF NOT FOUND OR s.expires_at<clock_timestamp() OR p_seq<=s.last_seq
 THEN RETURN false;END IF;
 step_x:=p_dx-s.last_dx;step_y:=p_dy-s.last_dy;
 -- No ahead-of-path surveys: exactly one adjacent, actually requested step.
 IF (step_x=0 AND step_y=0) OR abs(step_x)>1 OR abs(step_y)>1 OR
    abs(p_dx)>12 OR abs(p_dy)>12 THEN RETURN false;END IF;
 IF NOT public.can_view_campaign_map(s.campaign_id,s.map_id)
 THEN RETURN false;END IF;
 SELECT coalesce(e.live,'{}'::jsonb),coalesce(e.revision,0)
 INTO scene,scene_revision FROM public.map_environments e WHERE e.map_id=s.map_id;
 IF coalesce(scene_revision,0) IS DISTINCT FROM s.environment_revision OR
    jsonb_typeof(scene->'objects')<>'array' OR
    jsonb_array_length(scene->'objects')>120 THEN RETURN false;END IF;
 SELECT coalesce(r.collision_enforced,false),r.updated_at
 INTO collision_on,rule_stamp FROM forge_visibility.map_rules r WHERE r.map_id=s.map_id;
 IF collision_on IS DISTINCT FROM true OR
    rule_stamp IS DISTINCT FROM s.rules_updated_at THEN RETURN false;END IF;
 SELECT coalesce(g.generation,0) INTO current_permission
 FROM forge_visibility.navigation_permission_generations g WHERE g.map_id=s.map_id;
 IF coalesce(current_permission,0) IS DISTINCT FROM s.permission_generation
 THEN RETURN false;END IF;
 SELECT floor(m.width/m.grid_size),floor(m.height/m.grid_size)
 INTO map_w,map_h FROM public.battle_maps m
 WHERE m.id=s.map_id AND m.campaign_id=s.campaign_id AND m.grid_size>0;
 IF map_w IS NULL OR map_h IS NULL THEN RETURN false;END IF;
 FOR piece IN SELECT value FROM jsonb_array_elements(s.token_origins) LOOP
  SELECT t.* INTO current_token FROM public.map_tokens t
   WHERE t.id=(piece->>'id')::uuid AND t.map_id=s.map_id AND
    t.campaign_id=s.campaign_id;
  IF NOT FOUND OR
    (NOT public.is_campaign_dm(s.campaign_id) AND
      (current_token.owner_id IS DISTINCT FROM actor OR
       current_token.visible IS DISTINCT FROM true)) OR
    current_token.x IS DISTINCT FROM (piece->>'x')::integer OR
    current_token.y IS DISTINCT FROM (piece->>'y')::integer OR
    current_token.span_x IS DISTINCT FROM (piece->>'spanX')::numeric OR
    current_token.span_y IS DISTINCT FROM (piece->>'spanY')::numeric OR
    current_token.character_id IS DISTINCT FROM (piece->>'characterId')::uuid
  THEN RETURN false;END IF;
  attrs:=coalesce(current_token.npc_values,'{}'::jsonb);
  IF current_token.character_id IS NOT NULL THEN
   SELECT coalesce(c.field_values,'{}'::jsonb) INTO attrs FROM public.characters c
   WHERE c.id=current_token.character_id AND c.campaign_id=s.campaign_id
    AND (public.is_campaign_dm(s.campaign_id) OR c.user_id=actor);
   IF NOT FOUND THEN RETURN false;END IF;
  END IF;
  sx:=current_token.x+s.last_dx;sy:=current_token.y+s.last_dy;
  sw:=current_token.span_x;sh:=current_token.span_y;
  verify_end:=forge_visibility.validate_piece_trajectory(
   scene,attrs,sx,sy,sw,sh,map_w,map_h,
   jsonb_build_array(jsonb_build_object('dx',step_x,'dy',step_y)));
  IF (verify_end->>'x')::double precision IS DISTINCT FROM sx+step_x OR
     (verify_end->>'y')::double precision IS DISTINCT FROM sy+step_y
  THEN RETURN false;END IF;
 END LOOP;
 FOR piece IN SELECT value FROM jsonb_array_elements(s.tool_origins) LOOP
  SELECT u.* INTO current_tool FROM public.campaign_tool_issues u
   WHERE u.id=(piece->>'id')::uuid AND u.map_id=s.map_id AND
    u.campaign_id=s.campaign_id AND u.held_by_token_id IS NULL;
  IF NOT FOUND OR
    (NOT public.is_campaign_dm(s.campaign_id) AND
      current_tool.owner_id IS DISTINCT FROM actor AND
      current_tool.party_shared IS DISTINCT FROM true) OR
    current_tool.x IS DISTINCT FROM (piece->>'x')::integer OR
    current_tool.y IS DISTINCT FROM (piece->>'y')::integer OR
    (CASE WHEN current_tool.kind='mount'
     THEN coalesce((current_tool.config->>'span')::double precision,2)
     ELSE 1 END) IS DISTINCT FROM (piece->>'span')::double precision
  THEN RETURN false;END IF;
  sx:=current_tool.x+s.last_dx;sy:=current_tool.y+s.last_dy;
  sw:=(piece->>'span')::double precision;sh:=sw;
  attrs:=coalesce(current_tool.state->'attrs','{}'::jsonb);
  verify_end:=forge_visibility.validate_piece_trajectory(
   scene,attrs,sx,sy,sw,sh,map_w,map_h,
   jsonb_build_array(jsonb_build_object('dx',step_x,'dy',step_y)));
  IF (verify_end->>'x')::double precision IS DISTINCT FROM sx+step_x OR
     (verify_end->>'y')::double precision IS DISTINCT FROM sy+step_y
  THEN RETURN false;END IF;
 END LOOP;
 UPDATE forge_visibility.navigation_gestures
 SET last_dx=p_dx,last_dy=p_dy,last_seq=p_seq,
     expires_at=clock_timestamp()+interval '8 seconds'
 WHERE id=s.id;
 RETURN true;
EXCEPTION WHEN others THEN
 -- Never expose geometry, NPC attributes, hidden barrier identity or error text.
 RETURN false;
END $gesture$;

CREATE OR REPLACE FUNCTION public.end_authorized_navigation_gesture(p_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $gesture$
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL THEN RETURN;END IF;
 DELETE FROM forge_visibility.navigation_gestures
 WHERE id=p_session AND actor_id=auth.uid();
END $gesture$;

REVOKE ALL ON FUNCTION public.begin_authorized_navigation_gesture(uuid,uuid[],uuid[])
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.advance_authorized_navigation_gesture(uuid,integer,integer,bigint)
 FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.end_authorized_navigation_gesture(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_authorized_navigation_gesture(uuid,uuid[],uuid[])
 TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.advance_authorized_navigation_gesture(uuid,integer,integer,bigint)
 TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.end_authorized_navigation_gesture(uuid)
 TO authenticated,service_role;
