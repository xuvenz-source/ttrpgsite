-- R18-113: disposable PostgreSQL 17, synthetic fixtures ONLY.
\set ON_ERROR_STOP on
DO $gate$ BEGIN
 IF current_database() <> 'world_v2_r18_113' OR current_user <> 'postgres'
 OR inet_server_addr() IS NULL OR inet_server_addr()::text <> '127.0.0.1'
 THEN RAISE EXCEPTION 'R113 rejects database/host outside disposable CI fixture'; END IF;
END $gate$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Synthetic JWT GUC only. These are NOT real Supabase signed sessions.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $auth_synthetic$
 SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid
$auth_synthetic$;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.campaign_members(
 campaign_id uuid NOT NULL,
 user_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('dm','player')),
 PRIMARY KEY(campaign_id,user_id)
);
CREATE TABLE public.battle_maps(
 id uuid PRIMARY KEY, campaign_id uuid NOT NULL
);
CREATE TABLE public.map_tokens(
 id uuid PRIMARY KEY, map_id uuid NOT NULL, campaign_id uuid NOT NULL,
 character_id uuid, npc_values jsonb
);
ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_members,public.battle_maps,public.map_tokens
 FROM PUBLIC,anon,authenticated;

-- Synthetic scoped DM predicate, same contract as original R105 fixture.
-- This helper is NOT source-identical to live public.is_campaign_dm.
CREATE FUNCTION public.is_campaign_dm(p_campaign uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
 AS $synthetic_dm$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.campaign_members cm
  WHERE cm.campaign_id=p_campaign
    AND cm.user_id=auth.uid()
    AND cm.role='dm'
 )
 $synthetic_dm$;
REVOKE ALL ON FUNCTION public.is_campaign_dm(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_campaign_dm(uuid) TO authenticated;

INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','dm'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','player'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000304','dm');
INSERT INTO public.battle_maps(id,campaign_id) VALUES
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000204','00000000-0000-4000-8000-000000000102');
INSERT INTO public.map_tokens(id,map_id,campaign_id,character_id,npc_values) VALUES
 ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101',null,'{"private":"A-one"}'),
 ('00000000-0000-4000-8000-000000000406','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101',null,'{"private":"A-two"}'),
 ('00000000-0000-4000-8000-000000000402','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000501','{"private":"PC-not-NPC"}'),
 -- Deliberate cross-campaign inconsistency: must NOT be exposed by a map-only filter.
 ('00000000-0000-4000-8000-000000000403','00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000102',null,'{"private":"cross-campaign"}'),
 ('00000000-0000-4000-8000-000000000405','00000000-0000-4000-8000-000000000204','00000000-0000-4000-8000-000000000102',null,'{"private":"B-one"}');

-- Script separately installs ONLY the previously source-verified NPC function.
