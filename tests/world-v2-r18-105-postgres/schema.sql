-- B10-R18-105. SYNTHETIC minimal schema in throwaway PostgreSQL 17 ONLY.
-- Every UUID is deliberately fabricated; no production campaign/user rows.
-- This is NOT a backup or complete historical Supabase schema.
\set ON_ERROR_STOP on
DO $guard$ BEGIN
 IF current_database() <> 'world_v2_r18_105' OR current_user <> 'postgres' OR
    inet_server_addr() IS NULL THEN
  RAISE EXCEPTION 'R105 refuses non-disposable PostgreSQL address/database';
 END IF;
END $guard$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA forge_visibility;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
-- The two application roles must never have direct access to private fog rules.
REVOKE ALL ON SCHEMA forge_visibility FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $auth_fixture$
 SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$auth_fixture$;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;

CREATE TABLE public.campaigns (
 id uuid PRIMARY KEY,active_map_id uuid
);
CREATE TABLE public.campaign_members (
 campaign_id uuid NOT NULL,user_id uuid NOT NULL,
 role text NOT NULL CHECK (role IN ('dm','player')),
 PRIMARY KEY(campaign_id,user_id)
);
CREATE TABLE public.campaign_player_maps (
 campaign_id uuid NOT NULL,user_id uuid NOT NULL,map_id uuid,
 PRIMARY KEY(campaign_id,user_id)
);
CREATE TABLE public.battle_maps (
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL
);
CREATE TABLE forge_visibility.map_rules (
 map_id uuid PRIMARY KEY,campaign_id uuid NOT NULL,fog_enforced boolean NOT NULL
);
CREATE TABLE public.map_combats (
 map_id uuid PRIMARY KEY,campaign_id uuid NOT NULL,
 revision integer NOT NULL DEFAULT 1
);
CREATE TABLE forge_visibility.movement_sessions (
 actor_id uuid NOT NULL,map_id uuid NOT NULL,
 kind text NOT NULL,piece_id uuid NOT NULL,
 PRIMARY KEY(actor_id,map_id,kind,piece_id)
);
CREATE TABLE forge_visibility.movement_preview_rates (
 actor_id uuid NOT NULL,map_id uuid NOT NULL,
 kind text NOT NULL,piece_id uuid NOT NULL,
 PRIMARY KEY(actor_id,map_id,kind,piece_id)
);
-- Stub for the independently identified nonfog combat policy dependency.
-- The real fog-status and can_view_campaign_map SQL are extracted from Git.
CREATE OR REPLACE FUNCTION public.is_campaign_dm(p_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $synthetic_dm$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.campaign_members cm
  WHERE cm.campaign_id=p_campaign AND cm.user_id=auth.uid()
   AND cm.role='dm'
 );
$synthetic_dm$;
REVOKE ALL ON FUNCTION public.is_campaign_dm(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_campaign_dm(uuid) TO authenticated;

INSERT INTO public.campaigns(id,active_map_id) VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000201'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000204');
INSERT INTO public.battle_maps(id,campaign_id) VALUES
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000204','00000000-0000-4000-8000-000000000102'),
 ('00000000-0000-4000-8000-000000000205','00000000-0000-4000-8000-000000000101');
INSERT INTO forge_visibility.map_rules(map_id,campaign_id,fog_enforced) VALUES
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101',true),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000101',false),
 ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000101',true),
 ('00000000-0000-4000-8000-000000000204','00000000-0000-4000-8000-000000000102',true),
 -- Adversarial inconsistent rules row: candidate MUST also bind campaign ID.
 ('00000000-0000-4000-8000-000000000205','00000000-0000-4000-8000-000000000102',true);
INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','dm'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','player'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000303','player'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000306','player'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000304','dm');
INSERT INTO public.campaign_player_maps(campaign_id,user_id,map_id) VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000201'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000202'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000306','00000000-0000-4000-8000-000000000201');
INSERT INTO public.map_combats(map_id,campaign_id,revision) VALUES
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101',1),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000101',2),
 ('00000000-0000-4000-8000-000000000204','00000000-0000-4000-8000-000000000102',3);
INSERT INTO forge_visibility.movement_sessions(actor_id,map_id,kind,piece_id) VALUES
 ('00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401'),
 ('00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000402');
INSERT INTO forge_visibility.movement_preview_rates(actor_id,map_id,kind,piece_id) VALUES
 ('00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000401'),
 ('00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000201','token','00000000-0000-4000-8000-000000000402');
-- Source-extracted combat policy will be installed only after source functions.
ALTER TABLE public.map_combats ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.map_combats TO authenticated;
REVOKE ALL ON forge_visibility.map_rules FROM PUBLIC,anon,authenticated;
REVOKE ALL ON forge_visibility.movement_sessions FROM PUBLIC,anon,authenticated;
REVOKE ALL ON forge_visibility.movement_preview_rates FROM PUBLIC,anon,authenticated;
