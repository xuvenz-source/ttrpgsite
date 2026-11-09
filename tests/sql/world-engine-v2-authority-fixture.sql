-- Disposable PostgreSQL 17 fixture only. Contains no campaign/user data.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA forge_visibility;
GRANT USAGE ON SCHEMA public TO anon,authenticated;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SET search_path=''
AS $$ SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;

CREATE TABLE public.campaign_members(
 campaign_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL,
 PRIMARY KEY(campaign_id,user_id));
CREATE TABLE public.battle_maps(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL,width integer NOT NULL,
 height integer NOT NULL,grid_size integer NOT NULL);
CREATE TABLE public.map_environments(
 map_id uuid PRIMARY KEY,campaign_id uuid NOT NULL,live jsonb NOT NULL,
 revision bigint NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE forge_visibility.map_rules(
 map_id uuid PRIMARY KEY,collision_enforced boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE forge_visibility.navigation_permission_generations(
 map_id uuid PRIMARY KEY,generation bigint NOT NULL DEFAULT 0);
CREATE TABLE public.characters(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL,user_id uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),field_values jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE public.map_tokens(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL,map_id uuid NOT NULL,
 owner_id uuid,visible boolean NOT NULL DEFAULT true,
 character_id uuid,x integer NOT NULL,y integer NOT NULL,
 span_x numeric NOT NULL DEFAULT 1,span_y numeric NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),npc_values jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE public.campaign_tool_issues(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL,map_id uuid,
 owner_id uuid,party_shared boolean NOT NULL DEFAULT false,
 held_by_token_id uuid,kind text NOT NULL DEFAULT 'torch',
 config jsonb NOT NULL DEFAULT '{}'::jsonb,state jsonb NOT NULL DEFAULT '{}'::jsonb,
 x integer NOT NULL DEFAULT 0,y integer NOT NULL DEFAULT 0,
 revision bigint NOT NULL DEFAULT 0);
ALTER TABLE public.map_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_tool_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_visibility.map_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_visibility.navigation_permission_generations ENABLE ROW LEVEL SECURITY;
-- No direct authenticated role access to fixture canonicals.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.is_campaign_dm(c uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.campaign_members m
 WHERE m.campaign_id=c AND m.user_id=auth.uid() AND m.role='dm') $$;
CREATE OR REPLACE FUNCTION public.can_view_campaign_map(p_campaign uuid,p_map uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.campaign_members m
 JOIN public.battle_maps b ON b.campaign_id=m.campaign_id
 WHERE m.campaign_id=p_campaign AND m.user_id=auth.uid() AND b.id=p_map) $$;

-- Synthetic direct-write guard mirrors the requirement that final writes
-- are valid only from an authorized, transaction-local route.
CREATE OR REPLACE FUNCTION public.fixture_motion_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $$
BEGIN
 IF new.x IS DISTINCT FROM old.x OR new.y IS DISTINCT FROM old.y THEN
  IF current_setting('forge.trajectory_steps',true) IS NULL OR
    current_setting('forge.trajectory_steps',true)='' OR
    current_setting('forge.trajectory_map',true) IS DISTINCT FROM new.map_id::text OR
    current_setting('forge.trajectory_actor',true) IS DISTINCT FROM auth.uid()::text
  THEN RAISE EXCEPTION 'fixture rejects direct movement writes';END IF;
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER fixture_token_motion BEFORE UPDATE ON public.map_tokens
FOR EACH ROW EXECUTE FUNCTION public.fixture_motion_guard();
CREATE TRIGGER fixture_tool_motion BEFORE UPDATE ON public.campaign_tool_issues
FOR EACH ROW EXECUTE FUNCTION public.fixture_motion_guard();

-- Fixed fake identities, never real account information.
INSERT INTO public.battle_maps VALUES
 ('10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',1000,1000,100);
INSERT INTO public.campaign_members VALUES
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','player'),
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','player'),
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','dm');
INSERT INTO public.map_environments(map_id,campaign_id,live,revision) VALUES(
 '10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001',
 '{"objects":[{"type":"wall","blocksMovement":true,"id":"hidden-internal-id","points":[{"x":3,"y":0},{"x":3,"y":10}]}]}'::jsonb,7);
INSERT INTO forge_visibility.map_rules(map_id,collision_enforced)
VALUES('10000000-0000-4000-8000-000000000001',true);
INSERT INTO forge_visibility.navigation_permission_generations VALUES
 ('10000000-0000-4000-8000-000000000001',3);
INSERT INTO public.map_tokens(
 id,campaign_id,map_id,owner_id,x,y,visible,span_x,span_y)
VALUES
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',0,1,true,1,1),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',0,5,true,1,1);
INSERT INTO public.campaign_tool_issues(id,campaign_id,map_id,owner_id,party_shared,kind,x,y)
 VALUES('50000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001',true,'torch',0,6);
