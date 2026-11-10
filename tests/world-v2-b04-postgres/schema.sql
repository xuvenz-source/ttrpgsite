-- B04 isolated PostgreSQL 17 schema fixture. NEVER run this on a live DB.
-- Test-only stubs: auth.uid(), campaign membership/map-access functions.
-- Real V2 motion_sessions DDL is reproduced; B04 build_fixture.py imports
-- PRODUCTION forge_world_v2.session_valid, valid_point, wall_passes,
-- swept_hits_segment and step_allowed unchanged from migration source.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA forge_visibility;
CREATE SCHEMA forge_world_v2;
REVOKE ALL ON SCHEMA forge_world_v2 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;

CREATE TABLE public.battle_maps (
 id uuid PRIMARY KEY, campaign_id uuid NOT NULL,
 width numeric NOT NULL, height numeric NOT NULL, grid_size numeric NOT NULL
);
CREATE TABLE public.campaign_members(
 campaign_id uuid NOT NULL,user_id uuid NOT NULL,
 role text NOT NULL,PRIMARY KEY(campaign_id,user_id)
);
CREATE TABLE public.map_environments(
 map_id uuid PRIMARY KEY,campaign_id uuid NOT NULL,revision bigint NOT NULL,
 live jsonb
);
CREATE TABLE forge_visibility.navigation_permission_generations(
 map_id uuid PRIMARY KEY,generation bigint NOT NULL DEFAULT 0
);
CREATE TABLE forge_visibility.map_rules(
 map_id uuid PRIMARY KEY,updated_at timestamptz NOT NULL,
 collision_enforced boolean NOT NULL DEFAULT true
);
CREATE TABLE public.map_tokens(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL,map_id uuid NOT NULL,
 owner_id uuid,visible boolean NOT NULL DEFAULT true,character_id uuid,
 x integer NOT NULL,y integer NOT NULL,
 span_x numeric NOT NULL DEFAULT 1,span_y numeric NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 npc_values jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.characters(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL,user_id uuid,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 field_values jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.campaign_tool_issues(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL,map_id uuid NOT NULL,
 owner_id uuid,party_shared boolean NOT NULL DEFAULT false,
 held_by_token_id uuid,kind text NOT NULL DEFAULT 'prop',
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 x integer NOT NULL,y integer NOT NULL,revision bigint NOT NULL DEFAULT 1,
 state jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE forge_world_v2.motion_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL, campaign_id uuid NOT NULL, map_id uuid NOT NULL,
 selection jsonb NOT NULL,origin_x integer NOT NULL,origin_y integer NOT NULL,
 last_x integer NOT NULL,last_y integer NOT NULL,last_seq bigint NOT NULL DEFAULT 0,
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
REVOKE ALL ON forge_world_v2.motion_sessions FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.is_campaign_dm(p_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.campaign_members cm
  WHERE cm.campaign_id=p_campaign AND cm.user_id=auth.uid()
  AND cm.role='dm')
$$;
CREATE OR REPLACE FUNCTION public.can_view_campaign_map(
 p_campaign uuid,p_map uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.battle_maps bm
  JOIN public.campaign_members cm ON cm.campaign_id=bm.campaign_id
  WHERE bm.id=p_map AND bm.campaign_id=p_campaign AND cm.user_id=auth.uid()
  AND cm.role IN ('dm','player'))
$$;
CREATE OR REPLACE FUNCTION public.b04_assert(ok boolean,label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF ok IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'B04 ASSERTION FAILED: %', label;
 END IF;
 RAISE NOTICE 'PASS: %', label;
END $$;

-- Test-only authority for building invalid or valid signed server sessions.
-- NOT part of product migrations and cannot be deployed by this workflow.
CREATE OR REPLACE FUNCTION public.b04_issue_token_session(
 p_session uuid,p_actor uuid,p_token uuid,p_override boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.map_tokens%ROWTYPE;r forge_visibility.map_rules%ROWTYPE;
 e public.map_environments%ROWTYPE;g forge_visibility.navigation_permission_generations%ROWTYPE;
 c public.characters%ROWTYPE; part jsonb;
BEGIN
 SELECT * INTO t FROM public.map_tokens tok WHERE tok.id=p_token;
 SELECT * INTO r FROM forge_visibility.map_rules rr WHERE rr.map_id=t.map_id;
 SELECT * INTO e FROM public.map_environments ee WHERE ee.map_id=t.map_id;
 SELECT * INTO g FROM forge_visibility.navigation_permission_generations gg WHERE gg.map_id=t.map_id;
 part:=jsonb_build_object('kind','token','id',t.id,'x',t.x,'y',t.y,
  'spanX',t.span_x,'spanY',t.span_y,
  'updatedAt',t.updated_at::text,'characterId',t.character_id);
 IF t.character_id IS NOT NULL THEN
  SELECT * INTO c FROM public.characters cc WHERE cc.id=t.character_id;
  part:=part||jsonb_build_object('characterUpdatedAt',c.updated_at::text);
 END IF;
 INSERT INTO forge_world_v2.motion_sessions(
  id,actor_id,campaign_id,map_id,selection,origin_x,origin_y,last_x,last_y,
  environment_revision,permission_generation,rules_updated_at,
  collision_on,dm_override,mode,expires_at
 ) VALUES (
  p_session,p_actor,t.campaign_id,t.map_id,jsonb_build_array(part),
  t.x,t.y,t.x,t.y,e.revision,g.generation,r.updated_at,
  r.collision_enforced,p_override,'drag',clock_timestamp()+interval '10 seconds');
END $$;

CREATE OR REPLACE FUNCTION public.b04_issue_tool_session(
 p_session uuid,p_actor uuid,p_tool uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.campaign_tool_issues%ROWTYPE;r forge_visibility.map_rules%ROWTYPE;
 e public.map_environments%ROWTYPE;g forge_visibility.navigation_permission_generations%ROWTYPE;
 span numeric;
BEGIN
 SELECT * INTO t FROM public.campaign_tool_issues tool WHERE tool.id=p_tool;
 SELECT * INTO r FROM forge_visibility.map_rules rr WHERE rr.map_id=t.map_id;
 SELECT * INTO e FROM public.map_environments ee WHERE ee.map_id=t.map_id;
 SELECT * INTO g FROM forge_visibility.navigation_permission_generations gg WHERE gg.map_id=t.map_id;
 span:=CASE WHEN t.kind='mount' THEN coalesce((t.config->>'span')::numeric,2) ELSE 1 END;
 INSERT INTO forge_world_v2.motion_sessions(
  id,actor_id,campaign_id,map_id,selection,origin_x,origin_y,last_x,last_y,
  environment_revision,permission_generation,rules_updated_at,
  collision_on,dm_override,mode,expires_at
 ) VALUES (
  p_session,p_actor,t.campaign_id,t.map_id,
  jsonb_build_array(jsonb_build_object(
   'kind','tool','id',t.id,'x',t.x,'y',t.y,
   'spanX',span,'spanY',span,'toolRevision',t.revision)),
  t.x,t.y,t.x,t.y,e.revision,g.generation,r.updated_at,
  r.collision_enforced,false,'drag',clock_timestamp()+interval '10 seconds');
END $$;

-- Stable fixture IDs are deliberately test-only.
INSERT INTO public.battle_maps VALUES
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001',160,160,10);
INSERT INTO public.campaign_members VALUES
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','player'),
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012','player'),
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000013','dm');
INSERT INTO public.map_environments VALUES
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001',1,'{"objects":[]}'::jsonb);
INSERT INTO forge_visibility.navigation_permission_generations VALUES
 ('00000000-0000-4000-8000-000000000021',1);
INSERT INTO forge_visibility.map_rules VALUES
 ('00000000-0000-4000-8000-000000000021','2026-11-09T00:00:00Z',true);
INSERT INTO public.map_tokens (
 id,campaign_id,map_id,owner_id,visible,x,y,span_x,span_y,npc_values
) VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011',true,1,1,1,1,'{}'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000012',true,1,9,1,1,'{}'),
 ('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000013',false,5,5,2,2,'{}');
INSERT INTO public.campaign_tool_issues (
 id,campaign_id,map_id,owner_id,party_shared,held_by_token_id,kind,config,x,y,revision,state
) VALUES
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011',false,NULL,'mount','{"span":2}'::jsonb,1,7,1,'{"attrs":{}}'::jsonb);
