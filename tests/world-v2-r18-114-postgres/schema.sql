-- B10-R18-114: SYNTHETIC PostgreSQL 17 ONLY. Never execute on Supabase.
\set ON_ERROR_STOP on
DO $safe$ BEGIN
 IF current_database()<>'world_v2_r18_114' OR current_user<>'postgres'
    OR inet_server_addr() IS NULL
    OR NOT (
      inet_server_addr() << inet '172.16.0.0/12'
      OR inet_server_addr() << inet '10.0.0.0/8'
      OR inet_server_addr() << inet '192.168.0.0/16'
      OR inet_server_addr()=inet '127.0.0.1')
 THEN RAISE EXCEPTION 'R114 refuses non-disposable database/host'; END IF;
END $safe$;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA forge_visibility;
CREATE SCHEMA realtime;
GRANT USAGE ON SCHEMA public TO anon,authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
REVOKE ALL ON SCHEMA forge_visibility,realtime FROM PUBLIC,anon,authenticated;

-- Synthetic claim injection; NO signed Supabase Auth sessions are exercised.
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SET search_path=''
AS $u$ SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid $u$;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.campaigns(
 id uuid PRIMARY KEY,active_map_id uuid,sheet_template jsonb NOT NULL
);
CREATE TABLE public.campaign_members(
 campaign_id uuid NOT NULL,user_id uuid NOT NULL,
 role text NOT NULL CHECK (role IN ('dm','player')),
 PRIMARY KEY(campaign_id,user_id)
);
CREATE TABLE public.campaign_player_maps(
 campaign_id uuid NOT NULL,user_id uuid NOT NULL,map_id uuid,
 PRIMARY KEY(campaign_id,user_id)
);
CREATE TABLE public.characters(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL,user_id uuid,
 field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
 name text,portrait_path text,token_path text
);
CREATE TABLE public.npc_templates(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL,
 field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
 name text,portrait_path text,token_path text,npc_bars_public boolean
);
CREATE TABLE public.battle_maps(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL,
 width integer NOT NULL,height integer NOT NULL,grid_size integer NOT NULL
);
CREATE TABLE public.map_tokens(
 id uuid PRIMARY KEY,map_id uuid NOT NULL,campaign_id uuid NOT NULL,
 owner_id uuid,visible boolean NOT NULL DEFAULT true,character_id uuid,
 x integer NOT NULL DEFAULT 0,y integer NOT NULL DEFAULT 0,
 span_x integer NOT NULL DEFAULT 1,span_y integer NOT NULL DEFAULT 1,
 npc_values jsonb NOT NULL DEFAULT '{}'::jsonb,
 name text,image_path text,npc_bars_public boolean
);
CREATE TABLE public.campaign_tool_issues(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL,map_id uuid NOT NULL,
 held_by_token_id uuid,owner_id uuid,party_shared boolean NOT NULL DEFAULT false,
 x integer NOT NULL DEFAULT 0,y integer NOT NULL DEFAULT 0,
 kind text NOT NULL DEFAULT 'tool',config jsonb NOT NULL DEFAULT '{}'::jsonb,
 state jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.map_environments(map_id uuid PRIMARY KEY,live jsonb);
CREATE TABLE forge_visibility.map_rules(
 map_id uuid PRIMARY KEY,collision_enforced boolean NOT NULL DEFAULT false
);
CREATE TABLE forge_visibility.movement_preview_rates(
 actor_id uuid NOT NULL,piece_id uuid NOT NULL,
 last_sent timestamptz NOT NULL,last_seq bigint NOT NULL,
 map_id uuid NOT NULL,kind text NOT NULL,
 base_x integer NOT NULL,base_y integer NOT NULL,
 last_x integer NOT NULL,last_y integer NOT NULL,
 PRIMARY KEY(actor_id,piece_id)
);

-- RLS enabled and ALL direct app-table access revoked; SECURITY DEFINER
-- calls must enforce identity/campaign permissions themselves.
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_player_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npc_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_tool_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_environments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA public,forge_visibility FROM PUBLIC,anon,authenticated;

-- Synthetic DM helper (NOT live-source-exact); separate semantic risk remains.
CREATE FUNCTION public.is_campaign_dm(p_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $dm$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.campaign_members m
  WHERE m.campaign_id=p_campaign AND m.user_id=auth.uid()
    AND m.role='dm')
$dm$;
REVOKE ALL ON FUNCTION public.is_campaign_dm(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_campaign_dm(uuid) TO authenticated;

-- Stubbed pure movement observers and broadcasts.
CREATE FUNCTION forge_visibility.wall_passes(jsonb,jsonb,text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT false';
CREATE FUNCTION forge_visibility.swept_hits_segment(
 double precision,double precision,double precision,double precision,
 double precision,double precision,double precision,double precision,
 double precision,double precision)
RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT false';
CREATE FUNCTION forge_visibility.observer_path_status(
 uuid,uuid,double precision,double precision,double precision,double precision,integer)
RETURNS integer LANGUAGE sql STABLE AS 'SELECT 0';
CREATE FUNCTION realtime.send(jsonb,text,text,boolean)
RETURNS void LANGUAGE plpgsql AS $send$ BEGIN
 RAISE EXCEPTION 'R114 forbidden real-time broadcast in synthetic tests';
END $send$;

INSERT INTO public.campaigns(id,active_map_id,sheet_template) VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000201',
  '{"tabs":[{"fields":[{"id":"bag","type":"inventory"},{"id":"hp","type":"number"}]}]}'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000204',
  '{"tabs":[{"fields":[{"id":"bag","type":"inventory"},{"id":"hp","type":"number"}]}]}');
INSERT INTO public.campaign_members VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','dm'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','player'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000303','player'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000304','dm');
INSERT INTO public.campaign_player_maps VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000201'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000201');
INSERT INTO public.characters(id,campaign_id,user_id,field_values,name) VALUES
 ('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302',
  '{"hp":10,"bag":[{"_inventoryId":"00000000-0000-4000-8000-000000000701","name":"A potion"}]}','P1'),
 ('00000000-0000-4000-8000-000000000502','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000303',
  '{"hp":11,"bag":[{"_inventoryId":"00000000-0000-4000-8000-000000000702","name":"P2 scroll"}]}','P2'),
 ('00000000-0000-4000-8000-000000000504','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000304',
  '{"hp":20,"bag":[]}','Other campaign');
INSERT INTO public.npc_templates(id,campaign_id,field_values,name) VALUES
 ('00000000-0000-4000-8000-000000000601','00000000-0000-4000-8000-000000000101','{"bag":[],"hp":5}','A NPC'),
 ('00000000-0000-4000-8000-000000000604','00000000-0000-4000-8000-000000000102','{"bag":[],"hp":5}','B NPC');
INSERT INTO public.battle_maps VALUES
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101',1000,1000,100),
 ('00000000-0000-4000-8000-000000000204','00000000-0000-4000-8000-000000000102',1000,1000,100);
INSERT INTO public.map_tokens(id,map_id,campaign_id,owner_id,visible,character_id,x,y,npc_values,name) VALUES
 ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302',true,null,2,2,'{"hp":8,"bag":[]}','A token'),
 ('00000000-0000-4000-8000-000000000402','00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000303',true,null,3,3,'{"hp":8,"bag":[]}','P2 token'),
 ('00000000-0000-4000-8000-000000000403','00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302',false,null,4,4,'{"hp":8,"bag":[]}','Hidden token'),
 ('00000000-0000-4000-8000-000000000404','00000000-0000-4000-8000-000000000204',
  '00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000304',true,null,2,2,'{"hp":8,"bag":[]}','B token'),
 ('00000000-0000-4000-8000-000000000405','00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',NULL,true,NULL,1,1,'{"hp":7,"bag":[]}','NPC sheet');
INSERT INTO forge_visibility.map_rules VALUES
 ('00000000-0000-4000-8000-000000000201',false),
 ('00000000-0000-4000-8000-000000000204',false);
