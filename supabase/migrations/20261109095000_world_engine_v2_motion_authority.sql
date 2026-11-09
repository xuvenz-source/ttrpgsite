-- World Engine V2 / Phase 4 — STAGED ONLY. DO NOT APPLY TO PRODUCTION.
-- Client integration, per-recipient observer transport and trigger replacement
-- are separate release gates. This does not remove or weaken existing RLS.
CREATE SCHEMA IF NOT EXISTS forge_world_v2;
REVOKE ALL ON SCHEMA forge_world_v2 FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS forge_world_v2.motion_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  map_id uuid NOT NULL,
  selection jsonb NOT NULL,
  origin_x integer NOT NULL,
  origin_y integer NOT NULL,
  last_x integer NOT NULL,
  last_y integer NOT NULL,
  last_seq bigint NOT NULL DEFAULT 0,
  accepted_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  accepted_cells integer NOT NULL DEFAULT 0,
  attempted_cells integer NOT NULL DEFAULT 0,
  batches integer NOT NULL DEFAULT 0,
  environment_revision bigint NOT NULL,
  permission_generation bigint NOT NULL,
  rules_updated_at timestamptz,
  collision_on boolean NOT NULL,
  dm_override boolean NOT NULL DEFAULT false,
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_reply jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE forge_world_v2.motion_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_world_v2.motion_sessions FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS world_v2_motion_actor_map_idx
  ON forge_world_v2.motion_sessions(actor_id,map_id,expires_at);

CREATE TABLE IF NOT EXISTS forge_world_v2.gesture_budgets(
  actor_id uuid NOT NULL, map_id uuid NOT NULL,
  window_started timestamptz NOT NULL,
  starts integer NOT NULL DEFAULT 0,
  PRIMARY KEY(actor_id,map_id)
);
ALTER TABLE forge_world_v2.gesture_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_world_v2.gesture_budgets FROM PUBLIC, anon, authenticated;

-- Copy the collision MATHEMATICS into V2. No dependency on old movement RPCs.
CREATE OR REPLACE FUNCTION forge_world_v2.swept_hits_segment(
  x0 double precision,y0 double precision,w double precision,h double precision,
  x1 double precision,y1 double precision,ax double precision,ay double precision,
  bx double precision,by_ double precision)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=''
AS $$
DECLARE
 xs double precision[]:=array[x0,x0+w,x0+w,x0,x1,x1+w,x1+w,x1];
 ys double precision[]:=array[y0,y0,y0+h,y0+h,y1,y1,y1+h,y1+h];
 axes double precision[][]:=array[
   array[1.0::double precision,0.0::double precision],
   array[0.0::double precision,1.0::double precision],
   array[-(y1-y0),(x1-x0)],
   array[-(by_-ay),(bx-ax)]];
 i int;j int;p double precision;q double precision;
 min1 double precision;max1 double precision;min2 double precision;max2 double precision;
BEGIN
 FOR i IN 1..4 LOOP
  IF abs(axes[i][1])+abs(axes[i][2])<1e-8 THEN CONTINUE; END IF;
  min1:='Infinity'::double precision;max1:='-Infinity'::double precision;
  FOR j IN 1..8 LOOP
   p:=xs[j]*axes[i][1]+ys[j]*axes[i][2];
   min1:=least(min1,p);max1:=greatest(max1,p);
  END LOOP;
  p:=ax*axes[i][1]+ay*axes[i][2];
  q:=bx*axes[i][1]+by_*axes[i][2];
  min2:=least(p,q);max2:=greatest(p,q);
  IF max1<=min2+1e-6 OR max2<=min1+1e-6 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION forge_world_v2.wall_passes(o jsonb, attrs jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=''
AS $$
DECLARE fld text:=o->>'attributeField'; lim text:=o->>'movementAt'; raw text;
BEGIN
 IF o->>'type' IN ('door','window') AND o->>'state' IN ('open','broken')
 THEN RETURN true; END IF;
 IF coalesce(fld,'')<>'' AND coalesce(lim,'') ~ '^[-]?[0-9]{1,5}([.][0-9]{1,3})?$' THEN
  raw:=CASE WHEN jsonb_typeof(attrs->fld)='object'
   THEN attrs->fld->>'current' ELSE attrs->>fld END;
  IF coalesce(raw,'') ~ '^[-]?[0-9]{1,5}([.][0-9]{1,3})?$'
    AND raw::numeric>=lim::numeric THEN RETURN true;END IF;
 END IF;
 RETURN o->>'blocksMovement'='false';
END $$;

CREATE OR REPLACE FUNCTION forge_world_v2.step_allowed(
  p_scene jsonb,p_attrs jsonb,
  x0 double precision,y0 double precision,
  x1 double precision,y1 double precision,
  span_x double precision,span_y double precision,
  cells_w integer,cells_h integer,p_collision boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=''
AS $$
DECLARE obj jsonb; pts jsonb;a jsonb;b jsonb;i integer;
BEGIN
 IF span_x<=0 OR span_y<=0 OR span_x>12 OR span_y>12
  OR x1<0 OR y1<0 OR x1+span_x>cells_w OR y1+span_y>cells_h
 THEN RETURN false;END IF;
 IF NOT p_collision THEN RETURN true;END IF;
 IF jsonb_typeof(p_scene->'objects')<>'array' OR
  jsonb_array_length(p_scene->'objects')>120 THEN RETURN false;END IF;
 FOR obj IN SELECT value FROM jsonb_array_elements(p_scene->'objects') LOOP
  IF obj->>'type' NOT IN ('wall','door','window') THEN CONTINUE;END IF;
  IF forge_world_v2.wall_passes(obj,p_attrs) THEN CONTINUE;END IF;
  pts:=obj->'points';
  IF jsonb_typeof(pts)<>'array' OR jsonb_array_length(pts) NOT BETWEEN 2 AND 80
  THEN RETURN false;END IF;
  FOR i IN 1..jsonb_array_length(pts)-1 LOOP
   a:=pts->(i-1);b:=pts->i;
   IF forge_world_v2.swept_hits_segment(x0,y0,span_x,span_y,x1,y1,
     (a->>'x')::double precision,(a->>'y')::double precision,
     (b->>'x')::double precision,(b->>'y')::double precision)
   THEN RETURN false;END IF;
  END LOOP;
 END LOOP;
 RETURN true;
END $$;

-- Validated numeric cells, do not cast unbounded user JSON into integer.
CREATE OR REPLACE FUNCTION forge_world_v2.valid_point(v jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=''
AS $$
 SELECT coalesce(
  jsonb_typeof(v)='object' AND jsonb_typeof(v->'x')='number'
  AND jsonb_typeof(v->'y')='number'
  AND (v->>'x')::numeric=trunc((v->>'x')::numeric)
  AND (v->>'y')::numeric=trunc((v->>'y')::numeric)
  AND abs((v->>'x')::numeric)<=10000
  AND abs((v->>'y')::numeric)<=10000,false)
$$;

-- Re-check every selected piece on each advance and immediately before commit.
-- Does not return secret map data or token attributes to the browser.
CREATE OR REPLACE FUNCTION forge_world_v2.session_valid(s forge_world_v2.motion_sessions)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE part jsonb; t record; u record; c record; is_dm boolean;
 scene_rev bigint;perm_rev bigint;rules_ts timestamptz;coll boolean;
BEGIN
 IF auth.uid() IS NULL OR auth.uid()<>s.actor_id OR s.status<>'active'
 OR clock_timestamp()>s.expires_at
 OR clock_timestamp()>s.created_at+interval '60 seconds'
 OR NOT public.can_view_campaign_map(s.campaign_id,s.map_id)
 THEN RETURN false;END IF;
 is_dm:=public.is_campaign_dm(s.campaign_id);
 IF s.dm_override AND NOT is_dm THEN RETURN false;END IF;
 SELECT e.revision INTO scene_rev FROM public.map_environments e
 WHERE e.map_id=s.map_id AND e.campaign_id=s.campaign_id;
 SELECT coalesce(g.generation,0) INTO perm_rev
 FROM forge_visibility.navigation_permission_generations g WHERE g.map_id=s.map_id;
 SELECT r.updated_at,r.collision_enforced INTO rules_ts,coll
 FROM forge_visibility.map_rules r WHERE r.map_id=s.map_id;
 IF coalesce(scene_rev,0)<>s.environment_revision OR
  coalesce(perm_rev,0)<>s.permission_generation OR
  rules_ts IS DISTINCT FROM s.rules_updated_at OR
  coalesce(coll,false)<>s.collision_on THEN RETURN false;END IF;
 FOR part IN SELECT value FROM jsonb_array_elements(s.selection) LOOP
  IF part->>'kind'='token' THEN
   SELECT id,owner_id,visible,character_id,x,y,span_x,span_y,updated_at
    INTO t FROM public.map_tokens
    WHERE id=(part->>'id')::uuid AND map_id=s.map_id AND campaign_id=s.campaign_id;
   IF NOT FOUND OR t.x<>(part->>'x')::integer OR t.y<>(part->>'y')::integer
    OR t.span_x<>(part->>'spanX')::numeric OR
       t.span_y<>(part->>'spanY')::numeric
    OR t.updated_at::text<>(part->>'updatedAt')
    OR (NOT is_dm AND (t.owner_id IS DISTINCT FROM s.actor_id OR
                        t.visible IS DISTINCT FROM true))
   THEN RETURN false;END IF;
   IF t.character_id IS NOT NULL THEN
    SELECT id,user_id,updated_at INTO c FROM public.characters
     WHERE id=t.character_id AND campaign_id=s.campaign_id;
    IF NOT FOUND OR t.character_id::text IS DISTINCT FROM part->>'characterId'
      OR c.updated_at::text IS DISTINCT FROM part->>'characterUpdatedAt'
      OR (NOT is_dm AND c.user_id IS DISTINCT FROM s.actor_id)
    THEN RETURN false;END IF;
   ELSIF part->>'characterId' IS NOT NULL THEN RETURN false; END IF;
  ELSIF part->>'kind'='tool' THEN
   SELECT id,owner_id,party_shared,held_by_token_id,kind,config,x,y,revision
    INTO u FROM public.campaign_tool_issues
    WHERE id=(part->>'id')::uuid AND map_id=s.map_id AND campaign_id=s.campaign_id;
   IF NOT FOUND OR u.held_by_token_id IS NOT NULL
    OR u.x<>(part->>'x')::integer OR u.y<>(part->>'y')::integer
    OR u.revision<>(part->>'toolRevision')::bigint
    OR (CASE WHEN u.kind='mount' THEN
         coalesce((u.config->>'span')::numeric,2) ELSE 1 END)
       <> (part->>'spanX')::numeric
    OR (NOT is_dm AND u.owner_id IS DISTINCT FROM s.actor_id
        AND u.party_shared IS DISTINCT FROM true)
   THEN RETURN false;END IF;
  ELSE RETURN false;END IF;
 END LOOP;
 RETURN true;
END $$;

-- Build one actor-scoped, bounded gesture. Scene data is retained server-side.
CREATE OR REPLACE FUNCTION public.begin_world_motion_v2(
 p_map uuid,p_selection jsonb,p_origin jsonb,p_mode text,
 p_environment_revision bigint,p_permission_generation bigint,
 p_collision_override boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE actor uuid:=auth.uid();camp uuid;is_dm boolean;
 env bigint;perm bigint;rules_ts timestamptz;coll boolean;
 part jsonb;selected jsonb:='[]'::jsonb;seen text[]:=array[]::text[];
 t record;u record;c record;fw numeric;fh numeric;actual jsonb;
 new_session uuid;new_attempts integer;
BEGIN
 IF actor IS NULL OR p_map IS NULL OR
  p_selection IS NULL OR jsonb_typeof(p_selection)<>'array' OR
  jsonb_array_length(p_selection) NOT BETWEEN 1 AND 48 OR
  NOT forge_world_v2.valid_point(p_origin) OR
  p_mode IS NULL OR p_mode NOT IN ('drag','touch','keyboard','preview') OR
  p_environment_revision IS NULL OR p_permission_generation IS NULL OR
  p_collision_override IS NULL THEN RETURN NULL;END IF;
 SELECT m.campaign_id INTO camp FROM public.battle_maps m WHERE m.id=p_map;
 IF camp IS NULL OR NOT public.can_view_campaign_map(camp,p_map)
 THEN RETURN NULL;END IF;
 is_dm:=public.is_campaign_dm(camp);
 IF p_collision_override AND NOT is_dm THEN RETURN NULL; END IF;
 SELECT coalesce(e.revision,0) INTO env FROM public.map_environments e
 WHERE e.map_id=p_map AND e.campaign_id=camp;
 SELECT coalesce(g.generation,0) INTO perm
 FROM forge_visibility.navigation_permission_generations g WHERE g.map_id=p_map;
 SELECT r.updated_at,r.collision_enforced INTO rules_ts,coll
 FROM forge_visibility.map_rules r WHERE r.map_id=p_map;
 coll:=coalesce(coll,false);
 IF coalesce(env,0)<>p_environment_revision OR
  coalesce(perm,0)<>p_permission_generation
 THEN RETURN NULL;END IF;
 IF coll AND NOT p_collision_override AND NOT EXISTS (
  SELECT 1 FROM public.map_environments e WHERE e.map_id=p_map AND
   jsonb_typeof(e.live->'objects')='array' AND
   jsonb_array_length(e.live->'objects')<=120)
 THEN RETURN NULL;END IF;
 FOR part IN SELECT value FROM jsonb_array_elements(p_selection) LOOP
  IF jsonb_typeof(part)<>'object' OR
   part->>'kind' NOT IN ('token','tool') OR
   coalesce(part->>'id','') !~
   '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN RETURN NULL;END IF;
  IF ((part->>'kind')||':'||(part->>'id'))=ANY(seen) THEN RETURN NULL;END IF;
  seen:=array_append(seen,(part->>'kind')||':'||(part->>'id'));
  IF part->>'kind'='token' THEN
   SELECT id,owner_id,visible,character_id,x,y,span_x,span_y,updated_at
   INTO t FROM public.map_tokens
   WHERE id=(part->>'id')::uuid AND map_id=p_map AND campaign_id=camp;
   IF NOT FOUND OR (NOT is_dm AND
      (t.owner_id IS DISTINCT FROM actor OR t.visible IS DISTINCT FROM true))
   THEN RETURN NULL;END IF;
   fw:=t.span_x;fh:=t.span_y;
   actual:=jsonb_build_object('kind','token','id',t.id,'x',t.x,'y',t.y,
    'spanX',fw,'spanY',fh,'updatedAt',t.updated_at::text,
    'characterId',t.character_id);
   IF t.character_id IS NOT NULL THEN
    SELECT id,user_id,updated_at INTO c FROM public.characters
     WHERE id=t.character_id AND campaign_id=camp;
    IF NOT FOUND OR (NOT is_dm AND c.user_id IS DISTINCT FROM actor)
    THEN RETURN NULL;END IF;
    actual:=actual||jsonb_build_object('characterUpdatedAt',c.updated_at::text);
   END IF;
  ELSE
   SELECT id,owner_id,party_shared,held_by_token_id,kind,config,x,y,revision
   INTO u FROM public.campaign_tool_issues
    WHERE id=(part->>'id')::uuid AND map_id=p_map AND campaign_id=camp;
   IF NOT FOUND OR u.held_by_token_id IS NOT NULL OR
    (NOT is_dm AND u.owner_id IS DISTINCT FROM actor AND
     u.party_shared IS DISTINCT FROM true)
   THEN RETURN NULL;END IF;
   fw:=CASE WHEN u.kind='mount' THEN
    coalesce((u.config->>'span')::numeric,2) ELSE 1 END;fh:=fw;
   -- The existing authoritative tool trigger limits mounts to four cells.
   -- Preserve that contract until it is replaced at the integrated cutover.
   IF fw>4 THEN RETURN NULL;END IF;
   actual:=jsonb_build_object('kind','tool','id',u.id,'x',u.x,'y',u.y,
    'spanX',fw,'spanY',fh,'toolRevision',u.revision);
  END IF;
  IF fw<=0 OR fh<=0 OR fw>12 OR fh>12 THEN RETURN NULL;END IF;
  selected:=selected||jsonb_build_array(actual);
 END LOOP;
 IF (selected->0->>'x')::integer<>(p_origin->>'x')::integer OR
  (selected->0->>'y')::integer<>(p_origin->>'y')::integer
 THEN RETURN NULL; END IF;
 -- Restrict probing without extra services; a DM has full scene access.
 IF NOT is_dm THEN
  INSERT INTO forge_world_v2.gesture_budgets(
   actor_id,map_id,window_started,starts)
  VALUES(actor,p_map,clock_timestamp(),1)
  ON CONFLICT(actor_id,map_id) DO UPDATE SET
   window_started=CASE WHEN clock_timestamp()-
    forge_world_v2.gesture_budgets.window_started>=interval '60 seconds'
    THEN clock_timestamp() ELSE forge_world_v2.gesture_budgets.window_started END,
   starts=CASE WHEN clock_timestamp()-
    forge_world_v2.gesture_budgets.window_started>=interval '60 seconds'
    THEN 1 ELSE forge_world_v2.gesture_budgets.starts+1 END
  RETURNING starts INTO new_attempts;
  IF new_attempts>120 THEN RETURN NULL; END IF;
 END IF;
 DELETE FROM forge_world_v2.motion_sessions
  WHERE expires_at<clock_timestamp() OR
   (actor_id=actor AND map_id=p_map AND status<>'committed');
 INSERT INTO forge_world_v2.motion_sessions(
  actor_id,campaign_id,map_id,selection,origin_x,origin_y,last_x,last_y,
  environment_revision,permission_generation,rules_updated_at,
  collision_on,dm_override,mode,expires_at)
 VALUES(actor,camp,p_map,selected,(p_origin->>'x')::integer,
  (p_origin->>'y')::integer,(p_origin->>'x')::integer,
  (p_origin->>'y')::integer,env,perm,rules_ts,coll,
  p_collision_override,p_mode,clock_timestamp()+interval '10 seconds')
 RETURNING id INTO new_session;
 RETURN jsonb_build_object('version',2,'sessionId',new_session);
END $$;

CREATE OR REPLACE FUNCTION public.advance_world_motion_v2(
 p_session uuid,p_seq bigint,p_from jsonb,p_targets jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE s forge_world_v2.motion_sessions%rowtype;
 scene jsonb;part jsonb;t record;u record;c record;attrs jsonb;
 target jsonb;last_x integer;last_y integer;dx integer;dy integer;
 steps integer;i integer;x integer;y integer;cx integer;cy integer;
 diff_x integer;diff_y integer;needed integer:=0;processed integer:=0;
 accepted jsonb:='[]'::jsonb;routes jsonb;last_step jsonb;prev_dir_x integer;prev_dir_y integer;
 blocked boolean:=false;valid boolean;grid record;reply jsonb;new_step jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR p_seq IS NULL OR
  NOT forge_world_v2.valid_point(p_from) OR
  jsonb_typeof(p_targets)<>'array' OR
  jsonb_array_length(p_targets) NOT BETWEEN 1 AND 8
 THEN RETURN NULL;END IF;
 SELECT * INTO s FROM forge_world_v2.motion_sessions
  WHERE id=p_session AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF p_seq=s.last_seq AND s.last_reply IS NOT NULL THEN
  -- Replay must not re-expose an approved prefix after revocation.
  IF forge_world_v2.session_valid(s) THEN RETURN s.last_reply;END IF;
  RETURN NULL;
 END IF;
 IF p_seq<>s.last_seq+1 OR s.batches>=64 OR s.attempted_cells>=128 OR
   s.environment_revision IS DISTINCT FROM p_environment_revision OR
   s.permission_generation IS DISTINCT FROM p_permission_generation OR
   NOT forge_world_v2.session_valid(s)
 THEN RETURN NULL;END IF;
 IF (p_from->>'x')::integer<>s.last_x OR
    (p_from->>'y')::integer<>s.last_y THEN RETURN NULL;END IF;
 SELECT floor(m.width/m.grid_size)::integer AS w,
        floor(m.height/m.grid_size)::integer AS h INTO grid
 FROM public.battle_maps m WHERE m.id=s.map_id AND m.campaign_id=s.campaign_id
 AND m.grid_size>0;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT e.live INTO scene FROM public.map_environments e WHERE e.map_id=s.map_id;
 last_x:=s.last_x;last_y:=s.last_y;routes:=s.accepted_steps;
 FOR target IN SELECT value FROM jsonb_array_elements(p_targets) LOOP
  IF NOT forge_world_v2.valid_point(target) THEN RETURN NULL;END IF;
  dx:=(target->>'x')::integer-last_x;dy:=(target->>'y')::integer-last_y;
  steps:=greatest(abs(dx),abs(dy));
  IF steps=0 THEN CONTINUE;END IF;
  IF steps+needed>24 OR s.attempted_cells+steps+needed>128 THEN RETURN NULL;END IF;
  needed:=needed+steps;
  FOR i IN 1..steps LOOP
   -- Half-away-from-zero grid expansion, matching V2 client route expansion.
   x:=last_x+sign(dx)*floor(abs(dx)::numeric*i/steps+0.5)::integer;
   y:=last_y+sign(dy)*floor(abs(dy)::numeric*i/steps+0.5)::integer;
   IF x=s.last_x AND y=s.last_y THEN CONTINUE;END IF;
   diff_x:=x-s.last_x;diff_y:=y-s.last_y;
   IF greatest(abs(diff_x),abs(diff_y))<>1 THEN RETURN NULL;END IF;
   valid:=true;
   FOR part IN SELECT value FROM jsonb_array_elements(s.selection) LOOP
    attrs:='{}'::jsonb;
    IF part->>'kind'='token' THEN
     SELECT tok.character_id,tok.npc_values INTO t FROM public.map_tokens tok
      WHERE tok.id=(part->>'id')::uuid;
     attrs:=coalesce(t.npc_values,'{}'::jsonb);
     IF t.character_id IS NOT NULL THEN
      SELECT ch.field_values INTO attrs FROM public.characters ch
       WHERE ch.id=t.character_id AND ch.campaign_id=s.campaign_id;
      attrs:=coalesce(attrs,'{}'::jsonb);
     END IF;
    ELSE
     SELECT coalesce(tool.state->'attrs','{}'::jsonb) INTO attrs
      FROM public.campaign_tool_issues tool WHERE tool.id=(part->>'id')::uuid;
    END IF;
    IF NOT forge_world_v2.step_allowed(scene,attrs,
      (part->>'x')::double precision+(s.last_x-s.origin_x),
      (part->>'y')::double precision+(s.last_y-s.origin_y),
      (part->>'x')::double precision+(x-s.origin_x),
      (part->>'y')::double precision+(y-s.origin_y),
      (part->>'spanX')::double precision,(part->>'spanY')::double precision,
      grid.w,grid.h,s.collision_on AND NOT s.dm_override)
    THEN valid:=false;EXIT;END IF;
   END LOOP;
   IF NOT valid THEN blocked:=true;EXIT;END IF;
   last_step:=routes->(jsonb_array_length(routes)-1);
   IF jsonb_array_length(routes)>0 AND
      sign((last_step->>'dx')::integer)=diff_x AND
      sign((last_step->>'dy')::integer)=diff_y THEN
    routes:=jsonb_set(routes,array[(jsonb_array_length(routes)-1)::text],
      jsonb_build_object('dx',(last_step->>'dx')::integer+diff_x,
        'dy',(last_step->>'dy')::integer+diff_y));
   ELSE
    IF jsonb_array_length(routes)>=64 THEN blocked:=true;EXIT;END IF;
    routes:=routes||jsonb_build_array(jsonb_build_object(
     'dx',diff_x,'dy',diff_y));
   END IF;
   accepted:=accepted||jsonb_build_array(jsonb_build_object('x',x,'y',y));
   s.last_x:=x;s.last_y:=y;processed:=processed+1;
  END LOOP;
  IF blocked THEN EXIT;END IF;
  last_x:=s.last_x;last_y:=s.last_y;
 END LOOP;
 IF NOT blocked AND jsonb_array_length(accepted)=0 THEN RETURN NULL;END IF;
 reply:=jsonb_build_object('version',2,'sessionId',s.id,'seq',p_seq,
  'blocked',blocked,'accepted',accepted);
 UPDATE forge_world_v2.motion_sessions SET
  last_x=s.last_x,last_y=s.last_y,last_seq=p_seq,
  accepted_steps=routes,accepted_cells=accepted_cells+processed,
  attempted_cells=attempted_cells+needed,batches=batches+1,
  last_reply=reply,
  expires_at=least(created_at+interval '60 seconds',
   clock_timestamp()+interval '10 seconds')
 WHERE id=s.id;
 RETURN reply;
END $$;

CREATE OR REPLACE FUNCTION public.commit_world_motion_v2(
 p_session uuid,p_seq bigint,p_endpoint jsonb,
 p_environment_revision bigint,p_permission_generation bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE s forge_world_v2.motion_sessions%rowtype;
 part jsonb;token_ids uuid[]:=array[]::uuid[];tool_ids uuid[]:=array[]::uuid[];
 token_count integer;tool_count integer;step jsonb;cx integer;cy integer;
 revcheck jsonb;scene jsonb;attrs jsonb;grid record;t record;u record;
 endpoint_x integer;endpoint_y integer;reply jsonb;is_dm boolean;
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL OR p_seq IS NULL OR
  NOT forge_world_v2.valid_point(p_endpoint) THEN RETURN NULL;END IF;
 SELECT * INTO s FROM forge_world_v2.motion_sessions
  WHERE id=p_session AND actor_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF s.status='committed' AND s.last_seq=p_seq THEN
  -- A completed session can be retried only while its map access persists.
  IF clock_timestamp()<=s.expires_at AND
    public.can_view_campaign_map(s.campaign_id,s.map_id) AND
    (SELECT coalesce(g.generation,0)
     FROM forge_visibility.navigation_permission_generations g
     WHERE g.map_id=s.map_id)=s.permission_generation
  THEN RETURN s.last_reply;END IF;
  RETURN NULL;
 END IF;
 IF p_seq<>s.last_seq+1 OR s.mode='preview' OR
   s.accepted_cells<1 OR s.accepted_steps='[]'::jsonb OR
   p_environment_revision IS DISTINCT FROM s.environment_revision OR
   p_permission_generation IS DISTINCT FROM s.permission_generation OR
   NOT forge_world_v2.session_valid(s) OR
   s.last_x<>(p_endpoint->>'x')::integer OR
   s.last_y<>(p_endpoint->>'y')::integer THEN RETURN NULL;END IF;
 -- Lock all selected rows in stable ID order before re-checking and writing.
 SELECT count(*) INTO token_count FROM (
  SELECT id FROM public.map_tokens WHERE map_id=s.map_id
   AND campaign_id=s.campaign_id AND
   id IN (SELECT (value->>'id')::uuid FROM
     jsonb_array_elements(s.selection) WHERE value->>'kind'='token')
   ORDER BY id FOR UPDATE
 ) owned;
 SELECT count(*) INTO tool_count FROM (
  SELECT id FROM public.campaign_tool_issues WHERE map_id=s.map_id
   AND campaign_id=s.campaign_id AND
   id IN (SELECT (value->>'id')::uuid FROM
     jsonb_array_elements(s.selection) WHERE value->>'kind'='tool')
   ORDER BY id FOR UPDATE
 ) owned;
 IF token_count<>(SELECT count(*) FROM jsonb_array_elements(s.selection)
   WHERE value->>'kind'='token')
 OR tool_count<>(SELECT count(*) FROM jsonb_array_elements(s.selection)
   WHERE value->>'kind'='tool')
 OR NOT forge_world_v2.session_valid(s) THEN RETURN NULL;END IF;
 SELECT e.live INTO scene FROM public.map_environments e WHERE e.map_id=s.map_id;
 SELECT floor(m.width/m.grid_size)::integer AS w,
  floor(m.height/m.grid_size)::integer AS h INTO grid FROM public.battle_maps m
  WHERE m.id=s.map_id AND m.campaign_id=s.campaign_id AND m.grid_size>0;
 IF NOT FOUND THEN RETURN NULL;END IF;
 -- Hold environment, rule and permission revisions stable for the commit
 -- transaction so a concurrent DM edit cannot race our last validation.
 PERFORM 1 FROM public.map_environments
  WHERE map_id=s.map_id AND campaign_id=s.campaign_id FOR SHARE;
 PERFORM 1 FROM forge_visibility.map_rules
  WHERE map_id=s.map_id FOR SHARE;
 PERFORM 1 FROM forge_visibility.navigation_permission_generations
  WHERE map_id=s.map_id FOR SHARE;
 IF NOT forge_world_v2.session_valid(s) THEN RETURN NULL;END IF;
 -- Independently verify all previously accepted legs against current scene.
 -- A stored approved route cannot bypass a changed rule or a bad endpoint.
 FOR part IN SELECT value FROM jsonb_array_elements(s.selection) LOOP
  attrs:='{}'::jsonb;
  IF part->>'kind'='token' THEN
   SELECT tok.character_id,tok.npc_values INTO t FROM public.map_tokens tok
    WHERE tok.id=(part->>'id')::uuid;
   attrs:=coalesce(t.npc_values,'{}'::jsonb);
   IF t.character_id IS NOT NULL THEN
    SELECT coalesce(ch.field_values,'{}'::jsonb) INTO attrs
    FROM public.characters ch WHERE ch.id=t.character_id AND ch.campaign_id=s.campaign_id;
   END IF;
   token_ids:=array_append(token_ids,(part->>'id')::uuid);
  ELSE
   SELECT coalesce(tool.state->'attrs','{}'::jsonb) INTO attrs
   FROM public.campaign_tool_issues tool WHERE tool.id=(part->>'id')::uuid;
   tool_ids:=array_append(tool_ids,(part->>'id')::uuid);
  END IF;
  cx:=(part->>'x')::integer;cy:=(part->>'y')::integer;
  FOR step IN SELECT value FROM jsonb_array_elements(s.accepted_steps) LOOP
   IF NOT forge_world_v2.step_allowed(scene,attrs,cx,cy,
     cx+(step->>'dx')::integer,cy+(step->>'dy')::integer,
     (part->>'spanX')::double precision,(part->>'spanY')::double precision,
     grid.w,grid.h,s.collision_on AND NOT s.dm_override)
   THEN RETURN NULL;END IF;
   cx:=cx+(step->>'dx')::integer;cy:=cy+(step->>'dy')::integer;
  END LOOP;
  IF cx<>(part->>'x')::integer+s.last_x-s.origin_x OR
   cy<>(part->>'y')::integer+s.last_y-s.origin_y THEN RETURN NULL;END IF;
 END LOOP;
 -- Temporary bridge for existing collision triggers. This same accepted route
 -- was independently validated above. Phase 10 replaces these triggers with V2.
 PERFORM set_config('forge.trajectory_steps',s.accepted_steps::text,true);
 PERFORM set_config('forge.trajectory_map',s.map_id::text,true);
 PERFORM set_config('forge.trajectory_actor',s.actor_id::text,true);
 IF s.dm_override THEN
  PERFORM set_config('forge.collision_override','on',true);
 END IF;
 UPDATE public.map_tokens tok SET x=tok.x+s.last_x-s.origin_x,
  y=tok.y+s.last_y-s.origin_y
 WHERE tok.id=ANY(token_ids) AND tok.map_id=s.map_id AND tok.campaign_id=s.campaign_id;
 UPDATE public.campaign_tool_issues tool SET x=tool.x+s.last_x-s.origin_x,
  y=tool.y+s.last_y-s.origin_y
 WHERE tool.id=ANY(tool_ids) AND tool.map_id=s.map_id AND tool.campaign_id=s.campaign_id;
 PERFORM set_config('forge.trajectory_steps','',true);
 PERFORM set_config('forge.trajectory_map','',true);
 PERFORM set_config('forge.trajectory_actor','',true);
 PERFORM set_config('forge.collision_override','',true);
 reply:=jsonb_build_object('version',2,'sessionId',s.id,'seq',p_seq,
  'endpoint',jsonb_build_object('x',s.last_x,'y',s.last_y));
 UPDATE forge_world_v2.motion_sessions SET status='committed',
  last_seq=p_seq,last_reply=reply,
  expires_at=clock_timestamp()+interval '10 seconds'
 WHERE id=s.id;
 RETURN reply;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_world_motion_v2(p_session uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF auth.uid() IS NULL OR p_session IS NULL THEN RETURN false;END IF;
 DELETE FROM forge_world_v2.motion_sessions
 WHERE id=p_session AND actor_id=auth.uid() AND status='active';
 RETURN FOUND;
END $$;

-- Every exposed definer RPC is deny-by-default; authenticated users still
-- require the explicit actor/map/ownership checks above. No anon access.
-- Private helper functions are never directly executable through client roles.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_world_v2 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.begin_world_motion_v2(uuid,jsonb,jsonb,text,bigint,bigint,boolean)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cancel_world_motion_v2(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_world_motion_v2(uuid,jsonb,jsonb,text,bigint,bigint,boolean)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_world_motion_v2(uuid,bigint,jsonb,jsonb,bigint,bigint)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_world_motion_v2(uuid,bigint,jsonb,bigint,bigint)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_world_motion_v2(uuid)
 TO authenticated;
