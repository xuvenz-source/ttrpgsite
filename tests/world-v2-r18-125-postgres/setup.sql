-- R18-125 isolated Postgres 17 fixture. NEVER apply to hosted Supabase.
-- Provides the minimum observed membership/map relationship and auth.uid().
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA forge_world_v2;
REVOKE ALL ON SCHEMA auth,forge_world_v2 FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated,anon;
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $id$
 SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid
$id$;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.campaigns(
 id uuid PRIMARY KEY,
 active_map_id uuid
);
CREATE TABLE public.campaign_members(
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN('dm','player')),
 PRIMARY KEY(campaign_id,user_id)
);
CREATE TABLE public.battle_maps(
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
 UNIQUE(campaign_id,id)
);
CREATE TABLE public.campaign_player_maps(
 campaign_id uuid NOT NULL,
 user_id uuid NOT NULL,
 map_id uuid,
 PRIMARY KEY(campaign_id,user_id),
 FOREIGN KEY(campaign_id,user_id)
  REFERENCES public.campaign_members(campaign_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(campaign_id,map_id)
  REFERENCES public.battle_maps(campaign_id,id)
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_player_maps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaigns,public.campaign_members,
 public.battle_maps,public.campaign_player_maps FROM PUBLIC,anon,authenticated;

-- Mirrors the membership/map route principle of observed original helper.
CREATE FUNCTION public.can_view_campaign_map(p_campaign uuid,p_map uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $visibility$
 SELECT p_map IS NOT NULL AND auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.campaign_members m
  JOIN public.campaigns c ON c.id=m.campaign_id
  LEFT JOIN public.campaign_player_maps assigned
   ON assigned.campaign_id=m.campaign_id AND assigned.user_id=m.user_id
  WHERE m.campaign_id=p_campaign AND m.user_id=auth.uid()
   AND (m.role='dm' OR p_map=coalesce(assigned.map_id,c.active_map_id))
 );
$visibility$;
REVOKE ALL ON FUNCTION public.can_view_campaign_map(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

-- Implements the observed existing trusted viewer_on_map behavior.
CREATE FUNCTION forge_world_v2.viewer_on_map(
 p_campaign uuid,p_map uuid,p_viewer uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $viewer$
 SELECT CASE
  WHEN m.role='dm' THEN 'dm'
  WHEN m.role='player'
   AND p_map=coalesce(assigned.map_id,c.active_map_id) THEN 'player'
  ELSE NULL END
 FROM public.campaign_members m
 JOIN public.campaigns c ON c.id=m.campaign_id
 LEFT JOIN public.campaign_player_maps assigned
  ON assigned.campaign_id=m.campaign_id AND assigned.user_id=m.user_id
 WHERE m.campaign_id=p_campaign AND m.user_id=p_viewer;
$viewer$;
REVOKE ALL ON FUNCTION forge_world_v2.viewer_on_map(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;

INSERT INTO public.campaigns(id,active_map_id) VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000201'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000203');
INSERT INTO public.battle_maps(id,campaign_id) VALUES
 ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000102');
INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','dm'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','player'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000303','player'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000304','dm');
COMMIT;
