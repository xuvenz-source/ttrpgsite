-- B10-R18-124 isolated PostgreSQL 17 synthetic fixture.
-- Model the observed ORIGINAL sheet helper, not a private hosted RPC.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
REVOKE ALL ON SCHEMA auth FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated,anon;
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $id$
 SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid
$id$;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.campaigns(id uuid PRIMARY KEY);
CREATE TABLE public.campaign_members(
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 user_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('dm','player')),
 PRIMARY KEY(campaign_id,user_id)
);
CREATE TABLE public.characters(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 user_id uuid NOT NULL
);
CREATE TABLE public.npc_templates(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL REFERENCES public.campaigns(id)
);
CREATE TABLE public.map_tokens(
 id uuid PRIMARY KEY,campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 character_id uuid,owner_id uuid
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.npc_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaigns,public.campaign_members,public.characters,
 public.npc_templates,public.map_tokens FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.is_campaign_dm(c uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $dm$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.campaign_members m
  WHERE m.campaign_id=c AND m.user_id=auth.uid() AND m.role='dm'
 )
$dm$;
REVOKE ALL ON FUNCTION public.is_campaign_dm(uuid) FROM PUBLIC,anon,authenticated;

-- Faithful helper body from read-only original pg_get_functiondef.
CREATE FUNCTION public.can_edit_campaign_sheet(
 p_campaign uuid,p_source text,p_source_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $old$
DECLARE actor uuid;
BEGIN
 actor:=auth.uid();
 IF actor IS NULL OR p_campaign IS NULL OR p_source_id IS NULL THEN RETURN false;END IF;
 IF p_source='character' THEN
  RETURN EXISTS(SELECT 1 FROM public.characters c
   WHERE c.id=p_source_id AND c.campaign_id=p_campaign
    AND (c.user_id=actor OR public.is_campaign_dm(p_campaign)));
 ELSIF p_source='npc_template' THEN
  RETURN public.is_campaign_dm(p_campaign) AND EXISTS(
   SELECT 1 FROM public.npc_templates n WHERE n.id=p_source_id
    AND n.campaign_id=p_campaign);
 ELSIF p_source='npc_token' THEN
  RETURN public.is_campaign_dm(p_campaign) AND EXISTS(
   SELECT 1 FROM public.map_tokens t WHERE t.id=p_source_id
    AND t.campaign_id=p_campaign AND t.character_id IS NULL
    AND t.owner_id IS NULL);
 END IF;
 RETURN false;
END $old$;
REVOKE ALL ON FUNCTION public.can_edit_campaign_sheet(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;

-- Simulated exposed SECURITY DEFINER caller, NOT the private original RPC.
CREATE FUNCTION public.synthetic_sheet_edit_guard(
 p_campaign uuid,p_source text,p_source_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $caller$
 SELECT public.can_edit_campaign_sheet(p_campaign,p_source,p_source_id)
$caller$;
REVOKE ALL ON FUNCTION public.synthetic_sheet_edit_guard(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.synthetic_sheet_edit_guard(uuid,text,uuid)
 TO authenticated;

INSERT INTO public.campaigns(id) VALUES
 ('00000000-0000-4000-8000-000000000101'),
 ('00000000-0000-4000-8000-000000000102');
INSERT INTO public.campaign_members(campaign_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','dm'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000302','player'),
 ('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000304','dm');
INSERT INTO public.characters(id,campaign_id,user_id) VALUES
 ('00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000302');
INSERT INTO public.npc_templates(id,campaign_id) VALUES
 ('00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000101');
INSERT INTO public.map_tokens(id,campaign_id,character_id,owner_id) VALUES
 ('00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000101',NULL,NULL);
COMMIT;
