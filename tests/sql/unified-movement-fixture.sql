-- Throwaway PostgreSQL 16 fixture. NEVER run against Supabase production.
-- This exercises RPC SQL structure, grants, sequencing and prefix semantics
-- without any real campaign data or network integrations.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA forge_visibility;
CREATE SCHEMA realtime;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;

CREATE TABLE public.campaigns(id uuid PRIMARY KEY,active_map_id uuid);
CREATE TABLE public.campaign_members(
 campaign_id uuid,user_id uuid,role text,
 PRIMARY KEY(campaign_id,user_id));
CREATE TABLE public.campaign_player_maps(
 campaign_id uuid,user_id uuid,map_id uuid);
CREATE TABLE public.battle_maps(
 id uuid PRIMARY KEY,campaign_id uuid,width integer,height integer,grid_size integer);
CREATE TABLE public.map_environments(
 map_id uuid PRIMARY KEY,campaign_id uuid,live jsonb,revision bigint DEFAULT 0);
CREATE TABLE forge_visibility.map_rules(
 map_id uuid PRIMARY KEY,collision_enforced boolean, fog_enforced boolean,
 updated_at timestamptz);
CREATE TABLE forge_visibility.navigation_permission_generations(
 map_id uuid PRIMARY KEY,generation bigint);
CREATE TABLE public.map_tokens(
 id uuid PRIMARY KEY,map_id uuid,campaign_id uuid,owner_id uuid,
 visible boolean DEFAULT true,x integer,y integer,
 span_x numeric DEFAULT 1,span_y numeric DEFAULT 1,
 character_id uuid,npc_values jsonb DEFAULT '{}'::jsonb,
 updated_at timestamptz DEFAULT now());
CREATE TABLE public.characters(
 id uuid PRIMARY KEY,campaign_id uuid,user_id uuid,
 field_values jsonb DEFAULT '{}'::jsonb,
 updated_at timestamptz DEFAULT now());
CREATE TABLE public.campaign_tool_issues(
 id uuid PRIMARY KEY,campaign_id uuid,map_id uuid,
 x integer,y integer,kind text,config jsonb DEFAULT '{}'::jsonb,
 state jsonb DEFAULT '{}'::jsonb,
 held_by_token_id uuid,owner_id uuid,party_shared boolean DEFAULT false,
 revision bigint DEFAULT 0);
CREATE TABLE forge_visibility.navigation_gestures(
 id uuid PRIMARY KEY,actor_id uuid NOT NULL,map_id uuid NOT NULL,
 campaign_id uuid NOT NULL,token_origins jsonb NOT NULL,
 tool_origins jsonb NOT NULL,environment_revision bigint NOT NULL,
 permission_generation bigint NOT NULL,rules_updated_at timestamptz,
 last_dx integer NOT NULL DEFAULT 0,last_dy integer NOT NULL DEFAULT 0,
 last_seq bigint NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL);
ALTER TABLE forge_visibility.navigation_gestures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE forge_visibility.navigation_gestures
 FROM PUBLIC,anon,authenticated;
CREATE TABLE forge_visibility.movement_sessions(
 id uuid PRIMARY KEY,actor_id uuid,piece_id uuid,kind text,map_id uuid,
 campaign_id uuid,base_x integer,base_y integer,last_x integer,last_y integer,
 last_seq bigint DEFAULT 0,map_width integer,map_height integer,grid_size integer,
 span_x double precision,span_y double precision,scene jsonb,attributes jsonb,
 environment_revision bigint,rules_updated_at timestamptz,
 collision_enforced boolean,ignore_collision boolean,token_visible boolean,
 base_updated_at timestamptz,base_tool_revision bigint,character_id uuid,
 character_updated_at timestamptz,last_sent timestamptz,expires_at timestamptz);
CREATE TABLE forge_visibility.movement_preview_rates(
 actor_id uuid,piece_id uuid,last_sent timestamptz,last_seq bigint,
 map_id uuid,kind text,base_x integer,base_y integer,
 last_x integer,last_y integer,
 PRIMARY KEY(actor_id,piece_id));
CREATE TABLE realtime.notifications(packet jsonb,event text,topic text,is_private boolean);
CREATE TABLE forge_visibility.test_fog_ticks(map_id uuid,created_at timestamptz DEFAULT now());

CREATE OR REPLACE FUNCTION public.can_view_campaign_map(p_campaign uuid,p_map uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$SELECT EXISTS(
 SELECT 1 FROM public.campaign_members cm
 JOIN public.battle_maps b ON b.campaign_id=cm.campaign_id AND b.id=p_map
 LEFT JOIN public.campaign_player_maps pm ON pm.user_id=cm.user_id
  AND pm.campaign_id=cm.campaign_id
 JOIN public.campaigns c ON c.id=cm.campaign_id
 WHERE cm.campaign_id=p_campaign AND cm.user_id=auth.uid()
 AND (cm.role='dm' OR coalesce(pm.map_id,c.active_map_id)=p_map))$$;
CREATE OR REPLACE FUNCTION public.is_campaign_dm(p_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$SELECT EXISTS(SELECT 1 FROM public.campaign_members cm
 WHERE cm.user_id=auth.uid() AND cm.campaign_id=p_campaign AND cm.role='dm')$$;
CREATE OR REPLACE FUNCTION forge_visibility.validate_piece_trajectory(
 p_scene jsonb,p_attrs jsonb,p_start_x double precision,
 p_start_y double precision,p_width double precision,p_height double precision,
 p_cells_w double precision,p_cells_h double precision,p_steps jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO ''
AS $$
DECLARE leg jsonb;barrier jsonb;
 x double precision:=p_start_x;y double precision:=p_start_y;
 tx double precision;ty double precision;
BEGIN
 FOR leg IN SELECT value FROM jsonb_array_elements(p_steps) LOOP
  tx:=x+(leg->>'dx')::double precision;
  ty:=y+(leg->>'dy')::double precision;
  IF tx<0 OR ty<0 OR tx+p_width>p_cells_w OR ty+p_height>p_cells_h
  THEN RAISE EXCEPTION 'bounds';END IF;
  FOR barrier IN SELECT value FROM jsonb_array_elements(p_scene->'objects') LOOP
   IF barrier->>'type'='wall' AND (
     (x<(barrier->>'at')::double precision AND tx>=(barrier->>'at')::double precision)
     OR (x>=(barrier->>'at')::double precision AND tx<(barrier->>'at')::double precision)
   ) THEN RAISE EXCEPTION 'wall';END IF;
  END LOOP;
  x:=tx;y:=ty;
 END LOOP;
 RETURN jsonb_build_object('x',x,'y',y);
END $$;
CREATE OR REPLACE FUNCTION forge_visibility.ray_blocked(
 p_scene jsonb,p_from_x double precision,p_from_y double precision,
 p_to_x double precision,p_to_y double precision,p_kind text,
 p_attributes jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
CREATE OR REPLACE FUNCTION forge_visibility.is_lit(
 p_map uuid,p_scene jsonb,p_viewer_x double precision,p_viewer_y double precision,
 p_target_x double precision,p_target_y double precision,p_grid integer)
RETURNS boolean LANGUAGE sql STABLE AS $$SELECT true$$;
CREATE OR REPLACE FUNCTION forge_visibility.bump_viewer_ticks(
 p_map uuid,p_viewers uuid[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$BEGIN INSERT INTO forge_visibility.test_fog_ticks(map_id)
 VALUES(p_map);END$$;
CREATE OR REPLACE FUNCTION realtime.send(p_packet jsonb,p_event text,
 p_topic text,p_private boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$BEGIN INSERT INTO realtime.notifications VALUES(
 p_packet,p_event,p_topic,p_private);END$$;

INSERT INTO public.campaigns(id,active_map_id)
 VALUES('11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333');
INSERT INTO public.battle_maps(id,campaign_id,width,height,grid_size)
 VALUES('33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',100,100,10);
INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','player'),
 ('11111111-1111-4111-8111-111111111111',
  '88888888-8888-4888-8888-888888888888','player'),
 ('11111111-1111-4111-8111-111111111111',
  '99999999-9999-4999-8999-999999999999','dm');
INSERT INTO public.map_environments(map_id,campaign_id,live,revision)
 VALUES('33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        '{"objects":[],"fog":{"partyShared":true}}'::jsonb,0);
INSERT INTO forge_visibility.map_rules(map_id,collision_enforced,fog_enforced,updated_at)
 VALUES('33333333-3333-4333-8333-333333333333',true,true,now());
INSERT INTO forge_visibility.navigation_permission_generations(map_id,generation)
 VALUES('33333333-3333-4333-8333-333333333333',0);
INSERT INTO public.map_tokens(id,map_id,campaign_id,owner_id,x,y,visible)
 VALUES('55555555-5555-4555-8555-555555555555',
 '33333333-3333-4333-8333-333333333333',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',1,1,true),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '33333333-3333-4333-8333-333333333333',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',2,2,true);
INSERT INTO forge_visibility.navigation_gestures(
 id,actor_id,map_id,campaign_id,token_origins,tool_origins,
 environment_revision,permission_generation,rules_updated_at,expires_at)
 SELECT '77777777-7777-4777-8777-777777777777',
 '22222222-2222-4222-8222-222222222222',
 m.map_id,e.campaign_id,
 '[{"id":"55555555-5555-4555-8555-555555555555","x":1,"y":1,
 "spanX":1,"spanY":1,"characterId":null}]'::jsonb,
 '[]'::jsonb,0,0,m.updated_at,now()+interval '1 hour'
 FROM forge_visibility.map_rules m
 JOIN public.map_environments e ON e.map_id=m.map_id
 WHERE m.map_id='33333333-3333-4333-8333-333333333333';

INSERT INTO forge_visibility.movement_sessions(
 id,actor_id,piece_id,kind,map_id,campaign_id,base_x,base_y,last_x,last_y,
 last_seq,map_width,map_height,grid_size,span_x,span_y,scene,attributes,
 environment_revision,rules_updated_at,collision_enforced,ignore_collision,
 token_visible,base_updated_at,character_id,expires_at)
 SELECT 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '99999999-9999-4999-8999-999999999999',t.id,'token',t.map_id,t.campaign_id,
 t.x,t.y,t.x,t.y,0,10,10,10,1,1,e.live,'{}'::jsonb,e.revision,
 r.updated_at,true,false,true,t.updated_at,t.character_id,now()+interval '1 hour'
 FROM public.map_tokens t JOIN public.map_environments e ON e.map_id=t.map_id
 JOIN forge_visibility.map_rules r ON r.map_id=t.map_id
 WHERE t.id='55555555-5555-4555-8555-555555555555';
